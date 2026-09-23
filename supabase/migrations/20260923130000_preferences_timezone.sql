-- The user's IANA time zone (e.g. 'Europe/Berlin'), written by the web client.
-- scheduled-notify runs in UTC; with this it computes "renews today/tomorrow"
-- and quiet hours in the user's local time. Nullable: NULL → UTC fallback.

alter table public.preferences add column if not exists timezone text;

alter table public.preferences drop constraint if exists preferences_timezone_len;
alter table public.preferences
  add constraint preferences_timezone_len
  check (timezone is null or char_length(timezone) <= 64) not valid;
