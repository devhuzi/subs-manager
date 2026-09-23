# Contributing

Thanks for helping out. Issues and pull requests are welcome.

## Setup

See [Development](README.md#development) in the README. The desktop app needs
no configuration; the web app needs a Supabase project (see
[Self-hosting the web app](README.md#self-hosting-the-web-app)).

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e   # UI changes — first run: npx playwright install chromium
```

- Keep changes focused; one concern per PR.
- Add or update unit tests for logic changes (`*.test.ts` next to the module).
- UI changes: follow [`DESIGN.md`](DESIGN.md) and include before/after
  screenshots (mobile and desktop).
- New IPC method? Update all five places listed under "IPC contract" in
  [`CLAUDE.md`](CLAUDE.md).
- Schema change? Add a Supabase migration **and** update
  `src/web/api/mappers.ts`, `src/shared/types.ts`, `src/shared/schemas.ts`,
  and `src/main/migrate.ts` if older desktop files need a backfill.
- Never commit secrets. `.env` is gitignored; add new variables to
  `.env.example` with placeholder values.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) style:
`fix(reminders): …`, `feat(ui): …`, `docs: …`.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
