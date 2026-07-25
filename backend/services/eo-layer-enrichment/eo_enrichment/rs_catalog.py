"""
Remote Sensing Layer catalog — mirrors AgroCloud `RemoteSensingLayerSelect`
(`frontend/src/lib/agroCompositeIndices.ts` + Sentinel Hub core layers).
"""

from __future__ import annotations

# Core Interpretation (same order as UI)
CORE_INTERPRETATION = ("NDVI", "NDMI", "NDWI", "SAVI", "ET", "LST")

# Extra spectral indices computed from Sentinel-2 bands (also useful attributes)
SPECTRAL_EXTRA = ("EVI", "NDRE", "MSAVI", "GCI", "OSAVI", "NDSI", "SI", "SSI")

# Composite indices from AGRO_COMPOSITE_CATEGORIES (expr using ndvi/ndmi/ndwi/savi/evi/ndre/ndsi/si/ssi)
COMPOSITE_EXPRS: dict[str, str] = {
    "CVHI": "(ndvi + ndmi + ndwi + savi) / 4",
    "VHS": "(ndvi + savi) / 2",
    "VDI": "0.7 * ndvi + 0.3 * savi",
    "CVI": "0.50 * ndvi + 0.30 * evi + 0.20 * ndre",
    "CSI": "1 - ((ndvi + ndmi) / 2)",
    "WST": "ndvi - ndmi",
    "DRI": "1 - ((ndmi + ndwi) / 2)",
    "VMI": "(ndmi + ndwi) / 2",
    "SMI": "0.7 * ndmi + 0.3 * ndwi",
    "OIR": "ndwi - ndvi",
    "IEI": "ndmi / (savi + 1e-6)",
    "UII": "savi - ndmi",
    "FPR": "(1 - ndvi) + (1 - ndmi)",
    "CPI": "0.4 * ndvi + 0.3 * ndmi + 0.2 * savi + 0.1 * ndwi",
    "GPI": "(ndvi + savi + ndmi) / 3",
    "CSI2": "1 - abs(ndvi - savi)",
    "CRI": "ndvi + ndmi",
    "VDG": "1 - ((ndvi + savi) / 2)",
    "ARI": "1 - ((ndvi + ndmi + ndwi + savi) / 4)",
    "CHS": "0.30 * ndvi + 0.25 * ndre + 0.20 * evi + 0.15 * ndmi + 0.10 * savi",
    "CPS": "(1 - ndvi) + (1 - ndmi)",
    "PRI": "0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi",
    "CGI": "0.40 * ndvi + 0.30 * evi + 0.20 * ndre + 0.10 * ndmi",
    "CMI": "0.50 * ndre + 0.30 * ndvi + 0.20 * evi",
    "HRI": "0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)",
    "VRI": "(ndvi + 1) / 2",
    "CCI": "0.40 * ndvi + 0.30 * ndre + 0.20 * evi + 0.10 * savi",
    "EPD": "0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi",
    "EHD": "0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)",
    "CHAS": "0.35 * ndvi + 0.2 * ndwi + 0.25 * ndmi + 0.2 * savi",
    # Current-index fusion for ADI (full z-score needs historical μ/σ)
    "ADI": "0.5 * ndvi + 0.3 * ndmi + 0.2 * ndre",
}

# Delta layer ids (Δ vs previous scene) — mirror AGRO_DELTA naming
DELTA_PAIRS: dict[str, str] = {
    "DCVHI": "CVHI",
    "DVHS": "VHS",
    "DVDI": "VDI",
    "DCVI": "CVI",
    "DCSI": "CSI",
    "DWST": "WST",
    "DDRI": "DRI",
    "DVMI": "VMI",
    "DSMI": "SMI",
    "DOIR": "OIR",
    "DIEI": "IEI",
    "DUII": "UII",
    "DFPR": "FPR",
    "DCPI": "CPI",
    "DGPI": "GPI",
    "DCSI2": "CSI2",
    "DCRI": "CRI",
    "DVDG": "VDG",
    "DARI": "ARI",
    "DCHS": "CHS",
    "DCPS": "CPS",
    "DPRI": "PRI",
    "DCGI": "CGI",
    "DCMI": "CMI",
    "DHRI": "HRI",
    "DVRI": "VRI",
    "DCCI": "CCI",
    "DEPD": "EPD",
    "DEHD": "EHD",
    "DCHAS": "CHAS",
    "DNDVI": "NDVI",
    "DNDMI": "NDMI",
    "DNDWI": "NDWI",
    "DSAVI": "SAVI",
    "DEVI": "EVI",
    "DNDRE": "NDRE",
    "DET": "ET",
    "DLST": "LST",
}

# Layers present in UI but not mean-raster from optical S2 in this tool
NON_OPTICAL_LAYER_IDS = ("PRECIP", "LULC", "CHAS_ALERT", "STRESS_ZONES")

# All attribute columns that store polygon-mean index values (Layer Select parity)
RS_MEAN_LAYER_IDS: tuple[str, ...] = (
    *CORE_INTERPRETATION,
    *SPECTRAL_EXTRA,
    *tuple(COMPOSITE_EXPRS.keys()),
    *tuple(DELTA_PAIRS.keys()),
    "NCADI",  # 0.7·ΔNDVI + 0.3·ΔNDMI
)


def all_rs_attribute_columns() -> list[str]:
    """Column names written on the enriched layer for every RS index mean."""
    return list(RS_MEAN_LAYER_IDS)
