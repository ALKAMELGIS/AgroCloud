"""Load / save agricultural vector layers (KMZ, KML, SHP, GeoJSON, GeoPackage)."""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path
from typing import Literal
from xml.sax.saxutils import escape

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

from .schema import CORE_FIELDS, FIELD_DEFAULTS

VectorFormat = Literal["kmz", "kml", "shp", "geojson", "gpkg", "unknown"]


def detect_format(path: str | Path) -> VectorFormat:
    ext = Path(path).suffix.lower().lstrip(".")
    if ext in {"kmz", "kml", "shp", "gpkg"}:
        return ext  # type: ignore[return-value]
    if ext in {"geojson", "json"}:
        return "geojson"
    return "unknown"


def _read_kml_bytes(text: str) -> gpd.GeoDataFrame:
    # Fiona/GDAL KML driver via temp file is the most portable path.
    with tempfile.NamedTemporaryFile(suffix=".kml", delete=False, mode="w", encoding="utf-8") as tmp:
        tmp.write(text)
        tmp_path = tmp.name
    try:
        try:
            gdf = gpd.read_file(tmp_path, driver="KML")
        except Exception:
            gdf = gpd.read_file(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return gdf


def load_vector(path: str | Path) -> gpd.GeoDataFrame:
    """Load any supported vector format into a GeoDataFrame (EPSG:4326)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input not found: {path}")

    fmt = detect_format(path)
    if fmt == "kmz":
        with zipfile.ZipFile(path, "r") as zf:
            kml_name = next((n for n in zf.namelist() if n.lower().endswith(".kml")), None)
            if not kml_name:
                raise ValueError("KMZ archive contains no KML document.")
            text = zf.read(kml_name).decode("utf-8", errors="replace")
        gdf = _read_kml_bytes(text)
    elif fmt == "kml":
        gdf = _read_kml_bytes(path.read_text(encoding="utf-8", errors="replace"))
    elif fmt == "shp":
        gdf = gpd.read_file(path)
    elif fmt == "geojson":
        gdf = gpd.read_file(path)
    elif fmt == "gpkg":
        gdf = gpd.read_file(path)
    else:
        raise ValueError(f"Unsupported vector format: {path.suffix}")

    if gdf.empty:
        raise ValueError("Vector layer has no features.")

    # Keep polygonal AOIs for farm enrichment; drop pure placemark points.
    gdf = gdf[gdf.geometry.notna()].copy()
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    if gdf.empty:
        raise ValueError("No Polygon/MultiPolygon features found (points-only layers are skipped).")

    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)

    gdf = gdf.reset_index(drop=True)
    return gdf


def ensure_attribute_fields(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Create all required enrichment columns if missing."""
    out = gdf.copy()
    for col in CORE_FIELDS:
        if col not in out.columns:
            out[col] = FIELD_DEFAULTS.get(col)
    return out


def _wkt_boundary(geom) -> str:
    try:
        return geom.wkt if geom is not None else ""
    except Exception:
        return ""


def populate_geometry_attributes(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Fill Object_ID, centroids, area, boundary from geometry."""
    out = gdf.copy()
    # Projected equal-area for hectare estimates (World Mollweide).
    metric = out.to_crs("+proj=moll +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs")
    for i, (idx, row) in enumerate(out.iterrows()):
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        c = geom.centroid
        out.at[idx, "Object_ID"] = i + 1
        out.at[idx, "Object_Type"] = geom.geom_type
        if not out.at[idx, "Object_Name"]:
            name = row.get("Name") or row.get("name") or row.get("label") or f"Object_{i + 1}"
            out.at[idx, "Object_Name"] = str(name)
        out.at[idx, "Centroid_Lon"] = float(c.x)
        out.at[idx, "Centroid_Lat"] = float(c.y)
        out.at[idx, "Boundary"] = _wkt_boundary(geom)
        area_m2 = float(metric.loc[idx].geometry.area)
        out.at[idx, "Estimated_Area_ha"] = round(area_m2 / 10_000.0, 4)
    return out


def _write_kml(gdf: gpd.GeoDataFrame, out_path: Path) -> None:
    """Minimal KML writer with attribute ExtendedData (no Google Earth styling dependency)."""
    attr_cols = [c for c in gdf.columns if c != "geometry"]
    placemarks: list[str] = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        name = escape(str(row.get("Object_Name") or "Feature"))
        coords = []
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for poly in polys:
            ring = poly.exterior.coords
            coords.append(" ".join(f"{x},{y},0" for x, y in ring))
        poly_xml = "".join(
            f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{c}</coordinates></LinearRing></outerBoundaryIs></Polygon>"
            for c in coords
        )
        ext = []
        for col in attr_cols:
            val = row.get(col)
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            ext.append(
                f"<Data name=\"{escape(str(col))}\"><value>{escape(str(val))}</value></Data>"
            )
        placemarks.append(
            f"<Placemark><name>{name}</name><ExtendedData>{''.join(ext)}</ExtendedData>{poly_xml}</Placemark>"
        )
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f"{''.join(placemarks)}"
        "</Document></kml>"
    )
    out_path.write_text(doc, encoding="utf-8")


def save_vector(gdf: gpd.GeoDataFrame, out_path: str | Path, fmt: VectorFormat | None = None) -> Path:
    """Save enriched layer in the requested/native format."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fmt = fmt or detect_format(out_path)

    if fmt == "geojson":
        gdf.to_file(out_path, driver="GeoJSON")
    elif fmt == "gpkg":
        gdf.to_file(out_path, driver="GPKG")
    elif fmt == "shp":
        # Shapefile truncates field names — keep a sidecar CSV of full attributes.
        gdf.to_file(out_path)
    elif fmt == "kml":
        _write_kml(gdf, out_path)
    elif fmt == "kmz":
        with tempfile.TemporaryDirectory() as td:
            kml_path = Path(td) / "doc.kml"
            _write_kml(gdf, kml_path)
            with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(kml_path, arcname="doc.kml")
    else:
        raise ValueError(f"Cannot save unsupported format: {fmt}")
    return out_path


def export_tables(gdf: gpd.GeoDataFrame, out_dir: str | Path, stem: str) -> dict[str, Path]:
    """Always export CSV, Excel, and GeoJSON companions."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    table = gdf.drop(columns="geometry", errors="ignore")
    csv_path = out_dir / f"{stem}_enriched.csv"
    xlsx_path = out_dir / f"{stem}_enriched.xlsx"
    geojson_path = out_dir / f"{stem}_enriched.geojson"
    table.to_csv(csv_path, index=False)
    table.to_excel(xlsx_path, index=False)
    gdf.to_file(geojson_path, driver="GeoJSON")
    return {"csv": csv_path, "excel": xlsx_path, "geojson": geojson_path}


def geojson_feature_collection(gdf: gpd.GeoDataFrame) -> dict:
    return json.loads(gdf.to_json())
