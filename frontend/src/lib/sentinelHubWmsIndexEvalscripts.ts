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

/** NDWI color anchors (wet white→blue; dry half uses discrete warm hues). */
export const SENTINEL_NDWI_RAMP_WHITE = 0xffffff
export const SENTINEL_NDWI_RAMP_GREEN = 0x008000
export const SENTINEL_NDWI_RAMP_BLUE = 0x0000cc

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

/** Nine upper bounds → 10 NDWI classes (5 dry / 5 wet). */
export const SENTINEL_NDWI_10_CLASS_BREAKS: readonly number[] = [
  -0.45, -0.28, -0.14, -0.05, 0, 0.004, 0.02, 0.08, 0.25,
]

/** Ramp intensity for Bare + wet class blends. */
export const SENTINEL_NDWI_10_CLASS_RAMP_T: readonly number[] = [1.0, 0.8, 0.6, 0.35, 0.08, 0.08, 0.3, 0.5, 0.75, 1.0]

/**
 * NDWI class colors: dry Very dry→Slightly dry = dark red → red → orange → yellow;
 * Bare + wet keep prior white→green / white→blue blends.
 */
export const SENTINEL_NDWI_10_CLASS_COLORS: readonly number[] = (() => {
  const blended = SENTINEL_NDWI_10_CLASS_RAMP_T.map((t, i) =>
    blendHexColor(
      SENTINEL_NDWI_RAMP_WHITE,
      i < 5 ? SENTINEL_NDWI_RAMP_GREEN : SENTINEL_NDWI_RAMP_BLUE,
      t,
    ),
  )
  return [
    0x7f0000, // Very dry — dark red
    0xd32f2f, // Dry — red
    0xfb8c00, // Moderate dry — orange
    0xffeb3b, // Slightly dry — yellow
    blended[4]!, // Bare transition
    blended[5]!,
    blended[6]!,
    blended[7]!,
    blended[8]!,
    blended[9]!,
  ]
})()

/** NDWI 10-class ramp stops for documentation (mid-class index values). */
export const SENTINEL_NDWI_RAMP: RampStop[] = [
  [-0.55, SENTINEL_NDWI_10_CLASS_COLORS[0]],
  [-0.36, SENTINEL_NDWI_10_CLASS_COLORS[1]],
  [-0.21, SENTINEL_NDWI_10_CLASS_COLORS[2]],
  [-0.095, SENTINEL_NDWI_10_CLASS_COLORS[3]],
  [-0.025, SENTINEL_NDWI_10_CLASS_COLORS[4]],
  [0.002, SENTINEL_NDWI_10_CLASS_COLORS[5]],
  [0.012, SENTINEL_NDWI_10_CLASS_COLORS[6]],
  [0.05, SENTINEL_NDWI_10_CLASS_COLORS[7]],
  [0.165, SENTINEL_NDWI_10_CLASS_COLORS[8]],
  [0.625, SENTINEL_NDWI_10_CLASS_COLORS[9]],
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

/** AWEI: dry land / built-up → open water (blue). */
export const SENTINEL_AWEI_RAMP: RampStop[] = [
  [-1, 0x3e2723],
  [-0.5, 0x795548],
  [-0.2, 0xbcaaa4],
  [0, 0xf5f5f5],
  [0.15, 0xb3e5fc],
  [0.35, 0x4fc3f7],
  [0.55, 0x039be5],
  [0.75, 0x0277bd],
  [1, 0x0d47a1],
]

/** MNDWI (Xu): built-up/soil → water bodies (deep blue). */
export const SENTINEL_MNDWI_RAMP: RampStop[] = [
  [-0.8, 0x3e2723],
  [-0.4, 0x795548],
  [-0.1, 0xbcaaa4],
  [0, 0xf5f5f5],
  [0.05, 0xb3e5fc],
  [0.15, 0x4fc3f7],
  [0.3, 0x039be5],
  [0.5, 0x0277bd],
  [0.7, 0x01579b],
  [1, 0x0d47a1],
]

/** NDMI moisture ramp: dry yellow → orange → red → dark red | moist light blue → dark blue. */
export const SENTINEL_NDMI_MOISTURE_RAMP: RampStop[] = [
  [-0.8, 0x7f0000],
  [-0.72, 0x7f0000], // Severe stress — dark red
  [-0.56, 0xd32f2f], // High stress — red
  [-0.4, 0xf4511e], // Moderate stress — deep orange
  [-0.24, 0xfb8c00], // Low stress — orange
  [-0.08, 0xffeb3b], // Dry canopy — yellow
  [0.08, 0x81d4fa], // Moist canopy — light blue
  [0.24, 0x42a5f5], // Good moisture
  [0.4, 0x1e88e5], // High moisture
  [0.56, 0x1565c0], // Very wet
  [0.72, 0x0d47a1], // Saturated — dark blue
  [0.8, 0x0d47a1],
]

/** Nine upper bounds → 10 NDMI classes across −0.8…0.8. */
export const SENTINEL_NDMI_10_CLASS_BREAKS: readonly number[] = [
  -0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64,
]

/** Class representative NDMI for ColorRampVisualizer.process(). */
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

export const SENTINEL_NDMI_10_CLASS_COLORS: readonly number[] = SENTINEL_NDMI_10_CLASS_VALUES.map(v =>
  sampleSentinelMoistureRampColor(v, SENTINEL_NDMI_MOISTURE_RAMP),
)

/** NDMI 10-class ramp stops for legends / docs. */
export const SENTINEL_NDMI_RAMP: RampStop[] = SENTINEL_NDMI_10_CLASS_VALUES.map((v, i) => [
  v,
  SENTINEL_NDMI_10_CLASS_COLORS[i]!,
])

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

/**
 * GEOMETRY already clips the WMS raster to each AOI.
 * Never use dataMask as output alpha — dataMask=0 on small/partial fields
 * would hide the entire polygon. Index threshold may still hide low values.
 */
function wmsGeometryClipAlphaBlock(indexVar: string, thr: number | null): string {
  if (thr == null) return 'return imgVals.concat(1);'
  return `var a = (isFinite(${indexVar}) && ${indexVar} >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`
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

/** NDWI: 10-class reclass with dual ColorRampVisualizer (dry green / wet blue). */
export function buildSentinelNdwiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock = wmsGeometryClipAlphaBlock('val', thr)

  return `//VERSION=3
// NDWI — 10 classes · dry dark-red→yellow · wet white→blue
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

const classRamp = [
   ${formatRampForEvalscript(
     SENTINEL_NDWI_10_CLASS_COLORS.map((hex, i) => [i, hex] as RampStop),
   )}
];
const viz = new ColorRampVisualizer(classRamp);

const BREAKS = [${formatNumberList(SENTINEL_NDWI_10_CLASS_BREAKS)}];

function ndwiClass(val) {
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
  let val = index(samples.B03, samples.B08);
  if (!isFinite(val)) val = 0;
  let cls = ndwiClass(val);
  let imgVals = viz.process(cls);
  ${alphaBlock}
}`
}

/** NDMI: 10-class reclass with moisture ColorRampVisualizer (B8A / B11). */
export function buildSentinelNdmiTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock = wmsGeometryClipAlphaBlock('val', thr)

  return `//VERSION=3
// NDMI — 10 classes, moisture ramp (B8A / B11)
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

const BREAKS = [${formatNumberList(SENTINEL_NDMI_10_CLASS_BREAKS)}];
const CLASS_VAL = [${formatNumberList(SENTINEL_NDMI_10_CLASS_VALUES)}];

function ndmiClass(val) {
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
  let val = index(samples.B8A, samples.B11);
  if (!isFinite(val)) val = 0;
  let cls = ndmiClass(val);
  let imgVals = viz.process(CLASS_VAL[cls]);
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

  const alphaBlock = wmsGeometryClipAlphaBlock('et', thr)

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
  if (!isFinite(et)) et = 0;
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

  const alphaBlock = wmsGeometryClipAlphaBlock('lst', thr)

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
  if (!isFinite(lst)) lst = 0;
  let cls = lstClass(lst);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${alphaBlock}
}`
}

/**
 * NDVI Live WMS — lightweight ColorRampVisualizer on B08/B04.
 *
 * Spatial clip is WMS GEOMETRY (not dataMask alpha). dataMask=0 on small/partial
 * AOIs must not hide the polygon. No SCL cloud holes.
 */
export function buildSentinelNdviTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const alphaBlock = wmsGeometryClipAlphaBlock('ndvi', thr)

  return `//VERSION=3
// NDVI — agricultural color ramp on B08/B04; GEOMETRY clips AOI (opaque alpha)
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
  if (!isFinite(ndvi)) ndvi = 0;
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
  if (profile === 'ndmi') {
    return buildSentinelNdmiTenClassEvalscript(indexVisibilityMin)
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

  const alphaBlock = wmsGeometryClipAlphaBlock(spec.indexVar, thr)

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
  if (!isFinite(${spec.indexVar})) ${spec.indexVar} = 0;
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
