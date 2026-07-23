import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRasterRecord,
  georeferenceRasterOnServer,
  layerConfigFromReadyRecord,
  downloadRasterGeoTiff,
  RasterNeedsGeoreferenceError,
  type RasterGcp,
  type RasterGeoreferencePayload,
  type ServerRasterLayerConfig,
} from '../../../../lib/raster/siRasterTileService'
import {
  bboxOfGeometry,
  nextGcpId,
  parseNum,
  placementBoundsInViewport,
  pointsFootprint,
  quadFootprint,
  rectFootprint,
  type GeoBounds,
  type GeorefGcpDraft,
  type GeorefMode,
  type GeorefPending,
  type LonLatDraft,
} from '../../../../lib/raster/rasterGeorefPlacement'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  saveProject,
  upsertProjectRaster,
  DEFAULT_DISPLAY,
  type RasterDisplaySettings,
  type RasterGeorefProject,
} from '../../../../lib/raster/rasterGeorefProjects'
import {
  buildRasterImageOverlay,
  imageOverlayCornersFromConfig,
  isPlainRasterImageFile,
  type RasterImageOverlay,
} from '../../../../lib/raster/siRasterTileService'
import { assignRasterCrs } from '../../../../lib/raster/crsCatalog'
import {
  estimateAlignmentOnDevice,
  estimateAlignmentWithGemini,
  type SmartAlignEngine,
  type SmartBounds,
} from '../../../../lib/raster/smartAutoGeoreference'

export type { GeorefMode, GeorefPending, LonLatDraft, GeorefGcpDraft } from '../../../../lib/raster/rasterGeorefPlacement'
export type { RasterDisplaySettings, RasterGeorefProject } from '../../../../lib/raster/rasterGeorefProjects'
export type { RasterMapCoordinates } from '../../../../lib/raster/siRasterMapLayer'
export type { RasterImageOverlay } from '../../../../lib/raster/siRasterTileService'

export type UseRasterGeoreferenceToolOptions = {
  /** Upload + poll a raster, returning a Mapbox-ready tile config (reuses /api/raster). */
  ingest: (files: File[], onStatus?: (message: string) => void) => Promise<ServerRasterLayerConfig>
  /**
   * Called once a raster is ready so the host can add it to the map + fit bounds.
   * For plain images an `imageOverlay` is supplied so the host renders a Mapbox image
   * source (undistorted RGB) instead of the multiband tile layer.
   */
  onRasterReady?: (config: ServerRasterLayerConfig, imageOverlay?: RasterImageOverlay | null) => void
  /** Called when the active raster is cleared so the host can remove its map layer. */
  onRasterCleared?: () => void
  /** Returns the polygon currently drawn on the map (rectangle sketch), or null. */
  getDrawnPolygon?: () => GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  /** Returns the current map viewport bounds (WGS84) so non-georeferenced images auto-place. */
  getMapBounds?: () => GeoBounds | null
  /** Returns the last point clicked on the map (WGS84), for GCP capture. */
  getLastMapClick?: () => { lon: number; lat: number } | null
  /** Called with the georeferencing footprint preview (or null to clear) for the map overlay. */
  onGeorefFootprintPreview?: (fc: GeoJSON.FeatureCollection | null) => void
  /**
   * Called with the live control-point overlay (numbered source/target markers + link lines)
   * so the host can draw them directly on the map canvas, ArcGIS-style. Null clears it.
   */
  onGcpOverlay?: (fc: GeoJSON.FeatureCollection | null) => void
  /** Called whenever display settings change so the host can update raster paint properties. */
  onDisplayChange?: (rasterId: string, display: RasterDisplaySettings) => void
  /** Rotate the map to a bearing (degrees). */
  onRotate?: (bearing: number) => void
  /** Reset the map bearing/pitch to north-up. */
  onResetNorth?: () => void
  /** Resolve a displayable image URL (decoded RGB) for a raster, used by Smart Auto Georeference. */
  getRasterPreviewUrl?: (config: ServerRasterLayerConfig) => string | null
  /**
   * Capture a basemap-only snapshot covering the given footprint corners (raster hidden),
   * returning an image URL plus the WGS84 bounds it spans. Powers Smart Auto Georeference.
   */
  captureBasemapImage?: (
    corners: CornerQuad,
  ) => Promise<{ url: string; bounds: SmartBounds } | null>
  /** Effective Gemini API key for the AI matching engine. */
  getGeminiApiKey?: () => string
}

export type UseRasterGeoreferenceToolReturn = {
  raster: ServerRasterLayerConfig | null
  busy: boolean
  error: string | null
  statusMessage: string | null
  uploadRaster: (files: File[]) => Promise<void>
  /** Adopt a raster already on the map (selected in the layer list) as the active target. */
  selectExistingRaster: (config: ServerRasterLayerConfig) => void
  clearRaster: () => void
  // Georeferencing
  georefPending: GeorefPending | null
  georefBusy: boolean
  georefMode: GeorefMode
  setGeorefMode: (mode: GeorefMode) => void
  georefSourceDetected: string | null
  georefBbox: { west: string; south: string; east: string; north: string }
  setGeorefBboxField: (key: 'west' | 'south' | 'east' | 'north', value: string) => void
  georefCorners: { nw: LonLatDraft; ne: LonLatDraft; se: LonLatDraft; sw: LonLatDraft }
  setGeorefCornerField: (corner: 'nw' | 'ne' | 'se' | 'sw', axis: 'lon' | 'lat', value: string) => void
  georefGcps: GeorefGcpDraft[]
  addGeorefGcp: () => void
  updateGeorefGcp: (id: string, field: keyof Omit<GeorefGcpDraft, 'id'>, value: string) => void
  removeGeorefGcp: (id: string) => void
  captureGcpMapPoint: (id: string) => void
  // ── ArcGIS-style two-click control-point picking (source image → reference map) ──
  /** True while the interactive add-control-points workflow is armed. */
  gcpPicking: boolean
  /** Which half of the pair the next map click captures. */
  gcpPickPhase: 'from' | 'to'
  /** Arm the two-click GCP workflow (click source image, then the matching map location). */
  startGcpPicking: () => void
  /** Disarm the two-click GCP workflow. */
  stopGcpPicking: () => void
  /** Feed a map click into the two-click workflow; the host calls this while picking. */
  handleGcpMapClick: (lon: number, lat: number) => void
  /** Total RMS residual of the current control points in metres (null when < 3 points). */
  gcpRms: number | null
  /** Undo the last-added control point (kept for redo). */
  undoGcp: () => void
  /** Re-add the last undone control point. */
  redoGcp: () => void
  /** Whether an undo / redo is currently possible. */
  canUndoGcp: boolean
  canRedoGcp: boolean
  /** Warp using the collected control points (works for both pending and placed rasters). */
  applyGcps: () => Promise<string | null>
  applyGeoreference: () => Promise<string | null>
  applyGeoreferenceFromDrawn: () => Promise<string | null>
  placeAtCurrentView: () => Promise<string | null>
  cancelGeoreference: () => void
  // ── ArcGIS-style direct on-canvas manipulation (drag = move / rotate / scale) ──
  /** Which direct-manipulation tool is armed (null = none). Interaction happens on the map. */
  manipMode: 'move' | 'rotate' | 'scale' | null
  /** Arm/disarm a direct-manipulation tool (mutually exclusive with control-point picking). */
  setManipMode: (mode: 'move' | 'rotate' | 'scale' | null) => void
  /** The raster's current placed corner quad (NW,NE,SE,SW) for the host's drag gesture. */
  getManipQuad: () => CornerQuad | null
  /** Commit a dragged quad to the raster (persists the georeference on the server). */
  commitManipQuad: (quad: CornerQuad) => Promise<string | null>
  // ── Interactive transforms on the placed raster (re-georeference on the server) ──
  moveRaster: (dir: 'n' | 's' | 'e' | 'w', frac?: number) => Promise<string | null>
  scaleRaster: (factor: number) => Promise<string | null>
  rotateRaster: (deg: number) => Promise<string | null>
  flipRaster: (axis: 'h' | 'v') => Promise<string | null>
  resetRasterNorth: () => Promise<string | null>
  autoGeoreference: () => Promise<string | null>
  // ── Smart Auto Georeference (AI / on-device image↔basemap matching) ──
  smartBusy: boolean
  smartError: string | null
  smartResult: SmartGeorefResult | null
  /** Run smart matching with the chosen engine; produces a reviewable proposal (no apply). */
  runSmartAutoGeoreference: (engine: SmartAlignEngine) => Promise<void>
  /** Run on-device smart matching and apply it immediately (no review step). */
  runSmartAutoGeoreferenceDirect: () => Promise<string | null>
  /** Apply the reviewed smart proposal to the raster. */
  applySmartResult: () => Promise<string | null>
  /** Discard the smart proposal and clear its preview. */
  discardSmartResult: () => void
  importGcps: (rows: Array<{ col: number; row: number; lon: number; lat: number }>) => void
  importGcpsFromFile: (file: File) => Promise<void>
  // Display controls
  display: RasterDisplaySettings
  setDisplayField: (key: keyof RasterDisplaySettings, value: number) => void
  resetDisplay: () => void
  rotateTo: (bearing: number) => void
  resetNorth: () => void
  // Coordinate system
  assignCrs: (code: string) => Promise<string | null>
  assigningCrs: boolean
  // Export
  exportGeoTiff: () => Promise<void>
  /** Write the georeference into the image files as a world file (.wld) + .prj sidecar. */
  exportWorldFile: () => string | null
  exporting: boolean
  // Projects
  projects: RasterGeorefProject[]
  currentProject: RasterGeorefProject | null
  refreshProjects: () => void
  newProject: (name: string) => void
  openProject: (id: string) => Promise<void>
  saveCurrentProject: () => void
  renameCurrentProject: (name: string) => void
  deleteCurrentProject: () => void
}

const emptyLonLat: LonLatDraft = { lon: '', lat: '' }

/** Four map corners of a placed raster (image NW/NE/SE/SW → [lon, lat]). */
export type CornerQuad = {
  nw: [number, number]
  ne: [number, number]
  se: [number, number]
  sw: [number, number]
}

/** A reviewable Smart Auto Georeference proposal (not yet applied). */
export type SmartGeorefResult = {
  quad: CornerQuad
  confidence: number
  engine: SmartAlignEngine
  note: string
}
function quadFromBounds(b: { west: number; south: number; east: number; north: number }): CornerQuad {
  return { nw: [b.west, b.north], ne: [b.east, b.north], se: [b.east, b.south], sw: [b.west, b.south] }
}
/**
 * The raster's TRUE placed corners (NW,NE,SE,SW) from its saved georeference transform —
 * the server footprint polygon (which reflects rotation/affine from GCPs), falling back to
 * the axis-aligned WGS84 bbox only when no footprint exists. Always coordinate-based, never
 * derived from the map view, so the placement stays fixed under zoom/pan.
 */
function quadFromConfig(config: ServerRasterLayerConfig): CornerQuad {
  const c = imageOverlayCornersFromConfig(config)
  return { nw: c[0], ne: c[1], se: c[2], sw: c[3] }
}
function quadCentroid(q: CornerQuad): [number, number] {
  const pts = [q.nw, q.ne, q.se, q.sw]
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ]
}
function mapQuad(q: CornerQuad, fn: (p: [number, number]) => [number, number]): CornerQuad {
  return { nw: fn(q.nw), ne: fn(q.ne), se: fn(q.se), sw: fn(q.sw) }
}

/** Parse a control-point file (CSV/TSV/whitespace): rows of col,row,lon,lat (header optional). */
function parseControlPointsText(text: string): Array<{ col: number; row: number; lon: number; lat: number }> {
  const out: Array<{ col: number; row: number; lon: number; lat: number }> = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const nums = line
      .split(/[\s,;]+/)
      .map(t => Number(t))
      .filter(n => Number.isFinite(n))
    if (nums.length >= 4) {
      out.push({ col: nums[0], row: nums[1], lon: nums[2], lat: nums[3] })
    }
  }
  return out
}

/** WGS84 (EPSG:4326) well-known-text, written next to world files as a .prj sidecar. */
const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]'

/** Trigger a client-side download of a small text sidecar (world file / .prj). */
function downloadTextSidecar(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Approximate distance (metres) between two lon/lat points — equirectangular, fine at GCP scale. */
function metresBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371008.8
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.hypot(x, y) * R
}

/** Total RMS residual (metres) of an affine fit over the GCPs; null for < 3 (exact) points. */
function gcpResidualMetres(
  gcps: Array<{ col: number; row: number; lon: number; lat: number }>,
): number | null {
  if (gcps.length < 3) return null
  let Scc = 0, Srr = 0, Scr = 0, Sc = 0, Sr = 0, n = 0
  let Sxc = 0, Sxr = 0, Sx = 0, Syc = 0, Syr = 0, Sy = 0
  for (const g of gcps) {
    Scc += g.col * g.col; Srr += g.row * g.row; Scr += g.col * g.row
    Sc += g.col; Sr += g.row; n += 1
    Sxc += g.lon * g.col; Sxr += g.lon * g.row; Sx += g.lon
    Syc += g.lat * g.col; Syr += g.lat * g.row; Sy += g.lat
  }
  const M: number[][] = [[Scc, Scr, Sc], [Scr, Srr, Sr], [Sc, Sr, n]]
  const solX = solve3(M, [Sxc, Sxr, Sx])
  const solY = solve3(M, [Syc, Syr, Sy])
  if (!solX || !solY) return null
  let sum = 0
  for (const g of gcps) {
    const predLon = solX[0] * g.col + solX[1] * g.row + solX[2]
    const predLat = solY[0] * g.col + solY[1] * g.row + solY[2]
    const d = metresBetween(g.lon, g.lat, predLon, predLat)
    sum += d * d
  }
  return Math.sqrt(sum / gcps.length)
}

/** Axis-aligned bounds of a corner quad. */
function quadToBounds(q: CornerQuad): { west: number; south: number; east: number; north: number } {
  const xs = [q.nw[0], q.ne[0], q.se[0], q.sw[0]]
  const ys = [q.nw[1], q.ne[1], q.se[1], q.sw[1]]
  return { west: Math.min(...xs), south: Math.min(...ys), east: Math.max(...xs), north: Math.max(...ys) }
}

/** Affine coefficients mapping image pixel (col,row) → map (lon,lat): x=a·col+b·row+c, y=d·col+e·row+f. */
type Affine = { a: number; b: number; c: number; d: number; e: number; f: number }

/** Derive the affine of a placed corner quad over a w×h image (NW=(0,0), NE=(w,0), SW=(0,h)). */
function affineFromQuad(q: CornerQuad, w: number, h: number): Affine {
  const a = (q.ne[0] - q.nw[0]) / w
  const b = (q.sw[0] - q.nw[0]) / h
  const d = (q.ne[1] - q.nw[1]) / w
  const e = (q.sw[1] - q.nw[1]) / h
  return { a, b, c: q.nw[0], d, e, f: q.nw[1] }
}

/** Inverse of {@link affineFromQuad}: map (lon,lat) on a placed raster → image pixel (col,row). */
function imagePixelFromMap(
  q: CornerQuad,
  w: number,
  h: number,
  lon: number,
  lat: number,
): { col: number; row: number } | null {
  const A = affineFromQuad(q, w, h)
  const det = A.a * A.e - A.b * A.d
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null
  const dx = lon - A.c
  const dy = lat - A.f
  const col = (A.e * dx - A.b * dy) / det
  const row = (-A.d * dx + A.a * dy) / det
  return { col, row }
}

/**
 * Build a placement corner quad from as few as ONE control point, ArcGIS-style:
 *   • 1 point  → translation (shift) that keeps the current scale/rotation (from `fallback`).
 *   • 2 points → similarity (shift + uniform scale + rotation).
 *   • 3+ points→ affine least-squares fit.
 * `fallback` supplies an initial scale/rotation for the single-point (shift-only) case.
 */
function cornersFromGcps(
  gcps: Array<{ col: number; row: number; lon: number; lat: number }>,
  w: number,
  h: number,
  fallback: CornerQuad | null,
): CornerQuad | null {
  if (!w || !h || gcps.length === 0) return null
  let A: Affine

  if (gcps.length === 1) {
    const base: Affine = fallback ? affineFromQuad(fallback, w, h) : { a: 1 / w, b: 0, c: 0, d: 0, e: -1 / h, f: 0 }
    const g = gcps[0]
    A = {
      a: base.a,
      b: base.b,
      d: base.d,
      e: base.e,
      c: g.lon - (base.a * g.col + base.b * g.row),
      f: g.lat - (base.d * g.col + base.e * g.row),
    }
  } else if (gcps.length === 2) {
    // Similarity: lon = p·col − q·row + tx ; lat = q·col + p·row + ty.
    const [g1, g2] = gcps
    const dcol = g2.col - g1.col
    const drow = g2.row - g1.row
    const dlon = g2.lon - g1.lon
    const dlat = g2.lat - g1.lat
    const denom = dcol * dcol + drow * drow
    if (denom === 0) return null
    const p = (dcol * dlon + drow * dlat) / denom
    const q = (dcol * dlat - drow * dlon) / denom
    A = {
      a: p,
      b: -q,
      c: g1.lon - (p * g1.col - q * g1.row),
      d: q,
      e: p,
      f: g1.lat - (q * g1.col + p * g1.row),
    }
  } else {
    // Affine least squares over col,row → lon and → lat (shared 3×3 normal matrix).
    let Scc = 0, Srr = 0, Scr = 0, Sc = 0, Sr = 0, n = 0
    let Sxc = 0, Sxr = 0, Sx = 0, Syc = 0, Syr = 0, Sy = 0
    for (const g of gcps) {
      Scc += g.col * g.col
      Srr += g.row * g.row
      Scr += g.col * g.row
      Sc += g.col
      Sr += g.row
      n += 1
      Sxc += g.lon * g.col
      Sxr += g.lon * g.row
      Sx += g.lon
      Syc += g.lat * g.col
      Syr += g.lat * g.row
      Sy += g.lat
    }
    const M: number[][] = [
      [Scc, Scr, Sc],
      [Scr, Srr, Sr],
      [Sc, Sr, n],
    ]
    const solX = solve3(M, [Sxc, Sxr, Sx])
    const solY = solve3(M, [Syc, Syr, Sy])
    if (!solX || !solY) return null
    A = { a: solX[0], b: solX[1], c: solX[2], d: solY[0], e: solY[1], f: solY[2] }
  }

  const map = (col: number, row: number): [number, number] => [
    A.a * col + A.b * row + A.c,
    A.d * col + A.e * row + A.f,
  ]
  return { nw: map(0, 0), ne: map(w, 0), se: map(w, h), sw: map(0, h) }
}

/** Solve a 3×3 linear system M·x = v via Gaussian elimination (null if singular). */
function solve3(M: number[][], v: number[]): [number, number, number] | null {
  const m = M.map((row, i) => [...row, v[i]])
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < 3; r++) {
      if (r === col) continue
      const factor = m[r][col] / m[col][col]
      for (let k = col; k <= 3; k++) m[r][k] -= factor * m[col][k]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

export function useRasterGeoreferenceTool(
  opts: UseRasterGeoreferenceToolOptions,
): UseRasterGeoreferenceToolReturn {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const [raster, setRaster] = useState<ServerRasterLayerConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [assigningCrs, setAssigningCrs] = useState(false)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartError, setSmartError] = useState<string | null>(null)
  const [smartResult, setSmartResult] = useState<SmartGeorefResult | null>(null)

  const [georefPending, setGeorefPending] = useState<GeorefPending | null>(null)
  const [georefBusy, setGeorefBusy] = useState(false)
  const [georefMode, setGeorefMode] = useState<GeorefMode>('bbox')
  const [georefSourceDetected, setGeorefSourceDetected] = useState<string | null>(null)
  const [georefBbox, setGeorefBbox] = useState({ west: '', south: '', east: '', north: '' })
  const [georefCorners, setGeorefCorners] = useState<{
    nw: LonLatDraft
    ne: LonLatDraft
    se: LonLatDraft
    sw: LonLatDraft
  }>({ nw: { ...emptyLonLat }, ne: { ...emptyLonLat }, se: { ...emptyLonLat }, sw: { ...emptyLonLat } })
  const [georefGcps, setGeorefGcps] = useState<GeorefGcpDraft[]>([])
  const [gcpPicking, setGcpPicking] = useState(false)
  const [gcpPickPhase, setGcpPickPhase] = useState<'from' | 'to'>('from')
  const gcpFromRef = useRef<{ col: number; row: number } | null>(null)
  // Redo stack for undone control points (ArcGIS-style Undo/Redo while picking).
  const [gcpRedo, setGcpRedo] = useState<GeorefGcpDraft[]>([])
  // ArcGIS-style direct manipulation tool armed for on-canvas drag (move/rotate/scale).
  const [manipMode, setManipModeState] = useState<'move' | 'rotate' | 'scale' | null>(null)

  const [display, setDisplay] = useState<RasterDisplaySettings>({ ...DEFAULT_DISPLAY })
  const [projects, setProjects] = useState<RasterGeorefProject[]>(() => listProjects())
  const [currentProject, setCurrentProject] = useState<RasterGeorefProject | null>(null)

  // Refs keep placement callbacks stable regardless of input churn.
  const georefPendingRef = useRef(georefPending)
  georefPendingRef.current = georefPending
  const georefModeRef = useRef(georefMode)
  georefModeRef.current = georefMode
  const georefBboxRef = useRef(georefBbox)
  georefBboxRef.current = georefBbox
  const georefCornersRef = useRef(georefCorners)
  georefCornersRef.current = georefCorners
  const georefGcpsRef = useRef(georefGcps)
  georefGcpsRef.current = georefGcps
  const currentProjectRef = useRef(currentProject)
  currentProjectRef.current = currentProject
  const rasterRefForDisplay = useRef(raster)
  rasterRefForDisplay.current = raster
  // The current placed footprint as a corner quad, so Move/Scale/Rotate/Flip accumulate
  // correctly (the server's axis-aligned bbox alone would drop any rotation).
  const currentCornersRef = useRef<CornerQuad | null>(null)
  // The original plain-image File (PNG/JPEG/...) from the last upload, kept so it can be
  // rendered pixel-perfect via a Mapbox image source rather than the server tile pipeline.
  const lastImageFileRef = useRef<File | null>(null)

  const refreshProjects = useCallback(() => setProjects(listProjects()), [])

  // Build an image-source overlay from the ORIGINAL uploaded file + the ready placement.
  const buildImageOverlay = useCallback(
    (config: ServerRasterLayerConfig): Promise<RasterImageOverlay | null> =>
      buildRasterImageOverlay(lastImageFileRef.current, config),
    [],
  )

  // Record a ready raster into the in-memory project (persisted on Save).
  const recordRasterIntoProject = useCallback(
    (config: ServerRasterLayerConfig, placement: RasterGeoreferencePayload | null, disp: RasterDisplaySettings) => {
      const proj = currentProjectRef.current
      if (!proj) return
      const next = upsertProjectRaster(proj, {
        rasterId: config.rasterId,
        name: config.name,
        placement,
        display: disp,
      })
      setCurrentProject(next)
    },
    [],
  )

  const uploadRaster = useCallback(async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setError(null)
    setGeorefPending(null)
    setGeorefSourceDetected(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
    setStatusMessage('Uploading raster…')
    // Remember the primary plain image so it can be rendered via an image source.
    const primary =
      files.find(f => /\.(tif|tiff|jp2|j2k)$/i.test(f.name)) ||
      files.find(f => isPlainRasterImageFile(f)) ||
      files[0]
    lastImageFileRef.current = isPlainRasterImageFile(primary) ? primary : null
    try {
      const config = await optsRef.current.ingest(files, message => setStatusMessage(message))
      setRaster(config)
      currentCornersRef.current = quadFromConfig(config)
      setGeorefSourceDetected(config.georefSource ?? null)
      setStatusMessage(`Raster ready: ${config.name}`)
      const disp = { ...DEFAULT_DISPLAY }
      setDisplay(disp)
      const overlay = await buildImageOverlay(config)
      optsRef.current.onRasterReady?.(config, overlay)
      recordRasterIntoProject(config, null, disp)
    } catch (err) {
      if (err instanceof RasterNeedsGeoreferenceError) {
        setGeorefPending({
          rasterId: err.rasterId,
          name: err.rasterName,
          widthPx: err.widthPx,
          heightPx: err.heightPx,
        })
        const viewport = optsRef.current.getMapBounds?.() ?? null
        if (viewport) {
          const guess = placementBoundsInViewport(viewport, err.widthPx, err.heightPx)
          setGeorefBbox({
            west: guess.west.toFixed(6),
            south: guess.south.toFixed(6),
            east: guess.east.toFixed(6),
            north: guess.north.toFixed(6),
          })
        }
        setGeorefMode('bbox')
        setStatusMessage(
          'This image has no geographic information. Set its true location below (bounding box, corners, or GCPs), then apply.',
        )
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'Raster upload failed')
        setStatusMessage(null)
      }
    } finally {
      setBusy(false)
    }
  }, [recordRasterIntoProject, buildImageOverlay])

  const clearRaster = useCallback(() => {
    setRaster(null)
    currentCornersRef.current = null
    setGeorefPending(null)
    setGeorefSourceDetected(null)
    setStatusMessage(null)
    setError(null)
    setSmartResult(null)
    setSmartError(null)
    setGcpPicking(false)
    gcpFromRef.current = null
    setGeorefGcps([])
    setGcpRedo([])
    setManipModeState(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
    optsRef.current.onGcpOverlay?.(null)
    optsRef.current.onRasterCleared?.()
  }, [])

  // Adopt a raster already on the map (chosen in the layer list) as the tool's active
  // target, so Move/Scale/Rotate/Smart Auto Georeference operate on it without re-upload.
  const selectExistingRaster = useCallback((config: ServerRasterLayerConfig) => {
    lastImageFileRef.current = null
    setGeorefPending(null)
    setError(null)
    setSmartResult(null)
    setSmartError(null)
    setGeorefSourceDetected(config.georefSource ?? null)
    currentCornersRef.current = quadFromConfig(config)
    setRaster(config)
    setStatusMessage(`Georeferencing map raster: ${config.name}`)
  }, [])

  const buildGeorefPayload = useCallback((): RasterGeoreferencePayload | string => {
    const mode = georefModeRef.current
    if (mode === 'bbox') {
      const b = georefBboxRef.current
      const west = parseNum(b.west)
      const south = parseNum(b.south)
      const east = parseNum(b.east)
      const north = parseNum(b.north)
      if ([west, south, east, north].some(v => v === null)) return 'Enter west, south, east and north.'
      if ((east as number) <= (west as number) || (north as number) <= (south as number)) {
        return 'Bounding box needs west < east and south < north.'
      }
      return { mode: 'bbox', bounds: { west: west!, south: south!, east: east!, north: north! } }
    }
    if (mode === 'corners') {
      const c = georefCornersRef.current
      const read = (k: 'nw' | 'ne' | 'se' | 'sw'): [number, number] | null => {
        const lon = parseNum(c[k].lon)
        const lat = parseNum(c[k].lat)
        return lon === null || lat === null ? null : [lon, lat]
      }
      const nw = read('nw')
      const ne = read('ne')
      const se = read('se')
      const sw = read('sw')
      if (!nw || !ne || !se || !sw) return 'Enter lon/lat for all four corners (NW, NE, SE, SW).'
      return { mode: 'corners', corners: { nw, ne, se, sw } }
    }
    const gcps: RasterGcp[] = []
    for (const g of georefGcpsRef.current) {
      const col = parseNum(g.col)
      const row = parseNum(g.row)
      const lon = parseNum(g.lon)
      const lat = parseNum(g.lat)
      if ([col, row, lon, lat].every(v => v !== null)) {
        gcps.push({ col: col!, row: row!, lon: lon!, lat: lat! })
      }
    }
    if (gcps.length === 0) {
      return 'Add at least one complete control point (col, row, lon, lat).'
    }
    // 3+ points: let the server fit the full (affine/polynomial) transform. Fewer points:
    // synthesize a placement so a single point (shift) or two points (similarity) still work.
    if (gcps.length >= 3) return { mode: 'gcps', gcps }
    const dims =
      rasterRefForDisplay.current
        ? { w: rasterRefForDisplay.current.widthPx || 0, h: rasterRefForDisplay.current.heightPx || 0 }
        : georefPendingRef.current
          ? { w: georefPendingRef.current.widthPx || 0, h: georefPendingRef.current.heightPx || 0 }
          : { w: 0, h: 0 }
    // Fallback scale/rotation for the single-point (shift) and two-point (similarity)
    // cases: the current placement (or pending draft) resolved by effectiveQuad(). This
    // guarantees 1–2 control points always warp via a valid `corners` payload — the
    // server never sees a bbox here, so "Invalid bounds" can't happen (ArcGIS-style).
    let fallback: CornerQuad | null = effectiveQuad()
    if (!fallback && rasterRefForDisplay.current) {
      fallback = quadFromBounds(rasterRefForDisplay.current.bboxWgs84)
    }
    const quad = cornersFromGcps(gcps, dims.w, dims.h, fallback)
    if (!quad) {
      return gcps.length === 1
        ? 'Add a bounding-box or Fit-to-Display first so a single control point can shift the image.'
        : 'The two control points are identical; move one before applying.'
    }
    return { mode: 'corners', corners: quad }
    // effectiveQuad is stable (defined later, [] deps) — kept out of deps to avoid a TDZ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPlacement = useCallback(
    async (rasterId: string, placement: RasterGeoreferencePayload): Promise<string | null> => {
      setGeorefBusy(true)
      setError(null)
      setStatusMessage('Placing image on the map…')
      try {
        const config = await georeferenceRasterOnServer(rasterId, placement)
        setRaster(config)
        // Keep the tool's working quad tied to the SAVED transform (server footprint for
        // gcps/bbox, or the exact corners we sent) — never the map view — so the raster
        // stays put under zoom/pan and later edits build on the real placement.
        currentCornersRef.current =
          placement.mode === 'corners' ? placement.corners : quadFromConfig(config)
        setGeorefPending(null)
        setGeorefSourceDetected(config.georefSource ?? `manual:${placement.mode}`)
        setStatusMessage(`Raster ready: ${config.name}`)
        const disp = { ...DEFAULT_DISPLAY }
        setDisplay(disp)
        optsRef.current.onGeorefFootprintPreview?.(null)
        const overlay = await buildImageOverlay(config)
        optsRef.current.onRasterReady?.(config, overlay)
        recordRasterIntoProject(config, placement, disp)
        return null
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Georeferencing failed'
        setError(msg)
        setStatusMessage(null)
        return msg
      } finally {
        setGeorefBusy(false)
      }
    },
    [recordRasterIntoProject, buildImageOverlay],
  )

  const applyGeoreference = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const payload = buildGeorefPayload()
    if (typeof payload === 'string') {
      setError(payload)
      return payload
    }
    return applyPlacement(pending.rasterId, payload)
  }, [applyPlacement, buildGeorefPayload])

  // Warp using the collected control points — works for a pending draft OR a raster
  // already placed on the map (ArcGIS-style incremental control-point georeferencing).
  const applyGcps = useCallback(async (): Promise<string | null> => {
    const rasterId = georefPendingRef.current?.rasterId ?? rasterRefForDisplay.current?.rasterId
    if (!rasterId) {
      setError('Load or select a raster first.')
      return 'no raster'
    }
    setGeorefMode('gcps')
    const payload = buildGeorefPayload()
    if (typeof payload === 'string') {
      setError(payload)
      return payload
    }
    const res = await applyPlacement(rasterId, payload)
    if (res === null) {
      gcpFromRef.current = null
      setGcpPickPhase('from')
    }
    return res
  }, [applyPlacement, buildGeorefPayload])

  const applyGeoreferenceFromDrawn = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const geometry = optsRef.current.getDrawnPolygon?.() ?? null
    const bounds = bboxOfGeometry(geometry)
    if (!bounds) {
      const msg = 'Draw a rectangle on the map to place the image first.'
      setError(msg)
      return msg
    }
    return applyPlacement(pending.rasterId, { mode: 'bbox', bounds })
  }, [applyPlacement])

  const placeAtCurrentView = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const viewport = optsRef.current.getMapBounds?.() ?? null
    if (!viewport) {
      const msg = 'Map view is unavailable; enter a bounding box instead.'
      setError(msg)
      return msg
    }
    const bounds = placementBoundsInViewport(viewport, pending.widthPx, pending.heightPx)
    return applyPlacement(pending.rasterId, { mode: 'bbox', bounds })
  }, [applyPlacement])

  const cancelGeoreference = useCallback(() => {
    setGeorefPending(null)
    setStatusMessage(null)
    setError(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
  }, [])

  // ── Interactive placement transforms ──
  // These work in TWO states so a raster can be processed the moment it lands on the map
  // (ArcGIS-Pro style), whether or not it already has a spatial reference:
  //   • PLACED raster  → re-georeferences on the server (a real, persisted georeference).
  //   • PENDING raster (a just-added, geographically-undefined image) → edits the live
  //     draft placement so the footprint moves/scales/rotates before you Apply.
  // `effectiveQuad` reads whichever placement is active; `commitQuad` writes it back to
  // the right place.
  const effectiveQuad = useCallback((): CornerQuad | null => {
    const current = rasterRefForDisplay.current
    if (current) return currentCornersRef.current ?? quadFromBounds(current.bboxWgs84)
    if (georefPendingRef.current) {
      const c = georefCornersRef.current
      const read = (k: 'nw' | 'ne' | 'se' | 'sw'): [number, number] | null => {
        const lon = parseNum(c[k].lon)
        const lat = parseNum(c[k].lat)
        return lon === null || lat === null ? null : [lon, lat]
      }
      const nw = read('nw')
      const ne = read('ne')
      const se = read('se')
      const sw = read('sw')
      if (nw && ne && se && sw) return { nw, ne, se, sw }
      const b = georefBboxRef.current
      const west = parseNum(b.west)
      const south = parseNum(b.south)
      const east = parseNum(b.east)
      const north = parseNum(b.north)
      if (west !== null && south !== null && east !== null && north !== null) {
        return quadFromBounds({ west, south, east, north })
      }
    }
    return null
  }, [])

  const commitQuad = useCallback(
    async (quad: CornerQuad): Promise<string | null> => {
      const current = rasterRefForDisplay.current
      if (current) {
        const res = await applyPlacement(current.rasterId, { mode: 'corners', corners: quad })
        if (res === null) currentCornersRef.current = quad
        return res
      }
      if (georefPendingRef.current) {
        // Update the draft; the live-preview effect redraws the footprint automatically.
        setGeorefCorners({
          nw: { lon: String(quad.nw[0]), lat: String(quad.nw[1]) },
          ne: { lon: String(quad.ne[0]), lat: String(quad.ne[1]) },
          se: { lon: String(quad.se[0]), lat: String(quad.se[1]) },
          sw: { lon: String(quad.sw[0]), lat: String(quad.sw[1]) },
        })
        setGeorefMode('corners')
        setError(null)
        setStatusMessage('Adjusted the draft placement — Apply to bake the georeference.')
        return null
      }
      setError('Load or select a raster first.')
      return 'no raster'
    },
    [applyPlacement],
  )

  const moveRaster = useCallback(
    async (dir: 'n' | 's' | 'e' | 'w', frac = 0.05): Promise<string | null> => {
      const q = effectiveQuad()
      if (!q) {
        setError('Load or select a raster first.')
        return 'no raster'
      }
      const bb = quadToBounds(q)
      const dLon = (bb.east - bb.west) * frac
      const dLat = (bb.north - bb.south) * frac
      const ox = dir === 'e' ? dLon : dir === 'w' ? -dLon : 0
      const oy = dir === 'n' ? dLat : dir === 's' ? -dLat : 0
      return commitQuad(mapQuad(q, p => [p[0] + ox, p[1] + oy]))
    },
    [effectiveQuad, commitQuad],
  )

  const scaleRaster = useCallback(
    async (factor: number): Promise<string | null> => {
      const q = effectiveQuad()
      if (!q) {
        setError('Load or select a raster first.')
        return 'no raster'
      }
      const c = quadCentroid(q)
      return commitQuad(
        mapQuad(q, p => [c[0] + (p[0] - c[0]) * factor, c[1] + (p[1] - c[1]) * factor]),
      )
    },
    [effectiveQuad, commitQuad],
  )

  const rotateRaster = useCallback(
    async (deg: number): Promise<string | null> => {
      const q = effectiveQuad()
      if (!q) {
        setError('Load or select a raster first.')
        return 'no raster'
      }
      const c = quadCentroid(q)
      const th = (deg * Math.PI) / 180
      const kx = Math.max(Math.cos((c[1] * Math.PI) / 180), 1e-6)
      const cos = Math.cos(th)
      const sin = Math.sin(th)
      return commitQuad(
        mapQuad(q, p => {
          const dx = (p[0] - c[0]) * kx
          const dy = p[1] - c[1]
          const rx = dx * cos - dy * sin
          const ry = dx * sin + dy * cos
          return [c[0] + rx / kx, c[1] + ry]
        }),
      )
    },
    [effectiveQuad, commitQuad],
  )

  const flipRaster = useCallback(
    async (axis: 'h' | 'v'): Promise<string | null> => {
      const q = effectiveQuad()
      if (!q) {
        setError('Load or select a raster first.')
        return 'no raster'
      }
      const c = quadCentroid(q)
      return commitQuad(
        axis === 'h'
          ? mapQuad(q, p => [2 * c[0] - p[0], p[1]])
          : mapQuad(q, p => [p[0], 2 * c[1] - p[1]]),
      )
    },
    [effectiveQuad, commitQuad],
  )

  const resetRasterNorth = useCallback(async (): Promise<string | null> => {
    const current = rasterRefForDisplay.current
    if (current) {
      const b = current.bboxWgs84
      const bounds = { west: b.west, south: b.south, east: b.east, north: b.north }
      const res = await applyPlacement(current.rasterId, { mode: 'bbox', bounds })
      if (res === null) currentCornersRef.current = quadFromBounds(bounds)
      return res
    }
    if (georefPendingRef.current) {
      const q = effectiveQuad()
      if (!q) {
        setError('Set a placement first.')
        return 'no placement'
      }
      const bb = quadToBounds(q)
      setGeorefBbox({
        west: bb.west.toFixed(6),
        south: bb.south.toFixed(6),
        east: bb.east.toFixed(6),
        north: bb.north.toFixed(6),
      })
      setGeorefMode('bbox')
      setError(null)
      setStatusMessage('Reset to north-up — Apply to bake the georeference.')
      return null
    }
    setError('Load or select a raster first.')
    return 'no raster'
  }, [applyPlacement, effectiveQuad])

  // Best-effort auto-georeference: if the image is unplaced, fit it to the current
  // view; if it is already placed, re-fit it aspect-correct to the current view.
  const autoGeoreference = useCallback(async (): Promise<string | null> => {
    if (georefPendingRef.current) return placeAtCurrentView()
    const current = rasterRefForDisplay.current
    if (!current) {
      setError('Load or select a raster first.')
      return 'no raster'
    }
    const viewport = optsRef.current.getMapBounds?.() ?? null
    if (!viewport) {
      const msg = 'Map view unavailable; use manual placement.'
      setError(msg)
      return msg
    }
    const bounds = placementBoundsInViewport(viewport, current.widthPx || 1024, current.heightPx || 1024)
    const res = await applyPlacement(current.rasterId, { mode: 'bbox', bounds })
    if (res === null) currentCornersRef.current = quadFromBounds(bounds)
    return res
  }, [applyPlacement, placeAtCurrentView])

  // ── ArcGIS-style live georeferencing ──
  // Whenever the control points change (added, dragged, or removed) while the control-
  // point tool is the active mode, re-warp the raster automatically — no Apply click.
  // buildGeorefPayload always emits a `corners` (1–2 pts) or `gcps` (3+ pts) payload, so
  // the server never receives a bbox here and "Invalid bounds" cannot occur.
  const gcpApplyingRef = useRef(false)
  useEffect(() => {
    if (georefModeRef.current !== 'gcps') return
    if (georefGcps.length === 0) return
    const rasterId = georefPendingRef.current?.rasterId ?? rasterRefForDisplay.current?.rasterId
    if (!rasterId) return
    const t = setTimeout(() => {
      if (gcpApplyingRef.current) return
      gcpApplyingRef.current = true
      void applyGcps().finally(() => {
        gcpApplyingRef.current = false
      })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georefGcps])

  // ── Smart Auto Georeference ──
  const smartResultRef = useRef<SmartGeorefResult | null>(smartResult)
  smartResultRef.current = smartResult

  const emitQuadPreview = useCallback((quad: CornerQuad | null) => {
    optsRef.current.onGeorefFootprintPreview?.(
      quad ? quadFootprint(quad.nw, quad.ne, quad.se, quad.sw) : null,
    )
  }, [])

  const runSmartAutoGeoreference = useCallback(
    async (engine: SmartAlignEngine): Promise<void> => {
      const current = rasterRefForDisplay.current
      if (!current) {
        setSmartError('Select a raster layer on the map first.')
        return
      }
      const quad = effectiveQuad()
      if (!quad) {
        setSmartError('This raster has no placement to refine yet.')
        return
      }
      const getUrl = optsRef.current.getRasterPreviewUrl
      const capture = optsRef.current.captureBasemapImage
      if (!getUrl || !capture) {
        setSmartError('Smart Auto Georeference is not available in this view.')
        return
      }
      const rasterUrl = getUrl(current)
      if (!rasterUrl) {
        setSmartError('Could not read the raster image pixels for matching.')
        return
      }
      setSmartBusy(true)
      setSmartError(null)
      setSmartResult(null)
      setStatusMessage(
        engine === 'ai' ? 'Matching with Gemini vision…' : 'Matching image edges to the basemap…',
      )
      try {
        const snap = await capture(quad)
        if (!snap) {
          setSmartError('Could not capture the basemap under the raster.')
          return
        }
        let proposed: CornerQuad | null = null
        let confidence = 0
        let note = ''
        if (engine === 'ai') {
          const key = optsRef.current.getGeminiApiKey?.() ?? ''
          const r = await estimateAlignmentWithGemini({
            rasterUrl,
            basemapUrl: snap.url,
            bounds: snap.bounds,
            apiKey: key,
          })
          const w = current.widthPx || 1024
          const h = current.heightPx || 1024
          const gcps = r.points.map(p => ({ col: p.x01 * w, row: p.y01 * h, lon: p.lon, lat: p.lat }))
          proposed = cornersFromGcps(gcps, w, h, quad)
          confidence = r.confidence
          note = r.note
        } else {
          const r = await estimateAlignmentOnDevice(rasterUrl, snap.url)
          const bb = quadToBounds(quad)
          const ox = r.dxFrac * (bb.east - bb.west)
          const oy = r.dyFrac * (bb.north - bb.south)
          let moved = mapQuad(quad, p => [p[0] + ox, p[1] + oy])
          if (r.rotationDeg) {
            const c = quadCentroid(moved)
            const th = (r.rotationDeg * Math.PI) / 180
            const kx = Math.max(Math.cos((c[1] * Math.PI) / 180), 1e-6)
            const cos = Math.cos(th)
            const sin = Math.sin(th)
            moved = mapQuad(moved, p => {
              const dx = (p[0] - c[0]) * kx
              const dy = p[1] - c[1]
              const rx = dx * cos - dy * sin
              const ry = dx * sin + dy * cos
              return [c[0] + rx / kx, c[1] + ry]
            })
          }
          proposed = moved
          confidence = r.confidence
          note = r.note
        }
        if (!proposed) {
          setSmartError('Could not compute a placement from the match.')
          return
        }
        setSmartResult({ quad: proposed, confidence, engine, note })
        emitQuadPreview(proposed)
        setStatusMessage(`Smart match ready — ${Math.round(confidence * 100)}% confidence. Review, then Apply.`)
      } catch (err) {
        setSmartError(err instanceof Error ? err.message : 'Smart Auto Georeference failed.')
      } finally {
        setSmartBusy(false)
      }
    },
    [effectiveQuad, emitQuadPreview],
  )

  const applySmartResult = useCallback(async (): Promise<string | null> => {
    const res = smartResultRef.current
    if (!res) return 'No smart result to apply.'
    const out = await commitQuad(res.quad)
    if (out === null) {
      setSmartResult(null)
      setStatusMessage('Applied the smart georeference.')
    }
    return out
  }, [commitQuad])

  const discardSmartResult = useCallback(() => {
    setSmartResult(null)
    setSmartError(null)
    emitQuadPreview(null)
  }, [emitQuadPreview])

  // Fire-and-apply: run the on-device match and commit it straight away (no review card).
  const runSmartAutoGeoreferenceDirect = useCallback(async (): Promise<string | null> => {
    const current = rasterRefForDisplay.current
    if (!current) {
      setStatusMessage('Select a raster layer on the map first.')
      return 'No raster selected.'
    }
    const quad = effectiveQuad()
    if (!quad) {
      setStatusMessage('This raster has no placement to refine yet.')
      return 'No placement to refine.'
    }
    const getUrl = optsRef.current.getRasterPreviewUrl
    const capture = optsRef.current.captureBasemapImage
    if (!getUrl || !capture) return 'Auto georeference is not available here.'
    const rasterUrl = getUrl(current)
    if (!rasterUrl) return 'Could not read the raster image pixels.'
    setSmartBusy(true)
    setSmartError(null)
    setSmartResult(null)
    setStatusMessage('Auto georeferencing — matching image to the basemap…')
    try {
      const snap = await capture(quad)
      if (!snap) {
        setStatusMessage('Could not capture the basemap under the raster.')
        return 'Basemap capture failed.'
      }
      const r = await estimateAlignmentOnDevice(rasterUrl, snap.url)
      const bb = quadToBounds(quad)
      const ox = r.dxFrac * (bb.east - bb.west)
      const oy = r.dyFrac * (bb.north - bb.south)
      let moved = mapQuad(quad, p => [p[0] + ox, p[1] + oy])
      if (r.rotationDeg) {
        const c = quadCentroid(moved)
        const th = (r.rotationDeg * Math.PI) / 180
        const kx = Math.max(Math.cos((c[1] * Math.PI) / 180), 1e-6)
        const cos = Math.cos(th)
        const sin = Math.sin(th)
        moved = mapQuad(moved, p => {
          const dx = (p[0] - c[0]) * kx
          const dy = p[1] - c[1]
          const rx = dx * cos - dy * sin
          const ry = dx * sin + dy * cos
          return [c[0] + rx / kx, c[1] + ry]
        })
      }
      const out = await commitQuad(moved)
      if (out === null) {
        setStatusMessage(`Auto georeference applied — ${Math.round(r.confidence * 100)}% confidence.`)
      } else {
        setStatusMessage(out)
      }
      return out
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auto georeference failed.'
      setStatusMessage(msg)
      return msg
    } finally {
      setSmartBusy(false)
    }
  }, [effectiveQuad, commitQuad])

  const importGcps = useCallback((rows: Array<{ col: number; row: number; lon: number; lat: number }>) => {
    if (!rows.length) {
      setError('No control points found in the file.')
      return
    }
    setGeorefGcps(
      rows.map(r => ({
        id: nextGcpId('rgt-gcp'),
        col: String(r.col),
        row: String(r.row),
        lon: String(r.lon),
        lat: String(r.lat),
      })),
    )
    setGeorefMode('gcps')
    setError(null)
    setStatusMessage(`Imported ${rows.length} control point${rows.length === 1 ? '' : 's'}.`)
  }, [])

  const importGcpsFromFile = useCallback(
    async (file: File): Promise<void> => {
      try {
        const text = await file.text()
        importGcps(parseControlPointsText(text))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the control-point file.')
      }
    },
    [importGcps],
  )

  const addGeorefGcp = useCallback(() => {
    setGeorefGcps(prev => [...prev, { id: nextGcpId('rgt-gcp'), col: '', row: '', lon: '', lat: '' }])
  }, [])
  const updateGeorefGcp = useCallback((id: string, field: keyof Omit<GeorefGcpDraft, 'id'>, value: string) => {
    setGeorefGcps(prev => prev.map(g => (g.id === id ? { ...g, [field]: value } : g)))
  }, [])
  const removeGeorefGcp = useCallback((id: string) => {
    setGeorefGcps(prev => prev.filter(g => g.id !== id))
  }, [])
  const captureGcpMapPoint = useCallback((id: string) => {
    const pt = optsRef.current.getLastMapClick?.() ?? null
    if (!pt) {
      setError('Click a point on the map first, then use it for this GCP.')
      return
    }
    setGeorefGcps(prev =>
      prev.map(g => (g.id === id ? { ...g, lon: pt.lon.toFixed(6), lat: pt.lat.toFixed(6) } : g)),
    )
  }, [])

  // ── ArcGIS-style two-click control-point picking ──
  const startGcpPicking = useCallback(() => {
    setGeorefMode('gcps')
    gcpFromRef.current = null
    setGcpPickPhase('from')
    setGcpPicking(true)
    setGcpRedo([])
    setManipModeState(null)
    setError(null)
    setStatusMessage('Add control points: click a point on the source image.')
  }, [])

  const stopGcpPicking = useCallback(() => {
    gcpFromRef.current = null
    setGcpPickPhase('from')
    setGcpPicking(false)
  }, [])

  // ── ArcGIS-style direct manipulation (drag on the map = move / rotate / scale) ──
  const setManipMode = useCallback((mode: 'move' | 'rotate' | 'scale' | null) => {
    // Manipulation and control-point picking are mutually exclusive tools.
    if (mode) {
      gcpFromRef.current = null
      setGcpPickPhase('from')
      setGcpPicking(false)
    }
    setManipModeState(mode)
  }, [])
  const getManipQuad = useCallback((): CornerQuad | null => effectiveQuad(), [effectiveQuad])
  const commitManipQuad = useCallback(
    (quad: CornerQuad): Promise<string | null> => commitQuad(quad),
    [commitQuad],
  )

  const handleGcpMapClick = useCallback((lon: number, lat: number) => {
    // Phase 1: the click is on the displayed source image → back-project to (col,row).
    if (gcpFromRef.current == null) {
      const quad = effectiveQuad()
      const dims = rasterRefForDisplay.current
      const w = dims?.widthPx || 0
      const h = dims?.heightPx || 0
      if (!quad || !w || !h) {
        setError('Place or select the raster first, then add control points.')
        return
      }
      const px = imagePixelFromMap(quad, w, h, lon, lat)
      if (!px) {
        setError('Could not read the image pixel here — try clicking on the image.')
        return
      }
      const outside = px.col < -w * 0.1 || px.col > w * 1.1 || px.row < -h * 0.1 || px.row > h * 1.1
      gcpFromRef.current = { col: px.col, row: px.row }
      setGcpPickPhase('to')
      setError(null)
      setStatusMessage(
        outside
          ? 'That looked off the image — now click the matching location on the reference map (or click the image again to redo).'
          : 'Now click the matching location on the reference map.',
      )
      return
    }
    // Phase 2: the click is the true location on the reference map → complete the pair.
    const from = gcpFromRef.current
    gcpFromRef.current = null
    setGcpPickPhase('from')
    setGcpRedo([]) // a fresh point invalidates the redo stack
    let count = 0
    setGeorefGcps(prev => {
      const next = [
        ...prev,
        {
          id: nextGcpId('rgt-gcp'),
          col: from.col.toFixed(2),
          row: from.row.toFixed(2),
          lon: lon.toFixed(6),
          lat: lat.toFixed(6),
        },
      ]
      count = next.length
      return next
    })
    setError(null)
    setStatusMessage(
      `Control point ${count} added. Click the next source-image point, or press Apply to warp.`,
    )
  }, [effectiveQuad])

  // ── Undo / Redo / RMS for the control-point workflow ──
  const undoGcp = useCallback(() => {
    setGeorefGcps(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setGcpRedo(r => [...r, last])
      return prev.slice(0, -1)
    })
    gcpFromRef.current = null
    setGcpPickPhase('from')
  }, [])

  const redoGcp = useCallback(() => {
    setGcpRedo(prev => {
      if (!prev.length) return prev
      const restore = prev[prev.length - 1]
      setGeorefGcps(g => [...g, restore])
      return prev.slice(0, -1)
    })
  }, [])

  const gcpRms = useMemo(() => {
    const parsed = georefGcps
      .map(g => ({ col: Number(g.col), row: Number(g.row), lon: Number(g.lon), lat: Number(g.lat) }))
      .filter(g => [g.col, g.row, g.lon, g.lat].every(Number.isFinite))
    return gcpResidualMetres(parsed)
  }, [georefGcps])

  // Live control-point overlay on the map: numbered source (on raster) + target markers,
  // linked by a line — drawn directly on the canvas so no big card is needed (ArcGIS-style).
  useEffect(() => {
    const emit = optsRef.current.onGcpOverlay
    if (!emit) return
    if (!gcpPicking && georefGcps.length === 0) {
      emit(null)
      return
    }
    const quad = effectiveQuad()
    const dims = rasterRefForDisplay.current
    const w = dims?.widthPx || 0
    const h = dims?.heightPx || 0
    const affine = quad && w && h ? affineFromQuad(quad, w, h) : null
    const features: GeoJSON.Feature[] = []
    georefGcps.forEach((g, i) => {
      const col = Number(g.col)
      const row = Number(g.row)
      const lon = Number(g.lon)
      const lat = Number(g.lat)
      if (![lon, lat].every(Number.isFinite)) return
      const idx = i + 1
      // Target (reference-map) marker. `gcpId` lets the map layer drag it (ArcGIS "Move Point").
      features.push({
        type: 'Feature',
        properties: { role: 'target', label: `CP${idx}`, gcpId: g.id },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })
      // Source marker (where this pixel currently sits on the placed raster) + link line.
      if (affine && Number.isFinite(col) && Number.isFinite(row)) {
        const sx = affine.a * col + affine.b * row + affine.c
        const sy = affine.d * col + affine.e * row + affine.f
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
          features.push({
            type: 'Feature',
            properties: { role: 'source', label: `CP${idx}` },
            geometry: { type: 'Point', coordinates: [sx, sy] },
          })
          features.push({
            type: 'Feature',
            properties: { role: 'link', label: `CP${idx}` },
            geometry: { type: 'LineString', coordinates: [[sx, sy], [lon, lat]] },
          })
        }
      }
    })
    emit({ type: 'FeatureCollection', features })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georefGcps, gcpPicking])

  const setGeorefBboxField = useCallback((key: 'west' | 'south' | 'east' | 'north', value: string) => {
    setGeorefBbox(prev => ({ ...prev, [key]: value }))
  }, [])
  const setGeorefCornerField = useCallback(
    (corner: 'nw' | 'ne' | 'se' | 'sw', axis: 'lon' | 'lat', value: string) => {
      setGeorefCorners(prev => ({ ...prev, [corner]: { ...prev[corner], [axis]: value } }))
    },
    [],
  )

  // Live footprint preview as placement inputs change.
  useEffect(() => {
    const emit = optsRef.current.onGeorefFootprintPreview
    if (!emit) return
    if (!georefPending) {
      emit(null)
      return
    }
    if (georefMode === 'bbox') {
      const west = parseNum(georefBbox.west)
      const south = parseNum(georefBbox.south)
      const east = parseNum(georefBbox.east)
      const north = parseNum(georefBbox.north)
      if ([west, south, east, north].every(v => v !== null) && (east as number) > (west as number) && (north as number) > (south as number)) {
        emit(rectFootprint({ west: west!, south: south!, east: east!, north: north! }))
      } else {
        emit(null)
      }
      return
    }
    if (georefMode === 'corners') {
      const c = georefCorners
      const read = (k: 'nw' | 'ne' | 'se' | 'sw'): [number, number] | null => {
        const lon = parseNum(c[k].lon)
        const lat = parseNum(c[k].lat)
        return lon === null || lat === null ? null : [lon, lat]
      }
      const nw = read('nw')
      const ne = read('ne')
      const se = read('se')
      const sw = read('sw')
      emit(nw && ne && se && sw ? quadFootprint(nw, ne, se, sw) : null)
      return
    }
    if (georefMode === 'gcps') {
      const pts: Array<[number, number]> = []
      for (const g of georefGcps) {
        const lon = parseNum(g.lon)
        const lat = parseNum(g.lat)
        if (lon !== null && lat !== null) pts.push([lon, lat])
      }
      emit(pts.length ? pointsFootprint(pts) : null)
      return
    }
    emit(null)
  }, [georefPending, georefMode, georefBbox, georefCorners, georefGcps])

  // ── Display controls ──
  const setDisplayField = useCallback((key: keyof RasterDisplaySettings, value: number) => {
    setDisplay(prev => {
      const next = { ...prev, [key]: value }
      const r = rasterRefForDisplay.current
      if (r) {
        optsRef.current.onDisplayChange?.(r.rasterId, next)
        const proj = currentProjectRef.current
        if (proj) {
          setCurrentProject(
            upsertProjectRaster(proj, {
              rasterId: r.rasterId,
              name: r.name,
              placement: proj.rasters.find(x => x.rasterId === r.rasterId)?.placement ?? null,
              display: next,
            }),
          )
        }
      }
      return next
    })
  }, [])

  const resetDisplay = useCallback(() => {
    const disp = { ...DEFAULT_DISPLAY }
    setDisplay(disp)
    const r = rasterRefForDisplay.current
    if (r) optsRef.current.onDisplayChange?.(r.rasterId, disp)
  }, [])

  const rotateTo = useCallback((bearing: number) => {
    optsRef.current.onRotate?.(bearing)
  }, [])
  const resetNorth = useCallback(() => {
    optsRef.current.onResetNorth?.()
  }, [])

  // ── Coordinate system (assign/override CRS) ──
  const assignCrs = useCallback(
    async (code: string): Promise<string | null> => {
      const r = rasterRefForDisplay.current
      if (!r) {
        const msg = 'Add a raster before assigning a coordinate system.'
        setError(msg)
        return msg
      }
      setAssigningCrs(true)
      setError(null)
      setStatusMessage(`Assigning ${code}…`)
      try {
        const record = await assignRasterCrs(r.rasterId, code)
        if (record.status !== 'ready') {
          const msg = record.error || 'CRS assigned but the raster is not ready.'
          setError(msg)
          setStatusMessage(null)
          return msg
        }
        const config = layerConfigFromReadyRecord(record)
        setRaster(config)
        setGeorefSourceDetected(config.georefSource ?? 'manual:crs')
        const overlay = await buildImageOverlay(config)
        optsRef.current.onRasterReady?.(config, overlay)
        setStatusMessage(`Coordinate system set to ${config.crsInfo?.name || code}.`)
        return null
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Assign CRS failed'
        setError(msg)
        setStatusMessage(null)
        return msg
      } finally {
        setAssigningCrs(false)
      }
    },
    [buildImageOverlay],
  )

  // ── Export ──
  const exportGeoTiff = useCallback(async () => {
    const r = rasterRefForDisplay.current
    if (!r) {
      setError('Add and place a raster before exporting.')
      return
    }
    setExporting(true)
    setError(null)
    try {
      await downloadRasterGeoTiff(r.rasterId, r.name)
      setStatusMessage(`Exported ${r.name} as GeoTIFF.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [])

  // Save the georeference *into the image files* the ArcGIS way: write a world file
  // (.wld/.tfw affine) plus a .prj CRS sidecar derived from the current placement, so the
  // original raster becomes geographically defined for any GIS that reads sidecars.
  const exportWorldFile = useCallback((): string | null => {
    const r = rasterRefForDisplay.current
    if (!r) {
      const msg = 'Place the raster on the map first, then save its georeferencing.'
      setError(msg)
      return msg
    }
    const w = r.widthPx || 0
    const h = r.heightPx || 0
    if (!w || !h) {
      const msg = 'Raster pixel dimensions are unknown; cannot write a world file.'
      setError(msg)
      return msg
    }
    const q = currentCornersRef.current ?? quadFromBounds(r.bboxWgs84)
    // Affine mapping image pixel space (col,row) → map (lon,lat), with
    // NW=(0,0), NE=(w,0), SW=(0,h). World-file line order is A, D, B, E, C, F.
    const A = (q.ne[0] - q.nw[0]) / w // x-size per column
    const D = (q.ne[1] - q.nw[1]) / w // y skew per column (rotation)
    const B = (q.sw[0] - q.nw[0]) / h // x skew per row (rotation)
    const E = (q.sw[1] - q.nw[1]) / h // y-size per row (negative for north-up)
    const C = q.nw[0] + A * 0.5 + B * 0.5 // lon of the top-left pixel centre
    const F = q.nw[1] + D * 0.5 + E * 0.5 // lat of the top-left pixel centre
    const base = (r.name || 'raster').replace(/\.[^./\\]+$/, '')
    const body = [A, D, B, E, C, F].map(n => n.toPrecision(12)).join('\n') + '\n'
    downloadTextSidecar(`${base}.wld`, body)
    downloadTextSidecar(`${base}.prj`, WGS84_WKT + '\n')
    setStatusMessage(`Saved georeferencing sidecars: ${base}.wld + ${base}.prj`)
    setError(null)
    return null
  }, [])

  // ── Projects ──
  const newProject = useCallback((name: string) => {
    const proj = createProject(name)
    setCurrentProject(proj)
    setProjects(listProjects())
    setStatusMessage(`Project "${proj.name}" created.`)
  }, [])

  const openProject = useCallback(async (id: string) => {
    const proj = getProject(id)
    if (!proj) {
      setError('Project not found.')
      return
    }
    setCurrentProject(proj)
    setBusy(true)
    setStatusMessage(`Opening "${proj.name}"…`)
    let lastConfig: ServerRasterLayerConfig | null = null
    let lastDisplay: RasterDisplaySettings | null = null
    for (const item of proj.rasters) {
      try {
        const record = await fetchRasterRecord(item.rasterId)
        if (record.status !== 'ready') continue
        const config = layerConfigFromReadyRecord(record)
        optsRef.current.onRasterReady?.(config)
        optsRef.current.onDisplayChange?.(config.rasterId, item.display)
        lastConfig = config
        lastDisplay = item.display
      } catch {
        /* raster may have been deleted server-side — skip it */
      }
    }
    if (lastConfig) {
      setRaster(lastConfig)
      setGeorefSourceDetected(lastConfig.georefSource ?? null)
      if (lastDisplay) setDisplay(lastDisplay)
    }
    setBusy(false)
    setStatusMessage(`Opened "${proj.name}" (${proj.rasters.length} raster${proj.rasters.length === 1 ? '' : 's'}).`)
  }, [])

  const saveCurrentProject = useCallback(() => {
    const proj = currentProjectRef.current
    if (!proj) {
      setError('Create or open a project first.')
      return
    }
    const saved = saveProject(proj)
    setCurrentProject(saved)
    setProjects(listProjects())
    setStatusMessage(`Project "${saved.name}" saved.`)
  }, [])

  const renameCurrentProject = useCallback((name: string) => {
    const proj = currentProjectRef.current
    if (!proj) return
    const updated = renameProject(proj.id, name) ?? { ...proj, name }
    setCurrentProject(updated)
    setProjects(listProjects())
  }, [])

  const deleteCurrentProject = useCallback(() => {
    const proj = currentProjectRef.current
    if (!proj) return
    deleteProject(proj.id)
    setCurrentProject(null)
    setProjects(listProjects())
    setStatusMessage(`Project "${proj.name}" deleted.`)
  }, [])

  return {
    raster,
    busy,
    error,
    statusMessage,
    uploadRaster,
    selectExistingRaster,
    clearRaster,
    georefPending,
    georefBusy,
    georefMode,
    setGeorefMode,
    georefSourceDetected,
    georefBbox,
    setGeorefBboxField,
    georefCorners,
    setGeorefCornerField,
    georefGcps,
    addGeorefGcp,
    updateGeorefGcp,
    removeGeorefGcp,
    captureGcpMapPoint,
    gcpPicking,
    gcpPickPhase,
    startGcpPicking,
    stopGcpPicking,
    handleGcpMapClick,
    gcpRms,
    undoGcp,
    redoGcp,
    canUndoGcp: georefGcps.length > 0,
    canRedoGcp: gcpRedo.length > 0,
    manipMode,
    setManipMode,
    getManipQuad,
    commitManipQuad,
    applyGcps,
    applyGeoreference,
    applyGeoreferenceFromDrawn,
    placeAtCurrentView,
    cancelGeoreference,
    moveRaster,
    scaleRaster,
    rotateRaster,
    flipRaster,
    resetRasterNorth,
    autoGeoreference,
    smartBusy,
    smartError,
    smartResult,
    runSmartAutoGeoreference,
    runSmartAutoGeoreferenceDirect,
    applySmartResult,
    discardSmartResult,
    importGcps,
    importGcpsFromFile,
    display,
    setDisplayField,
    resetDisplay,
    rotateTo,
    resetNorth,
    assignCrs,
    assigningCrs,
    exportGeoTiff,
    exportWorldFile,
    exporting,
    projects,
    currentProject,
    refreshProjects,
    newProject,
    openProject,
    saveCurrentProject,
    renameCurrentProject,
    deleteCurrentProject,
  }
}
