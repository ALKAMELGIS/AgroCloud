"""Unit tests for FTW Inference S2 CLI wiring."""

from engines.ftw_inference_s2 import build_ftw_inference_all_cmd, resolve_ftw_infer_runtime_options


def test_build_ftw_inference_all_cmd_uses_inference_all_subcommand():
    cmd = build_ftw_inference_all_cmd(
        "/usr/bin/ftw",
        [54.5, 24.3, 54.6, 24.4],
        year=2024,
        out_dir="/tmp/ftw-out",
        model="FTW_PRUE_EFNET_B5",
        batch_size=2,
        num_workers=4,
        resize_factor=4,
        buffer_days=7,
    )
    assert "inference all" in cmd
    assert "--bbox=54.5,24.3,54.6,24.4" in cmd
    assert "--year=2024" in cmd
    assert '--out=/tmp/ftw-out' in cmd or '--out="/tmp/ftw-out"' in cmd
    assert "--overwrite" in cmd
    assert "--gpu=-1" in cmd
    assert "--batch_size=2" in cmd
    assert "--num_workers=4" in cmd
    assert "--resize_factor=4" in cmd
    assert "--buffer_days=7" in cmd
    assert "inference --bbox" not in cmd.replace("inference all", "")


def test_resolve_ftw_infer_runtime_options_fast_defaults(monkeypatch):
    monkeypatch.delenv("FTW_INFER_FAST", raising=False)
    runtime = resolve_ftw_infer_runtime_options()
    assert runtime["fast"] is True
    assert runtime["model_default"] == "FTW_PRUE_EFNET_B5"
    assert runtime["resize_factor"] == 4
    assert runtime["num_workers"] == 4


def test_resolve_ftw_infer_runtime_options_quality_mode(monkeypatch):
    monkeypatch.setenv("FTW_INFER_FAST", "0")
    runtime = resolve_ftw_infer_runtime_options()
    assert runtime["fast"] is False
    assert runtime["model_default"] == "FTW_PRUE_EFNET_B7"
    assert runtime["resize_factor"] == 2


def test_build_ftw_inference_all_cmd_uses_registry_model_id_not_checkpoint_path():
    cmd = build_ftw_inference_all_cmd(
        "/usr/bin/ftw",
        "1,2,3,4",
        year=2023,
        out_dir="/tmp/out",
        model="FTW_PRUE_EFNET_B7",
    )
    assert "FTW_PRUE_EFNET_B7" in cmd
    assert ".ckpt" not in cmd
