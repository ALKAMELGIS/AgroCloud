/**
 * Country-aware, multi-temporal crop classifier.
 *
 * Given several per-pixel NDVI/NDWI grids across the growing season and the crop
 * set for the AOI's country, it:
 *   1. peels off non-vegetation (water / bare / built) via index rules,
 *   2. resamples each pixel's NDVI time-series to the prototype phenophases,
 *   3. assigns the nearest crop prototype (restricted to the country's crops),
 *   4. applies a 3×3 majority filter so results follow homogeneous field blocks.
 *
 * Output is a colored RGBA PNG (data URL) aligned to the AOI bbox; the frontend
 * clips it to the drawn AOI polygon.
 */

import { PNG } from 'pngjs'
import {
  NORM_POSITIONS,
  cropSeasonAffinity,
  phenologyMatchDistance,
} from './cropCountryDatabase.js'

function hexToRgb(hex) {
  const h = String(hex).replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * Fill label holes (−1) by iterative majority vote from 8-neighbours.
 * Prevents black cloud cutouts in the Crop Type map after cloudy dates were skipped.
 */
function fillUnclassifiedHoles(labels, width, height, passes = 8) {
  const n = width * height
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = 0
    const next = labels.slice()
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x
        if (labels[p] >= 0) continue
        const counts = new Map()
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const l = labels[ny * width + nx]
            if (l < 0) continue
            counts.set(l, (counts.get(l) || 0) + 1)
          }
        }
        if (!counts.size) continue
        let bestL = -1
        let bestC = -1
        for (const [l, c] of counts) {
          if (c > bestC) {
            bestC = c
            bestL = l
          }
        }
        if (bestL >= 0) {
          next[p] = bestL
          changed += 1
        }
      }
    }
    labels.set(next)
    if (!changed) break
  }
}

/** Linear-resample an NDVI series (sampled at `srcFracs`) onto NORM_POSITIONS. */
function resampleToPhenophases(values, srcFracs) {
  const out = new Array(NORM_POSITIONS.length)
  for (let k = 0; k < NORM_POSITIONS.length; k += 1) {
    const x = NORM_POSITIONS[k]
    let lo = 0
    while (lo < srcFracs.length - 1 && srcFracs[lo + 1] < x) lo += 1
    const hi = Math.min(lo + 1, srcFracs.length - 1)
    if (lo === hi) {
      out[k] = values[lo]
    } else {
      const t = (x - srcFracs[lo]) / Math.max(1e-6, srcFracs[hi] - srcFracs[lo])
      out[k] = values[lo] + t * (values[hi] - values[lo])
    }
  }
  return out
}

/**
 * Chamfer (3,4-style Euclidean-approx) distance transform of a binary mask.
 * Each foreground pixel receives its distance to the nearest background pixel.
 */
function distanceTransform(mask, width, height) {
  const INF = 1e9
  const dt = new Float32Array(width * height)
  for (let i = 0; i < dt.length; i += 1) dt[i] = mask[i] ? INF : 0
  const a = 1
  const b = Math.SQRT2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (dt[p] === 0) continue
      let m = dt[p]
      if (x > 0) m = Math.min(m, dt[p - 1] + a)
      if (y > 0) m = Math.min(m, dt[p - width] + a)
      if (x > 0 && y > 0) m = Math.min(m, dt[p - width - 1] + b)
      if (x < width - 1 && y > 0) m = Math.min(m, dt[p - width + 1] + b)
      dt[p] = m
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const p = y * width + x
      if (dt[p] === 0) continue
      let m = dt[p]
      if (x < width - 1) m = Math.min(m, dt[p + 1] + a)
      if (y < height - 1) m = Math.min(m, dt[p + width] + a)
      if (x < width - 1 && y < height - 1) m = Math.min(m, dt[p + width + 1] + b)
      if (x > 0 && y < height - 1) m = Math.min(m, dt[p + width - 1] + b)
      dt[p] = m
    }
  }
  return dt
}

/**
 * Detect true center-pivot (circular) cropland footprints.
 *
 * IMPORTANT: Do NOT stamp inscribed disks from distance-transform peaks. That
 * creates fake purple circles over rectangular fields (DT max sits at the
 * centre of any thick blob). Only accept connected components whose shape is
 * genuinely circular.
 *
 * @returns {{ inPivot: Uint8Array, pivotId: Int32Array }}
 */
function detectPivotFields(croplandMask, width, height) {
  const n = width * height
  const inPivot = new Uint8Array(n)
  const pivotId = new Int32Array(n).fill(-1)
  let diskCount = 0

  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const comp = new Int32Array(n)
  for (let p0 = 0; p0 < n; p0 += 1) {
    if (!croplandMask[p0] || seen[p0]) continue
    let top = 0
    stack[top++] = p0
    seen[p0] = 1
    let count = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    let sumX = 0
    let sumY = 0
    while (top > 0) {
      const p = stack[--top]
      comp[count++] = p
      const x = p % width
      const y = (p - x) / width
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && croplandMask[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1
        stack[top++] = p - 1
      }
      if (x < width - 1 && croplandMask[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1
        stack[top++] = p + 1
      }
      if (y > 0 && croplandMask[p - width] && !seen[p - width]) {
        seen[p - width] = 1
        stack[top++] = p - width
      }
      if (y < height - 1 && croplandMask[p + width] && !seen[p + width]) {
        seen[p + width] = 1
        stack[top++] = p + width
      }
    }

    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const d = Math.max(w, h)
    if (count < 120 || d < 14) continue
    const aspect = Math.min(w, h) / Math.max(w, h)
    // Rectangular parcels fail aspect; squares fail fill vs circumscribed disk (~4/π ≈ 1.27).
    if (aspect < 0.88) continue
    const diskArea = Math.PI * (d / 2) * (d / 2)
    const fill = count / diskArea
    if (fill < 0.78 || fill > 1.05) continue

    // Compactness: mean radius ≈ geometric circle radius.
    const cx = sumX / count
    const cy = sumY / count
    let sumR = 0
    let sumR2 = 0
    for (let i = 0; i < count; i += 1) {
      const q = comp[i]
      const x = q % width
      const y = (q - x) / width
      const dx = x - cx
      const dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      sumR += r
      sumR2 += r * r
    }
    const meanR = sumR / count
    const rmsR = Math.sqrt(sumR2 / count)
    const expectedR = Math.sqrt(count / Math.PI)
    if (meanR < expectedR * 0.82 || meanR > expectedR * 1.12) continue
    if (rmsR / Math.max(meanR, 1e-3) > 1.18) continue

    // Bounding-box corners should be mostly empty (true disks leave empty corners).
    const corner = Math.max(2, Math.round(d * 0.12))
    let cornerCrop = 0
    let cornerTot = 0
    const corners = [
      [minX, minY],
      [maxX - corner + 1, minY],
      [minX, maxY - corner + 1],
      [maxX - corner + 1, maxY - corner + 1],
    ]
    for (const [x0, y0] of corners) {
      for (let y = y0; y < y0 + corner && y <= maxY; y += 1) {
        for (let x = x0; x < x0 + corner && x <= maxX; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          cornerTot += 1
          if (croplandMask[y * width + x]) cornerCrop += 1
        }
      }
    }
    if (cornerTot > 0 && cornerCrop / cornerTot > 0.35) continue

    const id = diskCount++
    for (let i = 0; i < count; i += 1) {
      const q = comp[i]
      inPivot[q] = 1
      pivotId[q] = id
    }
  }

  return { inPivot, pivotId }
}

/**
 * @param {{ ndvi: Float32Array; ndwi: Float32Array; ndmi: Float32Array; valid: Uint8Array; width: number; height: number }[]} grids
 * @param {{ crops: any[]; landcover: any[] }} profile
 * @param {{ seasonStart?: string; seasonEnd?: string }} [opts]
 * @returns {{ pngDataUrl: string; width: number; height: number; classStats: { id: string; name: string; pct: number }[] }}
 */
export function classifyCropFields(grids, profile, opts = {}) {
  if (!grids.length) throw new Error('No imagery grids to classify.')
  const { width, height } = grids[0]
  const n = width * height
  const K = grids.length
  const srcFracs = grids.map((_, i) => (K === 1 ? 0 : i / (K - 1)))
  const seasonStart = opts.seasonStart || ''
  const seasonEnd = opts.seasonEnd || ''

  const crops = profile.crops
  const landcover = profile.landcover
  const seasonWeights = crops.map(c => cropSeasonAffinity(c.season, seasonStart, seasonEnd))
  const water = landcover.find(l => l.id === 'water')
  const bare = landcover.find(l => l.id === 'bare')
  const built = landcover.find(l => l.id === 'built')
  const natural = landcover.find(l => l.id === 'natural')

  // Class index space: [0..crops-1] crops, then LULC. -1 = nodata.
  const WATER_IDX = crops.length
  const BUILT_IDX = crops.length + 1
  const BARE_IDX = crops.length + 2
  const NATURAL_IDX = crops.length + 3
  const classMeta = [
    ...crops.map(c => ({ id: c.id, name: c.name, color: c.color })),
    { id: water.id, name: water.name, color: water.color },
    { id: built.id, name: built.name, color: built.color },
    { id: bare.id, name: bare.name, color: bare.color },
    { id: natural.id, name: natural.name, color: natural.color },
  ]

  // ---- LULC + cropland gate thresholds (tunable) ----
  const WATER_NDWI = 0.2 // standing water
  const WATER_MAXNDVI = 0.28
  const BUILT_MAXNDVI = 0.3 // impervious never greens up
  const BUILT_NDMI = -0.12 // strong NDBI (= -NDMI): dry/built
  const BARE_MAXNDVI = 0.3 // low veg all season but moist-ish soil
  const CROP_PEAK_MIN = 0.45 // managed cropland reaches high NDVI…
  const CROP_AMP_MIN = 0.22 // …or shows a clear green-up/senescence cycle
  const NATURAL_FLOOR = 0.3 // sparse/natural veg sits between bare and cropland
  const EVERGREEN_MIN_NDVI = 0.45 // perennial orchard must stay green all season

  const cropProtos = crops.map(c => c.ndvi)
  const labels = new Int16Array(n).fill(-1)

  // Deferred crop-typing: pixels that pass the cropland gate are marked PENDING in
  // pass 1, then typed in pass 2 after pivot fields are detected so we can apply
  // agronomic constraints (e.g. no Date Palm inside center-pivot circles).
  const CROPLAND_PENDING = -2
  const VEG_FLOOR = 0.22 // any pixel that greens this much joins the pivot footprint
  const EVERGREEN_MAX_AMP = 0.18 // perennial orchards barely change across the year
  // Date Palm / orchards are NOT a primary spectral class: they are assigned only
  // as a CONFIRMATION when a sizeable, pivot-free object matches the perennial
  // signature tightly. Otherwise the object falls to the next-best seasonal class.
  const EVERGREEN_MAX_DIST = 0.06 // tight, unambiguous match (Σ over 6 phases)
  const EVERGREEN_MIN_OBJ = 40 // orchards are contiguous blocks, not specks/edges
  const croplandMask = new Uint8Array(n)
  const vegMask = new Uint8Array(n) // lenient vegetation footprint (for pivot geometry)
  const sampledAll = new Float32Array(n * NORM_POSITIONS.length)
  const minNdviArr = new Float32Array(n)
  const maxNdviArr = new Float32Array(n)
  const meanNdwiArr = new Float32Array(n)

  const series = new Array(K)
  const fracs = new Array(K)
  for (let p = 0; p < n; p += 1) {
    let cnt = 0
    let ndwiSum = 0
    let ndmiSum = 0
    let maxNdvi = -1
    let minNdvi = 2
    for (let d = 0; d < K; d += 1) {
      if (!grids[d].valid[p]) continue
      const v = grids[d].ndvi[p]
      series[cnt] = v
      fracs[cnt] = srcFracs[d]
      ndwiSum += grids[d].ndwi[p]
      ndmiSum += grids[d].ndmi[p]
      if (v > maxNdvi) maxNdvi = v
      if (v < minNdvi) minNdvi = v
      cnt += 1
    }
    if (cnt < 1) {
      labels[p] = -1
      continue
    }
    const meanNdwi = ndwiSum / cnt
    const meanNdmi = ndmiSum / cnt
    const amplitude = maxNdvi - minNdvi

    // Lenient vegetation footprint — captures the WHOLE pivot disk (incl. stressed
    // or partly-fallow areas) so pivot geometry is detected even when the cropland
    // gate rejects internal patches. Used only for pivot-zone detection.
    if (maxNdvi >= VEG_FLOOR) vegMask[p] = 1

    // ---- Stage 1: LULC (non-agricultural land resolved first) ----
    if (meanNdwi > WATER_NDWI && maxNdvi < WATER_MAXNDVI) {
      labels[p] = WATER_IDX
      continue
    }
    if (maxNdvi < BUILT_MAXNDVI && meanNdmi < BUILT_NDMI) {
      labels[p] = BUILT_IDX // impervious / urban (dry, never greens)
      continue
    }
    if (maxNdvi < BARE_MAXNDVI) {
      labels[p] = BARE_IDX // bare soil / fallow
      continue
    }

    // ---- Stage 2: cropland gate — only managed agriculture proceeds ----
    const isCropland = maxNdvi >= CROP_PEAK_MIN || (amplitude >= CROP_AMP_MIN && maxNdvi >= NATURAL_FLOOR + 0.05)
    if (!isCropland) {
      labels[p] = NATURAL_IDX // sparse/natural vegetation, NOT a crop
      continue
    }

    // ---- Stage 2b: cropland confirmed — defer typing to pass 2 ----
    const sampled = resampleToPhenophases(series.slice(0, cnt), fracs.slice(0, cnt))
    croplandMask[p] = 1
    labels[p] = CROPLAND_PENDING
    minNdviArr[p] = minNdvi
    maxNdviArr[p] = maxNdvi
    meanNdwiArr[p] = meanNdwi
    sampledAll.set(sampled, p * NORM_POSITIONS.length)
  }

  // Pivot geometry must match real circular footprints only (no DT disk stamping).
  // Use croplandMask — vegMask is too lenient and merged blobs into fake circles.
  const { inPivot, pivotId } = detectPivotFields(croplandMask, width, height)
  const PH = NORM_POSITIONS.length

  // ---- Pivot buffer (dilated zone) ----
  // The bare rim of a pivot disk and the narrow gaps BETWEEN abutting pivots are
  // part of the same center-pivot landscape — never orchard land. Dilate the pivot
  // mask by a small margin so Date Palm / orchards can never be classified hugging
  // a pivot edge or sitting in an inter-pivot gap (the leak seen at the disk rims).
  const PIVOT_BUFFER_R = Math.max(2, Math.round(0.012 * Math.min(width, height)))
  const nearPivot = new Uint8Array(n)
  {
    const tmp = new Uint8Array(n)
    const R = PIVOT_BUFFER_R
    for (let y = 0; y < height; y += 1) {
      const row = y * width
      for (let x = 0; x < width; x += 1) {
        let on = 0
        for (let dx = -R; dx <= R; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          if (inPivot[row + nx]) { on = 1; break }
        }
        tmp[row + x] = on
      }
    }
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let on = 0
        for (let dy = -R; dy <= R; dy += 1) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          if (tmp[ny * width + x]) { on = 1; break }
        }
        nearPivot[y * width + x] = on
      }
    }
  }

  // ---- Object-Based Image Analysis (OBIA): segment cropland into FIELD objects ----
  // Spatial refinement that snaps the classification to real field boundaries:
  //   • every pivot circle is one object (a pivot grows a single crop),
  //   • remaining cropland is split into objects by edge-aware region growing
  //     (4-connected components broken at NDVI/phenology discontinuities).
  // Each object is then classified ONCE from its mean spectral-temporal signature
  // (Spectral + Spatial + Temporal fusion), eliminating salt-and-pepper noise and
  // cross-field mixing so each field is homogeneous with crisp edges.
  const objId = new Int32Array(n).fill(-1)
  let nextObj = 0
  const pivotObjMap = new Map() // pivot disk id -> object id
  for (let p = 0; p < n; p += 1) {
    if (croplandMask[p] && pivotId[p] >= 0) {
      let oid = pivotObjMap.get(pivotId[p])
      if (oid === undefined) {
        oid = nextObj++
        pivotObjMap.set(pivotId[p], oid)
      }
      objId[p] = oid
    }
  }

  // Edge-aware region growing for non-pivot cropland. Two neighbours join the same
  // field only if their phenology signatures are close (mean |ΔNDVI| over phases),
  // so a road/boundary or a different crop starts a new object.
  const SEG_EDGE = 0.11 // tighter phenology edge → fields follow real parcel boundaries
  const growStack = new Int32Array(n)
  for (let p0 = 0; p0 < n; p0 += 1) {
    if (!croplandMask[p0] || objId[p0] >= 0) continue
    const oid = nextObj++
    let top = 0
    growStack[top++] = p0
    objId[p0] = oid
    while (top > 0) {
      const p = growStack[--top]
      const x = p % width
      const y = (p - x) / width
      const bp = p * PH
      const tryNb = (q) => {
        if (q < 0 || q >= n) return
        if (!croplandMask[q] || objId[q] >= 0 || pivotId[q] >= 0) return
        const bq = q * PH
        let diff = 0
        for (let k = 0; k < PH; k += 1) diff += Math.abs(sampledAll[bp + k] - sampledAll[bq + k])
        if (diff / PH > SEG_EDGE) return // phenology edge → different field
        objId[q] = oid
        growStack[top++] = q
      }
      if (x > 0) tryNb(p - 1)
      if (x < width - 1) tryNb(p + 1)
      if (y > 0) tryNb(p - width)
      if (y < height - 1) tryNb(p + width)
    }
  }
  const objCount = nextObj

  // ---- Per-object mean signature accumulation (Spectral+Spatial+Temporal) ----
  const objCnt = new Int32Array(objCount)
  const objSig = new Float32Array(objCount * PH)
  const objMinNdvi = new Float32Array(objCount)
  const objMaxNdvi = new Float32Array(objCount)
  const objNdwi = new Float32Array(objCount)
  const objIsPivot = new Uint8Array(objCount)
  const objNearPivot = new Uint8Array(objCount) // touches pivot buffer (rim/gap)
  for (let i = 0; i < objCount; i += 1) objMinNdvi[i] = 2
  for (let p = 0; p < n; p += 1) {
    const o = objId[p]
    if (o < 0) continue
    objCnt[o] += 1
    const bp = p * PH
    const bo = o * PH
    for (let k = 0; k < PH; k += 1) objSig[bo + k] += sampledAll[bp + k]
    if (minNdviArr[p] < objMinNdvi[o]) objMinNdvi[o] = minNdviArr[p]
    if (maxNdviArr[p] > objMaxNdvi[o]) objMaxNdvi[o] = maxNdviArr[p]
    objNdwi[o] += meanNdwiArr[p]
    if (inPivot[p]) objIsPivot[o] = 1
    if (nearPivot[p]) objNearPivot[o] = 1
  }

  // ---- Classify each field object once (constrained nearest prototype) ----
  const objLabel = new Int16Array(objCount).fill(NATURAL_IDX)
  for (let o = 0; o < objCount; o += 1) {
    const cnt = objCnt[o]
    if (!cnt) continue
    const bo = o * PH
    const meanNdwi = objNdwi[o] / cnt
    const minNdvi = objMinNdvi[o]
    const amplitude = objMaxNdvi[o] - objMinNdvi[o]
    const isPivotObj = objIsPivot[o] === 1
    let best = -1
    let bestDist = Infinity
    for (let c = 0; c < cropProtos.length; c += 1) {
      if (crops[c].evergreen) {
        // STRICT Date-Palm / orchard signature: a true perennial canopy stays
        // green ALL year (high floor NDVI) and barely fluctuates (low amplitude).
        // Forage cut-cycles (high amplitude) and seasonal vegetables therefore
        // can never be mistaken for Date Palm, and vice-versa.
        if (minNdvi < EVERGREEN_MIN_NDVI) continue
        if (amplitude > EVERGREEN_MAX_AMP) continue
        // …and orchards are agronomically impossible inside — or hugging — a
        // center-pivot circle (rim/gap included via the dilated buffer).
        if (isPivotObj || objNearPivot[o]) continue
        // Date Palm is NOT a primary class: require a sizeable contiguous block.
        if (cnt < EVERGREEN_MIN_OBJ) continue
      }
      const proto = cropProtos[c]
      const meanSig = new Array(proto.length)
      for (let k = 0; k < proto.length; k += 1) meanSig[k] = objSig[bo + k] / cnt
      // Phenology: MSE + amplitude + peak phase + correlation (season-shape aware).
      let dist = phenologyMatchDistance(meanSig, proto)
      // Calendar affinity: cool crops preferred in winter windows, warm in summer, etc.
      const aff = seasonWeights[c]
      dist *= 1.15 - 0.55 * aff // aff=1 → ×0.60; aff=0.2 → ×1.04
      if (crops[c].wantsWater) dist += meanNdwi > 0.05 ? -0.08 : 0.08
      if (isPivotObj && crops[c].pivotForage) dist -= 0.02
      // Rectangular / non-pivot fields: heavily penalize multi-cut pivot forage
      // (Rhodes / Alfalfa) so seasonal cereals/veg win when shapes match.
      if (!isPivotObj && !objNearPivot[o] && crops[c].pivotForage) dist += 0.12
      // Confirmation-only gate: reject weak/ambiguous Date Palm matches outright so
      // the object falls back to the best-fitting seasonal crop instead.
      if (crops[c].evergreen && dist > EVERGREEN_MAX_DIST) continue
      if (dist < bestDist) {
        bestDist = dist
        best = c
      }
    }
    objLabel[o] = best >= 0 ? best : NATURAL_IDX
  }

  // ---- Compose final per-pixel labels: field objects (crisp) + LULC ----
  for (let p = 0; p < n; p += 1) {
    if (objId[p] >= 0) labels[p] = objLabel[objId[p]]
    else if (labels[p] === CROPLAND_PENDING) labels[p] = NATURAL_IDX
  }

  // Edge-aware refinement: denoise ONLY the LULC matrix (water/built/bare/natural)
  // with a 3×3 majority among same-category neighbours, leaving crop field objects
  // — and therefore their boundaries — perfectly intact.
  const smoothed = new Int16Array(n)
  const counts = new Map()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (labels[p] < 0) {
        smoothed[p] = -1
        continue
      }
      if (objId[p] >= 0) {
        smoothed[p] = labels[p] // crop field object — keep exact boundary
        continue
      }
      counts.clear()
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
          const q = ny * width + nx
          if (objId[q] >= 0) continue // don't let crop fields bleed into LULC
          const l = labels[q]
          if (l < 0) continue
          counts.set(l, (counts.get(l) || 0) + 1)
        }
      }
      let bestL = labels[p]
      let bestC = -1
      for (const [l, c] of counts) {
        if (c > bestC) {
          bestC = c
          bestL = l
        }
      }
      smoothed[p] = bestL
    }
  }

  // ---- FINAL HARD SAFETY NET ----
  // Absolutely no evergreen orchard (Date Palm / cane) may remain anywhere inside
  // a detected pivot zone, regardless of how it got there (object edge, smoothing,
  // partial disk). Such a pixel is reassigned to its object's already-computed
  // (pivot-legal) crop, or to bare/natural if none applies.
  const evergreenIdx = new Set()
  for (let c = 0; c < crops.length; c += 1) if (crops[c].evergreen) evergreenIdx.add(c)
  if (evergreenIdx.size) {
    for (let p = 0; p < n; p += 1) {
      if (!nearPivot[p]) continue // pivot disk + rim/gap buffer
      if (!evergreenIdx.has(smoothed[p])) continue
      const o = objId[p]
      const legal = o >= 0 ? objLabel[o] : -1
      smoothed[p] = legal >= 0 && !evergreenIdx.has(legal) ? legal : BARE_IDX
    }
  }

  // Render colored RGBA PNG + class stats.
  fillUnclassifiedHoles(smoothed, width, height)
  const png = new PNG({ width, height })
  const rgb = classMeta.map(m => hexToRgb(m.color))
  const tally = new Array(classMeta.length).fill(0)
  let validPixels = 0
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const l = smoothed[p]
    if (l < 0) {
      png.data[i] = 0
      png.data[i + 1] = 0
      png.data[i + 2] = 0
      png.data[i + 3] = 0
      continue
    }
    const [r, g, b] = rgb[l]
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
    tally[l] += 1
    validPixels += 1
  }
  const buffer = PNG.sync.write(png)
  const pngDataUrl = `data:image/png;base64,${buffer.toString('base64')}`

  const classStats = classMeta
    .map((m, idx) => ({ id: m.id, name: m.name, pct: validPixels ? Number(((tally[idx] / validPixels) * 100).toFixed(1)) : 0 }))
    .filter(s => s.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  let pivotPixels = 0
  let croplandPixels = 0
  for (let p = 0; p < n; p += 1) {
    if (croplandMask[p]) croplandPixels += 1
    if (inPivot[p]) pivotPixels += 1
  }
  const pivots = {
    pixels: pivotPixels,
    pctOfCropland: croplandPixels ? Number(((pivotPixels / croplandPixels) * 100).toFixed(1)) : 0,
  }
  const fields = { objects: objCount, pivotObjects: pivotObjMap.size }

  return {
    pngDataUrl,
    width,
    height,
    classStats,
    pivots,
    fields,
    labels: smoothed,
    classMeta,
    bbox3857: grids[0]?.bbox3857 ?? null,
  }
}
