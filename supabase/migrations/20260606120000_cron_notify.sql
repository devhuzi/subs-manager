-- Schedules the renewal/trial push check (scheduled-notify) every 6 hours.
-- Auth: a random secret generated INTO Vault here (never in the repo). Both the
-- cron job and the scheduled-notify Edge Function read it from Vault, so the
-- function can distinguish a cron call from a normal user JWT.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Create the cron secret once (random; no literal secret in this file).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cron_secret',
      'Authenticates the scheduled-notify cron call'
    );
  end if;
end $$;

-- Let the Edge Function (service_role) read it to verify cron calls.
create or replace function public.get_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';
$$;
revoke all on function public.get_cron_secret() from public;
grant execute on function public.get_cron_secret() to service_role;

-- (Re)schedule every 6 hours. Unschedule first so re-running this is idempotent.
-- The target URL is read from the Vault secret `project_url` at run time (e.g.
-- 'https://<project-ref>.supabase.co', no trailing slash) so no project ref is
-- committed. Create it once — see supabase/README.md.
do $$
begin
  perform cron.unschedule('scheduled-notify');
exception
  when others then null; -- wasn't scheduled yet
end $$;

select cron.schedule(
  'scheduled-notify',
  '0 */6 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scheduled-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
