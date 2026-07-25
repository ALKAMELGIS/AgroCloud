"""
ArcGIS Pro Script Tool entry point.

Create a toolbox (.atbx / .pyt) that calls `run(input_path, output_folder, max_cloud)`.
Example toolbox parameter setup:
  - input_path: File (KMZ, KML, SHP, GeoJSON, GPKG)
  - output_folder: Folder
  - max_cloud: Double (default 20)
"""

from __future__ import annotations

from pathlib import Path


def run(input_path: str, output_folder: str, max_cloud: float = 20.0) -> str:
    from eo_enrichment.pipeline import EnrichmentConfig, enrich_vector_layer

    result = enrich_vector_layer(
        EnrichmentConfig(
            input_path=Path(input_path),
            output_dir=Path(output_folder),
            max_cloud=float(max_cloud),
        )
    )
    return str(result.output_vector)


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="ArcGIS Pro / standalone EO enrichment")
    p.add_argument("input_path")
    p.add_argument("output_folder")
    p.add_argument("--max-cloud", type=float, default=20.0)
    args = p.parse_args()
    print(run(args.input_path, args.output_folder, args.max_cloud))
