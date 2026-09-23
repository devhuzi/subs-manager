// Deletes the caller's OpenRouter key from Vault.
import { adminClient, corsHeaders, getUserId, json, rateAllow } from '../_shared/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, cors);

  const userId = await getUserId(req);
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401, cors);

  if (!(await rateAllow(userId, 'ai-clear-key', 20, 60)))
    return json({ ok: false, error: 'Rate limit exceeded.' }, 429, cors);

  const { error } = await adminClient().rpc('delete_openrouter_key', { p_user_id: userId });
  if (error) {
    console.error('ai-clear-key: delete_openrouter_key failed', error);
    return json({ ok: false, error: 'Could not remove your API key. Please try again.' }, 500, cors);
  }
  return json({ ok: true }, 200, cors);
});
