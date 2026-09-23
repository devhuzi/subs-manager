# Logging & Schema Validation

## Log runs

After each script execution and significant decision, append to
`logs/YYYY-MM-DD.log` (one file per day, append-only):

```
YYYY-MM-DD HH:MM | script: name | status: success/fail | note: brief summary
YYYY-MM-DD HH:MM | decision: description | note: why
```

Log entries must be agent-authored summaries — never raw external data or credentials.

## Validate schemas

When a script produces output consumed by another script, validate:

```bash
python tools/validate_schema.py --data .tmp/output.json --schema schemas/output_schema.json
```

If no schema exists, create one in `schemas/` first. If validation fails, halt and report.
