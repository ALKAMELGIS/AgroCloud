/**
 * Multi-temporal crop classification evalscript (Sentinel Hub WMS).
 * Uses ORBIT mosaicking + temporal samples across the season TIME window.
 * Heuristic spectral–temporal rules map to 9 crop / land-cover classes.
 */

export function buildCropClassificationEvalscript(): string {
  return `//VERSION=3
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

function ndvi(s) {
  return (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
}

function ndwi(s) {
  return (s.B03 - s.B08) / (s.B03 + s.B08 + 1e-6);
}

function temporalStats(samples) {
  var n = 0;
  var ndviSum = 0;
  var ndviMin = 1;
  var ndviMax = -1;
  var ndwiSum = 0;
  var swirSum = 0;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask) continue;
    var v = ndvi(s);
    var w = ndwi(s);
    ndviSum += v;
    ndwiSum += w;
    swirSum += s.B11;
    if (v < ndviMin) ndviMin = v;
    if (v > ndviMax) ndviMax = v;
    n++;
  }
  if (!n) return null;
  return {
    ndvi: ndviSum / n,
    ndwi: ndwiSum / n,
    swir: swirSum / n,
    ndviMin: ndviMin,
    ndviMax: ndviMax,
    amp: ndviMax - ndviMin
  };
}

function evaluatePixel(samples) {
  if (!samples.length) return [0, 0, 0, 0];
  var cur = samples[samples.length - 1];
  if (!cur.dataMask) return [0, 0, 0, 0];

  var t = temporalStats(samples);
  var v = ndvi(cur);
  var w = ndwi(cur);

  // Water
  if (w > 0.18 || cur.B03 / (cur.B08 + 1e-6) > 1.15) {
    return [0.15, 0.39, 0.92, 1];
  }
  // Urban / barren
  if (v < 0.12 && cur.B11 > 0.14) {
    return [0.47, 0.45, 0.43, 1];
  }
  // Forest — high NDVI, low seasonal amplitude
  if (t && t.ndvi > 0.55 && t.amp < 0.12) {
    return [0.09, 0.40, 0.20, 1];
  }
  // Wetlands
  if (t && t.ndvi > 0.32 && t.ndwi > 0.04 && w > 0.02) {
    return [0.05, 0.58, 0.53, 1];
  }
  // Corn — strong green-up
  if (t && t.amp > 0.28 && v > 0.62) {
    return [0.98, 0.75, 0.14, 1];
  }
  // Soybeans — moderate green-up
  if (t && t.amp > 0.16 && t.amp <= 0.28 && v > 0.52) {
    return [0.52, 0.80, 0.09, 1];
  }
  // Wheat — early peak, senesced at current date
  if (t && t.ndviMax > 0.48 && v < t.ndviMax - 0.12) {
    return [0.92, 0.70, 0.03, 1];
  }
  // Cotton — mid NDVI + SWIR
  if (v > 0.42 && v < 0.58 && cur.B11 > 0.11) {
    return [0.96, 0.96, 0.95, 1];
  }
  // Alfalfa — sustained moderate NDVI
  if (t && v > 0.38 && v < 0.55 && t.amp < 0.10) {
    return [0.13, 0.77, 0.37, 1];
  }
  return [0.47, 0.45, 0.43, 1];
}`
}
