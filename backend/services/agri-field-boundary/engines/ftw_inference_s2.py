"""
FTW Inference (S2 Model) — live Fields of the World segmentation on Sentinel-2 L2A.

Separate from FTW Global v3 (pre-computed PMTiles). Uses ftw-baselines CLI when
available, or reads vector output from a configured inference command.

Env:
  FTW_INFERENCE_BIN     — path to `ftw` CLI (default: search PATH)
  FTW_INFER_MODEL       — model registry id (default: FTW_PRUE_EFNET_B7)
  FTW_CHECKPOINT_PATH   — optional checkpoint under models/
  FTW_INFERENCE_CMD     — optional full command template with {bbox},{year},{out},{model}
                          (must invoke `ftw inference all`, not bare `ftw inference`)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_CKPT = MODELS_DIR / "prue_efnetb7_ccby_checkpoint.ckpt"


def build_ftw_inference_all_cmd(
    ftw_bin: str,
    bbox: list[float] | str,
    *,
    year: int,
    out_dir: str | Path,
    model: str,
    gpu: int = -1,
) -> str:
    """ftw-baselines 3.x — full S2 scene selection → download → infer → polygonize."""
    bbox_s = bbox if isinstance(bbox, str) else ",".join(str(float(v)) for v in bbox)
    model_q = model.replace('"', '\\"')
    return (
        f'"{ftw_bin}" inference all '
        f'--bbox {bbox_s} --model "{model_q}" --year {int(year)} '
        f'--out "{out_dir}" --overwrite --gpu {int(gpu)}'
    )


class FtwInferenceS2Engine:
    name = "ftw-inference-s2"

    def __init__(self) -> None:
        self.device = "cpu"
        self.available = False
        self.error: str | None = None
        self.model_id = os.environ.get("FTW_INFER_MODEL", "FTW_PRUE_EFNET_B7").strip()
        self.ftw_bin = shutil.which(os.environ.get("FTW_INFERENCE_BIN", "ftw").strip())
        self.checkpoint = Path(
            os.environ.get("FTW_CHECKPOINT_PATH", str(DEFAULT_CKPT)),
        ).expanduser()
        self._probe()

    def _resolve_model_arg(self) -> str:
        if self.checkpoint.is_file():
            return str(self.checkpoint)
        return self.model_id

    def _probe(self) -> None:
        if self.ftw_bin:
            self.available = True
            return
        custom = os.environ.get("FTW_INFERENCE_CMD", "").strip()
        if custom:
            self.available = True
            return
        if self.checkpoint.is_file():
            self.error = (
                "FTW checkpoint is present but the ftw-baselines CLI was not found on PATH. "
                "Install ftw-baselines or set FTW_INFERENCE_BIN / FTW_INFERENCE_CMD."
            )
            return
        self.error = (
            "FTW Inference (S2) is not configured. Install ftw-baselines CLI or place "
            f"prue_efnetb7_ccby_checkpoint.ckpt under {MODELS_DIR}. See models/README.md."
        )

    def status_payload(self) -> dict[str, Any]:
        ready = bool(self.ftw_bin or os.environ.get("FTW_INFERENCE_CMD", "").strip())
        return {
            "ready": ready,
            "architecture": "PRUE U-Net (EfficientNet-B7)",
            "model": self.model_id,
            "input": "Sentinel-2 L2A multispectral stack",
            "resolution_m": 10,
            "cli": self.ftw_bin,
            "checkpoint": str(self.checkpoint) if self.checkpoint.is_file() else None,
            "error": None if ready else self.error,
        }

    def infer_geojson(self, bbox: list[float], *, year: int) -> dict[str, Any]:
        if not self.available:
            raise RuntimeError(self.error or "FTW Inference (S2) is not available.")
        fc = self._run_cli_geojson(bbox, year=year)
        if fc.get("type") != "FeatureCollection":
            raise RuntimeError("FTW inference CLI returned invalid GeoJSON.")
        return fc

    def predict(
        self,
        bbox: list[float],
        *,
        year: int,
        min_confidence: float,
    ) -> list[tuple[np.ndarray, float]]:
        if not self.available:
            raise RuntimeError(self.error or "FTW Inference (S2) is not available.")
        geojson = self._run_cli_geojson(bbox, year=year)
        return self._geojson_to_mask_components(geojson, bbox, min_confidence)

    def _run_cli_geojson(self, bbox: list[float], *, year: int) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="ftw-infer-s2-") as tmp:
            out_dir = Path(tmp)
            bbox_s = ",".join(str(float(v)) for v in bbox)
            model_arg = self._resolve_model_arg()
            custom = os.environ.get("FTW_INFERENCE_CMD", "").strip()
            if custom:
                shell_cmd = custom.format(
                    bbox=bbox_s,
                    year=year,
                    out=str(out_dir),
                    model=model_arg,
                )
            else:
                if not self.ftw_bin:
                    raise RuntimeError(self.error or "FTW inference CLI not found.")
                shell_cmd = build_ftw_inference_all_cmd(
                    self.ftw_bin,
                    bbox_s,
                    year=year,
                    out_dir=out_dir,
                    model=model_arg,
                )
            proc = subprocess.run(
                shell_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=int(os.environ.get("FTW_INFERENCE_TIMEOUT_SEC", "900")),
            )
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout or "").strip()
                raise RuntimeError(
                    f"FTW inference CLI failed (exit {proc.returncode}). {err[:480]}",
                )
            return self._load_output_geojson(out_dir)

    def _load_output_geojson(self, out_dir: Path) -> dict[str, Any]:
        for name in ("fields.geojson", "output.geojson", "predictions.geojson", "polygons.geojson"):
            hit = out_dir / name
            if hit.is_file():
                return self._read_geojson_file(hit)
        for hit in out_dir.rglob("*.geojson"):
            try:
                payload = self._read_geojson_file(hit)
                if payload.get("type") == "FeatureCollection":
                    return payload
            except Exception:  # noqa: BLE001
                continue
        parquet = out_dir / "polygons.parquet"
        if parquet.is_file():
            return self._parquet_to_geojson(parquet)
        tif = out_dir / "inference_output.tif"
        if tif.is_file() and self.ftw_bin:
            return self._polygonize_tif_to_geojson(tif, out_dir)
        raise RuntimeError(
            "FTW inference CLI completed but no GeoJSON or polygons.parquet was found in the output directory.",
        )

    @staticmethod
    def _read_geojson_file(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _parquet_to_geojson(path: Path) -> dict[str, Any]:
        try:
            import geopandas as gpd
        except ImportError as exc:
            raise RuntimeError(
                "FTW produced polygons.parquet but geopandas is not installed. "
                "Install ftw-baselines (includes geopandas) or set FTW_INFERENCE_CMD.",
            ) from exc
        gdf = gpd.read_parquet(path)
        if gdf.crs is not None:
            try:
                if gdf.crs.to_epsg() != 4326:
                    gdf = gdf.to_crs(4326)
            except Exception:  # noqa: BLE001
                gdf = gdf.to_crs(4326)
        return json.loads(gdf.to_json())

    def _polygonize_tif_to_geojson(self, tif: Path, out_dir: Path) -> dict[str, Any]:
        if not self.ftw_bin:
            raise RuntimeError("FTW inference output raster found but ftw CLI is unavailable.")
        geo_path = out_dir / "fields.geojson"
        cmd = (
            f'"{self.ftw_bin}" inference polygonize "{tif}" '
            f'--out "{geo_path}" --overwrite --min_size 1'
        )
        proc = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("FTW_INFERENCE_TIMEOUT_SEC", "900")),
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(
                f"FTW polygonize failed (exit {proc.returncode}). {err[:480]}",
            )
        return self._read_geojson_file(geo_path)

    def _geojson_to_mask_components(
        self,
        fc: dict[str, Any],
        bbox: list[float],
        min_confidence: float,
    ) -> list[tuple[np.ndarray, float]]:
        from shapely.geometry import shape

        west, south, east, north = (float(v) for v in bbox)
        width = max(64, int((east - west) / 0.0001))
        height = max(64, int((north - south) / 0.0001))
        width = min(width, 4096)
        height = min(height, 4096)

        components: list[tuple[np.ndarray, float]] = []
        for feat in fc.get("features") or []:
            if not isinstance(feat, dict):
                continue
            props = feat.get("properties") or {}
            conf = float(props.get("confidence") or props.get("score") or props.get("conf") or 0.55)
            if conf < min_confidence:
                continue
            try:
                geom = shape(feat.get("geometry"))
            except Exception:  # noqa: BLE001
                continue
            if geom.is_empty:
                continue
            mask = np.zeros((height, width), dtype=bool)
            if geom.geom_type == "Polygon":
                polys = [geom]
            elif geom.geom_type == "MultiPolygon":
                polys = list(geom.geoms)
            else:
                continue
            for poly in polys:
                xs, ys = poly.exterior.coords.xy
                cols = [
                    int(round((float(x) - west) / max(east - west, 1e-12) * (width - 1)))
                    for x in xs
                ]
                rows = [
                    int(round((north - float(y)) / max(north - south, 1e-12) * (height - 1)))
                    for y in ys
                ]
                import cv2

                pts = np.array(list(zip(cols, rows)), dtype=np.int32)
                if len(pts) >= 3:
                    cv2.fillPoly(mask.view(np.uint8), [pts], 1)
            if mask.any():
                components.append((mask.astype(bool), conf))
        return components


_engine: FtwInferenceS2Engine | None = None


def get_ftw_inference_s2_engine() -> FtwInferenceS2Engine:
    global _engine
    if _engine is None:
        _engine = FtwInferenceS2Engine()
    return _engine
