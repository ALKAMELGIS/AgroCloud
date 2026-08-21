"""Tests for Sentinel-2 L2A date-window expansion used by AFD."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sentinel2_l2a_stack import _parse_date_window


def test_single_day_today_expands_lookback():
    today = datetime.now(timezone.utc).date().isoformat()
    window, target = _parse_date_window(today, today, today, lookback_days=60)
    start_s, end_s = window.split("/")
    start = date.fromisoformat(start_s)
    end = date.fromisoformat(end_s)
    assert target == date.fromisoformat(today)
    assert (end - start).days >= 30
    assert end <= date.fromisoformat(today)


def test_wide_range_is_preserved():
    window, target = _parse_date_window(
        None,
        "2024-06-01",
        "2024-08-31",
        lookback_days=60,
    )
    assert window.startswith("2024-06-01/")
    assert target == date(2024, 8, 31)


def test_scene_date_only_expands_around_anchor():
    window, target = _parse_date_window("2024-06-15", None, None, lookback_days=45)
    start_s, end_s = window.split("/")
    start = date.fromisoformat(start_s)
    end = date.fromisoformat(end_s)
    assert target == date(2024, 6, 15)
    assert start == date(2024, 6, 15) - timedelta(days=45)
    assert end == date(2024, 6, 18)  # +3 days
