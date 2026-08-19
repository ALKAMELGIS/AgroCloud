import {
  buildEtWmsIndexSetup,
  etClassCenterValues,
  etSeasonFactor,
  ET_WMS_INDEX_SETUP,
  SENTINEL_ET_10_CLASS_BREAKS,
  SENTINEL_ET_10_CLASS_VALUES,
  SENTINEL_ET_RAMP,
} from './etIndex'
import {
  buildLstWmsIndexSetup,
  lstClassCenterValues,
  SENTINEL_LST_10_CLASS_BREAKS,
  SENTINEL_LST_10_CLASS_VALUES,
  SENTINEL_LST_RAMP,
  LST_WMS_INDEX_SETUP,
} from './lstIndex'

/**
 * Sentinel Hub Evalscript v3 — ColorRampVisualizer palettes for Live WMS index layers.
 * @see https://custom-scripts.sentinel-hub.com/
 */

export type SentinelIndexEvalProfile =
  | 'ndvi'
  | 'ndwi'
  | 'mndwi'
  | 'ndmi'
  | 'ndii'
  | 'awei'
  | 'nbr'
  | 'evi'
  | 'savi'
  | 'gndvi'
  | 'ndsi'
  | 'ndre'
  | 'et'
  | 'lst'

type RampStop = [number, number]

/**
 * NDVI stress / vigor below Good growth (0.42) — step ramp unchanged.
 */
export const SENTINEL_NDVI_LOW_COLORMAP: RampStop[] = [
  [-1.0, 0x000000],
  [-0.2, 0xa50026],
  [0.0, 0xd73027],
  [0.1, 0xf46d43],
  [0.2, 0xfdae61],
  [0.3, 0xfee08b],
  [0.4, 0xffffbf],
]

/**
 * Smooth light → dark forest green for Good / Strong / Harvest growth (NDVI ≥ 0.42).
 * Good growth 0.42–0.52 · Strong growth 0.52–0.62 · Harvest ready ≥ 0.62
 */
export const SENTINEL_NDVI_VEGETATION_GROWTH_RAMP: RampStop[] = [
  [0.42, 0x9ccc65],
  [0.47, 0x7cb342],
  [0.52, 0x43a047],
  [0.57, 0x388e3c],
  [0.62, 0x2e7d32],
  [0.72, 0x1b5e20],
  [0.85, 0x0f2e1a],
  [1.0, 0x052e16],
]

/** Full NDVI ramp (low step + growth gradient) for legend gradient bar. */
export const SENTINEL_NDVI_COLORMAP: RampStop[] = [
  ...SENTINEL_NDVI_LOW_COLORMAP,
  ...SENTINEL_NDVI_VEGETATION_GROWTH_RAMP.filter(([v]) => v > 0.4),
]

function sampleSentinelNdviLowColorMap(ndvi: number): number {
  const pairs = SENTINEL_NDVI_LOW_COLORMAP
  if (!pairs.length) return 0
  for (let i = 1; i < pairs.length; i++) {
    if (ndvi <= pairs[i]![0]) return pairs[i - 1]![1]
  }
  return pairs[pairs.length - 1]![1]
}

/** Matches findColor() in the NDVI WMS evalscript — step below 0.42, smooth gradient above. */
export function sampleSentinelNdviColorMap(ndvi: number): number {
  if (ndvi < 0.42) return sampleSentinelNdviLowColorMap(ndvi)
  return sampleSentinelMoistureRampColor(ndvi, SENTINEL_NDVI_VEGETATION_GROWTH_RAMP)
}

/** NDVI Live WMS ramp — legend gradient (low stress + growth greens). */
export const SENTINEL_NDVI_AGRICULTURAL_RAMP: RampStop[] = [
  ...SENTINEL_NDVI_LOW_COLORMAP,
  ...SENTINEL_NDVI_VEGETATION_GROWTH_RAMP,
]

/** Nine upper bounds → 10 NDVI classes (agricultural ramp). */
export const SENTINEL_NDVI_10_CLASS_BREAKS: readonly number[] = [
  -0.08, 0.02, 0.1, 0.18, 0.26, 0.34, 0.42, 0.52, 0.62,
]

/** Class representative NDVI for ColorRampVisualizer.process(). */
export const SENTINEL_NDVI_10_CLASS_VALUES: readonly number[] = [
  -0.14, -0.03, 0.06, 0.14, 0.22, 0.3, 0.38, 0.47, 0.57, 0.72,
]

export const SENTINEL_NDVI_10_CLASS_COLORS: readonly number[] = SENTINEL_NDVI_10_CLASS_VALUES.map(v =>
  sampleSentinelNdviColorMap(v),
)

/** NDVI 10-class ramp stops for legends / WMS metadata. */
export const SENTINEL_NDVI_RAMP: RampStop[] = SENTINEL_NDVI_10_CLASS_VALUES.map((v, i) => [
  v,
  SENTINEL_NDVI_10_CLASS_COLORS[i]!,
])

function blendHexColor(from: number, to: number, t: number): number {
  const clamp = Math.max(0, Math.min(1, t))
  const fr = (from >> 16) & 0xff
  const fg = (from >> 8) & 0xff
  const fb = from & 0xff
  const tr = (to >> 16) & 0xff
  const tg = (to >> 8) & 0xff
  const tb = to & 0xff
  const r = Math.round(fr + (tr - fr) * clamp)
  const g = Math.round(fg + (tg - fg) * clamp)
  const b = Math.round(fb + (tb - fb) * clamp)
  return ((r << 16) | (g << 8) | b) >>> 0
}

/** NDWI continuous ramp: dry vegetation (green) → neutral (white) → open water (blue). */
export const SENTINEL_NDWI_RAMP: RampStop[] = [
  [-0.8, 0x008000],
  [0, 0xffffff],
  [0.8, 0x0000cc],
]

/** Equal-width AOI class-area bins over the NDWI display range. */
export const SENTINEL_NDWI_AREA_CLASS_BREAKS: readonly number[] = [
  -0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64,
]

/** NDWI legend / area colors: dry green → white → water blue gradient. */
export const SENTINEL_NDWI_10_CLASS_COLORS: readonly number[] = [
  0x006400, // Extremely dry / non-water
  0x008000, // Very dry / non-water
  0x66bb6a, // Dry surface
  0xc8e6c9, // Bare / low moisture
  0xffffff, // Moist surface
  0xb3e5fc, // Slightly wet
  0x4fc3f7, // Wet surface
  0x039be5, // High water probability
  0x0277bd, // Open water
  0x000080, // Deep / permanent water
]

/** NDWI 10-class ramp stops for legends / GeoTIFF export (mid-class index values). */
export const SENTINEL_NDWI_LEGEND_RAMP: RampStop[] = [
  [-0.72, SENTINEL_NDWI_10_CLASS_COLORS[0]],
  [-0.56, SENTINEL_NDWI_10_CLASS_COLORS[1]],
  [-0.4, SENTINEL_NDWI_10_CLASS_COLORS[2]],
  [-0.24, SENTINEL_NDWI_10_CLASS_COLORS[3]],
  [-0.08, SENTINEL_NDWI_10_CLASS_COLORS[4]],
  [0.08, SENTINEL_NDWI_10_CLASS_COLORS[5]],
  [0.24, SENTINEL_NDWI_10_CLASS_COLORS[6]],
  [0.4, SENTINEL_NDWI_10_CLASS_COLORS[7]],
  [0.56, SENTINEL_NDWI_10_CLASS_COLORS[8]],
  [0.72, SENTINEL_NDWI_10_CLASS_COLORS[9]],
]

/** NBR burn severity: unburned green → moderate → severe burn (red). */
export const SENTINEL_NBR_RAMP: RampStop[] = [
  [-0.5, 0x7f0000],
  [-0.1, 0xd32f2f],
  [0.1, 0xf4511e],
  [0.25, 0xffeb3b],
  [0.4, 0xaed581],
  [0.55, 0x66bb6a],
  [0.7, 0x388e3c],
  [0.85, 0x2e7d32],
  [1, 0x1b5e20],
]

/** Equal-width AOI / legend class bins over the NBR display range (−0.5 … 1.0). */
export const SENTINEL_NBR_10_CLASS_BREAKS: readonly number[] = [
  -0.35, -0.2, -0.05, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85,
]

function sampleSentinelNbrRampColor(nbr: number): number {
  if (nbr <= SENTINEL_NBR_RAMP[0]![0]) return SENTINEL_NBR_RAMP[0]![1]
  if (nbr >= SENTINEL_NBR_RAMP[SENTINEL_NBR_RAMP.length - 1]![0]) {
    return SENTINEL_NBR_RAMP[SENTINEL_NBR_RAMP.length - 1]![1]
  }
  for (let i = 0; i < SENTINEL_NBR_RAMP.length - 1; i++) {
    const [v0, c0] = SENTINEL_NBR_RAMP[i]!
    const [v1, c1] = SENTINEL_NBR_RAMP[i + 1]!
    if (nbr >= v0 && nbr <= v1) {
      const span = v1 - v0
      const t = span > 0 ? (nbr - v0) / span : 0
      return blendHexColor(c0, c1, t)
    }
  }
  return SENTINEL_NBR_RAMP[SENTINEL_NBR_RAMP.length - 1]![1]
}

/** NBR 10-class colors sampled from the burn-severity ramp at class midpoints. */
export const SENTINEL_NBR_10_CLASS_COLORS: readonly number[] = [
  sampleSentinelNbrRampColor(-0.425),
  sampleSentinelNbrRampColor(-0.275),
  sampleSentinelNbrRampColor(-0.125),
  sampleSentinelNbrRampColor(0.025),
  sampleSentinelNbrRampColor(0.175),
  sampleSentinelNbrRampColor(0.325),
  sampleSentinelNbrRampColor(0.475),
  sampleSentinelNbrRampColor(0.625),
  sampleSentinelNbrRampColor(0.775),
  sampleSentinelNbrRampColor(0.925),
]

/** NBR 10-class ramp stops for legends (mid-class index values). */
export const SENTINEL_NBR_LEGEND_RAMP: RampStop[] = [
  [-0.425, SENTINEL_NBR_10_CLASS_COLORS[0]!],
  [-0.275, SENTINEL_NBR_10_CLASS_COLORS[1]!],
  [-0.125, SENTINEL_NBR_10_CLASS_COLORS[2]!],
  [0.025, SENTINEL_NBR_10_CLASS_COLORS[3]!],
  [0.175, SENTINEL_NBR_10_CLASS_COLORS[4]!],
  [0.325, SENTINEL_NBR_10_CLASS_COLORS[5]!],
  [0.475, SENTINEL_NBR_10_CLASS_COLORS[6]!],
  [0.625, SENTINEL_NBR_10_CLASS_COLORS[7]!],
  [0.775, SENTINEL_NBR_10_CLASS_COLORS[8]!],
  [0.925, SENTINEL_NBR_10_CLASS_COLORS[9]!],
]

/** AWEI / flood-water 10-class upper bounds (class 0 = val < breaks[0], … class 9 = val ≥ breaks[8]). */
export const SENTINEL_AWEI_10_CLASS_BREAKS: readonly number[] = [
  -2.0, -1.0, -0.5, 0.0, 0.2, 0.5, 1.0, 2.0, 4.0,
]

/** AWEI 10-class colors: tan/brown (dry) → flood-water blue gradient (wet). */
export const SENTINEL_AWEI_10_CLASS_COLORS: readonly number[] = [
  0xe8dcc8, // Non-water — light tan
  0xd4c4a8, // Dry land — soft brown
  0xc4a882, // Bare surface — tan
  0xb8956a, // Non-water — warm brown
  0xb3e5fc, // Possible water — light flood blue
  0x4fc3f7, // Water
  0x29b6f6, // Wet water
  0x0288d1, // Open water
  0x1565c0, // Deep water
  0x053061, // Very strong water
]

/** Dark water blue for newly detected flood water (change detection overlay). */
export const SENTINEL_AWEI_NEW_FLOOD_WATER_COLOR = 0x053061

/** AWEI 10-class ramp stops for legends / GeoTIFF export (mid-class index values). */
export const SENTINEL_AWEI_RAMP: RampStop[] = [
  [-2.5, SENTINEL_AWEI_10_CLASS_COLORS[0]],
  [-1.5, SENTINEL_AWEI_10_CLASS_COLORS[1]],
  [-0.75, SENTINEL_AWEI_10_CLASS_COLORS[2]],
  [-0.25, SENTINEL_AWEI_10_CLASS_COLORS[3]],
  [0.1, SENTINEL_AWEI_10_CLASS_COLORS[4]],
  [0.35, SENTINEL_AWEI_10_CLASS_COLORS[5]],
  [0.75, SENTINEL_AWEI_10_CLASS_COLORS[6]],
  [1.5, SENTINEL_AWEI_10_CLASS_COLORS[7]],
  [3.0, SENTINEL_AWEI_10_CLASS_COLORS[8]],
  [5.0, SENTINEL_AWEI_10_CLASS_COLORS[9]],
]

/** MNDWI 10-class upper bounds (class 0 = val < breaks[0], … class 9 = val ≥ breaks[8]). */
export const SENTINEL_MNDWI_10_CLASS_BREAKS: readonly number[] = [
  -0.6, -0.45, -0.3, -0.15, 0, 0.1, 0.2, 0.35, 0.5,
]

/** MNDWI 10-class colors: light tan → medium brown (dry) → water blue (wet). */
export const SENTINEL_MNDWI_10_CLASS_COLORS: readonly number[] = [
  0xe8dcc8, // Very dry — light tan
  0xd4c4a8, // Dry land — soft brown
  0xc4a882, // Bare surface — tan
  0xb8956a, // Non-water — warm brown
  0xa0522d, // Possible water — medium brown (sienna)
  0xa6dba0, // Water
  0x41b6c4, // Wet water
  0x2c7bb6, // Open water
  0x2166ac, // Deep water
  0x053061, // Very strong water
]

/** MNDWI 10-class ramp stops for legends / GeoTIFF export (mid-class index values). */
export const SENTINEL_MNDWI_RAMP: RampStop[] = [
  [-0.675, SENTINEL_MNDWI_10_CLASS_COLORS[0]],
  [-0.525, SENTINEL_MNDWI_10_CLASS_COLORS[1]],
  [-0.375, SENTINEL_MNDWI_10_CLASS_COLORS[2]],
  [-0.225, SENTINEL_MNDWI_10_CLASS_COLORS[3]],
  [-0.075, SENTINEL_MNDWI_10_CLASS_COLORS[4]],
  [0.05, SENTINEL_MNDWI_10_CLASS_COLORS[5]],
  [0.15, SENTINEL_MNDWI_10_CLASS_COLORS[6]],
  [0.275, SENTINEL_MNDWI_10_CLASS_COLORS[7]],
  [0.425, SENTINEL_MNDWI_10_CLASS_COLORS[8]],
  [0.65, SENTINEL_MNDWI_10_CLASS_COLORS[9]],
]

/** NDMI continuous moisture ramp: dark red (dry) → yellow → cyan → dark blue (wet). */
export const SENTINEL_NDMI_MOISTURE_RAMP: RampStop[] = [
  [-0.8, 0x800000],
  [-0.24, 0xff0000],
  [-0.032, 0xffff00],
  [0.032, 0x00ffff],
  [0.24, 0x0000ff],
  [0.8, 0x000080],
]

/** Equal-width AOI class-area bins over the NDMI display range. */
export const SENTINEL_NDMI_10_CLASS_BREAKS: readonly number[] = [
  -0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64,
]

/** Class representative NDMI values for legend / area sampling. */
export const SENTINEL_NDMI_10_CLASS_VALUES: readonly number[] = [
  -0.72, -0.56, -0.4, -0.24, -0.08, 0.08, 0.24, 0.4, 0.56, 0.72,
]

function sampleSentinelMoistureRampColor(ndmi: number, ramp: readonly RampStop[]): number {
  if (!ramp.length) return 0
  if (ndmi <= ramp[0]![0]) return ramp[0]![1]
  if (ndmi >= ramp[ramp.length - 1]![0]) return ramp[ramp.length - 1]![1]
  for (let i = 0; i < ramp.length - 1; i++) {
    const [v0, c0] = ramp[i]!
    const [v1, c1] = ramp[i + 1]!
    if (ndmi >= v0 && ndmi <= v1) {
      const span = v1 - v0
      const t = span > 0 ? (ndmi - v0) / span : 0
      return blendHexColor(c0, c1, t)
    }
  }
  return ramp[ramp.length - 1]![1]
}

/** NDMI legend colors: red → yellow (dry stress) → cyan → blue (moist). */
export const SENTINEL_NDMI_10_CLASS_COLORS: readonly number[] = [
  0x800000, // Severe moisture stress
  0xff0000, // High stress
  0xff6600, // Moderate stress
  0xffff00, // Low stress
  0xffff99, // Dry canopy transition
  0xb3e5fc, // Moist canopy — light evaporation blue
  0x4fc3f7, // Moist vegetation
  0x29b6f6, // Moist surface
  0x0288d1, // Moister canopy
  0x000080, // Saturated moist
]

/** NDMI 10-class ramp stops for legends (mid-class index values). */
export const SENTINEL_NDMI_LEGEND_RAMP: RampStop[] = [
  [-0.72, SENTINEL_NDMI_10_CLASS_COLORS[0]],
  [-0.56, SENTINEL_NDMI_10_CLASS_COLORS[1]],
  [-0.4, SENTINEL_NDMI_10_CLASS_COLORS[2]],
  [-0.24, SENTINEL_NDMI_10_CLASS_COLORS[3]],
  [-0.08, SENTINEL_NDMI_10_CLASS_COLORS[4]],
  [0.08, SENTINEL_NDMI_10_CLASS_COLORS[5]],
  [0.24, SENTINEL_NDMI_10_CLASS_COLORS[6]],
  [0.4, SENTINEL_NDMI_10_CLASS_COLORS[7]],
  [0.56, SENTINEL_NDMI_10_CLASS_COLORS[8]],
  [0.72, SENTINEL_NDMI_10_CLASS_COLORS[9]],
]

/** NDMI ramp stops for WMS metadata. */
export const SENTINEL_NDMI_RAMP: RampStop[] = SENTINEL_NDMI_MOISTURE_RAMP

/** NDII uses the same moisture-stress ramp as NDMI (broad NIR B08 vs SWIR B11). */
export const SENTINEL_NDII_RAMP: RampStop[] = SENTINEL_NDMI_MOISTURE_RAMP

/** EVI: sparse → dense vegetation (green ramp, wider dynamic range). */
export const SENTINEL_EVI_RAMP: RampStop[] = [
  [-0.2, 0x1a1a1a],
  [0, 0xd7ccc8],
  [0.1, 0xfff59d],
  [0.2, 0xdce775],
  [0.3, 0xaed581],
  [0.4, 0x7cb342],
  [0.5, 0x558b2f],
  [0.65, 0x33691e],
  [0.8, 0x1b5e20],
  [1, 0x004d00],
]

/** SAVI (L=0.5): similar semantics to NDVI for sparse canopy. */
export const SENTINEL_SAVI_RAMP: RampStop[] = [
  [-0.5, 0x212121],
  [-0.2, 0xbdbdbd],
  [0, 0xf5f5dc],
  [0.1, 0xe6ee9c],
  [0.2, 0xcddc39],
  [0.3, 0xaed581],
  [0.4, 0x66bb6a],
  [0.5, 0x43a047],
  [0.6, 0x2e7d32],
  [0.75, 0x1b5e20],
  [1, 0x004400],
]

/** GNDVI: green band vegetation stress / vigor. */
export const SENTINEL_GNDVI_RAMP: RampStop[] = [
  [-0.2, 0x37474f],
  [0, 0xefebe9],
  [0.1, 0xdcedc8],
  [0.2, 0xa5d6a7],
  [0.35, 0x66bb6a],
  [0.5, 0x388e3c],
  [0.65, 0x2e7d32],
  [0.8, 0x1b5e20],
  [1, 0x004400],
]

/** NDSI: snow / ice (dark → white). */
export const SENTINEL_NDSI_RAMP: RampStop[] = [
  [-1, 0x1b1b1b],
  [-0.2, 0x616161],
  [0, 0x9e9e9e],
  [0.1, 0xbdbdbd],
  [0.25, 0xe0e0e0],
  [0.4, 0xf5f5f5],
  [0.6, 0xffffff],
  [1, 0xffffff],
]

/** NDRE: red-edge chlorophyll / nitrogen proxy. */
export const SENTINEL_NDRE_RAMP: RampStop[] = [
  [-0.2, 0x3e2723],
  [0, 0xffccbc],
  [0.1, 0xffab91],
  [0.2, 0xa5d6a7],
  [0.35, 0x66bb6a],
  [0.5, 0x388e3c],
  [0.65, 0x2e7d32],
  [0.8, 0x1b5e20],
  [1, 0x004400],
]

type IndexEvalSpec = {
  inputs: string[]
  indexVar: string
  indexExpr: string
  ramp: RampStop[]
}

const INDEX_EVAL_SPECS: Record<SentinelIndexEvalProfile, IndexEvalSpec> = {
  ndvi: {
    inputs: ['B04', 'B08', 'dataMask'],
    indexVar: 'ndvi',
    indexExpr: 'let ndvi = index(samples.B08, samples.B04);',
    ramp: SENTINEL_NDVI_RAMP,
  },
  ndwi: {
    inputs: ['B03', 'B08', 'dataMask'],
    indexVar: 'ndwi',
    indexExpr: 'let ndwi = index(samples.B03, samples.B08);',
    ramp: SENTINEL_NDWI_RAMP,
  },
  mndwi: {
    inputs: ['B03', 'B11', 'dataMask'],
    indexVar: 'mndwi',
    indexExpr: 'let mndwi = index(samples.B03, samples.B11);',
    ramp: SENTINEL_MNDWI_RAMP,
  },
  awei: {
    inputs: ['B03', 'B08', 'B11', 'B12', 'dataMask'],
    indexVar: 'awei',
    indexExpr:
      'let awei = 4.0 * (samples.B03 - samples.B11) - (0.25 * samples.B08 + 2.75 * samples.B12);',
    ramp: SENTINEL_AWEI_RAMP,
  },
  nbr: {
    inputs: ['B08', 'B12', 'dataMask'],
    indexVar: 'nbr',
    indexExpr: 'let nbr = index(samples.B08, samples.B12);',
    ramp: SENTINEL_NBR_RAMP,
  },
  ndmi: {
    inputs: ['B8A', 'B11', 'dataMask'],
    indexVar: 'ndmi',
    indexExpr: 'let ndmi = index(samples.B8A, samples.B11);',
    ramp: SENTINEL_NDMI_RAMP,
  },
  ndii: {
    inputs: ['B08', 'B11', 'dataMask'],
    indexVar: 'ndii',
    indexExpr: 'let ndii = index(samples.B08, samples.B11);',
    ramp: SENTINEL_NDII_RAMP,
  },
  evi: {
    inputs: ['B02', 'B04', 'B08', 'dataMask'],
    indexVar: 'evi',
    indexExpr:
      'let evi = 2.5 * ((samples.B08 - samples.B04) / (samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0));',
    ramp: SENTINEL_EVI_RAMP,
  },
  savi: {
    inputs: ['B04', 'B08', 'dataMask'],
    indexVar: 'savi',
    indexExpr: 'let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);',
    ramp: SENTINEL_SAVI_RAMP,
  },
  gndvi: {
    inputs: ['B03', 'B08', 'dataMask'],
    indexVar: 'gndvi',
    indexExpr: 'let gndvi = index(samples.B08, samples.B03);',
    ramp: SENTINEL_GNDVI_RAMP,
  },
  ndsi: {
    inputs: ['B03', 'B11', 'dataMask'],
    indexVar: 'ndsi',
    indexExpr: 'let ndsi = index(samples.B03, samples.B11);',
    ramp: SENTINEL_NDSI_RAMP,
  },
  ndre: {
    inputs: ['B05', 'B08', 'dataMask'],
    indexVar: 'ndre',
    indexExpr: 'let ndre = index(samples.B08, samples.B05);',
    ramp: SENTINEL_NDRE_RAMP,
  },
  et: {
    inputs: ['B03', 'B04', 'B08', 'B11', 'dataMask'],
    indexVar: 'et',
    indexExpr: ET_WMS_INDEX_SETUP,
    ramp: SENTINEL_ET_RAMP,
  },
  lst: {
    inputs: ['B04', 'B08', 'B11', 'dataMask'],
    indexVar: 'lst',
    indexExpr: LST_WMS_INDEX_SETUP,
    ramp: SENTINEL_LST_RAMP,
  },
}

function hexColorLiteral(hex: number): string {
  return `0x${(hex >>> 0).toString(16).padStart(6, '0')}`
}

function formatRampForEvalscript(ramp: RampStop[]): string {
  return ramp.map(([v, hex]) => `[${v}, ${hexColorLiteral(hex)}]`).join(',\n   ')
}

function formatNumberList(values: readonly number[]): string {
  return values.map(v => String(v)).join(', ')
}

/** NDWI: continuous green → white → blue ColorRampVisualizer on B03/B08. */
export function buildSentinelNdwiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// NDWI — green (dry) → white (neutral) → blue (water)
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

const ramp = [
   ${formatRampForEvalscript(SENTINEL_NDWI_RAMP)}
];

const visualizer = new ColorRampVisualizer(ramp);

function evaluatePixel(samples) {
  let val = index(samples.B03, samples.B08);
  let imgVals = visualizer.process(val);
  ${alphaBlock}
}`
}

/** AWEI: 10-class flood / water extraction reclass on B03/B08/B11/B12. */
export function buildSentinelAweiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// AWEI — 10 classes · non-water warm → open / deep water blue
function setup() {
  return {
    input: ["B03", "B08", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

const classRamp = [
   ${formatRampForEvalscript(
     SENTINEL_AWEI_10_CLASS_COLORS.map((hex, i) => [i, hex] as RampStop),
   )}
];
const viz = new ColorRampVisualizer(classRamp);

const BREAKS = [${formatNumberList(SENTINEL_AWEI_10_CLASS_BREAKS)}];

function aweiClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  let val = 4.0 * (samples.B03 - samples.B11) - (0.25 * samples.B08 + 2.75 * samples.B12);
  let cls = aweiClass(val);
  let imgVals = viz.process(cls);
  ${alphaBlock}
}`
}

/** MNDWI: 10-class water reclass — light dry gradient → water blue (B03/B11). */
export function buildSentinelMndwiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// MNDWI — 10 classes · light dry gradient → open / deep water blue
function setup() {
  return {
    input: ["B03", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const classRamp = [
   ${formatRampForEvalscript(
     SENTINEL_MNDWI_10_CLASS_COLORS.map((hex, i) => [i, hex] as RampStop),
   )}
];
const viz = new ColorRampVisualizer(classRamp);

const BREAKS = [${formatNumberList(SENTINEL_MNDWI_10_CLASS_BREAKS)}];

function mndwiClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  let val = index(samples.B03, samples.B11);
  let cls = mndwiClass(val);
  let imgVals = viz.process(cls);
  ${alphaBlock}
}`
}

/** NDII: continuous moisture ColorRampVisualizer on B08/B11 (broad NIR − SWIR). */
export function buildSentinelNdiiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// NDII — continuous moisture ramp (B08 / B11)
function setup() {
  return {
    input: ["B08", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${formatRampForEvalscript(SENTINEL_NDII_RAMP)}
];

const viz = new ColorRampVisualizer(moistureRamps);

function evaluatePixel(samples) {
  let val = index(samples.B08, samples.B11);
  let imgVals = viz.process(val);
  ${alphaBlock}
}`
}

/** NDMI: continuous moisture ColorRampVisualizer on B8A/B11. */
export function buildSentinelNdmiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// NDMI — continuous moisture ramp (B8A / B11)
function setup() {
  return {
    input: ["B8A", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${formatRampForEvalscript(SENTINEL_NDMI_MOISTURE_RAMP)}
];

const viz = new ColorRampVisualizer(moistureRamps);

function evaluatePixel(samples) {
  let val = index(samples.B8A, samples.B11);
  let imgVals = viz.process(val);
  ${alphaBlock}
}`
}

/** ET — seasonal/Kc moisture-proxy ET (mm/day); absolute or AOI percentile 10-class breaks. */
export function buildSentinelEtTenClassEvalscript(
  indexVisibilityMin: number | null = null,
  options?: {
    sceneDate?: string | null
    /** Ascending interior breaks (length 9) or full edges (length 11). */
    classBreaks?: readonly number[] | null
    classCenters?: readonly number[] | null
  },
): string {
  const season = etSeasonFactor(options?.sceneDate)
  const setupEt = buildEtWmsIndexSetup(season)

  let breaks = SENTINEL_ET_10_CLASS_BREAKS
  let centers = SENTINEL_ET_10_CLASS_VALUES
  const raw = options?.classBreaks
  if (raw && raw.length >= 9) {
    const interior =
      raw.length === 11
        ? raw.slice(1, -1)
        : raw.length === 9
          ? raw
          : raw.slice(1, 10)
    if (interior.length === 9) {
      breaks = interior as typeof SENTINEL_ET_10_CLASS_BREAKS
      const edges =
        raw.length === 11
          ? raw
          : [0, ...interior, Math.max(10, interior[interior.length - 1]! + 1)]
      centers = (options?.classCenters?.length === 10
        ? options.classCenters
        : etClassCenterValues(edges)) as typeof SENTINEL_ET_10_CLASS_VALUES
    }
  }

  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(0, Math.min(15, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (et >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  const coloredRamp: RampStop[] = centers.map((v, i) => [
    v,
    SENTINEL_ET_RAMP[Math.min(i, SENTINEL_ET_RAMP.length - 1)]![1],
  ])

  return `//VERSION=3
// ET — seasonal × Kc × moisture demand (mm/day), 10 classes
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const etRamp = [
   ${formatRampForEvalscript(coloredRamp)}
];

const viz = new ColorRampVisualizer(etRamp);

const BREAKS = [${formatNumberList(breaks)}];
const CLASS_VAL = [${formatNumberList(centers)}];

function etClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${setupEt}
  let cls = etClass(et);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${alphaBlock}
}`
}

/** LST — seasonal NDVI/NDMI land-surface temperature proxy (°C); 10-class thermal ramp. */
export function buildSentinelLstTenClassEvalscript(
  indexVisibilityMin: number | null = null,
  options?: {
    sceneDate?: string | null
    classBreaks?: readonly number[] | null
    classCenters?: readonly number[] | null
  },
): string {
  const season = etSeasonFactor(options?.sceneDate)
  const setupLst = buildLstWmsIndexSetup(season)

  let breaks = SENTINEL_LST_10_CLASS_BREAKS
  let centers = SENTINEL_LST_10_CLASS_VALUES
  const raw = options?.classBreaks
  if (raw && raw.length >= 9) {
    const interior =
      raw.length === 11
        ? raw.slice(1, -1)
        : raw.length === 9
          ? raw
          : raw.slice(1, 10)
    if (interior.length === 9) {
      breaks = interior as typeof SENTINEL_LST_10_CLASS_BREAKS
      const edges =
        raw.length === 11
          ? raw
          : [5, ...interior, Math.max(55, interior[interior.length - 1]! + 1)]
      centers = (options?.classCenters?.length === 10
        ? options.classCenters
        : lstClassCenterValues(edges)) as typeof SENTINEL_LST_10_CLASS_VALUES
    }
  }

  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(5, Math.min(55, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (lst >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  const coloredRamp: RampStop[] = centers.map((v, i) => [
    v,
    SENTINEL_LST_RAMP[Math.min(i, SENTINEL_LST_RAMP.length - 1)]![1],
  ])

  return `//VERSION=3
// LST — seasonal NDVI/NDMI land-surface temperature proxy (°C), 10 classes
function setup() {
  return {
    input: ["B04", "B08", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const lstRamp = [
   ${formatRampForEvalscript(coloredRamp)}
];

const viz = new ColorRampVisualizer(lstRamp);

const BREAKS = [${formatNumberList(breaks)}];
const CLASS_VAL = [${formatNumberList(centers)}];

function lstClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${setupLst}
  let cls = lstClass(lst);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${alphaBlock}
}`
}

/**
 * NDVI Live WMS — lightweight ColorRampVisualizer on B08/B04 with dataMask alpha.
 *
 * Intentionally minimal so the visible raster appears FAST and fills the whole AOI
 * (no SCL cloud masking → no transparent holes, only 3 input bands, a short
 * evalscript that keeps the WMS GEOMETRY-clip URL well under the length budget).
 * Per-class pixel-area analysis runs separately, after the layer is shown.
 */
export function buildSentinelNdviTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (ndvi >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// NDVI — agricultural color ramp on B08/B04, dataMask alpha (fast AOI clip)
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

const ramp = [
   ${formatRampForEvalscript(SENTINEL_NDVI_AGRICULTURAL_RAMP)}
];

const visualizer = new ColorRampVisualizer(ramp);

function evaluatePixel(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let imgVals = visualizer.process(ndvi);
  ${alphaBlock}
}`
}

/** Build Evalscript v3 with ColorRampVisualizer + dataMask alpha for WMS AOI clip. */
export function buildSentinelIndexColorRampEvalscript(
  profile: SentinelIndexEvalProfile,
  indexVisibilityMin: number | null = null,
  options?: { sceneDate?: string | null },
): string {
  if (profile === 'ndvi') {
    return buildSentinelNdviTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'ndwi') {
    return buildSentinelNdwiTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'awei') {
    return buildSentinelAweiTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'mndwi') {
    return buildSentinelMndwiTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'ndmi') {
    return buildSentinelNdmiTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'ndii') {
    return buildSentinelNdiiTenClassEvalscript(indexVisibilityMin)
  }
  if (profile === 'et') {
    return buildSentinelEtTenClassEvalscript(indexVisibilityMin, {
      sceneDate: options?.sceneDate,
    })
  }
  if (profile === 'lst') {
    return buildSentinelLstTenClassEvalscript(indexVisibilityMin, {
      sceneDate: options?.sceneDate,
    })
  }

  const spec = INDEX_EVAL_SPECS[profile]
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (${spec.indexVar} >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
function setup() {
  return {
    input: ${JSON.stringify(spec.inputs)},
    output: { bands: 4 }
  };
}

const ramp = [
   ${formatRampForEvalscript(spec.ramp)}
];

const visualizer = new ColorRampVisualizer(ramp);

function evaluatePixel(samples) {
  ${spec.indexExpr}
  let imgVals = visualizer.process(${spec.indexVar});
  ${alphaBlock}
}`
}

export function isSentinelIndexColorRampProfile(
  profile: string,
): profile is SentinelIndexEvalProfile {
  return profile in INDEX_EVAL_SPECS
}

export {
  SENTINEL_ET_10_CLASS_BREAKS,
  SENTINEL_ET_10_CLASS_COLORS,
  SENTINEL_ET_10_CLASS_LABELS,
  SENTINEL_ET_10_CLASS_VALUES,
  SENTINEL_ET_RAMP,
} from './etIndex'

export {
  SENTINEL_LST_10_CLASS_BREAKS,
  SENTINEL_LST_10_CLASS_COLORS,
  SENTINEL_LST_10_CLASS_LABELS,
  SENTINEL_LST_10_CLASS_VALUES,
  SENTINEL_LST_RAMP,
} from './lstIndex'
