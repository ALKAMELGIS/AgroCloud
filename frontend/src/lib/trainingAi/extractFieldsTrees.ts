/**
 * Shared Training AI extract: FTW parcel fields + YOLO/local crown trees.
 * Used by Fields+Trees, Segmentation, and Object Detection modes.
 */

import * as turf from '@turf/turf'
import {
  detectFieldBoundaries,
  optimizeFieldBoundaryResult,
} from '../agriFieldBoundary/fieldBoundaryClient'
import { detectTreeBoxesLocal } from '../treeDetection/localCrownDetector'
import {
  fetchTreeDetectionConfig,
  predictTreeBoxes,
  type YoloTreeBox,
} from '../treeDetection/yoloTreeDetectionClient'
import {
  mergeFieldsAndTrees,
  type MergedExtractStats,
} from './mergeFieldsAndTrees'
import {
  DelineateAnythingServiceError,
  predictDelineateAnything,
  type DelineateModelKey,
} from './delineateAnythingClient'

export type ExtractBbox = [number, number, number, number]

export type ExtractProgress = (progress: number, stage: string) => void

export type ExtractSample = {
  class_name?: string
  geometry?: GeoJSON.Geometry | null
}

export type FieldsTreesExtractMode = 'fields' | 'trees' | 'both'

export type RunFieldsTreesExtractArgs = {
  bbox: ExtractBbox
  /** Map / Sentinel capture for crown detection (data URL). */
  imageDataUrl?: string | null
  aoi?: GeoJSON.FeatureCollection | GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  confidence?: number
  samples?: ExtractSample[]
  signal?: AbortSignal
  onProgress?: ExtractProgress
  /**
   * `fields` = FTW parcels only.
   * `trees` = YOLO tree crowns only (requires tree-detection service).
   * `both` = legacy combined extract.
   */
  mode?: FieldsTreesExtractMode
  /** When true (default for `trees` mode), do not fall back to localCrown. */
  requireYolo?: boolean
}

export type RunFieldsTreesExtractResult = {
  geojson: GeoJSON.FeatureCollection
  stats: MergedExtractStats
  primary_class: string
  engine: string
}

const TREE_COLOR = '#22c55e'

function report(cb: ExtractProgress | undefined, progress: number, stage: string) {
  cb?.(Math.max(0, Math.min(100, progress)), stage)
}

/** Approx meters-per-pixel from WGS84 bbox and raster size. */
export function metersPerPixelFromBbox(bbox: ExtractBbox, width: number, height: number): number {
  const [west, south, east, north] = bbox
  const midLat = (south + north) / 2
  const mPerDegLat = 111_320
  const mPerDegLon = 111_320 * Math.cos((midLat * Math.PI) / 180)
  const widthM = Math.max(1e-6, (east - west) * Math.max(1e-6, mPerDegLon))
  const heightM = Math.max(1e-6, (north - south) * mPerDegLat)
  const mppX = widthM / Math.max(1, width)
  const mppY = heightM / Math.max(1, height)
  return Math.max(0.05, (mppX + mppY) / 2)
}

export function pxToLonLat(
  x: number,
  y: number,
  bbox: ExtractBbox,
  width: number,
  height: number,
): [number, number] {
  const [west, south, east, north] = bbox
  const lon = west + (x / Math.max(1, width - 1)) * (east - west)
  const lat = north - (y / Math.max(1, height - 1)) * (north - south)
  return [lon, lat]
}

export async function loadImageDataFromDataUrl(
  dataUrl: string,
): Promise<{ imageData: ImageData; width: number; height: number; canvas: HTMLCanvasElement }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not decode capture image for tree detection.'))
    el.src = dataUrl
  })
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable for tree detection.')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { imageData, width, height, canvas }
}

/** Circular crown polygon from a pixel box. */
export function boxToCrownFeature(
  box: YoloTreeBox,
  bbox: ExtractBbox,
  width: number,
  height: number,
  mpp: number,
  index: number,
  source: string,
): GeoJSON.Feature | null {
  const cx = (box.xmin + box.xmax) / 2
  const cy = (box.ymin + box.ymax) / 2
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null
  const [lon, lat] = pxToLonLat(cx, cy, bbox, width, height)
  const diamPx = Math.max(1, (box.xmax - box.xmin + box.ymax - box.ymin) / 2)
  const radiusM = Math.max(1.2, Math.min(18, (diamPx * mpp) / 2))
  try {
    const circle = turf.circle([lon, lat], radiusM, { steps: 24, units: 'meters' })
    return {
      type: 'Feature',
      properties: {
        class_name: 'Tree',
        label: 'Tree',
        confidence: Number(box.score) || 0.5,
        color: TREE_COLOR,
        output_type: 'fields_trees',
        source,
        instance_id: index + 1,
        crown_radius_m: Math.round(radiusM * 10) / 10,
      },
      geometry: circle.geometry,
    }
  } catch {
    return null
  }
}

export function isTreeSampleClass(name: string | null | undefined): boolean {
  return /\btree\b|trees|crown|canopy|orchard|mangrove/i.test(String(name || '').trim())
}

/** Promote Tree training samples to crown circles (and keep polygon samples). */
export function treeCrownsFromSamples(
  samples: ExtractSample[] | null | undefined,
  bbox: ExtractBbox,
  opts?: { radiusM?: number },
): GeoJSON.Feature[] {
  const radiusM = opts?.radiusM ?? 5.5
  const [west, south, east, north] = bbox
  const out: GeoJSON.Feature[] = []
  let i = 0
  for (const s of samples || []) {
    if (!isTreeSampleClass(s?.class_name) || !s.geometry) continue
    const g = s.geometry
    try {
      if (g.type === 'Point') {
        const [lon, lat] = g.coordinates as [number, number]
        if (lon < west || lon > east || lat < south || lat > north) continue
        const circle = turf.circle([lon, lat], radiusM, { steps: 20, units: 'meters' })
        i += 1
        out.push({
          type: 'Feature',
          properties: {
            class_name: 'Tree',
            label: 'Tree',
            confidence: 0.92,
            color: TREE_COLOR,
            output_type: 'fields_trees',
            source: 'sample',
            instance_id: i,
          },
          geometry: circle.geometry,
        })
      } else if (g.type === 'MultiPoint') {
        for (const pt of g.coordinates as [number, number][]) {
          const [lon, lat] = pt
          if (lon < west || lon > east || lat < south || lat > north) continue
          const circle = turf.circle([lon, lat], radiusM, { steps: 20, units: 'meters' })
          i += 1
          out.push({
            type: 'Feature',
            properties: {
              class_name: 'Tree',
              label: 'Tree',
              confidence: 0.92,
              color: TREE_COLOR,
              output_type: 'fields_trees',
              source: 'sample',
              instance_id: i,
            },
            geometry: circle.geometry,
          })
        }
      } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const c = turf.centroid({ type: 'Feature', properties: {}, geometry: g })
        const [lon, lat] = c.geometry.coordinates
        if (lon < west || lon > east || lat < south || lat > north) continue
        i += 1
        out.push({
          type: 'Feature',
          properties: {
            class_name: 'Tree',
            label: 'Tree',
            confidence: 0.9,
            color: TREE_COLOR,
            output_type: 'fields_trees',
            source: 'sample',
            instance_id: i,
          },
          geometry: g,
        })
      }
    } catch {
      /* skip bad sample */
    }
  }
  return out
}

/** Drop crowns closer than minSpacingM (keep higher confidence). */
export function dedupeTreeCrowns(features: GeoJSON.Feature[], minSpacingM = 3): GeoJSON.Feature[] {
  const sorted = [...features].sort(
    (a, b) => Number(b.properties?.confidence || 0) - Number(a.properties?.confidence || 0),
  )
  const kept: GeoJSON.Feature[] = []
  for (const f of sorted) {
    let c: GeoJSON.Feature | null = null
    try {
      c = turf.centroid(f as any)
    } catch {
      continue
    }
    const tooClose = kept.some(k => {
      try {
        const kc = turf.centroid(k as any)
        return turf.distance(c!, kc, { units: 'meters' }) < minSpacingM
      } catch {
        return false
      }
    })
    if (!tooClose) kept.push(f)
  }
  return kept
}

/** IoU of two axis-aligned boxes. */
export function boxIoU(a: YoloTreeBox, b: YoloTreeBox): number {
  const ix1 = Math.max(a.xmin, b.xmin)
  const iy1 = Math.max(a.ymin, b.ymin)
  const ix2 = Math.min(a.xmax, b.xmax)
  const iy2 = Math.min(a.ymax, b.ymax)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  if (inter <= 0) return 0
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin)
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin)
  const uni = areaA + areaB - inter
  return uni > 0 ? inter / uni : 0
}

/** Greedy NMS (keep highest score). */
export function nmsTreeBoxes(boxes: YoloTreeBox[], iouThresh = 0.4): YoloTreeBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score)
  const kept: YoloTreeBox[] = []
  for (const box of sorted) {
    if (kept.some(k => boxIoU(k, box) >= iouThresh)) continue
    kept.push(box)
  }
  return kept
}

/** Tile (+ optional upscale) YOLO detect so coarse map RGB still yields trees. */
async function predictTreeBoxesEnhanced(
  canvas: HTMLCanvasElement,
  opts: { score: number; metersPerPixel: number; signal?: AbortSignal },
): Promise<YoloTreeBox[]> {
  const scale = opts.metersPerPixel >= 2.2 ? 2 : opts.metersPerPixel >= 1.4 ? 1.5 : 1
  let work = canvas
  if (scale > 1) {
    const up = document.createElement('canvas')
    up.width = Math.round(canvas.width * scale)
    up.height = Math.round(canvas.height * scale)
    const ctx = up.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(canvas, 0, 0, up.width, up.height)
      work = up
    }
  }

  const tileSize = 640
  const overlap = 0.28
  const w = work.width
  const h = work.height
  const stride = Math.max(64, Math.floor(tileSize * (1 - overlap)))
  const raw: YoloTreeBox[] = []

  const runTile = async (sx: number, sy: number, tw: number, th: number) => {
    const tile = document.createElement('canvas')
    tile.width = tw
    tile.height = th
    const tctx = tile.getContext('2d')
    if (!tctx) return
    tctx.drawImage(work, sx, sy, tw, th, 0, 0, tw, th)
    const boxes = await predictTreeBoxes(tile, {
      score: opts.score,
      metersPerPixel: opts.metersPerPixel,
      signal: opts.signal,
      engine: 'yolo',
    })
    for (const b of boxes) {
      raw.push({
        ...b,
        xmin: b.xmin + sx,
        ymin: b.ymin + sy,
        xmax: b.xmax + sx,
        ymax: b.ymax + sy,
      })
    }
  }

  if (w <= tileSize && h <= tileSize) {
    await runTile(0, 0, w, h)
  } else {
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const tw = Math.min(tileSize, w - x)
        const th = Math.min(tileSize, h - y)
        if (tw < 48 || th < 48) continue
        await runTile(x, y, tw, th)
      }
    }
    if (w > tileSize) {
      for (let y = 0; y < h; y += stride) {
        const th = Math.min(tileSize, h - y)
        await runTile(Math.max(0, w - tileSize), y, Math.min(tileSize, w), th)
      }
    }
    if (h > tileSize) {
      for (let x = 0; x < w; x += stride) {
        const tw = Math.min(tileSize, w - x)
        await runTile(x, Math.max(0, h - tileSize), tw, Math.min(tileSize, h))
      }
    }
  }

  let merged = nmsTreeBoxes(raw, 0.35)

  // Extra soft recall when the primary pass under-detects dense canopies
  if (merged.length < 12 && opts.score > 0.12) {
    const soft = Math.max(0.1, Math.min(0.15, opts.score * 0.55))
    if (soft + 0.02 < opts.score) {
      const softRaw: YoloTreeBox[] = []
      const pushSoft = async (sx: number, sy: number, tw: number, th: number) => {
        const tile = document.createElement('canvas')
        tile.width = tw
        tile.height = th
        const tctx = tile.getContext('2d')
        if (!tctx) return
        tctx.drawImage(work, sx, sy, tw, th, 0, 0, tw, th)
        const boxes = await predictTreeBoxes(tile, {
          score: soft,
          signal: opts.signal,
          engine: 'yolo',
        })
        for (const b of boxes) {
          softRaw.push({
            ...b,
            xmin: b.xmin + sx,
            ymin: b.ymin + sy,
            xmax: b.xmax + sx,
            ymax: b.ymax + sy,
          })
        }
      }
      if (w <= tileSize && h <= tileSize) {
        await pushSoft(0, 0, w, h)
      } else {
        for (let y = 0; y < h; y += stride) {
          for (let x = 0; x < w; x += stride) {
            const tw = Math.min(tileSize, w - x)
            const th = Math.min(tileSize, h - y)
            if (tw < 48 || th < 48) continue
            await pushSoft(x, y, tw, th)
          }
        }
      }
      merged = nmsTreeBoxes([...merged, ...softRaw], 0.35)
    }
  }

  if (scale === 1) return merged
  return merged.map(b => ({
    ...b,
    xmin: b.xmin / scale,
    ymin: b.ymin / scale,
    xmax: b.xmax / scale,
    ymax: b.ymax / scale,
  }))
}

async function detectCrownBoxes(opts: {
  imageDataUrl: string
  bbox: ExtractBbox
  score: number
  signal?: AbortSignal
  /** Fail instead of using localCrown when YOLO is unavailable. */
  requireYolo?: boolean
}): Promise<{ boxes: YoloTreeBox[]; source: string; width: number; height: number; mpp: number }> {
  const { imageData, width, height, canvas } = await loadImageDataFromDataUrl(opts.imageDataUrl)
  const mpp = metersPerPixelFromBbox(opts.bbox, width, height)
  const score = Math.max(0.1, Math.min(0.55, opts.score))

  const cfg = await fetchTreeDetectionConfig(opts.signal)
  if (!cfg.configured) {
    if (opts.requireYolo) {
      throw new Error(
        'YOLO tree model is not configured. Start backend/services/tree-detection and set TREE_DETECTION_URL on the API.',
      )
    }
  } else {
    try {
      const boxes = await predictTreeBoxesEnhanced(canvas, {
        score,
        metersPerPixel: mpp,
        signal: opts.signal,
      })
      return { boxes, source: 'yolo', width, height, mpp }
    } catch (err) {
      if (opts.requireYolo) {
        throw err instanceof Error
          ? err
          : new Error('YOLO tree detection failed. Check the tree-detection service.')
      }
      /* fall through to local */
    }
  }

  if (opts.requireYolo) {
    throw new Error(
      'YOLO tree model returned no detections and local fallback is disabled for Trees mode.',
    )
  }

  const boxes = detectTreeBoxesLocal(imageData, {
    score,
    metersPerPixel: mpp,
    typicalCrownRadiusM: 2.4,
    minTreeSpacingM: 3.0,
    minCrownDiameterM: 1.4,
    maxCrownDiameterM: 22,
  })
  return { boxes, source: 'local_crown', width, height, mpp }
}

/**
 * Run FTW parcel fields and/or YOLO tree crown extraction for Training AI Infer.
 */
export async function runFieldsTreesExtract(
  args: RunFieldsTreesExtractArgs,
): Promise<RunFieldsTreesExtractResult> {
  const mode: FieldsTreesExtractMode = args.mode || 'both'
  const wantFields = mode === 'fields' || mode === 'both'
  const wantTrees = mode === 'trees' || mode === 'both'
  const requireYolo = args.requireYolo ?? mode === 'trees'

  const confidence = Number.isFinite(args.confidence) ? Number(args.confidence) : 0.4
  const ftwMinConfidence = Math.max(0.35, confidence)
  // Pass user threshold through (was capped at 0.45 which hid many crowns).
  const crownScore = Math.min(0.55, Math.max(0.1, confidence))

  let fieldsFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  let engine = 'none'
  let crownSource = 'none'
  const detectedCrowns: GeoJSON.Feature[] = []

  if (wantFields) {
    report(args.onProgress, 5, 'FTW parcel fields…')
    engine = 'ftw-live'
    const ftwBase = {
      bbox: args.bbox,
      minAreaM2: 250,
      minConfidence: ftwMinConfidence,
      ...(args.aoi ? { aoi: args.aoi } : {}),
      signal: args.signal,
    } as const

    try {
      const raw = await detectFieldBoundaries(
        { ...ftwBase, source: 'ftw-live' },
        (p, stage) => report(args.onProgress, 5 + p * 0.55, `FTW · ${stage || 'detecting'}`),
      )
      const opt = optimizeFieldBoundaryResult(raw, {
        regularizeFootprints: true,
        minFillRatio: 0.66,
        maxAreaInflation: 1.55,
        softenKept: true,
      })
      fieldsFc = opt.geojson
      engine = opt.engine || engine
    } catch (ftwErr) {
      report(args.onProgress, 20, 'FTW fields (fallback)…')
      try {
        const raw = await detectFieldBoundaries(
          { ...ftwBase, source: 'ftw-infer' },
          (p, stage) => report(args.onProgress, 20 + p * 0.45, `FTW · ${stage || 'detecting'}`),
        )
        const opt = optimizeFieldBoundaryResult(raw, {
          regularizeFootprints: true,
          minFillRatio: 0.66,
          maxAreaInflation: 1.55,
          softenKept: true,
        })
        fieldsFc = opt.geojson
        engine = opt.engine || 'ftw-infer'
      } catch {
        throw new Error(
          (ftwErr as Error)?.message ||
            'Field extraction failed. Start agri-field-boundary (:8092) and retry.',
        )
      }
    }
  }

  if (wantTrees) {
    report(args.onProgress, wantFields ? 62 : 10, 'YOLO tree crowns…')
    if (!args.imageDataUrl) {
      throw new Error(
        'Tree detect needs a map capture. Wait for Sentinel-2 / basemap to load, then retry.',
      )
    }
    try {
      const { boxes, source, width, height, mpp } = await detectCrownBoxes({
        imageDataUrl: args.imageDataUrl,
        bbox: args.bbox,
        score: crownScore,
        signal: args.signal,
        requireYolo,
      })
      crownSource = source
      boxes.forEach((box, i) => {
        const f = boxToCrownFeature(box, args.bbox, width, height, mpp, i, source)
        if (f) {
          if (f.properties) f.properties.output_type = mode === 'trees' ? 'trees' : 'fields_trees'
          detectedCrowns.push(f)
        }
      })
    } catch (err) {
      if (requireYolo || mode === 'trees') throw err
      crownSource = 'crown_failed'
    }

    // Include Tree training samples as soft crowns (Trees + Fields+Trees modes)
    if (mode === 'both' || mode === 'trees') {
      report(args.onProgress, 82, 'merge sample trees…')
      const sampleCrowns = treeCrownsFromSamples(args.samples, args.bbox)
      for (const f of sampleCrowns) {
        if (f.properties) f.properties.output_type = mode === 'trees' ? 'trees' : 'fields_trees'
      }
      detectedCrowns.push(...sampleCrowns)
    }
  }

  const trees = wantTrees ? dedupeTreeCrowns(detectedCrowns, mode === 'trees' ? 2.2 : 3) : []
  // Tag tree output_type for dedicated Trees mode
  if (mode === 'trees') {
    for (const f of trees) {
      if (f.properties) f.properties.output_type = 'trees'
    }
  }

  report(args.onProgress, 92, wantFields ? 'cleanup parcels…' : 'finalize trees…')
  const merged = mergeFieldsAndTrees({
    fields: wantFields ? fieldsFc : { type: 'FeatureCollection', features: [] },
    trees: { type: 'FeatureCollection', features: trees },
    engine: wantFields && wantTrees ? `${engine}+${crownSource}` : wantTrees ? crownSource : engine,
    fieldCleanup: wantFields
      ? {
          fieldBoundarySamples: args.samples,
        }
      : false,
  })

  // Fix output_type on fields for dedicated Fields mode
  if (mode === 'fields') {
    for (const f of merged.geojson.features) {
      if (f.properties && /\bfield\b/i.test(String(f.properties.class_name || ''))) {
        f.properties.output_type = 'fields'
      }
    }
  } else if (mode === 'trees') {
    for (const f of merged.geojson.features) {
      if (f.properties) f.properties.output_type = 'trees'
    }
  }

  return {
    geojson: merged.geojson,
    stats: merged.stats,
    primary_class: merged.primary_class,
    engine: merged.stats.engine,
  }
}

export type RunDelineateFieldsExtractArgs = {
  bbox: ExtractBbox
  imageDataUrl: string
  confidence?: number
  /** Default `v2` (DelineateAnythingv2.pt). `fbis22m` auto-falls back if empty. */
  model?: DelineateModelKey | string
  minAreaM2?: number
  signal?: AbortSignal
  onProgress?: ExtractProgress
}

/**
 * Delineate Anything instance segmentation (FBIS lineage / v2 fallback).
 * Prefer this when FTW stair-step edges don't match drawn training samples.
 */
export async function runDelineateFieldsExtract(
  args: RunDelineateFieldsExtractArgs,
): Promise<RunFieldsTreesExtractResult> {
  if (!args.imageDataUrl) {
    throw new DelineateAnythingServiceError(
      'Delineate Anything needs a map capture. Wait for Sentinel-2 / basemap to load, then retry.',
    )
  }

  report(args.onProgress, 8, 'Delineate Anything…')
  // UI often defaults to 0.40 which is too high for DA on Sentinel mosaics.
  const rawConf = Number.isFinite(args.confidence) ? Number(args.confidence) : 0.25
  const confidence = Math.max(0.1, Math.min(0.35, rawConf))
  const model = args.model || 'v2'

  let result
  try {
    result = await predictDelineateAnything({
      imageDataUrl: args.imageDataUrl,
      bbox: args.bbox,
      confidence,
      model,
      minAreaM2: args.minAreaM2 ?? 50,
      signal: args.signal,
    })
    // Client-side soft retry if backend returned empty without raising.
    if (!result.count && confidence > 0.12) {
      report(args.onProgress, 45, 'Retrying at lower confidence…')
      result = await predictDelineateAnything({
        imageDataUrl: args.imageDataUrl,
        bbox: args.bbox,
        confidence: 0.12,
        model: 'v2',
        minAreaM2: 40,
        signal: args.signal,
      })
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    if (err instanceof DelineateAnythingServiceError) throw err
    throw new DelineateAnythingServiceError(
      (err as Error)?.message || 'Delineate Anything failed.',
    )
  }

  report(args.onProgress, 88, 'Preparing field polygons…')

  const features = (result.geojson?.features || []).map((f, i) => {
    const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<
      string,
      unknown
    >
    return {
      ...f,
      properties: {
        ...props,
        class_name: props.class_name || 'Field',
        label: props.label || 'Field',
        output_type: 'fields_fbis',
        engine: result.engine || 'delineate-anything',
        model: result.model || result.model_key || model,
        fill_color: props.fill_color || props.fill || '#eab308',
        stroke_color: props.stroke_color || '#0a0a0a',
        id: props.id ?? `da-field-${i + 1}`,
        stroke: props.stroke || '#0a0a0a',
        fill: props.fill || props.fill_color || '#eab308',
        'fill-opacity': props['fill-opacity'] ?? 0.35,
      },
    }
  })

  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  const n = features.length
  const stats: MergedExtractStats = {
    fields: n,
    trees: 0,
    other: 0,
    total: n,
    engine: result.engine || 'delineate-anything',
  }

  report(args.onProgress, 100, 'done')
  return {
    geojson,
    stats,
    primary_class: 'Field',
    engine: stats.engine,
  }
}

export type ParcelExtractMode =
  | 'fields'
  | 'fields_fbis'
  | 'trees'
  | 'fields_trees'
  | 'segmentation'
  | 'object_detection'

/** Modes that use FTW / YOLO / Delineate extract (not SegFormer classification). */
export function isParcelExtractMode(mode: string): mode is ParcelExtractMode {
  return (
    mode === 'fields' ||
    mode === 'fields_fbis' ||
    mode === 'trees' ||
    mode === 'fields_trees' ||
    mode === 'segmentation' ||
    mode === 'object_detection'
  )
}

export function isDelineateFieldsMode(mode: string): boolean {
  return mode === 'fields_fbis'
}

/** Map UI output type → extract mode. */
export function extractModeForOutputType(mode: string): FieldsTreesExtractMode {
  if (mode === 'trees') return 'trees'
  if (mode === 'fields' || mode === 'segmentation') return 'fields'
  if (mode === 'fields_trees') return 'both'
  if (mode === 'object_detection') return 'trees'
  return 'fields'
}

export function parcelLayerTitle(
  mode: ParcelExtractMode | string,
  fields: number,
  trees: number,
): string {
  if (mode === 'trees' || mode === 'object_detection') {
    return `AI Trees (YOLO) — ${trees} trees`
  }
  if (mode === 'fields_fbis') {
    return `AI Fields (Delineate Anything) — ${fields} fields`
  }
  if (mode === 'fields' || mode === 'segmentation') {
    return `AI Fields (FTW) — ${fields} fields`
  }
  return `AI Parcel fields+trees — ${fields} fields · ${trees} trees`
}
