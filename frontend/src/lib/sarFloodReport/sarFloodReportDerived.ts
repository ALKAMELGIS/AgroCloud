import type { HydroLegend, HydroStepResult } from '../hydroWatershed/hydroEngine'
import type { GeoBand } from '../hydroWatershed/geoTiffExport'
import type { FloodBounds } from '../floodMonitoringPipeline'

const DEPTH_COLORS: Array<[number, number, number]> = [
  [191, 219, 254], // very shallow
  [96, 165, 250], // shallow
  [37, 99, 235], // moderate
  [29, 78, 216], // deep
  [30, 27, 75], // extreme
]

const RISK_COLORS: Array<[number, number, number]> = [
  [187, 247, 208], // very low
  [134, 239, 172], // low
  [250, 204, 21], // moderate
  [249, 115, 22], // high
  [185, 28, 28], // extreme
]

export const DEPTH_LABELS = [
  'Very Shallow',
  'Shallow',
  'Moderate',
  'Deep',
  'Extreme',
] as const

export const RISK_LABELS = ['Very Low', 'Low', 'Moderate', 'High', 'Extreme'] as const

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode flood raster'))
    img.src = dataUrl
  })
}

function rgbaToDataUrl(
  width: number,
  height: number,
  paint: (i: number) => [number, number, number, number],
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const d = img.data
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const [r, g, b, a] = paint(i)
    d[p] = r
    d[p + 1] = g
    d[p + 2] = b
    d[p + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Decode flood PNG alpha → boolean mask. */
export async function decodeFloodMask(dataUrl: string): Promise<{
  width: number
  height: number
  flooded: Uint8Array
}> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data
  const flooded = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    flooded[i] = data[p + 3]! > 40 ? 1 : 0
  }
  return { width: w, height: h, flooded }
}

/**
 * Approximate distance-to-shore (flooded cells only) via multi-source BFS from dry edges.
 * Class 1..5 mapped to Very Shallow → Extreme by distance percentile.
 */
export function distanceTransformClasses(
  flooded: Uint8Array,
  width: number,
  height: number,
): { classes: Uint8Array; maxDist: number } {
  const n = width * height
  const dist = new Float32Array(n)
  dist.fill(Infinity)
  const queue: number[] = []

  for (let i = 0; i < n; i += 1) {
    if (!flooded[i]) continue
    const x = i % width
    const y = (i / width) | 0
    let border = false
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !flooded[ny * width + nx]) {
        border = true
        break
      }
    }
    if (border) {
      dist[i] = 0
      queue.push(i)
    }
  }

  let qi = 0
  while (qi < queue.length) {
    const i = queue[qi++]!
    const x = i % width
    const y = (i / width) | 0
    const d0 = dist[i]!
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const j = ny * width + nx
      if (!flooded[j]) continue
      const nd = d0 + 1
      if (nd < dist[j]!) {
        dist[j] = nd
        queue.push(j)
      }
    }
  }

  let maxDist = 0
  for (let i = 0; i < n; i += 1) {
    if (flooded[i] && Number.isFinite(dist[i]!)) maxDist = Math.max(maxDist, dist[i]!)
  }
  if (maxDist < 1) maxDist = 1

  const classes = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    if (!flooded[i]) {
      classes[i] = 0
      continue
    }
    const t = dist[i]! / maxDist
    // Interior (far from shore) → deeper proxy class
    const cls = t < 0.15 ? 1 : t < 0.35 ? 2 : t < 0.55 ? 3 : t < 0.75 ? 4 : 5
    classes[i] = cls
  }
  return { classes, maxDist }
}

function classAreaStats(
  classes: Uint8Array,
  flooded: Uint8Array,
  labels: readonly string[],
  totalFlooded: number,
): Array<{ label: string; value: string }> {
  const counts = new Array(labels.length + 1).fill(0)
  for (let i = 0; i < classes.length; i += 1) {
    const c = classes[i]!
    if (c > 0) counts[c] += 1
  }
  return labels.map((label, idx) => {
    const c = idx + 1
    const n = counts[c] ?? 0
    const pct = totalFlooded > 0 ? (n / totalFlooded) * 100 : 0
    return { label, value: `${pct.toFixed(1)}% of inundated area` }
  })
}

function sampleElevBandOntoGrid(
  elevBand: GeoBand,
  width: number,
  height: number,
  bounds: FloodBounds,
): Float32Array | null {
  const elev = new Float32Array(width * height)
  const [w, s, e, n] = bounds
  let valid = 0
  for (let y = 0; y < height; y += 1) {
    const lat = n - ((y + 0.5) / height) * (n - s)
    for (let x = 0; x < width; x += 1) {
      const lng = w + ((x + 0.5) / width) * (e - w)
      // Approximate by mapping lng/lat into DEM pixel via world coords — use relative UV on band bbox if available
      const u = (lng - w) / Math.max(e - w, 1e-9)
      const v = (n - lat) / Math.max(n - s, 1e-9)
      const bx = Math.min(elevBand.width - 1, Math.max(0, Math.floor(u * elevBand.width)))
      const by = Math.min(elevBand.height - 1, Math.max(0, Math.floor(v * elevBand.height)))
      const z = elevBand.values[by * elevBand.width + bx]!
      elev[y * width + x] = z
      if (Number.isFinite(z)) valid += 1
    }
  }
  return valid > 10 ? elev : null
}

function enhanceDepthWithDem(
  classes: Uint8Array,
  flooded: Uint8Array,
  elev: Float32Array,
): Uint8Array {
  let zMin = Infinity
  let zMax = -Infinity
  for (let i = 0; i < flooded.length; i += 1) {
    if (!flooded[i]) continue
    const z = elev[i]!
    if (!Number.isFinite(z)) continue
    zMin = Math.min(zMin, z)
    zMax = Math.max(zMax, z)
  }
  if (!(zMax > zMin)) return classes
  const out = classes.slice()
  const range = zMax - zMin
  for (let i = 0; i < flooded.length; i += 1) {
    if (!flooded[i]) continue
    const z = elev[i]!
    if (!Number.isFinite(z)) continue
    // Lower elevation → deeper proxy (boost class)
    const relief = (zMax - z) / range
    const demClass = relief < 0.2 ? 1 : relief < 0.4 ? 2 : relief < 0.6 ? 3 : relief < 0.8 ? 4 : 5
    out[i] = Math.max(classes[i]!, demClass) as number
  }
  return out
}

export type DerivedFloodLayer = {
  dataUrl: string
  legend: HydroLegend
  stats: Array<{ label: string; value: string }>
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
}

function boundsCorners(
  bounds: FloodBounds,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bounds
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

export async function buildFloodDepthProxyLayer(
  floodDataUrl: string,
  bounds: FloodBounds,
  elevBand?: GeoBand | null,
): Promise<DerivedFloodLayer> {
  const { width, height, flooded } = await decodeFloodMask(floodDataUrl)
  let { classes } = distanceTransformClasses(flooded, width, height)
  if (elevBand) {
    const elev = sampleElevBandOntoGrid(elevBand, width, height, bounds)
    if (elev) classes = enhanceDepthWithDem(classes, flooded, elev)
  }

  let floodedCount = 0
  for (let i = 0; i < flooded.length; i += 1) if (flooded[i]) floodedCount += 1

  const dataUrl = rgbaToDataUrl(width, height, i => {
    const c = classes[i]!
    if (!c) return [0, 0, 0, 0]
    const [r, g, b] = DEPTH_COLORS[c - 1]!
    return [r, g, b, 200]
  })

  return {
    dataUrl,
    coordinates: boundsCorners(bounds),
    legend: {
      title: 'Flood depth (proxy)',
      kind: 'classes',
      swatches: DEPTH_LABELS.map((label, idx) => ({
        color: `rgb(${DEPTH_COLORS[idx]!.join(',')})`,
        label,
      })),
      note: elevBand ? 'Distance + DEM relief screening' : 'Distance-to-shore screening',
    },
    stats: classAreaStats(classes, flooded, DEPTH_LABELS, floodedCount),
  }
}

export async function buildFloodRiskProxyLayer(
  floodDataUrl: string,
  changeDataUrl: string | null,
  bounds: FloodBounds,
): Promise<DerivedFloodLayer> {
  const { width, height, flooded } = await decodeFloodMask(floodDataUrl)
  const { classes: depth } = distanceTransformClasses(flooded, width, height)

  let changeClass: Uint8Array | null = null
  if (changeDataUrl) {
    try {
      const ch = await decodeChangeClasses(changeDataUrl, width, height)
      changeClass = ch
    } catch {
      changeClass = null
    }
  }

  const risk = new Uint8Array(width * height)
  let floodedCount = 0
  for (let i = 0; i < flooded.length; i += 1) {
    if (!flooded[i]) {
      risk[i] = 0
      continue
    }
    floodedCount += 1
    const d = depth[i]! || 1
    // New flooding (change=3 / red) boosts risk
    const isNew = changeClass ? changeClass[i] === 3 : false
    let r = d
    if (isNew) r = Math.min(5, r + 1)
    risk[i] = r
  }

  const dataUrl = rgbaToDataUrl(width, height, i => {
    const c = risk[i]!
    if (!c) return [0, 0, 0, 0]
    const [rr, g, b] = RISK_COLORS[c - 1]!
    return [rr, g, b, 200]
  })

  return {
    dataUrl,
    coordinates: boundsCorners(bounds),
    legend: {
      title: 'Flood risk (screening)',
      kind: 'classes',
      swatches: RISK_LABELS.map((label, idx) => ({
        color: `rgb(${RISK_COLORS[idx]!.join(',')})`,
        label,
      })),
      note: 'Inundation + change screening — not insured risk score',
    },
    stats: classAreaStats(risk, flooded, RISK_LABELS, floodedCount),
  }
}

/** Infer change class from change-raster colours (cyan=1, blue=2, red=3). */
async function decodeChangeClasses(
  dataUrl: string,
  expectW: number,
  expectH: number,
): Promise<Uint8Array> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data
  const out = new Uint8Array(expectW * expectH)
  const useW = Math.min(w, expectW)
  const useH = Math.min(h, expectH)
  for (let y = 0; y < useH; y += 1) {
    for (let x = 0; x < useW; x += 1) {
      const p = (y * w + x) * 4
      const a = data[p + 3]!
      if (a < 40) continue
      const r = data[p]!
      const g = data[p + 1]!
      const b = data[p + 2]!
      let cls = 2
      if (r > 180 && g < 120) cls = 3 // new
      else if (g > 160 && b > 160 && r < 120) cls = 1 // receded cyan
      else if (b > 150 && r < 100) cls = 2 // persistent blue
      out[y * expectW + x] = cls
    }
  }
  return out
}

export function floodVectorToOutlineResult(
  vector: GeoJSON.FeatureCollection,
  floodedHa: number,
): HydroStepResult {
  const features: GeoJSON.Feature[] = []
  for (const f of vector.features ?? []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) {
        features.push({
          type: 'Feature',
          properties: { ...(f.properties ?? {}), order: 2 },
          geometry: { type: 'LineString', coordinates: ring as [number, number][] },
        })
      }
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        for (const ring of poly) {
          features.push({
            type: 'Feature',
            properties: { ...(f.properties ?? {}), order: 2 },
            geometry: { type: 'LineString', coordinates: ring as [number, number][] },
          })
        }
      }
    } else if (g.type === 'LineString') {
      features.push(f)
    }
  }
  return {
    kind: 'vector',
    render: 'streams',
    data: { type: 'FeatureCollection', features },
    legend: {
      title: 'Flood boundaries',
      kind: 'classes',
      swatches: [{ color: 'rgba(37,99,235,0.9)', label: 'Flood extent outline' }],
      note: `${floodedHa.toFixed(2)} ha inundated`,
    },
    stats: [
      { label: 'Flooded area', value: `${floodedHa.toFixed(2)} ha` },
      { label: 'Boundary segments', value: String(features.length) },
    ],
  }
}

export function changeRasterLegend(): HydroLegend {
  return {
    title: 'Change detection',
    kind: 'classes',
    swatches: [
      { color: '#ef4444', label: 'New flooding' },
      { color: '#2563eb', label: 'Persistent water' },
      { color: '#22d3ee', label: 'Receded water' },
    ],
  }
}

export function floodExtentLegend(floodedHa: number): HydroLegend {
  return {
    title: 'Flood extent',
    kind: 'classes',
    swatches: [{ color: 'rgba(37,99,235,0.75)', label: 'Inundated (SAR water)' }],
    note: `${floodedHa.toFixed(2)} ha`,
  }
}

export function inundationClassLegend(
  classStats: Array<{ name: string; color: string }>,
): HydroLegend {
  return {
    title: 'Inundation classes',
    kind: 'classes',
    swatches: classStats.map(c => ({ color: c.color, label: c.name })),
  }
}

/** Assign depth class index (1–5) from a relative score in [0,1]. Exported for unit tests. */
export function depthBucketFromRelative(t: number): number {
  if (t < 0.15) return 1
  if (t < 0.35) return 2
  if (t < 0.55) return 3
  if (t < 0.75) return 4
  return 5
}
