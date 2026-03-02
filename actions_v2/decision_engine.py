from typing import Any


def _is_awarded(project_id: str, awards_by_project: dict[str, dict[str, Any]]) -> bool:
    award = awards_by_project.get(project_id)
    if not award:
        return False
    status = str(award.get("status") or award.get("award_status") or "").upper()
    return status == "AWARDED" or bool(award.get("awarded"))


def derive_decision(
    project: dict[str, Any],
    score_row: dict[str, Any],
    radius_row: dict[str, Any] | None,
    awards_by_project: dict[str, dict[str, Any]],
    generated_at: str,
) -> dict[str, Any]:
    project_id = str(project.get("project_id") or project.get("id") or "")
    deal_score = int(score_row.get("deal_score") or 0)
    within_radius = radius_row.get("within_radius") if radius_row else None

    award_status = "Unknown" if awards_by_project else "None"
    if _is_awarded(project_id, awards_by_project):
        decision, reason = "NO_BID", "AWARDED"
        award_status = "Awarded"
    elif within_radius is False:
        decision, reason = "NO_BID", "OUTSIDE_RADIUS"
    elif deal_score >= 70:
        decision, reason = "BID", "SCORE_HIGH"
    elif deal_score <= 45:
        decision, reason = "NO_BID", "SCORE_LOW"
    else:
        decision, reason = "WATCH", "MID_SCORE"

    next_step = {
        "BID": "Prepare pursuit package and confirm bid date.",
        "NO_BID": "Record disposition and monitor for scope change.",
        "WATCH": "Track filings and reassess at next milestone.",
    }[decision]

    return {
        "project_id": project_id,
        "project_name": project.get("project_name") or project.get("name") or "",
        "decision": decision,
        "primary_reason": reason,
        "deal_score": deal_score,
        "within_radius": within_radius,
        "award_status": award_status,
        "next_step": next_step,
        "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
        "generated_at": generated_at,
    }
