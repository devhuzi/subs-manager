-- Caps logo_url length on subscriptions and one_time_purchases. The earlier
-- data_constraints migration left logo_url uncapped because favicons are stored
-- as data URLs (a few KB each). But a client holding its own JWT + the anon key
-- can PATCH PostgREST rows directly, so an uncapped text column is a self-scoped
-- storage-abuse vector. 2 MB is ~1000× a real logo — it never trips on
-- legitimate data while bounding pathological writes.
--
-- NOT VALID (like the other constraints): enforced on every new INSERT/UPDATE
-- but skips a retro-scan so the migration can't fail on a pre-existing large row.
-- Re-runnable via drop-if-exists.

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('subscriptions',      'subscriptions_logo_len', 'logo_url is null or char_length(logo_url) <= 2097152'),
      ('one_time_purchases', 'purchases_logo_len',     'logo_url is null or char_length(logo_url) <= 2097152')
    ) as t(tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I;', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid;', c.tbl, c.name, c.expr);
  end loop;
end $$;
