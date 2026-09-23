# Supabase backend (web / PWA target)

Schema, RLS, Vault helpers and pg_cron live in `migrations/`; Edge Functions in
`functions/`. Nothing project-specific is committed — the steps below wire a
fresh project up.

## 1. Apply migrations

```sh
supabase link --project-ref <project-ref>
supabase db push
```

`20260606120000_cron_notify.sql` creates the Vault secret `cron_secret`
(random) and schedules `scheduled-notify` every 6 hours.

## 2. Vault secret: `project_url`

The cron job reads the Functions base URL from Vault at run time. Create it once
(SQL editor), no trailing slash:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url',
  'Base URL the scheduled-notify cron posts to');
```

Until it exists the cron call fails harmlessly (null URL).

## 3. Function secrets

```sh
supabase secrets set \
  ALLOWED_ORIGINS=https://your-app.example.com \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com \
  OPENROUTER_REFERER=https://your-app.example.com   # optional
```

- `ALLOWED_ORIGINS` — comma-separated browser origins. **Required in
  production**; unset, only the localhost dev servers are allowed.
- VAPID keys: `npx web-push generate-vapid-keys`. The public half is also the
  frontend's `VITE_VAPID_PUBLIC_KEY`.
- `OPENROUTER_REFERER` — optional `HTTP-Referer` attribution sent to OpenRouter.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
to functions automatically.

## 4. Deploy functions

```sh
supabase functions deploy ai-chat ai-set-key ai-has-key ai-clear-key \
  fetch-logo delete-account scheduled-notify --no-verify-jwt
```

Every function authenticates the caller itself (`_shared/util.ts:getUserId`, or
the cron secret for `scheduled-notify`).

## Re-scheduling the cron

To point an existing project's cron at the Vault URL (or change the schedule),
create `project_url` (step 2), then re-run the `cron.unschedule` /
`cron.schedule` block from `20260606120000_cron_notify.sql` in the SQL editor.
Check it with `select jobname, schedule, command from cron.job;`.
