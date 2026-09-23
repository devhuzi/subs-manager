# Project Instructions

> Authoritative source for AI agents working on this project.
> Cross-tool support (Codex / Cursor / Gemini): run `/enable-cross-tool`.

---

## About This Project

Tools & Subs Manager — tracks the tools, subscriptions, and one-time
purchases you pay for. One React renderer ships as **two targets**:

1. **Desktop** (Electron, Windows + Mac) — fully local. Data lives in a
   directory chosen by the user (default: OS user-data dir). No account,
   no telemetry, no sync.
2. **Web / PWA** (`src/web/`) — installable PWA backed by Supabase
   (email+password auth, Postgres with RLS, Edge Functions, Web Push).
   Self-hostable via Docker. See "Web / PWA target" below.

Core capabilities:

- Subscriptions: cost, currency, billing cycle, renewal date, active/
  inactive, trials, price history, cancellation URL, per-sub alert config
- One-time purchases: cost, purchase date, category
- Dashboard: monthly/annual rollups, upcoming renewals, trials, charts
- Renewal + trial-end reminders (desktop notifications / Web Push)
- Categories with optional monthly budgets
- CSV/JSON import + export; Ctrl/Cmd+K command palette

Optional outbound network features, all off by default: weekly FX rates
(`api.frankfurter.dev`), service logos (see "Logo fetching"), and a
bring-your-own-key AI chat assistant (OpenRouter). The AI key is stored
encrypted — `safeStorage` on desktop, Supabase Vault on web — and never
reaches the renderer.

## Tech Stack & Commands

Electron + React + TypeScript. Vite for the renderer. Node 20+.
Web target adds Supabase (`@supabase/supabase-js`, Deno Edge Functions)
and `vite-plugin-pwa`.

```
Install:    npm install
Dev:        npm run dev          # Vite dev server; vite-plugin-electron spawns Electron
Dev (web):  npm run dev:web      # PWA against Supabase (needs VITE_* vars, see .env.example)
Test:       npm test             # Vitest — pure-logic specs (money, spendMetrics, renewals, colors, notifications-core, mappers)
E2E:        npm run test:e2e     # Playwright against a mock IpcApi (e2e/mock-api.ts), no backend; see /browser-test
Lint:       npm run lint         # ESLint
Format:     npm run format       # Prettier
Typecheck:  npm run typecheck    # tsc --noEmit on both tsconfigs
Build:      npm run build        # typechecks both tsconfigs, then vite build (desktop)
Build web:  npm run build:web    # → dist/web (served by nginx via Dockerfile)
Package:    npm run package      # build + electron-builder (NSIS .exe, .dmg)
```

## Code Style

Prettier + ESLint with the TypeScript + React presets. 2-space indent.
Single quotes for JS/TS, double for JSX attributes. Trailing commas where
valid. Named exports preferred over default. Strict TypeScript
(`strict: true`, no implicit any).

---

## Universal Rules

These apply to every project regardless of type.

- **Never read `.env`, credentials, or API keys into the conversation.**
  Scripts access them at runtime only. If credential exposure is suspected,
  notify the user immediately and advise rotating the affected key.
- **Always create `.env` and `.gitignore` when scaffolding.** `.gitignore`
  must cover `.env` and any local-only secrets directory at minimum.
- **Confirm before irreversible actions.** Sending email/Slack/SMS, writing
  to external services (Sheets, databases, deploy targets), force-pushing,
  hard-resetting, deleting outside `.tmp/`, or modifying `.env` all need
  explicit confirmation each time.
- **If a task expands beyond the original request** — more than 3 distinct
  script or tool executions, scope creep, unexpected refactors — pause,
  present a plan, get confirmation before continuing.

---

## Architecture

Electron three-process layout, plus a web entry that swaps in a
Supabase-backed `window.api`:

```
src/
  main/       # Electron main process (window, IPC, file I/O)
  preload/    # contextBridge — exposes the typed IpcApi as window.api
  renderer/   # React UI (Vite-built) — shared by both targets
  shared/     # types, Zod schemas, platform flag, notifications-core
  web/        # web entry: webApi (IpcApi over Supabase), AuthGate, PWA/push
supabase/     # migrations (schema + RLS + Vault + cron) and Edge Functions
docker/       # nginx config + security headers for the web build
e2e/          # Playwright mock-seam harness
```

The renderer must not import Electron or Supabase directly — it only
talks to `window.api`. Branch on `isWeb()` (`src/shared/platform.ts`)
for target-specific UI.

Path aliases (from `vite.config.ts`): `@shared/*` → `src/shared`,
`@renderer/*` → `src/renderer`.

### Persistence

- `settings.json` at `app.getPath('userData')` stores only the
  user-chosen data directory (defaults to `{userData}/data`). Lets the
  app remember the location across launches.
- The actual app data lives at `{dataDir}/subs-manager.json`. Logos
  embedded as data URLs on each subscription/purchase keep the file
  larger than a name-only catalog (~2-5KB per logo).
- `{dataDir}/rates.json` holds the FX-rate cache (base + fetchedAt +
  rates map). Base = `preferences.defaultCurrency` (the single conversion
  target; there is no separate "home currency"). Refreshed weekly.
- `{dataDir}/backups/` holds rotating JSON backups (`src/main/backup.ts`):
  a once-per-day snapshot on launch plus on-demand `Back up now`; daily
  and manual backups rotate separately (last 10 of each). A file that
  doesn't parse is never backed up. Restore = Import-JSON pointed at a
  backup file.
- Reads/writes go through the main process only; renderer talks to it
  over IPC. All writes go through one queue (`updateData()` for
  load-modify-save). Atomic writes: temp file + fsync + rename, with
  retries for Windows/OneDrive locks. A corrupt data file is renamed to
  `subs-manager.corrupt-<ts>.json` and the newest good backup restored.
- `firedAlerts` is main-owned: `data:save` merges the on-disk values into
  whatever the renderer sends, so UI saves never reset reminder state.
- `loadData()` runs a `migrate()` pass on read to backfill new fields
  on older files — keep it forward-compatible when adding schema fields.
  All optional fields (paymentMethod, monthlyBudget, priceHistory,
  layoutTheme, brandColor, etc.) need no migration beyond the default
  spread.

### Money + currency

Every total converts to `preferences.defaultCurrency` at the live rate via
`sumInto`/`convert` in `src/renderer/lib/money.ts`. Items keep their entered
currency; the `<Money>` component (`components/ui/money.tsx`) renders the ISO
code de-emphasised and can show the converted value beside the original
(`convertTo` + `rates` props). Pure money/metric/renewal logic is unit-tested
(`*.test.ts` next to each module; renewal logic lives in
`features/subscriptions/renewals.ts`, extracted from `useAppData` for that
purpose).

### IPC contract

Typed as `IpcApi` in `src/shared/types.ts`, bridged through
`src/preload/index.ts`, exposed in the renderer as `window.api`.
Handlers are registered in `src/main/data.ts` via `registerDataHandlers()`.
The web implementation of the same interface is `src/web/api/webApi.ts`,
and the Playwright mock is `e2e/mock-api.ts`. When adding a new IPC call,
update all five places (types, preload, main handler, webApi, mock-api).

### Main-process background work

- Tray icon (`src/main/tray.ts`) with menu items for show / check
  renewals now / quit. Tray icon generated by
  `scripts/generate-tray-icon.ps1` to `build/tray-icon.png`.
- Reminder scheduler (`src/main/notifications.ts` `startScheduler`)
  runs every 6 hours. The pure threshold logic lives in
  `src/shared/notifications-core.ts`; a copy for the web cron is in
  `supabase/functions/_shared/notifications-core.ts` — keep them in sync. Fires multi-tier alerts based on
  `preferences.notify.globalDaysBefore` (or per-sub `alertConfig`
  override). Each fired threshold is tracked in `firedAlerts` on the
  subscription so it never double-fires. Quiet hours and a master
  `notify.enabled` switch both suppress firing.
- Trial-end alerts use the same threshold list against `trial.endsAt`.
- The scheduler rolls overdue `renewalDate`s forward (`rollForwardRenewal`)
  before computing alerts; the renderer backfills renewal history on load.
- Closing the window **hides to tray** when
  `preferences.notify.minimizeToTray` is true (default). When false,
  closing quits (Windows/Linux); macOS keeps the app alive per platform
  convention. The tray always resolves the current window.
- Single-instance lock via `app.requestSingleInstanceLock()` — second
  launches focus the existing window.

### Currency conversion

`src/main/fx.ts` fetches rates from `api.frankfurter.dev` (no API key,
no auth) with a 10s timeout. Cached to `{dataDir}/rates.json` and
refreshed when older than 7 days. (Web fetches the same API directly
from the browser, uncached.) The fetcher never throws to the
renderer; on failure it returns the stale cache or null and the UI
falls back to per-currency display. Renderer-side conversion helpers
live in `src/renderer/lib/money.ts` (`formatCurrency`, `convert`,
`sumInto`) and use `Intl.NumberFormat`.

### UI stack

shadcn-style components (Radix primitives + Tailwind +
`class-variance-authority`) under `src/renderer/components/ui/`,
configured via `components.json`. Sidebar-shelled layout in `App.tsx`.
Forms use `react-hook-form` with Zod resolvers; Zod schemas live in
`src/shared/schemas.ts` and are also used to validate CSV/JSON imports.

Other key dependencies:

- `recharts` for dashboard charts (line/donut/bar)
- `cmdk` for the Cmd/Ctrl+K command palette
  (`src/renderer/components/command-palette.tsx`)
- `framer-motion` (installed but not yet wired)
- `@fontsource-variable/inter` for the body font
- `lucide-react` for icons; `sonner` for toasts

### Logo fetching

Returns a data URL (DuckDuckGo icon service, then Google favicon; `image/*`
only, 256KB cap, 5s timeout). Desktop: `src/main/logos.ts`. Web:
`fetch-logo` Edge Function.
Triggered from `useAppData` on subscription add when
`preferences.enableLogoFetch` is true. Off by default.

### AI assistant

Optional bring-your-own-key chat panel powered by OpenRouter. Off by
default; enabled per-user via Settings → AI Assistant.

- **Key storage**: `src/main/aiCredentials.ts` wraps Electron's
  `safeStorage`. The OpenRouter API key is encrypted at rest by the
  OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on
  Linux) and persisted to `{userData}/ai-credentials.bin` — never to
  `subs-manager.json` and never to any export. **The plaintext key
  lives only in main-process memory. The renderer never receives it on
  any IPC path** — there is deliberately no `aiGetKey` method in `IpcApi`.
- **Web key storage**: Supabase Vault (`openrouter:<uid>`), via
  SECURITY DEFINER SQL helpers called only from Edge Functions
  (`ai-set-key`, `ai-has-key`, `ai-clear-key`, `ai-chat`).
- **Chat endpoint**: desktop `src/main/ai.ts`, web `ai-chat` Edge
  Function; both POST (streaming) to
  `https://openrouter.ai/api/v1/chat/completions`. Desktop uses a 30s
  first-byte timeout plus a 30s idle timeout that resets per chunk. Never
  throws to the renderer — wraps errors into `{ ok: false, error }`.
- **Tool args** are Zod-validated; update patches may only touch the
  fields the confirm card displays.
- **Tool surface**: defined in `src/renderer/features/ai/tools.ts`.
  Phase 1 is read-only (`read_summary`, `read_subscriptions`,
  `read_purchases`, `read_categories`). Phase 2 will add mutation
  tools that pause for user Approve/Reject via a confirm card.
- **System prompt** lives in
  `src/renderer/features/ai/systemPrompt.ts`. It explicitly bounds
  the assistant to this app's data and instructs it to decline
  off-topic requests.
- **Cached `hasKey`**: `Preferences.aiAssistant.hasKey` is a UI hint
  (so the floating button can render without an IPC round-trip).
  Reconciled at every `loadData()` (desktop: key-file existence check, no
  decrypt; web: `ai-has-key`).

### Distribution

electron-builder produces `.exe` (NSIS) for Windows and `.dmg` for
macOS — config in `electron-builder.yml`. App icon
(`build/icon.png`) and tray icon (`build/tray-icon.png`) are both
generated by PowerShell scripts under `scripts/`.

Web: `Dockerfile` builds `dist/web` (`VITE_*` vars are build args) and
serves it with nginx (`docker/nginx.conf`, `docker/security-headers.conf`
— CSP, HSTS, frame-deny). Works on any Docker host (README covers
Coolify). Edge Function secrets are set with `supabase secrets set`, never
in the repo. Backend setup steps: `supabase/README.md`.

**Open-source hygiene**: no personal/deployment identifiers in tracked
files — domains, legal URLs, project refs, and emails come from env vars
or Vault (`VITE_PRIVACY_URL`, `VITE_TERMS_URL`, `ALLOWED_ORIGINS`,
`OPENROUTER_REFERER`, Vault `project_url`). Legal pages under `docs/` are
gitignored.

---

## Web / PWA target

- **Entry**: `src/web/main.tsx` sets `window.platform = 'web'` and
  `window.api = makeWebApi(supabase)`, then wraps `<App/>` in
  `<AuthGate>` (`src/web/auth/`). Email+password auth, session in
  localStorage.
- **Data**: Postgres tables mirror `AppData` (`categories`,
  `subscriptions`, `subscription_renewals`, `one_time_purchases`,
  `cancellation_log`, `preferences`, `push_subscriptions`, plus
  server-only `rate_limits`). PK is `(user_id, id)`; every table has an
  owner-only RLS policy. Row↔type mapping lives in
  `src/web/api/mappers.ts`. `saveData` diffs against the last-saved
  snapshot and upserts/deletes per table (not transactional).
- **Schema changes** need a new migration in `supabase/migrations/`
  *and* updates to `mappers.ts`, `types.ts`, and `schemas.ts`.
- **Edge Functions** (`supabase/functions/`): `ai-chat`, `ai-set-key`,
  `ai-has-key`, `ai-clear-key`, `fetch-logo`, `delete-account`,
  `scheduled-notify`. `verify_jwt = false`; each function authenticates
  itself via `_shared/util.ts:getUserId`. CORS allow-list via
  `ALLOWED_ORIGINS`. Rate-limited through the `rate_take` SQL helper.
- **Reminders**: pg_cron calls `scheduled-notify` every 6 h (cron secret
  in Vault) and sends Web Push; `fired_alerts` is server-owned.
- **PWA**: `vite-plugin-pwa` (injectManifest), service worker at
  `src/web/pwa/sw.ts` — network-first app shell, never caches Supabase
  responses, handles `push`.
- **Unsupported on web** (stubbed/hidden via `isWeb()`): data directory,
  local backups, tray/minimize-to-tray.
- **SECURITY DEFINER functions** in `public` must revoke EXECUTE from
  `anon` and `authenticated` explicitly — `revoke ... from public` alone
  does not remove Supabase's default grants.

---

## Always-on rules (auto-loaded)

@.claude/rules/extension-decisions.md
@.claude/rules/coding-behavior.md

<!-- The line below is appended by /onboard if you choose Automation or Mixed
     for the project type. Leave the comment in place if your project is
     code-only — it makes re-onboarding deterministic. -->
<!-- AUTOMATION_MODULE: not enabled -->

---

## Design Context

Design strategy and visual system live in two root files (created via the
`impeccable` skill). Read them before any UI/design work:

- **`PRODUCT.md`** — register (product), users, purpose, brand personality
  (minimal & premium), anti-references (loud fintech, AI-slop SaaS, cluttered
  enterprise, over-animated), design principles, and accessibility target
  (WCAG AA + reduced-motion + colorblind-safe).
- **`DESIGN.md`** — the visual system: color tokens, typography, elevation,
  components, and do's/don'ts, extracted from `src/renderer/index.css` +
  `tailwind.config.ts`. Sidecar machine data in `.impeccable/design.json`.

Run `/impeccable <command>` (e.g. `critique`, `audit`, `polish`) for
design work; both files are auto-loaded by that skill.
