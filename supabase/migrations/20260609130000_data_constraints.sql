-- Server-side data invariants. The web client validates with Zod
-- (src/shared/schemas.ts), but a client holding its own JWT + the anon key can
-- POST/PATCH PostgREST rows directly, bypassing that. RLS already confines such
-- writes to the user's own rows; these CHECK constraints add the value-level
-- backstop (non-negative money, valid enums, bounded text) so the contract
-- holds server-side regardless of client. Limits mirror schemas.ts.
--
-- Added NOT VALID: enforced on every new INSERT/UPDATE, but skips a retro-scan
-- so the migration can't fail on any pre-existing legacy row. Re-runnable via
-- drop-if-exists. logo_url is intentionally uncapped (logos are large data URLs).

do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- categories
      ('categories',           'categories_name_len',        'char_length(name) between 1 and 60'),
      ('categories',           'categories_color_hex',       $c$color is null or color ~ '^#[0-9a-fA-F]{6}$'$c$),
      ('categories',           'categories_budget_nonneg',   'monthly_budget is null or monthly_budget >= 0'),

      -- subscriptions
      ('subscriptions',        'subscriptions_name_len',     'char_length(name) between 1 and 120'),
      ('subscriptions',        'subscriptions_cost_nonneg',  'cost >= 0'),
      ('subscriptions',        'subscriptions_currency_len', 'char_length(currency) = 3'),
      ('subscriptions',        'subscriptions_cycle_valid',  $c$billing_cycle in ('monthly','quarterly','yearly','custom')$c$),
      ('subscriptions',        'subscriptions_status_valid', $c$status in ('active','inactive')$c$),
      ('subscriptions',        'subscriptions_website_len',  'website is null or char_length(website) <= 500'),
      ('subscriptions',        'subscriptions_notes_len',    'notes is null or char_length(notes) <= 2000'),
      ('subscriptions',        'subscriptions_cancel_len',   'cancellation_url is null or char_length(cancellation_url) <= 1000'),
      ('subscriptions',        'subscriptions_payment_len',  'payment_method is null or char_length(payment_method) <= 60'),
      ('subscriptions',        'subscriptions_color_hex',    $c$brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'$c$),

      -- subscription_renewals
      ('subscription_renewals','renewals_cost_nonneg',       'cost >= 0'),
      ('subscription_renewals','renewals_currency_len',      'char_length(currency) = 3'),

      -- one_time_purchases
      ('one_time_purchases',   'purchases_name_len',         'char_length(name) between 1 and 120'),
      ('one_time_purchases',   'purchases_cost_nonneg',      'cost >= 0'),
      ('one_time_purchases',   'purchases_currency_len',     'char_length(currency) = 3'),
      ('one_time_purchases',   'purchases_website_len',      'website is null or char_length(website) <= 500'),
      ('one_time_purchases',   'purchases_notes_len',        'notes is null or char_length(notes) <= 2000'),
      ('one_time_purchases',   'purchases_payment_len',      'payment_method is null or char_length(payment_method) <= 60'),
      ('one_time_purchases',   'purchases_lifespan_pos',     'expected_lifespan_months is null or (expected_lifespan_months > 0 and expected_lifespan_months <= 600)'),
      ('one_time_purchases',   'purchases_color_hex',        $c$brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'$c$),

      -- cancellation_log
      ('cancellation_log',     'cancellation_monthly_nonneg','monthly_equivalent >= 0'),
      ('cancellation_log',     'cancellation_currency_len',  'char_length(currency) = 3'),

      -- preferences
      ('preferences',          'preferences_reminder_nonneg','reminder_days >= 0'),
      ('preferences',          'preferences_currency_len',   'char_length(default_currency) = 3')
    ) as t(tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I;', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid;', c.tbl, c.name, c.expr);
  end loop;
end $$;
