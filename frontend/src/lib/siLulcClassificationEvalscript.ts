/**
 * Multi-temporal LULC evalscript (Sentinel Hub WMS + Statistical API histogram).
 * Maps Sentinel-2 reflectance to AgroCloud Live Analysis classes
 * (IO/Esri-compatible schema).
 */

import {
  LULC_CLASSES,
  LULC_MAP_CLASSES,
  lulcClassRgb01,
} from './siLulcClassification'

function rgbForKey(key: string): [number, number, number] {
  const cls = LULC_CLASSES.find(c => c.key === key)
  return lulcClassRgb01(cls?.color ?? '#000000')
}

const LULC_RGB = {
  water: rgbForKey('water'),
  trees: rgbForKey('trees'),
  flooded: rgbForKey('flooded'),
  crops: rgbForKey('crops'),
  built: rgbForKey('built'),
  bare: rgbForKey('bare'),
  snow: rgbForKey('snow'),
  clouds: rgbForKey('clouds'),
  rangeland: rgbForKey('rangeland'),
} as const

/** Contiguous histogram class order (excludes No Data). */
export const LULC_HISTOGRAM_CLASS_KEYS = LULC_MAP_CLASSES.map(c => c.key)

/** Bin edges for Statistical API: one bin per map class (0…N). */
export const LULC_HISTOGRAM_BIN_EDGES = Array.from(
  { length: LULC_MAP_CLASSES.length + 1 },
  (_, i) => i,
)

/** Shared temporal helpers + classify → contiguous class index 0…N-1. */
function lulcTemporalHelpersAndClassifyJs(): string {
  return `
function ndvi(s) {
  return (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
}
function ndwi(s) {
  return (s.B03 - s.B08) / (s.B03 + s.B08 + 1e-6);
}
function ndsi(s) {
  return (s.B03 - s.B11) / (s.B03 + s.B11 + 1e-6);
}
function brightness(s) {
  return (s.B02 + s.B03 + s.B04) / 3;
}

function temporalStats(samples) {
  var n = 0;
  var ndviSum = 0;
  var ndviMin = 1;
  var ndviMax = -1;
  var ndwiSum = 0;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask) continue;
    var v = ndvi(s);
    var w = ndwi(s);
    ndviSum += v;
    ndwiSum += w;
    if (v < ndviMin) ndviMin = v;
    if (v > ndviMax) ndviMax = v;
    n++;
  }
  if (!n) return null;
  return {
    ndvi: ndviSum / n,
    ndwi: ndwiSum / n,
    ndviMin: ndviMin,
    ndviMax: ndviMax,
    amp: ndviMax - ndviMin
  };
}

/** Contiguous class index: water=0 … rangeland=8 (No Data → -1). */
function classifyLulc(samples) {
  var list = Array.isArray(samples) ? samples : samples ? [samples] : [];
  if (!list.length) return -1;
  var cur = list[list.length - 1];
  if (!cur || !cur.dataMask) return -1;

  var t = temporalStats(list);
  var v = ndvi(cur);
  var w = ndwi(cur);
  var snow = ndsi(cur);
  var bri = brightness(cur);

  if (bri > 0.32 && v < 0.18 && cur.B11 > 0.16) return 7; // clouds
  if (snow > 0.35 && bri > 0.22 && v < 0.2) return 6; // snow
  // Open water only — avoid swallowing moist soil / vegetation.
  if (w > 0.25 || (cur.B03 / (cur.B08 + 1e-6) > 1.35 && v < 0.08 && w > 0.05)) return 0; // water
  if (v < 0.15 && cur.B11 > 0.16 && bri > 0.08) return 4; // built
  if (v < 0.18 && cur.B11 > 0.12 && w < 0.05) return 5; // bare
  // Trees / crops before flooded — loose NDWI must not swallow vegetation.
  if (t && t.ndvi > 0.55 && t.amp < 0.18) return 1; // trees
  if (!t && v > 0.62) return 1;
  if (t && t.amp > 0.18 && t.ndviMax > 0.42 && v > 0.22) return 3; // crops
  if (v > 0.45 && v < 0.72) return 3;
  // Flooded vegetation: vegetation + clear moisture signal
  if ((t && t.ndvi > 0.35 && t.ndwi > 0.15) || (v > 0.35 && w > 0.18)) return 2; // flooded
  return 8; // rangeland
}
`.trim()
}

/**
 * RGBA visualization evalscript for Layer Live / AOI clip.
 */
export function buildLulcClassificationEvalscript(): string {
  const c = LULC_RGB
  const helpers = lulcTemporalHelpersAndClassifyJs()
  return `//VERSION=3
// AgroCloud LULC — Sentinel-2 10m land-cover analysis (IO schema · 3m display NEAREST)
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: { bands: 4, sampleType: "AUTO" },
    mosaicking: "ORBIT",
    temporal: true
  };
}

${helpers}

const LULC_RGB = [
  [${c.water.join(', ')}],
  [${c.trees.join(', ')}],
  [${c.flooded.join(', ')}],
  [${c.crops.join(', ')}],
  [${c.built.join(', ')}],
  [${c.bare.join(', ')}],
  [${c.snow.join(', ')}],
  [${c.clouds.join(', ')}],
  [${c.rangeland.join(', ')}]
];

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  if (cls < 0) return [0, 0, 0, 0];
  var rgb = LULC_RGB[cls];
  return [rgb[0], rgb[1], rgb[2], 1];
}`
}

/**
 * Statistical API histogram — contiguous class index 0…N-1 for pixel → area stats.
 * Uses the same temporal classify rules as the WMS map layer.
 */
export function buildLulcHistogramEvalscript(): string {
  const helpers = lulcTemporalHelpersAndClassifyJs()
  const n = LULC_MAP_CLASSES.length
  return `//VERSION=3
// AGRO_CLASS_HISTOGRAM {"mode":"lulc","classes":${n}}
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: [
      { id: "idx", bands: ["idx"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT",
    temporal: true
  };
}

${helpers}

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  var valid = cls >= 0;
  return { idx: [valid ? cls : 0], dataMask: [valid ? 1 : 0] };
}`
}

/**
 * WMS GetMap — class index in R (UINT8 0…8), alpha = valid.
 * Same temporal classify as the Live Analysis map so AOI bars match the overlay.
 */
export function buildLulcClassIndexWmsEvalscript(): string {
  const helpers = lulcTemporalHelpersAndClassifyJs()
  return `//VERSION=3
// AgroCloud LULC class-index (UINT8) for AOI pixel counts
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: { bands: 4, sampleType: "UINT8" },
    mosaicking: "ORBIT",
    temporal: true
  };
}

${helpers}

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  if (cls < 0) return [0, 0, 0, 0];
  return [cls, cls, cls, 255];
}`
}
