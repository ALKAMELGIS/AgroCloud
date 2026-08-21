"""Synthetic mask tests for field_mask_refine."""

from __future__ import annotations

import numpy as np

from field_mask_refine import (
    merge_instance_masks,
    refine_binary_mask,
    refine_label_raster,
)


def test_refine_drops_speckles_and_fills_hole():
    m = np.zeros((40, 40), dtype=bool)
    m[5:30, 5:30] = True
    m[12:18, 12:18] = False  # hole
    m[2, 2] = True  # speckle
    clean = refine_binary_mask(m, min_px=20, close_ksize=3)
    assert clean[2, 2] == False
    assert clean[15, 15] == True  # hole filled
    assert clean[10, 10] == True


def test_merge_adjacent_fragments_of_same_rectangle():
    # Two halves of one rectangle touching along a long vertical edge.
    a = np.zeros((60, 80), dtype=np.uint8)
    b = np.zeros((60, 80), dtype=np.uint8)
    a[10:50, 10:40] = 255
    b[10:50, 40:70] = 255
    rgb = np.zeros((60, 80, 3), dtype=np.uint8)
    rgb[:, :] = (40, 120, 40)

    merged = merge_instance_masks(
        [(a > 0, 0.9), (b > 0, 0.85)],
        rgb=rgb,
        contact_frac=0.2,
        min_px=20,
    )
    assert len(merged) == 1
    mask, conf = merged[0]
    assert int(np.count_nonzero(mask)) > 2000
    assert conf > 0.8


def test_keep_fields_separated_by_gap():
    # Two rectangles with a 3-px road gap — must stay separate.
    a = np.zeros((60, 80), dtype=np.uint8)
    b = np.zeros((60, 80), dtype=np.uint8)
    a[10:50, 5:30] = 255
    b[10:50, 34:60] = 255  # gap of 3 px at columns 30-33
    rgb = np.zeros((60, 80, 3), dtype=np.uint8)
    rgb[:, :] = (40, 120, 40)

    merged = merge_instance_masks(
        [(a > 0, 0.9), (b > 0, 0.85)],
        rgb=rgb,
        contact_frac=0.25,
        min_px=20,
    )
    assert len(merged) == 2


def test_refine_label_raster_merges_touching_ids():
    lab = np.zeros((50, 50), dtype=np.int32)
    lab[5:40, 5:25] = 1
    lab[5:40, 25:45] = 2
    out = refine_label_raster(lab, min_px=30, merge_contact_frac=0.2)
    ids = [int(v) for v in np.unique(out) if int(v) > 0]
    assert len(ids) == 1


def test_split_field_plus_speckles_merges_to_one():
    """One field split into 4 touching IDs + 5 speckles → 1 field, speckles gone."""
    lab = np.zeros((80, 80), dtype=np.int32)
    # 40x40 field as 2x2 quadrants (each 20x20 = 400 px).
    lab[10:30, 10:30] = 1
    lab[10:30, 30:50] = 2
    lab[30:50, 10:30] = 3
    lab[30:50, 30:50] = 4
    # Speckles (~4–9 px each), well below soft floor for min_px=80.
    lab[2:4, 2:4] = 5
    lab[2:5, 70:73] = 6
    lab[70:72, 2:4] = 7
    lab[70:73, 70:73] = 8
    lab[60:62, 5:7] = 9

    out = refine_label_raster(lab, min_px=80, merge_contact_frac=0.28)
    ids = [int(v) for v in np.unique(out) if int(v) > 0]
    assert len(ids) == 1
    assert int(np.count_nonzero(out > 0)) >= 1500
    # Speckle pixels must be gone.
    assert out[2, 2] == 0
    assert out[71, 71] == 0


def test_road_gap_keeps_two_fields():
    """Two fields with a 3-px road gap stay separate after label refine."""
    lab = np.zeros((60, 80), dtype=np.int32)
    lab[10:50, 5:30] = 1
    lab[10:50, 34:60] = 2  # columns 30-33 empty
    out = refine_label_raster(lab, min_px=40, merge_contact_frac=0.28)
    ids = [int(v) for v in np.unique(out) if int(v) > 0]
    assert len(ids) == 2
