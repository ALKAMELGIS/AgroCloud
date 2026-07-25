"""Rule-based + heuristic GeoAI enrichment for crop, health, stress, yield, etc."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def classify_crop(ndvi: float | None, ndmi: float | None, ndwi: float | None) -> tuple[str, float]:
    """Heuristic crop type from spectral signature (confidence 0–100)."""
    if ndvi is None:
        return "Unknown", 0.0
    n = ndvi
    m = ndmi if ndmi is not None else 0.0
    w = ndwi if ndwi is not None else 0.0

    if n < 0.15:
        return "Bare Soil", 78.0
    if w > 0.1 and n < 0.35:
        return "Unknown", 45.0
    if n >= 0.65 and m >= 0.25:
        return "Alfalfa", 72.0
    if n >= 0.55 and m >= 0.15:
        return "Rhodes Grass", 68.0
    if 0.45 <= n < 0.65 and m < 0.2:
        return "Wheat", 62.0
    if 0.5 <= n < 0.7 and m >= 0.2:
        return "Maize", 60.0
    if n >= 0.4 and m >= 0.1:
        return "Vegetables", 55.0
    if 0.35 <= n < 0.55:
        return "Orchard", 52.0
    if n >= 0.3:
        return "Date Palm", 48.0
    return "Unknown", 40.0


def crop_health(ndvi: float | None, ndmi: float | None, ndre: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    score = ndvi
    if ndmi is not None:
        score = 0.6 * ndvi + 0.25 * max(ndmi, 0) + 0.15 * (ndre or ndvi)
    if score >= 0.7:
        return "Excellent"
    if score >= 0.55:
        return "Good"
    if score >= 0.4:
        return "Moderate"
    if score >= 0.25:
        return "Poor"
    return "Critical"


def growth_stage(ndvi: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    if ndvi < 0.2:
        return "Planting"
    if ndvi < 0.35:
        return "Emergence"
    if ndvi < 0.5:
        return "Vegetative"
    if ndvi < 0.65:
        return "Flowering"
    if ndvi < 0.75:
        return "Maturity"
    return "Harvest Ready"


def water_stress(ndmi: float | None, ndwi: float | None) -> str:
    if ndmi is None and ndwi is None:
        return "Unknown"
    m = ndmi if ndmi is not None else 0.0
    if m >= 0.3:
        return "None"
    if m >= 0.2:
        return "Low"
    if m >= 0.1:
        return "Moderate"
    if m >= 0.0:
        return "High"
    return "Extreme"


def soil_moisture(ndmi: float | None) -> str:
    if ndmi is None:
        return "Unknown"
    if ndmi >= 0.35:
        return "Very High"
    if ndmi >= 0.25:
        return "High"
    if ndmi >= 0.15:
        return "Medium"
    if ndmi >= 0.05:
        return "Low"
    return "Very Low"


def land_cover(ndvi: float | None, ndwi: float | None) -> str:
    if ndwi is not None and ndwi > 0.2:
        return "Water"
    if ndvi is None:
        return "Unknown"
    if ndvi < 0.15:
        return "Bare Soil"
    if ndvi < 0.3:
        return "Grassland"
    if ndvi >= 0.55:
        return "Agriculture"
    if ndvi >= 0.4:
        return "Forest"
    return "Agriculture"


def agricultural_status(land_cover_type: str, ndvi: float | None) -> str:
    if land_cover_type in {"Agriculture", "Grassland"} or (ndvi is not None and ndvi >= 0.25):
        return "Agricultural"
    return "Non Agricultural"


def activity_status(ndvi: float | None, veg_pct: float | None) -> str:
    if ndvi is not None and ndvi >= 0.3:
        return "Active"
    if veg_pct is not None and veg_pct >= 25:
        return "Active"
    return "Inactive"


def land_suitability(ndvi: float | None, ndmi: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    score = ndvi + 0.3 * (ndmi or 0)
    if score >= 0.75:
        return "Highly Suitable"
    if score >= 0.55:
        return "Suitable"
    if score >= 0.4:
        return "Moderately Suitable"
    if score >= 0.25:
        return "Marginal"
    return "Unsuitable"


def estimate_yield(crop: str, ndvi: float | None, area_ha: float | None) -> tuple[float | None, float | None, float]:
    """Return (yield_t_ha, total_t, confidence%)."""
    if ndvi is None or area_ha is None:
        return None, None, 0.0
    base = {
        "Wheat": 3.5,
        "Maize": 5.0,
        "Alfalfa": 12.0,
        "Rhodes Grass": 10.0,
        "Vegetables": 18.0,
        "Date Palm": 8.0,
        "Orchard": 9.0,
        "Bare Soil": 0.0,
        "Unknown": 4.0,
    }.get(crop, 4.0)
    factor = max(0.0, min(1.4, (ndvi - 0.15) / 0.55))
    yld = round(base * factor, 3)
    total = round(yld * float(area_ha), 3)
    conf = round(min(95.0, 40.0 + 80.0 * abs(ndvi - 0.2)), 1)
    return yld, total, conf


def change_label(ndvi_now: float | None, ndvi_prev: float | None) -> str:
    if ndvi_now is None or ndvi_prev is None:
        return "No Change"
    d = ndvi_now - ndvi_prev
    if d > 0.08:
        return "Expansion"
    if d < -0.08:
        return "Reduction"
    return "No Change"


def newly_cultivated(ndvi_now: float | None, ndvi_prev: float | None) -> str:
    if ndvi_now is None or ndvi_prev is None:
        return "Stable"
    if ndvi_prev < 0.2 and ndvi_now >= 0.35:
        return "New Farm"
    if ndvi_prev >= 0.35 and ndvi_now < 0.2:
        return "Abandoned"
    return "Stable"


def timeseries_trend(ndvi_now: float | None, ndvi_prev: float | None) -> str:
    if ndvi_now is None or ndvi_prev is None:
        return "Unknown"
    d = ndvi_now - ndvi_prev
    if d > 0.05:
        return "Improving"
    if d < -0.05:
        return "Declining"
    return "Stable"


def anomaly_flag(ndvi: float | None, ndmi: float | None, ndwi: float | None, cloud: float | None) -> bool:
    if cloud is not None and cloud > 40:
        return True
    if ndwi is not None and ndwi > 0.35 and (ndvi or 0) < 0.25:
        return True  # possible flood
    if ndvi is not None and ndvi < 0.12 and (ndmi or 0) < 0.0:
        return True  # drought / burn proxy
    return False


def recommendation(
    health: str,
    stress: str,
    anomaly: bool,
    stage: str,
) -> str:
    if anomaly:
        return "Field inspection required"
    if health in {"Critical", "Poor"} or stress in {"High", "Extreme"}:
        return "Increase irrigation"
    if stress == "Moderate":
        return "Monitor stress"
    if stage == "Harvest Ready":
        return "Harvest within 2 weeks"
    if health in {"Excellent", "Good"}:
        return "Healthy crop"
    return "Continue routine monitoring"


def inspection_priority(health: str, anomaly: bool, stress: str) -> str:
    if anomaly or health == "Critical" or stress == "Extreme":
        return "Critical"
    if health == "Poor" or stress == "High":
        return "High"
    if health == "Moderate" or stress == "Moderate":
        return "Medium"
    return "Low"


def irrigation_performance(ndmi: float | None, ndvi: float | None) -> str:
    if ndmi is None or ndvi is None:
        return "Unknown"
    if ndmi >= 0.25 and ndvi >= 0.45:
        return "Optimal"
    if ndmi >= 0.15:
        return "Adequate"
    if ndmi >= 0.05:
        return "Under-irrigated"
    return "Severely under-irrigated"


def soil_salinity(ndvi: float | None, ndwi: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    # Proxy: low vigor + elevated brightness water index contrast.
    if ndvi < 0.2 and (ndwi or 0) < -0.1:
        return "High"
    if ndvi < 0.3:
        return "Moderate"
    return "Low"


def land_degradation(ndvi: float | None, ndvi_prev: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    if ndvi_prev is not None and (ndvi_prev - ndvi) > 0.15:
        return "Degrading"
    if ndvi < 0.2:
        return "Degraded"
    return "Stable"


def et_and_water(ndvi: float | None, area_ha: float | None) -> dict[str, Any]:
    """Simple FAO-style proxy ET / CWR (mm and m3) — not a full ET model."""
    if ndvi is None:
        return {
            "Actual_ET": None,
            "Crop_Water_Requirement": None,
            "Estimated_Water_Use": None,
            "Water_Productivity": None,
        }
    et0 = 5.0  # mm/day proxy
    kc = max(0.2, min(1.2, ndvi * 1.4))
    etc = round(et0 * kc, 2)  # mm/day
    cwr = round(etc * 30, 2)  # monthly mm proxy
    use_m3 = None
    wp = None
    if area_ha is not None:
        use_m3 = round(cwr * 10.0 * float(area_ha), 1)  # mm → m3/ha * ha
        wp = round(max(0.1, (ndvi * 10)) / max(cwr, 1.0), 3)
    return {
        "Actual_ET": etc,
        "Crop_Water_Requirement": cwr,
        "Estimated_Water_Use": use_m3,
        "Water_Productivity": wp,
    }


def planting_harvest_dates(stage: str, acquisition_date: str) -> tuple[str, str]:
    try:
        acq = datetime.fromisoformat(acquisition_date).date()
    except Exception:
        return "", ""
    # Rough seasonal offsets relative to acquisition.
    offsets = {
        "Planting": (0, 120),
        "Emergence": (-20, 100),
        "Vegetative": (-45, 75),
        "Flowering": (-70, 50),
        "Maturity": (-100, 25),
        "Harvest Ready": (-120, 7),
    }
    plant_d, harv_d = offsets.get(stage, (-60, 60))
    from datetime import timedelta

    return (acq + timedelta(days=plant_d)).isoformat(), (acq + timedelta(days=harv_d)).isoformat()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def enrich_feature_row(
    *,
    stats: dict[str, dict[str, float | None]],
    veg_pct: float | None,
    area_ha: float | None,
    scene: dict[str, Any],
    prev_ndvi: float | None = None,
) -> dict[str, Any]:
    """Build all attribute values for one polygon from zonal stats + scene meta."""
    ndvi = (stats.get("NDVI") or {}).get("mean")
    ndmi = (stats.get("NDMI") or {}).get("mean")
    ndwi = (stats.get("NDWI") or {}).get("mean")
    evi = (stats.get("EVI") or {}).get("mean")
    savi = (stats.get("SAVI") or {}).get("mean")
    ndre = (stats.get("NDRE") or {}).get("mean")
    msavi = (stats.get("MSAVI") or {}).get("mean")
    gci = (stats.get("GCI") or {}).get("mean")
    osavi = (stats.get("OSAVI") or {}).get("mean")
    et_val = (stats.get("ET") or {}).get("mean")
    lst_val = (stats.get("LST") or {}).get("mean")

    crop, conf = classify_crop(ndvi, ndmi, ndwi)
    health = crop_health(ndvi, ndmi, ndre)
    stage = growth_stage(ndvi)
    stress = water_stress(ndmi, ndwi)
    moisture = soil_moisture(ndmi)
    cover = land_cover(ndvi, ndwi)
    agri = agricultural_status(cover, ndvi)
    activity = activity_status(ndvi, veg_pct)
    suit = land_suitability(ndvi, ndmi)
    yld, total, yconf = estimate_yield(crop, ndvi, area_ha)
    change = change_label(ndvi, prev_ndvi)
    new_cult = newly_cultivated(ndvi, prev_ndvi)
    trend = timeseries_trend(ndvi, prev_ndvi)
    anom = anomaly_flag(ndvi, ndmi, ndwi, scene.get("cloud_cover"))
    rec = recommendation(health, stress, anom, stage)
    prio = inspection_priority(health, anom, stress)
    water = et_and_water(ndvi, area_ha)
    if et_val is not None:
        water["Actual_ET"] = _r(et_val, 3)
    plant, harvest = planting_harvest_dates(stage, scene.get("acquisition_date") or "")
    cultivated = round(float(area_ha) * ((veg_pct or 0) / 100.0), 4) if area_ha is not None else None

    ndvi_s = stats.get("NDVI") or {}
    pixel_count = ndvi_s.get("count")
    quality = 100.0
    if scene.get("cloud_cover") is not None:
        quality -= min(40.0, float(scene["cloud_cover"]) * 0.5)
    if pixel_count is not None and pixel_count < 5:
        quality -= 25
    quality = round(max(0.0, quality), 1)

    # Populate every Remote Sensing Layer-select index mean available in stats.
    rs_means: dict[str, Any] = {}
    for layer_id, st in stats.items():
        rs_means[layer_id] = _r(st.get("mean"))

    return {
        "Land_Cover_Type": cover,
        "Vegetation_Cover_Percent": veg_pct,
        "Agricultural_Status": agri,
        "Activity_Status": activity,
        "Crop_Type": crop,
        "Crop_Confidence": conf,
        "Cultivated_Area_ha": cultivated,
        "Crop_Growth_Stage": stage,
        "Estimated_Planting_Date": plant,
        "Estimated_Harvest_Date": harvest,
        "Crop_Health": health,
        **rs_means,
        "NDVI": _r(ndvi),
        "NDMI": _r(ndmi),
        "NDWI": _r(ndwi),
        "EVI": _r(evi),
        "SAVI": _r(savi),
        "NDRE": _r(ndre),
        "MSAVI": _r(msavi),
        "GCI": _r(gci),
        "OSAVI": _r(osavi),
        "ET": _r(et_val, 3),
        "LST": _r(lst_val, 2),
        "Water_Stress": stress,
        "Soil_Moisture": moisture,
        **water,
        "Irrigation_Performance": irrigation_performance(ndmi, ndvi),
        "Soil_Salinity": soil_salinity(ndvi, ndwi),
        "Land_Degradation": land_degradation(ndvi, prev_ndvi),
        "Land_Suitability": suit,
        "Estimated_Yield": yld,
        "Estimated_Total_Production": total,
        "Yield_Confidence": yconf,
        "Change_Previous_Period": change,
        "Newly_Cultivated": new_cult,
        "Anomaly": anom,
        "Field_Inspection_Priority": prio,
        "Recommendation": rec,
        "TimeSeries": trend,
        "Satellite_Source": scene.get("source", ""),
        "Satellite_Name": scene.get("satellite_name", "Sentinel-2"),
        "Scene_ID": scene.get("scene_id", ""),
        "Acquisition_Date": scene.get("acquisition_date", ""),
        "Cloud_Cover": scene.get("cloud_cover"),
        "Cloud_Cover_Pct": scene.get("cloud_cover"),
        "Spatial_Resolution": scene.get("resolution", 20),
        "Processing_Date": now_iso(),
        "NDVI_Min": _r(ndvi_s.get("min")),
        "NDVI_Max": _r(ndvi_s.get("max")),
        "NDVI_Mean": _r(ndvi),
        "NDMI_Mean": _r(ndmi),
        "EVI_Mean": _r(evi),
        "Pixel_Count": pixel_count,
        "Data_Quality_Score": quality,
        "Analysis_Confidence": round(min(95.0, (conf + quality) / 2.0), 1),
        "Last_Update": now_iso(),
    }


def _r(v: float | None, n: int = 4) -> float | None:
    if v is None:
        return None
    return round(float(v), n)
