"""
Agricultural Field Delineation — native PyTorch Mask R-CNN (12-band).

Loads the bundled Esri ArcGIS Learn `.pth` without ArcPy / ArcGIS Pro.
Checkpoint keys match torchvision Mask R-CNN ResNet50-FPN with a 12-channel stem.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

from afd_emd import AfdEmd, default_emd_path, default_model_path, load_emd


class AgriculturalFieldDelineationEngine:
    name = "agricultural-field-delineation"

    def __init__(self) -> None:
        self.device = "cpu"
        self.available = False
        self.model = None
        self.emd: AfdEmd | None = None
        self.error: str | None = None
        self._load()

    def _load(self) -> None:
        try:
            emd_path = default_emd_path()
            model_path = default_model_path()
            if not emd_path.is_file():
                self.error = f"EMD missing: {emd_path}"
                print(f"[afd] {self.error}", flush=True)
                return
            if not model_path.is_file():
                self.error = f"Weights missing: {model_path}"
                print(f"[afd] {self.error}", flush=True)
                return

            self.emd = load_emd(emd_path)

            import torch
            import torch.nn as nn
            from torchvision.models.detection import maskrcnn_resnet50_fpn
            from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
            from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor
            from torchvision.models.detection.transform import GeneralizedRCNNTransform

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            num_classes = 2  # background + field
            in_channels = int(self.emd.num_channels)

            model = maskrcnn_resnet50_fpn(weights=None)
            old = model.backbone.body.conv1
            model.backbone.body.conv1 = nn.Conv2d(
                in_channels,
                old.out_channels,
                kernel_size=old.kernel_size,
                stride=old.stride,
                padding=old.padding,
                bias=False,
            )
            in_features = model.roi_heads.box_predictor.cls_score.in_features
            model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
            in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
            model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, 256, num_classes)

            # Disable ImageNet 3-channel normalize — EMD DoNormalize=false after SentinelService scale.
            tile = int(self.emd.image_height or 224)
            model.transform = GeneralizedRCNNTransform(
                min_size=tile,
                max_size=max(tile, 1333),
                image_mean=[0.0] * in_channels,
                image_std=[1.0] * in_channels,
            )

            state = torch.load(str(model_path), map_location=self.device, weights_only=False)
            if isinstance(state, dict) and "model" in state and isinstance(state["model"], dict):
                state = state["model"]
            missing, unexpected = model.load_state_dict(state, strict=False)
            if unexpected:
                print(f"[afd] unexpected keys: {len(unexpected)}", flush=True)
            if missing:
                print(f"[afd] missing keys: {len(missing)}", flush=True)

            model.to(self.device)
            model.eval()
            self.model = model
            self.available = True
            self.error = None
            print(f"[afd] Mask R-CNN loaded from {model_path} on {self.device}", flush=True)
        except Exception as exc:  # noqa: BLE001
            self.available = False
            self.model = None
            self.error = f"{type(exc).__name__}: {exc}"
            print(f"[afd] load failed: {self.error}", flush=True)

    def status_payload(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ready": bool(self.available),
            "device": self.device,
            "engine": self.name,
        }
        if self.emd:
            out["emd_version"] = self.emd.version
            out["info"] = self.emd.public_info()
        if self.error and not self.available:
            out["error"] = self.error
        return out

    def predict(
        self,
        stack_chw: np.ndarray,
        min_confidence: float = 0.35,
        *,
        tile_size: int | None = None,
        overlap: int | None = None,
        mask_threshold: float = 0.4,
    ) -> list[tuple[np.ndarray, float]]:
        if not self.available or self.model is None or self.emd is None:
            return []

        import torch

        arr = np.asarray(stack_chw, dtype=np.float32)
        if arr.ndim != 3:
            raise ValueError("stack must be (C,H,W)")
        c, h, w = arr.shape
        if c != self.emd.num_channels:
            raise ValueError(f"Expected {self.emd.num_channels} channels, got {c}")

        tile = int(tile_size or self.emd.image_height or 224)
        # ArcGIS-style padding: ~50% overlap reduces edge artifacts on 224 chips.
        ov = int(overlap if overlap is not None else max(64, tile // 2))
        step = max(16, tile - ov)
        field_label = int(self.emd.class_value)
        thr = float(np.clip(mask_threshold, 0.2, 0.8))

        tiles: list[tuple[int, int, int, int]] = []
        if h <= tile and w <= tile:
            tiles.append((0, 0, w, h))
        else:
            for y0 in range(0, h, step):
                for x0 in range(0, w, step):
                    x1 = min(w, x0 + tile)
                    y1 = min(h, y0 + tile)
                    if x1 - x0 < tile and x0 > 0:
                        x0 = max(0, x1 - tile)
                    if y1 - y0 < tile and y0 > 0:
                        y0 = max(0, y1 - tile)
                    tiles.append((x0, y0, x1, y1))
            # Deduplicate after edge grow.
            tiles = list(dict.fromkeys(tiles))

        components: list[tuple[np.ndarray, float]] = []
        use_fp16 = self.device == "cuda" and os.environ.get("AFD_USE_FP16", "1").strip() not in (
            "0",
            "false",
            "False",
        )

        for x0, y0, x1, y1 in tiles:
            crop = arr[:, y0:y1, x0:x1]
            ch, cw = crop.shape[1], crop.shape[2]
            if ch < 8 or cw < 8:
                continue
            # Pad to square tile when near edges (SupportsVariableTileSize still benefits from fixed chip).
            if ch < tile or cw < tile:
                pad = np.zeros((c, tile, tile), dtype=np.float32)
                pad[:, :ch, :cw] = crop
                crop_t = pad
            else:
                crop_t = crop

            tensor = torch.from_numpy(crop_t).to(self.device)
            with torch.inference_mode():
                if use_fp16:
                    with torch.cuda.amp.autocast():
                        out = self.model([tensor])[0]
                else:
                    out = self.model([tensor])[0]

            masks = out.get("masks")
            scores = out.get("scores")
            labels = out.get("labels")
            if masks is None or scores is None:
                continue
            for i in range(int(masks.shape[0])):
                score = float(scores[i].item())
                if score < min_confidence:
                    continue
                if labels is not None:
                    lab = int(labels[i].item())
                    if lab != field_label and lab != 1:
                        # torchvision uses 1..N for classes; accept 1 for field
                        if lab == 0:
                            continue
                        if lab != field_label:
                            continue
                m_small = masks[i, 0].detach().float().cpu().numpy() > thr
                full = np.zeros((h, w), dtype=bool)
                mh = min(ch, m_small.shape[0])
                mw = min(cw, m_small.shape[1])
                # OR into canvas so overlapping tiles reinforce edges instead of chopping them.
                full[y0 : y0 + mh, x0 : x0 + mw] |= m_small[:mh, :mw]
                if int(full.sum()) < 20:
                    continue
                components.append((full, score))

        return _nms_mask_components(components, iou_thresh=0.35)


def _nms_mask_components(
    components: list[tuple[np.ndarray, float]],
    iou_thresh: float = 0.45,
) -> list[tuple[np.ndarray, float]]:
    if not components:
        return []
    ordered = sorted(components, key=lambda t: t[1], reverse=True)
    kept: list[tuple[np.ndarray, float]] = []
    for mask, score in ordered:
        drop = False
        for km, _ in kept:
            inter = np.logical_and(mask, km).sum()
            if inter == 0:
                continue
            union = np.logical_or(mask, km).sum()
            if float(inter) / float(max(union, 1)) >= iou_thresh:
                drop = True
                break
        if not drop:
            kept.append((mask, score))
    return kept


# Lazy singleton for app.py
_engine: AgriculturalFieldDelineationEngine | None = None


def get_afd_engine() -> AgriculturalFieldDelineationEngine:
    global _engine
    if _engine is None:
        _engine = AgriculturalFieldDelineationEngine()
    return _engine
