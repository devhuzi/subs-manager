-- Per-user fixed-window rate limiting for Edge Functions (ai-chat, fetch-logo,
-- ai-set-key, scheduled-notify "check now"). A single SECURITY DEFINER helper
-- increments a per-(user, bucket) counter and resets it once the window elapses.
-- EXECUTE is granted only to service_role, so only the Edge Functions — which
-- verify the caller's JWT first — can spend quota. The table is RLS-locked with
-- no policy, so no client can read or write it directly.

create table if not exists public.rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null default now(),
  count        integer not null default 0,
  primary key (user_id, bucket)
);

alter table public.rate_limits enable row level security;
-- Intentionally NO policies: PostgREST returns nothing; only the SECURITY
-- DEFINER rate_take() (service_role) ever touches this table.

create or replace function public.rate_take(
  p_user uuid, p_bucket text, p_limit integer, p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (user_id, bucket)
    values (p_user, p_bucket)
    on conflict (user_id, bucket) do nothing;

  -- Reset the window if it has fully elapsed.
  update public.rate_limits
    set window_start = now(), count = 0
    where user_id = p_user and bucket = p_bucket
      and now() - window_start > p_window;

  -- Spend one token; report whether we're still within the limit.
  update public.rate_limits
    set count = count + 1
    where user_id = p_user and bucket = p_bucket
    returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.rate_take(uuid, text, integer, interval) from public;
grant execute on function public.rate_take(uuid, text, integer, interval) to service_role;
