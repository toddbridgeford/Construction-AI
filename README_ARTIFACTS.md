# Construction AI Artifact Layer

## Generated artifacts

The operational layer emits market-scoped files under `dist/artifacts/<market>/`:

- `bid_calendar_latest.json` — deterministic bid-date projections for each project based on explicit procurement fields first, then controlled stage-based fallbacks.
- `contacts_latest.json` — normalized project contact rollup with confidence scoring derived only from available contact evidence.
- `ci_checklist_latest.pdf` — executive checklist PDF generated from `templates/ci_checklist_<market>_polyiso.json`.

## Local execution

From repository root:

```bash
node scripts/build_artifacts_latest.mjs
python scripts/build_ci_checklist_pdf.py denver
python scripts/validate_json_schemas.py
```

Requirements:

- Node.js 20+
- Python 3.11+
- Python packages: `reportlab`, `jsonschema`

## CI behavior

GitHub Actions workflow `.github/workflows/build_artifacts_latest.yml` runs on:

- Manual dispatch (`workflow_dispatch`)
- Weekday cron (`0 14 * * 1-5`, UTC)

Workflow sequence:

1. Build JSON artifact feeds from `dist/projects/<market>/projects_latest.json`.
2. Build Denver CI checklist PDF from template.
3. Validate project, signal API, artifact, and checklist JSON with Draft 2020-12 schemas.
4. Commit and push `dist/artifacts/**` changes to `Predictive-Model` when artifacts changed.

Validation errors fail the job immediately.

## Artifact persistence rules

- `dist/artifacts/**` is treated as generated-but-versioned output for downstream consumers.
- Artifact generation is deterministic: identical inputs produce identical JSON ordering and values.
- Unknown inputs are never fabricated; missing values remain `null` with low-confidence annotations.
- Only workflow-approved scripts should mutate files inside `dist/artifacts/**`.
