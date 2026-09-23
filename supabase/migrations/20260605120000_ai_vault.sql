-- Secure per-user OpenRouter API key storage via Supabase Vault.
-- The key is encrypted at rest by Vault. Only these SECURITY DEFINER helpers
-- can touch it, and EXECUTE is granted solely to service_role — i.e. only the
-- AI Edge Functions (which verify the caller's JWT first) can read/write a key.
-- The browser never receives it. This is the web analog of the desktop's
-- OS-keychain (safeStorage) custody.

create or replace function public.set_openrouter_key(p_user_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'openrouter:' || p_user_id::text;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_key, v_name, 'OpenRouter API key');
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end;
$$;

create or replace function public.get_openrouter_key(p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'openrouter:' || p_user_id::text;
$$;

create or replace function public.has_openrouter_key(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.secrets where name = 'openrouter:' || p_user_id::text
  );
$$;

create or replace function public.delete_openrouter_key(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'openrouter:' || p_user_id::text;
$$;

-- Lock down: revoke from everyone, grant only to the service role.
revoke all on function public.set_openrouter_key(uuid, text) from public;
revoke all on function public.get_openrouter_key(uuid) from public;
revoke all on function public.has_openrouter_key(uuid) from public;
revoke all on function public.delete_openrouter_key(uuid) from public;
grant execute on function public.set_openrouter_key(uuid, text) to service_role;
grant execute on function public.get_openrouter_key(uuid) to service_role;
grant execute on function public.has_openrouter_key(uuid) to service_role;
grant execute on function public.delete_openrouter_key(uuid) to service_role;
