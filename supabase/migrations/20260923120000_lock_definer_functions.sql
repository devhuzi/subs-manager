-- Locks the SECURITY DEFINER helpers down to service_role only.
--
-- The earlier migrations did `revoke all ... from public`, but Supabase's
-- default privileges ALSO grant EXECUTE on every new function in `public`
-- directly to `anon` and `authenticated`. Those direct grants survive a revoke
-- from PUBLIC, so the Vault/rate-limit helpers were callable by any client via
-- POST /rest/v1/rpc/<name> — e.g. get_openrouter_key(<any uuid>) would return
-- another user's key. Revoke them explicitly; only the Edge Functions
-- (service_role, after verifying the caller's JWT) may execute these.
--
-- search_path: all six already declare `set search_path = ''` in their
-- definitions (20260605120000_ai_vault, 20260606120000_cron_notify,
-- 20260609120000_rate_limits), so no ALTER is needed for that.

revoke execute on function public.set_openrouter_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_openrouter_key(uuid) from public, anon, authenticated;
revoke execute on function public.has_openrouter_key(uuid) from public, anon, authenticated;
revoke execute on function public.delete_openrouter_key(uuid) from public, anon, authenticated;
revoke execute on function public.get_cron_secret() from public, anon, authenticated;
revoke execute on function public.rate_take(uuid, text, integer, interval) from public, anon, authenticated;

grant execute on function public.set_openrouter_key(uuid, text) to service_role;
grant execute on function public.get_openrouter_key(uuid) to service_role;
grant execute on function public.has_openrouter_key(uuid) to service_role;
grant execute on function public.delete_openrouter_key(uuid) to service_role;
grant execute on function public.get_cron_secret() to service_role;
grant execute on function public.rate_take(uuid, text, integer, interval) to service_role;

-- Future functions: the browser client never calls .rpc() (grep src for
-- `.rpc(` — only the Edge Functions do, as service_role), so no client RPC
-- depends on the anon/authenticated default grant. Drop it for functions
-- `postgres` (the migration role) creates in `public` from now on, so a new SECURITY DEFINER
-- helper isn't client-callable by accident. Note this does NOT cover PUBLIC:
-- Postgres grants EXECUTE to PUBLIC globally and a per-schema default can't
-- revoke a global one, so new functions still need `revoke ... from public`.
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- Verify (expect only postgres/service_role/supabase_admin, no anon/authenticated/PUBLIC):
--   select p.proname, r.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--   left join pg_roles r on r.oid = a.grantee
--   where n.nspname = 'public'
--     and p.proname in ('set_openrouter_key','get_openrouter_key','has_openrouter_key',
--                       'delete_openrouter_key','get_cron_secret','rate_take')
--     and a.privilege_type = 'EXECUTE'
--   order by 1, 2;
-- (A NULL rolname row means grantee 0 = PUBLIC.)
