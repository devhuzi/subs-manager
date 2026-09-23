import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiChatMessage,
  AiImageContent,
  AiTextContent,
  AiToolCall,
  AppData,
  FxRates,
  Preferences,
} from '../../../shared/types';

export interface AttachedFile {
  name: string;
  mime: string;
  kind: 'image' | 'text';
  /** Data URL for images. */
  dataUrl?: string;
  /** Raw text content for text/CSV/JSON attachments. */
  textContent?: string;
}
import { buildSystemPrompt } from './systemPrompt';
import {
  allTools,
  dispatchTool,
  serializeToolResult,
  type ConfirmProposal,
  type ConfirmResolution,
  type ToolActions,
  type ToolContext,
} from './tools';

/** A locally-rendered error message that never gets sent to the LLM. */
interface ErrorMessage {
  role: 'error';
  content: string;
  id: string;
}

/** A confirm card rendered inline in the chat. */
export interface ConfirmMessage {
  role: 'confirm';
  callId: string;
  proposal: ConfirmProposal;
  decision: 'pending' | ConfirmResolution;
  id: string;
}

export type RenderedMessage = AiChatMessage | ErrorMessage | ConfirmMessage;

const MAX_TOOL_ROUND_TRIPS = 6;

const errorMsg = (content: string): ErrorMessage => ({
  role: 'error',
  content,
  id: crypto.randomUUID(),
});

export interface UseAiChat {
  messages: RenderedMessage[];
  sending: boolean;
  /** Partial assistant text being streamed in right now. Empty when no
   * round-trip is in flight (or the LLM is going straight to tool calls
   * with no preamble text). Renders as a "live typing" bubble. */
  streamingContent: string;
  send: (text: string, files?: AttachedFile[]) => Promise<void>;
  clear: () => void;
  resolveConfirm: (callId: string, resolution: ConfirmResolution) => void;
  canSend: boolean;
  usage: { promptTokens: number; completionTokens: number };
  estimatedCostUsd: number | null;
}

type ModelPricing = Record<string, { promptPer1M: number; completionPer1M: number }>;

const estimateCost = (
  pricing: ModelPricing,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null => {
  const rate = pricing[model];
  if (!rate) return null;
  return (rate.promptPer1M * promptTokens + rate.completionPer1M * completionTokens) / 1_000_000;
};

/**
 * Builds the user message content. If there are no attachments, returns a
 * plain string. Otherwise returns the OpenAI content-parts array with image
 * URLs preserved and text attachments inlined as fenced code blocks.
 */
const buildUserContent = (
  text: string,
  files: AttachedFile[],
): string | Array<AiTextContent | AiImageContent> => {
  if (files.length === 0) return text;
  const textBits: string[] = [];
  if (text.trim()) textBits.push(text);
  const images: AiImageContent[] = [];
  for (const f of files) {
    if (f.kind === 'image' && f.dataUrl) {
      images.push({ type: 'image_url', image_url: { url: f.dataUrl } });
    } else if (f.kind === 'text' && f.textContent != null) {
      const lang = f.name.endsWith('.csv')
        ? 'csv'
        : f.name.endsWith('.json')
          ? 'json'
          : 'text';
      textBits.push(`Attached file \`${f.name}\`:\n\n\`\`\`${lang}\n${f.textContent}\n\`\`\``);
    }
  }
  const finalText = textBits.join('\n\n').trim() || '(see attached)';
  return [{ type: 'text', text: finalText }, ...images];
};

export const useAiChat = (
  data: AppData | null,
  rates: FxRates | null,
  prefs: Preferences | undefined,
  actions: ToolActions,
): UseAiChat => {
  const [messages, setMessages] = useState<RenderedMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState({ promptTokens: 0, completionTokens: 0 });
  const [pricing, setPricing] = useState<ModelPricing>({});
  const [streamingContent, setStreamingContent] = useState('');
  const pendingConfirms = useRef<Map<string, (r: ConfirmResolution) => void>>(new Map());
  // Bumped by clear(); the send loop checks it to abort cleanly if the chat is
  // cleared mid-flight (otherwise it refills the just-emptied message list).
  const sendGeneration = useRef(0);
  // Generation whose aiChat request is currently streaming, or null. Chunks
  // arriving outside an active request (e.g. after clear) are dropped.
  const streamingFor = useRef<number | null>(null);
  // Latest rendered data, read by tools on every call so a later tool round
  // sees what earlier rounds wrote (the send closure would otherwise pin the
  // snapshot from when the message was sent).
  const dataRef = useRef(data);
  dataRef.current = data;

  // Fetch the live OpenRouter pricing catalogue once — every model with a
  // listed rate (curated or custom) gets a cost estimate.
  useEffect(() => {
    void window.api.aiFetchModelPricing().then(setPricing);
  }, []);

  // Subscribe to SSE chunks from the main process. Each content delta gets
  // appended to streamingContent, which the panel renders as a live bubble.
  useEffect(() => {
    const unsub = window.api.onAiChunk((chunk) => {
      if (streamingFor.current === null || streamingFor.current !== sendGeneration.current) return;
      if (chunk.type === 'content' && chunk.delta) {
        setStreamingContent((c) => c + chunk.delta);
      }
    });
    return unsub;
  }, []);

  const aiPrefs = prefs?.aiAssistant;
  const canSend = Boolean(
    !sending && data && aiPrefs?.enabled && aiPrefs?.hasKey && aiPrefs?.model,
  );

  const requestConfirm = useCallback(
    (callId: string, proposal: ConfirmProposal): Promise<ConfirmResolution> => {
      setMessages((m) => [
        ...m,
        { role: 'confirm', callId, proposal, decision: 'pending', id: crypto.randomUUID() },
      ]);
      return new Promise<ConfirmResolution>((resolve) => {
        pendingConfirms.current.set(callId, resolve);
      });
    },
    [],
  );

  const resolveConfirm = useCallback((callId: string, resolution: ConfirmResolution) => {
    const resolver = pendingConfirms.current.get(callId);
    if (!resolver) return;
    pendingConfirms.current.delete(callId);
    setMessages((m) =>
      m.map((msg) =>
        msg.role === 'confirm' && msg.callId === callId ? { ...msg, decision: resolution } : msg,
      ),
    );
    resolver(resolution);
  }, []);

  const hasData = data !== null;
  const ctx: ToolContext | null = useMemo(
    () =>
      hasData
        ? {
            getData: () => {
              if (!dataRef.current) throw new Error('Data not loaded');
              return dataRef.current;
            },
            rates,
            actions,
            requestConfirm,
          }
        : null,
    [hasData, rates, actions, requestConfirm],
  );

  const send = useCallback(
    async (text: string, files: AttachedFile[] = []) => {
      if (!ctx || !aiPrefs || !canSend) return;
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) return;

      setSending(true);
      const generation = sendGeneration.current;
      const aborted = (): boolean => sendGeneration.current !== generation;

      // wire = OpenAI-format messages we send to the LLM. UI messages exclude
      // 'error' and 'confirm' (those are renderer-only).
      const priorWire: AiChatMessage[] = messages.filter(
        (m): m is AiChatMessage => m.role !== 'error' && m.role !== 'confirm',
      );
      const userMsg: AiChatMessage = {
        role: 'user',
        content: buildUserContent(trimmed, files),
      };
      const wire: AiChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(ctx.getData()) },
        ...priorWire,
        userMsg,
      ];
      setMessages((m) => [...m, userMsg]);

      try {
        for (let round = 0; round < MAX_TOOL_ROUND_TRIPS; round++) {
          // Reset live-typing buffer before each request — chunks for this
          // round will accumulate into it via the global subscription.
          setStreamingContent('');
          streamingFor.current = generation;
          const res = await window.api
            .aiChat({
              model: aiPrefs.model,
              messages: wire,
              tools: allTools,
            })
            .finally(() => {
              if (streamingFor.current === generation) streamingFor.current = null;
            });
          if (aborted()) return; // chat was cleared mid-request
          if (!res.ok) {
            setMessages((m) => [...m, errorMsg(res.error)]);
            return;
          }

          if (res.usage) {
            setUsage((u) => ({
              promptTokens: u.promptTokens + (res.usage?.prompt_tokens ?? 0),
              completionTokens: u.completionTokens + (res.usage?.completion_tokens ?? 0),
            }));
          }

          const assistant: AiChatMessage = {
            role: 'assistant',
            content: res.message.content ?? '',
            tool_calls: res.message.tool_calls,
          };
          wire.push(assistant);
          setMessages((m) => [...m, assistant]);
          // The assistant message is now in the messages array with its full
          // content. Clear the live-typing buffer so we don't show a duplicate
          // bubble.
          setStreamingContent('');

          const calls: AiToolCall[] = res.message.tool_calls ?? [];
          if (calls.length === 0) return;

          for (const call of calls) {
            const out = await dispatchTool(
              ctx,
              call.function.name,
              call.function.arguments,
              call.id,
            );
            if (aborted()) return; // cleared while a confirm/tool was resolving
            const toolMsg: AiChatMessage = {
              role: 'tool',
              tool_call_id: call.id,
              content:
                out.status === 'ok'
                  ? serializeToolResult(out.result)
                  : JSON.stringify({ error: out.error }),
            };
            wire.push(toolMsg);
            setMessages((m) => [...m, toolMsg]);
          }
        }
        setMessages((m) => [
          ...m,
          errorMsg('Tool loop limit reached. Try a more direct question.'),
        ]);
      } catch (err) {
        setMessages((m) => [...m, errorMsg((err as Error).message)]);
      } finally {
        if (!aborted()) {
          setSending(false);
          setStreamingContent('');
        }
      }
    },
    [aiPrefs, canSend, ctx, messages],
  );

  const clear = useCallback(() => {
    // Invalidate any in-flight send so it stops pushing messages onto the
    // freshly-emptied list, then resolve and drop pending confirms.
    sendGeneration.current += 1;
    for (const [callId, resolver] of pendingConfirms.current.entries()) {
      resolver({ approved: false });
      pendingConfirms.current.delete(callId);
    }
    setSending(false);
    setStreamingContent('');
    setMessages([]);
    setUsage({ promptTokens: 0, completionTokens: 0 });
  }, []);

  const estimatedCostUsd = aiPrefs
    ? estimateCost(pricing, aiPrefs.model, usage.promptTokens, usage.completionTokens)
    : null;

  return {
    messages,
    sending,
    streamingContent,
    send,
    clear,
    resolveConfirm,
    canSend,
    usage,
    estimatedCostUsd,
  };
};
