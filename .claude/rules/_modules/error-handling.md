# Error Handling — Self-Annealing Protocol

When a script breaks:

1. Read the full error message and stack trace.
2. Classify the error:
   - **Local/fixable** (syntax error, wrong arg, bad JSON path): fix autonomously,
     up to 3 attempts.
   - **Environmental** (missing credentials, HTTP 401/403, missing `.env` var):
     do not retry — surface to user immediately.
   - **Rate limit** (HTTP 429): backoff 5s → 15s → 60s, then escalate if still failing.
   - **External side effect** (fix would re-trigger an email, sheet write, API mutation):
     confirm with user before re-executing.
3. Fix the script (targeted fix only — confirm with user before a full rewrite).
4. Test the fix.
5. Append to the directive's `decision_log`: what broke, what changed, what was learned.
6. Append a one-line entry to `logs/YYYY-MM-DD.log`.

**Hard stop:** After 3 failed attempts on the same error, stop and report to the user.
