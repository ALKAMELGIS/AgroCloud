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
 *   • Watershed delineation  — basin contributing to the grid outlet (D8 routing)
 *   • Computational mesh     — surface-aware triangular mesh ready for modelling
 *
 * Algorithms: Priority-Flood depression filling with an ε-gradient (Barnes et al.,
 * 2014) → guarantees a strictly-descending drainage path to the grid edge, so D8
 * flow directions form a DAG and flow accumulation is solved with a topological
 * (Kahn) sweep. All products are clipped to the user's AOI polygon.
 */

import type { DemGrid, LngLatBBox } from './terrainTiles'
import type { GeoBand } from './geoTiffExport'

// ── Result contract ───────────────────────────────────────────────────────────

export type HydroStepId =
  | 'dem'
  | 'hillshade'
  | 'slope'
  | 'flow-accum'
  | 'streams'
  | 'watershed'
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
  render: 'streams' | 'mesh' | 'watershed-line'
  /** Highest Strahler stream order in the network (streams only). */
  maxStrahler?: number
  /** Highest Shreve stream magnitude in the network (streams only). */
  maxShreve?: number
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
    nodata: NaN,
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
  const { dem, aoiMask } = ctx
  const { width: w, height: h } = dem
  const { accum, down } = getFlowModel(dem)
  const n = w * h

  // Outlet = highest-accumulation cell inside the AOI (the basin's pour point).
  let pour = -1
  let pourA = -1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    if (accum[i]! > pourA) {
      pourA = accum[i]!
      pour = i
    }
  }
  if (pour < 0) {
    return {
      kind: 'raster',
      dataUrl: rasterToDataUrl(dem, aoiMask, () => [0, 0, 0, 0]),
      coordinates: dem.cornerCoords,
      opacity: 0.5,
      stats: [{ label: 'Outlet', value: 'not found' }],
    }
  }

  // member: -1 unknown, 1 drains to outlet, 0 leaves AOI/outlet basin.
  const member = new Int8Array(n).fill(-1)
  member[pour] = 1
  const path: number[] = []
  for (let s = 0; s < n; s += 1) {
    let c = s
    path.length = 0
    let verdict = -1
    while (c >= 0 && member[c] === -1) {
      path.push(c)
      c = down[c]!
    }
    verdict = c >= 0 ? member[c]! : 0
    for (const p of path) member[p] = verdict as 0 | 1
  }

  let basinCells = 0
  for (let i = 0; i < n; i += 1) {
    if (member[i] === 1 && (!aoiMask || aoiMask[i])) basinCells += 1
  }
  const cellArea = dem.metersPerPixel * dem.metersPerPixel
  const areaKm2 = (basinCells * cellArea) / 1e6
  const [pourLng, pourLat] = dem.pxToLngLat((pour % w) + 0.5, ((pour / w) | 0) + 0.5)

  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    if (member[i] !== 1) return [0, 0, 0, 0]
    return [37, 99, 235, 185]
  })
  const basin = new Float32Array(w * h)
  for (let i = 0; i < basin.length; i += 1) basin[i] = member[i] === 1 ? 1 : 0
  return {
    kind: 'raster',
    dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 1,
    band: bandOf(dem, basin, 'Hydro Watershed (basin mask)'),
    legend: {
      title: 'Watershed',
      kind: 'classes',
      swatches: [{ color: 'rgba(37, 99, 235, 0.65)', label: 'Basin (drains to outlet)' }],
      note: `${areaKm2.toFixed(2)} km²`,
    },
    stats: [
      { label: 'Basin area', value: `${areaKm2.toFixed(2)} km²` },
      { label: 'Outlet', value: `${pourLat.toFixed(4)}, ${pourLng.toFixed(4)}` },
    ],
  }
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

export const HYDRO_COMPUTE: Record<HydroStepId, (ctx: HydroComputeContext) => HydroStepResult> = {
  dem: computeDem,
  hillshade: computeHillshade,
  slope: computeSlope,
  'flow-accum': computeFlowAccumulation,
  streams: computeStreams,
  watershed: computeWatershed,
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

export type { LngLatBBox }
