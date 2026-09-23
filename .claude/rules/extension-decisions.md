# Extension Decisions — When to Use What

This rule is always loaded. Read it before suggesting any new way to extend
this project (a new file, skill, agent, hook, or rule).

## The five surfaces

Each has a different load timing, trigger, and token cost.

| Surface | Loaded | Triggered by | Token cost | Best for |
|---|---|---|---|---|
| `CLAUDE.md` | Always at start | n/a | High — every turn | Universal facts about the project (commands, gotchas, stack) |
| `.claude/rules/*.md` | Always at start | n/a | High — every turn | Universal behavioral norms (style, error handling, this file) |
| `.claude/skills/*` model-invocable | Description only at start; body when Claude invokes | Claude matches `description` to user intent | Low | Procedures Claude should auto-apply: `commit`, `security-review`, `fix-issue` |
| `.claude/skills/*` user-invocable (`disable-model-invocation: true`) | Description only at start; body when user types `/name` | User types `/skill-name` | Low | Side-effect-bearing or gated procedures: deploy, send-slack, enable-cross-tool |
| `.claude/agents/*.md` | Available to spawn | Claude or user invokes a subagent | Zero in main context | Tasks needing isolation (heavy reads, parallel work) or restricted tools (read-only reviewer) |
| `.claude/hooks/hooks.json` | Listening always | Tool events (PreToolUse, PostToolUse, etc.) | Zero context cost | Deterministic enforcement: lint after Edit, block `rm -rf`, log every tool call |
| Memory (`~/.claude/projects/.../memory/`) | Indexed, retrieved on relevance | User asks Claude to recall | Low | Cross-session learning about the user (preferences, role, validated approaches) |

## Decision tree

Ask in order. Stop at the first match.

1. **Fact about the project, true on every turn?** → CLAUDE.md
   (commands, tech stack, deploy targets, "we use X not Y")

2. **Behavioral norm that applies to all work in this repo?** → `.claude/rules/*.md`
   (coding style, error-handling protocol, "always run tests after edits")

3. **Procedure Claude should auto-run when it recognises the situation,
   no destructive side effects?** → `.claude/skills/*` (model-invocable)
   (security-review, fix-issue, refactor-X)

4. **Procedure with irreversible side effects (sends, writes, deploys)
   or that you want gated behind explicit user intent?** → `.claude/skills/*`
   with `disable-model-invocation: true`
   (commit, deploy, send-email, enable-cross-tool)

5. **Work needing isolation — fresh context, restricted tools, parallel
   execution, or a dedicated model — and is Claude-internal (not user-facing)?**
   → `.claude/agents/*.md`
   (code-reviewer with read-only tools; test-runner that hammers the suite
   without polluting main context)

6. **Must fire deterministically regardless of what Claude wants to do?**
   → `.claude/hooks/hooks.json`
   (lint after every Edit, block dangerous bash, auto-format on Write)

7. **About the user — role, preferences, things they corrected Claude on?**
   → memory (auto-managed by the harness, not files in this repo)

## Common confusions, settled

- **Skill vs slash command (`.claude/commands/`)**: skills replaced commands.
  `commands/` still works but skills are the modern form. Don't put new things
  under `commands/`.
- **Skill vs subagent**: skill = a procedure Claude follows in its own
  context. Subagent = a separate Claude instance with isolated context. Use a
  subagent when isolation matters (large reads, restricted tools, parallel
  work) or to keep the main thread clean.
- **Subagent vs hook**: subagent runs when invoked; hook runs on every
  matching event. "Always after Edit, run lint" → hook. "When I ask for a
  review" → skill or subagent.
- **CLAUDE.md vs rules file**: both load at start. Convention: CLAUDE.md is
  the entry point with high-level facts and pointers; `.claude/rules/*.md`
  are domain-specific protocols CLAUDE.md links to. Keeps CLAUDE.md scannable.
- **Skill at project level vs user level**: project (`.claude/skills/`) ships
  with the repo. User (`~/.claude/skills/`) is personal across all projects.
  Behavioral skills (skill-creator, personal style) → user level. Project
  procedures (deploy this repo, fix-issue against this tracker) → project level.

## Project decisions: onboarding vs skill

Two types of decisions, two homes.

- **Project-type fundamentals** (code vs automation, caution-vs-speed bias,
  deliverable mode) → handled inline by `/onboard`. Shape the always-on rules
  Claude reads. Set once. Rare to retrofit.
- **Additive, reversible features** (cross-tool support for Codex/Cursor/Gemini,
  dev-tooling toggles) → user-invocable skills. Same skill works at onboarding
  (called by the wrapper) and mid-project (called directly). Idempotent and
  reversible.

Canonical examples: automation module = onboarding-only. Cross-tool support
= skill-based.
