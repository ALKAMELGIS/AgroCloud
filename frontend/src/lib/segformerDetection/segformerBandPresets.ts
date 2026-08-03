/**
 * SegFormer band configuration presets.
 *
 * Pretrained ADE20K SegFormer ingests 3-band RGB. Mode / band choices are kept
 * for the UI and future EO weights; {@link resolveSegFormerRgbComposite} always
 * returns an RGB mapping for the current model.
 */

export type SegFormerBandId = 'B02' | 'B03' | 'B04' | 'B05' | 'B08' | 'B11' | 'B12'

export type SegFormerBandMode = 'rgb' | 'multispectral' | 'custom'

export type SegFormerBandDef = {
  id: SegFormerBandId
  name: string
  /** Short UI label (e.g. "Blue"). */
  label: string
  /** Approximate center wavelength in nm (Sentinel-2). */
  wavelengthNm: number
}

/** RGB channel → Sentinel-2 band mapping. */
export type SegFormerRgbMapping = {
  r: SegFormerBandId
  g: SegFormerBandId
  b: SegFormerBandId
}

export type SegFormerBandConfig = {
  mode: SegFormerBandMode
  /** Custom R/G/B mapping when mode is `custom` (ignored otherwise). */
  customRgb: SegFormerRgbMapping
  /**
   * Optional multi-band selection for uploaded rasters (informational today).
   * When empty, Multispectral mode implies the full Sentinel-2 list.
   */
  multispectralBands: SegFormerBandId[]
}

/** Sentinel-2 bands exposed in the SegFormer workspace band selector. */
export const SEGFORMER_S2_BANDS: readonly SegFormerBandDef[] = [
  { id: 'B02', name: 'B02 Blue', label: 'Blue', wavelengthNm: 490 },
  { id: 'B03', name: 'B03 Green', label: 'Green', wavelengthNm: 560 },
  { id: 'B04', name: 'B04 Red', label: 'Red', wavelengthNm: 665 },
  { id: 'B05', name: 'B05 Red Edge', label: 'Red Edge', wavelengthNm: 705 },
  { id: 'B08', name: 'B08 NIR', label: 'NIR', wavelengthNm: 842 },
  { id: 'B11', name: 'B11 SWIR1', label: 'SWIR1', wavelengthNm: 1610 },
  { id: 'B12', name: 'B12 SWIR2', label: 'SWIR2', wavelengthNm: 2190 },
] as const

export const SEGFORMER_S2_BAND_IDS: readonly SegFormerBandId[] = SEGFORMER_S2_BANDS.map(
  (b) => b.id,
)

/** Default True Color composite: Red / Green / Blue (B04 / B03 / B02). */
export const SEGFORMER_TRUE_COLOR_RGB: SegFormerRgbMapping = {
  r: 'B04',
  g: 'B03',
  b: 'B02',
}

/** Common false-color vegetation composite (NIR / Red / Green). */
export const SEGFORMER_FALSE_COLOR_VEG_RGB: SegFormerRgbMapping = {
  r: 'B08',
  g: 'B04',
  b: 'B03',
}

export const SEGFORMER_BAND_MODE_OPTIONS: readonly {
  id: SegFormerBandMode
  label: string
  description: string
}[] = [
  {
    id: 'rgb',
    label: 'RGB',
    description: 'True Color composite (B04 / B03 / B02) for ADE20K SegFormer.',
  },
  {
    id: 'multispectral',
    label: 'Multispectral',
    description:
      'Informational multi-band selection for uploaded rasters; inference still uses an RGB composite.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Map any three Sentinel-2 bands to R / G / B for preview and future EO weights.',
  },
] as const

/** Alias used by the workspace panel band-mode picker. */
export const SEGFORMER_BAND_MODES = SEGFORMER_BAND_MODE_OPTIONS

export const SEGFORMER_DEFAULT_BAND_CONFIG: SegFormerBandConfig = {
  mode: 'rgb',
  customRgb: { ...SEGFORMER_TRUE_COLOR_RGB },
  multispectralBands: [...SEGFORMER_S2_BAND_IDS],
}

export function getSegFormerBand(id: SegFormerBandId): SegFormerBandDef | undefined {
  return SEGFORMER_S2_BANDS.find((b) => b.id === id)
}

export function isSegFormerBandId(value: string): value is SegFormerBandId {
  return (SEGFORMER_S2_BAND_IDS as readonly string[]).includes(value)
}

function clampBandId(id: string | null | undefined, fallback: SegFormerBandId): SegFormerBandId {
  return id && isSegFormerBandId(id) ? id : fallback
}

/** Normalize a partial / dirty RGB mapping onto valid Sentinel-2 band IDs. */
export function normalizeSegFormerRgbMapping(
  mapping: Partial<SegFormerRgbMapping> | null | undefined,
  fallback: SegFormerRgbMapping = SEGFORMER_TRUE_COLOR_RGB,
): SegFormerRgbMapping {
  return {
    r: clampBandId(mapping?.r, fallback.r),
    g: clampBandId(mapping?.g, fallback.g),
    b: clampBandId(mapping?.b, fallback.b),
  }
}

/**
 * Resolve the RGB composite used for inference / preview baking.
 *
 * - `rgb` → True Color (B04/B03/B02)
 * - `multispectral` → True Color today (ADE20K is 3-band); band list kept for UI
 * - `custom` → user R/G/B mapping
 */
export function resolveSegFormerRgbComposite(
  config: Pick<SegFormerBandConfig, 'mode' | 'customRgb'> | null | undefined,
): SegFormerRgbMapping {
  const mode = config?.mode ?? 'rgb'
  if (mode === 'custom') {
    return normalizeSegFormerRgbMapping(config?.customRgb)
  }
  // Multispectral + RGB both feed the pretrained 3-band model as True Color.
  return { ...SEGFORMER_TRUE_COLOR_RGB }
}

/** Stable key for caching / equality (e.g. `B04-B03-B02`). */
export function segFormerRgbMappingKey(mapping: SegFormerRgbMapping): string {
  return `${mapping.r}-${mapping.g}-${mapping.b}`
}

export function isTrueColorRgbMapping(mapping: SegFormerRgbMapping): boolean {
  return (
    mapping.r === SEGFORMER_TRUE_COLOR_RGB.r &&
    mapping.g === SEGFORMER_TRUE_COLOR_RGB.g &&
    mapping.b === SEGFORMER_TRUE_COLOR_RGB.b
  )
}
