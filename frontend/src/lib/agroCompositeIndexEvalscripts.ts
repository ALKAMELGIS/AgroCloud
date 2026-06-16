/**
 * Evalscript v3 builders for AgroCloud composite indices (core + delta).
 * Each layer uses a layer-specific 10-class ramp (see agroCompositeLayerRamps.ts).
 */

import { resolveAgroCompositeExpr, resolveAgroCompositeIndexDef, isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'

type RampStop = [number, number]

/** @deprecated Use resolveAgroCompositeTenClassRamp gradientStops for legends. */
export const AGRO_COMPOSITE_SCORE_RAMP: RampStop[] = [
  [-0.2, 0xd73027],
  [0, 0xfdae61],
  [0.15, 0xfee08b],
  [0.33, 0xfee08b],
  [0.5, 0x1a9850],
  [0.66, 0x1a9850],
  [0.8, 0x1a9850],
  [1, 0x1a9850],
]

/** @deprecated Use resolveAgroCompositeTenClassRamp for delta legends. */
export const AGRO_COMPOSITE_DELTA_RAMP: RampStop[] = [
  [-0.4, 0xd73027],
  [-0.15, 0xfdae61],
  [-0.05, 0xfee08b],
  [0, 0xfee08b],
  [0.05, 0x80cdc1],
  [0.15, 0x1a9850],
  [0.4, 0x1a9850],
]

function formatNumberList(values: readonly number[]): string {
  return values.map(v => String(v)).join(', ')
}

function formatRgbList(rgb: readonly [number, number, number][]): string {
  return rgb
    .map(([r, g, b]) => `[${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)}]`)
    .join(',\n   ')
}

const CORE_INDICES_BLOCK = `let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;`

const CORE_AT_FN = `function coreAt(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  return { ndvi: ndvi, savi: savi, ndmi: ndmi, ndwi: ndwi, ci_re: ci_re };
}`

function alphaBlock(indexVar: string, indexVisibilityMin: number | null, maskVar = 'samples.dataMask'): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null
  if (thr == null) {
    return `return c.concat(${maskVar});`
  }
  return `var a = ${maskVar} * (${indexVar} >= ${thr} ? 1.0 : 0.0);
  return c.concat(a);`
}

function buildTenClassEvalscriptBlock(ramp: NonNullable<ReturnType<typeof resolveAgroCompositeTenClassRamp>>): {
  classifyFn: string
  rgbConst: string
} {
  const classifyFn = `function classifyVal(val) {
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
}`

  const rgbConst = `const BREAKS = [${formatNumberList(ramp.breaks)}];
const CLASS_RGB = [
   ${formatRgbList(ramp.classRgb01)}
];`

  return { classifyFn, rgbConst }
}

/** Static composite index evalscript (single scene, 10-class). */
export function buildAgroCompositeEvalscript(
  layerId: string,
  indexVisibilityMin: number | null = null,
): string | null {
  const expr = resolveAgroCompositeExpr(layerId)
  if (!expr) return null
  const ramp = resolveAgroCompositeTenClassRamp(layerId)
  if (!ramp) return null
  const indexVar = 'val'
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(ramp)

  return `//VERSION=3
// AgroCloud composite — 10-class layer-specific ramp
function setup() {
  return {
    input: ["B03", "B04", "B05", "B08", "B8A", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

${rgbConst}

${classifyFn}

function evaluatePixel(samples) {
  ${CORE_INDICES_BLOCK}
  let ${indexVar} = ${expr};
  let cls = classifyVal(${indexVar});
  let c = CLASS_RGB[cls];
  ${alphaBlock(indexVar, indexVisibilityMin)}
}`
}

/** Delta composite — compares newest vs oldest orbit in TIME window (ORBIT mosaicking). */
export function buildAgroCompositeDeltaEvalscript(
  layerId: string,
  indexVisibilityMin: number | null = null,
): string | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (!isAgroDeltaCompositeLayerId(u)) return null
  const def = resolveAgroCompositeIndexDef(u)
  if (!def) return null
  const expr = def.expr
  const ramp = resolveAgroCompositeTenClassRamp(layerId)
  if (!ramp) return null
  const indexVar = 'delta'
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(ramp)

  return `//VERSION=3
// AgroCloud composite delta — ORBIT samples[] (scene₂ − scene₁)
function setup() {
  return {
    input: [{
      bands: ["B03", "B04", "B05", "B08", "B8A", "B11", "dataMask"]
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${CORE_AT_FN}

${rgbConst}

${classifyFn}

function preProcessScenes(collections) {
  var orbits = collections.scenes.orbits;
  if (!orbits || orbits.length <= 2) return collections;
  collections.scenes.orbits = [orbits[0], orbits[orbits.length - 1]];
  return collections;
}

function compositeValue(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  let savi = c.savi;
  let ci_re = c.ci_re;
  return ${expr};
}

function evaluatePixel(samples) {
  if (!samples || samples.length < 2) {
    var s = samples && samples.length ? samples[samples.length - 1] : null;
    var mask = s ? s.dataMask : 0;
    var c = CLASS_RGB[4];
    return c.concat(mask);
  }
  var c1 = coreAt(samples[0]);
  var c2 = coreAt(samples[samples.length - 1]);
  var ${indexVar} = compositeValue(c2) - compositeValue(c1);
  var mask = samples[samples.length - 1].dataMask * samples[0].dataMask;
  var cls = classifyVal(${indexVar});
  var c = CLASS_RGB[cls];
  ${alphaBlock(indexVar, indexVisibilityMin, 'mask')}
}`
}

export function buildAgroCompositeLayerEvalscript(
  layerId: string,
  indexVisibilityMin: number | null = null,
): string | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (isAgroDeltaCompositeLayerId(u)) {
    return buildAgroCompositeDeltaEvalscript(u, indexVisibilityMin)
  }
  return buildAgroCompositeEvalscript(u, indexVisibilityMin)
}
