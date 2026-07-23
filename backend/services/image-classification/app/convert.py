"""
Raster format conversion (JPEG 2000 / GDAL-only formats → web GeoTIFF).

The Node backend can only tile plain GeoTIFFs (via geotiff.js) and baked PNG/JPEG.
Formats such as JPEG 2000 (Pléiades Neo `.JP2`) need GDAL/OpenJPEG, which rasterio
provides here. We read the source (including its embedded ortho georeferencing),
reproject to Web Mercator (EPSG:3857 — the tiler's native CRS), and write a tiled,
deflate-compressed GeoTIFF next to the source so the existing XYZ tiler serves it.

Output is written into the SAME directory as the resolved source (the shared uploads
volume), so the Node side simply reads `<rasterDir>/cog.tif` afterwards.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import numpy as np
import rasterio
from affine import Affine
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds

from app.segmentation import _resolve_raster_path

DEFAULT_DST_CRS = "EPSG:3857"
# Cap the converted raster so tiling stays responsive; ortho scenes can be huge.
DEFAULT_MAX_DIM = 8192


def convert_to_web_geotiff(
    *,
    source_candidates: List[Optional[str]],
    dest_name: str = "cog.tif",
    dst_crs: str = DEFAULT_DST_CRS,
    max_dim: int = DEFAULT_MAX_DIM,
) -> Dict[str, Any]:
    src_path = _resolve_raster_path(source_candidates)
    dest_path = os.path.join(os.path.dirname(src_path), dest_name)

    with rasterio.open(src_path) as src:
        if not src.crs:
            raise ValueError(
                "This image has no embedded georeferencing (CRS). Provide a georeferenced "
                "product or a world-file/.prj sidecar."
            )
        count = src.count
        dtype = src.dtypes[0]

        transform, width, height = calculate_default_transform(
            src.crs, dst_crs, src.width, src.height, *src.bounds
        )

        # Downscale the target grid if the reprojected image would be very large.
        longest = max(width, height)
        if longest > max_dim:
            factor = max_dim / float(longest)
            new_width = max(1, int(round(width * factor)))
            new_height = max(1, int(round(height * factor)))
            transform = transform * Affine.scale(width / new_width, height / new_height)
            width, height = new_width, new_height

        profile = {
            "driver": "GTiff",
            "dtype": dtype,
            "count": count,
            "crs": dst_crs,
            "transform": transform,
            "width": width,
            "height": height,
            "tiled": True,
            "blockxsize": 512,
            "blockysize": 512,
            "compress": "deflate",
            "predictor": 2,
            "BIGTIFF": "IF_SAFER",
        }
        nodata = src.nodata
        if nodata is not None:
            profile["nodata"] = nodata

        with rasterio.open(dest_path, "w", **profile) as dst:
            for i in range(1, count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=dst_crs,
                    resampling=Resampling.bilinear,
                )

    with rasterio.open(dest_path) as out:
        west, south, east, north = transform_bounds(out.crs, "EPSG:4326", *out.bounds)
        res_m = float(abs(out.res[0]))

    return {
        "dest_path": dest_path,
        "crs": str(dst_crs),
        "bbox_wgs84": {
            "west": float(west),
            "south": float(south),
            "east": float(east),
            "north": float(north),
        },
        "width": int(width),
        "height": int(height),
        "bands": int(count),
        "resolution_m": res_m,
    }
