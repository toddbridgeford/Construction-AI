from typing import Any


def _entity_type(raw_type: Any) -> str:
    value = str(raw_type or "").strip().upper()
    if value in {"GC", "ARCHITECT", "DEVELOPER", "CITY"}:
        return value.title() if value != "GC" else "GC"
    return "Other"


def _confidence(contact: dict[str, Any]) -> str | None:
    if contact.get("email") or contact.get("phone"):
        return "High"
    if contact.get("contact_page") or contact.get("source_url"):
        return "Medium"
    return None


def _collect_from_project(project: dict[str, Any]) -> list[dict[str, Any]]:
    contacts = project.get("public_contacts")
    if not isinstance(contacts, list):
        return []
    rows = []
    for c in contacts:
        if not isinstance(c, dict):
            continue
        conf = _confidence(c)
        source_url = c.get("source_url") or c.get("contact_page")
        if not conf or not source_url:
            continue
        rows.append(
            {
                "project_id": str(project.get("project_id") or project.get("id") or ""),
                "project_name": project.get("project_name") or project.get("name") or "",
                "name": c.get("name") or "",
                "title": c.get("title"),
                "entity": c.get("entity"),
                "entity_type": _entity_type(c.get("entity_type") or c.get("role")),
                "email": c.get("email"),
                "phone": c.get("phone"),
                "source_url": source_url,
                "confidence": conf,
                "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
            }
        )
    return rows


def build_contacts(
    projects: list[dict[str, Any]],
    awards: list[dict[str, Any]] | None,
    decisions: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for project in projects:
        rows.extend(_collect_from_project(project))

    for extra in (awards or []) + (decisions or []):
        for c in extra.get("contacts", []):
            conf = _confidence(c)
            source_url = c.get("source_url") or c.get("contact_page")
            if not conf or not source_url:
                continue
            rows.append(
                {
                    "project_id": str(extra.get("project_id") or extra.get("id") or ""),
                    "project_name": extra.get("project_name") or extra.get("name") or "",
                    "name": c.get("name") or "",
                    "title": c.get("title"),
                    "entity": c.get("entity"),
                    "entity_type": _entity_type(c.get("entity_type") or c.get("role")),
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "source_url": source_url,
                    "confidence": conf,
                    "verification_url": extra.get("case_url") or extra.get("filing_url") or extra.get("verification_url"),
                }
            )

    deduped = {(r["project_id"], r["name"], r["source_url"]): r for r in rows}
    return list(deduped.values())
