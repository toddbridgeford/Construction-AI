from typing import Any


STAGE_SCORES = {
    "SD": 12,
    "DD": 18,
    "CD": 24,
    "PRE-GMP": 20,
    "BID": 28,
}


EXPOSURE_SCORES = {
    "VERIFIED": 20,
    "IMPLIED": 12,
    "UNKNOWN": 6,
}


def _norm(value: Any) -> str:
    return str(value or "").strip().upper()


def _stage_score(project: dict[str, Any]) -> int:
    stage = _norm(project.get("stage"))
    return STAGE_SCORES.get(stage, 0)


def _evidence_score(project: dict[str, Any]) -> int:
    score = 0
    if project.get("address"):
        score += 6
    if project.get("case_id"):
        score += 8
    if project.get("filing_url") or project.get("case_url"):
        score += 8
    return score


def _exposure_score(project: dict[str, Any]) -> int:
    exposure = _norm(project.get("ci_exposure"))
    return EXPOSURE_SCORES.get(exposure, 0)


def _proximity_score(radius_eval: dict[str, Any] | None) -> int:
    if not radius_eval:
        return 0
    if radius_eval.get("within_radius") is True:
        return 14
    if radius_eval.get("within_radius") is False:
        return -12
    return 0


def _clarity_score(project: dict[str, Any]) -> int:
    score = 0
    if project.get("developer"):
        score += 4
    if project.get("architect"):
        score += 4
    if project.get("gc") or project.get("general_contractor"):
        score += 8
    return score


def _award_detected(project: dict[str, Any], awards_by_project: dict[str, dict[str, Any]]) -> bool:
    pid = str(project.get("project_id") or project.get("id") or "")
    if not pid:
        return False
    award = awards_by_project.get(pid)
    if not award:
        return False
    status = _norm(award.get("status") or award.get("award_status"))
    return status == "AWARDED" or bool(award.get("awarded"))


def score_project(
    project: dict[str, Any],
    radius_eval: dict[str, Any] | None,
    awards_by_project: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    stage = _stage_score(project)
    evidence = _evidence_score(project)
    trade_exposure = _exposure_score(project)
    proximity = _proximity_score(radius_eval)
    clarity = _clarity_score(project)
    risk_penalty = -100 if _award_detected(project, awards_by_project) else 0

    raw_total = stage + evidence + trade_exposure + proximity + clarity + risk_penalty
    deal_score = max(0, min(100, int(raw_total)))

    confidence = "High"
    if stage == 0 or evidence == 0:
        confidence = "Medium"
    if radius_eval and radius_eval.get("within_radius") is None:
        confidence = "Low"

    bullets = []
    if project.get("stage"):
        bullets.append(f"Stage {project.get('stage')} contributed {stage} points.")
    if project.get("address") or project.get("case_id"):
        bullets.append(f"Evidence score {evidence} from available filing metadata.")
    if project.get("ci_exposure"):
        bullets.append(f"Trade exposure {project.get('ci_exposure')} added {trade_exposure}.")
    if radius_eval:
        bullets.append(f"Proximity component {proximity} (within_radius={radius_eval.get('within_radius')}).")
    if _award_detected(project, awards_by_project):
        bullets.append("Award detected; risk penalty forced no-bid posture.")
    if not bullets:
        bullets.append("Insufficient evidence; score defaults to conservative baseline.")

    return {
        "project_id": str(project.get("project_id") or project.get("id") or ""),
        "project_name": project.get("project_name") or project.get("name") or "",
        "deal_score": deal_score,
        "component_scores": {
            "stage": stage,
            "evidence": evidence,
            "trade_exposure": trade_exposure,
            "proximity": proximity,
            "clarity": clarity,
            "risk_penalty": risk_penalty,
        },
        "rationale_bullets": bullets[:6],
        "confidence": confidence,
        "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
    }
