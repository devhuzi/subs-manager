# Automation / Ops Module

This module loads only when the project is automation-flavored. The
onboarding flow imports it from CLAUDE.md via:

```
@.claude/rules/_modules/automation-ops.md
```

If your project is pure code (web app, library, CLI tool), this file
should NOT be imported — its rules don't apply. Code-only projects get
the leaner default ruleset.

When it loads, it pulls in three companion files plus the workflow rules
below. Read them all in order:

1. `@.claude/rules/_modules/directives.md` — directive lifecycle and
   dependency enforcement
2. `@.claude/rules/_modules/error-handling.md` — self-annealing protocol
   for script failures
3. `@.claude/rules/_modules/logging.md` — daily log format and schema
   validation

@.claude/rules/_modules/directives.md
@.claude/rules/_modules/error-handling.md
@.claude/rules/_modules/logging.md

## Workflow rules (automation projects only)

### `.tmp/` partial-file pattern

Scripts write output to `.tmp/filename.partial.json` during execution and
rename to `.tmp/filename.json` on success. Any `.partial` file at session
start is incomplete work from a prior session — investigate before
deleting.

### Push complexity into scripts

Don't do manually what a script can do. Build a tool, run the tool, log
the run. Manual one-off bash commands are not reproducible.

### Network scripts require `--timeout`

Default 30s. No script that hits an external API or service should be
able to hang indefinitely.

### Required directories for automation projects

These are scaffolded by `/onboard` when the project type is automation:

```
tools/                  # scripts that produce JSON outputs
schemas/                # JSON schemas for tool outputs
logs/                   # daily run logs (logs/YYYY-MM-DD.log)
.tmp/                   # transient outputs (gitignored)
```

If any are missing in an automation-flavored project, create them before
running directive-driven work.

## When in doubt

If a rule in this module conflicts with a rule in `.claude/rules/`
(always-on), the always-on rule wins. Surface the conflict to the user.
