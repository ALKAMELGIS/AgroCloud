"""
On-demand Fields of the World (FTW) baseline model inference.

Runs the official ``ftw-tools`` CLI (``ftw inference all``) for a request bbox —
Sentinel-2 scene select → download → model run → polygonize — then normalizes
polygons into the same GeoJSON feature schema as FoW / Delineate.

Requires ``ftw-tools`` installed and ``FTW_INFER_ENABLED=1``.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fow_aoi import _clip_features, _feature_from_geom, _instance_color

ProgressCb = Callable[[float, str], None]

ENGINE = "ftw-infer"

FTW_INFER_ENABLED = os.environ.get("FTW_INFER_ENABLED", "1").strip() not in (
    "0",
    "false",
    "False",
    "",
)
FTW_INFER_MODEL = os.environ.get(
    "FTW_INFER_MODEL",
    "FTW_PRUE_EFNET_B5",
).strip() or "FTW_PRUE_EFNET_B5"
FTW_INFER_WORKDIR = os.environ.get("FTW_INFER_WORKDIR", "").strip()
FTW_INFER_MAX_SPAN_DEG = float(os.environ.get("FTW_INFER_MAX_SPAN_DEG", "1.0"))
FTW_INFER_GPU = int(os.environ.get("FTW_INFER_GPU", "-1"))
FTW_INFER_TIMEOUT_S = int(os.environ.get("FTW_INFER_TIMEOUT_S", "2400"))
FTW_INFER_CLOUD_COVER_MAX = int(os.environ.get("FTW_INFER_CLOUD_COVER_MAX", "20"))
FTW_INFER_BUFFER_DAYS = int(os.environ.get("FTW_INFER_BUFFER_DAYS", "14"))
FTW_INFER_RESIZE_FACTOR = int(os.environ.get("FTW_INFER_RESIZE_FACTOR", "2"))
FTW_INFER_STAC_HOST = os.environ.get("FTW_INFER_STAC_HOST", "mspc").strip() or "mspc"
# DataLoader sizing. The CLI defaults (4 workers / batch 2) spawn four torch
# processes that each reserve an OpenBLAS thread arena per core; on a CPU-only
# box that exhausts RAM and the workers die ("DataLoader worker exited
# unexpectedly"). Stay single-worker unless a GPU is selected.
FTW_INFER_NUM_WORKERS = max(
    1,
    int(os.environ.get("FTW_INFER_NUM_WORKERS", "").strip() or (1 if FTW_INFER_GPU < 0 else 4)),
)
FTW_INFER_BATCH_SIZE = max(
    1,
    int(os.environ.get("FTW_INFER_BATCH_SIZE", "").strip() or (1 if FTW_INFER_GPU < 0 else 2)),
)
# Threads each BLAS backend may pre-allocate inside every worker process.
FTW_INFER_BLAS_THREADS = max(1, int(os.environ.get("FTW_INFER_BLAS_THREADS", "1")))
# Optional stepwise fallback scene IDs (when ``ftw inference all`` is unavailable).
FTW_INFER_WIN_A = os.environ.get("FTW_INFER_WIN_A", "").strip()
FTW_INFER_WIN_B = os.environ.get("FTW_INFER_WIN_B", "").strip()

# Legacy / docstring checkpoint ids → published ftw-tools registry keys.
_FTW_MODEL_ALIASES = {
    "FTW_3_Class_FULL_multiWindow": "FTW_v2_3_Class_FULL_multiWindow",
    "FTW_3_Class_FULL_singleWindow": "FTW_v2_3_Class_FULL_singleWindow",
    "FTW_3_Class_CCBY_multiWindow": "FTW_v1_3_Class_CCBY",
    "FTW_2_Class_FULL": "FTW_v1_2_Class_FULL",
    "FTW_2_Class_CCBY": "FTW_v1_2_Class_CCBY",
    # Docstring / older env typos (CCBY is not always in the free registry).
    "FTW_PRUE_EFNET_B5_CCBY": "FTW_PRUE_EFNET_B5",
    "FTW_PRUE_EFNET_B5_CC-BY": "FTW_PRUE_EFNET_B5",
    "PRUE_EFNET_B5": "FTW_PRUE_EFNET_B5",
    "FTW_PRUE": "FTW_PRUE_EFNET_B5",
}

# Prefer these known-good ids when the requested checkpoint is missing.
_FTW_PREFERRED_MODELS = (
    "FTW_PRUE_EFNET_B5",
    "FTW_PRUE_EFNET_B4",
    "FTW_v2_3_Class_FULL_multiWindow",
    "FTW_v2_3_Class_FULL_singleWindow",
    "FTW_v1_3_Class_CCBY",
    "FTW_v1_2_Class_FULL",
    "FTW_v1_2_Class_CCBY",
)


def _resolve_infer_model(name: str | None) -> str:
    """
    Map client/env model ids onto a key that exists in the installed registry.

    Never forward an unknown string to ``ftw inference`` (that surfaces as
    ``Invalid value for '--model'`` / the UI 'FTW model id invalid' banner).
    """
    raw = (name or "").strip() or "FTW_PRUE_EFNET_B5"
    raw = _FTW_MODEL_ALIASES.get(raw, raw)
    try:
        from ftw_tools.inference.model_registry import MODEL_REGISTRY

        keys = list(MODEL_REGISTRY.keys())
        if raw in MODEL_REGISTRY:
            return raw
        lowered = raw.lower()
        for key in keys:
            if key.lower() == lowered:
                return key
        # Partial match (e.g. ...EFNET_B5 substring) before preferred list.
        for key in keys:
            if "PRUE" in key.upper() and "B5" in key.upper():
                return key
        for pref in _FTW_PREFERRED_MODELS:
            if pref in MODEL_REGISTRY:
                return pref
            for key in keys:
                if key.lower() == pref.lower():
                    return key
        for key, spec in MODEL_REGISTRY.items():
            if getattr(spec, "default", False):
                return key
        if keys:
            return keys[0]
    except Exception:  # noqa: BLE001
        pass
    # Last resort — published baseline id (CLI still validates).
    return "FTW_PRUE_EFNET_B5"


_STDERR_SNIPPET = 2400

# Signature of a torch DataLoader worker dying from host memory pressure.
_WORKER_CRASH_RE = re.compile(
    r"DataLoader worker .*exited unexpectedly"
    r"|OpenBLAS error: Memory allocation"
    r"|BLAS : Program is Terminated"
    r"|Cannot allocate memory"
    r"|paging file is too small"
    r"|std::bad_alloc",
    re.I,
)


def _is_worker_crash(text: str) -> bool:
    return bool(_WORKER_CRASH_RE.search(text or ""))


def _blas_env(threads: int) -> dict[str, str]:
    """Cap per-process BLAS thread arenas so parallel workers fit in RAM."""
    value = str(max(1, int(threads)))
    return {
        "OMP_NUM_THREADS": value,
        "OPENBLAS_NUM_THREADS": value,
        "MKL_NUM_THREADS": value,
        "NUMEXPR_NUM_THREADS": value,
        "VECLIB_MAXIMUM_THREADS": value,
    }


_STAGE_PATTERNS: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"polygon", re.I), 0.85, "polygonize"),
    (re.compile(r"\b(inferen|predict|running model|checkpoint|patch)\b", re.I), 0.55, "run"),
    (re.compile(r"\b(download|fetch|stac|scene|crop.?calendar|imagery)\b", re.I), 0.25, "download"),
]


def _max_safe_year() -> int:
    """The crop-calendar scene pick rejects harvest dates in the future."""
    return max(2015, datetime.now(timezone.utc).year - 1)


def _default_year() -> int:
    raw = os.environ.get("FTW_INFER_YEAR", "").strip()
    if raw:
        return int(raw)
    return _max_safe_year()


def _enabled() -> bool:
    return FTW_INFER_ENABLED


def ftw_infer_available() -> bool:
    """True when the engine is enabled and the ``ftw`` CLI / package is present."""
    if not _enabled():
        return False
    if shutil.which("ftw"):
        return True
    try:
        import ftw_tools  # noqa: F401

        return True
    except ImportError:
        return False


def _ftw_cmd() -> list[str]:
    which = shutil.which("ftw")
    if which:
        return [which]
    # Fallback: invoke via current interpreter entry point module if installed.
    return [sys.executable, "-m", "ftw_tools.cli"]


def _validate_bbox(bbox: list[float]) -> tuple[float, float, float, float]:
    if len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")
    west, south, east, north = (float(v) for v in bbox)
    if east <= west or north <= south:
        raise ValueError("Invalid bbox.")
    span_x = east - west
    span_y = north - south
    if span_x > FTW_INFER_MAX_SPAN_DEG or span_y > FTW_INFER_MAX_SPAN_DEG:
        raise ValueError(
            f"AOI too large for FTW inference — zoom in "
            f"(max ~{FTW_INFER_MAX_SPAN_DEG}° span; got {span_x:.3f}°×{span_y:.3f}°)."
        )
    return west, south, east, north


def _snip(text: str, limit: int = _STDERR_SNIPPET) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return "…" + text[-limit:]


def _emit(progress: ProgressCb | None, pct: float, stage: str) -> None:
    if progress:
        progress(pct, stage)


def _update_stage_from_line(line: str, progress: ProgressCb | None, best: list[float]) -> None:
    for pat, pct, stage in _STAGE_PATTERNS:
        if pat.search(line) and pct >= best[0]:
            best[0] = pct
            _emit(progress, pct, stage)
            return


def _run_cli(
    args: list[str],
    *,
    progress: ProgressCb | None = None,
    cwd: str | None = None,
    timeout_s: int | None = None,
    blas_threads: int | None = None,
) -> str:
    cmd = _ftw_cmd() + args
    env = os.environ.copy()
    # Prefer unbuffered logs so stage parsing works while subprocess runs.
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.update(_blas_env(blas_threads if blas_threads is not None else FTW_INFER_BLAS_THREADS))
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            env=env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "ftw CLI not found. Install ftw-tools "
            "(pip install 'ftw-tools @ git+https://github.com/fieldsoftheworld/ftw-baselines.git') "
            "and ensure `ftw` is on PATH."
        ) from exc

    chunks: list[str] = []
    best = [0.15]
    deadline = time.monotonic() + float(timeout_s or FTW_INFER_TIMEOUT_S)
    assert proc.stdout is not None
    while True:
        if time.monotonic() > deadline:
            proc.kill()
            try:
                proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(
                f"ftw inference timed out after {timeout_s or FTW_INFER_TIMEOUT_S}s. "
                f"Output: {_snip(''.join(chunks))}"
            )
        line = proc.stdout.readline()
        if line:
            chunks.append(line)
            _update_stage_from_line(line, progress, best)
            continue
        if proc.poll() is not None:
            break
        time.sleep(0.05)

    # Drain remainder
    rest = proc.stdout.read()
    if rest:
        chunks.append(rest)
        for ln in rest.splitlines():
            _update_stage_from_line(ln, progress, best)

    out = "".join(chunks)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ftw {' '.join(args[:3])} failed (exit {proc.returncode}): {_snip(out)}"
        )
    return out


def _find_vector_outputs(out_dir: Path) -> list[Path]:
    """Prefer geojson, then parquet / other vector formats produced by ``ftw``."""
    preferred_names = (
        "polygons.geojson",
        "polygons.json",
        "polygons.ndjson",
        "polygons.parquet",
        "polygons.gpkg",
        "polygons.fgb",
    )
    found: list[Path] = []
    for name in preferred_names:
        p = out_dir / name
        if p.is_file() and p.stat().st_size > 0:
            found.append(p)
    # Also accept any *.geojson / *.parquet in the workdir root
    for pat in ("*.geojson", "*.json", "*.parquet"):
        for p in sorted(out_dir.glob(pat)):
            if p not in found and p.is_file() and p.stat().st_size > 0:
                found.append(p)
    return found


def _load_geoms_from_geojson(path: Path) -> list[Any]:
    from shapely.geometry import shape
    from shapely.validation import make_valid

    raw = json.loads(path.read_text(encoding="utf-8"))
    feats = raw.get("features") if isinstance(raw, dict) else None
    if feats is None and isinstance(raw, dict) and raw.get("type") in ("Polygon", "MultiPolygon"):
        feats = [{"geometry": raw, "properties": {}}]
    if not isinstance(feats, list):
        # NDJSON
        geoms: list[Any] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            g = obj.get("geometry") if isinstance(obj, dict) else None
            if g:
                try:
                    geoms.append(make_valid(shape(g)))
                except Exception:  # noqa: BLE001
                    continue
        return geoms

    geoms = []
    for f in feats:
        if not isinstance(f, dict):
            continue
        g = f.get("geometry")
        if not g:
            continue
        try:
            geoms.append(make_valid(shape(g)))
        except Exception:  # noqa: BLE001
            continue
    return geoms


def _load_geoms_geopandas(path: Path) -> list[Any]:
    import geopandas as gpd
    from shapely.validation import make_valid

    gdf = gpd.read_file(path)
    if gdf.crs is not None and str(gdf.crs).upper() not in ("EPSG:4326", "WGS84", "OGC:CRS84"):
        gdf = gdf.to_crs(4326)
    geoms: list[Any] = []
    for g in gdf.geometry:
        if g is None or g.is_empty:
            continue
        try:
            geoms.append(make_valid(g))
        except Exception:  # noqa: BLE001
            continue
    return geoms


def _load_geoms_duckdb(path: Path) -> list[Any]:
    import duckdb
    from shapely import wkb as shapely_wkb
    from shapely.validation import make_valid

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    # Escape single quotes in path for SQL literal
    lit = str(path).replace("'", "''")
    if path.suffix.lower() == ".parquet":
        q = f"SELECT ST_AsWKB(ST_Transform(geometry, 'EPSG:4326', always_xy := true)) FROM read_parquet('{lit}')"
        try:
            rows = con.execute(q).fetchall()
        except Exception:  # noqa: BLE001
            # Already lon/lat or no ST_Transform support
            rows = con.execute(
                f"SELECT ST_AsWKB(geometry) FROM read_parquet('{lit}')"
            ).fetchall()
    else:
        rows = con.execute(
            f"SELECT ST_AsWKB(geometry) FROM ST_Read('{lit}')"
        ).fetchall()

    geoms: list[Any] = []
    for (raw,) in rows:
        if raw is None:
            continue
        try:
            geoms.append(make_valid(shapely_wkb.loads(bytes(raw))))
        except Exception:  # noqa: BLE001
            continue
    return geoms


def _load_geometries(path: Path) -> list[Any]:
    suffix = path.suffix.lower()
    if suffix in (".geojson", ".json", ".ndjson"):
        return _load_geoms_from_geojson(path)
    errors: list[str] = []
    try:
        return _load_geoms_geopandas(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"geopandas: {exc}")
    try:
        return _load_geoms_duckdb(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"duckdb: {exc}")
    raise RuntimeError(
        f"Could not read FTW vector output {path.name}: {'; '.join(errors)}"
    )


def _polygonize_fallback(
    out_dir: Path,
    *,
    min_area_m2: float,
    progress: ProgressCb | None,
) -> Path | None:
    """If ``all`` left a raster but no usable vectors, polygonize to GeoJSON."""
    raster = out_dir / "inference_output.tif"
    if not raster.is_file():
        candidates = list(out_dir.glob("*_output*.tif")) + list(out_dir.glob("*inf*.tif"))
        raster = candidates[0] if candidates else raster
    if not raster.is_file():
        return None
    geojson_out = out_dir / "polygons.geojson"
    _emit(progress, 0.8, "polygonize")
    try:
        from field_mask_refine import ftw_polygonize_min_size_m2, refine_ftw_prediction_geotiff

        refined = out_dir / "inference_output_refined.tif"
        refine_ftw_prediction_geotiff(
            str(raster),
            min_area_m2=float(min_area_m2),
            out_path=str(refined),
        )
        if refined.is_file():
            raster = refined
        poly_min = ftw_polygonize_min_size_m2(float(min_area_m2))
    except Exception as refine_exc:  # noqa: BLE001
        print(f"[ftw-infer] mask refine FAILED (using raw pred): {refine_exc}", flush=True)
        poly_min = max(500.0, float(min_area_m2))
    _run_cli(
        [
            "inference",
            "polygonize",
            str(raster),
            "--out",
            str(geojson_out),
            "--overwrite",
            "--min_size",
            str(max(0.0, float(poly_min))),
        ],
        progress=progress,
        cwd=str(out_dir),
    )
    return geojson_out if geojson_out.is_file() else None


def _run_inference_all(
    out_dir: Path,
    *,
    west: float,
    south: float,
    east: float,
    north: float,
    year: int,
    model: str,
    progress: ProgressCb | None,
) -> None:
    bbox_txt = f"{west},{south},{east},{north}"

    def build(num_workers: int, batch_size: int) -> list[str]:
        return [
            "inference",
            "all",
            "--out",
            str(out_dir),
            "--model",
            model,
            "--year",
            str(year),
            "--bbox",
            bbox_txt,
            "--cloud_cover_max",
            str(FTW_INFER_CLOUD_COVER_MAX),
            "--buffer_days",
            str(FTW_INFER_BUFFER_DAYS),
            "--resize_factor",
            str(FTW_INFER_RESIZE_FACTOR),
            "--gpu",
            str(FTW_INFER_GPU),
            "--stac_host",
            FTW_INFER_STAC_HOST,
            "--num_workers",
            str(num_workers),
            "--batch_size",
            str(batch_size),
            "--overwrite",
        ]

    attempts: list[tuple[int, int, int]] = [
        (FTW_INFER_NUM_WORKERS, FTW_INFER_BATCH_SIZE, FTW_INFER_BLAS_THREADS)
    ]
    if (FTW_INFER_NUM_WORKERS, FTW_INFER_BATCH_SIZE, FTW_INFER_BLAS_THREADS) != (1, 1, 1):
        attempts.append((1, 1, 1))

    _emit(progress, 0.15, "download")
    last: Exception | None = None
    for workers, batch, threads in attempts:
        try:
            _run_cli(
                build(workers, batch),
                progress=progress,
                cwd=str(out_dir),
                blas_threads=threads,
            )
            return
        except RuntimeError as exc:
            last = exc
            # Retry smaller only when the workers were starved of memory.
            if not _is_worker_crash(str(exc)):
                raise
            _emit(progress, 0.15, "retrying with lower memory settings")
    raise last if last else RuntimeError("ftw inference all failed.")


def _run_inference_stepwise(
    out_dir: Path,
    *,
    west: float,
    south: float,
    east: float,
    north: float,
    model: str,
    min_area_m2: float,
    progress: ProgressCb | None,
    win_a: str | None = None,
    win_b: str | None = None,
) -> None:
    """
    download → run → polygonize for two explicit Sentinel-2 scenes.

    Used both when the caller pinned a date window (scenes resolved from STAC)
    and as the WIN_A/WIN_B fallback when ``ftw inference all`` cannot run.
    """
    win_a = (win_a or FTW_INFER_WIN_A).strip()
    win_b = (win_b or FTW_INFER_WIN_B).strip()
    if not win_a or not win_b:
        raise RuntimeError(
            "ftw inference all failed and no stepwise fallback is configured. "
            "Set FTW_INFER_WIN_A and FTW_INFER_WIN_B to Sentinel-2 scene IDs, "
            "or fix the `all` pipeline error above."
        )
    bbox_txt = f"{west},{south},{east},{north}"
    stacked = out_dir / "inference_data.tif"
    pred = out_dir / "inference_output.tif"
    geojson_out = out_dir / "polygons.geojson"

    _emit(progress, 0.2, "download")
    _run_cli(
        [
            "inference",
            "download",
            "--win_a",
            win_a,
            "--win_b",
            win_b,
            "--out",
            str(stacked),
            "--bbox",
            bbox_txt,
            "--overwrite",
        ],
        progress=progress,
        cwd=str(out_dir),
    )

    _emit(progress, 0.5, "run")
    _run_cli(
        [
            "inference",
            "run",
            str(stacked),
            "--model",
            model,
            "--out",
            str(pred),
            "--gpu",
            str(FTW_INFER_GPU),
            "--resize_factor",
            str(FTW_INFER_RESIZE_FACTOR),
            "--num_workers",
            str(FTW_INFER_NUM_WORKERS),
            "--batch_size",
            str(FTW_INFER_BATCH_SIZE),
            "--overwrite",
        ],
        progress=progress,
        cwd=str(out_dir),
    )

    _emit(progress, 0.8, "polygonize")
    try:
        from field_mask_refine import ftw_polygonize_min_size_m2, refine_ftw_prediction_geotiff

        refined_pred = out_dir / "inference_output_refined.tif"
        refine_ftw_prediction_geotiff(
            str(pred),
            min_area_m2=float(min_area_m2),
            out_path=str(refined_pred),
        )
        if refined_pred.is_file():
            pred = refined_pred
            print(f"[ftw-infer] mask refine ok → {refined_pred.name}", flush=True)
        poly_min = ftw_polygonize_min_size_m2(float(min_area_m2))
    except Exception as refine_exc:  # noqa: BLE001
        print(f"[ftw-infer] mask refine FAILED (using raw pred): {refine_exc}", flush=True)
        poly_min = max(500.0, float(min_area_m2))

    _run_cli(
        [
            "inference",
            "polygonize",
            str(pred),
            "--out",
            str(geojson_out),
            "--overwrite",
            "--min_size",
            str(max(0.0, float(poly_min))),
        ],
        progress=progress,
        cwd=str(out_dir),
    )


def _normalize_features(
    geoms: list[Any],
    *,
    mid_lat: float,
    aoi_geom,
    min_area_m2: float,
) -> list[dict]:
    from field_geom_postprocess import improve_field_geometries

    geoms = improve_field_geometries(
        geoms,
        mid_lat=mid_lat,
        min_area_m2=min_area_m2,
    )

    features: list[dict] = []
    for i, g in enumerate(geoms, start=1):
        feat = _feature_from_geom(g, i, ENGINE, mid_lat)
        if not feat:
            continue
        area = float((feat["properties"] or {}).get("area_m2") or 0)
        if area < max(10.0, min_area_m2 * 0.25):
            continue
        props = dict(feat.get("properties") or {})
        props["detection_engine"] = ENGINE
        props["source_image"] = "FTW baseline (Sentinel-2)"
        props["geom_postprocess"] = "field_geom_v1"
        feat["properties"] = props
        features.append(feat)

    features = _clip_features(features, aoi_geom)
    for i, f in enumerate(features, start=1):
        props = dict(f.get("properties") or {})
        props["field_id"] = f"FTW-{i:05d}"
        props["fill_color"] = _instance_color(i)
        props["stroke_color"] = "#ffffff"
        props["detection_engine"] = ENGINE
        props["source_image"] = "FTW baseline (Sentinel-2)"
        f["id"] = props["field_id"]
        f["properties"] = props
    return features


def _scenes_for_window(
    bbox: tuple[float, float, float, float],
    window: tuple[str, str],
) -> tuple[str, str]:
    """Resolve the early/late Sentinel-2 pair for a user-picked date window."""
    from ftw_live import select_scenes_in_window

    return select_scenes_in_window(
        bbox,
        date_from=window[0],
        date_to=window[1],
        cloud_cover_max=FTW_INFER_CLOUD_COVER_MAX,
    )


def run_ftw_inference(
    bbox: list[float],
    aoi_geom=None,
    min_area_m2: float = 50.0,
    progress: ProgressCb | None = None,
    model_name: str | None = None,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """
    Run FTW baseline inference for ``bbox`` = [west, south, east, north].

    ``date_from`` / ``date_to`` (YYYY-MM-DD) pin the imagery to a window the user
    picked. ``ftw inference all`` only takes a year, so a pinned window resolves
    the two scenes from STAC and drives the download → run → polygonize steps
    directly. Without a window the crop calendar picks the season for ``year``.

    Returns the same result dict shape as ``query_fow_fields`` / ``/detect``.
    """
    west, south, east, north = _validate_bbox(bbox)

    if not _enabled():
        raise RuntimeError(
            "FTW inference is disabled (set FTW_INFER_ENABLED=1 to enable)."
        )
    if not ftw_infer_available():
        raise RuntimeError(
            "ftw-tools is not available. Install with: "
            "pip install 'ftw-tools @ git+https://github.com/fieldsoftheworld/ftw-baselines.git'"
        )

    mid_lat = (south + north) / 2.0
    from ftw_live import resolve_scene_window

    window = resolve_scene_window(date_from, date_to)
    if window:
        # STAC search drives scene choice; the year is reported, not clamped.
        year = int(window[0][:4])
    else:
        year = int(year) if year is not None and int(year) >= 2015 else _default_year()
        year = max(2015, min(year, _max_safe_year()))
    model = _resolve_infer_model(model_name or FTW_INFER_MODEL)

    _emit(progress, 0.05, "preparing")

    own_tmpdir: tempfile.TemporaryDirectory[str] | None = None
    if FTW_INFER_WORKDIR:
        base = Path(FTW_INFER_WORKDIR).expanduser()
        base.mkdir(parents=True, exist_ok=True)
        out_dir = Path(tempfile.mkdtemp(prefix="ftw-infer-", dir=str(base)))
    else:
        own_tmpdir = tempfile.TemporaryDirectory(prefix="ftw-infer-")
        out_dir = Path(own_tmpdir.name)

    all_err: Exception | None = None
    scenes: tuple[str, str] | None = None
    try:
        try:
            if window:
                _emit(progress, 0.1, "scene_selection")
                scenes = _scenes_for_window((west, south, east, north), window)
                _run_inference_stepwise(
                    out_dir,
                    west=west,
                    south=south,
                    east=east,
                    north=north,
                    model=model,
                    min_area_m2=min_area_m2,
                    progress=progress,
                    win_a=scenes[0],
                    win_b=scenes[1],
                )
            else:
                _run_inference_all(
                    out_dir,
                    west=west,
                    south=south,
                    east=east,
                    north=north,
                    year=year,
                    model=model,
                    progress=progress,
                )
        except Exception as exc:  # noqa: BLE001
            all_err = exc
            # Stepwise fallback when scene IDs are provided, else try polygonize-only salvage.
            # A pinned window already ran stepwise on its own scenes — never retry
            # with the env pair, that would silently analyse different imagery.
            if not window and FTW_INFER_WIN_A and FTW_INFER_WIN_B:
                try:
                    _run_inference_stepwise(
                        out_dir,
                        west=west,
                        south=south,
                        east=east,
                        north=north,
                        model=model,
                        min_area_m2=min_area_m2,
                        progress=progress,
                    )
                except Exception as step_exc:  # noqa: BLE001
                    raise RuntimeError(
                        f"{all_err} | stepwise fallback: {_snip(str(step_exc))}"
                    ) from all_err
            else:
                try:
                    salvaged = _polygonize_fallback(
                        out_dir, min_area_m2=min_area_m2, progress=progress
                    )
                except Exception as poly_exc:  # noqa: BLE001
                    raise RuntimeError(
                        f"{all_err} | polygonize salvage: {_snip(str(poly_exc))}"
                    ) from all_err
                if salvaged is None:
                    raise RuntimeError(str(all_err)) from all_err

        vectors = _find_vector_outputs(out_dir)
        if not vectors:
            salvaged = _polygonize_fallback(
                out_dir, min_area_m2=min_area_m2, progress=progress
            )
            if salvaged is not None:
                vectors = [salvaged]
        if not vectors:
            detail = _snip(str(all_err)) if all_err else "no polygons.parquet / geojson produced"
            raise RuntimeError(f"FTW inference produced no vector output ({detail}).")

        _emit(progress, 0.9, "normalize")
        geoms: list[Any] = []
        load_errors: list[str] = []
        for vpath in vectors:
            try:
                geoms = _load_geometries(vpath)
                if geoms:
                    break
            except Exception as exc:  # noqa: BLE001
                load_errors.append(f"{vpath.name}: {exc}")
        if not geoms:
            raise RuntimeError(
                "FTW inference wrote vectors but none could be read: "
                + ("; ".join(load_errors) or "empty geometry list")
            )

        features = _normalize_features(
            geoms,
            mid_lat=mid_lat,
            aoi_geom=aoi_geom,
            min_area_m2=min_area_m2,
        )

        _emit(progress, 1.0, "done")
        return {
            "geojson": {"type": "FeatureCollection", "features": features},
            "count": len(features),
            "stats": {"field": len(features)},
            "score": 0.9 if features else 0.0,
            "width": 0,
            "height": 0,
            "engine": ENGINE,
            "device": "cpu" if FTW_INFER_GPU < 0 else f"cuda:{FTW_INFER_GPU}",
            "source": ENGINE,
            "model": model,
            "year": year,
            "scenes": {"win_a": scenes[0], "win_b": scenes[1]} if scenes else None,
            "scene_window": {"from": window[0], "to": window[1]} if window else None,
            "aoi_applied": aoi_geom is not None,
        }
    finally:
        # Clean scratch after success or failure when we own the temp tree.
        if own_tmpdir is not None:
            try:
                own_tmpdir.cleanup()
            except Exception:  # noqa: BLE001
                pass
        elif out_dir.exists():
            try:
                shutil.rmtree(out_dir, ignore_errors=True)
            except Exception:  # noqa: BLE001
                pass
