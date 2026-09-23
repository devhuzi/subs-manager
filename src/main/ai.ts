import type { WebContents } from 'electron';
import { getKey } from './aiCredentials';
import { parseOpenRouterStream } from '../shared/ai-stream';
import type { AiChatRequest, AiChatResult, AiStreamChunk } from '../shared/types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';
/** Max wait for the response headers. */
const FIRST_BYTE_TIMEOUT_MS = 30_000;
/** Max gap between streamed chunks — resets on every chunk, so long answers
 * that keep streaming are never cut off. */
const IDLE_TIMEOUT_MS = 30_000;
const MODELS_TIMEOUT_MS = 10_000;
const REFERER = 'https://tools-subs-manager.local';
const APP_TITLE = 'Tools & Subs Manager';

/** USD per 1M tokens, keyed by OpenRouter model slug. */
export type ModelPricing = Record<string, { promptPer1M: number; completionPer1M: number }>;

interface OpenRouterModelEntry {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}
interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[];
}

export const fetchModelPricing = async (): Promise<ModelPricing> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODELS_TIMEOUT_MS);
  try {
    const res = await fetch(MODELS_ENDPOINT, { signal: ctrl.signal });
    if (!res.ok) return {};
    const json = (await res.json()) as OpenRouterModelsResponse;
    const out: ModelPricing = {};
    for (const m of json.data ?? []) {
      const p = Number(m.pricing?.prompt);
      const c = Number(m.pricing?.completion);
      if (Number.isFinite(p) && Number.isFinite(c) && (p > 0 || c > 0)) {
        out[m.id] = { promptPer1M: p * 1_000_000, completionPer1M: c * 1_000_000 };
      }
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
};

/**
 * POSTs the chat completion with `stream: true` and parses the SSE response
 * (via the shared `parseOpenRouterStream`). Emits one `ai:chunk` event per
 * content delta to the calling renderer, then returns the final accumulated
 * `AiChatResult` so the tool-call loop in useAiChat keeps working unchanged.
 *
 * Never throws — all errors are wrapped into `{ ok: false, error }`.
 */
export const aiChat = async (
  request: AiChatRequest,
  sender?: WebContents,
): Promise<AiChatResult> => {
  let key: string | null;
  try {
    key = await getKey();
  } catch {
    return {
      ok: false,
      error: 'The saved API key can’t be decrypted on this device. Re-enter it in Settings.',
    };
  }
  if (!key) return { ok: false, error: 'No API key set. Add one in Settings.' };

  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), FIRST_BYTE_TIMEOUT_MS);
  const resetIdleTimer = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT_MS);
  };

  const emit = (chunk: AiStreamChunk): void => {
    if (sender && !sender.isDestroyed()) sender.send('ai:chunk', chunk);
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'HTTP-Referer': REFERER,
        'X-Title': APP_TITLE,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        tool_choice:
          request.tools && request.tools.length > 0 ? 'auto' : undefined,
        stream: true,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      // Error responses aren't streamed — read as JSON for the message.
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    if (!res.body) return { ok: false, error: 'No response body' };

    resetIdleTimer();
    const watched = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          resetIdleTimer();
          controller.enqueue(chunk);
        },
      }),
    );
    return await parseOpenRouterStream(watched, emit);
  } catch (err) {
    const msg =
      (err as Error).name === 'AbortError'
        ? 'Request timed out'
        : (err as Error).message;
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
};
