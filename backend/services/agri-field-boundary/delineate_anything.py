"""
Delineate-Anything (YOLOv11 instance segmentation) engine for field boundaries.

Weights: https://huggingface.co/MykolaL/DelineateAnything
Default uses the smaller DelineateAnything-S.pt for faster first-run download.

Large AOIs use overlapping tiles so small parcels are not missed in a single
downscaled pass.
"""

from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

DA_WEIGHTS_URL = os.environ.get(
    "DELINEATE_ANYTHING_URL",
    "https://huggingface.co/MykolaL/DelineateAnything/resolve/main/DelineateAnything-S.pt",
).strip()
DA_WEIGHTS_PATH = Path(
    os.environ.get(
        "DELINEATE_ANYTHING_PATH",
        str(Path(__file__).resolve().parent / "weights" / "DelineateAnything-S.pt"),
    )
).expanduser()
DA_CONF = float(os.environ.get("DELINEATE_ANYTHING_CONF", "0.18"))
DA_IOU = float(os.environ.get("DELINEATE_ANYTHING_IOU", "0.45"))
DA_IMGSZ = int(os.environ.get("DELINEATE_ANYTHING_IMGSZ", "1280"))
DA_TILE = int(os.environ.get("DELINEATE_ANYTHING_TILE", "1280"))
DA_OVERLAP = int(os.environ.get("DELINEATE_ANYTHING_OVERLAP", "256"))
DA_ENABLED = os.environ.get("DELINEATE_ANYTHING_ENABLED", "1").strip() not in ("0", "false", "False")


def _ensure_weights() -> Path | None:
    if DA_WEIGHTS_PATH.exists() and DA_WEIGHTS_PATH.stat().st_size > 1_000_000:
        return DA_WEIGHTS_PATH
    if not DA_WEIGHTS_URL:
        return None
    try:
        import urllib.request

        DA_WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = DA_WEIGHTS_PATH.with_suffix(".pt.download")
        print(f"[field-boundary] Downloading Delineate-Anything weights → {DA_WEIGHTS_PATH}", flush=True)
        urllib.request.urlretrieve(DA_WEIGHTS_URL, str(tmp))
        tmp.replace(DA_WEIGHTS_PATH)
        return DA_WEIGHTS_PATH
    except Exception as exc:  # noqa: BLE001
        print(f"[field-boundary] Delineate-Anything weight download failed: {exc}", flush=True)
        return None


def _nms_masks(
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
            inter = int(np.logical_and(mask, km).sum())
            if inter == 0:
                continue
            union = int(np.logical_or(mask, km).sum())
            if union > 0 and inter / union >= iou_thresh:
                drop = True
                break
        if not drop:
            kept.append((mask, score))
    return kept


def _tile_windows(h: int, w: int, tile: int, overlap: int) -> list[tuple[int, int, int, int]]:
    if h <= tile and w <= tile:
        return [(0, 0, w, h)]
    step = max(64, tile - overlap)
    tiles: list[tuple[int, int, int, int]] = []
    for y0 in range(0, h, step):
        for x0 in range(0, w, step):
            x1 = min(w, x0 + tile)
            y1 = min(h, y0 + tile)
            if x1 - x0 < tile and x0 > 0:
                x0 = max(0, x1 - tile)
            if y1 - y0 < tile and y0 > 0:
                y0 = max(0, y1 - tile)
            tiles.append((x0, y0, x1, y1))
    # Deduplicate identical windows from edge growth
    uniq: list[tuple[int, int, int, int]] = []
    seen: set[tuple[int, int, int, int]] = set()
    for t in tiles:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


class DelineateAnythingEngine:
    def __init__(self) -> None:
        self.available = False
        self.model = None
        self.device = "cpu"
        self.name = "delineate-anything"
        if not DA_ENABLED:
            print("[field-boundary] Delineate-Anything disabled via env.", flush=True)
            return
        try:
            import os as _os

            _os.environ.setdefault("MPLBACKEND", "Agg")
            import torch
            from ultralytics import YOLO

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            weights = _ensure_weights()
            if weights is None:
                # Ultralytics can load remote URL directly
                source = DA_WEIGHTS_URL or None
            else:
                source = str(weights)
            if not source:
                return
            self.model = YOLO(source)
            self.available = True
            print(f"[field-boundary] Delineate-Anything ready on {self.device}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[field-boundary] Delineate-Anything unavailable: {exc}", flush=True)
            self.available = False
            self.model = None

    def _predict_crop(
        self,
        crop: np.ndarray,
        conf: float,
    ) -> list[tuple[np.ndarray, float]]:
        if crop.size == 0:
            return []
        ch, cw = crop.shape[:2]
        imgsz = min(DA_IMGSZ, max(ch, cw, 640))
        results = self.model.predict(
            source=crop,
            conf=conf,
            iou=DA_IOU,
            imgsz=imgsz,
            verbose=False,
            device=self.device,
            retina_masks=True,
            max_det=300,
        )
        if not results:
            return []
        r0 = results[0]
        if r0.masks is None or r0.boxes is None:
            return []
        masks_data = r0.masks.data.detach().cpu().numpy()
        scores = r0.boxes.conf.detach().cpu().numpy()
        out: list[tuple[np.ndarray, float]] = []
        for i in range(masks_data.shape[0]):
            m = masks_data[i]
            if m.shape[0] != ch or m.shape[1] != cw:
                m = cv2.resize(m.astype(np.float32), (cw, ch), interpolation=cv2.INTER_LINEAR)
            binary = m > 0.45
            if int(binary.sum()) < 25:
                continue
            score = float(scores[i]) if i < len(scores) else conf
            if score < conf * 0.7:
                continue
            out.append((binary, score))
        return out

    def predict(self, rgb: np.ndarray, min_confidence: float) -> list[tuple[np.ndarray, float]]:
        if not self.available or self.model is None:
            return []
        # Prefer recall: use the lower of UI confidence and DA default floor.
        conf = float(max(0.12, min(float(min_confidence), DA_CONF)))
        h, w = rgb.shape[:2]
        windows = _tile_windows(h, w, DA_TILE, DA_OVERLAP)
        components: list[tuple[np.ndarray, float]] = []

        for x0, y0, x1, y1 in windows:
            crop = rgb[y0:y1, x0:x1]
            local = self._predict_crop(crop, conf)
            for mask, score in local:
                full = np.zeros((h, w), dtype=bool)
                full[y0:y1, x0:x1] = mask[: y1 - y0, : x1 - x0]
                if int(full.sum()) < 25:
                    continue
                components.append((full, score))

        return _nms_masks(components, iou_thresh=0.4)
