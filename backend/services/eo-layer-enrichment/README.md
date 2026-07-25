# AgroCloud EO Layer Enrichment

Automated GIS tool that enriches agricultural vector layers (**KMZ / KML / SHP / GeoJSON / GeoPackage**) with Earth Observation attributes from the **latest cloud-free Sentinel-2 L2A** scene.

No manual field editing — the tool creates every required attribute, fills geometry metadata, downloads imagery, computes indices, runs zonal statistics + crop/water/yield heuristics, and writes outputs.

## Features

- Vector IO: KMZ, KML, SHP, GeoJSON, GPKG → EPSG:4326
- Auto-create full attribute schema (crop, water, yield, anomaly, priority, …)
- Latest Sentinel-2 L2A via **Microsoft Planetary Computer** (fallback: Copernicus STAC)
- Indices: NDVI, NDMI, NDWI, EVI, SAVI, NDRE, MSAVI, GCI, OSAVI
- Per-polygon mean/median/min/max/std/count + vegetation cover %
- Heuristic crop type, health, growth stage, water stress, suitability, yield
- Previous-scene change detection (Expansion / Reduction / New Farm / Abandoned)
- Exports: native format + **CSV**, **Excel**, **GeoJSON**
- CLI progress bar; QGIS Processing + ArcGIS Pro script stubs

## Install

```bash
cd backend/services/eo-layer-enrichment
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
pip install -e .
```

Requires a working GDAL/Fiona stack (comes with GeoPandas wheels on most platforms).

## CLI

```bash
eo-enrich examples/demo_fields.geojson -o ./out

# options
eo-enrich farms.kmz --max-cloud 20 --lookback-days 365 --resolution 20 --workers 8
```

### Outputs

| File | Description |
|------|-------------|
| `*_enriched.<same as input>` | Updated vector (KMZ→KMZ, SHP→SHP, …) |
| `*_enriched.csv` | Attribute table |
| `*_enriched.xlsx` | Excel workbook |
| `*_enriched.geojson` | Always exported companion |

## Python API

```python
from eo_enrichment import EnrichmentConfig, enrich_vector_layer

result = enrich_vector_layer(
    EnrichmentConfig(
        input_path="fields.gpkg",
        output_dir="out",
        max_cloud=20,
    )
)
print(result.output_vector, result.scene_id)
```

## Integrations

- **QGIS**: `integrations/qgis/agrocloud_eo_enrichment.py`
- **ArcGIS Pro**: `integrations/arcgis/run_eo_enrichment.py`

## Attribute fields

See `eo_enrichment/schema.py` and `eo_enrichment/rs_catalog.py`.

**Remote Sensing Layer Select parity** — polygon means are written for every
optical / derived index from the AgroCloud Layer dropdown:

- Core: `NDVI`, `NDMI`, `NDWI`, `SAVI`, `ET`, `LST`
- Spectral extras: `EVI`, `NDRE`, `MSAVI`, `GCI`, `OSAVI`, `NDSI`, `SI`, `SSI`
- Composites: `CVHI`, `VHS`, `CHAS`, `ADI`, `CHS`, … (full catalog in `COMPOSITE_EXPRS`)
- Deltas / cultivation: `DCHAS`, `DNDVI`, …, `NCADI` (when a previous scene is found)

Not filled as continuous means (categorical / external): `PRECIP`, `LULC`,
`CHAS_ALERT`, `STRESS_ZONES` (use the UI Layer Live engines for those).

Also includes agronomic fields: `Crop_Type`, `Water_Stress`, `Estimated_Yield`, …

## Notes / limitations (v1)

- Crop type uses **spectral heuristics** (not a trained deep model). Replace `enrich.classify_crop` with your GeoAI model when ready.
- Actual ET / water use are **FAO-style proxies**, not full energy-balance ET.
- Shapefile field names are truncated by the format; use the CSV/Excel companions for full names.
- Point-only KMZ placemarks are skipped (polygons only).
- Standalone `.exe` packaging: `pyinstaller -F eo_enrichment/cli.py` (optional).

## Tests

```bash
pip install pytest
pytest tests -q
```

## Relation to AgroCloud

Complements the existing `analysis_engine` STAC/MPC stack and the Satellite Intelligence UI.
Wire this CLI into a backend job or Processing toolbox to enrich layers before loading them in the map dock.
