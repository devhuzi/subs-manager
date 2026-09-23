---
name: browser-test
description: Run this app in a real headless browser (Playwright) to SEE the design, screenshot screens, or verify UI behavior visually. Use whenever a task needs a browser — screenshotting the app, checking a layout/responsive/visual change, confirming how something renders across mobile/desktop, light/dark, or the two layout variations (Default/Crisp), or walking a UI flow end-to-end. The web target is auth-gated (Supabase + AuthGate), so this drives a mock-seam harness that renders the real <App/> with seeded sample data and no backend.
---

# Browser testing (Playwright + mock-seam harness)

The app's web build is gated behind auth and needs Supabase, so you can't point a
browser at `npm run dev:web` and see the UI. Instead there's a **harness** that
renders the real renderer `<App/>` against an in-memory `window.api` with seeded
sample data — no Supabase, no Electron, no login. Playwright drives it.

## Layout

- `vite.config.e2e.ts` — serves `e2e/harness` on `http://localhost:5199` with the
  renderer aliases (`@renderer`, `@shared`) and root PostCSS/Tailwind.
- `e2e/harness/{index.html,main.tsx}` — installs `window.api = makeMockApi()` then
  mounts `<App/>` (no `AuthGate`).
- `e2e/mock-api.ts` — full in-memory `IpcApi`. Reads return seeded data; writes
  mutate it (toggles/adds/pref changes persist within a session); side-effects
  (export, logo fetch, AI) are inert stubs.
- `e2e/seed.ts` — the sample `AppData` + `FxRates`. Dates are relative to "now" so
  renewals land in the ≤2d / ≤7d / ≤30d urgency windows. Edit this to change what
  the screens show.
- `e2e/design.spec.ts` — the screenshot suite.
- `playwright.config.ts` — boots the harness via `webServer` automatically.

## Run it

```bash
npm run test:e2e                       # run every spec; screenshots → e2e/screenshots/
npm run test:e2e -- -g "mobile dark"   # one test by name
npm run test:e2e:ui                    # Playwright UI mode (interactive)
npm run e2e:report                     # open the last HTML report
npm run dev:e2e                        # just serve the harness to poke manually
```

The webServer starts on its own; don't run `dev:e2e` separately first unless you
want to inspect by hand. Chromium is installed via `npx playwright install
chromium` (run once if missing).

**To actually SEE a screen:** after a run, `Read` the PNG in `e2e/screenshots/`.
That's the point — view it, judge it, fix the code, re-run, view again.

## Conventions for new checks

Add a `*.spec.ts` under `e2e/`. Reuse the patterns in `design.spec.ts`:

- **Wait for load:** `await expect(page.getByText('Monthly cost', { exact: true })).toBeVisible()`
  then a short `waitForTimeout` so charts settle.
- **Navigate (mobile):** the bottom tab bar is `nav[aria-label="Primary"]` —
  `page.locator('nav[aria-label="Primary"]').getByRole('button', { name: 'Subscriptions', exact: true })`.
  Disambiguates from the desktop sidebar, which is off-canvas but still in the DOM.
- **Settings:** the fifth bottom tab on mobile — `tab(page, 'Settings')`; the sidebar item on desktop.
- **Theme:** `await page.emulateMedia({ colorScheme: 'dark' })` (app theme defaults
  to `system`, so this flips it). **Viewport:** `page.setViewportSize({width,height})`.
- **Layout variations:** Settings → Appearance, click `Default` / `Crisp`, then
  return to the screen you want to capture.

## Gotchas

- The harness has no backend, auth, FX network, logos, or working AI — those are
  stubs. It's for _design/layout/interaction_ verification, not data round-trips.
- `prefers-reduced-motion` isn't emulated by default, so animations run; add a
  `waitForTimeout` before screenshotting, or `page.emulateMedia({ reducedMotion:
'reduce' })` to test the reduced-motion path.
- `e2e/screenshots/`, `test-results/`, and `playwright-report/` are gitignored.
- If a selector is ambiguous (strict-mode violation), scope it to a container or
  add `{ exact: true }`.
