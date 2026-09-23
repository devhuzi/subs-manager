// Streaming OpenRouter proxy. Verifies the caller's JWT, rate-limits per user,
// validates the request body, fetches THEIR key from Vault (server-side only),
// POSTs the chat with stream:true, and pipes the SSE response straight back to
// the browser. The key never reaches the client; the browser parses the stream
// with the same shared parser the desktop uses.
import { adminClient, corsHeaders, getUserId, json, rateAllow } from '../_shared/util.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_MESSAGES = 100;
// Generous enough for vision payloads (base64 screenshots) but a hard ceiling so
// a single request can't be inflated arbitrarily. ~6 MB of raw JSON.
const MAX_BODY_BYTES = 6 * 1024 * 1024;
// Optional OpenRouter attribution (their app rankings); omitted when unset.
const REFERER = Deno.env.get('OPENROUTER_REFERER');

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Unauthorized' }, 401, cors);

  // Fail CLOSED: this proxies a paid upstream, so a DB hiccup must not silently
  // drop the per-user limit.
  if (!(await rateAllow(userId, 'ai-chat', 30, 60, true)))
    return json({ error: 'Rate limit exceeded. Please wait a moment and try again.' }, 429, cors);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES)
    return json({ error: 'Request too large.' }, 413, cors);

  let payload: { model?: unknown; messages?: unknown; tools?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad request body' }, 400, cors);
  }
  if (typeof payload?.model !== 'string' || !Array.isArray(payload?.messages))
    return json({ error: 'Invalid request: a model and a messages array are required.' }, 400, cors);
  if (payload.messages.length === 0 || payload.messages.length > MAX_MESSAGES)
    return json({ error: `messages must contain between 1 and ${MAX_MESSAGES} items.` }, 400, cors);
  if (payload.tools !== undefined && !Array.isArray(payload.tools))
    return json({ error: 'tools must be an array when provided.' }, 400, cors);

  const tools = payload.tools as unknown[] | undefined;

  const { data: key, error: keyErr } = await adminClient().rpc('get_openrouter_key', {
    p_user_id: userId,
  });
  if (keyErr) {
    console.error('ai-chat: get_openrouter_key failed', keyErr);
    return json({ error: 'Could not read your API key. Please try again.' }, 500, cors);
  }
  if (!key) return json({ error: 'No API key set. Add one in Settings.' }, 400, cors);

  const orRes = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      ...(REFERER ? { 'HTTP-Referer': REFERER } : {}),
      'X-Title': 'Tools & Subs Manager',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      tools,
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
      stream: true,
    }),
  });

  if (!orRes.ok || !orRes.body) {
    const j = (await orRes.json().catch(() => ({}))) as { error?: { message?: string } };
    return json({ error: j.error?.message ?? `HTTP ${orRes.status}` }, orRes.status || 502, cors);
  }

  // Pipe OpenRouter's SSE straight through to the browser.
  return new Response(orRes.body, {
    status: 200,
    headers: { ...cors, 'Content-Type': 'text/event-stream' },
  });
});
