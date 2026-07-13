/**
 * Shared basemap definitions for GIS Map (Leaflet) and Satellite Intelligence (Mapbox GL raster engine).
 * Esri tiles use server.arcgisonline.com …/tile/{z}/{y}/{x}.
 * Google Earth satellite uses Google VT raster tiles (no Mapbox basemap styles).
 */

import {
  build3dSatelliteLeafletLayers,
  build3dSatelliteMapboxStyle,
  build3dTopographicLeafletLayers,
  build3dTopographicMapboxStyle,
  SATELLITE_3D_BASEMAP_ID,
  TOPOGRAPHIC_3D_BASEMAP_ID,
} from '../../lib/agroCloudMapTerrain'
import { getGoogleMapsApiKeyFromEnv } from '../../lib/googleMapsApiKey'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ATTR_ESRI = 'Tiles © Esri'
const ATTR_GOOGLE = '© Google'
const ATTR_OSM = '© OpenStreetMap contributors'
const ATTR_CARTO = '© OpenStreetMap © CARTO'

export type LeafletTileSpec = { url: string; attribution: string; opacity?: number }

export type BasemapCatalogEntry = {
  id: string
  label: string
  /** Mapbox GL style URL or raster style JSON */
  mapboxStyle: string | Record<string, unknown>
  /** Leaflet TileLayer(s) */
  leafletLayers?: LeafletTileSpec[]
  /** @deprecated Mapbox-hosted basemaps removed */
  requiresMapboxToken?: boolean
  /** Uses Esri WorldElevation3D for 3D elevation mesh (below basemap rasters) */
  terrain3d?: boolean
}

/** Google satellite raster (lyrs=s). Requires API key for reliable embedding in Mapbox GL. */
function googleSatelliteTileUrls(apiKey = ''): string[] {
  const keySuffix = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  const base = (host: string) =>
    `https://${host}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}${keySuffix}`
  return [base('mt0'), base('mt1'), base('mt2'), base('mt3')]
}

function googleSatelliteLeafletUrl(apiKey = ''): string {
  const keySuffix = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  return `https://mt{s}.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}${keySuffix}`
}

function googleSatelliteRasterStyle(apiKey = ''): Record<string, unknown> {
  return {
    version: 8 as const,
    name: 'Google Earth Satellite',
    sources: {
      'google-earth-sat': {
        type: 'raster',
        tiles: googleSatelliteTileUrls(apiKey),
        tileSize: 256,
        attribution: ATTR_GOOGLE,
      },
    },
    layers: [{ id: 'google-earth-sat-layer', type: 'raster', source: 'google-earth-sat' }],
  }
}

function googleSatelliteLeafletLayers(apiKey = ''): LeafletTileSpec[] {
  return [{ url: googleSatelliteLeafletUrl(apiKey), attribution: ATTR_GOOGLE }]
}

function esriTile(servicePath: string): string {
  return `${ESRI}/${servicePath}/MapServer/tile/{z}/{y}/{x}`
}

/** ArcGIS Online folder paths — many basemaps are not at `/services/ServiceName`. */
const ESRI_CANVAS_LIGHT_BASE = 'Canvas/World_Light_Gray_Base'
const ESRI_CANVAS_LIGHT_REF = 'Canvas/World_Light_Gray_Reference'
const ESRI_CANVAS_DARK_BASE = 'Canvas/World_Dark_Gray_Base'
const ESRI_CANVAS_DARK_REF = 'Canvas/World_Dark_Gray_Reference'
const ESRI_OCEAN_BASE = 'Ocean/World_Ocean_Base'
const ESRI_OCEAN_REF = 'Ocean/World_Ocean_Reference'
const ESRI_REF_WORLD_OVERLAY = 'Reference/World_Reference_Overlay'

/** Mapbox GL raster sources need a single URL pattern; `{s}` (Leaflet subdomains) and `{r}` (Carto retina) are not expanded. */
export function tileUrlForMapboxGl(url: string): string {
  return url.replace(/\{s\}/gi, 'a').replace(/\{r\}/g, '')
}

export function rasterStyleFromTiles(layers: LeafletTileSpec[]): Record<string, unknown> {
  const sources: Record<string, unknown> = {}
  const mapLayers: unknown[] = []
  layers.forEach((L, i) => {
    const sid = `r${i}`
    sources[sid] = {
      type: 'raster',
      tiles: [tileUrlForMapboxGl(L.url)],
      tileSize: 256,
      attribution: L.attribution,
    }
    mapLayers.push({
      id: `layer-${i}`,
      type: 'raster',
      source: sid,
      paint:
        L.opacity != null
          ? { 'raster-fade-duration': 0, 'raster-opacity': L.opacity }
          : { 'raster-fade-duration': 0, 'raster-opacity': 1 },
    })
  })
  return { version: 8 as const, sources, layers: mapLayers }
}

const OSM_RASTER: Record<string, unknown> = rasterStyleFromTiles([
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM },
])

const OPENTOPO_RASTER: Record<string, unknown> = rasterStyleFromTiles([
  {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
  },
])

const ESRI_IMAGERY = esriTile('World_Imagery')
const ESRI_IMAGERY_STYLE = rasterStyleFromTiles([{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }])

export type BuildBasemapCatalogOptions = {
  /** @deprecated Mapbox basemaps removed; option ignored. */
  includeMapboxVectorBasemaps?: boolean
}

/** Build basemap catalog (Esri / Google / OSM / Carto — no Mapbox-hosted styles). */
export function buildBasemapCatalog(_legacyMapboxToken = '', _options?: BuildBasemapCatalogOptions): BasemapCatalogEntry[] {
  void _legacyMapboxToken
  void _options
  const googleKey = getGoogleMapsApiKeyFromEnv()

  const entries: BasemapCatalogEntry[] = [
    {
      id: 'google-earth-satellite',
      label: 'Google Earth Satellite',
      mapboxStyle: googleSatelliteRasterStyle(googleKey),
      leafletLayers: googleSatelliteLeafletLayers(googleKey),
    },
    {
      id: 'satellite',
      label: 'Satellite (Esri)',
      mapboxStyle: ESRI_IMAGERY_STYLE,
      leafletLayers: [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }],
    },
    {
      id: 'terrain-opentopo',
      label: 'Terrain (OpenTopo)',
      mapboxStyle: OPENTOPO_RASTER,
      leafletLayers: [
        {
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          attribution:
            '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
        },
      ],
    },
    {
      id: SATELLITE_3D_BASEMAP_ID,
      label: 'Satellite 3D (Esri Imagery + Terrain)',
      mapboxStyle: build3dSatelliteMapboxStyle(),
      leafletLayers: build3dSatelliteLeafletLayers(),
      terrain3d: true,
    },
    {
      id: TOPOGRAPHIC_3D_BASEMAP_ID,
      label: '3D Topographic',
      mapboxStyle: build3dTopographicMapboxStyle(),
      leafletLayers: build3dTopographicLeafletLayers(),
      terrain3d: true,
    },
    {
      id: 'osm',
      label: 'OpenStreetMap',
      mapboxStyle: OSM_RASTER,
      leafletLayers: [{ url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM }],
    },
    {
      id: 'esri',
      label: 'Esri World Imagery',
      mapboxStyle: ESRI_IMAGERY_STYLE,
      leafletLayers: [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-imagery-hybrid',
      label: 'Imagery Hybrid',
      mapboxStyle: rasterStyleFromTiles([
        { url: ESRI_IMAGERY, attribution: ATTR_ESRI },
        {
          url: esriTile('Reference/World_Boundaries_and_Places'),
          attribution: ATTR_ESRI,
          opacity: 1,
        },
      ]),
      leafletLayers: [
        { url: ESRI_IMAGERY, attribution: ATTR_ESRI },
        { url: esriTile('Reference/World_Boundaries_and_Places'), attribution: ATTR_ESRI, opacity: 1 },
      ],
    },
    {
      id: 'esri-streets',
      label: 'Streets',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-topo',
      label: 'Topographic / Outdoor',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-navigation-night',
      label: 'Streets (Night)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
    {
      id: 'esri-terrain-labels',
      label: 'Terrain with labels (Esri)',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_REF_WORLD_OVERLAY), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_REF_WORLD_OVERLAY), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-light-gray',
      label: 'Light Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_CANVAS_LIGHT_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_LIGHT_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_CANVAS_LIGHT_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_LIGHT_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-dark-gray',
      label: 'Dark Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_CANVAS_DARK_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_DARK_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_CANVAS_DARK_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_DARK_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-oceans',
      label: 'Oceans',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_OCEAN_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_OCEAN_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_OCEAN_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_OCEAN_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-natgeo',
      label: 'National Geographic',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('NatGeo_World_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('NatGeo_World_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-shaded-relief',
      label: 'Shaded Relief',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-physical',
      label: 'World Physical',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Physical_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Physical_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'carto-positron',
      label: 'Light (Carto)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
    {
      id: 'carto-dark-matter',
      label: 'Dark (Carto)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
  ]

  void googleKey

  const dedup = new Map<string, BasemapCatalogEntry>()
  entries.forEach(e => {
    if (!dedup.has(e.id)) dedup.set(e.id, e)
  })
  return Array.from(dedup.values())
}

/** Raster style JSON for Mapbox GL (Mapbox-hosted `mapbox://` styles are no longer used). */
export function mapboxGlStyleForEntry(entry: BasemapCatalogEntry, _mapboxToken = ''): string | Record<string, unknown> {
  void _mapboxToken
  const st = entry.mapboxStyle
  if (typeof st === 'string' && st.startsWith('mapbox://')) {
    if (entry.leafletLayers?.length) return rasterStyleFromTiles(entry.leafletLayers)
    return ESRI_IMAGERY_STYLE
  }
  return st
}

function rasterPreviewFromTemplate(template: string): string | null {
  if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) return null
  return template
    .replace(/\{s\}/gi, 'a')
    .replace(/\{r\}/g, '')
    .replace(/\{z\}/g, '2')
    .replace(/\{y\}/g, '1')
    .replace(/\{x\}/g, '2')
}

export function getBasemapThumbnail(entry: BasemapCatalogEntry, _mapboxToken = ''): string {
  void _mapboxToken
  if (entry.id === 'google-earth-satellite') {
    return 'https://mt1.google.com/vt/lyrs=s&x=2&y=1&z=2'
  }
  if (entry.id === TOPOGRAPHIC_3D_BASEMAP_ID) {
    return esriTile('World_Shaded_Relief').replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
  }

  const first = entry.leafletLayers?.[0]?.url
  if (first) {
    const direct = rasterPreviewFromTemplate(first)
    if (direct) return direct
  }
  return ESRI_IMAGERY.replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
}

/** ArcGIS Online–style Esri basemap picker order (Intelligence Dashboard / GIS Map). */
export const ESRI_BASEMAP_IDS = [
  'esri-imagery-hybrid',
  'esri',
  'esri-streets',
  'esri-topo',
  'esri-light-gray',
  'esri-dark-gray',
  'esri-terrain-labels',
  'esri-shaded-relief',
  'esri-physical',
  'esri-natgeo',
  'esri-oceans',
] as const

export type EsriBasemapId = (typeof ESRI_BASEMAP_IDS)[number]

export function listEsriBasemapEntries(catalog = buildBasemapCatalog('')): BasemapCatalogEntry[] {
  return ESRI_BASEMAP_IDS.map(id => catalogEntryById(catalog, id)).filter(
    (entry): entry is BasemapCatalogEntry => !!entry,
  )
}

/** Map saved UI / config ids to current catalog ids after deduplication or renames. */
export function resolveBasemapId(id: string): string {
  const legacy: Record<string, string> = {
    'mapbox-alkamelgis': 'google-earth-satellite',
    'mapbox-standard-satellite': 'google-earth-satellite',
    'mapbox-hybrid': 'esri-imagery-hybrid',
    hybrid: 'esri-imagery-hybrid',
    street: 'esri-streets',
    terrain: 'esri-topo',
    '3d-topo': TOPOGRAPHIC_3D_BASEMAP_ID,
    topographic3d: TOPOGRAPHIC_3D_BASEMAP_ID,
    'google-earth': 'google-earth-satellite',
    google: 'google-earth-satellite',
    'esri-navigation': 'esri-streets',
    'esri-outdoor': 'esri-topo',
    'esri-charted-territory': 'esri-shaded-relief',
    'carto-positron': 'esri',
    'carto-dark-matter': 'esri',
    osm: 'esri-streets',
    /** Legacy Mapbox satellite ids only — keep catalog `satellite` (Esri) and `esri` as-is. */
    'mapbox-satellite': 'google-earth-satellite',
  }
  return legacy[id] ?? id
}

export function catalogEntryById(catalog: BasemapCatalogEntry[], id: string): BasemapCatalogEntry | undefined {
  return catalog.find(e => e.id === id)
}

/** Reliable default (Esri World Imagery — no API key). */
export const RASTER_BASEMAP_FALLBACK_ID = 'satellite'

/** Preferred when Google Maps API key is configured. */
export const GOOGLE_EARTH_BASEMAP_ID = 'google-earth-satellite'

export const DEFAULT_BASEMAP_ID = RASTER_BASEMAP_FALLBACK_ID
/** @deprecated Alias — Mapbox basemaps removed; same default as {@link DEFAULT_BASEMAP_ID}. */
export const DEFAULT_BASEMAP_ID_NO_MAPBOX = RASTER_BASEMAP_FALLBACK_ID

/** Pick a basemap id that can render tiles (Google only when API key exists). */
export function pickDefaultBasemapId(storedOrPreferred?: string): string {
  const resolved = resolveBasemapId(storedOrPreferred || DEFAULT_BASEMAP_ID)
  if (resolved === GOOGLE_EARTH_BASEMAP_ID && !getGoogleMapsApiKeyFromEnv()) {
    return RASTER_BASEMAP_FALLBACK_ID
  }
  return resolved
}

export function isGoogleEarthBasemapId(id: string): boolean {
  return resolveBasemapId(id) === GOOGLE_EARTH_BASEMAP_ID
}

/** True when a tile URL likely failed for the active basemap (Google 403, etc.). */
export function basemapTileErrorShouldFallback(url: string, status?: number): boolean {
  const u = String(url || '').toLowerCase()
  if (!u) return false
  if (u.includes('google.com/vt') || u.includes('googleusercontent.com')) {
    return status === 403 || status === 401 || status === 0 || status === 404
  }
  return status === 403 || status === 401
}

export function isSatelliteImageryBasemapId(id: string): boolean {
  const resolved = resolveBasemapId(id)
  return (
    resolved === RASTER_BASEMAP_FALLBACK_ID ||
    resolved === GOOGLE_EARTH_BASEMAP_ID ||
    resolved === 'esri' ||
    resolved === 'satellite-3d' ||
    /satellite|imagery/i.test(resolved)
  )
}

/** @deprecated Mapbox basemaps removed; kept for import compatibility. */
export const BASEMAP_CATALOG_OPTS_SATELLITE_NO_MAPBOX_VECTOR: BuildBasemapCatalogOptions = {
  includeMapboxVectorBasemaps: false,
}
