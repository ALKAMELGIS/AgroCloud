"""
Real SegFormer-B2 fine-tune from georeferenced RGB capture + labeled samples.

Builds a label mask from GeoJSON polygons/points projected into the image,
then fine-tunes HuggingFace SegformerForSemanticSegmentation (default: B2 ADE).
Weights are cloned from the warm detection engine when available so Train skips
HuggingFace downloads.
"""

from __future__ import annotations

import base64
import io
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
from PIL import Image

_SERVICE_ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("SEGFORMER_TRAIN_DIR", str(_SERVICE_ROOT / "models" / "training")))
# B2 ADE checkpoint is the interactive default (stronger than B0, still practical locally).
# Prefer a full SegFormer semantic checkpoint (not raw mit ImageNet).
DEFAULT_ENCODER = os.environ.get(
    "SEGFORMER_TRAIN_ENCODER", "nvidia/segformer-b2-finetuned-ade-512-512"
)
DEFAULT_PROCESSOR = os.environ.get(
    "SEGFORMER_TRAIN_PROCESSOR", DEFAULT_ENCODER
)
CHIP = int(os.environ.get("SEGFORMER_TRAIN_CHIP", "256"))
EXPORT_ONNX = os.environ.get("SEGFORMER_TRAIN_EXPORT_ONNX", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
MODEL_DISPLAY_NAME = os.environ.get("SEGFORMER_TRAIN_DISPLAY_NAME", "SegFormer-B2")

_cancel_flags: dict[str, bool] = {}
_cancel_lock = threading.Lock()

# Warm local + in-process cache so Train does not re-download HuggingFace weights every job.
_assets_lock = threading.Lock()
_cached_processor: Any = None
_cached_base_dir: Path | None = None
_assets_ready = False


def _encoder_cache_dir() -> Path:
    slug = DEFAULT_ENCODER.replace("/", "__").replace(":", "_")
    return MODEL_DIR / "base_cache" / slug


def _hub_local_ready(path: Path) -> bool:
    return path.is_dir() and (path / "config.json").is_file() and (
        (path / "model.safetensors").is_file()
        or (path / "pytorch_model.bin").is_file()
    )


def warm_train_assets(
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> Path:
    """
    Ensure processor + base encoder are on local disk (and in RAM).
    Safe to call from a startup thread; subsequent Train jobs reuse this.
    When the detection engine already loaded the same checkpoint, snapshot it —
    no second HuggingFace download.
    """
    global _cached_processor, _cached_base_dir, _assets_ready

    def report(**fields: Any) -> None:
        if progress:
            progress(fields)

    with _assets_lock:
        if _assets_ready and _cached_processor is not None and _cached_base_dir and _hub_local_ready(
            _cached_base_dir
        ):
            return _cached_base_dir

        local = _encoder_cache_dir()
        report(status="running", stage="loading_model", progress=5.0)

        # Prefer snapshotting the already-warm detection engine when IDs match.
        try:
            import app as segformer_app  # local service module

            eng = getattr(segformer_app, "_engine", None)
            mid = getattr(segformer_app, "MODEL_ID", None)
            if eng is not None and mid == DEFAULT_ENCODER:
                report(status="running", stage="loading_model", progress=8.0)
                if not _hub_local_ready(local):
                    local.mkdir(parents=True, exist_ok=True)
                    eng.model.save_pretrained(local)
                    eng.processor.save_pretrained(local)
                _cached_processor = eng.processor
                _cached_base_dir = local
                _assets_ready = True
                report(status="running", stage="loading_model", progress=12.0)
                return local
        except Exception as exc:  # noqa: BLE001
            print(f"[segformer] train warm from engine skipped: {exc}", flush=True)

        from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

        if _hub_local_ready(local):
            report(status="running", stage="loading_model", progress=8.0)
            processor = SegformerImageProcessor.from_pretrained(str(local), local_files_only=True)
            _cached_processor = processor
            _cached_base_dir = local
            _assets_ready = True
            report(status="running", stage="loading_model", progress=12.0)
            return local

        # First-time hydrate from HuggingFace hub (slow once), then local forever.
        report(status="running", stage="loading_model", progress=6.0)
        try:
            processor = SegformerImageProcessor.from_pretrained(
                DEFAULT_PROCESSOR, local_files_only=True
            )
        except Exception:  # noqa: BLE001
            processor = SegformerImageProcessor.from_pretrained(DEFAULT_PROCESSOR)

        report(status="running", stage="loading_model", progress=8.0)
        try:
            base = SegformerForSemanticSegmentation.from_pretrained(
                DEFAULT_ENCODER,
                local_files_only=True,
            )
        except Exception:  # noqa: BLE001
            base = SegformerForSemanticSegmentation.from_pretrained(DEFAULT_ENCODER)

        local.mkdir(parents=True, exist_ok=True)
        base.save_pretrained(local)
        processor.save_pretrained(local)
        _cached_processor = processor
        _cached_base_dir = local
        _assets_ready = True
        report(status="running", stage="loading_model", progress=12.0)
        return local


def _load_finetune_model(
    num_labels: int,
    id2label: dict[int, str],
    label2id: dict[str, int],
    progress: Callable[[dict[str, Any]], None] | None = None,
    encoder: str | None = None,
):
    """
    Build a train model quickly:
    1) clone weights from the warm detection engine (same checkpoint) — near-instant
    2) else load from local disk cache — no HF network
    3) else load the requested encoder from Hub
    """
    import copy

    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

    active = (encoder or "").strip() or DEFAULT_ENCODER

    # Instant path: reuse in-memory detection weights (no disk / no network).
    try:
        import app as segformer_app

        eng = getattr(segformer_app, "_engine", None)
        mid = getattr(segformer_app, "MODEL_ID", None)
        if eng is not None and mid == active:
            if progress:
                progress({"status": "running", "stage": "loading_model", "progress": 10.0})
            cfg = copy.deepcopy(eng.model.config)
            cfg.num_labels = int(num_labels)
            cfg.id2label = {str(i): id2label[i] for i in range(num_labels)}
            cfg.label2id = {str(k): int(v) for k, v in label2id.items()}
            model = SegformerForSemanticSegmentation(cfg)
            src = eng.model.state_dict()
            filtered = {k: v for k, v in src.items() if "classifier" not in k}
            model.load_state_dict(filtered, strict=False)
            if progress:
                progress({"status": "running", "stage": "loading_model", "progress": 14.0})
            return model, eng.processor
    except Exception as exc:  # noqa: BLE001
        print(f"[segformer] train clone-from-engine skipped: {exc}", flush=True)

    if active == DEFAULT_ENCODER:
        local = warm_train_assets(progress=progress)
        processor = _cached_processor
        if processor is None:
            processor = SegformerImageProcessor.from_pretrained(str(local), local_files_only=True)

        if progress:
            progress({"status": "running", "stage": "loading_model", "progress": 14.0})
        model = SegformerForSemanticSegmentation.from_pretrained(
            str(local),
            num_labels=num_labels,
            id2label=id2label,
            label2id=label2id,
            ignore_mismatched_sizes=True,
            local_files_only=True,
        )
        return model, processor

    if progress:
        progress({"status": "running", "stage": "loading_model", "progress": 8.0})
    try:
        processor = SegformerImageProcessor.from_pretrained(active, local_files_only=True)
    except Exception:  # noqa: BLE001
        processor = SegformerImageProcessor.from_pretrained(active)
    if progress:
        progress({"status": "running", "stage": "loading_model", "progress": 12.0})
    try:
        model = SegformerForSemanticSegmentation.from_pretrained(
            active,
            num_labels=num_labels,
            id2label=id2label,
            label2id=label2id,
            ignore_mismatched_sizes=True,
            local_files_only=True,
        )
    except Exception:  # noqa: BLE001
        model = SegformerForSemanticSegmentation.from_pretrained(
            active,
            num_labels=num_labels,
            id2label=id2label,
            label2id=label2id,
            ignore_mismatched_sizes=True,
        )
    if progress:
        progress({"status": "running", "stage": "loading_model", "progress": 14.0})
    return model, processor


def set_cancel(job_id: str, value: bool = True) -> None:
    with _cancel_lock:
        _cancel_flags[job_id] = value


def is_cancelled(job_id: str) -> bool:
    with _cancel_lock:
        return bool(_cancel_flags.get(job_id))


def training_deps_status() -> tuple[bool, str | None]:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401

        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def _decode_image(data_url: str) -> np.ndarray:
    raw = data_url
    if "," in raw and raw.strip().lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    buf = base64.b64decode(raw)
    img = Image.open(io.BytesIO(buf)).convert("RGB")
    return np.asarray(img, dtype=np.uint8)


def _lonlat_to_px(
    lon: float,
    lat: float,
    bbox: list[float],
    width: int,
    height: int,
) -> tuple[int, int]:
    w, s, e, n = bbox
    if e <= w or n <= s:
        return 0, 0
    x = int(round((lon - w) / (e - w) * (width - 1)))
    y = int(round((n - lat) / (n - s) * (height - 1)))
    return max(0, min(width - 1, x)), max(0, min(height - 1, y))


def _point_radius_px(sample: dict[str, Any], cid: int, width: int, height: int) -> int:
    """Larger disks for trees so point samples teach a crown, not a 4px speck."""
    name = str(sample.get("class_name") or "").strip().lower()
    short = min(width, height)
    if name == "tree" or cid == 6:
        # ~1.5–2.5% of the short image edge; capped for tiny AOIs.
        return int(max(10, min(28, round(short * 0.02))))
    if name in ("soil", "urban", "vegetation", "agriculture"):
        return int(max(8, min(18, round(short * 0.014))))
    return int(max(6, min(14, round(short * 0.01))))


def _rasterize_labels(
    samples: list[dict[str, Any]],
    class_ids: list[int],
    bbox: list[float],
    width: int,
    height: int,
) -> np.ndarray:
    """Return HxW int64 mask; 255 = ignore, 0..C-1 = class index."""
    id_to_idx = {cid: i for i, cid in enumerate(class_ids)}
    mask = np.full((height, width), 255, dtype=np.uint8)
    for sample in samples:
        cid = int(sample.get("class_id"))
        if cid not in id_to_idx:
            continue
        idx = id_to_idx[cid]
        geom = sample.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")
        if not coords:
            continue
        if gtype == "Point":
            x, y = _lonlat_to_px(float(coords[0]), float(coords[1]), bbox, width, height)
            r = _point_radius_px(sample, cid, width, height)
            cv2.circle(mask, (x, y), r, int(idx), thickness=-1)
        elif gtype == "MultiPoint":
            r = _point_radius_px(sample, cid, width, height)
            for pt in coords:
                x, y = _lonlat_to_px(float(pt[0]), float(pt[1]), bbox, width, height)
                cv2.circle(mask, (x, y), r, int(idx), thickness=-1)
        elif gtype in ("Polygon", "MultiPolygon"):
            rings = coords if gtype == "MultiPolygon" else [coords]
            for poly in rings:
                if not poly:
                    continue
                outer = poly[0]
                pts = np.array(
                    [_lonlat_to_px(float(p[0]), float(p[1]), bbox, width, height) for p in outer],
                    dtype=np.int32,
                )
                if len(pts) >= 3:
                    cv2.fillPoly(mask, [pts], int(idx))
        elif gtype in ("LineString", "MultiLineString"):
            lines = coords if gtype == "MultiLineString" else [coords]
            for line in lines:
                pts = np.array(
                    [_lonlat_to_px(float(p[0]), float(p[1]), bbox, width, height) for p in line],
                    dtype=np.int32,
                )
                if len(pts) >= 2:
                    cv2.polylines(mask, [pts], False, int(idx), thickness=3)
    return mask


def _extract_chips(
    rgb: np.ndarray,
    mask: np.ndarray,
    chip: int = CHIP,
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    h, w = mask.shape
    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    step = max(chip // 2, 64)
    coords = np.column_stack(np.where(mask < 255))
    if coords.size == 0:
        return xs, ys
    # Center chips on labeled pixels + grid
    centers = coords[:: max(1, len(coords) // 40)]
    for cy, cx in centers:
        x0 = max(0, min(w - chip, int(cx) - chip // 2))
        y0 = max(0, min(h - chip, int(cy) - chip // 2))
        if w < chip or h < chip:
            pad_rgb = np.zeros((chip, chip, 3), dtype=np.uint8)
            pad_m = np.full((chip, chip), 255, dtype=np.uint8)
            ph, pw = min(chip, h), min(chip, w)
            pad_rgb[:ph, :pw] = rgb[:ph, :pw]
            pad_m[:ph, :pw] = mask[:ph, :pw]
            if np.any(pad_m < 255):
                xs.append(pad_rgb)
                ys.append(pad_m)
            continue
        tile = rgb[y0 : y0 + chip, x0 : x0 + chip]
        lab = mask[y0 : y0 + chip, x0 : x0 + chip]
        if tile.shape[0] != chip or tile.shape[1] != chip:
            continue
        if np.any(lab < 255):
            xs.append(tile.copy())
            ys.append(lab.copy())
    # Ensure at least one chip from full resize
    if not xs:
        xs.append(cv2.resize(rgb, (chip, chip), interpolation=cv2.INTER_AREA))
        ys.append(cv2.resize(mask, (chip, chip), interpolation=cv2.INTER_NEAREST))
    return xs, ys


def _metrics_from_logits(
    preds: np.ndarray,
    labels: np.ndarray,
    num_labels: int,
) -> dict[str, Any]:
    # preds/labels: N,H,W — ignore 255
    valid = labels != 255
    if not np.any(valid):
        return {
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "iou": 0.0,
            "confusion_matrix": [[0] * num_labels for _ in range(num_labels)],
        }
    p = preds[valid].astype(np.int64)
    y = labels[valid].astype(np.int64)
    cm = np.zeros((num_labels, num_labels), dtype=np.int64)
    for yi, pi in zip(y.tolist(), p.tolist()):
        if 0 <= yi < num_labels and 0 <= pi < num_labels:
            cm[yi, pi] += 1
    acc = float((p == y).mean()) if y.size else 0.0
    precisions = []
    recalls = []
    ious = []
    for i in range(num_labels):
        tp = float(cm[i, i])
        fp = float(cm[:, i].sum() - tp)
        fn = float(cm[i, :].sum() - tp)
        precisions.append(tp / (tp + fp) if tp + fp > 0 else 0.0)
        recalls.append(tp / (tp + fn) if tp + fn > 0 else 0.0)
        ious.append(tp / (tp + fp + fn) if tp + fp + fn > 0 else 0.0)
    precision = float(np.mean(precisions)) if precisions else 0.0
    recall = float(np.mean(recalls)) if recalls else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall > 0
        else 0.0
    )
    iou = float(np.mean(ious)) if ious else 0.0
    return {
        "accuracy": acc,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "iou": iou,
        "confusion_matrix": cm.tolist(),
    }


def finetune_segformer(
    *,
    job_id: str,
    image_data_url: str,
    bbox: list[float],
    samples: list[dict[str, Any]],
    classes: list[dict[str, Any]],
    epochs: int = 10,
    batch_size: int = 2,
    learning_rate: float = 6e-5,
    val_split: float = 0.2,
    bands: list[str] | None = None,
    encoder: str | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """
    Run real SegFormer fine-tune. Raises on failure (never fakes progress).
    """
    ok, err = training_deps_status()
    if not ok:
        raise RuntimeError(err or "Training dependencies unavailable")

    import torch
    from torch.utils.data import DataLoader, Dataset, random_split

    active_encoder = (encoder or "").strip() or DEFAULT_ENCODER

    def report(**fields: Any) -> None:
        if progress:
            progress(fields)

    if len(samples) < 1:
        raise ValueError("Create training samples on the map before training a model.")
    used_ids = sorted({int(s["class_id"]) for s in samples})
    if len(used_ids) < 1:
        raise ValueError("Assign each sample to a class before training.")

    class_meta = {int(c["class_id"]): c for c in classes}
    class_names = [str(class_meta.get(i, {}).get("class_name", f"class_{i}")) for i in used_ids]
    num_labels = len(used_ids)

    report(status="running", stage="preparing", progress=1.0, epochs=epochs, epoch=0)
    rgb = _decode_image(image_data_url)
    h, w = rgb.shape[:2]
    mask = _rasterize_labels(samples, used_ids, bbox, w, h)
    if not np.any(mask < 255):
        raise ValueError("No sample geometries fell inside the captured imagery extent.")

    xs, ys = _extract_chips(rgb, mask)
    if len(xs) < 2:
        # Duplicate with light noise so we can form a val split
        xs = xs + xs
        ys = ys + ys

    report(status="running", stage="loading_model", progress=5.0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    id2label = {i: class_names[i] for i in range(num_labels)}
    label2id = {v: k for k, v in id2label.items()}
    model, processor = _load_finetune_model(
        num_labels, id2label, label2id, progress=progress, encoder=active_encoder
    )
    model.to(device)
    report(status="running", stage="preparing_loader", progress=16.0)

    class ChipDataset(Dataset):
        def __init__(self, images: list[np.ndarray], labels: list[np.ndarray]):
            self.images = images
            self.labels = labels

        def __len__(self) -> int:
            return len(self.images)

        def __getitem__(self, idx: int):
            img = self.images[idx]
            lab = self.labels[idx].astype(np.int64)
            enc = processor(images=img, segmentation_maps=lab, return_tensors="pt")
            return {
                "pixel_values": enc["pixel_values"].squeeze(0),
                "labels": enc["labels"].squeeze(0),
            }

    dataset = ChipDataset(xs, ys)
    n_val = max(1, int(round(len(dataset) * float(val_split))))
    n_train = max(1, len(dataset) - n_val)
    if n_train + n_val > len(dataset):
        n_val = len(dataset) - n_train
    train_ds, val_ds = random_split(
        dataset,
        [n_train, n_val],
        generator=torch.Generator().manual_seed(42),
    )
    train_loader = DataLoader(train_ds, batch_size=max(1, batch_size), shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=max(1, batch_size), shuffle=False)

    optim = torch.optim.AdamW(model.parameters(), lr=float(learning_rate))
    loss_history: list[dict[str, Any]] = []
    last_train = None
    last_val = None
    last_metrics: dict[str, Any] = {}

    def _batch_preds(logits: "torch.Tensor", lab: "torch.Tensor") -> np.ndarray:
        up = torch.nn.functional.interpolate(
            logits,
            size=lab.shape[-2:],
            mode="bilinear",
            align_corners=False,
        )
        return up.argmax(dim=1).detach().cpu().numpy()

    for epoch in range(1, int(epochs) + 1):
        if is_cancelled(job_id):
            raise RuntimeError("Training cancelled")
        epoch_started = time.time()
        current_lr = float(optim.param_groups[0].get("lr") or learning_rate)
        model.train()
        train_losses: list[float] = []
        train_preds: list[np.ndarray] = []
        train_labs: list[np.ndarray] = []
        for batch in train_loader:
            if is_cancelled(job_id):
                raise RuntimeError("Training cancelled")
            pv = batch["pixel_values"].to(device)
            lab = batch["labels"].to(device)
            out = model(pixel_values=pv, labels=lab)
            loss = out.loss
            optim.zero_grad()
            loss.backward()
            optim.step()
            train_losses.append(float(loss.detach().cpu()))
            train_preds.append(_batch_preds(out.logits, lab))
            train_labs.append(lab.detach().cpu().numpy())
        last_train = float(np.mean(train_losses)) if train_losses else None
        train_metrics = (
            _metrics_from_logits(
                np.concatenate(train_preds, axis=0),
                np.concatenate(train_labs, axis=0),
                num_labels,
            )
            if train_preds
            else {"accuracy": 0.0}
        )

        model.eval()
        val_losses: list[float] = []
        all_preds: list[np.ndarray] = []
        all_labs: list[np.ndarray] = []
        with torch.no_grad():
            for batch in val_loader:
                pv = batch["pixel_values"].to(device)
                lab = batch["labels"].to(device)
                out = model(pixel_values=pv, labels=lab)
                val_losses.append(float(out.loss.detach().cpu()))
                all_preds.append(_batch_preds(out.logits, lab))
                all_labs.append(lab.cpu().numpy())
        last_val = float(np.mean(val_losses)) if val_losses else None
        if all_preds:
            last_metrics = _metrics_from_logits(
                np.concatenate(all_preds, axis=0),
                np.concatenate(all_labs, axis=0),
                num_labels,
            )
            last_metrics["class_names"] = class_names
        # The confusion matrix is per-epoch but far too large to repeat in every
        # history entry — the UI reads it from the job-level metrics instead.
        epoch_metrics = {
            k: v
            for k, v in last_metrics.items()
            if k not in ("confusion_matrix", "class_names")
        }
        train_acc = float(train_metrics.get("accuracy") or 0.0)
        val_acc = float(epoch_metrics.get("accuracy") or 0.0)
        epoch_metrics = {
            **epoch_metrics,
            "train_accuracy": train_acc,
            "val_accuracy": val_acc,
            "learning_rate": current_lr,
        }
        loss_history.append(
            {
                "epoch": epoch,
                "train_loss": last_train if last_train is not None else 0.0,
                "val_loss": last_val if last_val is not None else 0.0,
                "seconds": round(time.time() - epoch_started, 2),
                "learning_rate": current_lr,
                "train_accuracy": train_acc,
                "val_accuracy": val_acc,
                "metrics": epoch_metrics,
            }
        )
        pct = 5.0 + (epoch / float(epochs)) * 90.0
        report(
            status="running",
            stage="training",
            progress=round(pct, 1),
            epoch=epoch,
            epochs=epochs,
            train_loss=last_train,
            val_loss=last_val,
            loss_history=list(loss_history),
            metrics=dict(last_metrics),
        )

    report(status="running", stage="saving", progress=96.0)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    enc = active_encoder.lower()
    if "b0" in enc:
        model_slug = "b0"
    elif "b1" in enc:
        model_slug = "b1"
    elif "b2" in enc:
        model_slug = "b2"
    elif "b3" in enc:
        model_slug = "b3"
    elif "b4" in enc:
        model_slug = "b4"
    elif "b5" in enc:
        model_slug = "b5"
    else:
        model_slug = "custom"
    model_id = f"segformer-{model_slug}-{uuid.uuid4().hex[:10]}"
    out_dir = MODEL_DIR / model_id
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir)
    processor.save_pretrained(out_dir)
    display = MODEL_DISPLAY_NAME
    if "b0" in enc:
        display = "SegFormer-B0"
    elif "b3" in enc:
        display = "SegFormer-B3"
    elif "b5" in enc:
        display = "SegFormer-B5"
    elif "b2" in enc:
        display = "SegFormer-B2"
    meta = {
        "model_id": model_id,
        "model_name": display,
        "model_version": model_id,
        "encoder": active_encoder,
        "class_ids": used_ids,
        "class_names": class_names,
        "classes": classes,
        "sample_count": len(samples),
        "class_count": num_labels,
        "epochs": epochs,
        "learning_rate": float(learning_rate),
        "bands": bands or ["B02", "B03", "B04", "B08", "B11", "B12"],
        "training_date": datetime.now(timezone.utc).isoformat(),
        "training_dataset": "Training Samples",
        "bbox": bbox,
        # Persist real per-epoch curves so Validate / Epochs Details can reload them.
        "loss_history": loss_history,
        "final_metrics": {
            k: v
            for k, v in (last_metrics or {}).items()
            if k not in ("confusion_matrix",)
        },
        "train_loss": last_train,
        "val_loss": last_val,
    }
    (out_dir / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # ONNX export is optional — default off so Train finishes faster on CPU.
    if EXPORT_ONNX:
        onnx_path = out_dir / "model.onnx"
        try:
            dummy = torch.randn(1, 3, CHIP, CHIP, device=device)
            torch.onnx.export(
                model,
                dummy,
                str(onnx_path),
                input_names=["pixel_values"],
                output_names=["logits"],
                dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
                opset_version=17,
            )
            meta["onnx"] = str(onnx_path)
            (out_dir / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

    return {
        "status": "done",
        "progress": 100.0,
        "epoch": epochs,
        "epochs": epochs,
        "train_loss": last_train,
        "val_loss": last_val,
        "loss_history": loss_history,
        "metrics": last_metrics,
        "model": meta,
        "stage": "done",
        "error": None,
    }
