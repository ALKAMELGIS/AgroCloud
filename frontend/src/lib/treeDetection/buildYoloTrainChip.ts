/**
 * Build a YOLO-seg training payload from Tree / Non-Tree training samples
 * georeferenced onto a VHR mosaic canvas.
 */

import type { TrainingSample } from '../trainingAi/trainingSampleStore'
import { isTreeClassName, TREE_CLASS_ID } from './treeSampleWorkflow'
import { lngLatToWorldPx, type TreeImageryMosaic } from './webMercatorTiles'

export type YoloTrainLabelPoly = {
  /** 0 = Tree, 1 = Non-Tree (negatives as background instances when useful) */
  cls: number
  /** Normalized [0,1] polygon ring (closed optional). */
  pts_norm: Array<[number, number]>
}

export type YoloTrainChip = {
  image_png_b64: string
  width: number
  height: number
  labels: YoloTrainLabelPoly[]
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

function mosaicPx(mosaic: TreeImageryMosaic, lng: number, lat: number): [number, number] {
  const [wx, wy] = lngLatToWorldPx(lng, lat, mosaic.zoom)
  return [wx - mosaic.originWorldPxX, wy - mosaic.originWorldPxY]
}

function geomRings(g: GeoJSON.Geometry): number[][][] {
  if (g.type === 'Polygon') return [g.coordinates[0] || []]
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => p[0] || [])
  if (g.type === 'Point') {
    const [lng, lat] = g.coordinates
    const d = 0.00003
    return [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ]
  }
  return []
}

function ringToNormPoly(
  ring: number[][],
  mosaic: TreeImageryMosaic,
): Array<[number, number]> | null {
  if (!ring.length) return null
  const w = Math.max(1, mosaic.width)
  const h = Math.max(1, mosaic.height)
  const out: Array<[number, number]> = []
  for (const pt of ring) {
    const lng = Number(pt[0])
    const lat = Number(pt[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const [px, py] = mosaicPx(mosaic, lng, lat)
    const xn = Math.min(1, Math.max(0, px / w))
    const yn = Math.min(1, Math.max(0, py / h))
    out.push([Number(xn.toFixed(6)), Number(yn.toFixed(6))])
  }
  if (out.length < 3) return null
  // Drop closing duplicate for YOLO label format
  const a = out[0]!
  const b = out[out.length - 1]!
  if (a[0] === b[0] && a[1] === b[1]) out.pop()
  return out.length >= 3 ? out : null
}

/**
 * One chip = full AOI mosaic with Tree (cls 0) and Non-Tree (cls 1) polygons.
 * Returns null when no Tree labels fall on the mosaic.
 */
export function buildYoloTrainChipFromSamples(
  mosaic: TreeImageryMosaic,
  samples: TrainingSample[],
): YoloTrainChip | null {
  const labels: YoloTrainLabelPoly[] = []
  for (const s of samples) {
    const isTree = isTreeClassName(s.class_name) || s.class_id === TREE_CLASS_ID
    if (!isTree) continue
    for (const ring of geomRings(s.geometry)) {
      const pts = ringToNormPoly(ring, mosaic)
      if (!pts) continue
      labels.push({ cls: 0, pts_norm: pts })
    }
  }
  if (!labels.length) return null
  const dataUrl = canvasToPngDataUrl(mosaic.canvas)
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl
  return {
    image_png_b64: b64,
    width: mosaic.width,
    height: mosaic.height,
    labels,
  }
}
