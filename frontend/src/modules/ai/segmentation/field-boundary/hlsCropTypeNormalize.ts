/**
 * Normalize HLS / Prithvi crop class labels for Example.xlsx CROP_TYPE.
 * Input stack: T1–T3 × (B02, B03, B04, B8A, B11, B12) = 18 channels.
 */

const HLS_NON_CROP = new Set([
  'natural vegetation',
  'forest',
  'wetlands',
  'developed/barren',
  'open water',
  'fallow/idle cropland',
  'fallow',
  'idle cropland',
])

const HLS_CROP_MAP: Record<string, string> = {
  corn: 'Maize / Corn',
  soybeans: 'Soybeans',
  'winter wheat': 'Wheat',
  alfalfa: 'Alfalfa',
  cotton: 'Cotton',
  sorghum: 'Sorghum',
  wheat: 'Wheat',
  barley: 'Barley',
  maize: 'Maize / Corn',
}

export function normalizeHlsCropTypeName(name: string | null | undefined): string | null {
  if (!name) return null
  const raw = String(name).trim()
  const key = raw.toLowerCase()
  if (HLS_NON_CROP.has(key)) return null
  return HLS_CROP_MAP[key] ?? raw
}

export const HLS_INPUT_BANDS = ['B02', 'B03', 'B04', 'B8A', 'B11', 'B12'] as const
export const HLS_INPUT_CHANNELS = HLS_INPUT_BANDS.length * 3
