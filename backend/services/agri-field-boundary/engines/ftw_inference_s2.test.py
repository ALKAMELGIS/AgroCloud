"""Unit tests for FTW Inference S2 CLI wiring."""

from engines.ftw_inference_s2 import build_ftw_inference_all_cmd


def test_build_ftw_inference_all_cmd_uses_inference_all_subcommand():
    cmd = build_ftw_inference_all_cmd(
        "/usr/bin/ftw",
        [54.5, 24.3, 54.6, 24.4],
        year=2024,
        out_dir="/tmp/ftw-out",
        model="FTW_PRUE_EFNET_B7",
    )
    assert "inference all" in cmd
    assert "--bbox 54.5,24.3,54.6,24.4" in cmd
    assert "--year 2024" in cmd
    assert '--out "/tmp/ftw-out"' in cmd
    assert "--overwrite" in cmd
    assert "--gpu -1" in cmd
    assert "--batch_size 1" in cmd
    assert "--num_workers 1" in cmd
    assert "inference --bbox" not in cmd.replace("inference all", "")


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
