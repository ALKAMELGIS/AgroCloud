/**
 * Mapbox GL 3D terrain (DEM mesh) for AgroCloud maps.
 * Esri WorldElevation3D Terrain3D — public, no Mapbox token.
 *
 * Esri serves elevation as LERC, which neither Mapbox GL JS (no `addProtocol`) nor MapLibre can turn
 * into a `raster-dem` source client-side. The backend (`/api/terrain/esri-rgb/{z}/{x}/{y}`) decodes
 * LERC and re-encodes it as standard Mapbox terrain-RGB PNG tiles, which both engines read directly
 * over plain HTTP. The Esri World Hillshade raster is overlaid on the topographic basemap for crisp
 * relief shading; raster analysis layers drape over the mesh automatically.
 * @see https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer
 */

import { ensureBackendAvailable, resolveApiOrigin } from './apiOrigin'
import { rasterTileMaxNativeZoom } from './rasterTileZoom'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ATTR_ESRI = 'Tiles © Esri'
/** Esri global 3D terrain (orthometric meters, multi-source DEM) — raw HTTPS LERC tile endpoint. */
export const ESRI_WORLD_TERRAIN_TILE_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}'

/**
 * Backend proxy that decodes Esri LERC tiles and re-serves them as Mapbox terrain-RGB PNGs.
 * Path is resolved against the current origin at runtime (dev: Vite proxies `/api` → backend;
 * full-stack: same-origin). Mapbox/MapLibre require an absolute URL, so {@link buildEsriTerrainDemTilesUrl}
 * prepends `location.origin`.
 */
export const ESRI_WORLD_TERRAIN_DEM_TILE_PATH = '/api/terrain/esri-rgb/{z}/{x}/{y}'

/**
 * Origin that serves the terrain proxy. Same-origin when the app runs behind the Node API
 * (dev via the Vite `/api` proxy, or full-stack hosting). On static hosts (GitHub Pages) there is
 * no local `/api`, so we reuse the configured backend origin (`VITE_AGRI_API_SECRETS_URL`) — the
 * same server that decodes the LERC tiles and already allows cross-origin tile requests.
 */
function resolveTerrainApiOrigin(): string {
  return resolveApiOrigin()
}

/** Absolute terrain-RGB tile template (origin-prefixed) for Mapbox/MapLibre `raster-dem` sources. */
export function buildEsriTerrainDemTilesUrl(): string {
  return `${resolveTerrainApiOrigin()}${ESRI_WORLD_TERRAIN_DEM_TILE_PATH}`
}

/** Esri World Hillshade (multi-directional) raster — overlaid on the topographic basemap. */
export const ESRI_WORLD_HILLSHADE_TILE_URL = `${ESRI}/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}`

export const ESRI_WORLD_TERRAIN_ATTRIBUTION =
  'Elevation © Esri — WorldElevation3D/Terrain3D'

export const TOPOGRAPHIC_3D_BASEMAP_ID = '3d-topographic'
/** Esri World Imagery (Satellite) draped over the Esri WorldElevation3D mesh. */
export const SATELLITE_3D_BASEMAP_ID = '3d-satellite'
export const ESRI_WORLD_TERRAIN_SOURCE_ID = 'esri-terrain'
/** @deprecated Alias — same as {@link ESRI_WORLD_TERRAIN_SOURCE_ID}. */
export const AGRO_CLOUD_TERRAIN_DEM_SOURCE_ID = ESRI_WORLD_TERRAIN_SOURCE_ID
export const AGRO_CLOUD_HILLSHADE_LAYER_ID = 'agrocloud-hillshade'
export const AGRO_CLOUD_TOPO_BASE_LAYER_ID = 'topo-base-layer'
/** Esri World Hillshade raster overlay (sits on top of the topo basemap). */
export const AGRO_CLOUD_ESRI_HILLSHADE_SOURCE_ID = 'esri-world-hillshade'
export const AGRO_CLOUD_ESRI_HILLSHADE_LAYER_ID = 'agrocloud-esri-hillshade'

/** Pitch (degrees) at which DEM mesh is enabled during mouse orbit / tilt. */
export const AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD = 8

const TERRAIN_EXAGGERATION_DEFAULT = 1.5
const TERRAIN_EXAGGERATION_MIN = 1
const TERRAIN_EXAGGERATION_MAX = 8
/** Lower max zoom = fewer tiles, faster load; mesh still drapes basemap at high zoom. */
const ESRI_TERRAIN_DEM_MAX_ZOOM = 13

/** User-adjustable vertical exaggeration ("relief height"), shared by all maps. */
let currentTerrainExaggeration = TERRAIN_EXAGGERATION_DEFAULT

export function setAgroCloudTerrainExaggeration(value: number): number {
  if (Number.isFinite(value)) {
    currentTerrainExaggeration = Math.max(
      TERRAIN_EXAGGERATION_MIN,
      Math.min(TERRAIN_EXAGGERATION_MAX, value),
    )
  }
  return currentTerrainExaggeration
}

export function getAgroCloudTerrainExaggeration(): number {
  return currentTerrainExaggeration
}

const HILLSHADE_PAINT = {
  'hillshade-exaggeration': 0.45,
  'hillshade-shadow-color': '#3d3629',
  'hillshade-highlight-color': '#f8f6f0',
  'hillshade-illumination-direction': 335,
}

/** Esri World Hillshade raster overlay paint — semi-transparent so topo labels/terrain read through. */
const ESRI_HILLSHADE_OVERLAY_PAINT = {
  'raster-fade-duration': 0,
  'raster-opacity': 0.5,
}

const BASEMAP_RASTER_PAINT = {
  'raster-fade-duration': 0,
  'raster-opacity': 1,
}

function esriTile(servicePath: string): string {
  return `${ESRI}/${servicePath}/MapServer/tile/{z}/{y}/{x}`
}

/**
 * Esri WorldElevation3D raster-dem source for Mapbox GL / MapLibre.
 * Tiles are served as Mapbox terrain-RGB PNGs by the backend proxy, so `encoding: 'mapbox'`.
 */
export function buildEsriWorldTerrainDemSourceSpec(): Record<string, unknown> {
  return {
    type: 'raster-dem',
    tiles: [buildEsriTerrainDemTilesUrl()],
    tileSize: 256,
    encoding: 'mapbox',
    minzoom: 0,
    maxzoom: ESRI_TERRAIN_DEM_MAX_ZOOM,
    attribution: ESRI_WORLD_TERRAIN_ATTRIBUTION,
  }
}

/** Esri World Hillshade raster source spec (overlay above the topographic basemap). */
export function buildEsriWorldHillshadeSourceSpec(): Record<string, unknown> {
  return {
    type: 'raster',
    tiles: [ESRI_WORLD_HILLSHADE_TILE_URL],
    tileSize: 256,
    maxzoom: rasterTileMaxNativeZoom(ESRI_WORLD_HILLSHADE_TILE_URL),
    attribution: ATTR_ESRI,
  }
}

/**
 * Terrain availability tri-state shared across all maps:
 *   `null`  – not probed yet (optimistic: callers may attempt terrain)
 *   `true`  – backend terrain proxy responded, DEM tiles are decodable
 *   `false` – no co-located backend (static host) or proxy returned 404/405/501
 *
 * The DEM mesh is only ever requested once this resolves to `true`, so static
 * deployments (GitHub Pages, or a CDN-hosted SPA whose `/api/*` routes 404)
 * silently fall back to the flat topo/satellite rasters instead of flooding the
 * console with hundreds of failed `/api/terrain/esri-rgb/*` tile requests.
 */
let terrainApiAvailability: boolean | null = null
let terrainApiProbe: Promise<boolean> | null = null

/**
 * Resolve whether the terrain proxy is reachable by delegating to the shared
 * circuit breaker ({@link ensureBackendAvailable}). That probe does a single
 * `GET /api/health` and validates the response is genuine JSON (not an SPA
 * `index.html` fallback served with a 200), so static hosts — and any custom
 * domain whose `/api/*` routes 404/405 or return the SPA shell — resolve to
 * `false` without ever touching `/api/terrain/esri-rgb/*`. The result is cached
 * here so repeated basemap/pitch changes never re-probe.
 */
export function ensureTerrainApiAvailable(): Promise<boolean> {
  if (terrainApiAvailability !== null) return Promise.resolve(terrainApiAvailability)
  if (terrainApiProbe) return terrainApiProbe
  terrainApiProbe = (async () => {
    try {
      terrainApiAvailability = await ensureBackendAvailable()
    } catch {
      // Any unexpected failure — degrade gracefully to the flat raster basemap.
      terrainApiAvailability = false
    }
    return terrainApiAvailability
  })()
  return terrainApiProbe
}

/**
 * Synchronous best-effort check. Returns `false` only once the proxy is *known*
 * to be unreachable; optimistic (`true`) while the probe is pending so the first
 * basemap selection can kick off terrain loading immediately.
 */
export function canUseEsriWorldTerrainDem(): boolean {
  return terrainApiAvailability !== false
}

/** @deprecated Esri terrain replaced Mapbox DEM; kept for import compatibility. */
export function canUseMapboxTerrainDem(): boolean {
  return canUseEsriWorldTerrainDem()
}

export function is3dTopographicBasemapId(id: string): boolean {
  return id === TOPOGRAPHIC_3D_BASEMAP_ID
}

export function is3dSatelliteBasemapId(id: string): boolean {
  return id === SATELLITE_3D_BASEMAP_ID
}

/** Any dedicated elevation/terrain basemap (topo relief or draped satellite imagery). */
export function isTerrain3dBasemapId(id: string): boolean {
  return is3dTopographicBasemapId(id) || is3dSatelliteBasemapId(id)
}

export function shouldEnableAgroCloudTerrain3d(opts: {
  basemapId?: string
  pitch?: number
}): boolean {
  if (!canUseEsriWorldTerrainDem()) return false
  if (opts.basemapId && isTerrain3dBasemapId(opts.basemapId)) return true
  const pitch = typeof opts.pitch === 'number' ? opts.pitch : 0
  return pitch >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD
}

function terrainExaggerationForPitch(_pitch: number): number {
  // The user-controlled "relief height" is authoritative across pitch changes.
  return currentTerrainExaggeration
}

export function build3dTopographicLeafletLayers(): { url: string; attribution: string; opacity?: number }[] {
  return [
    { url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI },
    { url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI, opacity: 0.72 },
  ]
}

export function build3dTopographicFlatFallbackStyle(): Record<string, unknown> {
  const sources: Record<string, unknown> = {}
  const layers: unknown[] = []
  build3dTopographicLeafletLayers().forEach((L, i) => {
    const sid = `topo-fallback-${i}`
    sources[sid] = {
      type: 'raster',
      tiles: [L.url.replace(/\{s\}/gi, 'a').replace(/\{r\}/g, '')],
      tileSize: 256,
      maxzoom: rasterTileMaxNativeZoom(L.url),
      attribution: L.attribution,
    }
    layers.push({
      id: `topo-fallback-layer-${i}`,
      type: 'raster',
      source: sid,
      paint: L.opacity != null ? { ...BASEMAP_RASTER_PAINT, 'raster-opacity': L.opacity } : BASEMAP_RASTER_PAINT,
    })
  })
  return { version: 8 as const, name: '3D Topographic (2D fallback)', sources, layers }
}

export function build3dSatelliteLeafletLayers(): { url: string; attribution: string; opacity?: number }[] {
  return [{ url: esriTile('World_Imagery'), attribution: ATTR_ESRI }]
}

export function build3dSatelliteFlatFallbackStyle(): Record<string, unknown> {
  return {
    version: 8 as const,
    name: 'Satellite 3D (2D fallback)',
    sources: {
      'sat3d-base': {
        type: 'raster',
        tiles: [esriTile('World_Imagery')],
        tileSize: 256,
        maxzoom: rasterTileMaxNativeZoom(esriTile('World_Imagery')),
        attribution: ATTR_ESRI,
      },
    },
    layers: [{ id: 'sat3d-base-layer', type: 'raster', source: 'sat3d-base', paint: BASEMAP_RASTER_PAINT }],
  }
}

/**
 * Mapbox GL style: Esri World Imagery (Satellite) as a plain raster basemap.
 *
 * The DEM mesh is intentionally NOT baked into the style. Instead the dynamic
 * terrain controller (`syncAgroCloudTerrain3d`) adds the Esri WorldElevation3D
 * source and calls `setTerrain` only AFTER the DEM source has loaded — this
 * avoids the `_updateTerrain` race that fires before DEM tiles arrive and would
 * otherwise cancel terrain entirely. Because the basemap id is a recognised
 * terrain-3d id, the mesh is enabled as soon as the basemap is active, and the
 * opaque imagery drapes over the relief once the camera tilts.
 */
export function build3dSatelliteMapboxStyle(): Record<string, unknown> {
  return {
    version: 8 as const,
    name: 'Satellite 3D',
    projection: { name: 'globe' },
    sources: {
      'sat3d-base': {
        type: 'raster',
        tiles: [esriTile('World_Imagery')],
        tileSize: 256,
        maxzoom: rasterTileMaxNativeZoom(esriTile('World_Imagery')),
        attribution: ATTR_ESRI,
      },
    },
    layers: [
      {
        id: AGRO_CLOUD_TOPO_BASE_LAYER_ID,
        type: 'raster',
        source: 'sat3d-base',
        paint: BASEMAP_RASTER_PAINT,
      },
    ],
  }
}

/**
 * Mapbox GL style: topographic basemap + Esri World Hillshade overlay.
 *
 * The DEM mesh (raster-dem source, computed-hillshade layer and `setTerrain`) is
 * intentionally NOT baked into the style. It is added at runtime by
 * {@link syncAgroCloudTerrain3d} only AFTER the backend terrain proxy has been
 * confirmed reachable (see {@link ensureTerrainApiAvailable}). On static hosts
 * with no `/api/terrain/*` proxy this keeps the basemap fully functional while
 * skipping the DEM tiles entirely — no 404 floods, no "Map Error" spam.
 *
 * Layer order (bottom→top): topo basemap raster → Esri World Hillshade overlay
 * (semi-transparent relief). Raster analysis layers added later sit above this
 * stack and drape over the terrain mesh automatically once it is enabled.
 */
export function build3dTopographicMapboxStyle(): Record<string, unknown> {
  return {
    version: 8 as const,
    name: '3D Topographic',
    projection: { name: 'globe' },
    sources: {
      'topo-base': {
        type: 'raster',
        tiles: [esriTile('World_Topo_Map')],
        tileSize: 256,
        maxzoom: rasterTileMaxNativeZoom(esriTile('World_Topo_Map')),
        attribution: ATTR_ESRI,
      },
      [AGRO_CLOUD_ESRI_HILLSHADE_SOURCE_ID]: buildEsriWorldHillshadeSourceSpec(),
    },
    layers: [
      {
        id: AGRO_CLOUD_TOPO_BASE_LAYER_ID,
        type: 'raster',
        source: 'topo-base',
        paint: BASEMAP_RASTER_PAINT,
      },
      {
        id: AGRO_CLOUD_ESRI_HILLSHADE_LAYER_ID,
        type: 'raster',
        source: AGRO_CLOUD_ESRI_HILLSHADE_SOURCE_ID,
        paint: ESRI_HILLSHADE_OVERLAY_PAINT,
      },
    ],
  }
}

type MapboxMapLike = {
  getSource?: (id: string) => unknown
  addSource?: (id: string, source: object) => void
  getLayer?: (id: string) => unknown
  addLayer?: (layer: object, beforeId?: string) => void
  moveLayer?: (id: string, beforeId?: string) => void
  removeLayer?: (id: string) => void
  removeSource?: (id: string) => void
  getStyle?: () => { layers?: { id: string; type?: string }[] }
  setTerrain?: (terrain: { source: string; exaggeration?: number } | null) => void
  setPaintProperty?: (layerId: string, name: string, value: unknown) => void
  getPitch?: () => number
  isStyleLoaded?: () => boolean
  isSourceLoaded?: (sourceId: string) => boolean
  loaded?: () => boolean
  on?: (event: string, handler: (ev?: { sourceId?: string; isSourceLoaded?: boolean }) => void) => void
  off?: (event: string, handler: (ev?: { sourceId?: string; isSourceLoaded?: boolean }) => void) => void
  once?: (event: string, handler: (ev?: { sourceId?: string; isSourceLoaded?: boolean }) => void) => void
  triggerRepaint?: () => void
}

const LEGACY_MAPBOX_TERRAIN_SOURCE_ID = 'agrocloud-terrain-dem'

/** Invalidate async terrain callbacks after style swap / unmount. */
const terrainSyncGenerationByMap = new WeakMap<object, number>()

function bumpTerrainSyncGeneration(map: MapboxMapLike): number {
  const key = map as object
  const next = (terrainSyncGenerationByMap.get(key) ?? 0) + 1
  terrainSyncGenerationByMap.set(key, next)
  return next
}

function isTerrainSyncCurrent(map: MapboxMapLike, generation: number): boolean {
  return terrainSyncGenerationByMap.get(map as object) === generation
}

function isMapStyleReady(map: MapboxMapLike | null | undefined): boolean {
  try {
    return Boolean(map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded())
  } catch {
    return false
  }
}

function isDemSourceReady(map: MapboxMapLike): boolean {
  try {
    if (!map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID)) return false
    if (typeof map.isSourceLoaded === 'function') {
      return map.isSourceLoaded(ESRI_WORLD_TERRAIN_SOURCE_ID)
    }
    const source = map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID) as { loaded?: () => boolean } | undefined
    if (typeof source?.loaded === 'function') return source.loaded()
    return false
  } catch {
    return false
  }
}

function disableTerrainMesh(map: MapboxMapLike): void {
  try {
    map.setTerrain?.(null)
    if (map.getLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)) {
      map.removeLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)
    }
  } catch {
    /* ignore style/source races during setStyle */
  }
}

function runOnMapIdle(map: MapboxMapLike, generation: number, run: () => void): void {
  const invoke = () => {
    if (!isTerrainSyncCurrent(map, generation)) return
    if (!isMapStyleReady(map)) return
    run()
  }

  try {
    if (typeof map.loaded === 'function' && !map.loaded()) {
      map.once?.('load', invoke)
      return
    }
    map.once?.('idle', invoke)
  } catch {
    invoke()
  }
}

function readLivePitch(map: MapboxMapLike | null | undefined, fallback = 0): number {
  try {
    if (typeof map?.getPitch === 'function') return map.getPitch()
  } catch {
    /* ignore */
  }
  return typeof fallback === 'number' ? fallback : 0
}

function isBasemapRasterLayerId(id: string): boolean {
  return (
    id === AGRO_CLOUD_TOPO_BASE_LAYER_ID ||
    /^layer-\d+$/.test(id) ||
    id.startsWith('topo-fallback-layer-') ||
    id === 'google-earth-sat-layer'
  )
}

/** Bottom-most basemap raster in the style stack (hillshade goes directly under it). */
function findBasemapStackBottomLayerId(map: MapboxMapLike): string | undefined {
  const layers = map.getStyle?.()?.layers ?? []
  for (const layer of layers) {
    if (layer.type === 'raster' && isBasemapRasterLayerId(layer.id)) {
      return layer.id
    }
  }
  return undefined
}

function applySnappyBasemapRasterPaint(map: MapboxMapLike): void {
  if (typeof map.setPaintProperty !== 'function') return
  const layers = map.getStyle?.()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'raster' || !isBasemapRasterLayerId(layer.id)) continue
    try {
      map.setPaintProperty(layer.id, 'raster-fade-duration', 0)
      map.setPaintProperty(layer.id, 'raster-opacity', 1)
    } catch {
      /* ignore */
    }
  }
}

function orderTerrainLayersBelowBasemap(map: MapboxMapLike, showHillshade: boolean): void {
  const basemapBottomId = findBasemapStackBottomLayerId(map)
  if (!basemapBottomId) return

  if (showHillshade) {
    if (!map.getLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)) {
      map.addLayer?.(
        {
          id: AGRO_CLOUD_HILLSHADE_LAYER_ID,
          type: 'hillshade',
          source: ESRI_WORLD_TERRAIN_SOURCE_ID,
          paint: HILLSHADE_PAINT,
        },
        basemapBottomId,
      )
    } else if (typeof map.moveLayer === 'function') {
      try {
        map.moveLayer(AGRO_CLOUD_HILLSHADE_LAYER_ID, basemapBottomId)
      } catch {
        /* ignore */
      }
    }
  } else if (map.getLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)) {
    map.removeLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)
  }
}

function removeLegacyTerrainSources(map: MapboxMapLike): void {
  try {
    if (!map.getSource?.(LEGACY_MAPBOX_TERRAIN_SOURCE_ID)) return
    if (map.getLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)) {
      map.removeLayer?.(AGRO_CLOUD_HILLSHADE_LAYER_ID)
    }
    map.removeSource?.(LEGACY_MAPBOX_TERRAIN_SOURCE_ID)
  } catch {
    /* ignore */
  }
}

/** Preload Esri DEM tiles (source only, no visible mesh) for fast 2D→3D transition. */
export function warmAgroCloudTerrainDemSource(map: MapboxMapLike | null | undefined): void {
  if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) return
  // Never add the DEM source until the backend terrain proxy is confirmed
  // reachable. On static/backend-less hosts adding it would fire one
  // `/api/terrain/esri-rgb/*` request per visible tile (hundreds of 404s plus
  // "Map Error" spam). While the probe is pending we kick it off and bail; the
  // controller re-runs once it resolves to `true`.
  if (terrainApiAvailability !== true) {
    void ensureTerrainApiAvailable()
    return
  }
  try {
    removeLegacyTerrainSources(map)
    if (!map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID)) {
      map.addSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID, buildEsriWorldTerrainDemSourceSpec())
    }
    applySnappyBasemapRasterPaint(map)
    map.triggerRepaint?.()
  } catch {
    /* ignore */
  }
}

function applyTerrainMesh(
  map: MapboxMapLike,
  livePitch: number,
  showHillshade: boolean,
  generation: number,
): void {
  if (!isTerrainSyncCurrent(map, generation)) return
  if (!isMapStyleReady(map)) return
  if (!map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID)) return
  if (!isDemSourceReady(map)) return

  runOnMapIdle(map, generation, () => {
    if (!isTerrainSyncCurrent(map, generation)) return
    if (!isMapStyleReady(map)) return
    if (!map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID)) return
    if (!isDemSourceReady(map)) return

    orderTerrainLayersBelowBasemap(map, showHillshade)
    applySnappyBasemapRasterPaint(map)
    try {
      map.setTerrain?.({
        source: ESRI_WORLD_TERRAIN_SOURCE_ID,
        exaggeration: terrainExaggerationForPitch(livePitch),
      })
    } catch {
      /* Mapbox can throw if style/source is mid-swap during _render */
    }
  })
}

function whenDemSourceReady(map: MapboxMapLike, generation: number, run: () => void): void {
  const tryRun = () => {
    if (!isTerrainSyncCurrent(map, generation)) return
    if (!isMapStyleReady(map)) return
    if (!isDemSourceReady(map)) return
    run()
  }

  if (isDemSourceReady(map)) {
    tryRun()
    return
  }

  let done = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined

  const finish = () => {
    if (done) return
    if (!isTerrainSyncCurrent(map, generation)) {
      done = true
      cleanup()
      return
    }
    if (!isMapStyleReady(map)) return
    if (!isDemSourceReady(map)) return
    done = true
    cleanup()
    tryRun()
  }

  const cleanup = () => {
    try {
      map.off?.('sourcedata', onSourceData)
    } catch {
      /* ignore */
    }
    if (pollTimer != null) window.clearTimeout(pollTimer)
  }

  const onSourceData = (ev: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (ev.sourceId === ESRI_WORLD_TERRAIN_SOURCE_ID && ev.isSourceLoaded) {
      finish()
    }
  }

  try {
    map.on?.('sourcedata', onSourceData)
  } catch {
    /* ignore */
  }

  let attempts = 0
  const poll = () => {
    if (done || !isTerrainSyncCurrent(map, generation)) {
      cleanup()
      return
    }
    if (isDemSourceReady(map)) {
      finish()
      return
    }
    attempts += 1
    if (attempts >= 48) {
      cleanup()
      return
    }
    pollTimer = window.setTimeout(poll, 50)
  }
  pollTimer = window.setTimeout(poll, 50)
}

/**
 * Does the current basemap / camera pitch call for a 3D mesh, ignoring backend
 * availability? Used to decide whether it's worth probing the terrain proxy.
 */
function wantsTerrainForView(basemapId: string, pitch: number): boolean {
  if (basemapId && isTerrain3dBasemapId(basemapId)) return true
  return pitch >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD
}

/** Enable or disable 3D terrain mesh after style load, basemap swap, or pitch change. */
export function syncAgroCloudTerrain3d(
  map: MapboxMapLike | null | undefined,
  basemapId: string,
  pitch?: number,
): void {
  if (!map || !isMapStyleReady(map)) return

  const generation = bumpTerrainSyncGeneration(map)
  const livePitch = readLivePitch(map, pitch ?? 0)
  const showHillshade = is3dTopographicBasemapId(basemapId)

  // No mesh wanted for this view → tear down immediately, no probe needed.
  if (!wantsTerrainForView(basemapId, livePitch)) {
    disableTerrainMesh(map)
    return
  }

  // Mesh wanted. Confirm the terrain proxy is reachable BEFORE adding the DEM
  // source, so backend-less hosts make at most one probe request instead of
  // flooding `/api/terrain/esri-rgb/*` with hundreds of 404s. The probe result
  // is cached, so repeated basemap/pitch changes never re-hit the network.
  void ensureTerrainApiAvailable().then((available) => {
    if (!isTerrainSyncCurrent(map, generation)) return
    if (!isMapStyleReady(map)) return

    if (!available) {
      // Graceful degradation: keep the flat topo/satellite raster basemap.
      disableTerrainMesh(map)
      return
    }

    warmAgroCloudTerrainDemSource(map)
    whenDemSourceReady(map, generation, () => {
      if (!isTerrainSyncCurrent(map, generation)) return
      applyTerrainMesh(map, livePitch, showHillshade, generation)
    })
  })
}

/** Cancel pending async terrain work (call before setStyle / unmount). */
export function cancelAgroCloudTerrainSync(map: MapboxMapLike | null | undefined): void {
  if (!map) return
  bumpTerrainSyncGeneration(map)
  disableTerrainMesh(map)
}
