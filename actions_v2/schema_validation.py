from pathlib import Path
from typing import Any

from .io_layer import read_json

try:
    from jsonschema import validate as _validate
except Exception:  # pragma: no cover
    _validate = None


class ValidationErrorRuntime(RuntimeError):
    pass


def validate_payload(payload: Any, schema_path: Path) -> None:
    if _validate is None:
        raise ValidationErrorRuntime("jsonschema dependency unavailable")
    schema = read_json(schema_path)
    if schema is None:
        return
    _validate(instance=payload, schema=schema)


def validate_if_schema_exists(payload: Any, schema_path: Path, blocking: bool = True) -> list[str]:
    issues: list[str] = []
    if _validate is None:
        issues.append("dependency_missing:jsonschema")
        if blocking:
            raise ValidationErrorRuntime("jsonschema dependency unavailable")
        return issues
    if not schema_path.exists():
        issues.append(f"schema_missing:{schema_path}")
        return issues
    try:
        validate_payload(payload, schema_path)
    except Exception as exc:
        issues.append(f"validation_failed:{schema_path.name}:{exc}")
        if blocking:
            raise ValidationErrorRuntime(str(exc)) from exc
    return issues
