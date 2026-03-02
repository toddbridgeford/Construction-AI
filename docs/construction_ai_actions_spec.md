# Construction AI Actions Spec

## 1) GitHub Connector — Canonical Data Plane

### Source-of-truth and access rules
- GitHub is authoritative for all runtime reads.
- Always prefer `*_latest.json` variants when present.
- Never fabricate missing files or missing field values.
- If an expected file is missing, return:
  - `missing_path`
  - `expected_path`
  - `fallback_path` (next best canonical path)

### Allowed read paths (required)
- `dist/**`
- `schemas/**`

### Canonical read targets
- `dist/projects/<market>/projects_latest.json`
- `dist/projects/<market>/awards_latest.json`
- `dist/projects/<market>/decisions_latest.json`
- `dist/projects/<market>/radius_latest.json`
- `dist/markets/<market>/signal_api_latest.json`
- `signal_api_latest.json` (national)
- `schemas/projects_schema.json`
- `schemas/signal_api_schema.json`
- `schemas/artifacts_schema.json`
- `schemas/ci_checklist_schema.json`

### Optional write paths (feature-flagged)
- `dist/artifacts/<market>/bid_calendar_latest.json`
- `dist/artifacts/<market>/contacts_latest.json`
- `dist/artifacts/<market>/ci_checklist_latest.json`
- `dist/artifacts/<market>/ci_checklist_latest.pdf`

### Strict write constraints
- Never write outside `dist/artifacts/**`.
- Never modify source feeds in:
  - `dist/projects/**`
  - `dist/markets/**`

### Market resolution rules
- Normalize markets to lowercase slug.
- Known alias mapping:
  - `Denver` -> `denver`
- Resolution order:
  1. Explicit market in current user request.
  2. Last referenced market in conversation state.
  3. Default market policy:
     - use `national` for macro outputs,
     - for project-scoped outputs, request market only when strictly required.

### Error handling and fallback behavior
- Missing file response contract:
  - `error_type: "missing_file"`
  - `missing_path`
  - `expected_path`
  - `fallback_path`
  - `action_required`
- Schema validation failure response contract:
  - `error_type: "schema_validation_failed"`
  - `file_path`
  - `field_path`
  - `expected`
  - `found`
  - `blocking: true`
- Block artifact generation after schema failure unless user explicitly says: `proceed anyway`.

---

## 2) Code Interpreter — Artifact Engine Implementation Plan

### Operational rules
- Validate all JSON inputs against schemas before downstream processing.
- Never infer addresses, permit/case IDs, contacts, or bid dates.
- Label every derived value as `estimated` and every source-backed value as `observed`.
- Keep response layout deterministic:
  - table-first rendering,
  - max one chart per response unless user requests more.
- Always produce downloadable artifacts in-chat.

### Python module outline
- `actions/io_layer.py`
  - repository reads/writes, path policy enforcement, market slug resolution
- `actions/schema_validation.py`
  - schema loading + JSON validation + structured error reporting
- `actions/bid_calendar.py`
  - bid calendar builder from project feed
- `actions/contacts.py`
  - public contacts directory builder from dataset evidence
- `actions/ci_checklist.py`
  - checklist JSON assembly + PDF rendering
- `actions/charts.py`
  - timeline and histogram generators
- `actions/run_pipeline.py`
  - happy-path orchestration

### Core function contracts

```python
# schema_validation.py
validate_schema(data_path: str, schema_path: str) -> dict
# Returns {"ok": bool, "errors": [{"field_path": str, "expected": str, "found": str}]}
```

```python
# bid_calendar.py
build_bid_calendar(projects_path: str, output_path: str) -> dict
# Emits bid_calendar_latest.json with fields:
# project_id, project_name, address, case_or_permit_id, stage,
# observed_milestones[] {name, date, url},
# bid_window_estimated {start_date, end_date} (only if stage exists),
# confidence, verification_url
```

```python
# contacts.py
build_contacts(projects_path: str, output_path: str) -> dict
# Emits contacts_latest.json with fields:
# entity_name, role, contact_name, title,
# email_public, phone_public, source_url, confidence
```

```python
# ci_checklist.py
build_ci_checklist_pdf(checklist_json_path: str, pdf_output_path: str, market: str) -> dict
# Uses existing ci_checklist_latest.json if present,
# else generates JSON from schemas/ci_checklist_schema.json template,
# then writes ci_checklist_latest.pdf titled:
# "Denver CI Pursuit Checklist — Polyiso Lens"
```

```python
# charts.py
build_charts(bid_calendar_path: str, chart_output_path: str, chart_type: str = "timeline") -> dict
# chart_type="timeline" -> bid window timeline chart
# chart_type="histogram" -> days-to-bid histogram only when >= 8 projects
```

### Exact output artifacts and save locations
- Local in-session outputs (always generated for download):
  - `./bid_calendar_latest.json`
  - `./contacts_latest.json`
  - `./ci_checklist_latest.json`
  - `./ci_checklist_latest.pdf`
  - optional chart image: `./bid_window_timeline.png` or `./days_to_bid_histogram.png`
- Optional GitHub persistence target (if enabled):
  - `dist/artifacts/<market>/bid_calendar_latest.json`
  - `dist/artifacts/<market>/contacts_latest.json`
  - `dist/artifacts/<market>/ci_checklist_latest.json`
  - `dist/artifacts/<market>/ci_checklist_latest.pdf`

---

## 3) Single Happy Path Runbook (Denver)

### Sequence
1. Resolve market slug:
   - input `Denver` -> `denver`
2. Read source project feed:
   - `dist/projects/denver/projects_latest.json`
3. Validate source feed:
   - schema `schemas/projects_schema.json`
4. Build bid calendar artifact:
   - output `./bid_calendar_latest.json`
5. Build contacts artifact:
   - output `./contacts_latest.json`
6. Build CI checklist artifacts:
   - preferred input: `dist/artifacts/denver/ci_checklist_latest.json` (if present)
   - fallback template seed: `schemas/ci_checklist_schema.json`
   - outputs:
     - `./ci_checklist_latest.json`
     - `./ci_checklist_latest.pdf`
7. Optional persistence back to GitHub (if enabled):
   - write all outputs only under `dist/artifacts/denver/`

### Happy-path pseudo-code

```python
market = resolve_market("Denver", last_market)
projects = read_json(f"dist/projects/{market}/projects_latest.json")
assert validate_schema(projects, "schemas/projects_schema.json")["ok"]

bid_calendar = build_bid_calendar(
    projects_path=f"dist/projects/{market}/projects_latest.json",
    output_path="./bid_calendar_latest.json"
)

contacts = build_contacts(
    projects_path=f"dist/projects/{market}/projects_latest.json",
    output_path="./contacts_latest.json"
)

checklist_path = first_existing([
    f"dist/artifacts/{market}/ci_checklist_latest.json"
])
local_checklist_path = "./ci_checklist_latest.json"
if checklist_path:
    assert validate_schema(checklist_path, "schemas/ci_checklist_schema.json")["ok"]
    write_file(checklist_path, local_checklist_path)
    checklist_source_for_persistence = checklist_path
    checklist_path = local_checklist_path
else:
    checklist_path = generate_checklist_from_schema_template(
        "schemas/ci_checklist_schema.json",
        output_path=local_checklist_path
    )
    checklist_source_for_persistence = checklist_path

build_ci_checklist_pdf(
    checklist_json_path=checklist_path,
    pdf_output_path="./ci_checklist_latest.pdf",
    market="Denver"
)

if persistence_enabled:
    write_file("./bid_calendar_latest.json", f"dist/artifacts/{market}/bid_calendar_latest.json")
    write_file("./contacts_latest.json", f"dist/artifacts/{market}/contacts_latest.json")
    write_file(checklist_source_for_persistence, f"dist/artifacts/{market}/ci_checklist_latest.json")
    write_file("./ci_checklist_latest.pdf", f"dist/artifacts/{market}/ci_checklist_latest.pdf")
```

### Required checklist sections in CI PDF
- Project Intake
- Code Path
- Assembly Selection
- NFPA 285 Trigger Matrix
- Fastening / Thermal Bridging
- Submittals
- QA / Inspection
- VE Defense
- Decision Gates
