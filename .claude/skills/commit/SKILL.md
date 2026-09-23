---
name: commit
description: Stage and commit current changes with a structured, conventional message. User-invocable only — never auto-fires. Asks for confirmation on the message before running git commit.
disable-model-invocation: true
---

# Commit

User-invocable. The user types `/commit` when they're ready. Never run
this automatically.

## Pre-flight

In parallel:
- `git status` to see what's untracked and modified
- `git diff --staged` and `git diff` to read both halves of the change
- `git log -10 --oneline` to learn the project's commit message style

## Decisions

1. **What to stage**
   - If everything modified is related to one logical change: `git add -A`
     and stage all of it. But do NOT include `.env*`, `*.key`, `*.pem`,
     `secrets/*`, or anything that looks credential-shaped — even if the
     user staged them manually, flag and stop.
   - If changes are mixed: list the files, ask the user which ones go
     in this commit.

2. **Message format**
   - Match the project's existing style (look at `git log`).
   - If no style apparent, default to Conventional Commits:
     `type(scope): subject` followed by a blank line and a body.
   - Subject line: under 72 chars, imperative mood ("add", not "added"),
     no trailing period.
   - Body: explain *why*, not *what*. The diff shows what.
   - Don't reference the current task, AI tooling, or "as requested by".

## Confirmation

Show the user:
- Files to be staged
- Proposed message
- Any warnings (large files, possible secrets, mixed concerns)

Wait for explicit confirmation before running `git commit`.

## Run

```
git add [specific files]
git commit -m "$(cat <<'EOF'
[message]
EOF
)"
git status
```

Verify exit code 0 and the new commit shows in `git status`.

## Handling pre-commit hook failures

If the commit fails due to a hook:
1. Do NOT amend. Hook failure means commit didn't happen.
2. Read the hook output, identify the issue.
3. Fix the underlying issue (lint error, missing test, etc.).
4. Re-stage and create a NEW commit.
5. Never use `--no-verify`.

## What you do NOT do

- Never push. Push is a separate explicit action.
- Never commit `.env`, secrets, credentials, or files that look like them.
- Never use `--no-verify`, `--amend` without explicit user request, or
  `-c commit.gpgsign=false`.
- Never write commit messages that mention Claude, the AI, the prompt,
  or the current task name. The message describes the *change*, not how
  it was made.
