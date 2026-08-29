/**
 * Visual Seamless Rendering for FTW global PMTiles preview.
 * Tiles stay separate in the GeoJSON source; display paints one union raster so
 * tile-boundary lines and stacked fill opacity never show on the map.
 */

import { FTW_CONFIDENCE_MAX, ftwThresholdToRaw } from './ftwGlobalConfig'
import type { LngLatBbox } from './ftwPmtilesFeatures'
import { postProcessFtwSeamlessCanvas } from './ftwVisualSeamlessPostProcess'

const DEFAULT_MAX_EDGE = 2048

type Rgb = [number, number, number]

const CONFIDENCE_STOPS: Array<{ t: number; rgb: Rgb }> = [
  { t: 0, rgb: [215, 25, 28] },
  { t: ftwThresholdToRaw(70), rgb: [254, 195, 121] },
  { t: ftwThresholdToRaw(80), rgb: [207, 236, 176] },
  { t: FTW_CONFIDENCE_MAX, rgb: [51, 160, 44] },
]

export type FtwVisualSeamlessRaster = {
  dataUrl: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
}

function extractPolygonRings(f: GeoJSON.Feature): GeoJSON.Position[][] {
  const g = f.geometry
  if (!g) return []
  if (g.type === 'Polygon') return g.coordinates?.length ? [g.coordinates[0]!] : []
  if (g.type === 'MultiPolygon') {
    return (g.coordinates ?? [])
      .map(p => p?.[0])
      .filter((r): r is GeoJSON.Position[] => Array.isArray(r) && r.length >= 4)
  }
  return []
}

function featureConfidence(f: GeoJSON.Feature): number {
  const p = (f.properties ?? {}) as Record<string, unknown>
  const c = Number(p.confidence_mean ?? p.confidence ?? 0)
  return Number.isFinite(c) ? c : 0
}

function confidenceToRgb(conf: number): Rgb {
  const clamped = Math.max(0, Math.min(FTW_CONFIDENCE_MAX, conf))
  for (let i = 1; i < CONFIDENCE_STOPS.length; i++) {
    const hi = CONFIDENCE_STOPS[i]!
    const lo = CONFIDENCE_STOPS[i - 1]!
    if (clamped <= hi.t) {
      const span = Math.max(hi.t - lo.t, 1e-9)
      const u = (clamped - lo.t) / span
      return [
        Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * u),
        Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * u),
        Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * u),
      ]
    }
  }
  return CONFIDENCE_STOPS[CONFIDENCE_STOPS.length - 1]!.rgb
}

function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}

function canvasSizeForBbox(bbox: LngLatBbox, maxEdge: number): { width: number; height: number } {
  const [west, south, east, north] = bbox
  const lonSpan = Math.max(east - west, 1e-9)
  const latSpan = Math.max(north - south, 1e-9)
  const aspect = lonSpan / latSpan

  let width = maxEdge
  let height = Math.max(1, Math.round(maxEdge / aspect))
  if (height > maxEdge) {
    height = maxEdge
    width = Math.max(1, Math.round(maxEdge * aspect))
  }
  return { width, height }
}

/** Paint FTW polygons into one canvas (union fill) — no tile seam lines. */
export function buildFtwVisualSeamlessRaster(
  features: GeoJSON.Feature[],
  bbox: LngLatBbox,
  maxEdge = DEFAULT_MAX_EDGE,
): FtwVisualSeamlessRaster | null {
  if (!features.length) return null

  const [west, south, east, north] = bbox
  const lonSpan = Math.max(east - west, 1e-9)
  const latSpan = Math.max(north - south, 1e-9)
  const { width, height } = canvasSizeForBbox(bbox, maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, width, height)

  const toPx = (lng: number, lat: number): [number, number] => [
    ((lng - west) / lonSpan) * width,
    ((north - lat) / latSpan) * height,
  ]

  const sorted = [...features].sort((a, b) => featureConfidence(a) - featureConfidence(b))

  for (const f of sorted) {
    const rgb = confidenceToRgb(featureConfidence(f))
    ctx.fillStyle = rgbToCss(rgb)
    for (const ring of extractPolygonRings(f)) {
      if (ring.length < 4) continue
      ctx.beginPath()
      ring.forEach(([lng, lat], idx) => {
        const [x, y] = toPx(lng, lat)
        if (idx === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.fill('evenodd')
    }
  }

  // Heal 1px tile-cut gaps so basemap does not show through as a grid.
  postProcessFtwSeamlessCanvas(canvas)

  const coordinates: FtwVisualSeamlessRaster['coordinates'] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]

  return { dataUrl: canvas.toDataURL('image/png'), coordinates }
}
