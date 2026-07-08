import { STRESS_ZONES_CHAS_EXPR } from './siStressZonesEngine'
import { STRESS_ZONE_RGB_01 } from './siStressZonesMapping'

function formatStressRgbList(): string {
  return STRESS_ZONE_RGB_01.map(([r, g, b]) => `[${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)}]`).join(',\n   ')
}

/** WMS raster — 5-class stress zones (bare, healthy, mild, moderate, severe). */
export function buildStressZonesWmsEvalscript(indexVisibilityMin: number | null = null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(-1, Math.min(1, indexVisibilityMin))
      : null
  const alphaBlock =
    thr == null
      ? 'return c.concat(samples.dataMask);'
      : `var a = samples.dataMask * (ndvi >= ${thr} ? 1.0 : 0.0);
  return c.concat(a);`

  return `//VERSION=3
// AgroCloud Stress Zones — CHAS fusion + stress score classification
function setup() {
  return {
    input: ["B03", "B04", "B05", "B08", "B8A", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const ZONE_RGB = [
   ${formatStressRgbList()}
];

function classifyStress(ndvi, stress) {
  if (!isFinite(ndvi) || ndvi < 0.15) return 0;
  if (!isFinite(stress) || stress >= 0.6) return 4;
  if (stress >= 0.4) return 3;
  if (stress >= 0.2) return 2;
  return 1;
}

function evaluatePixel(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let chas = ${STRESS_ZONES_CHAS_EXPR};
  let stress = 1.0 - chas;
  let cls = classifyStress(ndvi, stress);
  let c = ZONE_RGB[cls];
  ${alphaBlock}
}`
}

/** Statistical API — categorical class index 0–4 for histogram area stats. */
export function buildStressZonesHistogramEvalscript(relaxed = false): string {
  const cloudExpr = relaxed ? 'false' : '(scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11)'
  return `//VERSION=3
// AGRO_CLASS_HISTOGRAM {"mode":"stress-zones","classes":5}
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "idx", bands: ["idx"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = ${cloudExpr};
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let chas = ${STRESS_ZONES_CHAS_EXPR};
  let stress = 1.0 - chas;
  var cls = 1;
  if (!isFinite(ndvi) || ndvi < 0.15) cls = 0;
  else if (!isFinite(stress) || stress >= 0.6) cls = 4;
  else if (stress >= 0.4) cls = 3;
  else if (stress >= 0.2) cls = 2;
  var valid = samples.dataMask && !cloud;
  return { idx: [cls], dataMask: [valid ? 1 : 0] };
}`
}
