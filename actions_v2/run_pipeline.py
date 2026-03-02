import os
from pathlib import Path
from typing import Any

from .bid_calendar import build_bid_calendar
from .ci_checklist import build_ci_checklist, write_ci_checklist_json, write_ci_checklist_pdf
from .contacts import build_contacts
from .decision_engine import derive_decision
from .geo import evaluate_project_radius
from .io_layer import market_dirs, now_iso, read_json, write_json
from .schema_validation import ValidationErrorRuntime, validate_if_schema_exists
from .scoring import score_project

ROOT = Path(__file__).resolve().parents[1]


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    if isinstance(payload, list):
        return payload
    return []


def _by_project(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result = {}
    for row in rows:
        pid = str(row.get("project_id") or row.get("id") or "")
        if pid:
            result[pid] = row
    return result


def _artifact(artifact_type: str, market: str, generated_at: str, missing_inputs: list[str], items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "artifact_type": artifact_type,
        "market": market,
        "generated_at": generated_at,
        "metadata": {"missing_inputs": sorted(set(missing_inputs))},
        "items": items,
    }


def _load_market_inputs(market_dir: Path) -> tuple[dict[str, Any], list[str]]:
    missing_inputs: list[str] = []
    files = {
        "projects": market_dir / "projects_latest.json",
        "awards": market_dir / "awards_latest.json",
        "decisions": market_dir / "decisions_latest.json",
        "radius": market_dir / "radius_latest.json",
    }
    loaded = {}
    for key, path in files.items():
        loaded[key] = read_json(path)
        if loaded[key] is None:
            missing_inputs.append(str(path.relative_to(ROOT)))

    signal_local = ROOT / "dist" / "markets" / market_dir.name / "signal_api_latest.json"
    signal_national = ROOT / "signal_api_latest.json"
    if not signal_local.exists() and not signal_national.exists():
        missing_inputs.extend([
            str(signal_local.relative_to(ROOT)),
            str(signal_national.relative_to(ROOT)),
        ])
    loaded["signal"] = read_json(signal_local) or read_json(signal_national)
    return loaded, missing_inputs


def process_market(market_dir: Path, blocking_validation: bool) -> dict[str, int]:
    market = market_dir.name
    generated_at = now_iso()
    inputs, missing_inputs = _load_market_inputs(market_dir)
    projects = _items(inputs["projects"])
    awards = _items(inputs["awards"])
    prior_decisions = _items(inputs["decisions"])
    radius_config = inputs["radius"] if isinstance(inputs["radius"], dict) else None

    schemas = {
        "projects": ROOT / "schemas" / "projects_schema.json",
        "artifacts": ROOT / "schemas" / "artifacts_schema.json",
        "radius_eval": ROOT / "schemas" / "radius_eval_schema.json",
        "deal_scoring": ROOT / "schemas" / "deal_scoring_schema.json",
        "derived_decisions": ROOT / "schemas" / "derived_decisions_schema.json",
        "signal": ROOT / "schemas" / "signal_api_schema.json",
        "ci_checklist": ROOT / "schemas" / "ci_checklist_schema.json",
    }

    missing_inputs.extend(validate_if_schema_exists(inputs.get("projects") or {"items": []}, schemas["projects"], blocking=False))
    if inputs.get("signal") is not None:
        missing_inputs.extend(validate_if_schema_exists(inputs["signal"], schemas["signal"], blocking=False))

    awards_map = _by_project(awards)
    radius_rows = [evaluate_project_radius(project, radius_config) for project in projects]
    radius_by_project = _by_project(radius_rows)

    scoring_rows = [score_project(project, radius_by_project.get(str(project.get("project_id") or project.get("id") or "")), awards_map) for project in projects]
    score_by_project = _by_project(scoring_rows)

    decisions_rows = [
        derive_decision(
            project,
            score_by_project.get(str(project.get("project_id") or project.get("id") or ""), {}),
            radius_by_project.get(str(project.get("project_id") or project.get("id") or "")),
            awards_map,
            generated_at,
        )
        for project in projects
    ]

    bid_calendar_rows = build_bid_calendar(projects)
    contacts_rows = build_contacts(projects, awards, prior_decisions)
    ci_rows = build_ci_checklist(projects, ROOT / "templates" / "ci_checklist_denver_polyiso.json")

    artifact_dir = ROOT / "dist" / "artifacts" / market
    radius_payload = _artifact("radius_eval", market, generated_at, missing_inputs, radius_rows)
    scoring_payload = _artifact("deal_scoring", market, generated_at, missing_inputs, scoring_rows)
    derived_payload = _artifact("derived_decisions", market, generated_at, missing_inputs, decisions_rows)
    bid_payload = _artifact("bid_calendar", market, generated_at, missing_inputs, bid_calendar_rows)
    contacts_payload = _artifact("contacts", market, generated_at, missing_inputs, contacts_rows)
    ci_payload = _artifact("ci_checklist", market, generated_at, missing_inputs, ci_rows)

    write_json(artifact_dir / "radius_eval_latest.json", radius_payload)
    write_json(artifact_dir / "deal_scoring_latest.json", scoring_payload)
    write_json(artifact_dir / "decisions_latest.json", derived_payload)
    write_json(artifact_dir / "bid_calendar_latest.json", bid_payload)
    write_json(artifact_dir / "contacts_latest.json", contacts_payload)
    write_ci_checklist_json(artifact_dir / "ci_checklist_latest.json", ci_payload)
    write_ci_checklist_pdf(artifact_dir / "ci_checklist_latest.pdf", market, ci_rows)

    try:
        validate_if_schema_exists(radius_payload, schemas["radius_eval"], blocking=blocking_validation)
        validate_if_schema_exists(scoring_payload, schemas["deal_scoring"], blocking=blocking_validation)
        validate_if_schema_exists(derived_payload, schemas["derived_decisions"], blocking=blocking_validation)
        validate_if_schema_exists(ci_payload, schemas["ci_checklist"], blocking=False)
        validate_if_schema_exists(radius_payload, schemas["artifacts"], blocking=blocking_validation)
    except ValidationErrorRuntime:
        if blocking_validation:
            raise

    within_count = sum(1 for r in radius_rows if r.get("within_radius") is True)
    bid_count = sum(1 for d in decisions_rows if d.get("decision") == "BID")
    no_bid_count = sum(1 for d in decisions_rows if d.get("decision") == "NO_BID")
    watch_count = sum(1 for d in decisions_rows if d.get("decision") == "WATCH")

    return {
        "projects_count": len(projects),
        "scored_count": len(scoring_rows),
        "within_radius_count": within_count,
        "bid_count": bid_count,
        "no_bid_count": no_bid_count,
        "watch_count": watch_count,
    }


def main() -> None:
    blocking_validation = os.getenv("PROCEED_ANYWAY") != "1"
    projects_root = ROOT / "dist" / "projects"
    markets = market_dirs(projects_root)
    for market_dir in markets:
        summary = process_market(market_dir, blocking_validation=blocking_validation)
        print(
            f"{market_dir.name}: projects_count={summary['projects_count']} "
            f"scored_count={summary['scored_count']} within_radius_count={summary['within_radius_count']} "
            f"bid_count={summary['bid_count']} no_bid_count={summary['no_bid_count']} watch_count={summary['watch_count']}"
        )


if __name__ == "__main__":
    main()
