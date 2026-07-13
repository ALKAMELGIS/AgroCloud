import type { GeoBand } from './geoTiffExport'
import type { HydroLegend } from './hydroEngine'
import { worldPxToLngLat } from '../treeDetection/webMercatorTiles'

type DemLike = {
  width: number
  height: number
  pxToLngLat: (px: number, py: number) => [number, number]
}

export function demLikeFromBand(band: GeoBand): DemLike {
  return {
    width: band.width,
    height: band.height,
    pxToLngLat: (px, py) => worldPxToLngLat(band.originWorldPxX + px, band.originWorldPxY + py, band.zoom),
  }
}

function metersPerPixelFromBand(band: GeoBand): number {
  const [, lat0] = worldPxToLngLat(band.originWorldPxX, band.originWorldPxY, band.zoom)
  const [, lat1] = worldPxToLngLat(band.originWorldPxX, band.originWorldPxY + 1, band.zoom)
  const dLat = Math.abs(lat1 - lat0)
  return dLat * 111320
}

function rasterToDataUrl(
  band: GeoBand,
  aoiMask: Uint8Array | null,
  colorAt: (i: number, value: number) => [number, number, number, number],
): string {
  const { width: w, height: h, values } = band
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const data = img.data
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    if (aoiMask && !aoiMask[i]) {
      data[p + 3] = 0
      continue
    }
    const v = values[i]!
    if (!Number.isFinite(v)) {
      data[p + 3] = 0
      continue
    }
    const [r, g, b, a] = colorAt(i, v)
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
    data[p + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

const ASPECT_COLORS: Array<[number, number, number]> = [
  [215, 25, 28],
  [253, 174, 97],
  [255, 255, 191],
  [171, 221, 164],
  [43, 131, 186],
  [37, 52, 148],
]

function aspectColor(deg: number): [number, number, number] {
  const idx = Math.floor(((deg % 360) / 360) * ASPECT_COLORS.length) % ASPECT_COLORS.length
  return ASPECT_COLORS[idx]!
}

const D8_ARROWS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

export function buildAspectDerivedLayer(
  elevBand: GeoBand,
  aoiMask: Uint8Array | null,
): { dataUrl: string; legend: HydroLegend } {
  const { width: w, height: h, values } = elevBand
  const cs = metersPerPixelFromBand(elevBand)
  const aspect = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (values[y * w + xp]! - values[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (values[yp * w + x]! - values[ym * w + x]!) / ((yp - ym) * cs || cs)
      let deg = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI
      if (deg < 0) deg += 360
      aspect[i] = deg
    }
  }
  const band: GeoBand = { ...elevBand, values: aspect, name: 'Aspect (deg)' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    const [r, g, b] = aspectColor(v)
    return [r, g, b, 210]
  })
  return {
    dataUrl,
    legend: {
      title: 'Aspect',
      kind: 'classes',
      swatches: [
        { color: 'rgb(215,25,28)', label: 'E' },
        { color: 'rgb(253,174,97)', label: 'SE' },
        { color: 'rgb(255,255,191)', label: 'S' },
        { color: 'rgb(171,221,164)', label: 'SW' },
        { color: 'rgb(43,131,186)', label: 'W' },
        { color: 'rgb(37,52,148)', label: 'N' },
      ],
      note: 'Terrain orientation (degrees)',
    },
  }
}

export function buildFlowDirectionDerivedLayer(
  elevBand: GeoBand,
  aoiMask: Uint8Array | null,
): { dataUrl: string; legend: HydroLegend } {
  const { width: w, height: h, values } = elevBand
  const cs = metersPerPixelFromBand(elevBand)
  const dirs = new Float32Array(w * h).fill(-1)
  const dist = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      let best = -1
      let bestDrop = 0
      for (let d = 0; d < 8; d += 1) {
        const nx = x + D8_ARROWS[d]![0]!
        const ny = y + D8_ARROWS[d]![1]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const drop = (values[i]! - values[ny * w + nx]!) / (dist[d]! * cs)
        if (drop > bestDrop) {
          bestDrop = drop
          best = d
        }
      }
      dirs[i] = best
    }
  }
  const palette = [
    [255, 255, 255],
    [254, 224, 139],
    [253, 174, 97],
    [252, 141, 89],
    [227, 74, 51],
    [179, 0, 0],
    [127, 0, 0],
    [64, 0, 0],
    [0, 0, 0],
  ]
  const band: GeoBand = { ...elevBand, values: dirs, name: 'Flow direction' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    const idx = v < 0 ? 0 : Math.min(8, v + 1)
    const [r, g, b] = palette[idx]!
    return [r, g, b, 200]
  })
  return {
    dataUrl,
    legend: {
      title: 'Flow direction',
      kind: 'classes',
      swatches: [
        { color: 'rgb(255,255,255)', label: 'Flat / sink' },
        { color: 'rgb(252,141,89)', label: 'D8 drainage' },
        { color: 'rgb(0,0,0)', label: 'Steepest descent' },
      ],
      note: 'Hydrological movement (D8)',
    },
  }
}

export function buildFloodRiskDerivedLayer(
  slopeBand: GeoBand,
  flowBand: GeoBand,
  aoiMask: Uint8Array | null,
): { dataUrl: string; legend: HydroLegend; stats: Array<{ label: string; value: string }> } {
  const n = slopeBand.values.length
  let maxFlow = 1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    maxFlow = Math.max(maxFlow, flowBand.values[i]!)
  }
  const risk = new Float32Array(n)
  const counts = [0, 0, 0, 0]
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) {
      risk[i] = -1
      continue
    }
    const slope = slopeBand.values[i]!
    const flow = flowBand.values[i]!
    const flowT = Math.log(flow + 1) / Math.log(maxFlow + 1)
    let cls = 0
    if (flowT > 0.75 && slope < 8) cls = 3
    else if (flowT > 0.5 && slope < 12) cls = 2
    else if (flowT > 0.25 || slope < 5) cls = 1
    risk[i] = cls
    counts[cls]! += 1
  }
  const colors = [
    [34, 197, 94],
    [250, 204, 21],
    [249, 115, 22],
    [220, 38, 38],
  ]
  const labels = ['Low Risk', 'Moderate Risk', 'High Risk', 'Critical Risk']
  const band: GeoBand = { ...slopeBand, values: risk, name: 'Flood risk' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    const cls = Math.max(0, Math.min(3, Math.round(v)))
    const [r, g, b] = colors[cls]!
    return [r, g, b, 200]
  })
  const total = counts.reduce((a, b) => a + b, 0) || 1
  return {
    dataUrl,
    legend: {
      title: 'Flood risk',
      kind: 'classes',
      swatches: labels.map((label, i) => ({ color: `rgb(${colors[i]!.join(',')})`, label })),
      note: 'Derived from slope + flow accumulation',
    },
    stats: labels.map((label, i) => ({
      label,
      value: `${((counts[i]! / total) * 100).toFixed(1)}%`,
    })),
  }
}

export function buildWetlandDerivedLayer(
  slopeBand: GeoBand,
  flowBand: GeoBand,
  aoiMask: Uint8Array | null,
): { dataUrl: string; legend: HydroLegend; stats: Array<{ label: string; value: string }> } {
  const n = slopeBand.values.length
  let maxFlow = 1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    maxFlow = Math.max(maxFlow, flowBand.values[i]!)
  }
  const wetland = new Float32Array(n)
  let wetlandCells = 0
  let totalCells = 0
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) {
      wetland[i] = -1
      continue
    }
    totalCells += 1
    const slope = slopeBand.values[i]!
    const flow = flowBand.values[i]!
    const flowT = Math.log(flow + 1) / Math.log(maxFlow + 1)
    const isWet = slope < 3 && flowT > 0.35
    wetland[i] = isWet ? 1 : 0
    if (isWet) wetlandCells += 1
  }
  const band: GeoBand = { ...slopeBand, values: wetland, name: 'Wetland potential' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    if (v > 0.5) return [56, 189, 248, 210]
    return [0, 0, 0, 0]
  })
  const pct = totalCells ? (wetlandCells / totalCells) * 100 : 0
  return {
    dataUrl,
    legend: {
      title: 'Wetland potential',
      kind: 'classes',
      swatches: [
        { color: 'rgb(56,189,248)', label: 'Wetland / saturated zone' },
        { color: 'rgba(0,0,0,0)', label: 'Non-wetland' },
      ],
      note: 'Proxy from gentle slope + high accumulation',
    },
    stats: [
      { label: 'Wetland coverage', value: `${pct.toFixed(1)}%` },
      { label: 'Wetland cells', value: wetlandCells.toLocaleString() },
    ],
  }
}

export type SlopeClassRow = { class: string; range: string; areaHa: number; pct: number }

export function buildSlopeClassificationTable(
  slopeBand: GeoBand,
  aoiMask: Uint8Array | null,
  cellAreaM2: number,
): SlopeClassRow[] {
  const bins = [
    { class: 'Flat', min: 0, max: 2 },
    { class: 'Gentle', min: 2, max: 5 },
    { class: 'Moderate', min: 5, max: 15 },
    { class: 'Steep', min: 15, max: 30 },
    { class: 'Very Steep', min: 30, max: Infinity },
  ]
  const counts = bins.map(() => 0)
  let total = 0
  for (let i = 0; i < slopeBand.values.length; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const v = slopeBand.values[i]!
    if (!Number.isFinite(v)) continue
    total += 1
    for (let b = 0; b < bins.length; b += 1) {
      if (v >= bins[b]!.min && v < bins[b]!.max) {
        counts[b]! += 1
        break
      }
    }
  }
  return bins.map((bin, i) => ({
    class: bin.class,
    range: bin.max === Infinity ? `≥ ${bin.min}°` : `${bin.min}° – ${bin.max}°`,
    areaHa: (counts[i]! * cellAreaM2) / 10000,
    pct: total ? (counts[i]! / total) * 100 : 0,
  }))
}

export { buildAoiMask } from './hydroEngine'
