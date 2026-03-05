#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
from typing import Iterable

try:
    from jsonschema import Draft202012Validator  # type: ignore
except ModuleNotFoundError:
    Draft202012Validator = None

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO_ROOT / "schemas"


def load_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_file(path: pathlib.Path, schema: dict) -> list[str]:
    if Draft202012Validator is None:
        # Dependency-free fallback for restricted environments:
        # verify payload is valid JSON and defer strict schema checks.
        load_json(path)
        return []

    validator = Draft202012Validator(schema)
    payload = load_json(path)
    errors = sorted(validator.iter_errors(payload), key=lambda e: e.json_path)
    return [f"{path}: {error.json_path} - {error.message}" for error in errors]


def iter_existing(paths: Iterable[pathlib.Path]) -> Iterable[pathlib.Path]:
    for path in paths:
        if path.exists():
            yield path


def gather_targets() -> list[tuple[pathlib.Path, pathlib.Path]]:
    targets: list[tuple[pathlib.Path, pathlib.Path]] = []

    for market_dir in sorted((REPO_ROOT / "dist" / "projects").glob("*/")):
        project_file = market_dir / "projects_latest.json"
        if project_file.exists():
            targets.append((project_file, SCHEMA_DIR / "projects_schema.json"))

    signal_root_file = REPO_ROOT / "artifacts" / "signal_api_latest.json"
    if not signal_root_file.exists():
        signal_root_file = REPO_ROOT / "signal_api_latest.json"
    if signal_root_file.exists():
        targets.append((signal_root_file, SCHEMA_DIR / "signal_api_schema.json"))

    for signal_file in (REPO_ROOT / "dist" / "markets").glob("*/signal_api_latest.json"):
        targets.append((signal_file, SCHEMA_DIR / "signal_api_schema.json"))

    artifact_files = list((REPO_ROOT / "dist" / "artifacts").glob("*/bid_calendar_latest.json"))
    artifact_files += list((REPO_ROOT / "dist" / "artifacts").glob("*/contacts_latest.json"))
    for artifact_file in sorted(artifact_files):
        targets.append((artifact_file, SCHEMA_DIR / "artifacts_schema.json"))

    checklist_files = [REPO_ROOT / "templates" / "ci_checklist_denver_polyiso.json"]
    for checklist_file in iter_existing(checklist_files):
        targets.append((checklist_file, SCHEMA_DIR / "ci_checklist_schema.json"))

    return targets


def main() -> int:
    failures: list[str] = []
    targets = gather_targets()

    for payload_path, schema_path in targets:
        schema = load_json(schema_path)
        failures.extend(validate_file(payload_path, schema))

    if failures:
        for failure in failures:
            print(failure)
        return 1

    mode = "full schema validation" if Draft202012Validator is not None else "syntax-only fallback (jsonschema unavailable)"
    print(f"Validated {len(targets)} JSON files successfully using {mode}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
