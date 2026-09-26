import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { ensureDemPxToLngLat } from './cutFillEngine'

export type CutFillPolygonVisibility = {
  cut: boolean
  fill: boolean
  noChange: boolean
}

type ClassCode = 0 | 1 | 2

const MAX_EDGE = 140

function blockClass(
  classification: Uint8Array,
  difference: Float32Array,
  width: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  visible: CutFillPolygonVisibility,
): ClassCode | null {
  let cut = 0
  let fill = 0
  let none = 0
  for (let y = y0; y < y1; y += 1) {
    const row = y * width
    for (let x = x0; x < x1; x += 1) {
      const i = row + x
      if (!Number.isFinite(difference[i]!)) continue
      const code = classification[i] ?? 0
      if (code === 1) cut += 1
      else if (code === 2) fill += 1
      else none += 1
    }
  }
  if (cut === 0 && fill === 0 && none === 0) return null
  if (cut >= fill && cut >= none && cut > 0) return visible.cut ? 1 : null
  if (fill >= none && fill > 0) return visible.fill ? 2 : null
  return visible.noChange ? 0 : null
}

/**
 * Fill polygons for the classification grid, in the same Web Mercator pixel
 * frame as the analysis. Horizontal runs of one class become one quad so a
 * solid FILL disk stays a solid disk on the globe (image/raster sources do not).
 */
export function buildCutFillClassPolygons(
  dem: DemGrid,
  classification: Uint8Array,
  difference: Float32Array,
  visible: CutFillPolygonVisibility,
  maxEdge = MAX_EDGE,
): GeoJSON.FeatureCollection {
  const grid = ensureDemPxToLngLat(dem)
  const { width, height, pxToLngLat } = grid
  const stepX = Math.max(1, Math.ceil(width / maxEdge))
  const stepY = Math.max(1, Math.ceil(height / maxEdge))
  const rings: Record<ClassCode, number[][][][]> = { 0: [], 1: [], 2: [] }

  for (let y0 = 0; y0 < height; y0 += stepY) {
    const y1 = Math.min(height, y0 + stepY)
    let run: { cls: ClassCode; x0: number } | null = null
    const flush = (x1: number) => {
      if (!run) return
      const nw = pxToLngLat(run.x0, y0)
      const sw = pxToLngLat(run.x0, y1)
      const se = pxToLngLat(x1, y1)
      const ne = pxToLngLat(x1, y0)
      rings[run.cls].push([[[nw[0], nw[1]], [sw[0], sw[1]], [se[0], se[1]], [ne[0], ne[1]], [nw[0], nw[1]]]])
      run = null
    }
    for (let x0 = 0; x0 < width; x0 += stepX) {
      const x1 = Math.min(width, x0 + stepX)
      const cls = blockClass(classification, difference, width, x0, x1, y0, y1, visible)
      if (cls == null) {
        flush(x0)
        continue
      }
      if (run && run.cls === cls) continue
      flush(x0)
      run = { cls, x0 }
    }
    flush(width)
  }

  const features: GeoJSON.Feature[] = []
  const push = (cls: ClassCode) => {
    if (!rings[cls].length) return
    features.push({
      type: 'Feature',
      properties: { cls },
      geometry: { type: 'MultiPolygon', coordinates: rings[cls] },
    })
  }
  push(1)
  push(2)
  push(0)
  return { type: 'FeatureCollection', features }
}
