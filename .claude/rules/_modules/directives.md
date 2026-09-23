# Directive Lifecycle & Standards

## Lifecycle states

- `draft` — not yet validated; agent may run it but must flag draft status in output.
- `stable` — validated through successful runs; promoted by user explicitly.
- `deprecated` — agent must refuse to run it and redirect to the replacement ID in
  `decision_log`.

## `depends_on` enforcement

Before executing a directive, verify each dependency's expected output exists in `.tmp/`.
If missing, run the dependency first. If it fails, stop and report.

## Directive conflict

If two directives contradict each other, surface the conflict to the user with both
directive IDs. CLAUDE.md universal rules always override any directive.

## Skills mirroring

`.agents/skills/` and `.claude/skills/` must always stay in sync. Mirror any `SKILL.md`
change to both locations immediately.
