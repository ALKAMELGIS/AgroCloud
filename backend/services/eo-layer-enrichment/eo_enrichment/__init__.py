"""AgroCloud EO Layer Enrichment — Sentinel-2 attribute population for farm vectors."""

from __future__ import annotations

__all__ = ["EnrichmentConfig", "enrich_vector_layer", "__version__"]
__version__ = "1.0.0"


def __getattr__(name: str):
    if name in {"EnrichmentConfig", "enrich_vector_layer"}:
        from .pipeline import EnrichmentConfig, enrich_vector_layer

        return EnrichmentConfig if name == "EnrichmentConfig" else enrich_vector_layer
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
