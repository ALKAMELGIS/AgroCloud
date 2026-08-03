"""Unit tests for SegFormer field instance-split (watershed) + tiling helpers."""

from __future__ import annotations

import unittest

import numpy as np


def _overlap_pixels(tile_size: int, overlap_frac: float) -> int:
    tile = max(32, int(tile_size))
    frac = max(0.0, min(0.5, float(overlap_frac)))
    return max(0, min(tile - 1, int(round(tile * frac))))


def _iter_tiles(
    height: int, width: int, tile_size: int, overlap_px: int
) -> list[tuple[int, int, int, int]]:
    h = max(0, int(height))
    w = max(0, int(width))
    if h <= 0 or w <= 0:
        return []
    tile = max(32, int(tile_size))
    if h <= tile and w <= tile:
        return [(0, h, 0, w)]

    overlap = max(0, min(tile - 1, int(overlap_px)))
    step = max(32, tile - overlap)
    tiles: list[tuple[int, int, int, int]] = []
    seen: set[tuple[int, int, int, int]] = set()

    y = 0
    while y < h:
        y0 = y
        y1 = min(h, y0 + tile)
        if y1 - y0 < tile and y0 > 0:
            y0 = max(0, y1 - tile)
        x = 0
        while x < w:
            x0 = x
            x1 = min(w, x0 + tile)
            if x1 - x0 < tile and x0 > 0:
                x0 = max(0, x1 - tile)
            win = (y0, y1, x0, x1)
            if win not in seen:
                seen.add(win)
                tiles.append(win)
            if x1 >= w:
                break
            x += step
        if y1 >= h:
            break
        y += step
    return tiles


def _stitch_by_max_conf(
    height: int,
    width: int,
    tiles: list[tuple[tuple[int, int, int, int], list[int], list[float]]],
) -> tuple[list[int], list[float]]:
    labels = [0] * (height * width)
    conf = [0.0] * (height * width)
    for (y0, y1, x0, x1), t_labels, t_conf in tiles:
        th, tw = y1 - y0, x1 - x0
        for row in range(th):
            for col in range(tw):
                ti = row * tw + col
                c = float(t_conf[ti])
                gi = (y0 + row) * width + (x0 + col)
                if c >= conf[gi]:
                    conf[gi] = c
                    labels[gi] = int(t_labels[ti])
    return labels, conf


def _instance_split_watershed(mask: np.ndarray, *, min_px: int = 16) -> np.ndarray:
    """Mirror of app._instance_split_watershed for pure unit tests (OpenCV)."""
    import cv2

    binary = (mask.astype(np.uint8) > 0).astype(np.uint8)
    if not binary.any():
        return np.zeros(binary.shape, dtype=np.int32)

    dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    peak_floor = max(2.0, float(np.percentile(dist[binary > 0], 55)) * 0.45)
    _, sure_fg = cv2.threshold(dist, peak_floor, 255, cv2.THRESH_BINARY)
    sure_fg = sure_fg.astype(np.uint8)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    sure_fg = cv2.erode(sure_fg, k3, iterations=1)

    n_markers, markers = cv2.connectedComponents(sure_fg)
    if n_markers <= 1:
        n_cc, cc = cv2.connectedComponents(binary)
        out = np.zeros(binary.shape, dtype=np.int32)
        next_id = 1
        for i in range(1, n_cc):
            area = int((cc == i).sum())
            if area >= min_px:
                out[cc == i] = next_id
                next_id += 1
        return out

    unknown = cv2.subtract(binary * 255, sure_fg)
    markers = markers + 1
    markers[unknown > 0] = 0
    surface = cv2.cvtColor((binary * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    cv2.watershed(surface, markers)

    out = np.zeros(binary.shape, dtype=np.int32)
    next_id = 1
    for label in range(2, int(markers.max()) + 1):
        region = (markers == label) & (binary > 0)
        area = int(region.sum())
        if area >= min_px:
            out[region] = next_id
            next_id += 1

    if next_id == 1:
        n_cc, cc = cv2.connectedComponents(binary)
        for i in range(1, n_cc):
            area = int((cc == i).sum())
            if area >= min_px:
                out[cc == i] = next_id
                next_id += 1
    return out


class SegFormerTilingTests(unittest.TestCase):
    def test_single_tile_when_image_fits(self) -> None:
        self.assertEqual(_iter_tiles(400, 300, 512, 100), [(0, 400, 0, 300)])

    def test_overlap_pixels_default_20pct(self) -> None:
        self.assertEqual(_overlap_pixels(512, 0.2), round(512 * 0.2))

    def test_640_tile_overlap(self) -> None:
        self.assertEqual(_overlap_pixels(640, 0.2), round(640 * 0.2))

    def test_large_image_fully_covered(self) -> None:
        tile = 512
        overlap = _overlap_pixels(tile, 0.2)
        windows = _iter_tiles(1200, 1000, tile, overlap)
        self.assertGreater(len(windows), 1)
        covered = [[False] * 1000 for _ in range(1200)]
        for y0, y1, x0, x1 in windows:
            self.assertLessEqual(y1 - y0, tile)
            self.assertLessEqual(x1 - x0, tile)
            for y in range(y0, y1):
                for x in range(x0, x1):
                    covered[y][x] = True
        self.assertTrue(all(all(row) for row in covered))

    def test_stitch_prefers_higher_confidence(self) -> None:
        labels, conf = _stitch_by_max_conf(
            3,
            4,
            [
                ((0, 3, 0, 3), [1] * 9, [0.4] * 9),
                ((0, 3, 1, 4), [2] * 9, [0.9] * 9),
            ],
        )
        # Overlap columns 1–2 should prefer label 2 (higher conf).
        self.assertEqual(labels[0 * 4 + 1], 2)
        self.assertEqual(labels[1 * 4 + 2], 2)
        self.assertAlmostEqual(conf[0 * 4 + 1], 0.9)


class FieldInstanceSplitTests(unittest.TestCase):
    def test_two_separated_blobs_become_two_instances(self) -> None:
        mask = np.zeros((80, 120), dtype=bool)
        mask[10:40, 10:40] = True
        mask[10:40, 80:110] = True
        labels = _instance_split_watershed(mask, min_px=16)
        ids = sorted(int(v) for v in np.unique(labels) if v > 0)
        self.assertEqual(len(ids), 2)

    def test_empty_mask_returns_zeros(self) -> None:
        labels = _instance_split_watershed(np.zeros((20, 20), dtype=bool), min_px=4)
        self.assertEqual(int(labels.max()), 0)


if __name__ == "__main__":
    unittest.main()
