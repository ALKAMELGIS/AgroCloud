"""
FTW Inference (S2 Model) — live Fields of the World segmentation on Sentinel-2 L2A.

Separate from FTW Global v3 (pre-computed PMTiles). Uses ftw-baselines CLI when
available, or reads vector output from a configured inference command.

Env:
  FTW_INFERENCE_BIN     — path to `ftw` CLI (default: search PATH)
  FTW_INFER_MODEL       — model registry id (default: FTW_PRUE_EFNET_B7)
  FTW_INFER_FAST        — 1 (default): B5 + resize_factor=4 for ~30-90s CPU runs. Set 0 for B7 quality.
  FTW_INFER_GPU         — GPU index (-1=CPU/auto). Auto-uses CUDA when available.
  FTW_INFER_RESIZE_FACTOR, FTW_INFER_BATCH_SIZE, FTW_INFER_NUM_WORKERS
  FTW_INFER_CACHE_DIR   — persistent cache keyed by bbox/year/model (skips re-download)
  FTW_CHECKPOINT_PATH   — optional checkpoint under models/
  FTW_INFERENCE_CMD     — optional full command template with {bbox},{year},{out},{model}
                          (must invoke `ftw inference all`, not bare `ftw inference`)
"""

from __future__ import annotations

import hashlib
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
DEFAULT_FAST_MODEL = "FTW_PRUE_EFNET_B5"
DEFAULT_QUALITY_MODEL = "FTW_PRUE_EFNET_B7"


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name, "1" if default else "0").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return int(default)
    return int(raw)


def _resolve_gpu_index() -> int:
    raw = os.environ.get("FTW_INFER_GPU", "").strip()
    if raw:
        return int(raw)
    try:
        import torch

        if torch.cuda.is_available():
            return 0
    except Exception:  # noqa: BLE001
        pass
    return -1


def resolve_ftw_infer_runtime_options() -> dict[str, Any]:
    """Fast defaults target ~30–60s on CPU (B5 + resize 4 + parallel workers)."""
    fast = _env_flag("FTW_INFER_FAST", default=True)
    gpu = _resolve_gpu_index()
    if fast:
        return {
            "fast": True,
            "model_default": DEFAULT_FAST_MODEL,
            "gpu": gpu,
            "batch_size": _env_int("FTW_INFER_BATCH_SIZE", 2 if gpu < 0 else 4),
            "num_workers": _env_int("FTW_INFER_NUM_WORKERS", 4),
            "resize_factor": _env_int("FTW_INFER_RESIZE_FACTOR", 4),
            "buffer_days": _env_int("FTW_INFER_BUFFER_DAYS", 7),
        }
    return {
        "fast": False,
        "model_default": DEFAULT_QUALITY_MODEL,
        "gpu": gpu,
        "batch_size": _env_int("FTW_INFER_BATCH_SIZE", 2),
        "num_workers": _env_int("FTW_INFER_NUM_WORKERS", 4),
        "resize_factor": _env_int("FTW_INFER_RESIZE_FACTOR", 2),
        "buffer_days": _env_int("FTW_INFER_BUFFER_DAYS", 14),
    }


def build_ftw_inference_all_argv(
    ftw_bin: str,
    bbox: list[float] | str,
    *,
    year: int,
    out_dir: str | Path,
    model: str,
    gpu: int = -1,
    batch_size: int = 1,
    num_workers: int = 1,
    stac_host: str | None = None,
    resize_factor: int = 2,
    buffer_days: int = 14,
    overwrite: bool = True,
    mps_mode: bool = False,
) -> list[str]:
    """Argv for ftw-baselines 2.x `inference all` (no shell — safe for --gpu=-1)."""
    bbox_s = bbox if isinstance(bbox, str) else ",".join(str(float(v)) for v in bbox)
    argv = [
        ftw_bin,
        "inference",
        "all",
        f"--bbox={bbox_s}",
        f"--model={model.strip()}",
        f"--year={int(year)}",
        f"--out={out_dir}",
        f"--gpu={int(gpu)}",
        f"--batch_size={int(batch_size)}",
        f"--num_workers={int(num_workers)}",
        f"--resize_factor={int(resize_factor)}",
        f"--buffer_days={int(buffer_days)}",
    ]
    if overwrite:
        argv.append("--overwrite")
    if mps_mode:
        argv.append("--mps_mode")
    if stac_host and stac_host.strip():
        argv.append(f"--stac_host={stac_host.strip()}")
    return argv


def build_ftw_inference_all_cmd(
    ftw_bin: str,
    bbox: list[float] | str,
    *,
    year: int,
    out_dir: str | Path,
    model: str,
    gpu: int = -1,
    batch_size: int = 1,
    num_workers: int = 1,
    stac_host: str | None = None,
    resize_factor: int = 2,
    buffer_days: int = 14,
    overwrite: bool = True,
    mps_mode: bool = False,
) -> str:
    """Human-readable command string for logs/tests."""
    return " ".join(
        f'"{part}"' if " " in part and not part.startswith("--") else part
        for part in build_ftw_inference_all_argv(
            ftw_bin,
            bbox,
            year=year,
            out_dir=out_dir,
            model=model,
            gpu=gpu,
            batch_size=batch_size,
            num_workers=num_workers,
            stac_host=stac_host,
            resize_factor=resize_factor,
            buffer_days=buffer_days,
            overwrite=overwrite,
            mps_mode=mps_mode,
        )
    )


def _cache_dir_for_run(
    bbox_s: str,
    *,
    year: int,
    model: str,
    resize_factor: int,
) -> Path | None:
    root = os.environ.get("FTW_INFER_CACHE_DIR", "").strip()
    if not root:
        return None
    digest = hashlib.sha256(
        f"{bbox_s}|{year}|{model}|{resize_factor}".encode("utf-8"),
    ).hexdigest()[:20]
    return Path(root).expanduser() / digest


class FtwInferenceS2Engine:
    name = "ftw-inference-s2"

    def __init__(self) -> None:
        runtime = resolve_ftw_infer_runtime_options()
        self.runtime = runtime
        self.device = "cuda" if int(runtime["gpu"]) >= 0 else "cpu"
        self.available = False
        self.error: str | None = None
        self.model_id = (
            os.environ.get("FTW_INFER_MODEL", "").strip() or str(runtime["model_default"])
        ).strip()
        self.ftw_bin = shutil.which(os.environ.get("FTW_INFERENCE_BIN", "ftw").strip())
        self.checkpoint = Path(
            os.environ.get("FTW_CHECKPOINT_PATH", str(DEFAULT_CKPT)),
        ).expanduser()
        self._probe()

    def _resolve_model_arg(self) -> str:
        # FTW v2+ `inference all` expects a registry model id (e.g. FTW_PRUE_EFNET_B5),
        # not a local .ckpt path — passing a file path makes the Click CLI fail immediately.
        model = (self.model_id or str(self.runtime["model_default"])).strip()
        return model or DEFAULT_FAST_MODEL

    @staticmethod
    def _architecture_label(model_id: str) -> str:
        upper = model_id.upper()
        if "B3" in upper:
            return "PRUE U-Net (EfficientNet-B3)"
        if "B5" in upper:
            return "PRUE U-Net (EfficientNet-B5)"
        return "PRUE U-Net (EfficientNet-B7)"

    def _probe(self) -> None:
        if self.ftw_bin:
            try:
                proc = subprocess.run(
                    [self.ftw_bin, "inference", "all", "--help"],
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                if proc.returncode != 0:
                    self.available = False
                    self.error = (
                        "AgroDetect S2 needs ftw-tools >= 2.0.0b3 (`ftw inference all`). "
                        f"Installed CLI at {self.ftw_bin} does not expose the all subcommand."
                    )
                    return
            except Exception as exc:  # noqa: BLE001
                self.available = False
                self.error = f"FTW CLI probe failed: {exc}"
                return
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
            "architecture": self._architecture_label(self.model_id),
            "model": self.model_id,
            "input": "Sentinel-2 L2A multispectral stack",
            "resolution_m": 10,
            "fast_mode": bool(self.runtime.get("fast")),
            "resize_factor": int(self.runtime.get("resize_factor") or 2),
            "device": self.device,
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
        bbox_s = ",".join(str(float(v)) for v in bbox)
        model_arg = self._resolve_model_arg()
        runtime = self.runtime
        resize_factor = int(runtime.get("resize_factor") or 2)
        cache_dir = _cache_dir_for_run(
            bbox_s,
            year=year,
            model=model_arg,
            resize_factor=resize_factor,
        )
        tmp: tempfile.TemporaryDirectory[str] | None = None
        if cache_dir is not None:
            cache_dir.mkdir(parents=True, exist_ok=True)
            try:
                return self._load_output_geojson(cache_dir)
            except RuntimeError:
                pass
            out_dir = cache_dir
        else:
            tmp = tempfile.TemporaryDirectory(prefix="ftw-infer-s2-")
            out_dir = Path(tmp.name)
        overwrite = True

        try:
            custom = os.environ.get("FTW_INFERENCE_CMD", "").strip()
            mps_mode = _env_flag("FTW_INFER_MPS", default=False)
            if custom:
                shell_cmd = custom.format(
                    bbox=bbox_s,
                    year=year,
                    out=str(out_dir),
                    model=model_arg,
                )
                proc = subprocess.run(
                    shell_cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=int(os.environ.get("FTW_INFERENCE_TIMEOUT_SEC", "900")),
                )
                argv_repr = shell_cmd
            else:
                if not self.ftw_bin:
                    raise RuntimeError(self.error or "FTW inference CLI not found.")
                argv = build_ftw_inference_all_argv(
                    self.ftw_bin,
                    bbox_s,
                    year=year,
                    out_dir=out_dir,
                    model=model_arg,
                    gpu=int(runtime.get("gpu") or -1),
                    batch_size=int(runtime.get("batch_size") or 2),
                    num_workers=int(runtime.get("num_workers") or 4),
                    stac_host=os.environ.get("FTW_INFER_STAC_HOST", "").strip() or None,
                    resize_factor=resize_factor,
                    buffer_days=int(runtime.get("buffer_days") or 7),
                    overwrite=overwrite,
                    mps_mode=mps_mode,
                )
                argv_repr = " ".join(argv)
                proc = subprocess.run(
                    argv,
                    shell=False,
                    capture_output=True,
                    text=True,
                    timeout=int(os.environ.get("FTW_INFERENCE_TIMEOUT_SEC", "900")),
                )
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout or "").strip()
                raise RuntimeError(
                    f"FTW inference CLI failed (exit {proc.returncode}). "
                    f"cmd={argv_repr!r} {err[:1800]}",
                )
            return self._load_output_geojson(out_dir)
        finally:
            if tmp is not None:
                tmp.cleanup()

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
