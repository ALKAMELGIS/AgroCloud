/**
 * Fields of the World — global pre-computed field boundaries (Source Cooperative).
 * Mirrors ftw-inference-app useSettings.ts + color-scales.ts.
 */

export type FtwGlobalYear = 2024 | 2025

export const FTW_GLOBAL_DEFAULT_YEAR: FtwGlobalYear = 2025
export const FTW_GLOBAL_DEFAULT_THRESHOLD_PCT = 70
export const FTW_GLOBAL_DEFAULT_OPACITY_PCT = 90
/** Fields appear from this zoom (official FTW Explorer). */
export const FTW_GLOBAL_FIELD_MIN_ZOOM = 11

/** Raw confidence ceiling used by FTW v3 global PMTiles (before UI % scaling). */
export const FTW_CONFIDENCE_MAX = 0.578178

export const FTW_GLOBAL_SOURCE_ID = 'ftw-global-pmtiles-source'
export const FTW_GLOBAL_FILL_ID = 'ftw-global-pmtiles-fill'
export const FTW_GLOBAL_LINE_ID = 'ftw-global-pmtiles-line'
/** Display-only union raster — hides PMTiles tile seam lines while tiles stay separate in the GeoJSON source. */
export const FTW_GLOBAL_SEAMLESS_SOURCE_ID = 'ftw-global-pmtiles-seamless-source'
export const FTW_GLOBAL_SEAMLESS_LAYER_ID = 'ftw-global-pmtiles-seamless-raster'

export type FtwGlobalLayerSettings = {
  visible: boolean
  year: FtwGlobalYear
  thresholdPct: number
  opacityPct: number
  /** When set, only field polygons intersecting this mask are drawn. */
  aoiMask?: GeoJSON.FeatureCollection | null
}

/** Convert UI threshold 0–100 to raw confidence_mean filter (official app). */
export function ftwThresholdToRaw(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct))
  return (clamped / 100) * FTW_CONFIDENCE_MAX
}

export function getFtwGlobalPmtilesUrl(year: FtwGlobalYear): string {
  if (year === 2025) {
    return 'https://data.source.coop/ftw/global-field-boundaries/pmtiles/ftw-global-fields-2025.pmtiles'
  }
  return 'https://data.source.coop/ftw/global-data/predictions/vectors/alpha/2024_with_confidence.pmtiles'
}

/** Vector tile layer name inside the PMTiles archive. */
export function getFtwGlobalSourceLayer(year: FtwGlobalYear): string {
  return year === 2025 ? 'fields' : '2024'
}

export function ftwGlobalAttribution(): string {
  return 'Fields of the World · Taylor Geospatial · CC-BY-4.0'
}
