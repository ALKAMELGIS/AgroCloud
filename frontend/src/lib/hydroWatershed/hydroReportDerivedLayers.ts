import type { GeoBand } from './geoTiffExport'
import type { HydroLegend } from './hydroEngine'
import { worldPxToLngLat } from '../treeDetection/webMercatorTiles'
import {
  buildEsriD8FlowDirectionLegend,
  ESRI_D8_DIST,
  ESRI_D8_DX,
  ESRI_D8_DY,
  ESRI_D8_MAP_ALPHA,
  esriD8CodeFromDirIndex,
  esriD8RgbFromDirIndex,
  ESRI_D8_NODATA_RGB,
} from './hydroFlowDirectionStyle'

/** Class row with absolute area and share of the AOI. */
export type HydroAreaClassRow = { label: string; areaHa: number; pct: number }

export type SlopeClassRow = { class: string; range: string; areaHa: number; pct: number }

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
  /** ESRI D8 codes (1…128) or 0 = flat/sink. */
  const codes = new Float32Array(w * h).fill(0)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      let best = -1
      let bestDrop = 0
      for (let d = 0; d < 8; d += 1) {
        const nx = x + ESRI_D8_DX[d]!
        const ny = y + ESRI_D8_DY[d]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const drop = (values[i]! - values[ny * w + nx]!) / (ESRI_D8_DIST[d]! * cs)
        if (drop > bestDrop) {
          bestDrop = drop
          best = d
        }
      }
      codes[i] = best < 0 ? 0 : esriD8CodeFromDirIndex(best)
    }
  }
  const band: GeoBand = { ...elevBand, values: codes, name: 'Flow direction (ESRI D8)' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    if (!(v > 0)) {
      const [r, g, b] = ESRI_D8_NODATA_RGB
      return [r, g, b, Math.round(ESRI_D8_MAP_ALPHA * 0.55)]
    }
    // Map code → dir index via known powers of two.
    const dirIndex = Math.round(Math.log2(v))
    const [r, g, b] = esriD8RgbFromDirIndex(dirIndex)
    return [r, g, b, ESRI_D8_MAP_ALPHA]
  })
  return {
    dataUrl,
    legend: buildEsriD8FlowDirectionLegend(),
  }
}

/** High-contrast flood-risk palette — readable on Esri World Imagery. */
const FLOOD_RISK_COLORS: Array<[number, number, number]> = [
  [30, 130, 76], // Low — strong green
  [255, 193, 7], // Moderate — vivid amber (not washed yellow)
  [255, 87, 34], // High — saturated orange
  [183, 28, 28], // Critical — deep crimson
]

const FLOOD_RISK_ALPHA = [155, 195, 220, 240] as const

const FLOOD_RISK_LABELS = ['Low Risk', 'Moderate Risk', 'High Risk', 'Critical Risk'] as const

/** 3×3 majority filter — removes salt-and-pepper noise so risk zones read as clear patches. */
function majoritySmoothRiskClasses(
  risk: Float32Array,
  width: number,
  height: number,
  aoiMask: Uint8Array | null,
): Float32Array {
  const out = new Float32Array(risk.length)
  const counts = [0, 0, 0, 0]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (aoiMask && !aoiMask[i]) {
        out[i] = -1
        continue
      }
      counts[0] = counts[1] = counts[2] = counts[3] = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const ni = ny * width + nx
          if (aoiMask && !aoiMask[ni]) continue
          const c = risk[ni]!
          if (c < 0 || c > 3) continue
          counts[c | 0]! += 1
        }
      }
      let best = Math.max(0, Math.min(3, Math.round(risk[i]!)))
      let bestN = -1
      // Prefer higher risk on ties so corridors stay visible.
      for (let c = 0; c < 4; c += 1) {
        const n = counts[c]!
        if (n > bestN || (n === bestN && c > best)) {
          bestN = n
          best = c
        }
      }
      out[i] = best
    }
  }
  return out
}

/** Grow High/Critical by 1 cell so thin flow corridors remain readable at report scale. */
function dilateElevatedRisk(
  risk: Float32Array,
  width: number,
  height: number,
  aoiMask: Uint8Array | null,
  minClass = 2,
): Float32Array {
  const out = risk.slice()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (aoiMask && !aoiMask[i]) continue
      const self = risk[i]!
      if (self >= minClass) continue
      let elev = self
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const ni = ny * width + nx
          if (aoiMask && !aoiMask[ni]) continue
          elev = Math.max(elev, risk[ni]!)
        }
      }
      if (elev >= minClass) out[i] = elev
    }
  }
  return out
}

export function buildFloodRiskDerivedLayer(
  slopeBand: GeoBand,
  flowBand: GeoBand,
  aoiMask: Uint8Array | null,
  aoiAreaHa?: number,
): {
  dataUrl: string
  legend: HydroLegend
  stats: Array<{ label: string; value: string }>
  classRows: HydroAreaClassRow[]
} {
  const n = slopeBand.values.length
  const w = slopeBand.width
  const h = slopeBand.height
  let maxFlow = 1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    maxFlow = Math.max(maxFlow, flowBand.values[i]!)
  }

  const raw = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) {
      raw[i] = -1
      continue
    }
    const slope = slopeBand.values[i]!
    const flow = flowBand.values[i]!
    const flowT = Math.log(flow + 1) / Math.log(maxFlow + 1)
    // Stricter AND-based rules → contiguous zones instead of speckled Low/Moderate noise.
    let cls = 0
    if (flowT >= 0.72 && slope < 10) cls = 3
    else if (flowT >= 0.48 && slope < 14) cls = 2
    else if (flowT >= 0.28 && slope < 18) cls = 1
    else if (slope < 3 && flowT >= 0.18) cls = 1
    raw[i] = cls
  }

  const smoothed = majoritySmoothRiskClasses(raw, w, h, aoiMask)
  const risk = dilateElevatedRisk(smoothed, w, h, aoiMask, 2)

  const counts = [0, 0, 0, 0]
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const cls = Math.max(0, Math.min(3, Math.round(risk[i]!)))
    counts[cls]! += 1
  }

  const band: GeoBand = { ...slopeBand, values: risk, name: 'Flood risk' }
  const dataUrl = rasterToDataUrl(band, aoiMask, (_i, v) => {
    const cls = Math.max(0, Math.min(3, Math.round(v)))
    const [r, g, b] = FLOOD_RISK_COLORS[cls]!
    return [r, g, b, FLOOD_RISK_ALPHA[cls]!]
  })
  const total = counts.reduce((a, b) => a + b, 0) || 1
  const classRows: HydroAreaClassRow[] = FLOOD_RISK_LABELS.map((label, i) => {
    const pct = (counts[i]! / total) * 100
    const areaHa = aoiAreaHa != null && aoiAreaHa > 0 ? (pct / 100) * aoiAreaHa : 0
    return { label, pct, areaHa }
  })
  return {
    dataUrl,
    legend: {
      title: 'Flood risk',
      kind: 'classes',
      swatches: FLOOD_RISK_LABELS.map((label, i) => ({
        color: `rgb(${FLOOD_RISK_COLORS[i]!.join(',')})`,
        label,
      })),
      note: 'Clear classes from slope + flow accumulation (smoothed)',
    },
    stats: classRows.map(r => ({
      label: r.label,
      value: `${r.pct.toFixed(1)}%`,
    })),
    classRows,
  }
}

export function buildWetlandDerivedLayer(
  slopeBand: GeoBand,
  flowBand: GeoBand,
  aoiMask: Uint8Array | null,
  aoiAreaHa?: number,
): {
  dataUrl: string
  legend: HydroLegend
  stats: Array<{ label: string; value: string }>
  classRows: HydroAreaClassRow[]
  wetlandPct: number
  wetlandAreaHa: number
} {
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
  const wetlandPct = totalCells ? (wetlandCells / totalCells) * 100 : 0
  const wetlandAreaHa =
    aoiAreaHa != null && aoiAreaHa > 0 ? (wetlandPct / 100) * aoiAreaHa : 0
  const nonPct = Math.max(0, 100 - wetlandPct)
  const nonAreaHa = aoiAreaHa != null && aoiAreaHa > 0 ? aoiAreaHa - wetlandAreaHa : 0
  const classRows: HydroAreaClassRow[] = [
    { label: 'Wetland / saturated zone', pct: wetlandPct, areaHa: wetlandAreaHa },
    { label: 'Non-wetland', pct: nonPct, areaHa: nonAreaHa },
  ]
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
      { label: 'Wetland coverage', value: `${wetlandPct.toFixed(1)}%` },
      { label: 'Wetland area', value: `${wetlandAreaHa.toFixed(2)} ha` },
      { label: 'Wetland cells', value: wetlandCells.toLocaleString() },
    ],
    classRows,
    wetlandPct,
    wetlandAreaHa,
  }
}

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
