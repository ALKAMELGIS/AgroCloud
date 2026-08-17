/**
 * Mapbox GL paint for Geo AI ↔ table linked selection.
 * Kept in sync visually with `.si-page` / `--si-geo-*` tokens in SatelliteIntelligence.css (violet slate, not orange).
 */
export const SI_GEO_AI_MAP_SELECTION_PAINT = {
  fillColor: '#6d28d9',
  fillOpacity: 0.1,
  lineColor: '#c4b5fd',
  lineWidth: 2,
  lineOpacity: 0.72,
  pointRadius: 8,
  pointColor: 'rgba(124, 58, 237, 0.38)',
  pointOpacity: 0.72,
  pointStrokeWidth: 1.5,
  pointStrokeColor: 'rgba(237, 233, 254, 0.55)',
} as const

/** Brighter outline for GIS attribute-table row ↔ map selection. */
export const SI_TABLE_MAP_SELECTION_PAINT = {
  fillColor: '#fbbf24',
  fillOpacity: 0.24,
  lineColor: '#ffffff',
  lineWidth: 3.5,
  lineOpacity: 0.95,
  pointRadius: 10,
  pointColor: 'rgba(251, 191, 36, 0.55)',
  pointOpacity: 0.9,
  pointStrokeWidth: 2.5,
  pointStrokeColor: '#ffffff',
} as const
