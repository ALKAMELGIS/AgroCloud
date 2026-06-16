from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
import os
import zipfile

import numpy as np
import planetary_computer as pc
import pystac_client
import stackstac
import xarray as xr
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import shape
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds

router = APIRouter()

MPC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"


class MpcProcessRequest(BaseModel):
    aoi: Dict[str, Any]
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    datetime: str
    template_id: Literal["ndvi_s2", "false_color_s2", "ndmi_s2", "ndvi_landsat", "false_color_landsat"]
    max_items: int = 20
    max_cloud_cover: Optional[float] = 20.0
    catalog_url: Optional[str] = None
    acs_zip_path: Optional[str] = None
    clip_to_aoi: bool = True
    tile_size: int = 1024
    resolution: int = 20


TEMPLATES: Dict[str, Dict[str, Any]] = {
    "ndvi_s2": {
        "label": "NDVI (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B04", "B08"],
        "kind": "index",
        "formula": "(nir - red) / (nir + red + 1e-6)",
        "bands": {"red": "B04", "nir": "B08"},
    },
    "false_color_s2": {
        "label": "False Color (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B08", "B04", "B03"],
        "kind": "rgb",
        "bands": {"r": "B08", "g": "B04", "b": "B03"},
    },
    "ndmi_s2": {
        "label": "Moisture Index / NDMI (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B08", "B11"],
        "kind": "index",
        "formula": "(nir - swir) / (nir + swir + 1e-6)",
        "bands": {"nir": "B08", "swir": "B11"},
    },
    "ndvi_landsat": {
        "label": "NDVI (Landsat-8/9)",
        "collections": ["landsat-c2-l2"],
        "assets": ["red", "nir08"],
        "kind": "index",
        "formula": "(nir - red) / (nir + red + 1e-6)",
        "bands": {"red": "red", "nir": "nir08"},
    },
    "false_color_landsat": {
        "label": "False Color (Landsat-8/9)",
        "collections": ["landsat-c2-l2"],
        "assets": ["swir16", "nir08", "red"],
        "kind": "rgb",
        "bands": {"r": "swir16", "g": "nir08", "b": "red"},
    },
}


def _normalize_catalog_url(raw: Optional[str]) -> str:
    text = (raw or "").strip()
    if not text:
        return MPC_STAC_URL
    # Accept MPC catalog landing URL and convert to STAC API root.
    if text.rstrip("/").lower() == "https://planetarycomputer.microsoft.com/catalog":
        return MPC_STAC_URL
    if text.rstrip("/").lower().endswith("/api/stac/v1"):
        return text.rstrip("/")
    if text.lower().endswith("/search"):
        return text.rsplit("/", 1)[0]
    return text.rstrip("/")


def _catalog(catalog_url: Optional[str] = None) -> pystac_client.Client:
    return pystac_client.Client.open(_normalize_catalog_url(catalog_url), modifier=pc.sign_inplace)


def _read_acs_zip_entries(path: Optional[str]) -> List[str]:
    p = (path or "").strip()
    if not p:
        return []
    if not os.path.isfile(p):
        raise HTTPException(status_code=400, detail=f"ACS zip file not found: {p}")
    try:
        with zipfile.ZipFile(p, "r") as zf:
            return [n for n in zf.namelist() if n.lower().endswith(".acs")]
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ACS zip file: {p}") from exc


def _stack(
    items: List[Any],
    assets: List[str],
    bbox: tuple[float, float, float, float],
    *,
    resolution: int = 20,
    tile_size: int = 1024,
) -> xr.DataArray:
    return stackstac.stack(
        items,
        assets=assets,
        bounds_latlon=bbox,
        resolution=max(5, min(120, int(resolution))),
        epsg=4326,
        chunksize=max(256, min(4096, int(tile_size))),
        fill_value=np.nan,
    ).astype("float32")


def _clip_metric_to_aoi(metric: xr.DataArray, aoi_geom: Dict[str, Any], bbox: tuple[float, float, float, float]) -> xr.DataArray:
    """Mask pixels outside AOI polygon for true clip-to-AOI statistics."""
    x = metric.coords.get("x")
    y = metric.coords.get("y")
    if x is None or y is None:
        return metric
    width = int(x.size)
    height = int(y.size)
    if width <= 1 or height <= 1:
        return metric

    w, s, e, n = bbox
    transform = from_bounds(w, s, e, n, width, height)
    inside_mask = geometry_mask(
        [aoi_geom],
        out_shape=(height, width),
        transform=transform,
        invert=True,
        all_touched=False,
    )
    mask_da = xr.DataArray(inside_mask, coords={"y": metric["y"], "x": metric["x"]}, dims=("y", "x"))
    return metric.where(mask_da)


def _compute(template_id: str, arr: xr.DataArray) -> xr.DataArray:
    t = TEMPLATES[template_id]
    bands = t["bands"]
    if t["kind"] == "index":
        if template_id in ("ndvi_s2", "ndvi_landsat"):
            red = arr.sel(band=bands["red"])
            nir = arr.sel(band=bands["nir"])
            return (nir - red) / (nir + red + 1e-6)
        if template_id == "ndmi_s2":
            nir = arr.sel(band=bands["nir"])
            swir = arr.sel(band=bands["swir"])
            return (nir - swir) / (nir + swir + 1e-6)
    # For RGB templates, return normalized first display channel as quick analytics surface.
    r = arr.sel(band=bands["r"])
    return r / (r.max(skipna=True) + 1e-6)


@router.get("/templates")
def templates():
    return {
        "catalog_url": MPC_STAC_URL,
        "stac_api": f"{MPC_STAC_URL}/search",
        "templates": [{"id": k, "label": v["label"], "collections": v.get("collections", [])} for k, v in TEMPLATES.items()],
        "arcgis": {
            "documentation_urls": [
                "https://planetarycomputer.microsoft.com/catalog",
                "https://github.com/Esri/arcgis-for-mpc",
            ]
        },
    }


@router.post("/process")
def process(req: MpcProcessRequest):
    if req.template_id not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template: {req.template_id}")

    template = TEMPLATES[req.template_id]
    collections = req.collections or template.get("collections", [])
    if not collections:
        raise HTTPException(status_code=400, detail="At least one collection is required")

    try:
        bbox = shape(req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi).bounds
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid AOI geometry: {exc}") from exc

    query: Dict[str, Any] = {}
    if req.max_cloud_cover is not None:
        query["eo:cloud_cover"] = {"lt": float(req.max_cloud_cover)}

    cat = _catalog(req.catalog_url)
    search = cat.search(
        collections=collections,
        intersects=req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi,
        datetime=req.datetime,
        query=query if query else None,
        limit=max(1, min(200, int(req.max_items))),
    )
    items = list(search.items())
    if not items:
        raise HTTPException(status_code=404, detail="No STAC items found for the requested AOI/date range")

    arr = _stack(
        items,
        template["assets"],
        bbox,
        resolution=req.resolution,
        tile_size=req.tile_size,
    )
    metric = _compute(req.template_id, arr).median(dim="time", skipna=True)
    if req.clip_to_aoi:
        metric = _clip_metric_to_aoi(metric, req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi, bbox)
    metric = metric.where(np.isfinite(metric))

    min_v = float(metric.min(skipna=True).compute().item())
    max_v = float(metric.max(skipna=True).compute().item())
    mean_v = float(metric.mean(skipna=True).compute().item())
    std_v = float(metric.std(skipna=True).compute().item())
    if not all(np.isfinite(v) for v in (min_v, max_v, mean_v, std_v)):
        raise HTTPException(status_code=422, detail="No valid pixels after clipping/filtering. Expand AOI or disable clip-to-AOI.")

    acs_entries = _read_acs_zip_entries(req.acs_zip_path)

    return {
        "ok": True,
        "template_id": req.template_id,
        "label": template["label"],
        "collections": collections,
        "datetime": req.datetime,
        "item_count": len(items),
        "scene_datetimes": [str(getattr(item, "datetime", "") or "") for item in items[:10]],
        "statistics": {"min": min_v, "max": max_v, "mean": mean_v, "std": std_v},
        "detail": f"Processed with stackstac assets: {', '.join(template['assets'])}",
        "catalog_url": _normalize_catalog_url(req.catalog_url),
        "processing": {
            "clip_to_aoi": req.clip_to_aoi,
            "tile_size": max(256, min(4096, int(req.tile_size))),
            "resolution": max(5, min(120, int(req.resolution))),
            "mode": "tile-based on-the-fly",
        },
        "acs": {
            "zip_path": req.acs_zip_path,
            "entries_count": len(acs_entries),
            "entries_preview": acs_entries[:10],
        },
    }
