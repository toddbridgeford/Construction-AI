import math
from typing import Any


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_earth_miles = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius_earth_miles * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _coerce_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def evaluate_project_radius(project: dict[str, Any], radius_config: dict[str, Any] | None) -> dict[str, Any]:
    lat = _coerce_float(project.get("lat") or project.get("project_lat") or project.get("latitude"))
    lon = _coerce_float(project.get("lon") or project.get("project_lon") or project.get("longitude"))

    radius_miles = None
    origins: list[dict[str, Any]] = []
    if radius_config:
        radius_miles = _coerce_float(radius_config.get("radius_miles"))
        if isinstance(radius_config.get("origins"), list):
            origins = radius_config["origins"]
        elif isinstance(radius_config.get("origin"), dict):
            origin = dict(radius_config["origin"])
            origin.setdefault("name", "default")
            origins = [origin]

    if not origins:
        fallback_origin = {
            "name": "default",
            "lat": _coerce_float(project.get("hq_lat") or project.get("origin_lat")),
            "lon": _coerce_float(project.get("hq_lon") or project.get("origin_lon")),
        }
        if fallback_origin["lat"] is not None and fallback_origin["lon"] is not None:
            origins = [fallback_origin]

    best_origin = "default"
    best_distance = None
    if lat is not None and lon is not None and origins:
        for origin in origins:
            o_lat = _coerce_float(origin.get("lat"))
            o_lon = _coerce_float(origin.get("lon"))
            if o_lat is None or o_lon is None:
                continue
            distance = haversine_miles(lat, lon, o_lat, o_lon)
            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_origin = str(origin.get("name") or "default")

    within = None
    confidence = "Low"
    if lat is not None and lon is not None and best_distance is not None and radius_miles is not None:
        within = best_distance <= radius_miles
        confidence = "High"

    return {
        "project_id": str(project.get("project_id") or project.get("id") or ""),
        "project_name": project.get("project_name") or project.get("name") or "",
        "address": project.get("address"),
        "project_lat": lat,
        "project_lon": lon,
        "origin_used": best_origin,
        "distance_miles": round(best_distance, 2) if best_distance is not None else None,
        "radius_miles": radius_miles,
        "within_radius": within,
        "confidence": confidence,
        "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
    }
