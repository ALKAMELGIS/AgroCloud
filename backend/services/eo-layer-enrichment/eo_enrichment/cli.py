"""CLI: eo-enrich — enrich agricultural vectors with latest Sentinel-2 attributes."""

from __future__ import annotations

import sys
from pathlib import Path

import click
from tqdm import tqdm

from .pipeline import EnrichmentConfig, enrich_vector_layer


@click.command(context_settings={"help_option_names": ["-h", "--help"]})
@click.argument("input_path", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option(
    "-o",
    "--output-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Output folder (default: <input>_enriched next to the file).",
)
@click.option("--max-cloud", default=20.0, show_default=True, help="Max scene cloud cover %.")
@click.option("--lookback-days", default=365, show_default=True, help="Search window in days.")
@click.option("--resolution", default=20, show_default=True, help="Stack resolution (metres).")
@click.option("--workers", default=4, show_default=True, help="Parallel polygon workers.")
@click.option("--no-previous/--with-previous", default=False, help="Skip previous-scene change detection.")
@click.option("--catalog-url", default=None, help="Override STAC catalog URL (MPC by default).")
def main(
    input_path: Path,
    output_dir: Path | None,
    max_cloud: float,
    lookback_days: int,
    resolution: int,
    workers: int,
    no_previous: bool,
    catalog_url: str | None,
) -> None:
    """Enrich INPUT_PATH (KMZ/KML/SHP/GeoJSON/GPKG) with Sentinel-2 EO attributes."""
    bar = tqdm(total=100, desc="EO Enrichment", unit="%")

    def progress(msg: str, pct: float) -> None:
        bar.n = min(100, max(0, int(pct)))
        bar.set_postfix_str(msg[:60], refresh=False)
        bar.refresh()

    try:
        result = enrich_vector_layer(
            EnrichmentConfig(
                input_path=input_path,
                output_dir=output_dir,
                max_cloud=max_cloud,
                lookback_days=lookback_days,
                resolution=resolution,
                workers=workers,
                include_previous=not no_previous,
                catalog_url=catalog_url,
                progress=progress,
            )
        )
    except Exception as exc:  # noqa: BLE001
        bar.close()
        click.echo(f"ERROR: {exc}", err=True)
        sys.exit(1)

    bar.close()
    click.echo(f"Scene: {result.scene_id} ({result.acquisition_date})")
    click.echo(f"Vector: {result.output_vector}")
    for kind, path in result.exports.items():
        click.echo(f"{kind}: {path}")


if __name__ == "__main__":
    main()
