"""
Delineate-Anything (YOLOv11 instance segmentation) engine for field boundaries.

Weights: https://huggingface.co/MykolaL/DelineateAnything
Default uses the smaller DelineateAnything-S.pt for faster first-run download.
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
DA_CONF = float(os.environ.get("DELINEATE_ANYTHING_CONF", "0.25"))
DA_IOU = float(os.environ.get("DELINEATE_ANYTHING_IOU", "0.5"))
DA_IMGSZ = int(os.environ.get("DELINEATE_ANYTHING_IMGSZ", "1024"))
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

    def predict(self, rgb: np.ndarray, min_confidence: float) -> list[tuple[np.ndarray, float]]:
        if not self.available or self.model is None:
            return []
        conf = float(max(0.15, min(min_confidence, DA_CONF)))
        h, w = rgb.shape[:2]
        # Ultralytics expects BGR or path; pass numpy RGB → it handles RGB arrays
        results = self.model.predict(
            source=rgb,
            conf=conf,
            iou=DA_IOU,
            imgsz=min(DA_IMGSZ, max(h, w, 640)),
            verbose=False,
            device=self.device,
            retina_masks=True,
        )
        if not results:
            return []
        r0 = results[0]
        if r0.masks is None or r0.boxes is None:
            return []
        masks_data = r0.masks.data.detach().cpu().numpy()  # (N, mh, mw)
        scores = r0.boxes.conf.detach().cpu().numpy()
        components: list[tuple[np.ndarray, float]] = []
        for i in range(masks_data.shape[0]):
            m = masks_data[i]
            if m.shape[0] != h or m.shape[1] != w:
                m = cv2.resize(m.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
            binary = m > 0.5
            if int(binary.sum()) < 40:
                continue
            score = float(scores[i]) if i < len(scores) else conf
            if score < conf * 0.85:
                continue
            components.append((binary, score))
        return components
