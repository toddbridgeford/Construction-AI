from datetime import datetime, timedelta, timezone
from typing import Any

STAGE_WINDOWS = {
    "SD": 180,
    "DD": 120,
    "CD": 75,
    "PRE-GMP": 45,
    "BID": 21,
}


def build_bid_calendar(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    rows: list[dict[str, Any]] = []
    for project in projects:
        observed_bid_date = (
            project.get("bid_date")
            or project.get("observed_bid_date")
            or (project.get("milestones") or {}).get("bid_date")
        )
        stage = str(project.get("stage") or "").upper()
        window_basis = "None"
        confidence = "Low"
        bid_window_start = None
        bid_window_end = None

        if observed_bid_date:
            bid_window_start = observed_bid_date
            bid_window_end = observed_bid_date
            window_basis = "Observed"
            confidence = "High"
        elif stage in STAGE_WINDOWS:
            end_dt = now + timedelta(days=STAGE_WINDOWS[stage])
            start_dt = end_dt - timedelta(days=14)
            bid_window_start = start_dt.date().isoformat()
            bid_window_end = end_dt.date().isoformat()
            window_basis = "Estimated"
            confidence = "Medium"

        rows.append(
            {
                "project_id": str(project.get("project_id") or project.get("id") or ""),
                "project_name": project.get("project_name") or project.get("name") or "",
                "stage": project.get("stage"),
                "bid_window_start": bid_window_start,
                "bid_window_end": bid_window_end,
                "window_basis": window_basis,
                "confidence": confidence,
                "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
            }
        )
    return rows
