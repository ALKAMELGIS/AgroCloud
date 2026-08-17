"""
Raster-level field mask refinement before contour / polygonize.

Pipeline:
  boundary refine → connected components → remove small objects / holes →
  controlled morphological closing → optional instance merging → clean masks

Do not use large closing kernels that fuse neighboring fields across roads.
"""

from __future__ import annotations

import os
from typing import Iterable, Sequence

import cv2
import numpy as np

# Soft floor for FTW / Sentinel-2 10 m: ~0.5–1 ha of noise goes away as speckles.
# 80 px @ 10 m ≈ 8000 m²; never use the old 16-px floor.
FTW_MIN_FIELD_M2 = float(os.environ.get("FTW_MIN_FIELD_M2", "500"))
FTW_MIN_PX = int(os.environ.get("FTW_MIN_PX", "80"))
FTW_MERGE_CONTACT_FRAC = float(os.environ.get("FTW_MERGE_CONTACT_FRAC", "0.28"))


def ftw_min_px_from_area(min_area_m2: float, resolution_m: float = 10.0) -> int:
    """Map requested min area to pixel count at native S2 resolution (hard floor FTW_MIN_PX)."""
    res = max(1.0, float(resolution_m))
    from_area = int(max(0.0, float(min_area_m2)) / (res * res))
    return max(FTW_MIN_PX, from_area)


def ftw_polygonize_min_size_m2(min_area_m2: float) -> float:
    """Polygonize min_size — never pass UI=1 through as a pinhead floor."""
    return max(float(min_area_m2), FTW_MIN_FIELD_M2)


def _as_u8(mask: np.ndarray) -> np.ndarray:
    if mask.dtype == np.uint8:
        return (mask > 0).astype(np.uint8) * 255
    return (mask.astype(np.float32) > 0.5).astype(np.uint8) * 255


def fill_holes(mask_u8: np.ndarray) -> np.ndarray:
    """Fill interior holes when the border is background."""
    u8 = _as_u8(mask_u8)
    h, w = u8.shape[:2]
    if u8[0, 0] != 0:
        return u8
    flood = u8.copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, ff_mask, (0, 0), 255)
    holes = cv2.bitwise_not(flood)
    return cv2.bitwise_or(u8, holes)


def refine_binary_mask(
    mask: np.ndarray,
    *,
    min_px: int = 40,
    close_ksize: int = 3,
    close_iterations: int = 1,
    open_ksize: int = 3,
) -> np.ndarray:
    """
    Clean a single binary field mask:
    open → controlled close → fill holes → CC filter → 1-px majority on rim.
    """
    u8 = _as_u8(mask)
    if not np.any(u8):
        return u8 > 0

    k_open = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (max(3, int(open_ksize)), max(3, int(open_ksize)))
    )
    u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, k_open, iterations=1)

    # Controlled closing — small kernel only (close 1–2 px gaps inside a field).
    ck = max(3, int(close_ksize))
    if ck % 2 == 0:
        ck += 1
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ck, ck))
    u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, k_close, iterations=max(1, int(close_iterations)))

    u8 = fill_holes(u8)

    n, labels, stats, _ = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), connectivity=8)
    cleaned = np.zeros_like(u8)
    min_keep = max(1, int(min_px))
    for i in range(1, n):
        if int(stats[i, cv2.CC_STAT_AREA]) >= min_keep:
            cleaned[labels == i] = 255

    # 1-px majority filter on the rim only — reduces single-pixel stair noise.
    if np.any(cleaned):
        blurred = cv2.medianBlur(cleaned, 3)
        edge = cv2.morphologyEx(cleaned, cv2.MORPH_GRADIENT, k_open)
        rim = edge > 0
        out = cleaned.copy()
        out[rim] = blurred[rim]
        cleaned = out

    return cleaned > 0


def _contact_length_px(a: np.ndarray, b: np.ndarray) -> int:
    """Count pixels of A that touch B (dilate A by 2px to survive light open/gap)."""
    ka = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dil_a = cv2.dilate(a.astype(np.uint8), ka, iterations=2)
    return int(np.count_nonzero((dil_a > 0) & (b > 0)))


def _mean_rgb(mask: np.ndarray, rgb: np.ndarray | None) -> np.ndarray | None:
    if rgb is None or mask is None or not np.any(mask):
        return None
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        return None
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return None
    sample = rgb[ys, xs, :3].astype(np.float32)
    return sample.mean(axis=0)


def merge_instance_masks(
    components: Sequence[tuple[np.ndarray, float]],
    *,
    rgb: np.ndarray | None = None,
    contact_frac: float = 0.25,
    max_rgb_delta: float = 28.0,
    min_px: int = 40,
) -> list[tuple[np.ndarray, float]]:
    """
    Union instance masks that share a long contact edge and similar mean RGB.

    contact_frac: contact pixels / min(perimeter_a, perimeter_b) approximated by
    contact / min(area^{0.5}*4, …) — we use contact / min(mask_area) * sqrt scale.
    """
    if not components:
        return []

    refined: list[tuple[np.ndarray, float]] = []
    for mask, conf in components:
        if isinstance(mask, str):
            continue
        clean = refine_binary_mask(mask, min_px=min_px)
        if not np.any(clean):
            continue
        refined.append((clean.astype(np.uint8), float(conf)))

    n = len(refined)
    if n <= 1:
        return refined

    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    areas = [int(np.count_nonzero(m)) for m, _ in refined]
    perims: list[int] = []
    for m, _ in refined:
        contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        peri = 0
        for c in contours:
            peri += int(cv2.arcLength(c, True))
        perims.append(max(peri, 1))

    means = [_mean_rgb(m, rgb) for m, _ in refined]

    for i in range(n):
        for j in range(i + 1, n):
            contact = _contact_length_px(refined[i][0], refined[j][0])
            if contact <= 0:
                continue
            shorter = min(perims[i], perims[j])
            if contact < contact_frac * shorter:
                continue
            if means[i] is not None and means[j] is not None:
                delta = float(np.linalg.norm(means[i] - means[j]))
                if delta > max_rgb_delta:
                    continue
            # Avoid merging two already-large compact parcels that only share a short corner.
            a_i, a_j = areas[i], areas[j]
            if a_i > 800 and a_j > 800 and contact < 0.22 * shorter:
                continue
            union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged: list[tuple[np.ndarray, float]] = []
    for idxs in groups.values():
        acc = np.zeros_like(refined[idxs[0]][0])
        conf = 0.0
        weight = 0.0
        for i in idxs:
            acc = np.maximum(acc, refined[i][0])
            w = float(areas[i])
            conf += refined[i][1] * w
            weight += w
        clean = refine_binary_mask(acc > 0, min_px=min_px)
        if not np.any(clean):
            continue
        score = (conf / weight) if weight > 0 else max(refined[i][1] for i in idxs)
        merged.append((clean.astype(bool), float(score)))
    return merged


def refine_label_raster(
    labels: np.ndarray,
    *,
    min_px: int = 40,
    close_ksize: int = 3,
    merge_contact_frac: float = 0.28,
) -> np.ndarray:
    """
    Refine a multi-label prediction raster (0 = background, >0 = field id).
    Merges adjacent labels with long shared borders (no RGB cue), then drops
    components below min_px so fused parcels survive.
    """
    lab = labels.astype(np.int32)
    uniq = [int(v) for v in np.unique(lab) if int(v) > 0]
    if not uniq:
        return lab

    # Collect with a softer floor so fragments can merge before the hard min_px drop.
    soft_floor = max(1, int(min_px) // 4)
    components: list[tuple[np.ndarray, float]] = []
    for uid in uniq:
        m = lab == uid
        if int(np.count_nonzero(m)) < soft_floor:
            continue
        components.append((m.astype(np.uint8), 1.0))

    merged = merge_instance_masks(
        components,
        rgb=None,
        contact_frac=merge_contact_frac,
        min_px=soft_floor,
    )

    out = np.zeros_like(lab)
    for new_id, (mask, _) in enumerate(merged, start=1):
        clean = refine_binary_mask(mask, min_px=min_px, close_ksize=close_ksize)
        if np.any(clean):
            out[clean] = new_id
    return out


def refine_prediction_geotiff(
    path: str,
    *,
    min_px: int = 40,
    merge_contact_frac: float = 0.28,
    out_path: str | None = None,
) -> str:
    """
    Load a prediction GeoTIFF, refine labels, write beside input (or out_path).
    Returns path to the refined raster.
    """
    import rasterio

    dst = out_path or path
    with rasterio.open(path) as src:
        data = src.read(1)
        profile = src.profile.copy()
        refined = refine_label_raster(
            data, min_px=min_px, merge_contact_frac=merge_contact_frac
        )
        max_id = int(refined.max()) if refined.size else 0
        if max_id <= 255 and profile.get("dtype") in ("uint8", "int8"):
            write = refined.astype(np.uint8)
            profile.update(dtype="uint8")
        elif max_id <= 65535:
            write = refined.astype(np.uint16)
            profile.update(dtype="uint16")
        else:
            write = refined.astype(np.int32)
            profile.update(dtype="int32")

        with rasterio.open(dst, "w", **profile) as sink:
            sink.write(write, 1)
    return dst


def refine_ftw_prediction_geotiff(
    path: str,
    *,
    min_area_m2: float = 500.0,
    resolution_m: float = 10.0,
    out_path: str | None = None,
) -> str:
    """
    FTW-oriented refine: hard min_px floor, aggressive fragment merge, then drop speckles.
    """
    min_px = ftw_min_px_from_area(min_area_m2, resolution_m=resolution_m)
    return refine_prediction_geotiff(
        path,
        min_px=min_px,
        merge_contact_frac=FTW_MERGE_CONTACT_FRAC,
        out_path=out_path,
    )


def masks_to_cleaned_components(
    components: Iterable[tuple[np.ndarray, float]],
    *,
    rgb: np.ndarray | None = None,
    min_px: int = 40,
    merge: bool = True,
) -> list[tuple[np.ndarray, float]]:
    """Public entry: refine (+ optional merge) instance mask list."""
    items = [(m, float(c)) for m, c in components if not isinstance(m, str)]
    if not items:
        return []
    if merge:
        return merge_instance_masks(items, rgb=rgb, min_px=min_px)
    out: list[tuple[np.ndarray, float]] = []
    for m, c in items:
        clean = refine_binary_mask(m, min_px=min_px)
        if np.any(clean):
            out.append((clean, c))
    return out
