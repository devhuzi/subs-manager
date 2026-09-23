// Deletes the calling user's account. Runs with the service-role key (admin),
// but only after verifying the caller's own JWT — so a user can only ever
// delete themselves. Deleting the auth user cascades all their data rows
// (every table FKs auth.users(id) on delete cascade). The Vault-stored
// OpenRouter key has no FK to auth.users, so it's deleted explicitly first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, rateAllow } from '../_shared/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401, cors);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their JWT.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: 'Unauthorized' }, 401, cors);

  // Throttle so a stolen session can't hammer this destructive endpoint. Fail
  // CLOSED: a DB hiccup must never silently drop the limit on account deletion.
  if (!(await rateAllow(data.user.id, 'delete-account', 3, 3600, true)))
    return json({ error: 'Too many attempts. Please wait a moment.' }, 429, cors);

  const admin = createClient(url, serviceRole);

  // Remove the Vault key BEFORE the user: once the user is gone nothing would
  // ever clean it up. Abort on failure so a retry can finish the job.
  const { error: keyErr } = await admin.rpc('delete_openrouter_key', {
    p_user_id: data.user.id,
  });
  if (keyErr) {
    console.error('delete-account: delete_openrouter_key failed', keyErr);
    return json({ error: 'Could not delete your account. Please try again.' }, 500, cors);
  }

  // Delete them with admin rights (cascades their data).
  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
  if (delErr) {
    console.error('delete-account: deleteUser failed', delErr);
    return json({ error: 'Could not delete your account. Please try again.' }, 500, cors);
  }

  return json({ ok: true }, 200, cors);
});
