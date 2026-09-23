// Reports whether the caller has an OpenRouter key stored — a boolean only,
// never the key itself.
import { adminClient, corsHeaders, getUserId, json, rateAllow } from '../_shared/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Unauthorized' }, 401, cors);

  // Called on every app load, so the limit is generous.
  if (!(await rateAllow(userId, 'ai-has-key', 60, 60)))
    return json({ error: 'Rate limit exceeded.' }, 429, cors);

  const { data, error } = await adminClient().rpc('has_openrouter_key', { p_user_id: userId });
  if (error) {
    console.error('ai-has-key: has_openrouter_key failed', error);
    return json({ error: 'Could not check your API key.' }, 500, cors);
  }
  return json({ hasKey: data === true }, 200, cors);
});
