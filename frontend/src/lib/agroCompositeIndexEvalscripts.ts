/**
 * Evalscript v3 builders for AgroCloud composite indices (core + delta).
 * Each layer uses a layer-specific 10-class ramp (see agroCompositeLayerRamps.ts).
 */

import { resolveAgroCompositeExpr, resolveAgroCompositeIndexDef, isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'
import { CHAS_ALERT_RGB_01 } from './chasAlertMapping'
import { buildStressZonesWmsEvalscript } from './siStressZonesEvalscript'
import { ADI_CURRENT_INDEX_EXPR, isAdiLayerId } from './adiIndex'
import { NCADI_EXPR, isNcadiLayerId } from './ncadiIndex'
import { isWapiLayerId, WAPI_ET_STRESS_EXPR, WAPI_WDSI_EXPR } from './wapiIndex'

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

import { MANGROVE_CORE_INDEX_LINES } from './mangroveIndices'

export const CORE_INDICES_BLOCK = `let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndre = index(samples.B08, samples.B05);
  let eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  let evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  let ndsi = index(samples.B11, samples.B08);
  let si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  let ssi = ndsi + si;
  let ioi = samples.B02 > 1e-6 ? samples.B04 / samples.B02 : NaN;
  let clay_mi = samples.B12 > 1e-6 ? samples.B11 / samples.B12 : NaN;
  let fmi = samples.B08 > 1e-6 ? samples.B11 / samples.B08 : NaN;
  let ndai = index(samples.B11, samples.B12);
  let bsiDen = samples.B11 + samples.B04 + samples.B08 + samples.B02;
  let bsi = bsiDen > 1e-6 ? ((samples.B11 + samples.B04) - (samples.B08 + samples.B02)) / bsiDen : NaN;
  let reai = samples.B05 > 1e-6 ? samples.B06 / samples.B05 : NaN;
  let gei = 0.35 * ioi + 0.30 * clay_mi + 0.20 * fmi + 0.15 * bsi;
  let gci = 0.30 * ioi + 0.25 * clay_mi + 0.20 * fmi + 0.15 * ndai + 0.10 * bsi;
  let ioin = Math.max(0, Math.min(1, (ioi - 0.5) / 2.0));
  let cmin = Math.max(0, Math.min(1, (clay_mi - 0.7) / 0.8));
  let fmin = Math.max(0, Math.min(1, (fmi - 0.4) / 1.6));
  let ndain = Math.max(0, Math.min(1, (ndai + 0.3) / 0.8));
  let bsin = Math.max(0, Math.min(1, (bsi + 0.5) / 1.0));
  let egci = 0.30 * ioin + 0.25 * cmin + 0.20 * fmin + 0.15 * ndain + 0.10 * bsin;
  ${MANGROVE_CORE_INDEX_LINES}`

const CORE_AT_FN = `function coreAt(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndre = index(samples.B08, samples.B05);
  let eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  let evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  let ndsi = index(samples.B11, samples.B08);
  let si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  let ssi = ndsi + si;
  let ioi = samples.B02 > 1e-6 ? samples.B04 / samples.B02 : NaN;
  let clay_mi = samples.B12 > 1e-6 ? samples.B11 / samples.B12 : NaN;
  let fmi = samples.B08 > 1e-6 ? samples.B11 / samples.B08 : NaN;
  let ndai = index(samples.B11, samples.B12);
  let bsiDen = samples.B11 + samples.B04 + samples.B08 + samples.B02;
  let bsi = bsiDen > 1e-6 ? ((samples.B11 + samples.B04) - (samples.B08 + samples.B02)) / bsiDen : NaN;
  let reai = samples.B05 > 1e-6 ? samples.B06 / samples.B05 : NaN;
  let gei = 0.35 * ioi + 0.30 * clay_mi + 0.20 * fmi + 0.15 * bsi;
  let gci = 0.30 * ioi + 0.25 * clay_mi + 0.20 * fmi + 0.15 * ndai + 0.10 * bsi;
  let ioin = Math.max(0, Math.min(1, (ioi - 0.5) / 2.0));
  let cmin = Math.max(0, Math.min(1, (clay_mi - 0.7) / 0.8));
  let fmin = Math.max(0, Math.min(1, (fmi - 0.4) / 1.6));
  let ndain = Math.max(0, Math.min(1, (ndai + 0.3) / 0.8));
  let bsin = Math.max(0, Math.min(1, (bsi + 0.5) / 1.0));
  let egci = 0.30 * ioin + 0.25 * cmin + 0.20 * fmin + 0.15 * ndain + 0.10 * bsin;
  ${MANGROVE_CORE_INDEX_LINES}
  return {
    ndvi: ndvi, savi: savi, ndmi: ndmi, ndwi: ndwi, ndre: ndre, evi: evi, ci_re: ci_re,
    ndsi: ndsi, si: si, ssi: ssi,
    ioi: ioi, clay_mi: clay_mi, fmi: fmi, ndai: ndai, bsi: bsi, reai: reai, gei: gei, gci: gci, egci: egci,
    mvi: mvi, remi: remi, mi: mi, mfi: mfi,
    ndre_b5: ndre_b5, ndre_b6: ndre_b6, ndre_b7: ndre_b7,
    cire: cire, gci_chl: gci_chl, mtci: mtci, reip: reip
  };
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
  if (!isFinite(val)) return -1;
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

/** CHAS Alert — classifies fusion index then maps 10 classes → 4 alert colors (derived only). */
export function buildChasAlertEvalscript(indexVisibilityMin: number | null = null): string | null {
  const chasRamp = resolveAgroCompositeTenClassRamp('CHAS')
  if (!chasRamp) return null
  const expr = resolveAgroCompositeExpr('CHAS')
  if (!expr) return null
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(chasRamp)
  const alertRgb = formatRgbList(CHAS_ALERT_RGB_01)

  const mapAlertFn = `function mapClassToAlert(cls) {
  if (cls <= 1) return 0;
  if (cls <= 3) return 1;
  if (cls <= 5) return 2;
  return 3;
}`

  const alertRgbConst = `const ALERT_RGB = [
   ${alertRgb}
];`

  return `//VERSION=3
// CHAS Alert — derived 4-level overlay from CHAS 10-class raster logic
function setup() {
  return {
    input: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

${rgbConst}

${alertRgbConst}

${classifyFn}

${mapAlertFn}

function evaluatePixel(samples) {
  ${CORE_INDICES_BLOCK}
  let val = ${expr};
  let cls = classifyVal(val);
  let alertIdx = mapClassToAlert(cls);
  let c = ALERT_RGB[alertIdx];
  ${alphaBlock('val', indexVisibilityMin)}
}`
}

const SLIM_VEG_MOISTURE_BLOCK = `let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);`

/** ISS / WDSI / CPI only need NDVI+NDMI+NDWI+SAVI — skip the full agro core (keeps WMS URLs paintable). */
function usesSlimVegMoistureCore(expr: string): boolean {
  const e = String(expr || '')
  if (!/\bndvi\b/.test(e) && !/\bsavi\b/.test(e) && !/\bndmi\b/.test(e) && !/\bndwi\b/.test(e)) {
    return false
  }
  return !/\b(ndre|evi|ci_re|ndsi|ioi|clay_mi|fmi|ndai|bsi|reai|gei|gci|egci|mvi|remi|\bmi\b|mfi|ndre_b|cire|mtci|reip|wdsi|etstress)\b/.test(
    e,
  )
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
  const slim = usesSlimVegMoistureCore(expr)
  const inputBands = slim
    ? '["B03", "B04", "B08", "B11", "dataMask"]'
    : '["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"]'
  const indicesBlock = slim ? SLIM_VEG_MOISTURE_BLOCK : CORE_INDICES_BLOCK

  return `//VERSION=3
// AgroCloud composite — 10-class layer-specific ramp
function setup() {
  return {
    input: ${inputBands},
    output: { bands: 4 }
  };
}

${rgbConst}

${classifyFn}

function evaluatePixel(samples) {
  ${indicesBlock}
  let ${indexVar} = ${expr};
  if (!isFinite(${indexVar})) {
    return [0, 0, 0, 0];
  }
  let cls = classifyVal(${indexVar});
  if (cls < 0) {
    return [0, 0, 0, 0];
  }
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
      bands: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"]
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
  let ndre = c.ndre;
  let evi = c.evi;
  let ci_re = c.ci_re;
  let ndsi = c.ndsi;
  let si = c.si;
  let ssi = c.ssi;
  let ioi = c.ioi;
  let clay_mi = c.clay_mi;
  let fmi = c.fmi;
  let ndai = c.ndai;
  let bsi = c.bsi;
  let reai = c.reai;
  let gei = c.gei;
  let gci = c.gci;
  let egci = c.egci;
  let mvi = c.mvi;
  let remi = c.remi;
  let mi = c.mi;
  let mfi = c.mfi;
  let ndre_b5 = c.ndre_b5;
  let ndre_b6 = c.ndre_b6;
  let ndre_b7 = c.ndre_b7;
  let cire = c.cire;
  let gci_chl = c.gci_chl;
  let mtci = c.mtci;
  let reip = c.reip;
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
  if (!isFinite(${indexVar})) {
    return [0, 0, 0, 0];
  }
  var cls = classifyVal(${indexVar});
  if (cls < 0) {
    return [0, 0, 0, 0];
  }
  var c = CLASS_RGB[cls];
  ${alphaBlock(indexVar, indexVisibilityMin, 'mask')}
}`
}

/** ADI — multi-orbit z-score anomaly vs historical mean/std of Current_Index. */
export function buildAgroCompositeAdiEvalscript(indexVisibilityMin: number | null = null): string | null {
  const ramp = resolveAgroCompositeTenClassRamp('ADI')
  if (!ramp) return null
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(ramp)
  const indexVar = 'adi'

  return `//VERSION=3
// AgroCloud ADI — Anomaly Detection Index (Current − μ_hist) / σ_hist
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${CORE_AT_FN}

${rgbConst}

${classifyFn}

function currentIndex(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndre = c.ndre;
  return ${ADI_CURRENT_INDEX_EXPR};
}

function evaluatePixel(samples) {
  if (!samples || !samples.length) {
    return [0, 0, 0, 0];
  }
  var curSample = samples[samples.length - 1];
  if (!curSample || !curSample.dataMask) {
    return [0, 0, 0, 0];
  }
  var current = currentIndex(coreAt(curSample));
  var n = 0;
  var sum = 0;
  var sumSq = 0;
  for (var i = 0; i < samples.length - 1; i++) {
    var s = samples[i];
    if (!s || !s.dataMask) continue;
    var v = currentIndex(coreAt(s));
    if (!isFinite(v)) continue;
    sum += v;
    sumSq += v * v;
    n++;
  }
  var ${indexVar} = 0;
  if (n >= 2) {
    var mean = sum / n;
    var variance = Math.max(0, sumSq / n - mean * mean);
    var std = Math.sqrt(variance);
    if (std < 1e-6) std = 1e-6;
    ${indexVar} = (current - mean) / std;
  } else if (n === 1) {
    var mean1 = sum;
    ${indexVar} = (current - mean1) / 1e-6;
  } else {
    ${indexVar} = 0;
  }
  if (!isFinite(${indexVar})) ${indexVar} = 0;
  var cls = classifyVal(${indexVar});
  var c = CLASS_RGB[cls];
  ${alphaBlock(indexVar, indexVisibilityMin, 'curSample.dataMask')}
}`
}

/** NCADI — two-orbit cultivation/abandonment change: 0.7·ΔNDVI + 0.3·ΔNDMI. */
export function buildAgroCompositeNcadiEvalscript(indexVisibilityMin: number | null = null): string | null {
  const ramp = resolveAgroCompositeTenClassRamp('NCADI')
  if (!ramp) return null
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(ramp)
  const indexVar = 'ncadi'

  return `//VERSION=3
// AgroCloud NCADI — Newly Cultivated / Abandoned Detection Index (0.7·ΔNDVI + 0.3·ΔNDMI)
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
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

function evaluatePixel(samples) {
  if (!samples || samples.length < 2) {
    var s = samples && samples.length ? samples[samples.length - 1] : null;
    var mask = s ? s.dataMask : 0;
    var cStable = CLASS_RGB[4];
    return cStable.concat(mask);
  }
  var c1 = coreAt(samples[0]);
  var c2 = coreAt(samples[samples.length - 1]);
  var dNdvi = c2.ndvi - c1.ndvi;
  var dNdmi = c2.ndmi - c1.ndmi;
  var ${indexVar} = ${NCADI_EXPR};
  if (!isFinite(${indexVar})) ${indexVar} = 0;
  var mask = samples[samples.length - 1].dataMask * samples[0].dataMask;
  var cls = classifyVal(${indexVar});
  var c = CLASS_RGB[cls];
  ${alphaBlock(indexVar, indexVisibilityMin, 'mask')}
}`
}

/** WAPI — hybrid ORBIT index with ΔWDSI between newest and oldest scene. */
export function buildAgroCompositeWapiEvalscript(indexVisibilityMin: number | null = null): string | null {
  const ramp = resolveAgroCompositeTenClassRamp('WAPI')
  if (!ramp) return null
  const { classifyFn, rgbConst } = buildTenClassEvalscriptBlock(ramp)
  const indexVar = 'wapi'

  return `//VERSION=3
// AgroCloud WAPI — 0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"]
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

function wdsiOf(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  let savi = c.savi;
  return ${WAPI_WDSI_EXPR};
}

function etStressOf(c) {
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  return ${WAPI_ET_STRESS_EXPR};
}

function evaluatePixel(samples) {
  if (!samples || !samples.length) {
    return [0, 0, 0, 0];
  }
  var cur = samples[samples.length - 1];
  if (!cur || !cur.dataMask) {
    return [0, 0, 0, 0];
  }
  var c2 = coreAt(cur);
  var wdsi2 = wdsiOf(c2);
  var dWdsi = 0;
  var mask = cur.dataMask;
  if (samples.length >= 2) {
    var c1 = coreAt(samples[0]);
    dWdsi = wdsi2 - wdsiOf(c1);
    mask = cur.dataMask * samples[0].dataMask;
  }
  var ${indexVar} = 0.40 * wdsi2 + 0.20 * dWdsi + 0.20 * (1 - c2.ndmi) + 0.10 * etStressOf(c2) + 0.10;
  if (!isFinite(${indexVar})) ${indexVar} = 0;
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
  if (u === 'CHAS_ALERT') {
    return buildChasAlertEvalscript(indexVisibilityMin)
  }
  if (u === 'STRESS_ZONES') {
    return buildStressZonesWmsEvalscript(indexVisibilityMin)
  }
  if (isAdiLayerId(u)) {
    return buildAgroCompositeAdiEvalscript(indexVisibilityMin)
  }
  if (isNcadiLayerId(u)) {
    return buildAgroCompositeNcadiEvalscript(indexVisibilityMin)
  }
  if (isWapiLayerId(u)) {
    return buildAgroCompositeWapiEvalscript(indexVisibilityMin)
  }
  if (isAgroDeltaCompositeLayerId(u)) {
    return buildAgroCompositeDeltaEvalscript(u, indexVisibilityMin)
  }
  return buildAgroCompositeEvalscript(u, indexVisibilityMin)
}
