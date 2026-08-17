/**
 * Tree Detections — Ultralytics YOLO Detection → GIS Point.
 *
 * Esri World Imagery mosaic → YOLO detect (single class `tree`) → bounding box
 * → centre pixel → lng/lat Point. No segmentation and no crown polygons.
 *
 *   Tree_001  ●     attributes: Tree_ID | X | Y | Confidence | Date | Image_Source
 */

import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import type { YoloTreeBox } from './yoloTreeDetectionClient'
import {
  TREE_IMAGERY_PROVIDERS,
  type LngLatBBox,
  type TreeImageryMosaic,
  type TreeImageryProviderId,
} from './webMercatorTiles'
import {
  TREE_SPECIES,
  TREE_SPECIES_ORDER,
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
  date?: string
  imageSource?: string
  /** Optional leftover fields; GIS export does not use crown polygons. */
  crownDiameterM?: number
  crownAreaM2?: number
  sizeClass?: TreeSizeClass
  vigor?: TreeVigor
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
  small: { label: 'Small tree (< 3 m)', color: '#a3e635' },
  medium: { label: 'Medium tree (3–6 m)', color: '#22c55e' },
  large: { label: 'Large tree (> 6 m)', color: '#15803d' },
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

export function formatTreeId(indexZeroBased: number): string {
  return `Tree_${String(indexZeroBased + 1).padStart(3, '0')}`
}

/**
 * Convert YOLO bounding boxes for ONE imagery mosaic into GIS points:
 * box centre → lng/lat, AOI clip. No crown polygon / segmentation.
 */
export function crownsFromBoxes(options: DetectTreesOptions): CrownDetectionPass {
  const { mosaic, boxes } = options
  const geometry =
    (options.geometry as GeoJSON.Feature).type === 'Feature'
      ? (options.geometry as GeoJSON.Feature).geometry
      : (options.geometry as GeoJSON.Geometry)

  const { width, height, metersPerPixel } = mosaic
  const detections: TreeDetection[] = []
  for (const box of boxes) {
    const cxPx = (box.xmin + box.xmax) / 2
    const cyPx = (box.ymin + box.ymax) / 2
    if (cxPx < 0 || cyPx < 0 || cxPx >= width || cyPx >= height) continue
    const [lng, lat] = mosaic.pxToLngLat(cxPx + 0.5, cyPx + 0.5)
    if (!pointInGeometry(lng, lat, geometry)) continue

    detections.push({
      id: formatTreeId(detections.length),
      lng: Number(lng.toFixed(7)),
      lat: Number(lat.toFixed(7)),
      confidence: Number(Math.max(0, Math.min(1, box.score)).toFixed(3)),
    })
  }

  return {
    detections,
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
  const date = new Date().toISOString().slice(0, 10)
  const imageSource = TREE_IMAGERY_PROVIDERS[options.provider]?.label ?? options.provider
  const deduped = dedupeDetections(merged, dedupSpacingM)
    .sort((a, b) => (a.lat === b.lat ? a.lng - b.lng : b.lat - a.lat))
    .map((d, i) => ({
      ...d,
      id: formatTreeId(i),
      date,
      imageSource,
    }))

  const canopySampled = passes.reduce((s, p) => s + p.canopySampled, 0)
  const canopyHit = passes.reduce((s, p) => s + p.canopyHit, 0)
  const metersPerPixel = passes.length ? passes[0]!.metersPerPixel : 0
  const zoom = passes.length ? passes[0]!.zoom : 0
  const tilesLoaded = passes.reduce((s, p) => s + p.tilesLoaded, 0)

  const aoiAreaHa = geodesicAreaM2(geometry) / 10_000
  const aoiAreaM2 = aoiAreaHa * 10_000
  // Canopy cover: legacy grid sample when present, otherwise derived from the
  // detected crown footprints (YOLO boxes) over the AOI area.
  const crownAreaSum = deduped.reduce((s, d) => s + (d.crownAreaM2 ?? 0), 0)
  const canopyCoverPct =
    canopySampled > 0
      ? (canopyHit / canopySampled) * 100
      : aoiAreaM2 > 0
        ? Math.min(100, (crownAreaSum / aoiAreaM2) * 100)
        : 0
  const meanCrownDiameterM = deduped.length
    ? deduped.reduce((s, d) => s + (d.crownDiameterM ?? 0), 0) / deduped.length
    : 0

  const classCounts: Record<TreeSizeClass, number> = { small: 0, medium: 0, large: 0 }
  for (const d of deduped) {
    if (d.sizeClass) classCounts[d.sizeClass] += 1
  }
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
    features: deduped.map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      properties: {
        Tree_ID: d.id,
        X: d.lng,
        Y: d.lat,
        Confidence: d.confidence,
        Date: d.date ?? date,
        Image_Source: d.imageSource ?? imageSource,
        id: d.id,
        confidence: d.confidence,
        kind: 'tree',
      },
    })),
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
