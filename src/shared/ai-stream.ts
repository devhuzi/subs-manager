import type { AiChatResult, AiChatUsage, AiStreamChunk, AiToolCall } from './types';

/**
 * Parses an OpenRouter (OpenAI-compatible) chat-completions SSE stream,
 * accumulating content + tool calls and emitting one `content` chunk per text
 * delta. Runtime-neutral (web streams + TextDecoder), so it's shared by the
 * desktop main process and the web Edge-Function proxy. The caller owns the
 * fetch + non-2xx handling; this only consumes a successful response body.
 */

interface StreamChoiceDelta {
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

interface StreamChoice {
  delta?: StreamChoiceDelta;
  finish_reason?: string | null;
}

interface StreamChunkBody {
  choices?: StreamChoice[];
  usage?: AiChatUsage;
  error?: { message?: string };
}

export const parseOpenRouterStream = async (
  body: ReadableStream<Uint8Array>,
  emit: (chunk: AiStreamChunk) => void,
): Promise<AiChatResult> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCallsByIndex = new Map<number, AiToolCall>();
  let finishReason = '';
  let usage: AiChatUsage | undefined;
  let streamError: string | null = null;

  try {
    let streaming = true;
    while (streaming) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE: events delimited by newline, payload prefixed `data: `.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '' || data === '[DONE]') continue;
        let parsed: StreamChunkBody;
        try {
          parsed = JSON.parse(data) as StreamChunkBody;
        } catch {
          continue;
        }
        if (parsed.error?.message) {
          streamError = parsed.error.message;
          streaming = false;
          break;
        }
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          content += delta.content;
          emit({ type: 'content', delta: delta.content });
        }
        if (delta?.tool_calls) {
          for (const tcd of delta.tool_calls) {
            const idx = tcd.index ?? 0;
            let existing = toolCallsByIndex.get(idx);
            if (!existing) {
              existing = { id: '', type: 'function', function: { name: '', arguments: '' } };
              toolCallsByIndex.set(idx, existing);
            }
            if (tcd.id) existing.id = tcd.id;
            if (tcd.function?.name) existing.function.name += tcd.function.name;
            if (tcd.function?.arguments) existing.function.arguments += tcd.function.arguments;
          }
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (parsed.usage) usage = parsed.usage;
      }
    }
  } finally {
    // Release the stream + underlying connection on every exit path.
    await reader.cancel().catch(() => undefined);
  }

  if (streamError) return { ok: false, error: streamError };

  const toolCalls = [...toolCallsByIndex.values()].filter((tc) => tc.id);
  return {
    ok: true,
    message: {
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    finish_reason: finishReason,
    usage,
  };
};
