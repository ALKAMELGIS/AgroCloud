/**
 * Hydro Watershed Workflow — client-side terrain hydrology engine.
 *
 * Given a DEM grid (see `terrainTiles.ts`) this module derives the data products a
 * hyper-resolution, distributed hydrologic model needs, entirely in the browser:
 *
 *   • DEM / elevation        — coloured terrain raster
 *   • Hillshade              — shaded relief raster
 *   • Slope                  — gradient raster (Horn's method)
 *   • Flow accumulation      — contributing-area raster (D8)
 *   • Stream network         — vector hydrography (D8 + accumulation threshold)
 *   • Watershed delineation  — primary basins by terminal outlet (D8, colour-coded)
 *   • Computational mesh     — surface-aware triangular mesh ready for modelling
 *
 * Algorithms: Priority-Flood depression filling with an ε-gradient (Barnes et al.,
 * 2014) → guarantees a strictly-descending drainage path to the grid edge, so D8
 * flow directions form a DAG and flow accumulation is solved with a topological
 * (Kahn) sweep. All products are clipped to the user's AOI polygon.
 */

import type { DemGrid, LngLatBBox } from './terrainTiles'
import type { GeoBand } from './geoTiffExport'
import {
  buildEsriD8FlowDirectionLegend,
  ESRI_D8_DIST,
  ESRI_D8_DX,
  ESRI_D8_DY,
  ESRI_D8_MAP_ALPHA,
  ESRI_D8_NODATA_RGB,
  esriD8CodeFromDirIndex,
  esriD8RgbFromCode,
} from './hydroFlowDirectionStyle'

// ── Result contract ───────────────────────────────────────────────────────────

export type HydroStepId =
  | 'dem'
  | 'hillshade'
  | 'slope'
  | 'flow-direction'
  | 'flow-accum'
  | 'streams'
  | 'contours'
  | 'watershed'
  | 'basins'
  | 'mesh'

export type HydroRasterResult = {
  kind: 'raster'
  dataUrl: string
  /** [top-left, top-right, bottom-right, bottom-left] lng/lat for an image source. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  opacity: number
  /**
   * Native single-band values + georeferencing for a lossless GeoTIFF export.
   * Present for every computed raster; absent only for empty/placeholder rasters.
   */
  band?: GeoBand
  /** Map legend descriptor (colours / classification) for the Legend tool. */
  legend?: HydroLegend
}

export type HydroVectorResult = {
  kind: 'vector'
  data: GeoJSON.FeatureCollection
  /** Hint for the renderer to pick the right paint. */
  render: 'streams' | 'mesh' | 'watershed-line' | 'contours'
  /** Highest Strahler stream order in the network (streams only). */
  maxStrahler?: number
  /** Highest Shreve stream magnitude in the network (streams only). */
  maxShreve?: number
  /** Contour elevation bounds (m) — avoid Math.min(...features) on huge layers. */
  elevMin?: number
  elevMax?: number
  /** Map legend descriptor (colours / classification) for the Legend tool. */
  legend?: HydroLegend
}

export type HydroLegendSwatch = { color: string; label: string }

/**
 * Legend descriptor attached to a layer result so the interactive Legend tool
 * can render the exact colours / classification used on the map.
 */
export type HydroLegend = {
  title: string
  /** 'gradient' → continuous ramp bar; 'classes' → discrete labelled swatches. */
  kind: 'gradient' | 'classes'
  /** Low→high ramp colours (gradient) or class colours (classes). */
  swatches: HydroLegendSwatch[]
  /** Gradient end labels (gradient only). */
  minLabel?: string
  maxLabel?: string
  /** Optional unit / note line. */
  note?: string
}

export type HydroStepResult = (HydroRasterResult | HydroVectorResult) & {
  stats: Array<{ label: string; value: string }>
}

export type HydroComputeContext = {
  dem: DemGrid
  /** AOI mask (1 inside, 0 outside) row-major over the DEM grid; null = whole grid. */
  aoiMask: Uint8Array | null
  /** 0..1 — raises/lowers the stream extraction threshold. */
  sensitivity: number
  /** Contour interval in metres; 0/undefined = auto (≈ elevation range / 20). */
  contourInterval?: number
  /** Number of largest drainage basins to delineate & colour (default 6). */
  basinCount?: number
}

// ── Shared D8 topology (cached per DEM compute context) ─────────────────────────

const NEI_DX = [1, 1, 0, -1, -1, -1, 0, 1]
const NEI_DY = [0, 1, 1, 1, 0, -1, -1, -1]
const NEI_DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]

type FlowModel = {
  filled: Float32Array
  /** Downstream cell index per cell, or -1 if it drains off-grid. */
  down: Int32Array
  /** Flow accumulation (cell count contributing to each cell, incl. self). */
  accum: Float32Array
}

const flowCache = new WeakMap<DemGrid, FlowModel>()

/** Minimal binary min-heap keyed by a parallel priority array. */
class MinHeap {
  private idxs: number[] = []
  private prios: number[] = []
  get size(): number {
    return this.idxs.length
  }
  push(idx: number, prio: number): void {
    this.idxs.push(idx)
    this.prios.push(prio)
    let c = this.idxs.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (this.prios[p]! <= this.prios[c]!) break
      this.swap(p, c)
      c = p
    }
  }
  pop(): number {
    const top = this.idxs[0]!
    const lastIdx = this.idxs.pop()!
    const lastPrio = this.prios.pop()!
    if (this.idxs.length > 0) {
      this.idxs[0] = lastIdx
      this.prios[0] = lastPrio
      let c = 0
      const n = this.idxs.length
      for (;;) {
        const l = c * 2 + 1
        const r = l + 1
        let s = c
        if (l < n && this.prios[l]! < this.prios[s]!) s = l
        if (r < n && this.prios[r]! < this.prios[s]!) s = r
        if (s === c) break
        this.swap(s, c)
        c = s
      }
    }
    return top
  }
  private swap(a: number, b: number): void {
    const ti = this.idxs[a]!
    this.idxs[a] = this.idxs[b]!
    this.idxs[b] = ti
    const tp = this.prios[a]!
    this.prios[a] = this.prios[b]!
    this.prios[b] = tp
  }
}

/**
 * Priority-Flood (+ε) depression filling. Produces a hydrologically conditioned
 * surface where every interior cell has a strictly lower downstream neighbour.
 */
function fillDepressions(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev } = dem
  const n = w * h
  const filled = new Float32Array(n)
  const closed = new Uint8Array(n)
  const heap = new MinHeap()
  const EPS = 1e-3

  const seed = (i: number) => {
    filled[i] = elev[i]!
    closed[i] = 1
    heap.push(i, filled[i]!)
  }
  for (let x = 0; x < w; x += 1) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w)
    seed(y * w + (w - 1))
  }

  while (heap.size > 0) {
    const c = heap.pop()
    const cx = c % w
    const cy = (c / w) | 0
    const cz = filled[c]!
    for (let k = 0; k < 8; k += 1) {
      const nx = cx + NEI_DX[k]!
      const ny = cy + NEI_DY[k]!
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (closed[ni]) continue
      const ne = elev[ni]!
      filled[ni] = ne > cz + EPS ? ne : cz + EPS
      closed[ni] = 1
      heap.push(ni, filled[ni]!)
    }
  }
  return filled
}

/** Build (and cache) the D8 flow model: filled DEM, downstream links, accumulation. */
function getFlowModel(dem: DemGrid): FlowModel {
  const cached = flowCache.get(dem)
  if (cached) return cached

  const { width: w, height: h } = dem
  const n = w * h
  const filled = fillDepressions(dem)
  const down = new Int32Array(n).fill(-1)
  const indeg = new Uint8Array(n)

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const zi = filled[i]!
      let bestK = -1
      let bestSlope = 0
      for (let k = 0; k < 8; k += 1) {
        const nx = x + NEI_DX[k]!
        const ny = y + NEI_DY[k]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        const slope = (zi - filled[ni]!) / NEI_DIST[k]!
        if (slope > bestSlope) {
          bestSlope = slope
          bestK = k
        }
      }
      if (bestK >= 0) {
        const ni = (y + NEI_DY[bestK]!) * w + (x + NEI_DX[bestK]!)
        down[i] = ni
        indeg[ni] += 1
      }
    }
  }

  // Topological flow accumulation (Kahn sweep over the drainage DAG).
  const accum = new Float32Array(n).fill(1)
  const queue: number[] = []
  for (let i = 0; i < n; i += 1) if (indeg[i] === 0) queue.push(i)
  let qh = 0
  while (qh < queue.length) {
    const c = queue[qh]!
    qh += 1
    const d = down[c]!
    if (d >= 0) {
      accum[d] += accum[c]!
      indeg[d] -= 1
      if (indeg[d] === 0) queue.push(d)
    }
  }

  const model: FlowModel = { filled, down, accum }
  flowCache.set(dem, model)
  return model
}

/** Filled DEM + D8 flow accumulation (cached per grid) for MCDA well-suitability scoring. */
export function getDemHydrologyModel(dem: DemGrid): { accum: Float32Array; filled: Float32Array } {
  const m = getFlowModel(dem)
  return { accum: m.accum, filled: m.filled }
}

// ── Raster colourisation ────────────────────────────────────────────────────────

type RGBA = [number, number, number, number]

function rasterToDataUrl(
  dem: DemGrid,
  aoiMask: Uint8Array | null,
  colorAt: (i: number) => RGBA,
): string {
  const { width: w, height: h } = dem
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
    const [r, g, b, a] = colorAt(i)
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
    data[p + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Wrap a native value grid + the DEM georeferencing for GeoTIFF export. */
function bandOf(dem: DemGrid, values: Float32Array, name: string): GeoBand {
  return {
    values,
    width: dem.width,
    height: dem.height,
    zoom: dem.zoom,
    originWorldPxX: dem.originWorldPxX,
    originWorldPxY: dem.originWorldPxY,
    nodata: -9999,
    name,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Sample a multi-stop colour ramp at t∈[0,1]. */
function rampColor(stops: Array<[number, number, number]>, t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.floor(u)
  const f = u - i
  const a = stops[i]!
  const b = stops[Math.min(stops.length - 1, i + 1)]!
  return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))]
}

const TERRAIN_RAMP: Array<[number, number, number]> = [
  [38, 70, 83],
  [42, 157, 143],
  [138, 177, 125],
  [233, 196, 106],
  [212, 163, 115],
  [188, 108, 37],
  [245, 245, 245],
]
const SLOPE_RAMP: Array<[number, number, number]> = [
  [26, 152, 80],
  [166, 217, 106],
  [255, 255, 191],
  [253, 174, 97],
  [215, 25, 28],
]
const FLOW_RAMP: Array<[number, number, number]> = [
  [240, 249, 255],
  [116, 169, 207],
  [43, 113, 191],
  [8, 48, 107],
]

const rgbCss = (c: [number, number, number]): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
/** Convert a numeric colour ramp into ordered legend swatches (low→high). */
const rampSwatches = (ramp: Array<[number, number, number]>): HydroLegendSwatch[] =>
  ramp.map(c => ({ color: rgbCss(c), label: '' }))

function minMaxFinite(arr: Float32Array, mask: Uint8Array | null): [number, number] {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < arr.length; i += 1) {
    if (mask && !mask[i]) continue
    const v = arr[i]!
    if (!Number.isFinite(v)) continue
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  if (!Number.isFinite(mn)) return [0, 1]
  if (mx === mn) mx = mn + 1
  return [mn, mx]
}

// ── Public per-step computations ────────────────────────────────────────────────

export function computeDem(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const [mn, mx] = minMaxFinite(dem.elev, aoiMask)
  const span = mx - mn
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const t = (dem.elev[i]! - mn) / span
    const [r, g, b] = rampColor(TERRAIN_RAMP, t)
    return [r, g, b, 255]
  })
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 1,
    band: bandOf(dem, dem.elev, 'Hydro Elevation (m)'),
    legend: {
      title: 'Elevation',
      kind: 'gradient',
      swatches: rampSwatches(TERRAIN_RAMP),
      minLabel: `${mn.toFixed(0)} m`,
      maxLabel: `${mx.toFixed(0)} m`,
    },
    stats: [
      { label: 'Min elevation', value: `${mn.toFixed(0)} m` },
      { label: 'Max elevation', value: `${mx.toFixed(0)} m` },
      { label: 'Relief', value: `${span.toFixed(0)} m` },
      { label: 'Resolution', value: `${dem.metersPerPixel.toFixed(0)} m/px` },
    ],
  }
}

export function computeHillshade(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const azRad = (315 * Math.PI) / 180
  const altRad = (45 * Math.PI) / 180
  const cosAlt = Math.cos(altRad)
  const sinAlt = Math.sin(altRad)
  // Native hillshade illumination in [0,1] (Horn's method) — exported verbatim.
  const shade = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      shade[i] = Math.max(0, cosAlt * Math.cos(slope) + sinAlt * Math.sin(slope) * Math.cos(azRad - aspect))
    }
  }
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const v = Math.round(30 + shade[i]! * 225)
    return [v, v, v, 255]
  })
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 1,
    band: bandOf(dem, shade, 'Hydro Hillshade'),
    legend: {
      title: 'Hillshade',
      kind: 'gradient',
      swatches: [
        { color: 'rgb(40, 40, 40)', label: '' },
        { color: 'rgb(150, 150, 150)', label: '' },
        { color: 'rgb(255, 255, 255)', label: '' },
      ],
      minLabel: 'Shadow',
      maxLabel: 'Lit',
      note: 'Sun 315° / 45°',
    },
    stats: [
      { label: 'Sun azimuth', value: '315°' },
      { label: 'Sun altitude', value: '45°' },
    ],
  }
}

export function computeSlope(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const slopeDeg = new Float32Array(w * h)
  let maxSlope = 0
  let sum = 0
  let cnt = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      const deg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      slopeDeg[i] = deg
      if (deg > maxSlope) maxSlope = deg
      if (!aoiMask || aoiMask[i]) {
        sum += deg
        cnt += 1
      }
    }
  }
  const cap = Math.max(8, maxSlope)
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const t = slopeDeg[i]! / cap
    const [r, g, b] = rampColor(SLOPE_RAMP, t)
    return [r, g, b, 255]
  })
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 1,
    band: bandOf(dem, slopeDeg, 'Hydro Slope (deg)'),
    legend: {
      title: 'Slope',
      kind: 'gradient',
      swatches: rampSwatches(SLOPE_RAMP),
      minLabel: '0°',
      maxLabel: `${cap.toFixed(0)}°`,
    },
    stats: [
      { label: 'Mean slope', value: `${(cnt ? sum / cnt : 0).toFixed(1)}°` },
      { label: 'Max slope', value: `${maxSlope.toFixed(1)}°` },
    ],
  }
}

export function computeFlowAccumulation(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { accum } = getFlowModel(dem)
  let maxA = 1
  for (let i = 0; i < accum.length; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    if (accum[i]! > maxA) maxA = accum[i]!
  }
  const logMax = Math.log(maxA + 1)
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const t = Math.log(accum[i]! + 1) / logMax
    const [r, g, b] = rampColor(FLOW_RAMP, t)
    // Emphasise channels while keeping the whole field clearly visible: a high
    // alpha floor means even low accumulation reads, channels stay fully opaque.
    const a = Math.round(150 + t * 105)
    return [r, g, b, a]
  })
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 1,
    band: bandOf(dem, accum, 'Hydro Flow accumulation (cells)'),
    legend: {
      title: 'Flow accumulation',
      kind: 'gradient',
      swatches: rampSwatches(FLOW_RAMP),
      minLabel: '1',
      maxLabel: maxA.toLocaleString(),
      note: 'contributing cells (log)',
    },
    stats: [{ label: 'Max contributing cells', value: maxA.toLocaleString() }],
  }
}

/** ESRI D8 flow-direction raster — colour wheel by cardinal direction (report + map). */
export function computeFlowDirection(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { width: w, height: h } = dem
  const { filled } = getFlowModel(dem)
  const codes = new Float32Array(w * h)
  let assigned = 0
  let flat = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      if (aoiMask && !aoiMask[i]) {
        codes[i] = 0
        continue
      }
      const zi = filled[i]!
      let bestK = -1
      let bestSlope = 0
      for (let k = 0; k < 8; k += 1) {
        const nx = x + ESRI_D8_DX[k]!
        const ny = y + ESRI_D8_DY[k]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const slope = (zi - filled[ny * w + nx]!) / ESRI_D8_DIST[k]!
        if (slope > bestSlope) {
          bestSlope = slope
          bestK = k
        }
      }
      if (bestK < 0) {
        codes[i] = 0
        flat += 1
      } else {
        codes[i] = esriD8CodeFromDirIndex(bestK)
        assigned += 1
      }
    }
  }
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const code = codes[i]!
    if (!(code > 0)) {
      const [r, g, b] = ESRI_D8_NODATA_RGB
      return [r, g, b, Math.round(ESRI_D8_MAP_ALPHA * 0.55)]
    }
    const [r, g, b] = esriD8RgbFromCode(code)
    return [r, g, b, ESRI_D8_MAP_ALPHA]
  })
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 0.88,
    band: bandOf(dem, codes, 'Flow direction (ESRI D8)'),
    legend: buildEsriD8FlowDirectionLegend(),
    stats: [
      { label: 'Directed cells', value: assigned.toLocaleString() },
      { label: 'Flat / sink', value: flat.toLocaleString() },
      { label: 'Coding', value: 'ESRI D8 (1…128)' },
    ],
  }
}

export function computeStreams(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask, sensitivity } = ctx
  const { width: w, height: h } = dem
  const { accum, down } = getFlowModel(dem)
  const n = w * h

  // Threshold as a fraction of the grid → higher sensitivity = denser network.
  const base = Math.max(15, n * 0.0012)
  const threshold = base * (1.8 - 1.4 * Math.max(0, Math.min(1, sensitivity)))

  // ── Build the channel network (every cell at/above threshold inside the AOI) ──
  const isStream = new Uint8Array(n)
  const streamCells: number[] = []
  for (let i = 0; i < n; i += 1) {
    if (accum[i]! < threshold) continue
    if (aoiMask && !aoiMask[i]) continue
    isStream[i] = 1
    streamCells.push(i)
  }
  /** Downstream cell if it is also an in-AOI channel cell, else -1. */
  const downStream = (c: number): number => {
    const d = down[c]!
    return d >= 0 && (!aoiMask || aoiMask[d]) && isStream[d] ? d : -1
  }

  // Accumulation increases monotonically downstream, so ascending-accum order is a
  // valid topological (source → outlet) sweep — one pass yields BOTH classifiers.
  streamCells.sort((a, b) => accum[a]! - accum[b]!)
  const strahler = new Int32Array(n)
  const shreve = new Float64Array(n)
  const upCount = new Int32Array(n)
  const maxUpOrder = new Int32Array(n)
  const maxUpCount = new Int32Array(n)
  const magSum = new Float64Array(n)
  for (const c of streamCells) {
    let ord: number
    let mag: number
    if (upCount[c] === 0) {
      // First-order source link.
      ord = 1
      mag = 1
    } else {
      // Strahler: order rises only when ≥2 of the highest-order links meet.
      ord = maxUpCount[c]! >= 2 ? maxUpOrder[c]! + 1 : maxUpOrder[c]!
      // Shreve: magnitude is the sum of all upstream link magnitudes.
      mag = magSum[c]!
    }
    strahler[c] = ord
    shreve[c] = mag
    const d = downStream(c)
    if (d >= 0) {
      upCount[d] += 1
      magSum[d] += mag
      if (ord > maxUpOrder[d]!) {
        maxUpOrder[d] = ord
        maxUpCount[d] = 1
      } else if (ord === maxUpOrder[d]!) {
        maxUpCount[d] += 1
      }
    }
  }

  const features: GeoJSON.Feature[] = []
  let channelCells = 0
  let maxStrahler = 1
  let maxShreve = 1
  for (const i of streamCells) {
    channelCells += 1
    if (strahler[i]! > maxStrahler) maxStrahler = strahler[i]!
    if (shreve[i]! > maxShreve) maxShreve = shreve[i]!
    const d = downStream(i)
    if (d < 0) continue
    const ax = i % w
    const ay = (i / w) | 0
    const bx = d % w
    const by = (d / w) | 0
    features.push({
      type: 'Feature',
      properties: {
        // Both classifiers travel with every segment so the map can switch models
        // instantly without recomputing. `order` kept for backward compatibility.
        strahler: strahler[i]!,
        shreve: shreve[i]!,
        order: strahler[i]!,
        accum: Math.round(accum[i]!),
      },
      geometry: {
        type: 'LineString',
        coordinates: [dem.pxToLngLat(ax + 0.5, ay + 0.5), dem.pxToLngLat(bx + 0.5, by + 0.5)],
      },
    })
  }

  const lengthKm = (channelCells * dem.metersPerPixel) / 1000
  return {
    kind: 'vector',
    render: 'streams',
    data: { type: 'FeatureCollection', features },
    maxStrahler,
    maxShreve,
    stats: [
      { label: 'Stream segments', value: features.length.toLocaleString() },
      { label: 'Channel length', value: `${lengthKm.toFixed(1)} km` },
      { label: 'Max Strahler order', value: String(maxStrahler) },
      { label: 'Max Shreve magnitude', value: maxShreve.toLocaleString() },
    ],
  }
}

export function computeWatershed(ctx: HydroComputeContext): HydroStepResult {
  // Multi-basin watershed delineation — every primary basin gets a coordinated colour
  // on the map, in the interactive legend, and in the Hydro report atlas.
  return buildPrimaryBasinRaster(ctx, {
    bandName: 'Hydro Watershed basins (id)',
    legendTitle: 'Watershed delineation',
    labelPrefix: 'Watershed',
    noteSuffix: 'primary basins',
    includeMinorGrey: true,
    alphaPrimary: 200,
    alphaMinor: 55,
    drawBoundaries: true,
  })
}

export function computeMesh(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev } = dem
  // Target ~36 cells across the longer side for a clean, readable mesh.
  const step = Math.max(4, Math.round(Math.max(w, h) / 36))
  const [mn, mx] = minMaxFinite(elev, aoiMask)
  const span = mx - mn || 1

  const inside = (cx: number, cy: number): boolean => {
    if (!aoiMask) return true
    const ix = Math.min(w - 1, Math.max(0, Math.round(cx)))
    const iy = Math.min(h - 1, Math.max(0, Math.round(cy)))
    return !!aoiMask[iy * w + ix]
  }
  const elevAt = (cx: number, cy: number): number => {
    const ix = Math.min(w - 1, Math.max(0, Math.round(cx)))
    const iy = Math.min(h - 1, Math.max(0, Math.round(cy)))
    return elev[iy * w + ix]!
  }
  const colorFor = (z: number): string => {
    const [r, g, b] = rampColor(TERRAIN_RAMP, (z - mn) / span)
    return `rgb(${r},${g},${b})`
  }

  const features: GeoJSON.Feature[] = []
  let triangles = 0
  for (let y = 0; y + step < h; y += step) {
    for (let x = 0; x + step < w; x += step) {
      const x2 = x + step
      const y2 = y + step
      const cx = x + step / 2
      const cy = y + step / 2
      if (!inside(cx, cy)) continue
      const tl = dem.pxToLngLat(x, y)
      const tr = dem.pxToLngLat(x2, y)
      const br = dem.pxToLngLat(x2, y2)
      const bl = dem.pxToLngLat(x, y2)
      const zA = (elevAt(x, y) + elevAt(x2, y) + elevAt(x, y2)) / 3
      const zB = (elevAt(x2, y) + elevAt(x2, y2) + elevAt(x, y2)) / 3
      features.push({
        type: 'Feature',
        properties: { fillColor: colorFor(zA), elev: Math.round(zA) },
        geometry: { type: 'Polygon', coordinates: [[tl, tr, bl, tl]] },
      })
      features.push({
        type: 'Feature',
        properties: { fillColor: colorFor(zB), elev: Math.round(zB) },
        geometry: { type: 'Polygon', coordinates: [[tr, br, bl, tr]] },
      })
      triangles += 2
    }
  }
  const nodesAcross = Math.floor(w / step)
  return {
    kind: 'vector',
    render: 'mesh',
    data: { type: 'FeatureCollection', features },
    legend: {
      title: 'Mesh (elevation)',
      kind: 'gradient',
      swatches: rampSwatches(TERRAIN_RAMP),
      minLabel: `${mn.toFixed(0)} m`,
      maxLabel: `${mx.toFixed(0)} m`,
    },
    stats: [
      { label: 'Mesh elements', value: triangles.toLocaleString() },
      { label: 'Node spacing', value: `${(step * dem.metersPerPixel).toFixed(0)} m` },
      { label: 'Grid', value: `${nodesAcross} cells / row` },
    ],
  }
}

// ── Contours (marching squares iso-elevation lines) ─────────────────────────────

/** Blue (low) → red (high) contour stroke ramp — shared by map paint + report legend. */
export const HYDRO_CONTOUR_ELEV_COLORS = [
  '#1d4ed8', // low
  '#0ea5e9', // mid-low
  '#eab308', // mid
  '#f97316', // mid-high
  '#b91c1c', // high
] as const

/** "Nice" contour interval (1/2/5 × 10ⁿ) for an elevation range / target count. */
function niceInterval(range: number, target = 18): number {
  if (!(range > 0)) return 10
  const raw = range / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10
  return Math.max(1, step * mag)
}

export function contourElevNormalized(elev: number, minElev: number, maxElev: number): number {
  const span = maxElev - minElev
  if (!(span > 0) || !Number.isFinite(elev)) return 0.5
  return Math.min(1, Math.max(0, (elev - minElev) / span))
}

/** Continuous stroke colour for a contour elevation (low=blue … high=red). */
export function contourElevationStrokeColor(
  elev: number,
  minElev: number,
  maxElev: number,
): string {
  const t = contourElevNormalized(elev, minElev, maxElev)
  const stops = HYDRO_CONTOUR_ELEV_COLORS
  const scaled = t * (stops.length - 1)
  const i0 = Math.floor(scaled)
  const i1 = Math.min(stops.length - 1, i0 + 1)
  if (i0 === i1) return stops[i0]!
  const f = scaled - i0
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '')
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ]
  }
  const [r0, g0, b0] = parse(stops[i0]!)
  const [r1, g1, b1] = parse(stops[i1]!)
  const r = Math.round(r0 + (r1 - r0) * f)
  const g = Math.round(g0 + (g1 - g0) * f)
  const b = Math.round(b0 + (b1 - b0) * f)
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

/** Equal-interval elevation class edges (metres) for legend + Mapbox stops. */
export function contourElevationClassEdges(minElev: number, maxElev: number): number[] {
  const lo = Math.floor(minElev)
  const hi = Math.ceil(maxElev)
  const span = Math.max(hi - lo, 1)
  // 6 edges → 5 elevation Ranges matching HYDRO_CONTOUR_ELEV_COLORS.
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => Math.round(lo + t * span))
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i]! <= edges[i - 1]!) edges[i] = edges[i - 1]! + 1
  }
  edges[0] = lo
  edges[edges.length - 1] = Math.max(edges[edges.length - 1]!, hi)
  return edges
}

/** Professional contour legend: elevation Ranges (High=red … Low=blue) + index/interval. */
export function buildContourElevationLegend(
  eMin: number,
  eMax: number,
  interval: number,
): HydroLegend {
  const edges = contourElevationClassEdges(eMin, eMax)
  const fmt = (a: number, b: number) => `${a}–${b} m`
  const indexEvery = Math.max(1, Math.round(interval * 5))
  return {
    title: 'Elevation Contours',
    kind: 'classes',
    swatches: [
      { color: HYDRO_CONTOUR_ELEV_COLORS[4]!, label: `High elevation ${fmt(edges[4]!, edges[5]!)}` },
      { color: HYDRO_CONTOUR_ELEV_COLORS[3]!, label: `Upper mid ${fmt(edges[3]!, edges[4]!)}` },
      { color: HYDRO_CONTOUR_ELEV_COLORS[2]!, label: `Mid elevation ${fmt(edges[2]!, edges[3]!)}` },
      { color: HYDRO_CONTOUR_ELEV_COLORS[1]!, label: `Lower mid ${fmt(edges[1]!, edges[2]!)}` },
      { color: HYDRO_CONTOUR_ELEV_COLORS[0]!, label: `Low elevation ${fmt(edges[0]!, edges[1]!)}` },
      { color: '#0f172a', label: `Index contour (every ${indexEvery} m)` },
      { color: '#94a3b8', label: `Contour interval ${interval} m` },
    ],
    note: `Elevation range ${Math.round(eMin)}–${Math.round(eMax)} m · warmer/redder = higher ground`,
  }
}

/** Mapbox GL interpolate expression stops for elev → colour (low blue → high red). */
export function contourElevationMapboxColorExpression(
  minElev: number,
  maxElev: number,
): unknown[] {
  const edges = contourElevationClassEdges(minElev, maxElev)
  const expr: unknown[] = ['interpolate', ['linear'], ['get', 'elev']]
  for (let i = 0; i < HYDRO_CONTOUR_ELEV_COLORS.length; i += 1) {
    // Colour stop at the start of each Range (high end uses last edge).
    expr.push(edges[i]!, HYDRO_CONTOUR_ELEV_COLORS[i]!)
  }
  expr.push(edges[edges.length - 1]!, HYDRO_CONTOUR_ELEV_COLORS[HYDRO_CONTOUR_ELEV_COLORS.length - 1]!)
  return expr
}

export function computeContours(ctx: HydroComputeContext): HydroStepResult {
  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev } = dem
  const [eMin, eMax] = minMaxFinite(elev, aoiMask)
  const range = eMax - eMin
  const interval =
    ctx.contourInterval && ctx.contourInterval > 0 ? ctx.contourInterval : niceInterval(range)

  // Cap the number of levels so a tiny interval can't explode the geometry.
  const firstLevel = Math.ceil(eMin / interval) * interval
  const levels: number[] = []
  for (let lv = firstLevel; lv <= eMax && levels.length < 80; lv += interval) levels.push(lv)

  const at = (x: number, y: number): number => elev[y * w + x]!
  const inAoi = (x: number, y: number): boolean => !aoiMask || !!aoiMask[y * w + x]
  const crossing = (
    ax: number,
    ay: number,
    za: number,
    bx: number,
    by: number,
    zb: number,
    L: number,
  ): [number, number] => {
    const t = (L - za) / (zb - za || 1e-9)
    return dem.pxToLngLat(ax + 0.5 + (bx - ax) * t, ay + 0.5 + (by - ay) * t)
  }

  const features: GeoJSON.Feature[] = []
  for (const L of levels) {
    const isIndex = Math.round(L / interval) % 5 === 0
    for (let y = 0; y < h - 1; y += 1) {
      for (let x = 0; x < w - 1; x += 1) {
        // Clip to AOI on the square's anchor cell.
        if (!inAoi(x, y)) continue
        const z0 = at(x, y) // top-left
        const z1 = at(x + 1, y) // top-right
        const z2 = at(x + 1, y + 1) // bottom-right
        const z3 = at(x, y + 1) // bottom-left
        if (!Number.isFinite(z0 + z1 + z2 + z3)) continue
        const pts: Array<[number, number]> = []
        // Edge order: top, right, bottom, left.
        if (z0 < L !== z1 < L) pts.push(crossing(x, y, z0, x + 1, y, z1, L))
        if (z1 < L !== z2 < L) pts.push(crossing(x + 1, y, z1, x + 1, y + 1, z2, L))
        if (z2 < L !== z3 < L) pts.push(crossing(x + 1, y + 1, z2, x, y + 1, z3, L))
        if (z3 < L !== z0 < L) pts.push(crossing(x, y + 1, z3, x, y, z0, L))
        const props = { elev: Math.round(L), index: isIndex ? 1 : 0 }
        if (pts.length === 2) {
          features.push({
            type: 'Feature',
            properties: props,
            geometry: { type: 'LineString', coordinates: [pts[0]!, pts[1]!] },
          })
        } else if (pts.length === 4) {
          features.push({
            type: 'Feature',
            properties: props,
            geometry: { type: 'LineString', coordinates: [pts[0]!, pts[1]!] },
          })
          features.push({
            type: 'Feature',
            properties: props,
            geometry: { type: 'LineString', coordinates: [pts[2]!, pts[3]!] },
          })
        }
      }
    }
  }

  return {
    kind: 'vector',
    render: 'contours',
    data: { type: 'FeatureCollection', features },
    elevMin: eMin,
    elevMax: eMax,
    legend: buildContourElevationLegend(eMin, eMax, interval),
    stats: [
      { label: 'Contour interval', value: `${interval} m` },
      { label: 'Levels', value: String(levels.length) },
      { label: 'Segments', value: features.length.toLocaleString() },
      { label: 'Elevation range', value: `${Math.round(eMin)}–${Math.round(eMax)} m` },
    ],
  }
}

// ── Primary basins / watershed delineation (shared multi-outlet colouring) ─────

/** Coordinated qualitative palette — same colours on map, legend, and report. */
const BASIN_PALETTE: Array<[number, number, number]> = [
  [31, 119, 180],
  [255, 127, 14],
  [44, 160, 44],
  [214, 39, 40],
  [148, 103, 189],
  [140, 86, 75],
  [227, 119, 194],
  [188, 189, 34],
  [23, 190, 207],
  [26, 152, 80],
  [255, 187, 120],
  [197, 176, 213],
]

type PrimaryBasinRasterOptions = {
  bandName: string
  legendTitle: string
  labelPrefix: string
  noteSuffix: string
  includeMinorGrey: boolean
  alphaPrimary: number
  alphaMinor: number
  /** Darken shared edges between primary basins for clearer separation on the map. */
  drawBoundaries?: boolean
  opacity?: number
}

/**
 * Delineate the N largest D8 terminal basins inside the AOI and paint each with a
 * distinct coordinated colour (legend labels include area in km²).
 */
function buildPrimaryBasinRaster(
  ctx: HydroComputeContext,
  options: PrimaryBasinRasterOptions,
): HydroStepResult {
  const { dem, aoiMask } = ctx
  const w = dem.width
  const h = dem.height
  const { down } = getFlowModel(dem)
  const n = w * h
  const wanted = Math.max(2, Math.min(12, Math.round(ctx.basinCount ?? 6)))

  const terminal = new Int32Array(n).fill(-2)
  const path: number[] = []
  const onPath = new Uint8Array(n)
  for (let s = 0; s < n; s += 1) {
    let c = s
    path.length = 0
    while (c >= 0 && terminal[c] === -2) {
      // Cycle / self-loop guard (flat DEM noise) — treat as a local terminal.
      if (onPath[c]) {
        terminal[c] = c
        break
      }
      onPath[c] = 1
      path.push(c)
      const d = down[c]!
      if (d < 0 || d === c) {
        terminal[c] = c
        break
      }
      c = d
    }
    const end = c >= 0 ? terminal[c]! : path[path.length - 1] ?? -1
    for (const p of path) {
      terminal[p] = end
      onPath[p] = 0
    }
  }

  const sizes = new Map<number, number>()
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const t = terminal[i]!
    if (t < 0) continue
    sizes.set(t, (sizes.get(t) ?? 0) + 1)
  }
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1])
  const topOutlets = ranked.slice(0, wanted)
  const rankByOutlet = new Map<number, number>()
  topOutlets.forEach(([outlet], idx) => rankByOutlet.set(outlet, idx))

  const basinId = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) {
      basinId[i] = 0
      continue
    }
    const rank = rankByOutlet.get(terminal[i]!)
    basinId[i] = rank === undefined ? 0 : rank + 1
  }

  const cellArea = dem.metersPerPixel * dem.metersPerPixel
  const drawBoundaries = !!options.drawBoundaries
  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const id = basinId[i]!
    if (id <= 0) {
      if (!options.includeMinorGrey) return [0, 0, 0, 0]
      return [120, 120, 120, options.alphaMinor]
    }
    const rank = (id - 1) | 0
    const [r, g, b] = BASIN_PALETTE[rank % BASIN_PALETTE.length]!
    if (drawBoundaries) {
      const x = i % w
      const y = (i / w) | 0
      let edge = false
      for (let k = 0; k < 4; k += 1) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0)
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0)
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const nid = basinId[ny * w + nx]!
        if (nid > 0 && nid !== id) {
          edge = true
          break
        }
      }
      if (edge) {
        return [Math.round(r * 0.28), Math.round(g * 0.28), Math.round(b * 0.28), 235]
      }
    }
    return [r, g, b, options.alphaPrimary]
  })

  const largestKm2 = topOutlets.length ? (topOutlets[0]![1] * cellArea) / 1e6 : 0
  const totalPrimaryKm2 = topOutlets.reduce((s, [, size]) => s + (size * cellArea) / 1e6, 0)
  const swatches: HydroLegendSwatch[] = topOutlets.map(([, size], idx) => ({
    color: rgbCss(BASIN_PALETTE[idx % BASIN_PALETTE.length]!),
    label: `${options.labelPrefix} ${idx + 1} · ${((size * cellArea) / 1e6).toFixed(2)} km²`,
  }))
  if (options.includeMinorGrey && ranked.length > topOutlets.length) {
    swatches.push({
      color: 'rgb(120,120,120)',
      label: `Other / minor basins (${ranked.length - topOutlets.length})`,
    })
  }

  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: options.opacity ?? 0.92,
    band: bandOf(dem, basinId, options.bandName),
    legend: {
      title: options.legendTitle,
      kind: 'classes',
      swatches,
      note: `${topOutlets.length} ${options.noteSuffix} · ${totalPrimaryKm2.toFixed(2)} km² primary`,
    },
    stats: [
      { label: 'Basins (total)', value: sizes.size.toLocaleString() },
      { label: 'Primary basins', value: String(topOutlets.length) },
      { label: 'Largest basin', value: `${largestKm2.toFixed(2)} km²` },
      { label: 'Primary area', value: `${totalPrimaryKm2.toFixed(2)} km²` },
      { label: 'Resolution', value: `${dem.metersPerPixel.toFixed(0)} m/px` },
    ],
  }
}

export function computeBasins(ctx: HydroComputeContext): HydroStepResult {
  return buildPrimaryBasinRaster(ctx, {
    bandName: 'Drainage basins (id)',
    legendTitle: 'Drainage basins',
    labelPrefix: 'Drainage Basin',
    noteSuffix: 'primary drainage basins',
    includeMinorGrey: true,
    alphaPrimary: 200,
    alphaMinor: 55,
    drawBoundaries: true,
    opacity: 0.95,
  })
}

export const HYDRO_COMPUTE: Record<HydroStepId, (ctx: HydroComputeContext) => HydroStepResult> = {
  dem: computeDem,
  hillshade: computeHillshade,
  slope: computeSlope,
  'flow-direction': computeFlowDirection,
  'flow-accum': computeFlowAccumulation,
  streams: computeStreams,
  contours: computeContours,
  watershed: computeWatershed,
  basins: computeBasins,
  mesh: computeMesh,
}

// ── AOI mask helper ─────────────────────────────────────────────────────────────

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
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
  if (!pointInRing(lng, lat, polygon[0]!)) return false
  for (let h = 1; h < polygon.length; h += 1) if (pointInRing(lng, lat, polygon[h]!)) return false
  return true
}

/** Rasterise the AOI polygon onto the DEM grid (1 inside, 0 outside). */
export function buildAoiMask(
  dem: DemGrid,
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): Uint8Array | null {
  if (!geometry) return null
  const geom =
    (geometry as GeoJSON.Feature).type === 'Feature'
      ? (geometry as GeoJSON.Feature).geometry
      : (geometry as GeoJSON.Geometry)
  if (!geom) return null
  let polys: number[][][][]
  if (geom.type === 'Polygon') polys = [geom.coordinates as number[][][]]
  else if (geom.type === 'MultiPolygon') polys = geom.coordinates as number[][][][]
  else return null

  const { width: w, height: h } = dem
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [lng, lat] = dem.pxToLngLat(x + 0.5, y + 0.5)
      let inside = false
      for (const poly of polys) {
        if (pointInPolygon(lng, lat, poly)) {
          inside = true
          break
        }
      }
      if (inside) mask[y * w + x] = 1
    }
  }
  return mask
}

// ── Well Site Recommendation (Hydro-AI) ─────────────────────────────────────────
//
// Multi-criteria suitability model for siting water wells, derived from the same
// DEM pipeline. Each in-AOI cell gets a 0..1 suitability score combining:
//   ✔ low / moderate elevation (groundwater potential)
//   ✔ gentle slope (stable drilling + infiltration)
//   ✔ high flow accumulation (recharge potential zones)
//   ❌ very steep slopes (penalised)
// Outputs a RdYlGn suitability heatmap raster + the top-N spaced drilling points.

/** High-contrast RdYlGn ramp — vivid on satellite basemaps (low→high suitability). */
const WELLSITE_RAMP: Array<[number, number, number]> = [
  [180, 0, 0], // deep red — unsuitable
  [255, 40, 0], // vivid red
  [255, 140, 0], // strong orange
  [255, 220, 0], // bright yellow
  [140, 220, 20], // lime
  [0, 200, 60], // vivid green
  [0, 140, 40], // deep green — best
]

/**
 * Per-well attribute schema (Shapefile-style). Terrain fields are computed
 * directly from the DEM; Hydrogeology / Soil / Recharge fields are physically
 * motivated proxy estimates derived from terrain (no external soil/climate data),
 * so `confidence` flags how reliable the estimate is.
 */
export type WellSiteAttributes = {
  well_name: string
  rank: number
  longitude: number
  latitude: number
  // ── Terrain (exact, DEM-derived) ──
  elev_m: number
  slope_pc: number
  flow_acc: number
  twi: number
  // ── Hydrogeology (estimated) ──
  aq_prob: number
  aq_type: string
  /** Estimated depth to the water table (m below ground). */
  water_table_m: number
  depth_m: number
  yield_m3d: number
  // ── Soil (estimated) ──
  soil_perm: string
  soil_type: string
  infil_rate: number
  // ── Recharge (estimated) ──
  rch_dist_m: number
  rain_mm: number
  runoff_idx: number
  // ── Decision ──
  well_score: number
  confidence: string
  risk_lvl: string
}

export type WellSitePoint = {
  lng: number
  lat: number
  /** Suitability 0..100. */
  score: number
  /** 1 = best. */
  rank: number
  /** Ground elevation (m) at the cell. */
  elevation: number
  /** Local slope (degrees) at the cell. */
  slopeDeg: number
  /** Full Shapefile-style attribute record. */
  attributes: WellSiteAttributes
}

export type WellSiteResult = {
  raster: HydroRasterResult
  points: WellSitePoint[]
  /** GeoJSON FeatureCollection of the recommended drilling points (export). */
  pointsGeoJson: GeoJSON.FeatureCollection
  stats: Array<{ label: string; value: string }>
}

export type WellSiteOptions = {
  /** Number of recommended drilling points (5–10). */
  topN?: number
  /** Slope (deg) at/above which a cell is treated as too steep. */
  steepDeg?: number
}

/**
 * Compute the well-site suitability heatmap + recommended drilling points for the
 * AOI. Pure DEM-derived (elevation, slope, flow accumulation); soil / land-use /
 * groundwater proxies are folded in when available but optional here.
 */
export function computeWellSiteSuitability(
  ctx: HydroComputeContext,
  options: WellSiteOptions = {},
): WellSiteResult {
  const topN = Math.max(1, Math.min(12, Math.round(options.topN ?? 8)))
  const steepDeg = options.steepDeg ?? 22
  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const n = w * h
  const { accum } = getFlowModel(dem)

  const [eMin, eMax] = minMaxFinite(elev, aoiMask)
  const eSpan = eMax - eMin || 1

  let aMax = 1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const a = accum[i]!
    if (Number.isFinite(a) && a > aMax) aMax = a
  }
  const logAMax = Math.log(aMax + 1) || 1

  const suit = new Float32Array(n).fill(NaN)
  const slopeArr = new Float32Array(n).fill(NaN)
  const z = (xx: number, yy: number): number => elev[yy * w + xx]!
  let slopeSum = 0
  let slopeCount = 0

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      if (aoiMask && !aoiMask[i]) continue
      const xm = x > 0 ? x - 1 : x
      const xp = x < w - 1 ? x + 1 : x
      const ym = y > 0 ? y - 1 : y
      const yp = y < h - 1 ? y + 1 : y
      // Horn's method gradient.
      const dzdx =
        (z(xp, ym) + 2 * z(xp, y) + z(xp, yp) - (z(xm, ym) + 2 * z(xm, y) + z(xm, yp))) / (8 * cs)
      const dzdy =
        (z(xm, yp) + 2 * z(x, yp) + z(xp, yp) - (z(xm, ym) + 2 * z(x, ym) + z(xp, ym))) / (8 * cs)
      const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      slopeArr[i] = slopeDeg
      slopeSum += slopeDeg
      slopeCount += 1

      const normElev = Math.max(0, Math.min(1, (elev[i]! - eMin) / eSpan))
      const sElev = 1 - normElev
      const sSlope = 1 - Math.min(1, slopeDeg / steepDeg)
      const sFlow = Math.log((Number.isFinite(accum[i]!) ? accum[i]! : 1) + 1) / logAMax
      let score = 0.25 * sElev + 0.35 * sSlope + 0.4 * sFlow
      if (slopeDeg > steepDeg) score *= 0.25 // steep-slope penalty
      suit[i] = Math.max(0, Math.min(1, score))
    }
  }

  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const v = suit[i]!
    if (!Number.isFinite(v)) return [0, 0, 0, 0]
    // Mild gamma: mid/high suitability reads greener and clearer on imagery.
    const t = Math.pow(Math.max(0, Math.min(1, v)), 0.82)
    const [r, g, b] = rampColor(WELLSITE_RAMP, t)
    return [r, g, b, 255]
  })

  // Top-N points via greedy non-maximum suppression for spatial spread.
  const order: number[] = []
  for (let i = 0; i < n; i += 1) if (Number.isFinite(suit[i]!)) order.push(i)
  order.sort((a, b) => suit[b]! - suit[a]!)
  const minSepPx = Math.max(5, Math.round(Math.min(w, h) / 9))
  const picked: number[] = []
  for (const i of order) {
    if (picked.length >= topN) break
    const x = i % w
    const y = (i / w) | 0
    let ok = true
    for (const p of picked) {
      const px = p % w
      const py = (p / w) | 0
      if (Math.hypot(px - x, py - y) < minSepPx) {
        ok = false
        break
      }
    }
    if (ok) picked.push(i)
  }

  const cellArea = cs * cs
  const round = (v: number, d = 0): number => {
    const f = 10 ** d
    return Math.round(v * f) / f
  }

  const buildAttributes = (i: number, idx: number, lng: number, lat: number): WellSiteAttributes => {
    const elevM = elev[i]!
    const slopeDeg = Number.isFinite(slopeArr[i]!) ? slopeArr[i]! : 0
    const slopeRad = (slopeDeg * Math.PI) / 180
    const tanS = Math.max(Math.tan(slopeRad), 0.001)
    const acc = Number.isFinite(accum[i]!) ? accum[i]! : 1
    const twi = Math.log((acc * cellArea) / tanS)
    const normElev = Math.max(0, Math.min(1, (elevM - eMin) / eSpan))
    const sFlow = Math.log(acc + 1) / logAMax
    const normSlope = Math.min(1, slopeDeg / steepDeg)
    const scoreUnit = suit[i]!

    // Aquifer probability proxy: recharge convergence (flow) + flat terrain.
    const aqProb = Math.max(0, Math.min(1, 0.55 * sFlow + 0.45 * (1 - normSlope)))

    // Aquifer / lithology class from terrain regime.
    let aqType: string
    if (slopeDeg < 3 && sFlow > 0.45) aqType = 'Alluvial'
    else if (slopeDeg < 8) aqType = 'Sedimentary'
    else if (slopeDeg < 15) aqType = 'Fractured'
    else aqType = 'Hard rock'

    // Estimated depth to the water table: shallower near recharge / low flat terrain.
    const waterTableM = Math.max(1, Math.min(80, 4 + normElev * 45 + slopeDeg * 0.4 - aqProb * 12 - sFlow * 8))
    // Expected drilling depth: deeper for high/steep terrain, shallower near recharge.
    const depthM = Math.max(8, Math.min(150, 20 + normElev * 70 + slopeDeg * 1.2 - aqProb * 18))
    // Expected sustainable yield.
    const yieldM3d = Math.max(2, Math.min(600, aqProb * 420 + sFlow * 90))

    // Soil regime tied to lithology proxy.
    const soilByType: Record<string, { perm: string; type: string; infil: number }> = {
      Alluvial: { perm: 'High', type: 'Sandy loam', infil: 28 },
      Sedimentary: { perm: 'Moderate', type: 'Loam', infil: 13 },
      Fractured: { perm: 'Moderate', type: 'Silty clay', infil: 8 },
      'Hard rock': { perm: 'Low', type: 'Rocky / thin', infil: 3 },
    }
    const soil = soilByType[aqType]!

    // Recharge proximity proxy: high TWI / convergence ⇒ closer to recharge.
    const rchDistM = Math.max(15, Math.min(2500, 900 * (1 - sFlow)))
    const rainMm = 100 // regional baseline estimate (no climate input)
    const runoffIdx = Math.max(0, Math.min(1, 0.15 + normSlope * 0.7 - aqProb * 0.1))

    const wellScore = Math.round(scoreUnit * 100)
    const confidence = wellScore >= 80 ? 'High' : wellScore >= 60 ? 'Medium' : 'Low'
    const riskLvl =
      slopeDeg > steepDeg * 0.7 || sFlow > 0.92
        ? 'High'
        : slopeDeg > steepDeg * 0.4
          ? 'Moderate'
          : 'Low'

    return {
      well_name: `Well site ${idx + 1}`,
      rank: idx + 1,
      longitude: round(lng, 6),
      latitude: round(lat, 6),
      elev_m: round(elevM),
      slope_pc: round(Math.tan(slopeRad) * 100, 1),
      flow_acc: round(acc),
      twi: round(twi, 2),
      aq_prob: round(aqProb, 2),
      aq_type: aqType,
      water_table_m: round(waterTableM, 1),
      depth_m: round(depthM),
      yield_m3d: round(yieldM3d),
      soil_perm: soil.perm,
      soil_type: soil.type,
      infil_rate: round(soil.infil + (1 - normSlope) * 4, 1),
      rch_dist_m: round(rchDistM),
      rain_mm: rainMm,
      runoff_idx: round(runoffIdx, 2),
      well_score: wellScore,
      confidence,
      risk_lvl: riskLvl,
    }
  }

  const points: WellSitePoint[] = picked.map((i, idx) => {
    const [lng, lat] = dem.pxToLngLat((i % w) + 0.5, ((i / w) | 0) + 0.5)
    return {
      lng,
      lat,
      score: Math.round(suit[i]! * 100),
      rank: idx + 1,
      elevation: Math.round(elev[i]!),
      slopeDeg: Number(slopeArr[i]!.toFixed(1)),
      attributes: buildAttributes(i, idx, lng, lat),
    }
  })

  const pointsGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ...p.attributes },
    })),
  }

  const meanSlope = slopeCount ? slopeSum / slopeCount : 0

  return {
    raster: {
      kind: 'raster',
      dataUrl,
      coordinates: dem.cornerCoords,
      opacity: 0.94,
      band: bandOf(dem, suit, 'Well-site suitability (0..1)'),
      legend: {
        title: 'Well-site suitability',
        kind: 'gradient',
        swatches: rampSwatches(WELLSITE_RAMP),
        minLabel: 'Low',
        maxLabel: 'High',
        note: 'DEM-derived estimate (elevation · slope · flow)',
      },
    },
    points,
    pointsGeoJson,
    stats: [
      { label: 'Recommended sites', value: String(points.length) },
      { label: 'Best score', value: points.length ? `${points[0]!.score}%` : '—' },
      { label: 'Mean slope', value: `${meanSlope.toFixed(1)}°` },
      { label: 'Resolution', value: `${dem.metersPerPixel.toFixed(0)} m/px` },
    ],
  }
}

export type { LngLatBBox }
