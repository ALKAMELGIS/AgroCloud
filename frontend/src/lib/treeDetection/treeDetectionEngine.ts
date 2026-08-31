/**
 * Tree Detections — YOLO tree-crown object detection.
 *
 * Detection is performed by a hosted YOLO model (the single-class "tree" YOLOv5
 * detector from yolo-trees/ai-tree-detection) reached via the backend proxy. This
 * module turns the model's per-image bounding boxes into georeferenced
 * GIS-ready tree features:
 *   1. Box centre → lng/lat (georeference) + AOI point-in-polygon clip
 *   2. Crown diameter / area from the box footprint; size classification
 *   3. Crown-pixel colour sampling → canopy vigour and (optional) species
 *   4. Cross-tile de-duplication + AOI-wide statistics + GeoJSON
 *
 * The previous in-browser VHR computer-vision detector (greenness / dark-object
 * "treeness" / Difference-of-Gaussians / local-maxima) has been removed — all
 * detections now come from the YOLO model so this is true individual-tree
 * object detection rather than vegetation segmentation.
 */

import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import type { YoloTreeBox } from './yoloTreeDetectionClient'
import type { LngLatBBox, TreeImageryMosaic, TreeImageryProviderId } from './webMercatorTiles'
import {
  classifyCrownSpecies,
  TREE_SPECIES,
  TREE_SPECIES_ORDER,
  type CrownFeatures,
  type TreeSpeciesId,
} from './treeSpeciesClassifier'

export type TreeSizeClass = 'small' | 'medium' | 'large'
export type TreeVigor = 'healthy' | 'moderate' | 'sparse'

/**
 * Analysis modes. Modular by design — add a new id + a stage in
 * `detectTreesInMosaic` (or a separate post-processor) to introduce future
 * modes (health, biomass, carbon) without changing existing workflows.
 */
export type TreeAnalysisMode = 'detect' | 'detect-classify'

export type TreeDetection = {
  id: string
  lng: number
  lat: number
  confidence: number
  crownDiameterM: number
  crownAreaM2: number
  sizeClass: TreeSizeClass
  vigor: TreeVigor
  /** Present only in 'detect-classify' mode. */
  species?: TreeSpeciesId
  speciesConfidence?: number
}

export type TreeClassSummary = {
  id: TreeSizeClass
  label: string
  color: string
  count: number
}

export type TreeSpeciesSummary = {
  id: TreeSpeciesId
  label: string
  color: string
  count: number
}

export type TreeDetectionStats = {
  total: number
  aoiAreaHa: number
  densityPerHa: number
  canopyCoverPct: number
  meanCrownDiameterM: number
  byClass: TreeClassSummary[]
  /** Present only in 'detect-classify' mode (non-zero species, descending). */
  bySpecies?: TreeSpeciesSummary[]
  mode: TreeAnalysisMode
  zoom: number
  metersPerPixel: number
  provider: TreeImageryProviderId
  tilesLoaded: number
}

export type TreeDetectionResult = {
  detections: TreeDetection[]
  stats: TreeDetectionStats
  geojson: GeoJSON.FeatureCollection
  generatedAt: number
}

/**
 * Raw output of detecting crowns in ONE imagery mosaic (one tile of a larger,
 * tile-based AOI scan). Carries the per-tile canopy-cover sample counts so the
 * assembler can compute a correct AOI-wide canopy percentage after merging.
 */
export type CrownDetectionPass = {
  detections: TreeDetection[]
  /** Pixels sampled inside the AOI for canopy-cover estimation. */
  canopySampled: number
  /** Of those, how many read as canopy. */
  canopyHit: number
  metersPerPixel: number
  zoom: number
  tilesLoaded: number
}

export const TREE_SIZE_CLASS_META: Record<TreeSizeClass, { label: string; color: string }> = {
  small: { label: 'Small crown (< 3 m)', color: '#a3e635' },
  medium: { label: 'Medium crown (3–6 m)', color: '#22c55e' },
  large: { label: 'Large crown (> 6 m)', color: '#15803d' },
}

export const TREE_VIGOR_META: Record<TreeVigor, { label: string }> = {
  healthy: { label: 'Healthy canopy' },
  moderate: { label: 'Moderate canopy' },
  sparse: { label: 'Sparse / stressed' },
}

export type TreeDetectionTuning = {
  /** 0 (conservative) → 1 (aggressive). Maps to the canopy greenness threshold. */
  sensitivity: number
  /** Minimum spacing between two detected crowns, in metres. */
  minTreeSpacingM: number
  /** Expected typical crown radius, in metres (controls the density blur). */
  typicalCrownRadiusM: number
  /**
   * 0 → recall-leaning, 1 → precision-leaning. Raises the score threshold,
   * tightens NMS spacing and enforces crown-shape / texture-noise gates so that
   * dense-vegetation false positives are removed. Defaults to 0.7.
   */
  precision?: number
  /** Reject crowns smaller than this diameter (m). */
  minCrownDiameterM?: number
  /** Reject crowns larger than this diameter (m). */
  maxCrownDiameterM?: number
}

export const DEFAULT_TREE_TUNING: TreeDetectionTuning = {
  sensitivity: 0.5,
  minTreeSpacingM: 3.2,
  typicalCrownRadiusM: 2.2,
  precision: 0.75,
}

/**
 * Illumination-invariant green dominance in [0,1].
 *
 * Uses chromaticity ratios (green vs. the stronger of red/blue) rather than the
 * brightness-dependent Excess-Green, so dark olive / shadowed tree crowns — which
 * ExG erased — still register as vegetation.
 */
function greenDominanceAt(r: number, g: number, b: number): number {
  const sum = r + g + b + 1e-6
  const dom = g / sum - Math.max(r, b) / sum
  if (dom <= 0) return 0
  return Math.min(1, dom * 4)
}

export type TreeImageFields = {
  /** Green dominance per pixel, [0,1]. */
  green: Float32Array
  /** Luminance per pixel, [0,1]; 1 for transparent pixels (treated as bright bg). */
  lum: Float32Array
}

/** Build green-dominance + luminance fields (Float32) from RGBA image data. */
function buildImageFields(imageData: ImageData): TreeImageFields {
  const { data, width, height } = imageData
  const n = width * height
  const green = new Float32Array(n)
  const lum = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p += 1) {
    const a = data[i + 3]!
    if (a === 0) {
      green[p] = 0
      lum[p] = 1 // transparent → treat as bright background, never a "dark crown"
      continue
    }
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    green[p] = greenDominanceAt(r, g, b)
    lum[p] = (r + g + b) / 765 // /(3*255)
  }
  return { green, lum }
}

/** Bilinear sample of a Float32 field at sub-pixel (x,y), clamped to bounds. */
function sampleBilinear(field: Float32Array, width: number, height: number, x: number, y: number): number {
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x > width - 1) x = width - 1
  if (y > height - 1) y = height - 1
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const v00 = field[y0 * width + x0]!
  const v10 = field[y0 * width + x1]!
  const v01 = field[y1 * width + x0]!
  const v11 = field[y1 * width + x1]!
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
}

/**
 * "Spokiness" of an angular profile in [0,1]: the fraction of the profile's AC
 * energy concentrated in a single rotational harmonic in the frond band (k=4..18).
 *
 * A palm crown's fronds make the profile near-periodic (e.g. ~10 spokes → strong
 * k≈10 harmonic) regardless of crown rotation or how many fronds there are. A
 * smooth broadleaf crown has its energy at k≈1 (an illumination gradient), which
 * is *excluded* — so the cue is invariant to lighting direction, sun angle, and
 * orientation. This replaces the old, noisy sign-change spoke count.
 */
function angularSpokiness(samples: number[]): number {
  const N = samples.length
  if (N < 8) return 0
  let mean = 0
  for (const v of samples) mean += v
  mean /= N
  let energy = 0
  for (const v of samples) energy += (v - mean) * (v - mean)
  if (energy < 1e-6) return 0
  let best = 0
  for (let k = 4; k <= 18; k += 1) {
    let re = 0
    let im = 0
    for (let i = 0; i < N; i += 1) {
      const ang = (2 * Math.PI * k * i) / N
      const d = samples[i]! - mean
      re += d * Math.cos(ang)
      im += d * Math.sin(ang)
    }
    const mag = re * re + im * im
    if (mag > best) best = mag
  }
  // One-sided DFT power of a real signal sums to energy*N/2.
  return Math.min(1, best / (energy * N * 0.5))
}

/**
 * Radial frond / star-pattern strength in [0,1] for a crown centred at (cx,cy) —
 * the core Date-Palm / Palm signature.
 *
 * For several concentric rings we sample BOTH luminance and green-dominance with
 * bilinear interpolation (sub-pixel accurate at small crown scales) and measure
 * the angular harmonic "spokiness" of each. Palm fronds modulate both channels
 * (bright/dark spokes + green frond vs. sandy gap), so taking the stronger of the
 * two per ring makes the cue robust to illumination, viewing angle and canopy
 * density. Broadleaf / columnar non-palm crowns stay angularly smooth → low score.
 */
function radialFrondScoreAt(
  lum: Float32Array,
  green: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  crownRadiusPx: number,
): number {
  const N = 36
  const ringFracs = [0.4, 0.6, 0.8, 1.0, 1.15]
  let scoreSum = 0
  let ringsUsed = 0
  for (const f of ringFracs) {
    const R = Math.max(2, f * crownRadiusPx)
    const lv: number[] = []
    const gv: number[] = []
    let inBounds = true
    for (let a = 0; a < N; a += 1) {
      const ang = (a / N) * Math.PI * 2
      const x = cx + R * Math.cos(ang)
      const y = cy + R * Math.sin(ang)
      if (x < 0 || y < 0 || x >= width || y >= height) {
        inBounds = false
        break
      }
      lv.push(sampleBilinear(lum, width, height, x, y))
      gv.push(sampleBilinear(green, width, height, x, y))
    }
    if (!inBounds) continue
    // Either channel exhibiting frond periodicity is palm evidence.
    scoreSum += Math.max(angularSpokiness(lv), angularSpokiness(gv))
    ringsUsed += 1
  }
  if (ringsUsed === 0) return 0
  // Emphasise: a couple of strongly-spoked rings already make a confident palm.
  return Math.min(1, (scoreSum / ringsUsed) * 1.35)
}

function rayCastInsideRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, polygon: number[][][]): boolean {
  if (!polygon.length) return false
  if (!rayCastInsideRing(lng, lat, polygon[0]!)) return false
  for (let h = 1; h < polygon.length; h += 1) {
    if (rayCastInsideRing(lng, lat, polygon[h]!)) return false // inside a hole
  }
  return true
}

function pointInGeometry(lng: number, lat: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === 'Polygon') return pointInPolygon(lng, lat, geom.coordinates as number[][][])
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][]).some(poly => pointInPolygon(lng, lat, poly))
  }
  return false
}

function classifySize(diameterM: number): TreeSizeClass {
  if (diameterM < 3) return 'small'
  if (diameterM <= 6) return 'medium'
  return 'large'
}

function classifyVigor(meanGreenness: number): TreeVigor {
  // Tuned to the green-dominance scale (greenDominanceAt), not the old ExG scale.
  if (meanGreenness >= 0.42) return 'healthy'
  if (meanGreenness >= 0.2) return 'moderate'
  return 'sparse'
}

export type DetectTreesOptions = {
  /** YOLO boxes (image-pixel coords) detected in this mosaic. */
  boxes: YoloTreeBox[]
  mosaic: TreeImageryMosaic
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  provider: TreeImageryProviderId
  tuning?: TreeDetectionTuning
  /** Workflow to run. Defaults to fast detection-only. */
  mode?: TreeAnalysisMode
  /** Species confidence below this → 'unknown' (only in classify mode). */
  speciesThreshold?: number
}

/**
 * Convert the YOLO bounding boxes for ONE imagery mosaic into a
 * georeferenced detection pass: box centre → lng/lat, AOI point-in-polygon
 * clip, crown size from the box footprint, and crown-pixel colour sampling for
 * canopy vigour and (optional) species attributes. Detection itself is the
 * model's — no computer-vision crown finding happens here. Used as the per-tile
 * worker of the tiled AOI scan; AOI-wide canopy cover is derived from crown
 * areas in `assembleTreeResult`.
 */
export function crownsFromBoxes(options: DetectTreesOptions): CrownDetectionPass {
  const { mosaic, boxes } = options
  const tuning = options.tuning ?? DEFAULT_TREE_TUNING
  const mode: TreeAnalysisMode = options.mode ?? 'detect'
  const classifySpecies = mode === 'detect-classify'
  const geometry =
    (options.geometry as GeoJSON.Feature).type === 'Feature'
      ? (options.geometry as GeoJSON.Feature).geometry
      : (options.geometry as GeoJSON.Geometry)

  const { width, height, metersPerPixel } = mosaic
  const rgba = mosaic.imageData.data
  // Colour fields are used ONLY for crown vigour + (optional) species attributes
  // — never for detection, which comes entirely from the YOLO model.
  const { green, lum } = buildImageFields(mosaic.imageData)

  const minCrownDiameterM = Math.max(0.5, tuning.minCrownDiameterM ?? 1)
  const maxCrownDiameterM = Math.min(60, tuning.maxCrownDiameterM ?? 40)

  const detections: TreeDetection[] = []
  for (const box of boxes) {
    const cxPx = (box.xmin + box.xmax) / 2
    const cyPx = (box.ymin + box.ymax) / 2
    if (cxPx < 0 || cyPx < 0 || cxPx >= width || cyPx >= height) continue
    const [lng, lat] = mosaic.pxToLngLat(cxPx + 0.5, cyPx + 0.5)
    if (!pointInGeometry(lng, lat, geometry)) continue

    const wPx = Math.max(1, box.xmax - box.xmin)
    const hPx = Math.max(1, box.ymax - box.ymin)
    // Crown diameter from the mean box side; area as the equivalent disk.
    const crownDiameterM = Math.max(
      minCrownDiameterM,
      Math.min(maxCrownDiameterM, ((wPx + hPx) / 2) * metersPerPixel),
    )
    if (crownDiameterM < minCrownDiameterM || crownDiameterM > maxCrownDiameterM) continue
    const crownAreaM2 = Math.PI * (crownDiameterM / 2) ** 2

    // Sample crown pixels (box ∩ image bounds) for greenness / colour attributes.
    const bx0 = Math.max(0, Math.floor(box.xmin))
    const by0 = Math.max(0, Math.floor(box.ymin))
    const bx1 = Math.min(width - 1, Math.ceil(box.xmax))
    const by1 = Math.min(height - 1, Math.ceil(box.ymax))
    let nPx = 0
    let greenSum = 0
    let greenSqSum = 0
    let rSum = 0
    let gSum = 0
    let bSum = 0
    for (let y = by0; y <= by1; y += 1) {
      const row = y * width
      for (let x = bx0; x <= bx1; x += 1) {
        const gv = green[row + x]!
        greenSum += gv
        greenSqSum += gv * gv
        nPx += 1
        if (classifySpecies) {
          const ci = (row + x) * 4
          rSum += rgba[ci]!
          gSum += rgba[ci + 1]!
          bSum += rgba[ci + 2]!
        }
      }
    }
    const meanGreen = nPx ? greenSum / nPx : 0

    const detection: TreeDetection = {
      id: `tree-${detections.length + 1}`,
      lng: Number(lng.toFixed(7)),
      lat: Number(lat.toFixed(7)),
      confidence: Number(Math.max(0, Math.min(1, box.score)).toFixed(3)),
      crownDiameterM: Number(crownDiameterM.toFixed(2)),
      crownAreaM2: Number(crownAreaM2.toFixed(2)),
      sizeClass: classifySize(crownDiameterM),
      vigor: classifyVigor(meanGreen),
    }

    if (classifySpecies && nPx > 0) {
      const meanG = gSum / nPx || 1e-6
      const greenVar = Math.max(0, greenSqSum / nPx - meanGreen * meanGreen)
      const crownRadiusPx = Math.max(2, (wPx + hPx) / 4)
      const features: CrownFeatures = {
        crownDiameterM,
        crownAreaM2,
        greenDominance: meanGreen,
        luminance: (rSum + gSum + bSum) / (765 * nPx),
        redGreenRatio: rSum / nPx / meanG,
        blueGreenRatio: bSum / nPx / meanG,
        greenTexture: Math.sqrt(greenVar),
        compactness: 1,
        radialFrond: radialFrondScoreAt(lum, green, width, height, cxPx, cyPx, crownRadiusPx),
      }
      const pred = classifyCrownSpecies(features, { threshold: options.speciesThreshold })
      detection.species = pred.species
      detection.speciesConfidence = pred.confidence
    }

    detections.push(detection)
  }

  return {
    detections,
    // Canopy cover is computed AOI-wide from crown areas during assembly.
    canopySampled: 0,
    canopyHit: 0,
    metersPerPixel,
    zoom: mosaic.zoom,
    tilesLoaded: mosaic.tilesLoaded,
  }
}

const EARTH_RADIUS_M = 6378137

/** Great-circle distance (m) between two lng/lat points. */
function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Spatially de-duplicate detections so each real tree keeps exactly ONE centre
 * point. Greedy by confidence: a candidate is dropped if a higher-confidence
 * detection already sits within `minSpacingM`. A lat/lng hash grid keeps it
 * O(n) for the tens-of-thousands of detections a large tile-based scan yields.
 *
 * This is what removes the duplicates produced where adjacent scan tiles
 * overlap, and guarantees one point per crown regardless of AOI size.
 */
export function dedupeDetections(input: TreeDetection[], minSpacingM: number): TreeDetection[] {
  if (input.length < 2) return input.slice()
  const sorted = [...input].sort((a, b) => b.confidence - a.confidence)
  const cellDeg = Math.max(1e-7, minSpacingM / 111_320) // ~m → deg latitude
  const grid = new Map<string, TreeDetection[]>()
  const kept: TreeDetection[] = []
  for (const d of sorted) {
    const gx = Math.round(d.lng / cellDeg)
    const gy = Math.round(d.lat / cellDeg)
    let dup = false
    for (let ix = gx - 1; ix <= gx + 1 && !dup; ix += 1) {
      for (let iy = gy - 1; iy <= gy + 1 && !dup; iy += 1) {
        const bucket = grid.get(`${ix}:${iy}`)
        if (!bucket) continue
        for (const k of bucket) {
          if (haversineM(d.lng, d.lat, k.lng, k.lat) < minSpacingM) {
            dup = true
            break
          }
        }
      }
    }
    if (dup) continue
    kept.push(d)
    const key = `${gx}:${gy}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(d)
    else grid.set(key, [d])
  }
  return kept
}

export type AssembleTreeResultOptions = {
  /** One or more per-tile detection passes covering the AOI. */
  passes: CrownDetectionPass[]
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  provider: TreeImageryProviderId
  tuning?: TreeDetectionTuning
  mode?: TreeAnalysisMode
}

/**
 * Merge per-tile detection passes into one AOI-wide result: concatenate all
 * crowns, de-duplicate across tile seams (one point per tree), and compute the
 * AOI-wide statistics + GeoJSON. Works for a single mosaic (one pass) or a
 * large tile-based scan (many passes) identically.
 */
export function assembleTreeResult(options: AssembleTreeResultOptions): TreeDetectionResult {
  const { passes } = options
  const tuning = options.tuning ?? DEFAULT_TREE_TUNING
  const mode: TreeAnalysisMode = options.mode ?? 'detect'
  const classifySpecies = mode === 'detect-classify'
  const geometry =
    (options.geometry as GeoJSON.Feature).type === 'Feature'
      ? (options.geometry as GeoJSON.Feature).geometry
      : (options.geometry as GeoJSON.Geometry)

  const merged: TreeDetection[] = []
  for (const pass of passes) merged.push(...pass.detections)
  // De-dupe at a fraction of the crown spacing: collapses the same tree found
  // in two overlapping tiles while never merging two genuinely adjacent trees.
  const dedupSpacingM = Math.max(1.2, tuning.minTreeSpacingM * 0.7)
  const deduped = dedupeDetections(merged, dedupSpacingM)
    .sort((a, b) => (a.lat === b.lat ? a.lng - b.lng : b.lat - a.lat))
    .map((d, i) => ({ ...d, id: `tree-${i + 1}` }))

  const canopySampled = passes.reduce((s, p) => s + p.canopySampled, 0)
  const canopyHit = passes.reduce((s, p) => s + p.canopyHit, 0)
  const metersPerPixel = passes.length ? passes[0]!.metersPerPixel : 0
  const zoom = passes.length ? passes[0]!.zoom : 0
  const tilesLoaded = passes.reduce((s, p) => s + p.tilesLoaded, 0)

  const aoiAreaHa = geodesicAreaM2(geometry) / 10_000
  const aoiAreaM2 = aoiAreaHa * 10_000
  // Canopy cover: legacy grid sample when present, otherwise derived from the
  // detected crown footprints (YOLO boxes) over the AOI area.
  const crownAreaSum = deduped.reduce((s, d) => s + d.crownAreaM2, 0)
  const canopyCoverPct =
    canopySampled > 0
      ? (canopyHit / canopySampled) * 100
      : aoiAreaM2 > 0
        ? Math.min(100, (crownAreaSum / aoiAreaM2) * 100)
        : 0
  const meanCrownDiameterM = deduped.length
    ? deduped.reduce((s, d) => s + d.crownDiameterM, 0) / deduped.length
    : 0

  const classCounts: Record<TreeSizeClass, number> = { small: 0, medium: 0, large: 0 }
  for (const d of deduped) classCounts[d.sizeClass] += 1
  const byClass: TreeClassSummary[] = (Object.keys(TREE_SIZE_CLASS_META) as TreeSizeClass[]).map(id => ({
    id,
    label: TREE_SIZE_CLASS_META[id].label,
    color: TREE_SIZE_CLASS_META[id].color,
    count: classCounts[id],
  }))

  let bySpecies: TreeSpeciesSummary[] | undefined
  if (classifySpecies) {
    const speciesCounts = {} as Record<TreeSpeciesId, number>
    for (const d of deduped) {
      const sp = d.species ?? 'unknown'
      speciesCounts[sp] = (speciesCounts[sp] ?? 0) + 1
    }
    bySpecies = TREE_SPECIES_ORDER.filter(id => (speciesCounts[id] ?? 0) > 0)
      .map(id => ({
        id,
        label: TREE_SPECIES[id].label,
        color: TREE_SPECIES[id].color,
        count: speciesCounts[id] ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: deduped.map(d => {
      const speciesColor = d.species ? TREE_SPECIES[d.species].color : undefined
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: {
          id: d.id,
          kind: 'tree',
          sizeClass: d.sizeClass,
          sizeLabel: TREE_SIZE_CLASS_META[d.sizeClass].label,
          color: speciesColor ?? TREE_SIZE_CLASS_META[d.sizeClass].color,
          vigor: d.vigor,
          confidence: d.confidence,
          crownDiameterM: d.crownDiameterM,
          crownAreaM2: d.crownAreaM2,
          ...(d.species
            ? {
                species: d.species,
                speciesLabel: TREE_SPECIES[d.species].label,
                speciesConfidence: d.speciesConfidence,
              }
            : {}),
        },
      }
    }),
  }

  return {
    detections: deduped,
    geojson,
    generatedAt: Date.now(),
    stats: {
      total: deduped.length,
      aoiAreaHa: Number(aoiAreaHa.toFixed(3)),
      densityPerHa: aoiAreaHa > 0 ? Number((deduped.length / aoiAreaHa).toFixed(1)) : 0,
      canopyCoverPct: Number(canopyCoverPct.toFixed(1)),
      meanCrownDiameterM: Number(meanCrownDiameterM.toFixed(2)),
      byClass,
      bySpecies,
      mode,
      zoom,
      metersPerPixel: Number(metersPerPixel.toFixed(3)),
      provider: options.provider,
      tilesLoaded,
    },
  }
}

/**
 * Run the full pipeline over a single mosaic's YOLO boxes: build the pass
 * and assemble it into a result. Convenience wrapper for single-mosaic use.
 */
export function detectTreesInMosaic(options: DetectTreesOptions): TreeDetectionResult {
  const pass = crownsFromBoxes(options)
  return assembleTreeResult({
    passes: [pass],
    geometry: options.geometry,
    provider: options.provider,
    tuning: options.tuning,
    mode: options.mode,
  })
}

export type { LngLatBBox }
