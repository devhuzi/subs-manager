---
name: Tools & Subs Manager
description: A calm, local-first manager for subscriptions and one-time tool purchases.
colors:
  ink: 'hsl(222 25% 12%)'
  paper: 'hsl(40 24% 98%)'
  surface: 'hsl(0 0% 100%)'
  indigo: 'hsl(243 75% 59%)'
  indigo-ink: 'hsl(0 0% 100%)'
  muted: 'hsl(220 14% 96%)'
  muted-ink: 'hsl(220 10% 42%)'
  border: 'hsl(220 13% 91%)'
  success: 'hsl(142 71% 35%)'
  success-ink: 'hsl(142 72% 27%)'
  warning: 'hsl(38 92% 48%)'
  warning-ink: 'hsl(38 95% 30%)'
  destructive: 'hsl(0 72% 50%)'
  destructive-ink: 'hsl(0 72% 42%)'
typography:
  display:
    fontFamily: 'Inter Variable, system-ui, -apple-system, sans-serif'
    fontSize: '2.25rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv11', 'ss01'"
  label:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    letterSpacing: '0.04em'
rounded:
  sm: '0.375rem'
  control: '0.5rem'
  lg: '0.75rem'
  card: '1.25rem'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.indigo-ink}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
    height: '2.5rem'
  button-secondary:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
    height: '2.5rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.muted-ink}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
    height: '2.5rem'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '1.25rem'
  stat-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '1rem'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  pill-segmented:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-ink}'
    rounded: '{rounded.full}'
    padding: '0.375rem 0.75rem'
  trend-pill-up:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.destructive-ink}'
    rounded: '{rounded.full}'
    padding: '0.125rem 0.5rem'
  trend-pill-down:
    backgroundColor: '{colors.success}'
    textColor: '{colors.success-ink}'
    rounded: '{rounded.full}'
    padding: '0.125rem 0.5rem'
---

# Design System: Tools & Subs Manager

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

This is the interface of a careful personal accountant, not a trading floor. It
holds money information that people glance at in short, deliberate sessions, so
its whole job is to be legible and trustworthy at a glance and to disappear
otherwise. The surface is a warm off-white paper (`hsl(40 24% 98%)`) carrying
flat white cards; a single indigo accent (`hsl(243 75% 59%)`, user-overridable
as a brand color) does all the pointing. Everything else is ink, muted gray, and
generous space. The same structure renders on desktop (Electron), a phone (web
PWA), and two pickable layout variations (Default / Crisp), so the system is a
set of tokens and components reskinned, never two different apps. (The earlier
Aero and Calm variations were retired; stored `glass` / `notion` values are read
back as Default.)

Minimal and premium here means subtraction. Numbers are tabular and aligned;
type carries the hierarchy through weight and scale, not decoration. The palette
stays quiet until something is genuinely time-sensitive, at which point amber and
red earn their loudness. The system explicitly rejects the loud crypto/fintech
look (neon gradients, glowing charts), the generic AI-slop SaaS look (cream-sand
body with tracked-uppercase eyebrows over every section, identical icon-card
grids, gradient text), cluttered gray enterprise density, and gamified bounce.

**Key Characteristics:**

- Warm-neutral paper background, flat white cards, one indigo accent.
- Tabular numerals everywhere money lives; numbers never lie or get fabricated.
- Hierarchy from weight + scale, not borders, stripes, or color.
- Calm at rest; color reserved for real urgency (renewals, overdue, destructive).
- One token system across Electron, web PWA, and both layout variations.

## 2. Colors

A restrained tinted-neutral palette with a single indigo accent; semantic colors
appear only for state.

### Primary

- **Signal Indigo** (`hsl(243 75% 59%)`): The one accent. Primary buttons, active
  nav, focus rings, selection, and the active segmented pill. Never a
  decorative gradient surface.
  User-overridable via the brand-color picker; whatever the brand color, it
  remains the only chromatic voice on a resting screen. The picker's default chip
  is `#6366F1`; an unset brand color falls back to this CSS token. A custom
  brand color is stored once and rendered as two variants (`--brand`,
  `--brand-dark`): its lightness is lowered for light mode / raised for dark
  mode until it clears 4.5:1 against that mode's background
  (`brandVariant()` in `lib/colors.ts`). Presets are Indigo, Violet, Blue and
  Slate; green, amber and red are not offered because they are state colors.

### Neutral

- **Ink** (`hsl(222 25% 12%)`): Primary text. Near-black with a faint blue cast,
  never pure `#000`.
- **Paper** (`hsl(40 24% 98%)`): The app background. A warm off-white, never pure
  white and never a saturated cream.
- **Surface** (`hsl(0 0% 100%)`): Card and popover fill. Pure white lifts a hair
  above paper without a shadow.
- **Muted** (`hsl(220 14% 96%)`): Secondary button fills, inactive pills, the
  sidebar surface.
- **Muted Ink** (`hsl(220 10% 42%)`): Labels, hints, secondary text. Tuned to
  ~4.7:1 on both paper and surface so it clears AA as small text (the earlier
  46% sat just under 4.5:1 on the paper background).
- **Border** (`hsl(220 13% 91%)`): Hairline borders and dividers, very low
  contrast by design.

### Tertiary (semantic state only)

Each semantic role has two values: a **bright fill** (dots, icons, borders, badge
backgrounds) and a darker **`-ink`** variant for use as small text, because the
bright fills fail AA as text on light surfaces (amber ~2.3:1, green ~3.6:1). In
dark mode the `-ink` variants invert to lighter shades. Always pair with an icon
or label, never hue alone.

- **Success Green** — fill `hsl(142 71% 35%)`, ink `hsl(142 72% 27%)`: Positive
  trend pills, "paid off", confirmations, savings totals.
- **Warning Amber** — fill `hsl(38 92% 48%)`, ink `hsl(38 95% 30%)`: Renewals and
  trials 3–7 days out; near-budget (≥80%).
- **Destructive Red** — fill `hsl(0 72% 50%)`, ink `hsl(0 72% 42%)`: Overdue and
  0–2 days, delete actions, spending-up trend pills, over-budget.

### Renewal urgency

One helper decides it everywhere (`renewalUrgency(days)` +
`renewalLabel(days, date)` in `features/subscriptions/renewals.ts`, rendered by
`<RenewalWhen>`): **overdue** (passed; red ink + alert icon, "Overdue · Sep 20"),
**imminent** (0–2 days; red dot, "Today" / "Tomorrow" / "In 2 days · Sep 25"),
**soon** (3–7 days; amber dot), **later** (8+ days; neutral dot). The words
always carry the meaning, so it survives color blindness.

### Chart palette

A categorical set, `--chart-1` … `--chart-6` (light and dark values in
`index.css`, Tailwind `chart-1..6`): indigo, blue, violet, slate, mauve, teal.
It deliberately avoids the red / amber / green state hues. A category's own
color wins when it has one; uncolored categories use the palette (or
`--chart-4` slate for a badge dot). Single-series charts (spend over time, top
expenses) use one color, the brand accent: bar length carries the comparison,
never hue.

### Named Rules

**The One Voice Rule.** A resting screen has exactly one chromatic accent: the
brand indigo. Success / warning / destructive are state colors, not decoration;
if green, amber, and red all appear at once with nothing urgent happening, the
screen is shouting. Remove until only the truly time-sensitive thing is colored.

**The Fill-vs-Text Rule.** A bright semantic color is for fills, dots, icons, and
borders, never for small text. Colored text routes through the darker `-ink`
token so it clears 4.5:1. If you reach for `text-warning` on a label, you want
`text-warning-ink`.

**The Dark-Mode Parity Rule.** Every token has a `.dark` value and both layout
variations layer on top. A color choice isn't done until it clears AA in light
**and** dark across both variations and a custom brand color.

## 3. Typography

**Display / Body Font:** Inter Variable (with `system-ui`, `-apple-system`
fallback), tuned with `font-feature-settings: 'cv11', 'ss01'`.
**Numerals:** Inter `tnum` tabular figures everywhere money is shown.
Single family everywhere; no serif variant.

**Character:** One well-tuned humanist sans doing all the work, hierarchy carried
by weight (400 to 600) and scale rather than by mixing typefaces. Tight tracking
on large headings; tabular numerals keep money columns honest.

### Hierarchy

- **Display** (600, 2.25rem / `text-4xl`, line-height 1, -0.02em): The dashboard
  monthly-cost figure only. One per screen.
- **Page title** (600, 1.5rem / `text-2xl`): the single `<h1>` in the page
  header, one per view.
- **Headline** (600, 1.5rem / `text-2xl`, -0.01em): Card titles, section heads.
- **Title** (600, 1.125rem / `text-lg`): Widget titles, dialog titles.
- **Body** (400, 0.875rem / `text-sm`, line-height 1.5): Default copy and table
  cells. Cap prose blocks at 65–75ch.
- **Label** (400–500, 0.875rem / `text-sm`, muted ink, sentence case): stat
  labels, `<dt>` terms, table headers. No tracked uppercase eyebrows.
- **Caption** (0.75rem / `text-xs`): the smallest size in use. No arbitrary
  `text-[10px]` / `text-[11px]`.

### Named Rules

**The Tabular Money Rule.** Any element rendering an amount carries
`font-variant-numeric: tabular-nums`. Money that shifts column width as digits
change reads as sloppy in a finance tool.

## 4. Elevation

Flat by default with tonal layering, not a shadow-driven system. Depth comes from
the paper-to-white step (background to card) and hairline borders, with a single
soft `shadow-sm` on cards. The variations adjust this deliberately: **Crisp**
removes shadows entirely (borders carry everything). The only genuinely lifted
elements are the floating bottom tab bar, the mobile add button and the AI
panel, which use `shadow-lg`/`shadow-2xl` because they sit above content.

### Shadow Vocabulary

- **Resting card** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.05)` / `shadow-sm`):
  Barely-there lift of white cards off paper. Removed entirely in Crisp.
- **Floating chrome** (`shadow-lg` / `shadow-2xl`): Bottom tab bar, AI side panel,
  popovers. Reserved for things that float above the scroll plane.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Real elevation is for
elements that genuinely float over content (bottom nav, panels, popovers), not
for ordinary cards. If a card needs a heavy shadow to feel separate, the
paper/surface tonal step or a hairline border is the right tool instead.

## 5. Components

### Buttons

- **Shape:** Gently rounded: `--radius` (`0.5rem`, `rounded-md`) — tightens to
  `0.25rem` in Crisp. The radius scale is one ladder off that token:
  `rounded-sm` = radius − 2px (menu items, kbd), `rounded-md` = radius
  (buttons, inputs, selects, tooltips), `rounded-lg` = radius + 4px (panels,
  dropdowns, inset boxes), `--radius-card` (`1.25rem`) for cards and the
  mobile sheet's top corners, `rounded-full` for pills and avatars' chips.
- **Primary:** Indigo fill, white text (`bg-primary text-primary-foreground`),
  `0.5rem 1rem` padding, 2.5rem tall. Hover drops to 90% opacity.
- **Secondary / Ghost / Outline:** Muted fill, transparent-with-hover, and
  hairline-bordered respectively. Ghost is the default for icon actions in rows.
- **Hover / Focus:** Color transition only; no transform on buttons.
- **Focus ring (all interactive elements):** Every focusable control, including
  the custom ones (bottom-nav tabs, the mobile "+", segmented pills, sidebar
  items, swatches, chips, row name buttons), carries a visible `focus-visible`
  ring: 2px `ring-ring`, with a 2px offset on neutral surfaces. Keyboard users
  must always see where focus is. Toggle chips and swatches expose
  `aria-pressed`; filter pills are a `role="group"` of pressed buttons.

### Chips / Pills

- **Segmented filter pills:** Rounded-full toggle group; inactive is muted fill +
  muted ink, active fills with the brand accent + white. Used for small fixed
  filter sets (subscription status). Variable-length sets use a `<select>`
  instead.
- **Trend pill:** Rounded-full, low-alpha success/destructive tint with a matching
  up/down arrow and a tabular percentage in the `-ink` text shade (AA on the
  tint). Hidden when the data can't support a real trend.
- **Category badge:** Small rounded tag carrying a category's own color.

### Cards / Containers

- **Corner Style:** `1.25rem` (`--radius-card`), shared by every card via the base
  `Card` so charts, stat tiles, and list cards never disagree on radius.
- **Background:** White surface on paper.
- **Shadow Strategy:** `shadow-sm` at rest (see Elevation); never nested cards.
- **Border:** Hairline `border` at low contrast.
- **Internal Padding:** `1rem`–`1.25rem` (stat tiles `p-4`/`p-5`), `1.5rem` for
  content-heavy cards.

### Inputs / Fields

- **Style:** Background fill, hairline border, `--radius` (`rounded-md`).
- **Sizing:** 44px tall with 16px text on mobile (`h-11 text-base`) so iOS
  doesn't zoom on focus and the target is thumb-friendly; 40px / 14px on desktop
  (`sm:h-10 sm:text-sm`). Same rule for select triggers.
- **Focus:** 2px accent ring (`ring-ring`), no glow.
- Forms use `react-hook-form` + Zod; errors render inline beneath the field
  in `text-destructive-ink` (`<FieldError>`), wired with `aria-invalid` +
  `aria-describedby` (`fieldA11y()`).
- **Add/edit subscription:** required fields first (name, cost, currency,
  billing cycle, subscribed since, next renewal — auto-computed from start +
  cycle until edited by hand); everything else behind a "More options"
  disclosure. Currency is a select of ISO codes. Status is not on the form —
  the row switch owns it.

### Dialogs & Sheets

- **Mobile (`<sm`):** Forms and detail views are **bottom sheets** — full-width,
  anchored to the bottom, top corners at `--radius-card`, with a grab handle
  and a slide-up entrance, padded for the home-indicator safe area. Form
  actions sit in a sticky footer (`DialogStickyFooter`) so Save stays in reach.
  The close button is a 44px target.
- **Desktop (`sm+`):** The same content is a centered modal (max-width `lg`),
  fade entrance. One component (`DialogContent`) switches by breakpoint.
- Scrim is `bg-black/60` with a light backdrop blur.
- **Confirmations:** reversible actions (delete, deactivate, bulk edits) act
  immediately and offer Undo in the toast. Irreversible ones (replace-all JSON
  restore, deleting a category in use, reset / account deletion) use the one
  `<ConfirmDialog>`; the last two require typing a word. No `window.confirm`.

### Navigation

- **Desktop (`lg+`):** A 240px left sidebar; active item gets a muted fill and
  full-opacity icon, others are muted ink with a hover fill.
- **Mobile (`<lg`):** A floating "island" bottom tab bar (rounded, lifted) with
  five tabs — Dashboard, Subs, Purchases, Categories, Settings — each an icon
  over a text label; the active tab gets a tinted brand pill behind its icon.
  One floating action only: the round "+" above the bar (bottom-right) that
  adds contextually. Crisp flattens the bar to a flush strip via tokens.
- **Page header:** every view starts with its `<h1>` title; the AI assistant
  button (when enabled) sits at the header's right, not as a floating button.

### Lists

Subscriptions and Purchases share `ListView`: stat row, description + add
button, search/filter toolbar, a card per item below `lg` and a table above.
Clicking a row (or its name button, for keyboard) opens it — details for a
subscription, edit for a purchase; secondary actions live in a `⋯` dropdown.
Checkboxes select rows for bulk actions (deactivate, set category, delete),
each undoable from its toast. Search matches name, notes and payment method.

### Dashboard

Answers three questions, in order:

1. **What do I pay?** The hero: a plain card with the monthly total (display
   size, default currency), the annual figure beneath, and one honest trend
   pill vs last month's runrate (hidden when there's nothing to compare).
2. **What renews next?** Upcoming renewals: next 30 days plus anything
   overdue, 7- and 30-day totals converted to the default currency.
3. **What could I cancel?** "Worth a review": the five largest active
   subscriptions by monthly equivalent, each with its cancellation link (if
   set) and a Deactivate button (undoable).

Trials, spend over time, category split, top expenses, forecast and
cancellation savings follow as detail.

### Trend pill

Spending **up** is bad: destructive tint + ink, ▲ arrow. **Down** is good:
success tint + ink, ▼ arrow. Under ±0.5% reads "No change" in muted. The sign
and arrow carry the meaning without color.

## 6. Do's and Don'ts

### Do:

- **Do** keep one chromatic accent on a resting screen (the brand indigo); let
  success/amber/red appear only for genuine state. _(The One Voice Rule.)_
- **Do** put `tabular-nums` on every amount, and convert all totals to the single
  display currency at the live rate.
- **Do** drive all card corners from `--radius-card` and the nav from its
  tokens, so both variations restyle one consistent structure.
- **Do** pair every status color with an icon, label, or position so it survives
  color blindness (e.g. the urgency dot + text on upcoming renewals).
- **Do** use the `-ink` semantic tokens (`text-success-ink`, `text-warning-ink`,
  `text-destructive-ink`) for colored text; keep the bright fills for dots,
  icons, borders, and badge backgrounds. _(The Fill-vs-Text Rule.)_
- **Do** give every focusable control a visible `focus-visible` ring (it's why
  the custom bottom-nav, pills, chips and swatches all carry one).
- **Do** honor reduced motion: it's enforced globally via
  `<MotionConfig reducedMotion="user">` plus a CSS `prefers-reduced-motion`
  reset, and charts read `useReducedMotion` to switch off Recharts animation. Keep new motion
  inside that contract.
- **Do** present forms and detail views as bottom sheets on mobile and centered
  modals on desktop (the shared `DialogContent` does this); never a desktop
  centered modal cramped onto a phone.
- **Do** keep touch targets ≥44px on coarse pointers (icon buttons expand via
  `[@media(pointer:coarse)]:size-11`; inputs are 44px on mobile) and reuse the
  one `StatCard` for every metric tile, count or currency, so they never drift.
  Stat tiles have no icons: a quiet label and the figure.
- **Do** route every amount through `<Money>` / `formatCurrency` and every total
  through `sumInto` into the default currency.
- **Do** pass `isAnimationActive={!reduceMotion}` to Recharts series.
- **Do** verify muted-ink body text hits 4.5:1 on paper and on the white card,
  in both light and dark, before shipping.

### Don't:

- **Don't** reach for the loud crypto/fintech look: no neon gradients, glowing
  charts, or hype framing. Money here is calm.
- **Don't** ship the generic AI-slop SaaS look: no cream/sand saturated body, no
  tiny tracked-uppercase eyebrow over every section, no identical icon + heading
  - text card grids, no `background-clip: text` gradient text.
- **Don't** build cluttered gray enterprise density: respect hierarchy and space;
  never put everything on one undifferentiated screen.
- **Don't** add bouncy, elastic, or gamified motion (mascots, confetti, badges).
  Ease-out only; reserve motion for clarifying a state change.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent
  stripe on cards, list items, or alerts. Use full borders or a background tint.
- **Don't** nest cards, or lean on heavy shadows to separate ordinary cards; use
  the paper/surface tonal step or a hairline border. _(The Flat-By-Default Rule.)_
- **Don't** use a bright semantic color as small text (`text-warning` ~2.3:1,
  `text-success` ~3.6:1 both fail AA); reach for the `-ink` variant instead.
- **Don't** fabricate a trend or metric the data can't support; hide it instead.
- **Don't** scale buttons on hover or press; color change only.
- **Don't** use a semantic color decoratively (e.g. an amber icon on an annual
  cost tile) or hex colors outside the token system.
