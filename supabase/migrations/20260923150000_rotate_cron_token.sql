-- Rotate the scheduled-notify cron secret. Before 20260923120000 the helper
-- that returns it was callable by anon/authenticated via /rest/v1/rpc, so any
-- value created before that migration must be treated as exposed.
-- Both the cron job and the Edge Function read the secret from Vault at run
-- time, so nothing else needs updating. Harmless on fresh installs.
select vault.update_secret(
  id,
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
)
from vault.secrets
where name = 'cron_secret';
