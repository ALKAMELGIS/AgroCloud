"""
Fields of the World (FoW) AOI clip — reference-quality agricultural parcels.

Uses DuckDB + httpfs over Source Cooperative GeoParquet predictions
(https://data.source.coop/ftw/global-data/).
"""

from __future__ import annotations

import math
import os
from typing import Any

FOW_PARQUET_GLOB = os.environ.get(
    "FOW_PARQUET_GLOB",
    # Physical S3 prefix (llms.txt); HTTP mirror is https://data.source.coop/ftw/global-data/
    "s3://us-west-2.opendata.source.coop/tge-labs/ftw-global-data/predictions/vectors/alpha/results/*.parquet",
).strip()
FOW_HTTP_PARQUET = os.environ.get(
    "FOW_HTTP_PARQUET",
    "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/results/*.parquet",
).strip()
FOW_MAX_FEATURES = int(os.environ.get("FOW_MAX_FEATURES", "5000"))


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


def _feature_from_geom(geom: Any, idx: int, engine: str, mid_lat: float) -> dict | None:
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
        p = p.buffer(0).simplify(max(p.length * 0.0008, 1e-7), preserve_topology=True)
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


def fetch_fow_via_duckdb(west: float, south: float, east: float, north: float) -> list[Any]:
    import duckdb
    from shapely import wkb as shapely_wkb

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs; LOAD httpfs;")
    try:
        con.execute("SET s3_region='us-west-2';")
        con.execute("SET s3_access_key_id='';")
        con.execute("SET s3_secret_access_key='';")
        # Prefer path-style against Source Cooperative open data host when available
        try:
            con.execute("SET s3_endpoint='opendata.source.coop';")
            con.execute("SET s3_url_style='path';")
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        pass
    try:
        con.execute("SET allow_asterisks_in_http_paths=true;")
    except Exception:  # noqa: BLE001
        pass

    # Prefer country-partitioned results when FOW_ADMIN_ISO is set (faster)
    admin_iso = os.environ.get("FOW_ADMIN_ISO", "").strip().upper()
    admin_glob = ""
    if admin_iso:
        admin_glob = (
            f"s3://us-west-2.opendata.source.coop/tge-labs/ftw-global-data/"
            f"predictions/vectors/alpha/results-by-admin/{admin_iso}/*.parquet"
        )
    def _query(glob: str) -> list[Any]:
        q = f"""
        SELECT ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{glob}')
        WHERE coalesce(label, 'field') = 'field'
          AND struct_extract(bbox, 'xmax') >= {west}
          AND struct_extract(bbox, 'xmin') <= {east}
          AND struct_extract(bbox, 'ymax') >= {south}
          AND struct_extract(bbox, 'ymin') <= {north}
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

    last_err: Exception | None = None
    globs = [g for g in (admin_glob, FOW_PARQUET_GLOB, FOW_HTTP_PARQUET) if g]
    for glob in globs:
        try:
            return _query(glob)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            continue
    raise RuntimeError(str(last_err) if last_err else "FoW query failed")


def query_fow_fields(
    bbox: list[float],
    aoi_geom=None,
    min_area_m2: float = 50.0,
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
        geoms = fetch_fow_via_duckdb(west, south, east, north)
        engine = "fow"
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Could not load Fields of the World parcels via DuckDB/httpfs. "
            f"Install duckdb and check network access to data.source.coop. Detail: {exc}"
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

    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": len(features),
        "stats": {"field": len(features)},
        "score": 0.92 if features else 0.0,
        "width": 0,
        "height": 0,
        "engine": "fow",
        "device": "remote",
        "source": "fow",
        "aoi_applied": aoi_geom is not None,
    }
