"""
Fields of the World (FoW) AOI clip — reference-quality agricultural parcels.

Uses DuckDB + httpfs over Source Cooperative GeoParquet predictions
(https://data.source.coop/ftw/global-data/).
"""

from __future__ import annotations

import math
import os
from typing import Any

FOW_HTTP_BASE = os.environ.get(
    "FOW_HTTP_BASE",
    "https://data.source.coop/ftw/global-data/predictions/vectors/alpha",
).rstrip("/")
# fiboa / results-by-admin-conf (country partitions). Prefer HTTPS — anonymous S3 listing is unreliable.
FOW_PARQUET_GLOB = os.environ.get(
    "FOW_PARQUET_GLOB",
    f"{FOW_HTTP_BASE}/results-by-admin-conf/admin:country_code=*/*.parquet",
).strip()
FOW_MAX_FEATURES = int(os.environ.get("FOW_MAX_FEATURES", "5000"))
FOW_MIN_CONFIDENCE = float(os.environ.get("FOW_MIN_CONFIDENCE", "0"))


def _sanitize_exc(exc: BaseException, limit: int = 180) -> str:
    import re

    text = " ".join(str(exc).split())
    text = re.sub(r"https?://\S+", "[url]", text, flags=re.IGNORECASE)
    text = re.sub(r"s3://\S+", "[s3]", text, flags=re.IGNORECASE)
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def _fow_globs(admin_iso: str = "") -> list[str]:
    """Ordered parquet paths — exact country files first (wildcard listing is slow)."""
    iso = admin_iso.strip().upper()
    out: list[str] = []
    names = {
        "FR": "France",
        "DE": "Germany",
        "ES": "Spain",
        "IT": "Italy",
        "US": "UnitedStates",
        "AE": "UnitedArabEmirates",
        "SA": "SaudiArabia",
        "EG": "Egypt",
        "IQ": "Iraq",
        "SY": "Syria",
        "JO": "Jordan",
        "LB": "Lebanon",
        "TR": "Turkey",
        "IR": "Iran",
        "OM": "Oman",
        "KW": "Kuwait",
        "QA": "Qatar",
        "BH": "Bahrain",
        "YE": "Yemen",
        "SD": "Sudan",
        "LY": "Libya",
        "TN": "Tunisia",
        "DZ": "Algeria",
        "MA": "Morocco",
        "IN": "India",
        "CN": "China",
        "BR": "Brazil",
        "AU": "Australia",
        "CA": "Canada",
        "MX": "Mexico",
        "AR": "Argentina",
        "UA": "Ukraine",
        "PL": "Poland",
        "RO": "Romania",
        "HU": "Hungary",
        "GB": "UnitedKingdom",
        "NL": "Netherlands",
        "BE": "Belgium",
        "AT": "Austria",
        "CH": "Switzerland",
        "PT": "Portugal",
        "GR": "Greece",
        "CZ": "Czechia",
        "SK": "Slovakia",
        "BG": "Bulgaria",
        "RS": "Serbia",
        "HR": "Croatia",
        "PK": "Pakistan",
        "BD": "Bangladesh",
        "ID": "Indonesia",
        "TH": "Thailand",
        "VN": "Vietnam",
        "PH": "Philippines",
        "MY": "Malaysia",
        "NG": "Nigeria",
        "ET": "Ethiopia",
        "KE": "Kenya",
        "ZA": "SouthAfrica",
        "NZ": "NewZealand",
        "JP": "Japan",
        "KR": "SouthKorea",
    }
    if iso:
        if iso in names:
            out.append(
                f"{FOW_HTTP_BASE}/results-by-admin-conf/admin:country_code={iso}/{names[iso]}.parquet"
            )
        out.append(
            f"{FOW_HTTP_BASE}/results-by-admin-conf/admin:country_code={iso}/{iso}.parquet"
        )
        out.append(
            f"{FOW_HTTP_BASE}/results-by-admin-conf/admin:country_code={iso}/*.parquet"
        )
    elif FOW_PARQUET_GLOB:
        # Worldwide hive glob is a last resort (slow). Prefer FOW_ADMIN_ISO / admin_iso.
        out.append(FOW_PARQUET_GLOB)
    seen: set[str] = set()
    uniq: list[str] = []
    for g in out:
        if g and g not in seen:
            seen.add(g)
            uniq.append(g)
    return uniq


def _instance_color(idx: int) -> str:
    import colorsys

    hue = (idx * 0.61803398875) % 1.0
    r, g, b = colorsys.hsv_to_rgb(hue, 0.75, 0.96)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def _meters_per_deg(lat: float) -> tuple[float, float]:
    lat_r = math.radians(lat)
    m_lat = 111_132.92 - 559.82 * math.cos(2 * lat_r) + 1.175 * math.cos(4 * lat_r)
    m_lon = 111_412.84 * math.cos(lat_r) - 93.5 * math.cos(3 * lat_r)
    return max(m_lon, 1.0), max(m_lat, 1.0)


def _feature_from_geom(
    geom: Any,
    idx: int,
    engine: str,
    mid_lat: float,
    *,
    simplify_frac: float = 0.0008,
) -> dict | None:
    from shapely.geometry import mapping
    from shapely.validation import make_valid

    try:
        g = make_valid(geom)
    except Exception:  # noqa: BLE001
        return None
    if g is None or g.is_empty:
        return None
    if g.geom_type == "MultiPolygon":
        polys = list(g.geoms)
    elif g.geom_type == "Polygon":
        polys = [g]
    else:
        return None

    m_lon, m_lat = _meters_per_deg(mid_lat)
    p = max(polys, key=lambda x: x.area)
    try:
        # Fix self-intersections; gentle simplify keeps edges close to the mask.
        frac = max(0.0, float(simplify_frac))
        p = p.buffer(0)
        if frac > 0:
            p = p.simplify(max(p.length * frac, 1e-8), preserve_topology=True)
        if p.is_empty or p.geom_type != "Polygon":
            p = max(polys, key=lambda x: x.area)
    except Exception:  # noqa: BLE001
        pass

    area_m2 = abs(p.area) * m_lon * m_lat
    peri_m = float(p.length) * ((m_lon + m_lat) / 2.0)
    field_id = f"FOW-{idx:05d}"
    return {
        "type": "Feature",
        "id": field_id,
        "geometry": mapping(p),
        "properties": {
            "field_id": field_id,
            "class": "agricultural_field",
            "detected_object_type": "Agricultural Field",
            "confidence": 0.92,
            "confidence_score": 0.92,
            "area_m2": round(area_m2, 2),
            "area_ha": round(area_m2 / 10_000.0, 4),
            "perimeter_m": round(peri_m, 2),
            "fill_color": _instance_color(idx),
            "stroke_color": "#ffffff",
            "detection_engine": engine,
            "source_image": "Fields of the World",
        },
    }


def _clip_features(features: list[dict], aoi_geom) -> list[dict]:
    if aoi_geom is None:
        return features
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    out: list[dict] = []
    for f in features:
        try:
            g = make_valid(shape(f["geometry"]).intersection(aoi_geom))
        except Exception:  # noqa: BLE001
            continue
        if g.is_empty:
            continue
        if g.geom_type == "GeometryCollection":
            polys = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
            if not polys:
                continue
            g = unary_union(polys)
        if g.geom_type == "MultiPolygon":
            for j, part in enumerate(g.geoms):
                nf = {**f, "geometry": mapping(part)}
                props = dict(nf.get("properties") or {})
                props["field_id"] = f"{props.get('field_id', 'FOW')}-{j + 1}"
                nf["id"] = props["field_id"]
                nf["properties"] = props
                out.append(nf)
        elif g.geom_type == "Polygon":
            out.append({**f, "geometry": mapping(g)})
    return out


def fetch_fow_via_duckdb(
    west: float,
    south: float,
    east: float,
    north: float,
    admin_iso: str = "",
) -> tuple[list[Any], dict[str, Any]]:
    """Return (geometries, meta). meta may include fow_partition_missing=True."""
    import duckdb
    from shapely import wkb as shapely_wkb

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs; LOAD httpfs;")
    try:
        con.execute("SET s3_region='us-west-2';")
        con.execute("SET s3_access_key_id='';")
        con.execute("SET s3_secret_access_key='';")
        con.execute("SET s3_url_style='path';")
    except Exception:  # noqa: BLE001
        pass
    try:
        con.execute("SET allow_asterisks_in_http_paths=true;")
    except Exception:  # noqa: BLE001
        pass

    iso = (admin_iso or os.environ.get("FOW_ADMIN_ISO", "")).strip().upper()
    conf_clause = ""
    if FOW_MIN_CONFIDENCE > 0:
        conf_clause = (
            f" AND (confidence IS NULL OR confidence >= {float(FOW_MIN_CONFIDENCE)})"
        )

    def _query(glob: str) -> list[Any]:
        # New fiboa vectors have no `label` column — polygons are already field parcels.
        q = f"""
        SELECT ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{glob}')
        WHERE struct_extract(bbox, 'xmax') >= {west}
          AND struct_extract(bbox, 'xmin') <= {east}
          AND struct_extract(bbox, 'ymax') >= {south}
          AND struct_extract(bbox, 'ymin') <= {north}
          {conf_clause}
        LIMIT {FOW_MAX_FEATURES}
        """
        rows = con.execute(q).fetchall()
        geoms: list[Any] = []
        for (raw,) in rows:
            if raw is None:
                continue
            try:
                geoms.append(shapely_wkb.loads(bytes(raw)))
            except Exception:  # noqa: BLE001
                continue
        return geoms

    def _is_missing_partition(exc: BaseException) -> bool:
        """True when Source Cooperative has no parquet for this country/path."""
        msg = str(exc).lower()
        return (
            "404" in msg
            or "not found" in msg
            or "no files found" in msg
            or "http get error" in msg and "404" in msg
        )

    last_err: Exception | None = None
    only_missing = True
    for glob in _fow_globs(iso):
        try:
            return _query(glob), {"admin_iso": iso or None}
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if not _is_missing_partition(exc):
                only_missing = False
            continue
    # Country / partition missing from FoW alpha → empty AOI, not a 500.
    if last_err is not None and only_missing:
        return [], {
            "fow_partition_missing": True,
            "admin_iso": iso or None,
        }
    raise RuntimeError(_sanitize_exc(last_err) if last_err else "FoW query failed")


def query_fow_fields(
    bbox: list[float],
    aoi_geom=None,
    min_area_m2: float = 50.0,
    admin_iso: str | None = None,
) -> dict:
    if len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")
    west, south, east, north = (float(v) for v in bbox)
    if east <= west or north <= south:
        raise ValueError("Invalid bbox.")
    if (east - west) > 2.5 or (north - south) > 2.5:
        raise ValueError("AOI too large for FoW query — zoom in (max ~2.5° span).")

    mid_lat = (south + north) / 2.0
    try:
        import duckdb  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "FoW requires duckdb — pip install duckdb in the agri-field-boundary environment."
        ) from exc
    try:
        geoms, fow_meta = fetch_fow_via_duckdb(
            west, south, east, north, admin_iso=admin_iso or ""
        )
        engine = "fow"
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "FoW catalog unreachable (DuckDB/network). " + _sanitize_exc(exc)
        ) from exc

    features: list[dict] = []
    for i, g in enumerate(geoms, start=1):
        feat = _feature_from_geom(g, i, engine, mid_lat)
        if not feat:
            continue
        area = float((feat["properties"] or {}).get("area_m2") or 0)
        if area < max(10.0, min_area_m2 * 0.25):
            continue
        features.append(feat)

    features = _clip_features(features, aoi_geom)
    for i, f in enumerate(features, start=1):
        props = dict(f.get("properties") or {})
        props["field_id"] = f"FOW-{i:05d}"
        props["fill_color"] = _instance_color(i)
        props["stroke_color"] = "#ffffff"
        props["detection_engine"] = engine
        f["id"] = props["field_id"]
        f["properties"] = props

    stats: dict[str, Any] = {"field": len(features)}
    if fow_meta.get("fow_partition_missing"):
        stats["fow_partition_missing"] = True
        if fow_meta.get("admin_iso"):
            stats["admin_iso"] = fow_meta["admin_iso"]

    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": len(features),
        "stats": stats,
        "score": 0.92 if features else 0.0,
        "width": 0,
        "height": 0,
        "engine": "fow",
        "device": "remote",
        "source": "fow",
        "aoi_applied": aoi_geom is not None,
    }
