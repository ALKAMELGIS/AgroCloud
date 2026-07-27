/**
 * Bright cyan flash paint for Time Series Field Name → map AOI identify.
 * Distinct from violet GIS/table selection (`SI_GEO_AI_MAP_SELECTION_PAINT`).
 */
export const SI_IMAGERY_FIELD_FLASH_PAINT = {
  fillColor: '#22d3ee',
  fillOpacityOn: 0.42,
  fillOpacityOff: 0.06,
  lineColor: '#f0fdfa',
  lineWidth: 3.5,
  lineOpacityOn: 1,
  lineOpacityOff: 0.25,
} as const

export const SI_IMAGERY_FIELD_FLASH_PULSES = 4
export const SI_IMAGERY_FIELD_FLASH_HALF_MS = 220
