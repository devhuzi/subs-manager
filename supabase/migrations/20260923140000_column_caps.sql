-- Bounds the columns the earlier data_constraints migration left open: jsonb
-- blobs, ids, cancellation_log.subscription_name, theme enums and the Web Push
-- subscription fields. Same rationale: a client with its own JWT + the anon
-- key can write PostgREST rows directly, so every column needs a server-side
-- cap. Caps are generous (far above anything the app writes) — they only stop
-- pathological payloads. Enum values mirror src/shared/types.ts
-- (Theme, LayoutTheme).
--
-- NOT VALID like the others: enforced on every new INSERT/UPDATE, no retro-scan.
-- Re-runnable via drop-if-exists.

do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- ids (app ids are UUIDs, 36 chars)
      ('categories',           'categories_id_len',           'char_length(id) between 1 and 128'),
      ('subscriptions',        'subscriptions_id_len',        'char_length(id) between 1 and 128'),
      ('subscriptions',        'subscriptions_category_len',  'category_id is null or char_length(category_id) <= 128'),
      ('subscription_renewals','renewals_id_len',             'char_length(id) between 1 and 128'),
      ('subscription_renewals','renewals_sub_id_len',         'char_length(subscription_id) <= 128'),
      ('one_time_purchases',   'purchases_id_len',            'char_length(id) between 1 and 128'),
      ('one_time_purchases',   'purchases_category_len',      'category_id is null or char_length(category_id) <= 128'),
      ('cancellation_log',     'cancellation_id_len',         'char_length(id) between 1 and 128'),
      ('cancellation_log',     'cancellation_sub_id_len',     'subscription_id is null or char_length(subscription_id) <= 128'),

      -- cancellation_log (subscription names are capped at 120)
      ('cancellation_log',     'cancellation_name_len',       'char_length(subscription_name) between 1 and 200'),

      -- jsonb blobs (serialized size)
      ('subscriptions',        'subscriptions_price_history_size', 'price_history is null or octet_length(price_history::text) <= 65536'),
      ('subscriptions',        'subscriptions_trial_size',         'trial is null or octet_length(trial::text) <= 4096'),
      ('subscriptions',        'subscriptions_alert_config_size',  'alert_config is null or octet_length(alert_config::text) <= 4096'),
      ('preferences',          'preferences_notify_size',          'octet_length(notify::text) <= 16384'),
      ('preferences',          'preferences_ai_assistant_size',    'octet_length(ai_assistant::text) <= 4096'),

      -- preferences enums
      ('preferences',          'preferences_theme_valid',     $c$theme in ('light','dark','system')$c$),
      ('preferences',          'preferences_layout_valid',    $c$layout_theme in ('default','sharp','glass','notion')$c$),

      -- push_subscriptions (real endpoints are a few hundred chars; keys are
      -- 87-char P-256 / 22-char auth secrets, base64url)
      ('push_subscriptions',   'push_endpoint_len',           'char_length(endpoint) between 1 and 2048'),
      ('push_subscriptions',   'push_p256dh_len',             'char_length(p256dh) between 1 and 256'),
      ('push_subscriptions',   'push_auth_len',               'char_length(auth) between 1 and 128')
    ) as t(tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I;', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid;', c.tbl, c.name, c.expr);
  end loop;
end $$;
