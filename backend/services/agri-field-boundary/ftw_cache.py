"""
Disk cache for the FTW live pipeline.

Every FTW run used to redo the same three expensive steps for an AOI the user had
already detected: the STAC scene search, the Sentinel-2 download + 8-band stack,
and the model pass. All three are pure functions of their inputs (bbox, year,
scene ids, model), so they are cached on disk and reused.

Env:
  FTW_CACHE_ENABLED=0   disable (always recompute)
  FTW_CACHE_DIR         cache root (default <service>/cache/ftw_live)
  FTW_CACHE_TTL_H       entry lifetime in hours (default 168 = 7 days)
  FTW_CACHE_MAX_MB      total budget; oldest entries are pruned first (default 6144)
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent

_ENABLED = os.environ.get("FTW_CACHE_ENABLED", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "",
)
_ROOT = Path(os.environ.get("FTW_CACHE_DIR", "").strip() or (_HERE / "cache" / "ftw_live"))
_TTL_S = float(os.environ.get("FTW_CACHE_TTL_H", "168")) * 3600.0
_MAX_BYTES = float(os.environ.get("FTW_CACHE_MAX_MB", "6144")) * 1024 * 1024


def cache_enabled() -> bool:
    return _ENABLED


def cache_key(*parts: Any) -> str:
    """Stable short key for a tuple of scalars (floats are rounded by the caller)."""
    blob = json.dumps(parts, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:20]


def _root() -> Path | None:
    if not _ENABLED:
        return None
    try:
        _ROOT.mkdir(parents=True, exist_ok=True)
        return _ROOT
    except Exception:  # noqa: BLE001
        return None


def entry_path(kind: str, key: str, suffix: str) -> Path | None:
    root = _root()
    if root is None:
        return None
    return root / f"{kind}-{key}{suffix}"


def is_fresh(path: Path | None) -> bool:
    """A usable entry exists, is non-empty and has not aged out."""
    if path is None or not _ENABLED:
        return False
    try:
        st = path.stat()
    except OSError:
        return False
    if st.st_size <= 0:
        return False
    if _TTL_S > 0 and (time.time() - st.st_mtime) > _TTL_S:
        return False
    return True


def touch(path: Path | None) -> None:
    """Mark an entry as recently used so pruning drops it last."""
    if path is None:
        return
    try:
        now = time.time()
        os.utime(path, (now, now))
    except OSError:
        pass


def read_json(path: Path | None) -> Any | None:
    if not is_fresh(path):
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        return None
    touch(path)
    return data


def write_json(path: Path | None, payload: Any) -> None:
    if path is None or not _ENABLED:
        return
    try:
        path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:  # noqa: BLE001
        return
    prune()


def prune() -> None:
    """Keep the cache under its byte budget, dropping stale then oldest entries."""
    root = _root()
    if root is None:
        return
    try:
        entries: list[tuple[float, int, Path]] = []
        now = time.time()
        total = 0
        for item in root.iterdir():
            if not item.is_file():
                continue
            try:
                st = item.stat()
            except OSError:
                continue
            if _TTL_S > 0 and (now - st.st_mtime) > _TTL_S:
                item.unlink(missing_ok=True)
                continue
            entries.append((st.st_mtime, st.st_size, item))
            total += st.st_size
        if total <= _MAX_BYTES:
            return
        for _, size, item in sorted(entries, key=lambda e: e[0]):
            item.unlink(missing_ok=True)
            total -= size
            if total <= _MAX_BYTES:
                break
    except Exception:  # noqa: BLE001
        pass
