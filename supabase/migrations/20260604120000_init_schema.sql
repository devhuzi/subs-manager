-- Tools & Subs Manager — web app schema.
-- Normalized, per-user, with Row-Level Security so each user only ever sees
-- their own rows. Column shapes mirror src/shared/types.ts. Dates/timestamps
-- are stored as text exactly as the app emits them (ISO 'YYYY-MM-DD' or full
-- ISO timestamps) so a load→save round-trip is byte-identical to the desktop
-- AppData. Money is numeric; nested optional structures are jsonb.

-- ── categories ────────────────────────────────────────────────────────────
create table if not exists public.categories (
  user_id        uuid not null references auth.users (id) on delete cascade,
  id             text not null,
  name           text not null,
  color          text,
  monthly_budget numeric,
  primary key (user_id, id)
);

-- ── subscriptions ─────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id          uuid not null references auth.users (id) on delete cascade,
  id               text not null,
  name             text not null,
  cost             numeric not null,
  currency         text not null,
  billing_cycle    text not null,           -- monthly | quarterly | yearly | custom
  renewal_date     text not null,           -- 'YYYY-MM-DD'
  subscribed_since text not null,           -- 'YYYY-MM-DD'
  status           text not null,           -- active | inactive
  category_id      text,
  website          text,
  notes            text,
  cancellation_url text,
  payment_method   text,
  logo_url         text,
  brand_color      text,
  trial            jsonb,                    -- { endsAt, convertsToCost? }
  alert_config     jsonb,                    -- { daysBefore: number[] }
  price_history    jsonb,                    -- PricePoint[]
  fired_alerts     text[] not null default '{}', -- server-managed (Phase 4 cron)
  created_at       text not null,
  updated_at       text not null,
  primary key (user_id, id)
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- ── subscription_renewals (child of subscriptions) ────────────────────────
create table if not exists public.subscription_renewals (
  user_id         uuid not null references auth.users (id) on delete cascade,
  id              text not null,
  subscription_id text not null,
  date            text not null,            -- 'YYYY-MM-DD'
  cost            numeric not null,
  currency        text not null,
  enabled         boolean not null default true,
  primary key (user_id, id),
  foreign key (user_id, subscription_id)
    references public.subscriptions (user_id, id) on delete cascade
);
create index if not exists renewals_sub_idx
  on public.subscription_renewals (user_id, subscription_id);

-- ── one_time_purchases ────────────────────────────────────────────────────
create table if not exists public.one_time_purchases (
  user_id                 uuid not null references auth.users (id) on delete cascade,
  id                      text not null,
  name                    text not null,
  cost                    numeric not null,
  currency                text not null,
  purchase_date           text not null,    -- 'YYYY-MM-DD'
  category_id             text,
  website                 text,
  notes                   text,
  warranty_ends_at        text,
  support_ends_at         text,
  expected_lifespan_months integer,
  payment_method          text,
  logo_url                text,
  brand_color             text,
  created_at              text not null,
  updated_at              text not null,
  primary key (user_id, id)
);
create index if not exists purchases_user_idx on public.one_time_purchases (user_id);

-- ── cancellation_log ──────────────────────────────────────────────────────
create table if not exists public.cancellation_log (
  user_id            uuid not null references auth.users (id) on delete cascade,
  id                 text not null,
  subscription_id    text,
  subscription_name  text not null,
  cancelled_at       text not null,
  monthly_equivalent numeric not null,
  currency           text not null,
  primary key (user_id, id)
);

-- ── preferences (one row per user) ────────────────────────────────────────
create table if not exists public.preferences (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  theme              text not null default 'system',
  default_currency   text not null default 'USD',
  reminder_days      integer not null default 30,
  fx_last_fetched_at text,
  enable_logo_fetch  boolean not null default false,
  notify             jsonb not null,        -- NotifyPrefs
  ai_assistant       jsonb not null,        -- { enabled, model, hasKey }
  layout_theme       text not null default 'default',
  brand_color        text
);

-- ── push_subscriptions (Web Push, used in Phase 4) ────────────────────────
create table if not exists public.push_subscriptions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

-- ── Row-Level Security: a user can only touch their own rows ──────────────
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'subscriptions', 'subscription_renewals',
    'one_time_purchases', 'cancellation_log', 'preferences', 'push_subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_owner', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t || '_owner', t);
  end loop;
end $$;
