"""Load Agricultural Field Delineation EMD metadata (source of truth)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_SERVICE_ROOT = Path(__file__).resolve().parent
DEFAULT_AFD_DIR = _SERVICE_ROOT / "models" / "AgriculturalFieldDelineation"

# EMD Bands → Sentinel-2 L2A asset ids (explicit order, channels 0–11)
EMD_BAND_TO_S2: list[str] = [
    "B01",  # B1_Aerosols
    "B02",  # B2_Blue
    "B03",  # B3_Green
    "B04",  # B4_Red
    "B05",  # B5_RedEdge
    "B06",  # B6_RedEdge
    "B07",  # B7_RedEdge
    "B08",  # B8_NearInfraRed
    "B8A",  # B8A_NarrowNIR
    "B09",  # B9_WaterVapour
    "B11",  # B11_ShortWaveInfraRed
    "B12",  # B12_ShortWaveInfraRed
]


def default_model_dir() -> Path:
    return Path(
        os.environ.get("AGRICULTURAL_FIELD_DELINEATION_MODEL_DIR", str(DEFAULT_AFD_DIR))
    ).expanduser()


def default_model_path() -> Path:
    env = os.environ.get("AGRICULTURAL_FIELD_DELINEATION_MODEL_PATH", "").strip()
    if env:
        return Path(env).expanduser()
    return default_model_dir() / "AgricultureFieldDelination.pth"


def default_emd_path() -> Path:
    env = os.environ.get("AGRICULTURAL_FIELD_DELINEATION_EMD_PATH", "").strip()
    if env:
        return Path(env).expanduser()
    return default_model_dir() / "AgricultureFieldDelination.emd"


@dataclass(frozen=True)
class AfdEmd:
    raw: dict[str, Any]
    model_name: str
    backbone: str
    image_height: int
    image_width: int
    cell_size_m: float
    do_normalize: bool
    bands: list[str]
    band_min: list[float]
    band_max: list[float]
    band_mean: list[float]
    band_std: list[float]
    scaled_mean: list[float]
    scaled_std: list[float]
    class_value: int
    class_name: str
    average_precision: float | None
    version: str
    model_file: str

    @property
    def num_channels(self) -> int:
        return len(self.bands)

    def public_info(self) -> dict[str, Any]:
        info: dict[str, Any] = {
            "architecture": self.model_name,
            "backbone": self.backbone,
            "input": "12-band Sentinel-2 L2A BOA",
            "bands": list(EMD_BAND_TO_S2),
            "resolution_m": self.cell_size_m,
            "tile_size": self.image_height,
            "class": self.class_name,
            "version": self.version,
        }
        if self.average_precision is not None:
            info["ap_field"] = round(float(self.average_precision), 4)
        return info


def load_emd(path: Path | None = None) -> AfdEmd:
    emd_path = path or default_emd_path()
    if not emd_path.is_file():
        raise FileNotFoundError(f"AFD EMD not found: {emd_path}")
    raw = json.loads(emd_path.read_text(encoding="utf-8"))
    stats = raw.get("NormalizationStats") or {}
    classes = raw.get("Classes") or [{"Value": 1, "Name": "field"}]
    cls0 = classes[0] if classes else {"Value": 1, "Name": "field"}
    params = raw.get("ModelParameters") or {}
    ap = (raw.get("average_precision_score") or {}).get("field")
    cell = float((raw.get("MinCellSize") or {}).get("x") or 10)
    return AfdEmd(
        raw=raw,
        model_name=str(raw.get("ModelName") or "MaskRCNN"),
        backbone=str(params.get("backbone") or "resnet50"),
        image_height=int(raw.get("ImageHeight") or raw.get("resize_to") or 224),
        image_width=int(raw.get("ImageWidth") or raw.get("resize_to") or 224),
        cell_size_m=cell,
        do_normalize=bool(raw.get("DoNormalize")),
        bands=list(raw.get("Bands") or []),
        band_min=[float(v) for v in (stats.get("band_min_values") or [])],
        band_max=[float(v) for v in (stats.get("band_max_values") or [])],
        band_mean=[float(v) for v in (stats.get("band_mean_values") or [])],
        band_std=[float(v) for v in (stats.get("band_std_values") or [])],
        scaled_mean=[float(v) for v in (stats.get("scaled_mean_values") or [])],
        scaled_std=[float(v) for v in (stats.get("scaled_std_values") or [])],
        class_value=int(cls0.get("Value") or 1),
        class_name=str(cls0.get("Name") or "field"),
        average_precision=float(ap) if ap is not None else None,
        version=str(raw.get("Version") or ""),
        model_file=str(raw.get("ModelFile") or "AgricultureFieldDelination.pth"),
    )


def apply_emd_preprocessing(stack: Any, emd: AfdEmd) -> Any:
    """
    Apply Esri SentinelService-style scaling from EMD stats.

    DoNormalize is false in this package: clip to band min/max then scale to [0, 1].
    """
    import numpy as np

    arr = np.asarray(stack, dtype=np.float32)
    if arr.ndim != 3 or arr.shape[0] != emd.num_channels:
        raise ValueError(
            f"Expected (C,H,W) with C={emd.num_channels}, got shape {getattr(arr, 'shape', None)}"
        )
    out = np.empty_like(arr, dtype=np.float32)
    for i in range(emd.num_channels):
        lo = float(emd.band_min[i]) if i < len(emd.band_min) else 0.0
        hi = float(emd.band_max[i]) if i < len(emd.band_max) else 1.0
        band = np.clip(arr[i], lo, hi)
        denom = max(hi - lo, 1e-6)
        scaled = (band - lo) / denom
        if emd.do_normalize and i < len(emd.scaled_mean) and i < len(emd.scaled_std):
            std = max(float(emd.scaled_std[i]), 1e-6)
            scaled = (scaled - float(emd.scaled_mean[i])) / std
        out[i] = scaled
    return out
