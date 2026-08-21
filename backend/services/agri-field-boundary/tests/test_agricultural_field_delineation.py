"""Unit tests for Agricultural Field Delineation EMD + preprocessing."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from afd_emd import (
    EMD_BAND_TO_S2,
    apply_emd_preprocessing,
    default_emd_path,
    default_model_path,
    load_emd,
)

ROOT = Path(__file__).resolve().parents[1]
AFD_DIR = ROOT / "models" / "AgriculturalFieldDelineation"


def test_emd_band_map_has_twelve_sentinel_ids():
    assert len(EMD_BAND_TO_S2) == 12
    assert EMD_BAND_TO_S2[0] == "B01"
    assert EMD_BAND_TO_S2[8] == "B8A"
    assert EMD_BAND_TO_S2[-1] == "B12"


@pytest.mark.skipif(not (AFD_DIR / "AgricultureFieldDelination.emd").is_file(), reason="AFD EMD not bundled")
def test_load_bundled_emd():
    emd = load_emd()
    assert emd.model_name == "MaskRCNN"
    assert emd.backbone == "resnet50"
    assert emd.image_height == 224
    assert emd.num_channels == 12
    assert emd.class_name == "field"
    assert emd.class_value == 1
    assert emd.do_normalize is False
    assert emd.cell_size_m == 10.0
    assert emd.average_precision is not None
    info = emd.public_info()
    assert info["architecture"] == "MaskRCNN"
    assert "ap_field" in info
    assert len(info["bands"]) == 12


@pytest.mark.skipif(not (AFD_DIR / "AgricultureFieldDelination.emd").is_file(), reason="AFD EMD not bundled")
def test_default_paths_are_project_relative():
    emd = default_emd_path()
    pth = default_model_path()
    assert "AgriculturalFieldDelineation" in str(emd)
    assert "AgricultureFieldDelination.emd" in str(emd)
    assert "AgricultureFieldDelination.pth" in str(pth)
    # Never hard-code a developer Downloads path
    assert "Downloads" not in str(emd)
    assert "Users" not in str(emd).replace(str(Path.home()), "")


@pytest.mark.skipif(not (AFD_DIR / "AgricultureFieldDelination.emd").is_file(), reason="AFD EMD not bundled")
def test_preprocessing_scales_to_unit_interval():
    emd = load_emd()
    # Synthetic BOA-like DN in EMD range for band 0
    lo, hi = emd.band_min[0], emd.band_max[0]
    raw = np.full((12, 8, 8), (lo + hi) / 2.0, dtype=np.float32)
    out = apply_emd_preprocessing(raw, emd)
    assert out.shape == (12, 8, 8)
    assert float(out.min()) >= -1e-3
    assert float(out.max()) <= 1.0 + 1e-3
    mid0 = float(out[0].mean())
    assert 0.4 < mid0 < 0.6


def test_emd_json_roundtrip_minimal(tmp_path: Path):
    payload = {
        "ModelName": "MaskRCNN",
        "ModelParameters": {"backbone": "resnet50"},
        "ImageHeight": 224,
        "ImageWidth": 224,
        "DoNormalize": False,
        "Bands": ["a"] * 12,
        "Classes": [{"Value": 1, "Name": "field"}],
        "MinCellSize": {"x": 10},
        "NormalizationStats": {
            "band_min_values": [0.0] * 12,
            "band_max_values": [100.0] * 12,
            "band_mean_values": [50.0] * 12,
            "band_std_values": [10.0] * 12,
            "scaled_mean_values": [0.5] * 12,
            "scaled_std_values": [0.1] * 12,
        },
        "Version": "test",
        "ModelFile": "x.pth",
    }
    path = tmp_path / "t.emd"
    path.write_text(json.dumps(payload), encoding="utf-8")
    emd = load_emd(path)
    assert emd.num_channels == 12
    stacked = apply_emd_preprocessing(np.zeros((12, 4, 4), dtype=np.float32), emd)
    assert stacked.shape == (12, 4, 4)
