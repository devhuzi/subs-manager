# Product

## Register

product

## Users

Individuals tracking the tools, subscriptions, and one-time purchases they pay
for, primarily for personal use (with an eye toward eventual public
distribution). They're cost-conscious and privacy-conscious: the app keeps all
data local by default, with no telemetry and no sync, and only reaches the
network for three explicitly opt-in features (weekly FX rates, on-demand service
logos, a bring-your-own-key AI assistant). They use it in short, deliberate
sessions, on desktop (Windows/Mac via Electron) and on a phone (installable web
PWA): adding a subscription, checking what's renewing soon, scanning monthly and
annual cost, and deciding what to cancel.

## Product Purpose

A local-first manager for recurring subscriptions and one-time tool purchases.
It answers four questions well: what am I paying for, how much per month and
per year, what renews next, and where can I cut. Success is a person opening the
app, trusting the numbers immediately, and either acting (add / cancel / get
reminded) or closing it reassured, in under a minute.

## Brand Personality

Minimal and premium. The interface should feel like a considered, quality tool:
restrained, confident, and quiet, with generous breathing room and careful
typography rather than decoration. It earns trust the way good financial tools
do, by being precise and legible, not by being flashy. Tone in copy is plain and
specific (no hype, no buzzwords). When everything is fine it stays calm; it only
raises its voice for things that genuinely matter, like an overdue or imminent
renewal.

## Anti-references

- **Loud crypto/fintech**: neon gradients, glowing charts, hype framing,
  trading-app theatrics. Money here is calm, not adrenaline.
- **Generic AI-slop SaaS**: cream/sand body backgrounds, tiny tracked-uppercase
  eyebrows over every section, identical icon + heading + text card grids,
  gradient text. The cross-project monoculture look.
- **Cluttered enterprise dashboards**: dense gray admin panels with everything on
  one screen and no hierarchy.
- **Over-animated / playful / gamified**: bounce and elastic motion, mascots,
  confetti, badges. Too casual for personal finance.

## Design Principles

- **Numbers you can trust at a glance.** Money is the product. Totals are
  accurate, converted consistently to one display currency, tabular-aligned, and
  honest: never fabricate a trend or metric the data can't support (hide it
  instead).
- **Calm by default, loud only when it matters.** Reserve color and emphasis
  (warning amber, destructive red, urgency) for states that are genuinely
  time-sensitive. Everything else stays neutral and quiet.
- **Earn every element.** Minimal and premium means subtraction. No decoration,
  no card-for-its-own-sake, no motion that doesn't clarify a change of state.
- **Private by design, and it shows.** The local-first, no-telemetry stance is a
  feature; the UI never nags for accounts or pushes the network. Opt-in features
  read as optional, off by default.
- **One system across every surface.** Desktop, mobile, and web share the same
  token system and components; the two layout variations and the brand-color /
  light-dark choices are reskins of one consistent structure, never two
  different apps.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**: body text ≥ 4.5:1 contrast, large/bold text ≥ 3:1,
  across light and dark modes and every layout variation and brand color.
- **Honor `prefers-reduced-motion`**: the framer-motion entrances, count-ups, and
  list transitions need a crossfade/instant fallback under reduced motion.
- **Colorblind-safe status**: never rely on hue alone for success/warning/overdue;
  pair color with icon, label, or position (e.g. the urgency dot + text label on
  upcoming renewals).
