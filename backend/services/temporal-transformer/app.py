"""
Temporal Transformer crop typing — attach Crop_Type / Crop_Confidence
onto refined field polygons using a Sentinel-2 multi-temporal stack.

v1: FastAPI orchestrator that:
  - accepts AOI field polygons + dates (+ optional pre-fetched chips),
  - optionally delegates to a Prithvi self-host URL (CROP_CLASSIFICATION_SELF_URL contract),
  - returns FeatureCollection with Crop_Type / Crop_Confidence per Feature_ID.

When Prithvi is unavailable, returns features with Crop_Type from majority hints
or "Unknown" so the GIS publish path still succeeds.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

PRITHVI_URL = os.environ.get(
    "TEMPORAL_PRITHVI_URL",
    os.environ.get("CROP_CLASSIFICATION_SELF_URL", ""),
).strip()
DEFAULT_CROP = os.environ.get("TEMPORAL_DEFAULT_CROP", "Unknown").strip() or "Unknown"

CDL_NAMES: dict[int, str] = {
    0: "Background",
    1: "Corn",
    2: "Cotton",
    3: "Rice",
    4: "Sorghum",
    5: "Soybeans",
    6: "Sunflower",
    10: "Peanuts",
    11: "Tobacco",
    12: "Sweet Corn",
    21: "Barley",
    24: "Winter Wheat",
    36: "Alfalfa",
    37: "Other Hay",
    61: "Fallow/Idle",
    176: "Grassland/Pasture",
    205: "Triticale",
}

app = FastAPI(title="Temporal Transformer Crop Typing")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClassifyRequest(BaseModel):
    geojson: dict
    dates: list[str] = Field(default_factory=list)
    aoi: dict | None = None
    bbox: list[float] | None = None
    cropByFeatureId: dict[str, Any] | None = None
    crop_by_feature_id: dict[str, Any] | None = None
    majorityClassId: int | None = None
    majority_class_id: int | None = None
    majorityClassName: str | None = None
    majority_class_name: str | None = None
    majorityConfidence: float | None = None
    majority_confidence: float | None = None
    provider: str | None = None
    Provider: str | None = None


def merge_crop_props(
    geojson: dict,
    *,
    crop_by_feature_id: dict[str, Any] | None = None,
    majority_class_id: int | None = None,
    majority_class_name: str | None = None,
    majority_confidence: float | None = None,
    provider: str | None = None,
    dates: list[str] | None = None,
) -> dict:
    """
    Pure merge: attach Crop_Type / Crop_Confidence (+ aliases) onto each feature.
    Used by /classify and unit tests.
    """
    features_in = list((geojson or {}).get("features") or [])
    by_id = crop_by_feature_id or {}
    maj_name = (majority_class_name or "").strip()
    if not maj_name and majority_class_id is not None:
        maj_name = CDL_NAMES.get(int(majority_class_id), f"Class {int(majority_class_id)}")
    maj_conf = float(majority_confidence) if majority_confidence is not None else None
    if maj_conf is not None:
        maj_conf = max(0.0, min(1.0, maj_conf))
    provider_value = (provider or "").strip() or "temporal-transformer"
    date_note = ",".join(d for d in (dates or []) if d)[:120]

    out_features: list[dict[str, Any]] = []
    for f in features_in:
        if not isinstance(f, dict):
            continue
        props = dict(f.get("properties") or {})
        fid = str(
            props.get("Feature_ID")
            or props.get("objectId")
            or props.get("object_id")
            or f.get("id")
            or ""
        )
        hint = by_id.get(fid) if fid else None
        crop_name = DEFAULT_CROP
        crop_conf = 0.15

        if isinstance(hint, dict):
            crop_name = str(hint.get("cropType") or hint.get("Crop_Type") or hint.get("class") or crop_name)
            conf_raw = hint.get("confidence", hint.get("Crop_Confidence", crop_conf))
            try:
                crop_conf = max(0.0, min(1.0, float(conf_raw)))
            except (TypeError, ValueError):
                crop_conf = 0.15
        elif isinstance(hint, str) and hint.strip():
            crop_name = hint.strip()
            crop_conf = 0.55
        elif maj_name:
            crop_name = maj_name
            crop_conf = maj_conf if maj_conf is not None else 0.45

        props["Crop_Type"] = crop_name
        props["Crop_Confidence"] = round(crop_conf, 4)
        props["cropType"] = crop_name
        props["crop_type"] = crop_name
        props["cropConfidence"] = round(crop_conf, 4)
        props["crop_confidence"] = round(crop_conf, 4)
        if date_note:
            props["Temporal_Dates"] = date_note
            props["temporalDates"] = date_note
        if provider_value and not props.get("Provider"):
            props["Provider"] = provider_value
            props["provider"] = provider_value
        # Prefer Class_Name stay as field class; crop is separate attribute.
        out_features.append({**f, "properties": props})

    return {"type": "FeatureCollection", "features": out_features}


def _try_prithvi_majority(req: ClassifyRequest) -> tuple[int | None, str | None, float | None]:
    """Optional: call Prithvi self /predict and read majority class from classStats."""
    if not PRITHVI_URL:
        return None, None, None
    if not req.bbox or len(req.bbox) != 4:
        return None, None, None
    url = PRITHVI_URL.rstrip("/")
    if not url.endswith("/predict"):
        url = f"{url}/predict"
    payload = {
        "bbox": req.bbox,
        "dates": list(req.dates or []),
        "aoi": req.aoi,
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=120) as resp:  # noqa: S310
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        print(f"[temporal] Prithvi call failed: {exc}", flush=True)
        return None, None, None

    stats = body.get("classStats") or body.get("class_stats") or {}
    if isinstance(stats, dict) and stats:
        # Pick largest share key.
        best_id = None
        best_share = -1.0
        for k, v in stats.items():
            try:
                share = float(v.get("share", v.get("pct", v)) if isinstance(v, dict) else v)
                cid = int(k)
            except (TypeError, ValueError):
                continue
            if share > best_share:
                best_share = share
                best_id = cid
        if best_id is not None:
            name = CDL_NAMES.get(best_id, f"Class {best_id}")
            conf = max(0.2, min(0.95, best_share if best_share <= 1 else best_share / 100.0))
            return best_id, name, conf

    maj = body.get("majorityClassId", body.get("majority_class_id"))
    name = body.get("majorityClassName", body.get("majority_class_name"))
    conf = body.get("majorityConfidence", body.get("majority_confidence"))
    try:
        return (
            int(maj) if maj is not None else None,
            str(name).strip() if name else None,
            float(conf) if conf is not None else None,
        )
    except (TypeError, ValueError):
        return None, None, None


def _execute_classify(req: ClassifyRequest) -> dict:
    if not isinstance(req.geojson, dict) or req.geojson.get("type") != "FeatureCollection":
        raise ValueError("geojson FeatureCollection is required.")

    crop_map = req.cropByFeatureId if req.cropByFeatureId is not None else req.crop_by_feature_id
    maj_id = req.majorityClassId if req.majorityClassId is not None else req.majority_class_id
    maj_name = req.majorityClassName if req.majorityClassName is not None else req.majority_class_name
    maj_conf = (
        req.majorityConfidence if req.majorityConfidence is not None else req.majority_confidence
    )

    engine = "passthrough"
    if not crop_map and maj_id is None and not (maj_name or "").strip():
        p_id, p_name, p_conf = _try_prithvi_majority(req)
        if p_id is not None or p_name:
            maj_id = p_id if maj_id is None else maj_id
            maj_name = p_name if not (maj_name or "").strip() else maj_name
            maj_conf = p_conf if maj_conf is None else maj_conf
            engine = "prithvi"

    merged = merge_crop_props(
        req.geojson,
        crop_by_feature_id=crop_map,
        majority_class_id=maj_id,
        majority_class_name=maj_name,
        majority_confidence=maj_conf,
        provider=req.provider or req.Provider,
        dates=list(req.dates or []),
    )
    return {
        "geojson": merged,
        "count": len(merged.get("features") or []),
        "engine": "temporal-transformer",
        "backend": engine,
        "dates": list(req.dates or []),
        "prithvi_configured": bool(PRITHVI_URL),
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "engine": "temporal-transformer",
        "prithvi_configured": bool(PRITHVI_URL),
        "prithvi_url": bool(PRITHVI_URL),
        "port_default": 8097,
    }


@app.post("/classify")
def classify(req: ClassifyRequest):
    try:
        return _execute_classify(req)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc), "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        print(f"[temporal] classify failed: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})
