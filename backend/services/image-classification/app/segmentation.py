"""
Object-based image segmentation (Step 2 of the Image Classification Wizard).

Runs skimage SLIC / Felzenszwalb over a decimated read of the source raster, then:
  * counts segments,
  * vectorizes segment boundaries to WGS84 GeoJSON (LineStrings) for a map preview,
  * persists the labelled segment raster (one segment id per pixel) for later steps.

The heavy pixel work stays server-side; the frontend only receives small JSON/GeoJSON.
"""
from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

import numpy as np
import rasterio
from affine import Affine
from rasterio.features import shapes as rio_shapes
from rasterio.warp import transform_bounds, transform_geom
from skimage.segmentation import felzenszwalb, slic

# Keep previews responsive: cap the working resolution and the boundary payload.
DEFAULT_MAX_PREVIEW_DIM = 1024
MAX_BOUNDARY_FEATURES = 8000


def _resolve_raster_path(candidates: List[Optional[str]]) -> str:
    """Return the first readable path among the candidates (docker /data or abs path)."""
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    tried = ", ".join(str(c) for c in candidates if c)
    raise FileNotFoundError(f"Raster file not found. Tried: {tried or '(none provided)'}")


def _decimation_out_shape(width: int, height: int, max_dim: int) -> tuple[int, int]:
    longest = max(width, height)
    if longest <= max_dim:
        return height, width
    scale = max_dim / float(longest)
    return max(1, int(round(height * scale))), max(1, int(round(width * scale)))


def _read_preview_stack(dataset, out_h: int, out_w: int) -> np.ndarray:
    """Read up to 3 bands, decimated to (out_h, out_w), stretched to [0,1] as float32 (H,W,C)."""
    band_count = min(3, dataset.count)
    indexes = list(range(1, band_count + 1))
    arr = dataset.read(indexes, out_shape=(band_count, out_h, out_w), masked=True)
    arr = np.ma.filled(arr.astype("float32"), np.nan)

    stretched = np.zeros_like(arr, dtype="float32")
    for band in range(band_count):
        channel = arr[band]
        finite = channel[np.isfinite(channel)]
        if finite.size == 0:
            continue
        lo, hi = np.percentile(finite, (2.0, 98.0))
        if hi <= lo:
            hi = lo + 1.0
        stretched[band] = np.clip((channel - lo) / (hi - lo), 0.0, 1.0)

    stretched = np.nan_to_num(stretched, nan=0.0)
    # (bands, H, W) -> (H, W, bands)
    return np.transpose(stretched, (1, 2, 0))


def _segment_labels(
    image: np.ndarray,
    algorithm: str,
    spectral_detail: float,
    spatial_detail: float,
    min_segment_size: int,
) -> np.ndarray:
    """Return an int label array (1-based) using the chosen algorithm + ArcGIS-style knobs."""
    h, w, _ = image.shape
    spectral_detail = float(np.clip(spectral_detail, 1.0, 20.0))
    spatial_detail = float(np.clip(spatial_detail, 1.0, 20.0))
    min_segment_size = max(1, int(min_segment_size))

    if algorithm == "felzenszwalb":
        # Higher spectral detail -> larger scale -> preserves finer spectral contrast.
        scale = spectral_detail * 20.0
        labels = felzenszwalb(image, scale=scale, sigma=0.8, min_size=min_segment_size)
        return labels.astype(np.int32) + 1

    # Default: SLIC superpixels.
    n_segments = int(50 * spatial_detail)  # spatial_detail 10 -> 500 superpixels
    n_segments = max(2, min(n_segments, h * w // 4 or 2))
    # Higher spectral detail -> lower compactness -> follows spectral edges more closely.
    compactness = max(0.1, 21.0 - spectral_detail)
    avg_region = max(1.0, (h * w) / float(n_segments))
    min_size_factor = float(np.clip(min_segment_size / avg_region, 0.05, 0.99))
    channel_axis = -1 if image.shape[2] > 1 else None
    labels = slic(
        image,
        n_segments=n_segments,
        compactness=compactness,
        sigma=1.0,
        start_label=1,
        enforce_connectivity=True,
        min_size_factor=min_size_factor,
        channel_axis=channel_axis,
    )
    return labels.astype(np.int32)


def _boundaries_geojson(labels: np.ndarray, transform: Affine, src_crs) -> Dict[str, Any]:
    """Vectorize label regions and return their outlines as a WGS84 LineString FeatureCollection."""
    features: List[Dict[str, Any]] = []
    for geom, value in rio_shapes(labels.astype(np.int32), transform=transform):
        if len(features) >= MAX_BOUNDARY_FEATURES:
            break
        try:
            geom_wgs84 = transform_geom(src_crs, "EPSG:4326", geom) if src_crs else geom
        except Exception:
            geom_wgs84 = geom
        rings = geom_wgs84.get("coordinates") or []
        if not rings:
            continue
        exterior = rings[0]
        if len(exterior) < 2:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"segment_id": int(value)},
                "geometry": {"type": "LineString", "coordinates": exterior},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def run_segmentation(
    *,
    raster_id: str,
    path_candidates: List[Optional[str]],
    algorithm: str = "slic",
    spectral_detail: float = 15.0,
    spatial_detail: float = 15.0,
    min_segment_size: int = 20,
    max_preview_dim: int = DEFAULT_MAX_PREVIEW_DIM,
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    algorithm = (algorithm or "slic").lower()
    if algorithm not in ("slic", "felzenszwalb"):
        algorithm = "slic"

    src_path = _resolve_raster_path(path_candidates)
    with rasterio.open(src_path) as dataset:
        out_h, out_w = _decimation_out_shape(dataset.width, dataset.height, max_preview_dim)
        image = _read_preview_stack(dataset, out_h, out_w)
        labels = _segment_labels(image, algorithm, spectral_detail, spatial_detail, min_segment_size)

        # Transform for the decimated grid (scale the source affine to the preview size).
        scale_x = dataset.width / float(out_w)
        scale_y = dataset.height / float(out_h)
        preview_transform = dataset.transform * Affine.scale(scale_x, scale_y)

        segment_count = int(np.unique(labels).size)
        boundaries = _boundaries_geojson(labels, preview_transform, dataset.crs)

        try:
            west, south, east, north = transform_bounds(
                dataset.crs, "EPSG:4326", *dataset.bounds
            ) if dataset.crs else (dataset.bounds.left, dataset.bounds.bottom, dataset.bounds.right, dataset.bounds.top)
        except Exception:
            west, south, east, north = (
                dataset.bounds.left,
                dataset.bounds.bottom,
                dataset.bounds.right,
                dataset.bounds.top,
            )

        segmentation_id = uuid.uuid4().hex
        dest_dir = os.path.join(output_dir, raster_id)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, f"segments_{segmentation_id}.tif")
        try:
            profile = {
                "driver": "GTiff",
                "height": labels.shape[0],
                "width": labels.shape[1],
                "count": 1,
                "dtype": "int32",
                "crs": dataset.crs,
                "transform": preview_transform,
                "compress": "deflate",
            }
            with rasterio.open(dest_path, "w", **profile) as dst:
                dst.write(labels.astype("int32"), 1)
        except Exception:
            dest_path = None  # persistence is best-effort for the preview step

    return {
        "segmentation_id": segmentation_id,
        "algorithm": algorithm,
        "segment_count": segment_count,
        "boundary_count": len(boundaries["features"]),
        "boundaries": boundaries,
        "bounds": [west, south, east, north],
        "labeled_raster_path": dest_path,
        "preview_size": {"width": out_w, "height": out_h},
        "params": {
            "spectral_detail": spectral_detail,
            "spatial_detail": spatial_detail,
            "min_segment_size": min_segment_size,
        },
    }
