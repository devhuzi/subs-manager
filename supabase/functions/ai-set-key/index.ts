// Stores the caller's OpenRouter API key in Vault (encrypted at rest). Verifies
// the JWT first, so a user can only set their own key. The key is never read
// back to any client — there is deliberately no "get key" path.
import { adminClient, corsHeaders, getUserId, json, rateAllow } from '../_shared/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const userId = await getUserId(req);
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401, cors);

  // Fail CLOSED — a DB error shouldn't drop the write throttle on a credential.
  if (!(await rateAllow(userId, 'ai-set-key', 20, 60, true)))
    return json({ ok: false, error: 'Rate limit exceeded.' }, 429, cors);

  let key = '';
  try {
    key = ((await req.json()) as { key?: string }).key ?? '';
  } catch {
    /* fall through to empty-key */
  }
  if (!key.trim()) return json({ ok: false, reason: 'empty-key' }, 200, cors);

  const { error } = await adminClient().rpc('set_openrouter_key', {
    p_user_id: userId,
    p_key: key.trim(),
  });
  if (error) {
    console.error('ai-set-key: set_openrouter_key failed', error);
    return json({ ok: false, error: 'Could not save your API key. Please try again.' }, 500, cors);
  }
  return json({ ok: true }, 200, cors);
});
