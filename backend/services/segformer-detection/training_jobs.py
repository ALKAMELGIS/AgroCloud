"""Async training job map for SegFormer fine-tune."""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any

from finetune_segformer import finetune_segformer, set_cancel, training_deps_status

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _set(job_id: str, **fields: Any) -> None:
    with _LOCK:
        cur = _JOBS.get(job_id) or {}
        cur.update(fields)
        cur["updated_at"] = time.time()
        _JOBS[job_id] = cur


def get_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        j = _JOBS.get(job_id)
        return dict(j) if j else None


def start_training_job(payload: dict[str, Any]) -> str:
    ok, err = training_deps_status()
    if not ok:
        raise RuntimeError(err or "Training dependencies unavailable")

    samples = payload.get("samples") or []
    classes = payload.get("classes") or []
    if not samples:
        raise ValueError("Create training samples on the map before training a model.")
    if len(samples) < 5:
        raise ValueError(f"Add at least 5 samples to train (currently {len(samples)}).")
    used = {int(s.get("class_id")) for s in samples if s.get("class_id") is not None}
    if len(used) < 1:
        raise ValueError("Assign each sample to a class before training.")
    image = str(payload.get("imageDataUrl") or payload.get("image_data_url") or "").strip()
    if not image:
        raise ValueError("imageDataUrl is required")
    bbox = payload.get("bbox")
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north]")

    job_id = uuid.uuid4().hex
    _set(
        job_id,
        status="queued",
        progress=0.0,
        epoch=0,
        epochs=int(payload.get("epochs") or 10),
        train_loss=None,
        val_loss=None,
        stage="queued",
        error=None,
        metrics=None,
        model=None,
        loss_history=[],
    )
    set_cancel(job_id, False)

    def runner() -> None:
        def progress(fields: dict[str, Any]) -> None:
            _set(job_id, **fields)

        try:
            _set(job_id, status="running", stage="starting", progress=0.5)
            result = finetune_segformer(
                job_id=job_id,
                image_data_url=image,
                bbox=[float(x) for x in bbox],
                samples=list(samples),
                classes=list(classes),
                epochs=int(payload.get("epochs") or 10),
                batch_size=int(payload.get("batch_size") or 2),
                learning_rate=float(payload.get("learning_rate") or 6e-5),
                val_split=float(payload.get("val_split") or 0.2),
                bands=list(payload.get("bands") or []),
                encoder=str(payload.get("encoder") or payload.get("model") or "").strip() or None,
                progress=progress,
            )
            _set(job_id, **result)
        except Exception as exc:  # noqa: BLE001
            _set(
                job_id,
                status="error",
                progress=100.0,
                stage="error",
                error=f"{type(exc).__name__}: {exc}",
            )

    threading.Thread(target=runner, name=f"tai-train-{job_id[:8]}", daemon=True).start()
    return job_id


def cancel_training_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job:
        return False
    set_cancel(job_id, True)
    _set(job_id, status="cancelled", stage="cancelled", error="Training cancelled")
    return True
