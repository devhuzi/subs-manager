# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: on this repository, go to
**Security → Report a vulnerability**. Include steps to reproduce, the
affected target (desktop, web, or Supabase functions/migrations), and the
impact you expect.

You should get an acknowledgement within a week. Fixes are released as soon
as practical, and reporters are credited unless they prefer otherwise.

## Scope

In scope:

- The Electron desktop app (`src/main`, `src/preload`, `src/renderer`)
- The web/PWA client (`src/web`)
- Supabase migrations, row-level security, and Edge Functions (`supabase/`)
- The Docker/nginx configuration (`Dockerfile`, `docker/`)

Out of scope: third-party services the app talks to (Supabase, OpenRouter,
Frankfurter, favicon services) and self-hosted deployments that changed the
shipped security configuration.

## Design notes for reviewers

- The OpenRouter API key never reaches the renderer. Desktop stores it with
  Electron `safeStorage`; web stores it in Supabase Vault and only Edge
  Functions (service role) can read it.
- Every Supabase table has an owner-only RLS policy. `SECURITY DEFINER`
  helpers are executable by `service_role` only.
- The desktop renderer runs with context isolation, no Node integration, a
  production CSP, and blocked navigation/new windows.
