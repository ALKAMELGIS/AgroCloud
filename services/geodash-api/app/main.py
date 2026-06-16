"""
GeoDash ingestion & dataset API (FastAPI).
Run: uvicorn app.main:app --reload --port 8090
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import DashboardBinding, Dataset, SpatialFeature, TelemetryRecord, get_session_factory

DB_PATH = Path(__file__).resolve().parent.parent / "geodash.sqlite"
SessionLocal = get_session_factory(str(DB_PATH))

app = FastAPI(title="GeoDash API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    return {"ok": True, "service": "geodash-api"}


@app.post("/sources/upload")
async def upload_source(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accept uploads; stub stores dataset row + placeholder geometry + sample telemetry."""
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")
    now = datetime.now(timezone.utc).isoformat()
    ds = Dataset(name=file.filename or "upload", source_kind=Path(file.filename or "").suffix.lower() or "bin", created_at=now)
    db.add(ds)
    db.flush()
    feat = SpatialFeature(dataset_id=ds.id, external_key="default", geom_wkt="POLYGON EMPTY")
    db.add(feat)
    db.flush()
    rec = TelemetryRecord(
        dataset_id=ds.id,
        feature_id=feat.id,
        payload_json=json.dumps({"bytes": len(raw), "note": "Replace with GDAL/Fiona parse + PostGIS"}),
    )
    db.add(rec)
    db.commit()
    return {"ok": True, "dataset_id": ds.id, "feature_id": feat.id, "record_id": rec.id}


@app.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    rows = db.execute(select(Dataset).order_by(Dataset.id.desc())).scalars().all()
    return {
        "items": [
            {"id": r.id, "name": r.name, "source_kind": r.source_kind, "created_at": r.created_at} for r in rows
        ],
    }


@app.get("/datasets/{dataset_id}/records")
def list_records(dataset_id: int, db: Session = Depends(get_db)):
    q = select(TelemetryRecord).where(TelemetryRecord.dataset_id == dataset_id)
    rows = db.execute(q).scalars().all()
    return {"items": [{"id": r.id, "feature_id": r.feature_id, "payload": json.loads(r.payload_json or "{}")} for r in rows]}


@app.post("/dashboard/bindings")
def upsert_dashboard_binding(payload: dict, db: Session = Depends(get_db)):
    """One map/registry entity → many chart widget ids (merge by appending unique ids)."""
    key = str(payload.get("map_entity_key") or "").strip()
    ids = payload.get("chart_widget_ids")
    if not key or not isinstance(ids, list):
        raise HTTPException(400, "map_entity_key and chart_widget_ids[] required")
    now = datetime.now(timezone.utc).isoformat()
    row = db.execute(select(DashboardBinding).where(DashboardBinding.map_entity_key == key)).scalar_one_or_none()
    existing: list = []
    if row:
        try:
            existing = json.loads(row.chart_widget_ids_json or "[]")
        except json.JSONDecodeError:
            existing = []
    merged = list(dict.fromkeys([*(existing if isinstance(existing, list) else []), *[str(x) for x in ids]]))
    if row:
        row.chart_widget_ids_json = json.dumps(merged)
        row.updated_at = now
    else:
        db.add(
            DashboardBinding(
                scope=str(payload.get("scope") or "agro-dashboard")[:128],
                map_entity_key=key[:512],
                chart_widget_ids_json=json.dumps(merged),
                updated_at=now,
            )
        )
    db.commit()
    return {"ok": True, "map_entity_key": key, "chart_widget_ids": merged}


@app.get("/dashboard/bindings")
def list_dashboard_bindings(map_entity_key: str | None = None, db: Session = Depends(get_db)):
    q = select(DashboardBinding)
    if map_entity_key and map_entity_key.strip():
        q = q.where(DashboardBinding.map_entity_key == map_entity_key.strip())
    rows = db.execute(q).scalars().all()
    out = []
    for r in rows:
        try:
            ids = json.loads(r.chart_widget_ids_json or "[]")
        except json.JSONDecodeError:
            ids = []
        out.append({"id": r.id, "map_entity_key": r.map_entity_key, "chart_widget_ids": ids, "updated_at": r.updated_at})
    return {"items": out}
