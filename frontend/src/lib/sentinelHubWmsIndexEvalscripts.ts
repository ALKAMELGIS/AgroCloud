/**
 * Sentinel Hub Evalscript v3 — ColorRampVisualizer palettes for Live WMS index layers.
 * @see https://custom-scripts.sentinel-hub.com/
 */

export type SentinelIndexEvalProfile =
  | 'ndvi'
  | 'ndwi'
  | 'mndwi'
  | 'ndmi'
  | 'evi'
  | 'savi'
  | 'gndvi'
  | 'ndsi'
  | 'ndre'

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

/** NDWI dual-ramp anchors (Sentinel Hub custom script: dry white→green, wet white→blue). */
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

/** Ramp intensity per class (viz1 for val<0, viz2 for val≥0). */
export const SENTINEL_NDWI_10_CLASS_RAMP_T: readonly number[] = [1.0, 0.8, 0.6, 0.35, 0.08, 0.08, 0.3, 0.5, 0.75, 1.0]

/** Precomputed class colors for legends / UI. */
export const SENTINEL_NDWI_10_CLASS_COLORS: readonly number[] = SENTINEL_NDWI_10_CLASS_RAMP_T.map(
  (t, i) =>
    blendHexColor(
      SENTINEL_NDWI_RAMP_WHITE,
      i < 5 ? SENTINEL_NDWI_RAMP_GREEN : SENTINEL_NDWI_RAMP_BLUE,
      t,
    ),
)

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

/** NDMI moisture ramp (dry maroon → red → yellow → cyan → blue → navy). */
export const SENTINEL_NDMI_MOISTURE_RAMP: RampStop[] = [
  [-0.8, 0x800000],
  [-0.24, 0xff0000],
  [-0.032, 0xffff00],
  [0.032, 0x00ffff],
  [0.24, 0x0000ff],
  [0.8, 0x000080],
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

  const alphaBlock =
    thr == null
      ? 'return imgVals.concat(samples.dataMask);'
      : `var a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
  return imgVals.concat(a);`

  return `//VERSION=3
// NDWI — 10 classes, dry white→green / wet white→blue
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

const colorRamp1 = [
  [0, ${hexColorLiteral(SENTINEL_NDWI_RAMP_WHITE)}],
  [1, ${hexColorLiteral(SENTINEL_NDWI_RAMP_GREEN)}]
];
const colorRamp2 = [
  [0, ${hexColorLiteral(SENTINEL_NDWI_RAMP_WHITE)}],
  [1, ${hexColorLiteral(SENTINEL_NDWI_RAMP_BLUE)}]
];
const viz1 = new ColorRampVisualizer(colorRamp1);
const viz2 = new ColorRampVisualizer(colorRamp2);

const BREAKS = [${formatNumberList(SENTINEL_NDWI_10_CLASS_BREAKS)}];
const CLASS_T = [${formatNumberList(SENTINEL_NDWI_10_CLASS_RAMP_T)}];

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
  let cls = ndwiClass(val);
  let imgVals;
  if (val < 0) {
    imgVals = viz1.process(CLASS_T[cls]);
  } else {
    imgVals = viz2.process(CLASS_T[cls]);
  }
  ${alphaBlock}
}`
}

/** NDMI: 10-class reclass with moisture ColorRampVisualizer (B8A / B11). */
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
  let cls = ndmiClass(val);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${alphaBlock}
}`
}

function formatRgb01Triple(hex: number): string {
  const r = ((hex >>> 16) & 0xff) / 255
  const g = ((hex >>> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255
  return `[${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)}]`
}

function formatRampRgbStopsForEval(ramp: readonly RampStop[]): string {
  return ramp.map(([v, hex]) => `[${v}, ${formatRgb01Triple(hex)}]`).join(',\n  ')
}

/** NDVI: cloud-masked continuous ramp on B08/B04 — dataMask alpha (AOI GEOMETRY clip). */
export function buildSentinelNdviTenClassEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null

  const lowMapLiteral = formatRampRgbStopsForEval(SENTINEL_NDVI_LOW_COLORMAP)
  const growthRampLiteral = formatRampRgbStopsForEval(SENTINEL_NDVI_VEGETATION_GROWTH_RAMP)

  const vegetationReturn =
    thr == null
      ? 'return findColor(val).concat(samples.dataMask);'
      : `let a = samples.dataMask * (val >= ${thr} ? 1.0 : 0.0);
    return findColor(val).concat(a);`

  return `//VERSION=3
// NDVI — step ramp < 0.42, smooth growth greens ≥ 0.42, SCL cloud mask + B08/B04
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "B8A", "SCL", "dataMask"],
    output: { bands: 4 }
  };
}

const NDVI_LOW_MAP = [
  ${lowMapLiteral}
];
const NDVI_GROWTH_RAMP = [
  ${growthRampLiteral}
];

function blendRgb(c0, c1, t) {
  t = Math.max(0, Math.min(1, t));
  return [
    c0[0] + (c1[0] - c0[0]) * t,
    c0[1] + (c1[1] - c0[1]) * t,
    c0[2] + (c1[2] - c0[2]) * t
  ];
}

function findColor(val) {
  var low = NDVI_LOW_MAP;
  for (var i = 1; i < low.length; i++) {
    if (val <= low[i][0]) return low[i - 1][1];
  }
  if (val < 0.42) return low[low.length - 1][1];
  var ramp = NDVI_GROWTH_RAMP;
  if (val <= ramp[0][0]) return ramp[0][1];
  if (val >= ramp[ramp.length - 1][0]) return ramp[ramp.length - 1][1];
  for (var j = 0; j < ramp.length - 1; j++) {
    var v0 = ramp[j][0], c0 = ramp[j][1];
    var v1 = ramp[j + 1][0], c1 = ramp[j + 1][1];
    if (val >= v0 && val <= v1) {
      var span = v1 - v0;
      var t = span > 0 ? (val - v0) / span : 0;
      return blendRgb(c0, c1, t);
    }
  }
  return ramp[ramp.length - 1][1];
}

function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11;
  if (!samples.dataMask || cloud) return [0, 0, 0, 0];
  let val = index(samples.B08, samples.B04);
  if (!isFinite(val)) return [0, 0, 0, 0];
  ${vegetationReturn}
}`
}

/** Build Evalscript v3 with ColorRampVisualizer + dataMask alpha for WMS AOI clip. */
export function buildSentinelIndexColorRampEvalscript(
  profile: SentinelIndexEvalProfile,
  indexVisibilityMin: number | null = null,
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
