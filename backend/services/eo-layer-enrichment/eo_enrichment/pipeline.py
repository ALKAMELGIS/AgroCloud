"""End-to-end EO enrichment pipeline for agricultural vector layers."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import geopandas as gpd

from .composites import compute_delta_stack, compute_full_index_stack
from .enrich import enrich_feature_row
from .imagery import (
    aoi_bbox_from_gdf,
    bands_as_dict,
    load_scene_stack,
    previous_scene,
    search_latest_s2,
)
from .schema import INDEX_NAMES
from .vector_io import (
    detect_format,
    ensure_attribute_fields,
    export_tables,
    load_vector,
    populate_geometry_attributes,
    save_vector,
)
from .zonal import vegetation_cover_percent, zonal_index_stats

ProgressCb = Callable[[str, float], None]


@dataclass
class EnrichmentConfig:
    input_path: str | Path
    output_dir: str | Path | None = None
    max_cloud: float = 20.0
    lookback_days: int = 365
    resolution: int = 20
    workers: int = 4
    include_previous: bool = True
    catalog_url: str | None = None
    progress: ProgressCb | None = None


@dataclass
class EnrichmentResult:
    gdf: gpd.GeoDataFrame
    output_vector: Path
    exports: dict[str, Path] = field(default_factory=dict)
    scene_id: str = ""
    acquisition_date: str = ""


def _p(cfg: EnrichmentConfig, msg: str, pct: float) -> None:
    if cfg.progress:
        cfg.progress(msg, pct)
    else:
        print(f"[{pct:5.1f}%] {msg}", flush=True)


def enrich_vector_layer(cfg: EnrichmentConfig) -> EnrichmentResult:
    """
    Load vector → ensure fields → latest S2 → indices → zonal stats →
    populate attributes → save native format + CSV/Excel/GeoJSON.
    """
    input_path = Path(cfg.input_path)
    out_dir = Path(cfg.output_dir) if cfg.output_dir else input_path.parent / f"{input_path.stem}_enriched"
    out_dir.mkdir(parents=True, exist_ok=True)

    _p(cfg, "Loading vector layer…", 2)
    gdf = load_vector(input_path)
    gdf = ensure_attribute_fields(gdf)
    gdf = populate_geometry_attributes(gdf)

    bbox = aoi_bbox_from_gdf(gdf)
    _p(cfg, "Searching latest cloud-free Sentinel-2…", 8)
    scene = search_latest_s2(
        bbox,
        max_cloud=cfg.max_cloud,
        lookback_days=cfg.lookback_days,
        catalog_url=cfg.catalog_url,
        progress=cfg.progress,
    )

    _p(cfg, f"Scene {scene.scene_id} ({scene.acquisition_date}, cloud {scene.cloud_cover:.1f}%)", 15)
    stack = load_scene_stack(scene.item, bbox, resolution=cfg.resolution, progress=cfg.progress)
    bands = bands_as_dict(stack)

    _p(cfg, "Calculating all Remote Sensing Layer indices…", 35)
    index_stack = compute_full_index_stack(bands)

    prev_ndvi_means: list[float | None] = [None] * len(gdf)
    if cfg.include_previous:
        _p(cfg, "Fetching previous scene for Δ / NCADI…", 42)
        prev = previous_scene(bbox, scene.acquisition_date, max_cloud=cfg.max_cloud)
        if prev is not None:
            try:
                prev_stack = load_scene_stack(prev.item, bbox, resolution=cfg.resolution)
                prev_bands = bands_as_dict(prev_stack)
                prev_idx = compute_full_index_stack(prev_bands)
                index_stack.update(compute_delta_stack(index_stack, prev_idx))
                prev_stats = zonal_index_stats(list(gdf.geometry), prev_idx["NDVI"])
                prev_ndvi_means = [s.get("mean") for s in prev_stats]
            except Exception as exc:  # noqa: BLE001
                _p(cfg, f"Previous scene skipped: {exc}", 45)

    _p(cfg, "Computing per-polygon zonal statistics for all indices…", 50)
    # Only zonalize layers that exist in the stack (deltas may be absent).
    active_names = [n for n in INDEX_NAMES if n in index_stack]
    all_stats: dict[str, list[dict]] = {}
    for i, name in enumerate(active_names):
        all_stats[name] = zonal_index_stats(list(gdf.geometry), index_stack[name])
        if (i + 1) % 8 == 0 or i + 1 == len(active_names):
            _p(
                cfg,
                f"Zonal stats {i + 1}/{len(active_names)} ({name})",
                50 + 10 * (i + 1) / max(len(active_names), 1),
            )

    scene_meta = {
        "scene_id": scene.scene_id,
        "acquisition_date": scene.acquisition_date,
        "cloud_cover": scene.cloud_cover,
        "satellite_name": scene.satellite_name,
        "source": scene.source,
        "resolution": cfg.resolution,
    }

    n = len(gdf)
    _p(cfg, f"Enriching {n} polygons…", 60)

    def _one(i: int) -> tuple[int, dict]:
        geom = gdf.geometry.iloc[i]
        per_index = {k: all_stats[k][i] for k in all_stats}
        veg = None
        try:
            veg = vegetation_cover_percent(index_stack["NDVI"], geom)
        except Exception:
            veg = None
        area = gdf.iloc[i].get("Estimated_Area_ha")
        attrs = enrich_feature_row(
            stats=per_index,
            veg_pct=veg,
            area_ha=float(area) if area is not None else None,
            scene=scene_meta,
            prev_ndvi=prev_ndvi_means[i],
        )
        return i, attrs

    results: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=max(1, cfg.workers)) as pool:
        futures = [pool.submit(_one, i) for i in range(n)]
        done = 0
        for fut in as_completed(futures):
            i, attrs = fut.result()
            results[i] = attrs
            done += 1
            if done % max(1, n // 20) == 0 or done == n:
                _p(cfg, f"Processing polygon {done}/{n}", 60 + 30 * done / max(n, 1))

    for i, attrs in results.items():
        for k, v in attrs.items():
            gdf.at[gdf.index[i], k] = v

    stem = f"{input_path.stem}_enriched"
    native_fmt = detect_format(input_path)
    ext_map = {"kmz": ".kmz", "kml": ".kml", "shp": ".shp", "geojson": ".geojson", "gpkg": ".gpkg"}
    out_vector = out_dir / f"{stem}{ext_map.get(native_fmt, '.gpkg')}"

    _p(cfg, "Saving enriched vector…", 92)
    save_vector(gdf, out_vector, fmt=native_fmt if native_fmt != "unknown" else "gpkg")
    exports = export_tables(gdf, out_dir, stem)

    _p(cfg, "Done.", 100)
    return EnrichmentResult(
        gdf=gdf,
        output_vector=out_vector,
        exports=exports,
        scene_id=scene.scene_id,
        acquisition_date=scene.acquisition_date,
    )
