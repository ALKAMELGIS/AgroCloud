"""Geocoding via Nominatim (OpenStreetMap)."""

from __future__ import annotations

try:
    from geopy.geocoders import Nominatim
except ImportError:  # pragma: no cover
    Nominatim = None

_geolocator = None


def _locator():
    global _geolocator
    if Nominatim is None:
        return None
    if _geolocator is None:
        _geolocator = Nominatim(user_agent="agrocloud_geoai_chat/1.0")
    return _geolocator


def search_place(query: str) -> dict[str, str | float] | None:
    loc = _locator()
    if loc is None:
        return None
    location = loc.geocode(query, timeout=10)
    if not location:
        return None
    return {
        "name": location.address,
        "lat": float(location.latitude),
        "lng": float(location.longitude),
    }
