import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import type { Map as LeafletMap } from 'leaflet'
import L from 'leaflet'
import { GeoJSON } from 'react-leaflet'
import { EsriImageServerLayer } from './components/EsriImageServerLayer'
import MapboxMap, { Layer, NavigationControl, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import MapView from '../../components/MapView'
import { AgroCloudMark } from '../../components/AgroCloudMark'
import type { LayerData, SymbologyClassMethod, SymbologyColorRamp, SymbologyConfig, SymbologyStyle } from './components/LayerManager'
import { FieldVisibilityControl } from './components/FieldVisibilityControl'
import { GeoExplorerGeminiInputRow } from './components/GeoExplorerGeminiInputRow'
import { MapPopup } from './components/MapPopup'
import { SiCopyTextButton } from './components/SiCopyTextButton'
import { DrawToolsController } from './components/DrawTools'
import { BasemapGallery, BasemapLayer, type BasemapType } from './components/BasemapGallery'
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  RASTER_BASEMAP_FALLBACK_ID,
  basemapTileErrorShouldFallback,
  mapboxGlStyleForEntry,
  pickDefaultBasemapId,
  resolveBasemapId,
} from './basemapCatalog'
import { useMapboxAccessToken } from '../../hooks/useMapboxAccessToken'
import { useOpenWeatherMapApiKey } from '../../hooks/useOpenWeatherMapApiKey'
import { getArcgisPortalToken } from '../../lib/arcgisPortalToken'
import { getMapboxAccessToken, getMapboxGlRendererToken } from '../../lib/mapboxAccessToken'
import {
  arcgisExtentToWgs84BBox,
  fetchImageServerMeta,
  getImageServerServiceRootFromUrl,
} from '../../lib/arcgisImageServer'
import {
  mergeShpLikeToFeatureCollection,
  normalizeGeoJsonEnvelope,
  parseFile,
  parseRemoteUrlAsFile,
} from '../../utils/FileLoader'
import { GisDataManager } from './gisDataManager';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey'
import {
  lastMapQueryCoordsFromMessages,
  replaceUserMessageText,
  type GeoExplorerMapLink,
  type GeoExplorerMessage,
  type GeoExplorerPart,
} from '../../lib/geoExplorerGemini'
import { appAlert, appConfirm, appPrompt } from '../../lib/appDialog'
import { DEVELOP_DATA_CONTEXT_LS_KEY } from '../../lib/geoAiChatClaude'
import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  getArcDisplayValue as arcSchemaDisplayValue,
} from '../../lib/arcgisAttributeDisplay'
import {
  buildGisContentMapLayerPayload,
  buildGisContentMapLayerPayloadAsync,
  getGisContentItemDetails,
  getGisContentRowById,
  isGisContentRowInRecycle,
  upsertGisContentPortalHostedFeatureLayer,
  upsertGisContentPortalWebMap,
  useGisContentPortal,
} from '../../lib/gisContentPortalStore'
import { buildGisWebMapSnapshot, readGisWebMapSnapshot, type GisWebMapSnapshotV1 } from '../../lib/gisWebMapPortal'
import {
  type GisHostedFeatureLayerGeoJson,
  type GisHostedFeatureLayerSourceMethod,
  fetchArcGisFeatureLayerGeoJson,
} from '../../lib/gisHostedFeatureLayerPortal'
import { gisContentPortalLayerUrl, listGisContentPortalSavedLayers, parseGisContentPortalLayerUrl } from '../../lib/gisContentPortalTableUtils'
import { geoJsonForGisContentLayerSave, saveMapVectorLayerToGisContent } from '../../lib/gisMapLayerGisContentSave'
import { gisLayerDataToGeoAiLayers } from '../../lib/geoAiMapLayerSources'
import { geoExplorerTargetZoomForPinSource, runGeoExplorerGeminiTurn } from '../../lib/runGeoExplorerGeminiTurn'
import { runGeoAiStatsCommand, type GeoAiMapFirstSelection } from '../../lib/geoAiStatsEngine'
import {
  findLngLatFromLayerQuery,
  GEO_EXPLORER_MIN_LAYER_PIN_SCORE,
  geoAiFeatureCentroid,
  type LayerQueryMatch,
} from '../../lib/geoExplorerLayerContext'
import {
  loadGisMapChartPanelConfig,
  persistGisMapChartPanelConfig,
  type GisChartPanelConfig,
} from '../../lib/gisMapChartPanelConfig'
import './gisGeoExplorerPanel.css'
import '../../styles/gisModalSystem.css'
import { GisGeoExplorerChartConfig } from './components/GisGeoExplorerChartConfig'
import { GeoExplorerGeminiMessageParts } from './components/GeoExplorerGeminiMessageParts'
import { GisMapBrowseLayersPane } from './components/GisMapBrowseLayersPane'
import { GisMapSaveOpenFlyout } from './components/GisMapSaveOpenPanel'
import { SelectMapFromGisContentModal } from '../dashboards/agrocloud/SelectMapFromGisContentModal'
import type { GisContentRow } from '../master/gisContentPortalData'
import { gisContentPortalDisplayTypeLabel } from '../master/gisContentPortalData'
import { siDefaultNewVectorLayerFields, SI_DEFAULT_VECTOR_OUTLINE_COLOR, SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA, SI_DEFAULT_VECTOR_LINE_WEIGHT } from './siSymbolStyleStudio'
import { isGisPortalRowMapAddable } from '../master/gisContentPortalData'
import { GisUploadCloudSources } from '../../components/GisUploadCloudSources'
import {
  bindAgroCloudMapWheelZoomPassthrough,
  ensureAgroCloudMapScrollZoom,
  useAgroCloudMapboxMouseHost,
} from '../../lib/agroCloudMapMouseBehavior'
import {
  is3dTopographicBasemapId,
  syncAgroCloudTerrain3d,
  warmAgroCloudTerrainDemSource,
} from '../../lib/agroCloudMapTerrain'
import { flyToLikeGoogleEarth } from '../../lib/googleEarthFlyTo'
import { computeStableGisFeatureKey } from '../../lib/gisFeatureStableKey'

const GIS_AGOL_RAIL_COMPACT_LS_KEY = 'gis-agol-rail-compact-v2'
const GEO_AI_CHAT_PAGE_SIZE = 40

type AddLayerTab = 'giscontent' | 'arcgis' | 'database' | 'upload' | 'url'
type SymbologyStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot'

const GIS_STYLE_CLIPBOARD_LS = 'agri-gis-style-clipboard-v1'
const GIS_STYLE_PREFS_LS = 'agri-gis-style-studio-prefs-v1'

type GisFillStyle = 'solid' | 'pattern' | 'hatch' | 'gradient'

type GisLayerAppearancePersisted = {
  color: string
  fillColor: string
  weight: number
  opacity: number
  strokeStyle: SymbologyStrokeStyle
  polygonFillAlpha: number
  pointRadius: number
  fillStyle: GisFillStyle
  blendMode: NonNullable<LayerData['blendMode']>
}

type GisSymbologyAppearance = GisLayerAppearancePersisted & { previewCornerRadius: number }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const clampPolygonFillAlpha = (layer: LayerData) => {
  const v = layer.polygonFillAlpha
  return typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA
}

const clampPointRadius = (layer: LayerData) => {
  const v = layer.pointRadius
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(3, Math.min(24, v)) : 6
}

const defaultBlendMode = (): NonNullable<LayerData['blendMode']> => 'normal'

const appearanceFromLayer = (layer: LayerData): GisSymbologyAppearance => ({
  color: layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  fillColor: layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  weight: layer.weight ?? SI_DEFAULT_VECTOR_LINE_WEIGHT,
  opacity: typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? clamp01(layer.opacity) : 1,
  strokeStyle: ((layer as any).strokeStyle as SymbologyStrokeStyle) || 'solid',
  polygonFillAlpha: clampPolygonFillAlpha(layer),
  pointRadius: clampPointRadius(layer),
  fillStyle: ((layer as any).fillStyle as GisFillStyle) || 'solid',
  blendMode: layer.blendMode ?? defaultBlendMode(),
  previewCornerRadius: 8,
})

const layerAppearanceFingerprint = (layer: LayerData) =>
  [
    layer.color ?? '',
    layer.fillColor ?? '',
    String(layer.weight ?? ''),
    String(layer.opacity ?? ''),
    String(layer.polygonFillAlpha ?? ''),
    String(layer.pointRadius ?? ''),
    String((layer as any).strokeStyle ?? ''),
    String((layer as any).fillStyle ?? ''),
    String(layer.blendMode ?? ''),
    layer.symbology ? JSON.stringify(layer.symbology) : '',
    (layer as any).arcgisRenderer?.type ?? '',
  ].join('~')

const mapboxLineDashArray = (style?: string): number[] | undefined => {
  if (style === 'dashed') return [6, 4]
  if (style === 'dotted') return [2, 5]
  if (style === 'dashdot') return [10, 4, 2, 4]
  return undefined
}

const pathBlendClassName = (mode?: LayerData['blendMode']) =>
  mode && mode !== 'normal' ? `gis-path-blend gis-path-blend--${mode}` : undefined

const fillOpacityFactorForFillStyle = (fillStyle: GisFillStyle | undefined): number => {
  if (fillStyle === 'pattern') return 0.92
  if (fillStyle === 'hatch') return 0.88
  if (fillStyle === 'gradient') return 0.9
  return 1
}

const strokeDashFromStyle = (style?: string): string => {
  if (style === 'dashed') return '8 4'
  if (style === 'dotted') return '2 4'
  if (style === 'dashdot') return '12 4 2 4'
  return ''
}

type GisStyleClipboardV1 = { v: 1; appearance: GisLayerAppearancePersisted }

function readGisStyleClipboard(): GisLayerAppearancePersisted | null {
  try {
    const raw = localStorage.getItem(GIS_STYLE_CLIPBOARD_LS)
    if (!raw) return null
    const j = JSON.parse(raw) as GisStyleClipboardV1
    if (!j || j.v !== 1 || !j.appearance || typeof j.appearance !== 'object') return null
    return j.appearance
  } catch {
    return null
  }
}

function writeGisStyleClipboard(appearance: GisLayerAppearancePersisted) {
  try {
    const payload: GisStyleClipboardV1 = { v: 1, appearance }
    localStorage.setItem(GIS_STYLE_CLIPBOARD_LS, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

function loadGisStudioPrefs(): Partial<{ visualization: boolean; studio: boolean; legend: boolean }> {
  try {
    const raw = localStorage.getItem(GIS_STYLE_PREFS_LS)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<{ visualization: boolean; studio: boolean; legend: boolean }>
  } catch {
    return {}
  }
}

function saveGisStudioPrefs(sections: { visualization: boolean; studio: boolean; legend: boolean }) {
  try {
    localStorage.setItem(GIS_STYLE_PREFS_LS, JSON.stringify(sections))
  } catch {
    /* ignore */
  }
}

const GIS_STYLE_PRESETS: Array<{ id: string; label: string; patch: Partial<GisSymbologyAppearance> }> = [
  { id: 'carto', label: 'Carto outline', patch: { strokeStyle: 'solid', weight: 2.5, polygonFillAlpha: 0.28, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'soft', label: 'Soft fill', patch: { polygonFillAlpha: 0.5, weight: 1, opacity: 0.92, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'survey', label: 'Survey dashed', patch: { strokeStyle: 'dashed', weight: 2, polygonFillAlpha: 0.22, fillStyle: 'pattern', blendMode: 'normal' } },
  { id: 'bold', label: 'Bold lines', patch: { weight: 5, strokeStyle: 'solid', polygonFillAlpha: 0.4, pointRadius: 10, blendMode: 'normal' } },
  { id: 'multiply', label: 'Multiply blend', patch: { blendMode: 'multiply', polygonFillAlpha: 0.45, fillStyle: 'solid' } },
]

function isGisMapFeatureCollectionData(x: unknown): boolean {
  return Boolean(
    x &&
      typeof x === 'object' &&
      (x as { type?: string }).type === 'FeatureCollection' &&
      Array.isArray((x as { features?: unknown }).features),
  )
}

function gisMapLayerImportableFromStore(layer: LayerData): boolean {
  if (layer.type === 'geojson' && isGisMapFeatureCollectionData(layer.data)) return true
  if (layer.type === 'tile' && layer.url && (layer.data as { esriImageServer?: boolean })?.esriImageServer) return true
  return false
}

function gisLayerFeatureCountForChart(layer: LayerData): number {
  if (layer.type === 'tile' && (layer.data as { esriImageServer?: boolean })?.esriImageServer) return 0
  const d = layer.data as { features?: unknown[] } | undefined
  return Array.isArray(d?.features) ? d.features.length : 0
}

/** Resolve a Geo AI layer attribute hit to the real map feature (geometry + stable key). */
function findGisMapFeatureByLayerHit(
  layers: LayerData[],
  hit: Pick<LayerQueryMatch, 'layerName' | 'properties'>,
): { layer: LayerData; feature: any } | null {
  if (!hit.properties || typeof hit.properties !== 'object') return null
  const layerRow = layers.find(l => l.name === hit.layerName && l.type === 'geojson')
  const features = layerRow && Array.isArray((layerRow.data as { features?: unknown[] })?.features)
    ? ((layerRow.data as { features: any[] }).features as any[])
    : []
  if (!layerRow || !features.length) return null
  const hp = hit.properties as Record<string, unknown>
  const idKeys = ['OBJECTID', 'objectid', 'FID', 'fid', 'GlobalID', 'globalid'] as const
  for (const idk of idKeys) {
    const v = hp[idk]
    if (v == null || v === '') continue
    for (let i = 0; i < features.length; i++) {
      const p = features[i]?.properties as Record<string, unknown> | undefined
      if (p && String(p[idk]) === String(v)) return { layer: layerRow, feature: features[i] }
    }
  }
  let bestScore = 0
  let best: { layer: LayerData; feature: any } | null = null
  for (let i = 0; i < features.length; i++) {
    const p = features[i]?.properties as Record<string, unknown> | undefined
    if (!p) continue
    let s = 0
    for (const [k, v] of Object.entries(hp)) {
      if (v == null || v === '') continue
      if (String(p[k]) === String(v)) s += 2
    }
    if (s > bestScore) {
      bestScore = s
      best = { layer: layerRow, feature: features[i] }
    }
  }
  if (best && bestScore >= 4) return best
  return null
}

function gisChartDonutConicBackground(rows: Array<{ count: number; color: string }>): string {
  const nonzero = rows.filter(r => r.count > 0)
  const total = nonzero.reduce((s, r) => s + r.count, 0)
  if (total <= 0) return 'conic-gradient(#e2e8f0 0% 100%)'
  let acc = 0
  const segs: string[] = []
  for (const r of nonzero) {
    const pct = (r.count / total) * 100
    const start = acc
    acc += pct
    segs.push(`${r.color} ${start}% ${acc}%`)
  }
  return `conic-gradient(${segs.join(', ')})`
}

const newGisImportId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`
type GisLayersPaneView = 'layers' | 'browse'
type GisMapToolPanel =
  | 'basemap'
  | 'legend'
  | 'chart'
  | 'print'
  | 'measure'
  | 'search'
  | 'geoExplorer'
  | 'table'
  | 'bookmarks'
  | 'saveOpen'
  | 'settings'
  | 'apps'
  | 'embedMap'
  | 'shareMap'
  | null
type MapProjectionMode = 'globe' | '2d'
type MeasurementMode = 'distance' | 'area' | 'features' | 'vertical' | 'direction' | 'offset' | 'angle'
type MeasurementMethod = 'geodesic' | 'planar' | 'loxodromic' | 'greatElliptic'
type MeasurementUnit = 'metric' | 'imperial' | 'miles' | 'feet' | 'usFeet' | 'yards' | 'kilometers' | 'meters'
type TableDomainDisplayMode = 'description' | 'code'
type TableSearchMode = 'description' | 'code' | 'both'
type TableFilterOperator = 'contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty'

type GisMapBookmark = {
  id: string
  name: string
  lat: number
  lng: number
  zoom: number
  projection: MapProjectionMode
}

const GIS_MAP_BOOKMARKS_LS_KEY = 'gis-map-bookmarks-v1'

function loadGisMapBookmarks(): GisMapBookmark[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GIS_MAP_BOOKMARKS_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (x): x is GisMapBookmark =>
          x &&
          typeof x === 'object' &&
          typeof (x as GisMapBookmark).id === 'string' &&
          typeof (x as GisMapBookmark).name === 'string' &&
          typeof (x as GisMapBookmark).lat === 'number' &&
          typeof (x as GisMapBookmark).lng === 'number' &&
          typeof (x as GisMapBookmark).zoom === 'number' &&
          ((x as GisMapBookmark).projection === '2d' || (x as GisMapBookmark).projection === 'globe'),
      )
      .slice(0, 40)
  } catch {
    return []
  }
}

function persistGisMapBookmarks(rows: GisMapBookmark[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GIS_MAP_BOOKMARKS_LS_KEY, JSON.stringify(rows))
  } catch {
    // ignore
  }
}

const GIS_BASEMAP_STORAGE_KEY = 'gis-map-default-basemap'

const defaultGisBasemapId = (): BasemapType =>
DEFAULT_BASEMAP_ID

const DEFAULT_GIS_CENTER = { latitude: 2, longitude: 20 }
const GLOBE_CAMERA_PADDING = { top: 0, right: 0, bottom: 136, left: 0 }
const OSM_GLOBE_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const safeMapboxId = (value: unknown) => String(value ?? 'layer').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)

const GIS_LAYER_MENU_WIDTH = 272
const GIS_LAYER_MENU_MAX_HEIGHT = 520

type GisLayerDialogState = null | {
  mode: 'props' | 'table' | 'legend'
  layerId: string
  /** Props modal: metadata summary vs pop-up oriented copy. */
  propsFocus?: 'metadata' | 'popup'
}
const DB_PLATFORM_OPTIONS = [
  'SQL Server',
  'BigQuery',
  'Dameng',
  'DB2',
  'Elasticsearch',
  'OpenSearch',
  'Oracle',
  'PostgreSQL',
  'Redshift',
  'SAP HANA',
  'Snowflake',
  'Teradata',
] as const
const GIS_DB_CONNECTIONS_STORAGE_KEY = 'gis-map-db-connections-v1'

/** Anchor layer ⋮ menu to the clicked trigger (avoids wrong `querySelector` + stacking/scroll contexts). */
function computeLayerMenuPositionFromAnchor(anchor: HTMLElement): { top: number; left: number; maxHeight: number } {
  const rect = anchor.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = Math.min(rect.right - GIS_LAYER_MENU_WIDTH, vw - GIS_LAYER_MENU_WIDTH - 8)
  left = Math.max(8, left)
  let top = rect.bottom + 6
  if (top + GIS_LAYER_MENU_MAX_HEIGHT > vh - 8) {
    top = Math.max(8, rect.top - 6 - GIS_LAYER_MENU_MAX_HEIGHT)
  }
  const maxHeight = Math.min(GIS_LAYER_MENU_MAX_HEIGHT, Math.max(120, vh - 8 - top))
  return { top, left, maxHeight }
}

const MEASUREMENT_TOOLS: Array<{ id: MeasurementMode; label: string; icon: string; disabled?: boolean }> = [
  { id: 'distance', label: 'Measure Distance', icon: 'fa-solid fa-ruler-horizontal' },
  { id: 'area', label: 'Measure Area', icon: 'fa-solid fa-draw-polygon' },
  { id: 'features', label: 'Measure Features', icon: 'fa-solid fa-vector-square' },
  { id: 'vertical', label: 'Measure Vertical', icon: 'fa-solid fa-ruler-vertical' },
  { id: 'direction', label: 'Measure Direction Distance', icon: 'fa-solid fa-compass-drafting' },
  { id: 'offset', label: 'Measure Offset', icon: 'fa-solid fa-up-right-and-down-left-from-center' },
  { id: 'angle', label: 'Measure Angle', icon: 'fa-solid fa-drafting-compass' },
]

/** Web Mercator-ish spherical polygon area (m²); adequate for GIS sketch measurements */
function geographicPolygonAreaM2(ring: L.LatLng[]): number {
  if (ring.length < 3) return 0
  const R = 6378137
  let sum = 0
  const n = ring.length
  for (let i = 0; i < n; i += 1) {
    const λ1 = ring[i].lng * (Math.PI / 180)
    const φ1 = ring[i].lat * (Math.PI / 180)
    const λ2 = ring[(i + 1) % n].lng * (Math.PI / 180)
    const φ2 = ring[(i + 1) % n].lat * (Math.PI / 180)
    sum += (λ2 - λ1) * (2 + Math.sin(φ1) + Math.sin(φ2))
  }
  return Math.abs((sum * R * R) / 2)
}

function polylineLengthM(points: L.LatLng[]): number {
  let s = 0
  for (let i = 1; i < points.length; i += 1) s += points[i - 1].distanceTo(points[i])
  return s
}

function polygonPerimeterM(ring: L.LatLng[]): number {
  if (ring.length < 2) return 0
  return polylineLengthM([...ring, ring[0]])
}

function bearingDegrees(a: L.LatLng, b: L.LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return ((θ * 180) / Math.PI + 360) % 360
}

function angleAtVertexDegrees(a: L.LatLng, b: L.LatLng, c: L.LatLng): number {
  const v1x = a.lng - b.lng
  const v1y = a.lat - b.lat
  const v2x = c.lng - b.lng
  const v2y = c.lat - b.lat
  const dot = v1x * v2x + v1y * v2y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
  if (!mag) return 0
  const cos = Math.max(-1, Math.min(1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Shortest distance from point C to segment AB on local tangent plane (approximation for sketch tools) */
function distancePointToSegmentM(a: L.LatLng, b: L.LatLng, c: L.LatLng): number {
  const px = b.lng - a.lng
  const py = b.lat - a.lat
  const norm = px * px + py * py || 1
  let t = ((c.lng - a.lng) * px + (c.lat - a.lat) * py) / norm
  t = Math.max(0, Math.min(1, t))
  const nx = a.lng + t * px
  const ny = a.lat + t * py
  return c.distanceTo(L.latLng(ny, nx))
}

async function fetchElevationsM(latlngs: L.LatLng[]): Promise<number[]> {
  const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      locations: latlngs.map(p => ({ latitude: p.lat, longitude: p.lng })),
    }),
  })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  const arr = Array.isArray(data?.results) ? data.results : []
  return arr.map((r: any) => Number(r?.elevation)).map((v: number) => (Number.isFinite(v) ? v : NaN))
}

function segmentLengthM(a: L.LatLng, b: L.LatLng, method: MeasurementMethod): number {
  if (method === 'planar') {
    const R = 6371000
    const dLat = ((b.lat - a.lat) * Math.PI) / 180 * R
    const dLng = ((b.lng - a.lng) * Math.PI) / 180 * R * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
    return Math.hypot(dLat, dLng)
  }
  return a.distanceTo(b)
}

function polylineLengthWithMethod(points: L.LatLng[], method: MeasurementMethod): number {
  let s = 0
  for (let i = 1; i < points.length; i += 1) s += segmentLengthM(points[i - 1], points[i], method)
  return s
}

function polygonPerimeterWithMethod(ring: L.LatLng[], method: MeasurementMethod): number {
  if (ring.length < 2) return 0
  const n = ring.length
  let s = 0
  for (let i = 0; i < n; i += 1) s += segmentLengthM(ring[i], ring[(i + 1) % n], method)
  return s
}

function planarPolygonAreaM2(ring: L.LatLng[]): number {
  if (ring.length < 3) return 0
  const anchor = ring[0]
  const R = 6371000
  const cosLat = Math.cos((anchor.lat * Math.PI) / 180)
  const pts = ring.map(p => ({
    x: ((p.lng - anchor.lng) * Math.PI) / 180 * R * cosLat,
    y: ((p.lat - anchor.lat) * Math.PI) / 180 * R,
  }))
  let sum = 0
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(sum / 2)
}

function polygonAreaM2ByMethod(ring: L.LatLng[], method: MeasurementMethod): number {
  if (method === 'planar') return planarPolygonAreaM2(ring)
  return geographicPolygonAreaM2(ring)
}

const MEASUREMENT_METHODS: Array<{ id: MeasurementMethod; label: string }> = [
  { id: 'geodesic', label: 'Geodesic' },
  { id: 'planar', label: 'Planar' },
  { id: 'loxodromic', label: 'Loxodromic' },
  { id: 'greatElliptic', label: 'Great Elliptic' },
]

const MEASUREMENT_UNITS: Array<{ id: MeasurementUnit; label: string }> = [
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
  { id: 'miles', label: 'Miles' },
  { id: 'feet', label: 'Feet' },
  { id: 'usFeet', label: 'US Feet' },
  { id: 'yards', label: 'Yards' },
  { id: 'kilometers', label: 'Kilometers' },
  { id: 'meters', label: 'Meters' },
]

const readStoredBasemap = (): BasemapType => {
  const fallback = pickDefaultBasemapId(defaultGisBasemapId()) as BasemapType
  if (typeof window === 'undefined') return fallback
  const stored = window.localStorage.getItem(GIS_BASEMAP_STORAGE_KEY)
  if (!stored) return fallback
  const resolved = pickDefaultBasemapId(stored) as BasemapType
  const token = getMapboxAccessToken()
  if (catalogEntryById(buildBasemapCatalog(token), resolved)) return resolved
  if (catalogEntryById(buildBasemapCatalog(''), resolved)) return resolved
  return fallback
}

/** Mapbox GL requires a token even for raster fallbacks; avoid Mapbox-only basemap when token is missing. */
const readInitialGlobeBasemap = (): BasemapType => readStoredBasemap()

const DB_NAME = 'GisMapStore'
const STORE_NAME = 'layers'

const initDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1)
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE_NAME)) {
      req.result.createObjectStore(STORE_NAME)
    }
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const saveLayersToDB = async (layers: LayerData[]) => {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(layers, 'savedLayers')
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
  } catch (e) {
    console.error('Failed to save layers', e)
  }
}

const loadLayersFromDB = async (): Promise<LayerData[]> => {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get('savedLayers')
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = reject
    })
  } catch (e) {
    console.error('Failed to load layers', e)
    return []
  }
}

export type ArcGisLegendEntry = { label: string; symbol: any }

export const buildArcGisLegendEntries = (renderer: any, limit = 16): ArcGisLegendEntry[] => {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(64, Math.floor(limit))) : 16
  if (!renderer || typeof renderer !== 'object') return []
  const type = renderer?.type
  if (type === 'simple') {
    const symbol = renderer?.symbol ?? null
    if (!symbol) return []
    const label = typeof renderer?.label === 'string' && renderer.label ? renderer.label : 'Default'
    return [{ label, symbol }]
  }
  if (type === 'uniqueValue') {
    const infos = Array.isArray(renderer?.uniqueValueInfos) ? (renderer.uniqueValueInfos as any[]) : []
    const out: ArcGisLegendEntry[] = []
    for (const info of infos.slice(0, safeLimit)) {
      const symbol = info?.symbol ?? null
      if (!symbol) continue
      const label =
        typeof info?.label === 'string' && info.label
          ? info.label
          : typeof info?.value === 'string' && info.value
            ? info.value
            : 'Value'
      out.push({ label, symbol })
    }
    if (out.length < safeLimit && renderer?.defaultSymbol) out.push({ label: 'Other', symbol: renderer.defaultSymbol })
    return out
  }
  if (type === 'classBreaks') {
    const infos = Array.isArray(renderer?.classBreakInfos) ? (renderer.classBreakInfos as any[]) : []
    const out: ArcGisLegendEntry[] = []
    for (const info of infos.slice(0, safeLimit)) {
      const symbol = info?.symbol ?? null
      if (!symbol) continue
      const max = info?.classMaxValue
      const label =
        typeof info?.label === 'string' && info.label
          ? info.label
          : typeof max === 'number' && Number.isFinite(max)
            ? `≤ ${max}`
            : 'Range'
      out.push({ label, symbol })
    }
    if (out.length < safeLimit && renderer?.defaultSymbol) out.push({ label: 'Other', symbol: renderer.defaultSymbol })
    return out
  }
  return []
}

/** ArcGIS renderer field line (unique values / class breaks) — classic legend subtitle */
function arcgisRendererFieldHint(renderer: any): string | null {
  if (!renderer || typeof renderer !== 'object') return null
  const t = renderer.type
  if (t === 'uniqueValue') {
    const single = typeof renderer.field === 'string' ? renderer.field.trim() : ''
    const f1 = typeof renderer.field1 === 'string' ? renderer.field1.trim() : ''
    const f2 = typeof renderer.field2 === 'string' ? renderer.field2.trim() : ''
    const f3 = typeof renderer.field3 === 'string' ? renderer.field3.trim() : ''
    const parts = [single, f1, f2, f3].filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }
  if (t === 'classBreaks') {
    const f = typeof renderer.field === 'string' ? renderer.field.trim() : ''
    return f || null
  }
  return null
}

export default function GisMap() {
  const gisContentPortal = useGisContentPortal()
  const [searchParams, setSearchParams] = useSearchParams()
  const gisContentDeepLinkRef = useRef<string | null>(null)
  const mapboxAccessToken = useMapboxAccessToken()
  const mapboxGlRendererToken = useMemo(() => getMapboxGlRendererToken(), [mapboxAccessToken])
  const gisBasemapRasterFallbackRef = useRef(false)
  const openWeatherApiKey = useOpenWeatherMapApiKey()
  const getIsMobileDrawerViewport = () => (typeof window !== 'undefined' ? window.innerWidth <= 767 : false)
  const mapRef = useRef<LeafletMap | null>(null)
  const selectionOverlayRef = useRef<L.LayerGroup | null>(null)
  const drawingFeatureGroupRef = useRef<L.FeatureGroup | null>(null)
  const measurementLayerRef = useRef<L.LayerGroup | null>(null)
  const [layers, setLayers] = useState<LayerData[]>([])
  const layersRef = useRef<LayerData[]>([])
  useEffect(() => {
    layersRef.current = layers
  }, [layers])
  const [layersLoaded, setLayersLoaded] = useState(false)
  const persistLayersJobRef = useRef<null | { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> }>(null)
  const geoJsonDataIdByObjectRef = useRef<WeakMap<object, number>>(new WeakMap())
  const geoJsonDataIdSeqRef = useRef(1)
  const [isMobileDrawerViewport, setIsMobileDrawerViewport] = useState(getIsMobileDrawerViewport)
  /** Side-by-side map + sidebar (matches CSS breakpoint >900px); rail hides below this width. */
  const [isSplitDesktopLayout, setIsSplitDesktopLayout] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 900,
  )
  const [sidebarOpen, setSidebarOpen] = useState(() => !getIsMobileDrawerViewport())
  /** Desktop / wide layout: narrow the layers column; cleared on mobile or stacked layout. */
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false)
  /** ArcGIS rail: hide white action column only; toolbar rail stays visible. */
  const [agolContentColumnOpen, setAgolContentColumnOpen] = useState(false)
  const agolContentColumnOpenRef = useRef(agolContentColumnOpen)
  agolContentColumnOpenRef.current = agolContentColumnOpen
  const saveOpenRailBtnRef = useRef<HTMLButtonElement>(null)
  /** ArcGIS rail: icon-only narrow strip vs icon + labels (persisted; default compact). */
  const [agolRailCompact, setAgolRailCompact] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const stored = window.localStorage.getItem(GIS_AGOL_RAIL_COMPACT_LS_KEY)
      if (stored === null) return true
      return stored === '1'
    } catch {
      return true
    }
  })
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [layersPaneView, setLayersPaneView] = useState<GisLayersPaneView>('layers')
  const [addingPortalRowId, setAddingPortalRowId] = useState<string | null>(null)
  const [portalBrowseStatus, setPortalBrowseStatus] = useState<string | null>(null)
  const [savedPortalWebMapId, setSavedPortalWebMapId] = useState<string | null>(null)
  const [savedPortalWebMapTitle, setSavedPortalWebMapTitle] = useState<string | null>(null)
  const [openWebMapModalOpen, setOpenWebMapModalOpen] = useState(false)
  const [activeMapTool, setActiveMapTool] = useState<GisMapToolPanel>(null)
  const [selectedBasemap, setSelectedBasemap] = useState<BasemapType>(readInitialGlobeBasemap)
  const [mapProjectionMode, setMapProjectionMode] = useState<MapProjectionMode>('2d')
  const mapProjectionModeRef = useRef<MapProjectionMode>(mapProjectionMode)
  mapProjectionModeRef.current = mapProjectionMode
  const [projectionToast, setProjectionToast] = useState('')
  const [globeViewState, setGlobeViewState] = useState({
    longitude: DEFAULT_GIS_CENTER.longitude,
    latitude: DEFAULT_GIS_CENTER.latitude,
    zoom: 1.2,
    pitch: 30,
    bearing: 0,
  })
  const [globeLoaded, setGlobeLoaded] = useState(false)
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const [mapSearchStatus, setMapSearchStatus] = useState('')
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const geminiApiKey = useGeminiApiKey()
  const geoExplorerFileInputRef = useRef<HTMLInputElement | null>(null)
  const geoExplorerInFlightRef = useRef(false)
  const [geoExplorerMessages, setGeoExplorerMessages] = useState<GeoExplorerMessage[]>([])
  const [geoExplorerVisibleCount, setGeoExplorerVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE)
  const [geoAiSmartSuggestionsEnabled, setGeoAiSmartSuggestionsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('geo_ai_smart_suggestions_enabled_v1') !== '0'
  })
  const [geoExplorerDraft, setGeoExplorerDraft] = useState('')
  const [geoExplorerPendingImage, setGeoExplorerPendingImage] = useState<{ mime: string; base64: string } | null>(null)
  const [geoExplorerBusy, setGeoExplorerBusy] = useState(false)
  const [geoExplorerAwaitKind, setGeoExplorerAwaitKind] = useState<'send' | 'edit'>('send')
  const [geoExplorerChatError, setGeoExplorerChatError] = useState('')
  const [geoExplorerAnchor, setGeoExplorerAnchor] = useState<[number, number] | null>(null)
  const [gisChartPanelConfig, setGisChartPanelConfig] = useState<GisChartPanelConfig>(() => loadGisMapChartPanelConfig())
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>('distance')
  const [measurementMethod, setMeasurementMethod] = useState<MeasurementMethod>('planar')
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>('metric')
  const [measurementSketch, setMeasurementSketch] = useState<{ points: L.LatLng[]; closed: boolean }>({ points: [], closed: false })
  const [measurementElevations, setMeasurementElevations] = useState<[number, number] | null>(null)
  const [measurementVerticalLoading, setMeasurementVerticalLoading] = useState(false)
  const [measurementVerticalError, setMeasurementVerticalError] = useState<string | null>(null)
  const [tab, setTab] = useState<AddLayerTab>('arcgis')
  /** 'home' = source-picker list (Add Source Data); 'form' = selected source form. */
  const [addView, setAddView] = useState<'home' | 'form'>('home')
  const [serviceUrl, setServiceUrl] = useState('')
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? getArcgisPortalToken() : ''))
  const [layerName, setLayerName] = useState('')
  const [dbPlatform, setDbPlatform] = useState<(typeof DB_PLATFORM_OPTIONS)[number]>('SQL Server')
  const [dbInstance, setDbInstance] = useState('')
  const [dbAuthType, setDbAuthType] = useState<'database' | 'operatingSystem'>('database')
  const [dbUser, setDbUser] = useState('')
  const [dbPassword, setDbPassword] = useState('')
  const [dbSaveCredentials, setDbSaveCredentials] = useState(true)
  const [dbDatabase, setDbDatabase] = useState('')
  const [dbConnectionFileName, setDbConnectionFileName] = useState('')
  const [dbVersion, setDbVersion] = useState('')
  const [dbRole, setDbRole] = useState('')
  const [dbAuthDatabase, setDbAuthDatabase] = useState('')
  const [dbAdditionalProperties, setDbAdditionalProperties] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [dbConnectionStatus, setDbConnectionStatus] = useState<string | null>(null)
  const [dbSaving, setDbSaving] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoveredLayers, setDiscoveredLayers] = useState<Array<{ id: number; name: string; kind: 'layer' | 'table'; url: string; geometryType?: string }>>([])
  const [selectedDiscoveredUrl, setSelectedDiscoveredUrl] = useState<string>('')
  const [addingLayerKey, setAddingLayerKey] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [remoteDataUrl, setRemoteDataUrl] = useState('')
  const [syncingLayerKey, setSyncingLayerKey] = useState<string | null>(null)
  const [openLayerMenuId, setOpenLayerMenuId] = useState<string | null>(null)
  const [layerMenuPos, setLayerMenuPos] = useState<null | { top: number; left: number; maxHeight: number }>(null)
  const layerMenuAnchorRef = useRef<HTMLButtonElement | null>(null)
  const [layerDialog, setLayerDialog] = useState<GisLayerDialogState>(null)
  const layerDialogRef = useRef<GisLayerDialogState>(null)
  const [tableDockHeight, setTableDockHeight] = useState(320)
  const [tableDockCollapsed, setTableDockCollapsed] = useState(false)
  const [tableDockMinimized, setTableDockMinimized] = useState(false)
  /** Expanded by default so table tools match an “on” toolbar (user can collapse). */
  const [tableToolsCollapsed, setTableToolsCollapsed] = useState(false)
  const [tablesAddMenuOpen, setTablesAddMenuOpen] = useState(false)
  const tablesAddMenuRef = useRef<HTMLDivElement | null>(null)
  const quickSearchRef = useRef<HTMLDivElement | null>(null)
  const mapCanvasSectionRef = useRef<HTMLElement | null>(null)
  const geoExplorerQuickToolBtnRef = useRef<HTMLButtonElement | null>(null)
  const geoExplorerMapToolbarChatRef = useRef<HTMLButtonElement | null>(null)
  const geoExplorerPopoverRef = useRef<HTMLDivElement | null>(null)
  const geoExplorerMessagesRef = useRef<HTMLDivElement | null>(null)
  const geoExplorerLoadOlderRef = useRef<{ top: number; height: number } | null>(null)
  const applyGeoAiMapFirstSyncRef = useRef<(selections: GeoAiMapFirstSelection[]) => void>(() => {})
  const geoExplorerAnchorSourceRef = useRef<'quick' | 'toolbar'>('quick')
  const [geoExplorerPopoverLayout, setGeoExplorerPopoverLayout] = useState<null | { top: number; left: number; width: number; maxHeight: number }>(
    null,
  )
  const [layersEmptyAddMenuOpen, setLayersEmptyAddMenuOpen] = useState(false)
  const layersEmptyAddMenuRef = useRef<HTMLDivElement | null>(null)
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  /** Coded domains / subtype fields: always show descriptions in the attribute table. */
  const tableDomainDisplayMode: TableDomainDisplayMode = 'description'
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [tableSearchMode, setTableSearchMode] = useState<TableSearchMode>('description')
  const [tableFilterField, setTableFilterField] = useState('')
  const [tableFilterOperator, setTableFilterOperator] = useState<TableFilterOperator>('contains')
  const [tableFilterValue, setTableFilterValue] = useState('')
  const [fieldOrderByLayerId, setFieldOrderByLayerId] = useState<Record<string, string[]>>(() => ({}))
  const [draggingTableField, setDraggingTableField] = useState<string | null>(null)
  const [selectedFeatureKeys, setSelectedFeatureKeys] = useState<Set<string>>(() => new Set())
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const [gisBookmarks, setGisBookmarks] = useState<GisMapBookmark[]>(() => loadGisMapBookmarks())
  const [featureDialog, setFeatureDialog] = useState<null | { layerId: string; featureKey: string; feature: any; layerName: string }>(null)
  const [drawingSelected, setDrawingSelected] = useState<any | null>(null)
  const [drawingCount, setDrawingCount] = useState(0)
  const [drawingColor, setDrawingColor] = useState('#10b981')
  const [drawingActiveTool, setDrawingActiveTool] = useState<string | null>(null)
  const [drawingEditorOpen, setDrawingEditorOpen] = useState(false)
  const [drawingIsEditing, setDrawingIsEditing] = useState(false)
  const [drawingDirty, setDrawingDirty] = useState(false)
  const drawingSnapshotRef = useRef<any[] | null>(null)
  const [drawingConfirm, setDrawingConfirm] = useState<null | { kind: 'save' | 'discard' | 'deleteAll' }>(null)
  const [editSettingsCollapsed, setEditSettingsCollapsed] = useState(false)
  const [editSnappingLayersOpen, setEditSnappingLayersOpen] = useState(false)
  const [editGridOptionsOpen, setEditGridOptionsOpen] = useState(false)
  const [editSnappingLayerIds, setEditSnappingLayerIds] = useState<Set<string>>(() => new Set())
  const [editGridSize, setEditGridSize] = useState('10')
  const [editGridUnit, setEditGridUnit] = useState('m')
  const [symbologyDialog, setSymbologyDialog] = useState<
    | null
    | {
        layerId: string
        draft: Required<SymbologyConfig>
        original?: SymbologyConfig
        originalAppearance: GisSymbologyAppearance
        draftAppearance: GisSymbologyAppearance
      }
  >(null)
  const [symbologyStudioSections, setSymbologyStudioSections] = useState(() => {
    const p = loadGisStudioPrefs()
    return {
      visualization: p.visualization !== false,
      studio: p.studio !== false,
      legend: p.legend !== false,
    }
  })
  const [symbologyFillPreviewMode, setSymbologyFillPreviewMode] = useState<'solid' | 'hatch' | 'gradient'>('solid')
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mapboxGlobeRef = useRef<any>(null)
  const globeViewStateLiveRef = useRef(globeViewState)
  globeViewStateLiveRef.current = globeViewState
  const getGlobeMapInstance = useCallback(
    () => mapboxGlobeRef.current?.getMap?.() ?? mapboxGlobeRef.current,
    [],
  )
  const globeMapMouse = useAgroCloudMapboxMouseHost({
    setViewState: setGlobeViewState,
    getViewState: () => globeViewStateLiveRef.current,
    getMapInstance: getGlobeMapInstance,
  })
  const tableDockBeforeEditRef = useRef<null | { collapsed: boolean; minimized: boolean; height: number }>(null)
  const pendingTableSelectionRef = useRef<null | { layerId: string; keys: Set<string>; zoom?: boolean }>(null)
  const projectionToastTimerRef = useRef<number | null>(null)
  const tableScrollRootRef = useRef<HTMLDivElement | null>(null)
  const featureKeyCacheRef = useRef<WeakMap<any, string>>(new WeakMap())
  const featureByKeyByLayerRef = useRef<Map<string, Map<string, any>>>(new Map())
  const [hiddenTableFieldsByLayerId, setHiddenTableFieldsByLayerId] = useState<Record<string, Set<string>>>(() => ({}))
  const popupRef = useRef<HTMLDivElement | null>(null)
  const popupCloseTimerRef = useRef<number | null>(null)
  const popupLastFocusRef = useRef<HTMLElement | null>(null)
  const [mapPopup, setMapPopup] = useState<
    | null
    | {
        layerId: string
        layerName: string
        featureKey: string
        feature: any
        latlng: { lat: number; lng: number }
        phase: 'open' | 'closing'
        /** Map-first search / Geo AI: show subtype + coded domains, fewer fields. */
        compactSummary?: boolean
      }
  >(null)
  const [mapPopupPos, setMapPopupPos] = useState<null | { left: number; top: number; placement: 'top' | 'bottom'; arrowLeft: number }>(null)

  const openBrowseLayersPane = useCallback(() => {
    setLayersEmptyAddMenuOpen(false)
    setTablesAddMenuOpen(false)
    setActiveMapTool(null)
    setAgolContentColumnOpen(true)
    setLayersPaneView('browse')
    setPortalBrowseStatus(null)
  }, [])

  const openAddLayerModal = useCallback((initialTab?: AddLayerTab) => {
    dragDepthRef.current = 0
    setIsDragOver(false)
    setUploadFile(null)
    setRemoteDataUrl('')
    setTab(initialTab ?? 'giscontent')
    setAddView(initialTab ? 'form' : 'home')
    setServiceUrl('')
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    setLayerName('')
    setDiscoverError(null)
    setIsDiscovering(false)
    setAddingLayerKey(null)
    setIsAddOpen(true)
  }, [])

  const closeAddLayerModal = useCallback(() => {
    dragDepthRef.current = 0
    setIsDragOver(false)
    setIsAddOpen(false)
    setDiscoverError(null)
    setIsDiscovering(false)
    setAddingLayerKey(null)
    setUploadFile(null)
    setRemoteDataUrl('')
  }, [])

  useEffect(() => {
    if (!tablesAddMenuOpen && !layersEmptyAddMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (tablesAddMenuOpen && tablesAddMenuRef.current && !tablesAddMenuRef.current.contains(t)) setTablesAddMenuOpen(false)
      if (layersEmptyAddMenuOpen && layersEmptyAddMenuRef.current && !layersEmptyAddMenuRef.current.contains(t))
        setLayersEmptyAddMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTablesAddMenuOpen(false)
        setLayersEmptyAddMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [tablesAddMenuOpen, layersEmptyAddMenuOpen])

  useEffect(() => {
    if (activeMapTool !== 'table') setTablesAddMenuOpen(false)
    if (activeMapTool !== null) setLayersEmptyAddMenuOpen(false)
  }, [activeMapTool])

  useEffect(() => {
    if (!quickSearchOpen) return
    const onDocMouseDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      if (quickSearchRef.current?.contains(target)) return
      setQuickSearchOpen(false)
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setQuickSearchOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [quickSearchOpen])

  const repositionGeoExplorerPopover = useCallback(() => {
    if (activeMapTool !== 'geoExplorer') {
      setGeoExplorerPopoverLayout(null)
      return
    }
    const canvas = mapCanvasSectionRef.current
    let btn: HTMLButtonElement | null =
      geoExplorerAnchorSourceRef.current === 'toolbar' ? geoExplorerMapToolbarChatRef.current : geoExplorerQuickToolBtnRef.current
    if (!btn) btn = geoExplorerQuickToolBtnRef.current
    if (!canvas || !btn) {
      setGeoExplorerPopoverLayout(null)
      return
    }
    const c = canvas.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    const margin = 12
    const gap = 10
    const maxW = 400
    const width = Math.min(maxW, Math.max(280, c.width - margin * 2))
    const rtl =
      typeof document !== 'undefined' &&
      (document.documentElement.getAttribute('dir') === 'rtl' || document.body.getAttribute('dir') === 'rtl')
    let left = rtl ? b.left - c.left - gap - width : b.right - c.left + gap
    left = Math.min(Math.max(left, margin), c.width - width - margin)

    const gapY = 10
    let top = b.bottom - c.top + gapY
    let maxHeight = c.height - top - margin
    if (maxHeight < 240) {
      const aboveTop = b.top - c.top - gapY
      const heightAbove = aboveTop - margin
      if (heightAbove > maxHeight) {
        top = margin
        maxHeight = Math.max(200, b.top - c.top - gapY - margin)
      } else {
        top = Math.max(margin, Math.min(top, c.height - margin - 280))
        maxHeight = c.height - top - margin
      }
    }
    maxHeight = Math.max(200, Math.min(640, maxHeight))
    setGeoExplorerPopoverLayout({ top, left, width, maxHeight })
  }, [activeMapTool])

  useLayoutEffect(() => {
    if (activeMapTool !== 'geoExplorer') {
      setGeoExplorerPopoverLayout(null)
      return
    }
    let raf = 0
    raf = requestAnimationFrame(() => repositionGeoExplorerPopover())
    const canvas = mapCanvasSectionRef.current
    const ro = canvas ? new ResizeObserver(() => repositionGeoExplorerPopover()) : null
    if (canvas && ro) ro.observe(canvas)
    const onWin = () => repositionGeoExplorerPopover()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [activeMapTool, repositionGeoExplorerPopover, geoExplorerMessages.length, geoExplorerBusy])

  useEffect(() => {
    if (activeMapTool !== 'geoExplorer') return
    const onDocMouseDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      if (geoExplorerPopoverRef.current?.contains(target)) return
      if (geoExplorerQuickToolBtnRef.current?.contains(target)) return
      if (geoExplorerMapToolbarChatRef.current?.contains(target)) return
      setActiveMapTool(null)
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setActiveMapTool(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [activeMapTool])

  useEffect(() => {
    try {
      window.localStorage.setItem(GIS_AGOL_RAIL_COMPACT_LS_KEY, agolRailCompact ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [agolRailCompact])

  useEffect(() => {
    persistGisMapChartPanelConfig(gisChartPanelConfig)
  }, [gisChartPanelConfig])

  const orderedLayers = useMemo(() => [...layers].reverse(), [layers])

  const chartPanelLayerRows = useMemo(() => {
    const rows = orderedLayers.map(layer => ({
      layer,
      count: gisLayerFeatureCountForChart(layer),
      color: layer.color || '#047857',
    }))
    const { sort } = gisChartPanelConfig
    const copy = [...rows]
    if (sort === 'name')
      copy.sort((a, b) => a.layer.name.localeCompare(b.layer.name, undefined, { sensitivity: 'base' }))
    else if (sort === 'countDesc')
      copy.sort((a, b) => b.count - a.count || a.layer.name.localeCompare(b.layer.name, undefined, { sensitivity: 'base' }))
    else copy.sort((a, b) => a.count - b.count || a.layer.name.localeCompare(b.layer.name, undefined, { sensitivity: 'base' }))
    return copy
  }, [orderedLayers, gisChartPanelConfig.sort])

  const tableCapableLayers = useMemo(
    () =>
      orderedLayers.filter(l => {
        if (l.type === 'tile' && (l.data as any)?.esriImageServer) return false
        return Array.isArray((l.data as any)?.features)
      }),
    [orderedLayers],
  )

  useEffect(() => {
    persistGisMapBookmarks(gisBookmarks)
  }, [gisBookmarks])

  const globeMapStyle = useMemo(() => {
    const cat = buildBasemapCatalog('')
    const activeId = pickDefaultBasemapId(selectedBasemap)
    const entry =
      catalogEntryById(cat, activeId) ?? catalogEntryById(cat, DEFAULT_BASEMAP_ID)
    if (!entry) return OSM_GLOBE_STYLE
    return mapboxGlStyleForEntry(entry, '')
  }, [selectedBasemap])

  useEffect(() => {
    try {
      window.localStorage.setItem(GIS_BASEMAP_STORAGE_KEY, resolveBasemapId(selectedBasemap))
    } catch {}
  }, [selectedBasemap])

  useEffect(() => {
    setSelectedBasemap(prev => {
      const cat = buildBasemapCatalog('')
      const r = pickDefaultBasemapId(prev) as BasemapType
      return catalogEntryById(cat, r) ? r : (DEFAULT_BASEMAP_ID as BasemapType)
    })
  }, [])

  const globeBasemapId = pickDefaultBasemapId(selectedBasemap)
  const globeBasemapSwapRef = useRef(globeBasemapId)

  /** Globe overlay layers: wait until style is ready after first mount or projection switch. */
  useLayoutEffect(() => {
    if (mapProjectionMode !== 'globe') return
    setGlobeLoaded(false)
  }, [mapProjectionMode])

  /** Swap raster style in-place — avoids remounting WebGL context (prevents flash / black globe). */
  useEffect(() => {
    if (mapProjectionMode !== 'globe') {
      globeBasemapSwapRef.current = globeBasemapId
      return
    }
    const map = mapboxGlobeRef.current?.getMap ? mapboxGlobeRef.current.getMap() : mapboxGlobeRef.current
    if (!map || globeBasemapSwapRef.current === globeBasemapId) return
    globeBasemapSwapRef.current = globeBasemapId
    gisBasemapRasterFallbackRef.current = false
    setGlobeLoaded(false)
    // Preserve the exact camera (center/zoom/bearing/pitch) across the basemap
    // swap so the viewport never resets or re-zooms when the base layer changes.
    let preservedCamera: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null
    try {
      const c = map.getCenter?.()
      if (c) {
        preservedCamera = {
          center: [c.lng, c.lat],
          zoom: map.getZoom?.() ?? globeViewStateLiveRef.current.zoom,
          bearing: map.getBearing?.() ?? 0,
          pitch: map.getPitch?.() ?? globeViewStateLiveRef.current.pitch ?? 0,
        }
      }
    } catch {
      preservedCamera = null
    }
    const restoreCamera = () => {
      if (!preservedCamera) return
      try {
        map.jumpTo?.(preservedCamera)
      } catch {
        /* ignore */
      }
    }
    const finish = () => {
      setGlobeLoaded(true)
      try {
        map.setProjection({ name: 'globe' })
        restoreCamera()
        const livePitch = preservedCamera?.pitch ?? (typeof map.getPitch === 'function' ? map.getPitch() : globeViewStateLiveRef.current.pitch ?? 0)
        warmAgroCloudTerrainDemSource(map)
        syncAgroCloudTerrain3d(map, globeBasemapId, livePitch)
        ensureAgroCloudMapScrollZoom(map)
        if (is3dTopographicBasemapId(globeBasemapId)) {
          // Keep center/zoom but apply the 3D tilt for topographic basemaps.
          map.easeTo({ center: preservedCamera?.center, zoom: preservedCamera?.zoom, pitch: Math.max(livePitch, 55), duration: 0 })
        }
      } catch {
        /* ignore */
      }
    }
    try {
      map.setStyle(globeMapStyle as any)
      restoreCamera()
      if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) finish()
      else map.once('style.load', finish)
    } catch {
      finish()
    }
    return () => {
      try {
        map.off('style.load', finish)
      } catch {
        /* ignore */
      }
    }
  }, [mapProjectionMode, globeBasemapId, globeMapStyle])

  useEffect(() => {
    if (mapProjectionMode !== 'globe' || !globeLoaded) return
    syncAgroCloudTerrain3d(getGlobeMapInstance(), globeBasemapId, globeViewState.pitch)
  }, [mapProjectionMode, globeLoaded, globeBasemapId, globeViewState.pitch, getGlobeMapInstance])

  useEffect(() => {
    if (mapProjectionMode !== 'globe') return
    return bindAgroCloudMapWheelZoomPassthrough(mapCanvasSectionRef.current, getGlobeMapInstance)
  }, [mapProjectionMode, globeLoaded, getGlobeMapInstance])

  const geoJsonIndexSignature = useMemo(() => {
    const ids: string[] = []
    for (const layer of layers) {
      if (layer.type !== 'geojson' || !layer.data || typeof layer.data !== 'object') continue
      const obj = layer.data as object
      let id = geoJsonDataIdByObjectRef.current.get(obj)
      if (!id) {
        id = geoJsonDataIdSeqRef.current
        geoJsonDataIdSeqRef.current += 1
        geoJsonDataIdByObjectRef.current.set(obj, id)
      }
      ids.push(`${String(layer.id)}:${id}`)
    }
    return ids.join('|')
  }, [layers])
  const symbologySignature = useMemo(() => {
    const parts: string[] = []
    for (const layer of layers) {
      if (layer.type !== 'geojson' || !layer.data || typeof layer.data !== 'object') continue
      const obj = layer.data as object
      let dataId = geoJsonDataIdByObjectRef.current.get(obj)
      if (!dataId) {
        dataId = geoJsonDataIdSeqRef.current
        geoJsonDataIdSeqRef.current += 1
        geoJsonDataIdByObjectRef.current.set(obj, dataId)
      }
      const s = layer.symbology ? JSON.stringify(layer.symbology) : ''
      const arcT = (layer as LayerData)?.arcgisRenderer && typeof (layer as any).arcgisRenderer?.type === 'string' ? String((layer as any).arcgisRenderer.type) : ''
      parts.push(
        [
          String(layer.id),
          String(dataId),
          layer.color ?? '',
          layer.fillColor ?? '',
          String(layer.weight ?? ''),
          String(layer.opacity ?? ''),
          String(layer.polygonFillAlpha ?? ''),
          String(layer.pointRadius ?? ''),
          String((layer as any).strokeStyle ?? ''),
          String((layer as any).fillStyle ?? ''),
          String(layer.blendMode ?? ''),
          s,
          arcT,
        ].join('~'),
      )
    }
    return parts.join('|')
  }, [layers])
  const initialZoom = useMemo(() => {
    const targetScaleDenominator = 100_000_000
    const latitude = 20
    const dpi = 96
    const inchesPerMeter = 39.37
    const baseResolution = 156543.03392804097
    const metersPerPixel = targetScaleDenominator / (dpi * inchesPerMeter)
    const z = Math.log2((baseResolution * Math.cos((latitude * Math.PI) / 180)) / metersPerPixel)
    return Math.max(0, Math.min(22, Math.round(z * 10) / 10))
  }, [])

  const stripLegacyLayerProps = useCallback((layer: any): LayerData => {
    const { autoRefresh, refreshInterval, fieldsLinked, labelField, relationshipFieldsLinked, relationshipIdField, ...rest } = layer || {}
    return rest as LayerData
  }, [])

  const normalizeLoadedLayers = useCallback(
    (raw: unknown): LayerData[] => (Array.isArray(raw) ? raw.map(stripLegacyLayerProps) : []),
    [stripLegacyLayerProps],
  )

  const gisContentPortalPickRows = useMemo(
    () => listGisContentPortalSavedLayers(gisContentPortal.rows),
    [gisContentPortal.rows, gisContentPortal.version],
  )

  useEffect(() => {
    if (!isAddOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAddLayerModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAddOpen, closeAddLayerModal])

  useEffect(() => {
    loadLayersFromDB().then((savedLayers) => {
      const normalized = normalizeLoadedLayers(savedLayers)
      if (normalized.length > 0) setLayers(normalized)
      setLayersLoaded(true)
    })
  }, [normalizeLoadedLayers])

  useEffect(() => {
    if (!layersLoaded) return

    if (persistLayersJobRef.current) {
      const job = persistLayersJobRef.current
      persistLayersJobRef.current = null
      if (job.kind === 'idle') {
        ;(window as any).cancelIdleCallback?.(job.id)
      } else {
        clearTimeout(job.id)
      }
    }

    const run = () => {
      persistLayersJobRef.current = null
      saveLayersToDB(layers.map(stripLegacyLayerProps))
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(run, { timeout: 2000 })
      persistLayersJobRef.current = { kind: 'idle', id }
      return () => {
        ;(window as any).cancelIdleCallback?.(id)
      }
    }

    const id = setTimeout(run, 1200)
    persistLayersJobRef.current = { kind: 'timeout', id }
    return () => {
      clearTimeout(id)
    }
  }, [layers, layersLoaded, stripLegacyLayerProps])

  useEffect(() => {
    layerDialogRef.current = layerDialog
  }, [layerDialog])

  useEffect(() => {
    if (!openLayerMenuId && !layerDialog) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpenLayerMenuId(null)
        setLayerDialog(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openLayerMenuId, layerDialog])

  useEffect(() => {
    if (!openLayerMenuId) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) {
        setOpenLayerMenuId(null)
        return
      }
      const hitRoot = target.closest('[data-layer-menu-root]')
      if (hitRoot?.getAttribute('data-layer-menu-root') === openLayerMenuId) return
      if (target.closest('[data-gis-layer-menu-floating="1"]')) return
      setOpenLayerMenuId(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [openLayerMenuId])

  useEffect(() => {
    if (openLayerMenuId) return
    setLayerMenuPos(null)
    layerMenuAnchorRef.current = null
  }, [openLayerMenuId])

  const repositionLayerMenu = useCallback(() => {
    if (!openLayerMenuId) return
    const btn = layerMenuAnchorRef.current
    if (!(btn instanceof HTMLElement)) return
    setLayerMenuPos(computeLayerMenuPositionFromAnchor(btn))
  }, [openLayerMenuId])

  useLayoutEffect(() => {
    repositionLayerMenu()
  }, [repositionLayerMenu])

  useEffect(() => {
    if (!openLayerMenuId) return
    const onScrollOrResize = () => repositionLayerMenu()
    window.addEventListener('resize', onScrollOrResize)
    document.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      document.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [openLayerMenuId, repositionLayerMenu])

  useEffect(() => {
    if (layerDialog?.mode !== 'table') return
    const pending = pendingTableSelectionRef.current
    if (pending && String(pending.layerId) === String(layerDialog.layerId)) {
      pendingTableSelectionRef.current = null
      setSelectedFeatureKeys(new Set(pending.keys))
      setShowSelectedOnly(false)
      setTableDockCollapsed(false)
      setTableDockMinimized(false)
      return
    }
    setSelectedFeatureKeys(new Set())
    setShowSelectedOnly(false)
    setTableDockCollapsed(false)
  }, [layerDialog?.mode, layerDialog?.layerId])

  useEffect(() => {
    if (layerDialog?.mode === 'table') {
      setTableToolsCollapsed(false)
    }
  }, [layerDialog?.mode, layerDialog?.layerId])

  useEffect(() => {
    if (!featureDialog) {
      setEditSnappingLayersOpen(false)
      setEditGridOptionsOpen(false)
      return
    }
    setEditSnappingLayerIds(prev => (prev.size ? prev : new Set(layers.map(l => String(l.id)))))
  }, [featureDialog, layers])

  useEffect(() => {
    const syncTableDockToEdit = () => {
      if (!featureDialog) {
        if (tableDockBeforeEditRef.current) {
          const prev = tableDockBeforeEditRef.current
          tableDockBeforeEditRef.current = null
          setTableDockHeight(prev.height)
          setTableDockCollapsed(prev.collapsed)
          setTableDockMinimized(prev.minimized)
        }
        return
      }

      if (layerDialog?.mode !== 'table') return

      const isNarrow = window.innerWidth <= 640
      if (isNarrow) {
        if (!tableDockBeforeEditRef.current) {
          tableDockBeforeEditRef.current = { collapsed: tableDockCollapsed, minimized: tableDockMinimized, height: tableDockHeight }
        }
        setTableDockMinimized(true)
        setTableDockCollapsed(true)
        return
      }

      if (tableDockBeforeEditRef.current) {
        const prev = tableDockBeforeEditRef.current
        tableDockBeforeEditRef.current = null
        setTableDockHeight(prev.height)
        setTableDockCollapsed(prev.collapsed)
        setTableDockMinimized(prev.minimized)
      }
    }

    syncTableDockToEdit()

    if (!featureDialog) return
    window.addEventListener('resize', syncTableDockToEdit)
    return () => window.removeEventListener('resize', syncTableDockToEdit)
  }, [featureDialog, layerDialog?.mode, tableDockCollapsed, tableDockMinimized, tableDockHeight])

  const zoomToLayer = (layer: LayerData) => {
    const map = mapRef.current
    if (!map) return
    if (layer.type === 'tile' && (layer.data as any)?.esriImageServer && Array.isArray(layer.bbox) && layer.bbox.length === 4) {
      const [w, s, e, n] = layer.bbox as [number, number, number, number]
      const b = L.latLngBounds([s, w], [n, e])
      if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 16 })
      return
    }
    if (!layer.data) return
    try {
      const bounds = L.geoJSON(layer.data as any).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
    } catch {}
  }

  const toggleMapTool = (tool: NonNullable<GisMapToolPanel>) => {
    setLayersPaneView('layers')
    if (tool === 'saveOpen') {
      if (activeMapTool === 'saveOpen') {
        setActiveMapTool(null)
        return
      }
      setActiveMapTool('saveOpen')
      setAgolContentColumnOpen(false)
      return
    }
    if (activeMapTool === tool && agolContentColumnOpenRef.current) {
      setAgolContentColumnOpen(false)
      setActiveMapTool(null)
      return
    }
    setAgolContentColumnOpen(true)
    setActiveMapTool(tool)
  }

  const zoomMap = (direction: 'in' | 'out') => {
    if (mapProjectionMode === 'globe') {
      const globe = mapboxGlobeRef.current?.getMap ? mapboxGlobeRef.current.getMap() : mapboxGlobeRef.current
      if (!globe) return
      const nextZoom = direction === 'in' ? globe.getZoom() + 0.7 : globe.getZoom() - 0.7
      globe.easeTo({ zoom: nextZoom, duration: 420 })
      return
    }
    const map = mapRef.current
    if (!map) return
    if (direction === 'in') map.zoomIn(0.5)
    else map.zoomOut(0.5)
  }

  const resetMapBearingToNorth = useCallback(() => {
    if (mapProjectionMode === 'globe') {
      const globe = mapboxGlobeRef.current?.getMap ? mapboxGlobeRef.current.getMap() : mapboxGlobeRef.current
      if (!globe?.easeTo) return
      try {
        const pitch = typeof globe.getPitch === 'function' ? globe.getPitch() : 30
        globe.easeTo({ bearing: 0, pitch, duration: 650 })
      } catch {}
      return
    }
    const map = mapRef.current as L.Map & { getBearing?: () => number; setBearing?: (deg: number) => void }
    if (!map) return
    try {
      if (typeof map.getBearing === 'function' && typeof map.setBearing === 'function') map.setBearing(0)
    } catch {}
  }, [mapProjectionMode])

  const showProjectionToast = useCallback((message: string) => {
    if (projectionToastTimerRef.current) {
      window.clearTimeout(projectionToastTimerRef.current)
    }
    setProjectionToast(message)
    projectionToastTimerRef.current = window.setTimeout(() => {
      setProjectionToast('')
      projectionToastTimerRef.current = null
    }, 2200)
  }, [])

  const changeProjectionMode = useCallback((mode: MapProjectionMode) => {
    if (mode === 'globe' && mapProjectionModeRef.current !== 'globe') {
      flushSync(() => setGlobeLoaded(false))
    }
    setMapProjectionMode(prev => {
      if (prev === mode) return prev
      showProjectionToast(mode === 'globe' ? 'Interactive Mapbox 3D Globe enabled' : '2D GIS map enabled')
      if (mode === 'globe') {
        const map = mapRef.current
        try {
          const container = map?.getContainer?.()
          if (map && container?.isConnected) {
            map.flyTo([DEFAULT_GIS_CENTER.latitude, DEFAULT_GIS_CENTER.longitude], Math.min(map.getZoom(), 2.3), { duration: 0.65 })
          }
        } catch {}
        if (activeMapTool === 'measure') setActiveMapTool(null)
        setMapPopup(null)
        setMapPopupPos(null)
        measurementLayerRef.current?.clearLayers()
        setMeasurementSketch({ points: [], closed: false })
        setMeasurementElevations(null)
        setMeasurementVerticalLoading(false)
        setMeasurementVerticalError(null)
        setGlobeViewState(prevGlobe => ({
          ...prevGlobe,
          longitude: DEFAULT_GIS_CENTER.longitude,
          latitude: DEFAULT_GIS_CENTER.latitude,
          padding: GLOBE_CAMERA_PADDING,
          pitch: Math.max(prevGlobe.pitch, 30),
          zoom: Math.max(prevGlobe.zoom, 1.2),
        }))
      }
      return mode
    })
  }, [activeMapTool, showProjectionToast])

  const captureViewForBookmark = useCallback((): Omit<GisMapBookmark, 'id' | 'name'> | null => {
    if (mapProjectionMode === 'globe') {
      return {
        lat: globeViewState.latitude,
        lng: globeViewState.longitude,
        zoom: globeViewState.zoom,
        projection: 'globe',
      }
    }
    const m = mapRef.current
    if (!m) return null
    const c = m.getCenter()
    return { lat: c.lat, lng: c.lng, zoom: m.getZoom(), projection: '2d' }
  }, [mapProjectionMode, globeViewState])

  const applyBookmark = useCallback(
    (b: GisMapBookmark) => {
      if (b.projection === 'globe') {
        const applyGlobe = () =>
          setGlobeViewState(prev => ({
            ...prev,
            latitude: b.lat,
            longitude: b.lng,
            zoom: Math.max(0.5, b.zoom),
          }))
        if (mapProjectionMode !== 'globe') {
          changeProjectionMode('globe')
          window.setTimeout(applyGlobe, 140)
        } else {
          applyGlobe()
        }
        return
      }
      if (mapProjectionMode !== '2d') changeProjectionMode('2d')
      const m = mapRef.current
      if (m) {
        requestAnimationFrame(() => {
          try {
            m.flyTo([b.lat, b.lng], Math.max(b.zoom, 2), { duration: 0.75 })
          } catch {}
        })
      }
    },
    [mapProjectionMode, changeProjectionMode],
  )

  const buildCurrentWebMapSnapshot = useCallback((): GisWebMapSnapshotV1 => {
    const mapCenterZoom =
      mapProjectionMode === '2d' && mapRef.current
        ? (() => {
            const c = mapRef.current!.getCenter()
            return { lat: c.lat, lng: c.lng, zoom: mapRef.current!.getZoom() }
          })()
        : null
    return buildGisWebMapSnapshot({
      basemap: selectedBasemap,
      projection: mapProjectionMode,
      globeViewState:
        mapProjectionMode === 'globe'
          ? {
              longitude: globeViewState.longitude,
              latitude: globeViewState.latitude,
              zoom: globeViewState.zoom,
              pitch: globeViewState.pitch,
              bearing: globeViewState.bearing,
            }
          : undefined,
      mapCenterZoom,
      layers,
    })
  }, [mapProjectionMode, globeViewState, selectedBasemap, layers])

  const publishVectorGeoJsonAsHostedFeatureLayer = useCallback(
    (input: {
      title: string
      geojson: GisHostedFeatureLayerGeoJson
      sourceMethod: GisHostedFeatureLayerSourceMethod
      sourceFileName?: string
      externalServiceUrl?: string
    }) =>
      upsertGisContentPortalHostedFeatureLayer({
        title: input.title,
        geojson: input.geojson,
        sourceMethod: input.sourceMethod,
        sourceFileName: input.sourceFileName,
        externalServiceUrl: input.externalServiceUrl,
      }),
    [],
  )

  const clearMeasurement = useCallback(() => {
    measurementLayerRef.current?.clearLayers()
    setMeasurementSketch({ points: [], closed: false })
    setMeasurementElevations(null)
    setMeasurementVerticalLoading(false)
    setMeasurementVerticalError(null)
  }, [])

  const formatMeasurement = (meters: number) => {
    if (!Number.isFinite(meters) || meters <= 0) return '0 m'
    if (measurementUnit === 'meters') return `${Math.round(meters).toLocaleString()} m`
    if (measurementUnit === 'kilometers') return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`
    if (measurementUnit === 'miles') return `${(meters / 1609.344).toFixed(2)} mi`
    if (measurementUnit === 'feet') return `${Math.round(meters * 3.28084).toLocaleString()} ft`
    if (measurementUnit === 'usFeet') return `${Math.round(meters * 3.2808333333).toLocaleString()} US ft`
    if (measurementUnit === 'yards') return `${Math.round(meters * 1.09361).toLocaleString()} yd`
    if (measurementUnit === 'imperial') {
      const feet = meters * 3.28084
      if (feet >= 5280) return `${(feet / 5280).toFixed(2)} mi`
      return `${Math.round(feet).toLocaleString()} ft`
    }
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`
    return `${Math.round(meters).toLocaleString()} m`
  }

  const formatAreaM2 = (m2: number) => {
    if (!Number.isFinite(m2) || m2 <= 0) {
      return measurementUnit === 'metric' ? '0 m²' : '0 ac'
    }
    if (measurementUnit === 'metric') {
      if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`
      if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`
      return `${Math.round(m2).toLocaleString()} m²`
    }
    const acres = m2 / 4046.8564224
    if (acres >= 640) return `${(acres / 640).toFixed(3)} mi²`
    return `${acres.toFixed(2)} ac`
  }

  const measurementDisplay = useMemo(() => {
    const pts = measurementSketch.points
    const closed = measurementSketch.closed
    const method = measurementMethod
    const mode = measurementMode

    if (mode === 'vertical') {
      if (pts.length < 2) return formatMeasurement(0)
      if (measurementVerticalLoading) return '…'
      if (measurementVerticalError) return measurementVerticalError
      if (measurementElevations && Number.isFinite(measurementElevations[0]) && Number.isFinite(measurementElevations[1])) {
        const d = Math.abs(measurementElevations[1] - measurementElevations[0])
        return `${d.toFixed(1)} m Δ`
      }
      return '…'
    }

    if (mode === 'distance') {
      const m = polylineLengthWithMethod(pts, method)
      return formatMeasurement(m)
    }

    if (mode === 'direction') {
      if (pts.length < 2) return formatMeasurement(0)
      const d = segmentLengthM(pts[0], pts[1], method)
      const brg = bearingDegrees(pts[0], pts[1])
      return `${formatMeasurement(d)} · ${brg.toFixed(1)}°`
    }

    if (mode === 'offset') {
      if (pts.length < 3) return formatMeasurement(0)
      const dist = distancePointToSegmentM(pts[0], pts[1], pts[2])
      return `${formatMeasurement(dist)}`
    }

    if (mode === 'angle') {
      if (pts.length < 3) return '0°'
      const ang = angleAtVertexDegrees(pts[0], pts[1], pts[2])
      return `${ang.toFixed(1)}°`
    }

    if (mode === 'area') {
      if (!closed || pts.length < 3) return formatAreaM2(0)
      return formatAreaM2(polygonAreaM2ByMethod(pts, method))
    }

    if (mode === 'features') {
      if (!closed || pts.length < 3) return formatMeasurement(0)
      return formatMeasurement(polygonPerimeterWithMethod(pts, method))
    }

    return formatMeasurement(0)
  }, [
    measurementSketch.points,
    measurementSketch.closed,
    measurementMethod,
    measurementMode,
    measurementUnit,
    measurementElevations,
    measurementVerticalLoading,
    measurementVerticalError,
  ])

  const measurementFooterHint = useMemo(() => {
    const methodLabel = MEASUREMENT_METHODS.find(m => m.id === measurementMethod)?.label ?? 'Planar'
    switch (measurementMode) {
      case 'distance':
        return `Click on the map to add measurement points. Method: ${methodLabel}.`
      case 'area':
        return `Click vertices to draw area. Finish by double-click, right-click, or clicking near the first point. Method: ${methodLabel}.`
      case 'features':
        return `Trace a polygon. Finish by double-click, right-click, or clicking near the first point; perimeter is shown. Method: ${methodLabel}.`
      case 'vertical':
        return 'Click two locations; elevation difference uses Open‑Elevation (online).'
      case 'direction':
        return `Click two points for segment length and azimuth (clockwise from north). Method: ${methodLabel}.`
      case 'offset':
        return 'Click line endpoints A → B, then a third point C for perpendicular distance from C to line AB.'
      case 'angle':
        return 'Click three points A → B → C; angle at B is measured.'
      default:
        return `Method: ${methodLabel}.`
    }
  }, [measurementMode, measurementMethod])

  const handleMapSearch = async () => {
    const query = mapSearchQuery.trim()
    if (!query) return
    const map = mapProjectionMode === '2d' ? mapRef.current : null
    const globe = mapProjectionMode === 'globe'
      ? (mapboxGlobeRef.current?.getMap ? mapboxGlobeRef.current.getMap() : mapboxGlobeRef.current)
      : null
    if (!map && !globe) return
    setMapSearchStatus('Searching...')
    const coordinateMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (coordinateMatch) {
      const lat = Number(coordinateMatch[1])
      const lng = Number(coordinateMatch[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (globe) flyGisMapToLngLat(lng, lat, 12)
        else map?.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 2.2 })
        setMapSearchStatus('Location found')
        return
      }
    }

    const layerHit = findLngLatFromLayerQuery(query, gisLayerDataToGeoAiLayers(layers))
    if (layerHit && layerHit.score >= GEO_EXPLORER_MIN_LAYER_PIN_SCORE && map && !globe) {
      const resolved = findGisMapFeatureByLayerHit(layers, layerHit)
      if (resolved?.feature) {
        const layerRow = resolved.layer
        const features = Array.isArray((layerRow.data as { features?: unknown[] })?.features)
          ? ((layerRow.data as { features: any[] }).features as any[])
          : []
        const idx = Math.max(0, features.indexOf(resolved.feature))
        const key = String(getFeatureKey(resolved.feature, idx))
        zoomToFeatures([resolved.feature])
        setSelectedFeatureKeys(new Set([key]))
        showFeatureSelectionOnMap(String(layerRow.id), key, { zoom: false })
        setLayerDialog(null)
        const cen = geoAiFeatureCentroid(resolved.feature as { geometry?: unknown })
        const latlng =
          cen && Number.isFinite(cen[1]) && Number.isFinite(cen[0])
            ? { lat: cen[1], lng: cen[0] }
            : { lat: map.getCenter().lat, lng: map.getCenter().lng }
        openMapPopup({ layer: layerRow, feature: resolved.feature, latlng, compactSummary: true })
        setMapSearchStatus(`Layer match · ${layerRow.name}`)
        return
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const first = Array.isArray(data) ? data[0] : null
      const lat = Number(first?.lat)
      const lon = Number(first?.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setMapSearchStatus('No result found')
        return
      }
      if (globe) flyGisMapToLngLat(lon, lat, 12)
      else map?.flyTo([lat, lon], Math.max(map?.getZoom() ?? 0, 13), { duration: 2.2 })
      setMapSearchStatus(first?.display_name ? String(first.display_name) : 'Location found')
    } catch {
      setMapSearchStatus('Search is unavailable. Try coordinates like 25.2, 55.3')
    }
  }

  const visibleGeoExplorerMessages = useMemo(
    () => geoExplorerMessages.slice(Math.max(0, geoExplorerMessages.length - geoExplorerVisibleCount)),
    [geoExplorerMessages, geoExplorerVisibleCount],
  )
  const geoExplorerHasOlderMessages = geoExplorerMessages.length > geoExplorerVisibleCount
  const geoAiSuggestContext = useMemo(() => {
    const layerNames = layers.map(l => l.name).filter(Boolean)
    const fieldSet = new Set<string>()
    const numericSet = new Set<string>()
    const geomOps = new Set<string>()
    for (const l of layers) {
      const d = l.data as { type?: string; features?: Array<{ properties?: Record<string, unknown>; geometry?: { type?: string } }> } | undefined
      if (d?.type !== 'FeatureCollection' || !Array.isArray(d.features)) continue
      for (const f of d.features.slice(0, 120)) {
        const p = f.properties
        if (p && typeof p === 'object') {
          for (const [k, v] of Object.entries(p)) {
            fieldSet.add(k)
            if (typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v)))) numericSet.add(k)
          }
        }
        const gt = String(f.geometry?.type ?? '')
        if (gt.includes('Polygon')) {
          geomOps.add('Within')
          geomOps.add('Intersects')
          geomOps.add('Buffer')
          geomOps.add('Contains')
          geomOps.add('Clip')
        } else if (gt.includes('Line')) {
          geomOps.add('Intersects')
          geomOps.add('Buffer')
          geomOps.add('Near')
        } else if (gt.includes('Point')) {
          geomOps.add('Within')
          geomOps.add('Near')
          geomOps.add('Buffer')
        }
      }
    }
    return {
      layers: layerNames.slice(0, 20),
      fields: [...fieldSet].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      numericFields: [...numericSet].sort((a, b) => a.localeCompare(b)).slice(0, 60),
      geometryOps: [...geomOps].slice(0, 8),
    }
  }, [layers])

  const loadOlderGeoExplorerMessages = useCallback(() => {
    if (!geoExplorerHasOlderMessages) return
    const el = geoExplorerMessagesRef.current
    if (el) geoExplorerLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight }
    setGeoExplorerVisibleCount(prev => Math.min(geoExplorerMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE))
  }, [geoExplorerHasOlderMessages, geoExplorerMessages.length])

  const onGeoExplorerMessagesScroll = useCallback(() => {
    const el = geoExplorerMessagesRef.current
    if (!el || !geoExplorerHasOlderMessages) return
    if (el.scrollTop <= 24) loadOlderGeoExplorerMessages()
  }, [geoExplorerHasOlderMessages, loadOlderGeoExplorerMessages])

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current
    const restore = geoExplorerLoadOlderRef.current
    if (!el || !restore) return
    const delta = el.scrollHeight - restore.height
    el.scrollTop = restore.top + delta
    geoExplorerLoadOlderRef.current = null
  }, [geoExplorerVisibleCount])

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current
    if (!el || geoExplorerLoadOlderRef.current) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom <= 56) el.scrollTop = el.scrollHeight
  }, [geoExplorerMessages.length, geoExplorerBusy])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('geo_ai_smart_suggestions_enabled_v1', geoAiSmartSuggestionsEnabled ? '1' : '0')
  }, [geoAiSmartSuggestionsEnabled])

  const onGeoExplorerAttachChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setGeoExplorerChatError('Please attach an image file (PNG, JPEG, WebP, …).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const i = dataUrl.indexOf(',')
      const base64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl
      setGeoExplorerPendingImage({ mime: file.type || 'image/jpeg', base64 })
      setGeoExplorerChatError('')
    }
    reader.onerror = () => setGeoExplorerChatError('Could not read the image file.')
    reader.readAsDataURL(file)
  }, [])

  const clearGeoExplorerChat = useCallback(() => {
    geoExplorerInFlightRef.current = false
    setGeoExplorerBusy(false)
    setGeoExplorerMessages([])
    setGeoExplorerVisibleCount(GEO_AI_CHAT_PAGE_SIZE)
    setGeoExplorerDraft('')
    setGeoExplorerPendingImage(null)
    setGeoExplorerChatError('')
    setGeoExplorerAnchor(null)
    setMapPopup(null)
    setMapPopupPos(null)
  }, [])

  const flyGisMapToLngLat = useCallback(
    (lng: number, lat: number, zoomOpt?: number) => {
      const floorZ =
        mapProjectionMode === 'globe' ? Math.max(10, zoomOpt ?? 12) : Math.max(13, zoomOpt ?? 13)
      if (mapProjectionMode === 'globe') {
        const globe = mapboxGlobeRef.current?.getMap ? mapboxGlobeRef.current.getMap() : mapboxGlobeRef.current
        if (globe) {
          flyToLikeGoogleEarth(globe, {
            lng,
            lat,
            zoom: zoomOpt ?? 12,
            preferTilt: true,
          })
        }
        return
      }
      const map = mapRef.current
      if (map) map.flyTo([lat, lng], Math.max(map.getZoom(), floorZ), { duration: 2.2 })
    },
    [mapProjectionMode],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'g') {
        event.preventDefault()
        changeProjectionMode('globe')
      }
      if (key === 'f') {
        event.preventDefault()
        changeProjectionMode('2d')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeProjectionMode])

  useEffect(() => {
    return () => {
      if (projectionToastTimerRef.current) window.clearTimeout(projectionToastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (measurementMode !== 'vertical') {
      setMeasurementElevations(null)
      setMeasurementVerticalLoading(false)
      setMeasurementVerticalError(null)
      return
    }
    const pts = measurementSketch.points
    if (pts.length !== 2) {
      setMeasurementElevations(null)
      setMeasurementVerticalLoading(false)
      setMeasurementVerticalError(null)
      return
    }
    let cancelled = false
    setMeasurementVerticalLoading(true)
    setMeasurementVerticalError(null)
    void fetchElevationsM(pts)
      .then(arr => {
        if (cancelled) return
        if (arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1])) {
          setMeasurementElevations([arr[0], arr[1]])
          setMeasurementVerticalError(null)
        } else {
          setMeasurementElevations(null)
          setMeasurementVerticalError('Invalid elevation data')
        }
        setMeasurementVerticalLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setMeasurementElevations(null)
        setMeasurementVerticalError('Elevation service unavailable')
        setMeasurementVerticalLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [measurementMode, measurementSketch.points])

  useEffect(() => {
    if (activeMapTool !== 'measure') return
    if (mapProjectionMode !== '2d') return
    const map = mapRef.current
    if (!map) return
    if (!measurementLayerRef.current) {
      measurementLayerRef.current = L.layerGroup().addTo(map)
    } else if (!map.hasLayer(measurementLayerRef.current)) {
      measurementLayerRef.current.addTo(map)
    }

    const layer = measurementLayerRef.current
    layer.clearLayers()

    const pts = measurementSketch.points
    const closed = measurementSketch.closed
    const mode = measurementMode

    const drawDashPolyline = (arr: L.LatLng[]) => {
      if (arr.length > 1) {
        L.polyline(arr, { color: '#047857', weight: 3, dashArray: '6 6' }).addTo(layer)
      }
    }

    pts.forEach((p, idx) => {
      L.circleMarker(p, {
        radius: 5,
        color: '#047857',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.85,
      })
        .bindTooltip(String(idx + 1), { permanent: true, direction: 'top' })
        .addTo(layer)
    })

    if (mode === 'distance') drawDashPolyline(pts)
    else if (mode === 'direction' || mode === 'vertical') drawDashPolyline(pts.slice(0, 2))
    else if (mode === 'offset') {
      if (pts.length >= 2) drawDashPolyline(pts.slice(0, 2))
      if (pts.length === 3) {
        const [a, b, c] = pts
        const px = b.lng - a.lng
        const py = b.lat - a.lat
        const norm = px * px + py * py || 1
        let t = ((c.lng - a.lng) * px + (c.lat - a.lat) * py) / norm
        t = Math.max(0, Math.min(1, t))
        const footPt = L.latLng(a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng))
        L.polyline([c, footPt], { color: '#059669', weight: 2, dashArray: '4 6' }).addTo(layer)
      }
    } else if (mode === 'angle' && pts.length) {
      drawDashPolyline(pts)
    } else if (mode === 'area' || mode === 'features') {
      if (closed && pts.length >= 3) {
        L.polygon(pts, {
          color: '#047857',
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 0.22,
        }).addTo(layer)
      } else {
        drawDashPolyline(pts)
      }
    }
  }, [activeMapTool, mapProjectionMode, measurementMode, measurementSketch])

  useEffect(() => {
    if (activeMapTool !== 'measure') return
    if (mapProjectionMode !== '2d') return
    const map = mapRef.current
    if (!map) return

    const onClick = (e: L.LeafletMouseEvent) => {
      setMeasurementSketch(prev => {
        const { points, closed } = prev
        const mode = measurementMode
        if (mode === 'distance') {
          return { points: [...points, e.latlng], closed: false }
        }
        if (mode === 'direction' || mode === 'vertical') {
          if (points.length >= 2) return { points: [e.latlng], closed: false }
          return { points: [...points, e.latlng], closed: false }
        }
        if (mode === 'offset' || mode === 'angle') {
          if (points.length >= 3) return { points: [e.latlng], closed: false }
          return { points: [...points, e.latlng], closed: false }
        }
        if (mode === 'area' || mode === 'features') {
          if (closed) return { points: [e.latlng], closed: false }
          if (points.length >= 3) {
            const first = points[0]
            if (first) {
              const firstPx = map.latLngToContainerPoint(first)
              const clickPx = map.latLngToContainerPoint(e.latlng)
              const closeDistancePx = firstPx.distanceTo(clickPx)
              if (closeDistancePx <= 14) {
                return { points, closed: true }
              }
            }
          }
          return { points: [...points, e.latlng], closed: false }
        }
        return prev
      })
    }

    const onContextMenu = (e: L.LeafletMouseEvent) => {
      if (measurementMode !== 'area' && measurementMode !== 'features') return
      e.originalEvent.preventDefault()
      setMeasurementSketch(prev => {
        if (prev.points.length < 3) return prev
        return { points: prev.points, closed: true }
      })
    }

    const onDoubleClick = (e: L.LeafletMouseEvent) => {
      if (measurementMode !== 'area' && measurementMode !== 'features') return
      e.originalEvent.preventDefault()
      setMeasurementSketch(prev => {
        if (prev.points.length < 3) return prev
        return { points: prev.points, closed: true }
      })
    }

    map.getContainer().classList.add('gis-measure-cursor')
    try {
      map.doubleClickZoom.disable()
    } catch {}
    map.on('click', onClick)
    map.on('contextmenu', onContextMenu)
    map.on('dblclick', onDoubleClick)
    return () => {
      map.off('click', onClick)
      map.off('contextmenu', onContextMenu)
      map.off('dblclick', onDoubleClick)
      try {
        map.doubleClickZoom.enable()
      } catch {}
      map.getContainer().classList.remove('gis-measure-cursor')
    }
  }, [activeMapTool, mapProjectionMode, measurementMode])

  useEffect(() => {
    let cancelled = false
    let scheduled: null | { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> } = null

    const layerWork: Array<{ layerId: string; features: any[] }> = []
    for (const layer of layers) {
      if (layer.type !== 'geojson' || !layer.data) continue
      const features = Array.isArray((layer.data as any)?.features) ? ((layer.data as any).features as any[]) : []
      if (features.length) layerWork.push({ layerId: String(layer.id), features })
    }

    const nextCache = new WeakMap<any, string>()
    const nextByLayer = new Map<string, Map<string, any>>()

    let layerIdx = 0
    let featureIdx = 0
    let currentByKey: Map<string, any> | null = null
    let currentFeatures: any[] | null = null
    let currentLayerId: string | null = null

    const cancelScheduled = () => {
      if (!scheduled) return
      if (scheduled.kind === 'idle') {
        ;(window as any).cancelIdleCallback?.(scheduled.id)
      } else {
        clearTimeout(scheduled.id)
      }
      scheduled = null
    }

    const schedule = () => {
      cancelScheduled()
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        scheduled = { kind: 'idle', id: (window as any).requestIdleCallback(run, { timeout: 800 }) }
        return
      }
      scheduled = { kind: 'timeout', id: setTimeout(run, 0) }
    }

    const computeKey = (ft: any, idx: number) => computeStableGisFeatureKey(ft, idx)

    const run = (deadline?: IdleDeadline) => {
      if (cancelled) return
      const budgetMs = deadline ? Math.max(2, deadline.timeRemaining()) : 8
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now()

      while (layerIdx < layerWork.length) {
        if (!currentFeatures) {
          const next = layerWork[layerIdx]
          currentLayerId = next.layerId
          currentFeatures = next.features
          currentByKey = new Map<string, any>()
          featureIdx = 0
        }

        while (currentFeatures && featureIdx < currentFeatures.length) {
          const ft = currentFeatures[featureIdx]
          const key = computeKey(ft, featureIdx)
          if (ft && typeof ft === 'object') nextCache.set(ft, key)
          if (currentByKey && !currentByKey.has(key)) currentByKey.set(key, ft)
          featureIdx += 1

          const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
          if (now - start >= budgetMs) {
            schedule()
            return
          }
        }

        if (currentLayerId && currentByKey) nextByLayer.set(currentLayerId, currentByKey)
        currentFeatures = null
        currentByKey = null
        currentLayerId = null
        layerIdx += 1
      }

      featureKeyCacheRef.current = nextCache
      featureByKeyByLayerRef.current = nextByLayer
    }

    schedule()

    return () => {
      cancelled = true
      cancelScheduled()
    }
  }, [geoJsonIndexSignature])

  const getFeatureKey = (feature: any, idx: number) => {
    if (feature && typeof feature === 'object') {
      const cached = featureKeyCacheRef.current.get(feature)
      if (cached) return cached
    }
    const key = computeStableGisFeatureKey(feature, idx)
    if (feature && typeof feature === 'object') featureKeyCacheRef.current.set(feature, key)
    return key
  }

  const getFeatureKeyFromCache = (feature: any) => {
    if (!feature || typeof feature !== 'object') return null
    return featureKeyCacheRef.current.get(feature) ?? null
  }

  const formatPopupValue = (raw: any) => {
    if (raw === null || raw === undefined) return ''
    if (typeof raw === 'string') return raw
    if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') return String(raw)
    try {
      return JSON.stringify(raw)
    } catch {
      try {
        return String(raw)
      } catch {
        return ''
      }
    }
  }

  const buildPopupFields = (feature: any, latlng: { lat: number; lng: number } | null) => {
    const props = feature?.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, any>) : {}
    const preferred = [
      'name',
      'Name',
      'NAME',
      'title',
      'Title',
      'ADDRESS',
      'Address',
      'address',
      'street',
      'Street',
      'city',
      'City',
      'area',
      'Area',
      'phone',
      'Phone',
      'email',
      'Email',
    ]
    const seen = new Set<string>()
    const fields: Array<{ label: string; value: string }> = []

    if (latlng) {
      fields.push({ label: 'Coordinates', value: `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}` })
    }

    for (const key of preferred) {
      const raw = props[key]
      const value = formatPopupValue(raw).trim()
      if (!value) continue
      if (seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      fields.push({ label: key, value })
    }

    const remaining = Object.keys(props)
      .filter(k => k && !seen.has(k.toLowerCase()))
      .sort((a, b) => a.localeCompare(b))

    for (const key of remaining) {
      if (fields.length >= 12) break
      const value = formatPopupValue(props[key]).trim()
      if (!value) continue
      fields.push({ label: key, value })
    }

    return fields
  }

  const getPopupTitle = (feature: any) => {
    const props = feature?.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, any>) : {}
    const candidates = [
      'Farm_Name',
      'farm_name',
      'NAME',
      'Name',
      'name',
      'title',
      'Title',
      'Project_Code',
      'ProjectCode',
      'OBJECTID',
      'ObjectId',
      'objectid',
    ]
    for (const k of candidates) {
      const v = formatPopupValue(props[k]).trim()
      if (v) return v
    }
    return ''
  }

  const closeMapPopup = useCallback(() => {
    setMapPopup(prev => {
      if (!prev) return prev
      if (prev.phase === 'closing') return prev
      return { ...prev, phase: 'closing' }
    })
  }, [])

  const openMapPopup = useCallback(
    (next: { layer: LayerData; feature: any; latlng: { lat: number; lng: number }; compactSummary?: boolean }) => {
      const key = getFeatureKeyFromCache(next.feature) ?? getFeatureKey(next.feature, 0)
      if (popupCloseTimerRef.current) {
        window.clearTimeout(popupCloseTimerRef.current)
        popupCloseTimerRef.current = null
      }
      popupLastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setMapPopup({
        layerId: String(next.layer.id),
        layerName: next.layer.name,
        featureKey: String(key),
        feature: next.feature,
        latlng: next.latlng,
        phase: 'open',
        ...(next.compactSummary ? { compactSummary: true as const } : {}),
      })
    },
    [],
  )

  useEffect(() => {
    if (!mapPopup) {
      if (popupCloseTimerRef.current) {
        window.clearTimeout(popupCloseTimerRef.current)
        popupCloseTimerRef.current = null
      }
      setMapPopupPos(null)
      return
    }
    if (mapPopup.phase !== 'closing') return
    if (popupCloseTimerRef.current) window.clearTimeout(popupCloseTimerRef.current)
    popupCloseTimerRef.current = window.setTimeout(() => {
      popupCloseTimerRef.current = null
      setMapPopup(null)
      setMapPopupPos(null)
      const prev = popupLastFocusRef.current
      popupLastFocusRef.current = null
      prev?.focus?.()
    }, 170)
    return () => {
      if (popupCloseTimerRef.current) {
        window.clearTimeout(popupCloseTimerRef.current)
        popupCloseTimerRef.current = null
      }
    }
  }, [mapPopup])

  useEffect(() => {
    if (!mapPopup || mapPopup.phase === 'closing') return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      const root = popupRef.current
      if (!root) return
      if (root.contains(target)) return
      closeMapPopup()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [mapPopup, closeMapPopup])

  const updateMapPopupPos = useCallback(() => {
    const map = mapRef.current
    const popup = mapPopup
    const el = popupRef.current
    if (!map || !popup || popup.phase === 'closing') return
    const pt = map.latLngToContainerPoint(L.latLng(popup.latlng.lat, popup.latlng.lng))
    const size = map.getSize()
    const w = el ? Math.max(1, el.offsetWidth) : 340
    const h = el ? Math.max(1, el.offsetHeight) : 220
    const pad = 10
    const offset = 14

    const canPlaceTop = pt.y - h - offset >= pad
    const placement: 'top' | 'bottom' = canPlaceTop ? 'top' : 'bottom'
    const desiredLeft = pt.x - w / 2
    const desiredTop = placement === 'top' ? pt.y - h - offset : pt.y + offset

    const left = Math.max(pad, Math.min(size.x - w - pad, desiredLeft))
    const top = Math.max(pad, Math.min(size.y - h - pad, desiredTop))
    const arrowLeft = Math.max(16, Math.min(w - 16, pt.x - left))
    setMapPopupPos({ left, top, placement, arrowLeft })
  }, [mapPopup])

  useEffect(() => {
    const map = mapRef.current
    if (!mapPopup || !map || mapPopup.phase === 'closing') return
    updateMapPopupPos()
    const onMove = () => updateMapPopupPos()
    map.on('move', onMove)
    map.on('zoom', onMove)
    map.on('resize', onMove)
    window.addEventListener('resize', onMove)
    return () => {
      map.off('move', onMove)
      map.off('zoom', onMove)
      map.off('resize', onMove)
      window.removeEventListener('resize', onMove)
    }
  }, [mapPopup, updateMapPopupPos])

  useLayoutEffect(() => {
    if (!mapPopup || mapPopup.phase === 'closing') return
    updateMapPopupPos()
    const id = window.requestAnimationFrame(() => updateMapPopupPos())
    return () => window.cancelAnimationFrame(id)
  }, [mapPopup, updateMapPopupPos])

  useEffect(() => {
    if (!mapPopup || mapPopup.phase === 'closing') return
    const id = window.setTimeout(() => {
      const el = popupRef.current
      const focusTarget =
        el?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? el ?? null
      focusTarget?.focus?.()
    }, 0)
    return () => window.clearTimeout(id)
  }, [mapPopup])

  const clearSelectionOverlay = () => {
    try {
      selectionOverlayRef.current?.clearLayers()
    } catch {}
  }

  const showFeatureSelectionOnMap = (layerId: string, featureKey: string, opts?: { zoom?: boolean }) => {
    const map = mapRef.current
    const overlay = selectionOverlayRef.current
    if (!map || !overlay) return

    const feature = featureByKeyByLayerRef.current.get(String(layerId))?.get(String(featureKey))
    if (!feature) {
      clearSelectionOverlay()
      setSelectionNotice('لا يمكن العثور على العنصر المكاني المقابل لهذا الصف.')
      return
    }

    const geom = feature?.geometry
    const kind = getGeometryKind(geom?.type)
    if (kind === 'other') {
      clearSelectionOverlay()
      setSelectionNotice('الصف المحدد لا يحتوي على بيانات مكانية صالحة.')
      return
    }

    setSelectionNotice(null)
    try {
      overlay.clearLayers()
      const highlight = L.geoJSON(feature as any, {
        style: {
          color: '#00FFFF',
          weight: 4,
          opacity: 1,
          fillColor: '#00FFFF',
          fillOpacity: 0.3,
        } as any,
        pointToLayer: (_, latlng) =>
          L.marker(latlng, {
            icon: L.divIcon({
              className: 'gis-exact-point-highlight',
              html: `<div style="color: #00FFFF; font-size: 24px; text-shadow: 0 0 4px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-location-dot"></i></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 24],
            }),
          }),
      })
      overlay.addLayer(highlight)
    } catch {}

    if (opts?.zoom) {
      zoomToFeatures([feature])
    }
  }

  /** Opens the attribute table dock and selects the feature — use only from explicit UI (sidebar, popup “Open table”), not from map feature click. */
  const openAttributeTableForFeature = (layer: LayerData, feature: any) => {
    const layerId = String(layer.id)
    const key = getFeatureKeyFromCache(feature)
    if (!key) {
      setSelectionNotice('لا يمكن تحديد هذا العنصر بسبب عدم توفر مُعرّف مناسب.')
      return
    }

    setTableDockCollapsed(false)
    setTableDockMinimized(false)
    setShowSelectedOnly(false)

    const current = layerDialogRef.current
    if (current?.mode === 'table' && String(current.layerId) === layerId) {
      setSelectedFeatureKeys(new Set([key]))
    } else {
      pendingTableSelectionRef.current = { layerId, keys: new Set([key]), zoom: true }
      setLayerDialog({ mode: 'table', layerId })
      setSelectedFeatureKeys(new Set([key]))
    }

    showFeatureSelectionOnMap(layerId, key, { zoom: true })
    requestAnimationFrame(() => scrollSelectedRowIntoView(key))
  }

  const scrollSelectedRowIntoView = (featureKey: string) => {
    const root = tableScrollRootRef.current
    if (!root) return
    const esc = (v: string) => {
      const c = (window as any).CSS
      const fn = c && typeof c.escape === 'function' ? c.escape : null
      if (fn) return fn(v)
      return v.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
    }
    const row = root.querySelector(`tr[data-row-key="${esc(featureKey)}"]`)
    if (row instanceof HTMLElement) {
      try {
        row.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      } catch {}
    }
  }

  useEffect(() => {
    if (layerDialog?.mode === 'table') {
      if (selectedFeatureKeys.size !== 1) {
        clearSelectionOverlay()
        setSelectionNotice(null)
        return
      }
      const it = selectedFeatureKeys.values().next()
      const key = it.done ? null : (it.value as string)
      if (!key) return
      showFeatureSelectionOnMap(String(layerDialog.layerId), key)
      requestAnimationFrame(() => scrollSelectedRowIntoView(key))
      return
    }
    if (mapPopup && mapPopup.phase === 'open' && mapPopup.featureKey) {
      showFeatureSelectionOnMap(String(mapPopup.layerId), String(mapPopup.featureKey), { zoom: false })
      return
    }
    clearSelectionOverlay()
    setSelectionNotice(null)
  }, [layerDialog?.mode, layerDialog?.layerId, selectedFeatureKeys, mapPopup])

  const zoomToFeatures = (features: any[]) => {
    const map = mapRef.current
    if (!map) return
    if (!features.length) return
    try {
      const fc = { type: 'FeatureCollection', features }
      const bounds = L.geoJSON(fc as any).getBounds()
      if (bounds.isValid()) {
        if (typeof (map as any).flyToBounds === 'function') (map as any).flyToBounds(bounds, { padding: [24, 24], maxZoom: 16, duration: 0.75 })
        else map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
      }
    } catch {}
  }

  const runGisGeoExplorerGeminiPipeline = useCallback(
    async (args: {
      historyWithUser: GeoExplorerMessage[]
      userTextForMapFallback: string
      coordsSourceMessages: GeoExplorerMessage[]
      skipLocalStatsBecausePendingImage: boolean
      questionEditInPlace: boolean
    }) => {
      const {
        historyWithUser,
        userTextForMapFallback,
        coordsSourceMessages,
        skipLocalStatsBecausePendingImage,
        questionEditInPlace,
      } = args
      const trimmed = userTextForMapFallback.trim()
      const apiKey = geminiApiKey.trim()
      if (!apiKey) return
      try {
        if (!skipLocalStatsBecausePendingImage && trimmed) {
          const localStats = runGeoAiStatsCommand(trimmed, gisLayerDataToGeoAiLayers(layers))
          if (localStats?.handled) {
            const mid =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-s-${Date.now()}`
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }]
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table })
            const modelMsg: GeoExplorerMessage = { id: mid, role: 'model', parts }
            setGeoExplorerMessages(h => [...h, modelMsg])
            if (localStats.mapFirstSync?.selections?.length) {
              const sync = localStats.mapFirstSync.selections
              queueMicrotask(() => applyGeoAiMapFirstSyncRef.current(sync))
            }
            return
          }
        }
        let developAppend = ''
        try {
          const raw =
            typeof localStorage !== 'undefined' ? localStorage.getItem(DEVELOP_DATA_CONTEXT_LS_KEY) : null
          if (raw?.trim()) {
            developAppend = `### Develop Dashboard — Data pane snapshot (JSON)\n${raw.slice(0, 14000)}`
          }
        } catch {
          /* ignore */
        }
        const result = await runGeoExplorerGeminiTurn({
          apiKey,
          historyWithUser,
          userTextForMapFallback,
          primaryVectorLayers: gisLayerDataToGeoAiLayers(layers),
          mapboxAccessToken: mapboxAccessToken || undefined,
          openWeatherApiKey,
          pinLngLat: geoExplorerAnchor,
          lastMapQueryCoords: lastMapQueryCoordsFromMessages(coordsSourceMessages),
          inspectAnchorLngLat:
            mapPopup && mapPopup.phase === 'open'
              ? ([mapPopup.latlng.lng, mapPopup.latlng.lat] as [number, number])
              : null,
          mapPopup: null,
          addedLayersHeading: '### GIS Map — Active vector layers (this session)',
          attachGisSavedLayers: true,
          extraSystemAppend: developAppend || undefined,
          questionEditInPlace,
        })
        setGeoExplorerMessages(h => [...h, result.modelMsg])
        const me = result.mapEffect
        if (me) {
          setGeoExplorerAnchor(me.coords)
          const z = geoExplorerTargetZoomForPinSource(me.pinSource)
          flyGisMapToLngLat(me.coords[0], me.coords[1], z)
          if (
            mapProjectionMode !== 'globe' &&
            me.layerHit?.properties &&
            typeof me.layerHit.properties === 'object'
          ) {
            const hit = me.layerHit
            window.setTimeout(() => {
              const resolved = findGisMapFeatureByLayerHit(layers, hit)
              const layerRow = layers.find(l => l.name === hit.layerName && l.type === 'geojson')
              if (!layerRow) return
              const feature =
                resolved?.feature ??
                ({
                  type: 'Feature' as const,
                  properties: hit.properties,
                  geometry: { type: 'Point' as const, coordinates: [me.coords[0], me.coords[1]] as [number, number] },
                } as const)
              const features = Array.isArray((layerRow.data as { features?: unknown[] })?.features)
                ? ((layerRow.data as { features: any[] }).features as any[])
                : []
              const idx = resolved ? Math.max(0, features.indexOf(resolved.feature)) : 0
              const key = String(getFeatureKey(feature, idx))
              zoomToFeatures([feature])
              setSelectedFeatureKeys(new Set([key]))
              showFeatureSelectionOnMap(String(layerRow.id), key, { zoom: false })
              setLayerDialog(null)
              const cen = geoAiFeatureCentroid(feature as { geometry?: unknown })
              const latlng =
                cen && Number.isFinite(cen[1]) && Number.isFinite(cen[0])
                  ? { lat: cen[1], lng: cen[0] }
                  : { lat: me.coords[1], lng: me.coords[0] }
              openMapPopup({ layer: layerRow, feature, latlng, compactSummary: true })
            }, 320)
          }
        }
      } catch (e) {
        setGeoExplorerChatError(e instanceof Error ? e.message : String(e))
      } finally {
        geoExplorerInFlightRef.current = false
        setGeoExplorerBusy(false)
      }
    },
    [
      geminiApiKey,
      layers,
      mapboxAccessToken,
      flyGisMapToLngLat,
      openMapPopup,
      openWeatherApiKey,
      geoExplorerAnchor,
      mapProjectionMode,
      mapPopup,
    ],
  )

  const saveEditedGeoExplorerGeminiQuestion = useCallback(
    (messageId: string, nextText: string) => {
      const trimmed = nextText.trim()
      if (!trimmed) return
      if (geoExplorerInFlightRef.current) return
      const apiKey = geminiApiKey.trim()
      if (!apiKey) {
        setGeoExplorerChatError(
          'Add a Gemini API key: System Settings → API Tokens → Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.',
        )
        return
      }

      let snapshot: GeoExplorerMessage[] | null = null
      setGeoExplorerMessages(prev => {
        const i = prev.findIndex(m => m.id === messageId)
        if (i < 0) return prev
        const updated = replaceUserMessageText(prev[i], trimmed)
        snapshot = [...prev.slice(0, i), updated]
        return snapshot
      })

      if (!snapshot?.length) return

      setGeoExplorerChatError('')
      geoExplorerInFlightRef.current = true
      setGeoExplorerBusy(true)
      setGeoExplorerAwaitKind('edit')
      queueMicrotask(() =>
        void runGisGeoExplorerGeminiPipeline({
          historyWithUser: snapshot!,
          userTextForMapFallback: trimmed,
          coordsSourceMessages: snapshot!,
          skipLocalStatsBecausePendingImage: false,
          questionEditInPlace: true,
        }),
      )
    },
    [geminiApiKey, runGisGeoExplorerGeminiPipeline],
  )

  const sendGeoExplorerChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoExplorerDraft).trim()
    if (geoExplorerInFlightRef.current) return
    if (!trimmed && !geoExplorerPendingImage) return
    const apiKey = geminiApiKey.trim()
    if (!apiKey) {
      setGeoExplorerChatError(
        'Add a Gemini API key: System Settings → API Tokens → Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.',
      )
      return
    }

    const userParts: GeoExplorerPart[] = []
    if (trimmed) userParts.push({ type: 'text', text: trimmed })
    if (geoExplorerPendingImage) {
      userParts.push({
        type: 'image',
        mime: geoExplorerPendingImage.mime,
        base64: geoExplorerPendingImage.base64,
      })
    }
    if (userParts.length === 0) return

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-${Date.now()}`
    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: userParts }
    const userTextForMapFallback = trimmed

    const composerHadPendingImage = !!geoExplorerPendingImage
    setGeoExplorerDraft('')
    setGeoExplorerPendingImage(null)
    setGeoExplorerChatError('')
    geoExplorerInFlightRef.current = true
    setGeoExplorerBusy(true)
    setGeoExplorerAwaitKind('send')

    setGeoExplorerMessages(prev => {
      const historyWithUser = [...prev, userMsg]
      queueMicrotask(() =>
        void runGisGeoExplorerGeminiPipeline({
          historyWithUser,
          userTextForMapFallback,
          coordsSourceMessages: prev,
          skipLocalStatsBecausePendingImage: composerHadPendingImage,
          questionEditInPlace: false,
        }),
      )
      return historyWithUser
    })
  }, [geminiApiKey, geoExplorerDraft, geoExplorerPendingImage, runGisGeoExplorerGeminiPipeline])

  const applyGeoAiMapFirstSync = useCallback(
    (selections: GeoAiMapFirstSelection[]) => {
      if (!selections.length) return
      const allFeatures: any[] = []
      for (const s of selections) {
        const f = featureByKeyByLayerRef.current.get(String(s.layerId))?.get(String(s.featureKey))
        if (f) allFeatures.push(f)
      }
      if (!allFeatures.length) return
      zoomToFeatures(allFeatures)
      const overlay = selectionOverlayRef.current
      if (overlay) {
        setSelectionNotice(null)
        try {
          overlay.clearLayers()
          for (const feature of allFeatures) {
            const highlight = L.geoJSON(feature as any, {
              style: {
                color: '#00FFFF',
                weight: 4,
                opacity: 1,
                fillColor: '#00FFFF',
                fillOpacity: 0.3,
              } as any,
              pointToLayer: (_, latlng) =>
                L.marker(latlng, {
                  icon: L.divIcon({
                    className: 'gis-exact-point-highlight',
                    html: `<div style="color: #00FFFF; font-size: 24px; text-shadow: 0 0 4px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-location-dot"></i></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 24],
                  }),
                }),
            })
            overlay.addLayer(highlight)
          }
        } catch {}
      }
      setSelectedFeatureKeys(new Set(selections.map(s => String(s.featureKey))))
      setShowSelectedOnly(false)
      setLayerDialog(null)
      const primary = selections[0]!
      const layerRow = layers.find(l => String(l.id) === String(primary.layerId) && l.type === 'geojson')
      const feature = featureByKeyByLayerRef.current.get(String(primary.layerId))?.get(String(primary.featureKey))
      if (!layerRow || !feature) return
      const cen = geoAiFeatureCentroid(feature)
      const latlng =
        cen && Number.isFinite(cen[1]) && Number.isFinite(cen[0])
          ? { lat: cen[1], lng: cen[0] }
          : { lat: mapRef.current?.getCenter().lat ?? 0, lng: mapRef.current?.getCenter().lng ?? 0 }
      openMapPopup({ layer: layerRow, feature, latlng, compactSummary: true })
    },
    [layers, openMapPopup],
  )

  useEffect(() => {
    applyGeoAiMapFirstSyncRef.current = applyGeoAiMapFirstSync
  }, [applyGeoAiMapFirstSync])

  const getDrawableLayers = useCallback(() => {
    const fg = drawingFeatureGroupRef.current
    if (!fg) return [] as any[]
    try {
      return fg.getLayers().filter((l: any) => !(l && typeof l === 'object' && (l as any).__isCircleCenter))
    } catch {
      return [] as any[]
    }
  }, [])

  const snapshotDrawing = useCallback(() => {
    const fg = drawingFeatureGroupRef.current
    if (!fg) return null
    try {
      const layers = fg.getLayers().filter((l: any) => !(l && typeof l === 'object' && (l as any).__isCircleCenter))
      const snap = layers.map((layer: any) => {
        const style = layer?.options && typeof layer.options === 'object' ? { ...layer.options } : null
        if (layer instanceof (L as any).Circle) {
          return { kind: 'circle', latlng: layer.getLatLng(), radius: layer.getRadius(), style }
        }
        if (layer instanceof (L as any).Marker) {
          const latlng = layer.getLatLng()
          const tooltip = (layer as any).getTooltip?.()
          const tooltipContent = tooltip ? tooltip.getContent?.() : null
          const tooltipOpts = tooltip ? tooltip.options : null
          return { kind: 'marker', latlng, style, tooltipContent, tooltipOpts }
        }
        if (layer?.toGeoJSON) {
          return { kind: 'geojson', geojson: layer.toGeoJSON(), style }
        }
        return { kind: 'unknown' }
      })
      return snap
    } catch {
      return null
    }
  }, [])

  const zoomToDrawing = useCallback((layer?: any | null) => {
    const map = mapRef.current as any
    if (!map) return
    const target = layer ?? drawingSelected ?? null
    const tryZoom = (l: any) => {
      try {
        if (l?.getBounds) {
          const b = l.getBounds()
          if (b?.isValid?.()) {
            if (typeof map.flyToBounds === 'function') map.flyToBounds(b, { padding: [80, 80], maxZoom: 18, duration: 0.8 })
            else map.fitBounds(b, { padding: [80, 80], maxZoom: 18 })
            return true
          }
        }
      } catch {
      }
      try {
        if (l?.getLatLng) {
          const ll = l.getLatLng()
          if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
            if (typeof map.flyTo === 'function') map.flyTo(ll, Math.max(map.getZoom?.() ?? 0, 17), { duration: 0.8 })
            else map.setView(ll, Math.max(map.getZoom?.() ?? 0, 17))
            return true
          }
        }
      } catch {
      }
      return false
    }

    if (target && tryZoom(target)) return

    const layers = getDrawableLayers()
    if (!layers.length) return
    try {
      const group = L.featureGroup(layers)
      const b = group.getBounds()
      if (b?.isValid?.()) {
        if (typeof map.flyToBounds === 'function') map.flyToBounds(b, { padding: [80, 80], maxZoom: 18, duration: 0.8 })
        else map.fitBounds(b, { padding: [80, 80], maxZoom: 18 })
      }
    } catch {
    }
  }, [drawingSelected, getDrawableLayers])

  const restoreDrawing = useCallback((snap: any[] | null) => {
    const fg = drawingFeatureGroupRef.current
    const map = mapRef.current as any
    if (!fg || !snap) return
    try {
      fg.clearLayers()
    } catch {
      return
    }
    for (const item of snap) {
      try {
        if (item?.kind === 'circle' && item.latlng && typeof item.radius === 'number') {
          const circle = L.circle(item.latlng, { ...(item.style ?? {}), radius: item.radius })
          circle.on('click', () => {
            setDrawingSelected(circle)
            zoomToDrawing(circle)
          })
          fg.addLayer(circle)
          const centerMarker = L.marker(circle.getLatLng(), { interactive: true })
          ;(centerMarker as any).__isCircleCenter = true
          ;(centerMarker as any).__parentCircle = circle
          ;(circle as any).centerMarker = centerMarker
          centerMarker.on('click', () => {
            setDrawingSelected(circle)
            zoomToDrawing(circle)
          })
          fg.addLayer(centerMarker)
        } else if (item?.kind === 'marker' && item.latlng) {
          const marker = L.marker(item.latlng, { ...(item.style ?? {}), interactive: true })
          if (item.tooltipContent) {
            marker.bindTooltip(item.tooltipContent, item.tooltipOpts ?? { permanent: true, direction: 'top' })
          }
          marker.on('click', () => {
            setDrawingSelected(marker)
            zoomToDrawing(marker)
          })
          fg.addLayer(marker)
        } else if (item?.kind === 'geojson' && item.geojson) {
          const group = L.geoJSON(item.geojson as any, {
            style: () => (item.style ?? {}),
            pointToLayer: (_: any, latlng: any) => L.marker(latlng, { interactive: true }),
          })
          group.eachLayer((l: any) => {
            try {
              l.on?.('click', () => {
                setDrawingSelected(l)
                zoomToDrawing(l)
              })
            } catch {
            }
            fg.addLayer(l)
          })
        }
      } catch {
      }
    }
    try {
      const count = fg.getLayers().filter((l: any) => !(l && typeof l === 'object' && (l as any).__isCircleCenter)).length
      setDrawingCount(count)
    } catch {
    }
    try {
      if (map?.invalidateSize) map.invalidateSize()
    } catch {
    }
  }, [zoomToDrawing])

  const applyDrawingColor = useCallback((nextColor: string) => {
    const layers = getDrawableLayers()
    for (const l of layers) {
      try {
        if (l?.setStyle) {
          l.setStyle({ color: nextColor, fillColor: nextColor })
        }
      } catch {
      }
    }
    setDrawingDirty(true)
  }, [getDrawableLayers])

  const openDrawingEditor = useCallback(() => {
    if (!drawingCount) return
    drawingSnapshotRef.current = snapshotDrawing()
    setDrawingIsEditing(true)
    setDrawingDirty(false)
    setDrawingEditorOpen(true)
    setDrawingActiveTool('edit')
  }, [drawingCount, snapshotDrawing])

  const closeDrawingEditor = useCallback(() => {
    if (drawingDirty) {
      setDrawingConfirm({ kind: 'discard' })
      return
    }
    setDrawingIsEditing(false)
    setDrawingEditorOpen(false)
    setDrawingActiveTool(null)
    drawingSnapshotRef.current = null
  }, [drawingDirty])

  const goHome = () => {
    const map = mapRef.current
    if (!map) return
    try {
      map.setView([20, 0], initialZoom)
    } catch {}
  }

  const startTableResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = tableDockHeight
    const maxHeight = Math.max(220, Math.round(window.innerHeight * 0.75))

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY
      const next = Math.max(180, Math.min(maxHeight, Math.round(startHeight - delta)))
      setTableDockHeight(next)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const getGeoJsonFields = (data: any) => {
    const features = Array.isArray(data?.features) ? (data.features as any[]) : []
    const fields = new Set<string>()
    for (let i = 0; i < Math.min(features.length, 50); i += 1) {
      const props = features[i]?.properties
      if (!props || typeof props !== 'object') continue
      Object.keys(props).forEach(k => fields.add(k))
    }
    return Array.from(fields).sort((a, b) => a.localeCompare(b))
  }

  const sanitizeFileName = (name: string) => {
    const trimmed = name.trim() || 'layer'
    const cleaned = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ')
    return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned
  }

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const getNumericFields = (data: any) => {
    const features = Array.isArray(data?.features) ? (data.features as any[]) : []
    const counts = new Map<string, { numeric: number; total: number }>()
    for (let i = 0; i < Math.min(features.length, 200); i += 1) {
      const props = features[i]?.properties
      if (!props || typeof props !== 'object') continue
      Object.entries(props).forEach(([k, v]) => {
        const cur = counts.get(k) ?? { numeric: 0, total: 0 }
        cur.total += 1
        if (typeof v === 'number' && Number.isFinite(v)) cur.numeric += 1
        counts.set(k, cur)
      })
    }
    return Array.from(counts.entries())
      .filter(([, v]) => v.total > 0 && v.numeric / v.total >= 0.6)
      .map(([k]) => k)
      .sort((a, b) => a.localeCompare(b))
  }

  const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)))

  const normalizeSymbology = (layer: LayerData, cfg?: SymbologyConfig): Required<SymbologyConfig> => {
    const allFields = getGeoJsonFields(layer.data)
    const numericFields = getNumericFields(layer.data)
    const baseUseArcGisOnline = layer.source === 'arcgis'
    const style = (cfg?.style as SymbologyStyle) || 'color'
    const cfgField = typeof cfg?.field === 'string' ? cfg.field : ''
    const field =
      style === 'single'
        ? ''
        : style === 'unique'
        ? cfgField || allFields[0] || numericFields[0] || ''
        : numericFields.includes(cfgField)
          ? cfgField
          : numericFields[0] || ''
    const next: Required<SymbologyConfig> = {
      useArcGisOnline: typeof cfg?.useArcGisOnline === 'boolean' ? cfg.useArcGisOnline : baseUseArcGisOnline,
      style,
      field,
      classes: clampInt(typeof cfg?.classes === 'number' ? cfg.classes : style === 'unique' ? 12 : 5, 2, 12),
      method: (cfg?.method as SymbologyClassMethod) || 'jenks',
      colorRamp: (cfg?.colorRamp as SymbologyColorRamp) || 'viridis',
      threshold: typeof cfg?.threshold === 'number' && Number.isFinite(cfg.threshold) ? cfg.threshold : Number.NaN,
    }
    if (!baseUseArcGisOnline) next.useArcGisOnline = false
    return next
  }

  /** When using the service renderer, mirror its visualization into draft fields (used if user switches back to custom). */
  const inferVisualizationFromArcgisRenderer = (renderer: any): Partial<Required<SymbologyConfig>> => {
    const type = renderer?.type
    if (type === 'uniqueValue') {
      const f1 = typeof renderer?.field1 === 'string' ? renderer.field1 : ''
      const n = Array.isArray(renderer?.uniqueValueInfos) ? renderer.uniqueValueInfos.length : 0
      const classes = clampInt(n > 0 ? Math.min(Math.max(n, 2), 12) : 12, 2, 12)
      return { style: 'unique', field: f1, classes }
    }
    if (type === 'classBreaks') {
      const f = typeof renderer?.field === 'string' ? renderer.field : ''
      const n = Array.isArray(renderer?.classBreakInfos) ? renderer.classBreakInfos.length : 0
      const classes = clampInt(n > 0 ? Math.min(Math.max(n, 2), 12) : 5, 2, 12)
      return { style: 'color', field: f, classes }
    }
    return { style: 'color', field: '', classes: 5 }
  }

  const describeArcGisRendererVisualization = (renderer: any): string => {
    const type = renderer?.type
    if (type === 'uniqueValue') {
      const f1 = typeof renderer?.field1 === 'string' && renderer.field1 ? renderer.field1 : 'attribute'
      return `Unique symbols (${f1})`
    }
    if (type === 'classBreaks') {
      const f = typeof renderer?.field === 'string' && renderer.field ? renderer.field : 'numeric field'
      return `Class breaks (${f})`
    }
    if (type === 'simple') return 'Single symbol'
    if (type === 'heatmap') return 'Heatmap'
    if (type && typeof type === 'string') return `Renderer: ${type}`
    return 'No renderer loaded'
  }

  const hexToRgb = (hex: string) => {
    const cleaned = hex.trim().replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
    const r = parseInt(cleaned.slice(0, 2), 16)
    const g = parseInt(cleaned.slice(2, 4), 16)
    const b = parseInt(cleaned.slice(4, 6), 16)
    return { r, g, b }
  }

  const rgbToHex = (r: number, g: number, b: number) => {
    const to = (v: number) => clampInt(v, 0, 255).toString(16).padStart(2, '0')
    return `#${to(r)}${to(g)}${to(b)}`
  }

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const getRampStops = (ramp: SymbologyColorRamp) => {
    switch (ramp) {
      case 'blues':
        return ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a']
      case 'greens':
        return ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d']
      case 'plasma':
        return ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921']
      case 'magma':
        return ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf']
      case 'turbo':
        return ['#30123b', '#3b4cc0', '#26a6d1', '#3de07e', '#f9e721', '#f20c0c']
      case 'viridis':
      default:
        return ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']
    }
  }

  const sampleRamp = (ramp: SymbologyColorRamp, n: number) => {
    const count = clampInt(n, 2, 12)
    const stops = getRampStops(ramp).map(c => hexToRgb(c)).filter(Boolean) as Array<{ r: number; g: number; b: number }>
    if (stops.length < 2) return Array.from({ length: count }, () => '#22c55e')
    const out: string[] = []
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1)
      const pos = t * (stops.length - 1)
      const idx = Math.floor(pos)
      const frac = pos - idx
      const a = stops[idx]
      const b = stops[Math.min(stops.length - 1, idx + 1)]
      out.push(rgbToHex(lerp(a.r, b.r, frac), lerp(a.g, b.g, frac), lerp(a.b, b.b, frac)))
    }
    return out
  }

  const quantileAt = (sorted: number[], q: number) => {
    if (sorted.length === 0) return 0
    const pos = (sorted.length - 1) * q
    const base = Math.floor(pos)
    const rest = pos - base
    const a = sorted[base]
    const b = sorted[Math.min(sorted.length - 1, base + 1)]
    return lerp(a, b, rest)
  }

  const jenksBreaks = (data: number[], nClasses: number) => {
    const sorted = [...data].filter(v => Number.isFinite(v)).sort((a, b) => a - b)
    if (sorted.length === 0) return [0, 0]
    const k = clampInt(nClasses, 2, 12)
    const n = sorted.length
    const mat1: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0))
    const mat2: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0))
    for (let i = 1; i <= k; i += 1) {
      mat1[0][i] = 1
      mat2[0][i] = 0
      for (let j = 1; j <= n; j += 1) mat2[j][i] = Infinity
    }
    let v = 0
    for (let l = 1; l <= n; l += 1) {
      let s1 = 0
      let s2 = 0
      let w = 0
      for (let m = 1; m <= l; m += 1) {
        const i3 = l - m + 1
        const val = sorted[i3 - 1]
        s2 += val * val
        s1 += val
        w += 1
        v = s2 - (s1 * s1) / w
        const i4 = i3 - 1
        if (i4 !== 0) {
          for (let j = 2; j <= k; j += 1) {
            if (mat2[l][j] >= v + mat2[i4][j - 1]) {
              mat1[l][j] = i3
              mat2[l][j] = v + mat2[i4][j - 1]
            }
          }
        }
      }
      mat1[l][1] = 1
      mat2[l][1] = v
    }
    const breaks: number[] = Array(k + 1).fill(0)
    breaks[k] = sorted[n - 1]
    breaks[0] = sorted[0]
    let countK = k
    let kIdx = n
    while (countK > 1) {
      const id = mat1[kIdx][countK] - 1
      breaks[countK - 1] = sorted[id]
      kIdx = mat1[kIdx][countK] - 1
      countK -= 1
    }
    return breaks
  }

  const computeBreaks = (values: number[], classes: number, method: SymbologyClassMethod) => {
    const cleaned = values.filter(v => Number.isFinite(v))
    if (cleaned.length === 0) return [0, 0]
    const k = clampInt(classes, 2, 12)
    const sorted = [...cleaned].sort((a, b) => a - b)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    if (min === max) return Array.from({ length: k + 1 }, (_, i) => (i === 0 ? min : max))
    if (method === 'equal_interval') {
      const step = (max - min) / k
      return Array.from({ length: k + 1 }, (_, i) => (i === k ? max : min + step * i))
    }
    if (method === 'quantile') {
      const out: number[] = [min]
      for (let i = 1; i < k; i += 1) out.push(quantileAt(sorted, i / k))
      out.push(max)
      return out
    }
    return jenksBreaks(sorted, k)
  }

  const getClassIndex = (value: number, breaks: number[]) => {
    if (!Number.isFinite(value) || breaks.length < 2) return 0
    for (let i = 0; i < breaks.length - 1; i += 1) {
      const a = breaks[i]
      const b = breaks[i + 1]
      if (i === breaks.length - 2) return value <= b ? i : i
      if (value >= a && value < b) return i
    }
    return breaks.length - 2
  }

  const getGeometryCenter = (geom: any): [number, number] | null => {
    if (!geom || typeof geom !== 'object') return null
    const t = geom.type
    const c = geom.coordinates
    const pickMid = (coords: any[]) => {
      if (!Array.isArray(coords) || coords.length === 0) return null
      const mid = coords[Math.floor(coords.length / 2)]
      if (!Array.isArray(mid) || mid.length < 2) return null
      return [mid[0], mid[1]] as [number, number]
    }
    if (t === 'Point') return Array.isArray(c) && c.length >= 2 ? ([c[0], c[1]] as [number, number]) : null
    if (t === 'LineString') return pickMid(c)
    if (t === 'MultiLineString') return Array.isArray(c) && c.length ? pickMid(c[0]) : null
    if (t === 'Polygon') return Array.isArray(c) && c.length ? pickMid(c[0]) : null
    if (t === 'MultiPolygon') return Array.isArray(c) && c.length && c[0]?.length ? pickMid(c[0][0]) : null
    return null
  }

  const getGeometryKind = (geomType: any): 'point' | 'line' | 'polygon' | 'other' => {
    if (typeof geomType !== 'string') return 'other'
    if (geomType === 'Point' || geomType === 'MultiPoint') return 'point'
    if (geomType === 'LineString' || geomType === 'MultiLineString') return 'line'
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') return 'polygon'
    return 'other'
  }

  const getLayerGeometryKind = (data: any): 'point' | 'line' | 'polygon' | 'other' => {
    const features = Array.isArray(data?.features) ? (data.features as any[]) : []
    for (let i = 0; i < Math.min(features.length, 50); i += 1) {
      const t = features[i]?.geometry?.type
      const kind = getGeometryKind(t)
      if (kind !== 'other') return kind
    }
    return 'other'
  }

  const darkenColor = (hex: string, amount: number) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return hex
    const t = Math.max(0, Math.min(1, amount))
    return rgbToHex(rgb.r * (1 - t), rgb.g * (1 - t), rgb.b * (1 - t))
  }

  const esriColorToRgbHexAndOpacity = (c: any, layerOpacity: number) => {
    const o = typeof layerOpacity === 'number' && Number.isFinite(layerOpacity) ? Math.max(0, Math.min(1, layerOpacity)) : 1
    if (!Array.isArray(c) || c.length < 3) return { hex: '#22c55e', opacity: o }
    const r = clampInt(Number(c[0]), 0, 255)
    const g = clampInt(Number(c[1]), 0, 255)
    const b = clampInt(Number(c[2]), 0, 255)
    const a = c.length >= 4 ? clampInt(Number(c[3]), 0, 255) : 255
    return { hex: rgbToHex(r, g, b), opacity: (a / 255) * o }
  }

  const esriLineStyleToDashArray = (style: any, width: number) => {
    const w = Math.max(1, Number.isFinite(width) ? width : 2)
    switch (style) {
      case 'esriSLSDash':
        return `${w * 4} ${w * 3}`
      case 'esriSLSDashDot':
        return `${w * 4} ${w * 2} ${w} ${w * 2}`
      case 'esriSLSDashDotDot':
        return `${w * 4} ${w * 2} ${w} ${w * 2} ${w} ${w * 2}`
      case 'esriSLSDot':
        return `${w} ${w * 2.5}`
      case 'esriSLSLongDash':
        return `${w * 7} ${w * 3}`
      case 'esriSLSLongDashDot':
        return `${w * 7} ${w * 2.5} ${w} ${w * 2.5}`
      case 'esriSLSShortDash':
        return `${w * 3} ${w * 2.5}`
      case 'esriSLSShortDashDot':
        return `${w * 3} ${w * 2} ${w} ${w * 2}`
      case 'esriSLSShortDashDotDot':
        return `${w * 3} ${w * 2} ${w} ${w * 2} ${w} ${w * 2}`
      case 'esriSLSShortDot':
        return `${w} ${w * 1.6}`
      case 'esriSLSNull':
        return '0 1000'
      case 'esriSLSSolid':
      default:
        return undefined
    }
  }

  const resolveArcGisSymbolUrl = (layer: LayerData, rawUrl: string) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    if (!url) return ''
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    const normalized = url.startsWith('//') ? `${window.location.protocol}${url}` : url
    try {
      const base = typeof layer.url === 'string' && layer.url.trim() ? `${layer.url.replace(/\/+$/, '')}/` : window.location.origin
      const u = new URL(normalized, base)

      const isHttpsApp = window.location.protocol === 'https:'
      const isHttpSymbol = u.protocol === 'http:'
      const isArcGisHost = u.hostname === 'static.arcgis.com' || /(^|\.)arcgis\.com$/i.test(u.hostname) || /(^|\.)arcgisonline\.com$/i.test(u.hostname)
      if (isHttpsApp && isHttpSymbol && isArcGisHost) u.protocol = 'https:'

      const token = typeof layer.authToken === 'string' ? layer.authToken.trim() : ''
      if (token && !u.searchParams.has('token')) {
        let allowToken = isArcGisHost
        try {
          if (!allowToken && typeof layer.url === 'string' && layer.url.trim()) {
            const serviceHost = new URL(layer.url).hostname
            allowToken = serviceHost === u.hostname
          }
        } catch {}
        if (allowToken) u.searchParams.set('token', token)
      }

      return u.toString()
    } catch {
      return normalized
    }
  }

  const getArcGisRendererSymbolForFeature = (renderer: any, feature: any) => {
    const type = renderer?.type
    if (type === 'simple') return renderer?.symbol ?? null
    if (type === 'uniqueValue') {
      const f1 = typeof renderer?.field1 === 'string' ? renderer.field1 : ''
      const f2 = typeof renderer?.field2 === 'string' ? renderer.field2 : ''
      const f3 = typeof renderer?.field3 === 'string' ? renderer.field3 : ''
      const delim = typeof renderer?.fieldDelimiter === 'string' ? renderer.fieldDelimiter : ', '
      const parts = [f1, f2, f3].filter(Boolean).map(f => feature?.properties?.[f])
      const val = parts.map(v => (v === null || v === undefined ? '' : String(v))).join(delim)
      const infos = Array.isArray(renderer?.uniqueValueInfos) ? renderer.uniqueValueInfos : []
      const found = infos.find((i: any) => String(i?.value ?? '') === val)
      return found?.symbol ?? renderer?.defaultSymbol ?? null
    }
    if (type === 'classBreaks') {
      const f = typeof renderer?.field === 'string' ? renderer.field : ''
      const raw = f ? feature?.properties?.[f] : undefined
      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
      if (!Number.isFinite(v)) return renderer?.defaultSymbol ?? null
      const infos = Array.isArray(renderer?.classBreakInfos) ? [...renderer.classBreakInfos] : []
      infos.sort((a: any, b: any) => (Number(a?.classMaxValue) || 0) - (Number(b?.classMaxValue) || 0))
      const found = infos.find((i: any) => typeof i?.classMaxValue === 'number' && v <= i.classMaxValue)
      return found?.symbol ?? renderer?.defaultSymbol ?? null
    }
    if (type === 'heatmap') return null
    return renderer?.symbol ?? null
  }

  const arcGisSymbolToLeaflet = (
    symbol: any,
    geometryKind: 'point' | 'line' | 'polygon',
    layerOpacity: number,
    fallbackStroke: string,
    fallbackFill: string,
  ) => {
    const baseOpacity = typeof layerOpacity === 'number' && Number.isFinite(layerOpacity) ? Math.max(0, Math.min(1, layerOpacity)) : 1
    const mkPath = (partial: any) => ({
      color: fallbackStroke,
      weight: 2,
      opacity: baseOpacity,
      fillColor: fallbackFill,
      fillOpacity: geometryKind === 'polygon' ? 0.35 * baseOpacity : 0,
      ...partial,
    })

    if (!symbol || typeof symbol !== 'object') return { path: mkPath({}) }

    if (geometryKind === 'point') {
      const st = symbol?.type
      if (st === 'esriPMS' && typeof symbol?.imageData === 'string' && symbol.imageData) {
        const contentType = typeof symbol?.contentType === 'string' && symbol.contentType ? symbol.contentType : 'image/png'
        const dataUrl = `data:${contentType};base64,${symbol.imageData}`
        const w = Number.isFinite(symbol?.width) ? Math.max(1, symbol.width) : Number.isFinite(symbol?.size) ? symbol.size : 24
        const h = Number.isFinite(symbol?.height) ? Math.max(1, symbol.height) : Number.isFinite(symbol?.size) ? symbol.size : 24
        return {
          point: {
            kind: 'icon',
            url: dataUrl,
            size: [w, h] as [number, number],
            anchor: [w / 2, h / 2] as [number, number],
            opacity: baseOpacity,
          },
        }
      }
      if (st === 'esriPMS' && typeof symbol?.url === 'string' && symbol.url) {
        const w = Number.isFinite(symbol?.width) ? Math.max(1, symbol.width) : Number.isFinite(symbol?.size) ? symbol.size : 24
        const h = Number.isFinite(symbol?.height) ? Math.max(1, symbol.height) : Number.isFinite(symbol?.size) ? symbol.size : 24
        return {
          point: {
            kind: 'icon',
            url: symbol.url,
            size: [w, h] as [number, number],
            anchor: [w / 2, h / 2] as [number, number],
            opacity: baseOpacity,
          },
        }
      }
      if (st === 'esriSMS') {
        const fill = esriColorToRgbHexAndOpacity(symbol?.color, baseOpacity)
        const outline = symbol?.outline
        const stroke = outline?.color ? esriColorToRgbHexAndOpacity(outline.color, baseOpacity) : { hex: fallbackStroke, opacity: baseOpacity }
        const weight = Number.isFinite(outline?.width) ? Math.max(1, outline.width) : 1.5
        const size = Number.isFinite(symbol?.size) ? Math.max(2, symbol.size) : 10
        const radius = Math.max(2, Math.min(18, size / 2))
        return {
          point: {
            kind: 'circle',
            options: {
              radius,
              color: stroke.hex,
              weight,
              opacity: stroke.opacity,
              fillColor: fill.hex,
              fillOpacity: fill.opacity,
            },
          },
        }
      }
    }

    if (geometryKind === 'line') {
      const st = symbol?.type
      if (st === 'esriSLS') {
        const c = esriColorToRgbHexAndOpacity(symbol?.color, baseOpacity)
        const w = Number.isFinite(symbol?.width) ? Math.max(1, symbol.width) : 2
        const dashArray = esriLineStyleToDashArray(symbol?.style, w)
        return { path: mkPath({ color: c.hex, opacity: c.opacity, weight: w, fillOpacity: 0, dashArray }) }
      }
    }

    if (geometryKind === 'polygon') {
      const st = symbol?.type
      if (st === 'esriSFS') {
        const fill = esriColorToRgbHexAndOpacity(symbol?.color, baseOpacity)
        const outline = symbol?.outline
        const stroke = outline?.color ? esriColorToRgbHexAndOpacity(outline.color, baseOpacity) : { hex: darkenColor(fill.hex, 0.25), opacity: baseOpacity }
        const w = Number.isFinite(outline?.width) ? Math.max(1, outline.width) : 1.5
        const dashArray = esriLineStyleToDashArray(outline?.style, w)
        return { path: mkPath({ color: stroke.hex, opacity: stroke.opacity, weight: w, fillColor: fill.hex, fillOpacity: fill.opacity, dashArray }) }
      }
    }

    return { path: mkPath({}) }
  }

  const getArcGisPathStyleForFeature = (layer: LayerData, feature: any) => {
    const renderer = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
    if (!renderer) return null
    const kind = getGeometryKind(feature?.geometry?.type)
    if (kind !== 'line' && kind !== 'polygon') return null
    const symbol = getArcGisRendererSymbolForFeature(renderer, feature)
    const baseStroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseFill = layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const res = arcGisSymbolToLeaflet(symbol, kind, layer.opacity, baseStroke, baseFill)
    return res.path ?? null
  }

  const getArcGisPointLayer = (layer: LayerData, feature: any, latlng: any) => {
    const renderer = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
    if (!renderer) return null
    if (getGeometryKind(feature?.geometry?.type) !== 'point') return null
    const symbol = getArcGisRendererSymbolForFeature(renderer, feature)
    const baseStroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseFill = layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const res = arcGisSymbolToLeaflet(symbol, 'point', layer.opacity, baseStroke, baseFill)
    if (!res.point) return null
    if (res.point.kind === 'icon') {
      const iconUrl = resolveArcGisSymbolUrl(layer, res.point.url)
      const icon = L.icon({ iconUrl, iconSize: res.point.size, iconAnchor: res.point.anchor })
      return L.marker(latlng, { icon, opacity: res.point.opacity })
    }
    return L.circleMarker(latlng, res.point.options as any)
  }

  const dialogLayer = useMemo(() => {
    if (!layerDialog) return null
    return layers.find(l => String(l.id) === layerDialog.layerId) ?? null
  }, [layerDialog, layers])

  const symbologyLayer = useMemo(() => {
    if (!symbologyDialog) return null
    return layers.find(l => String(l.id) === symbologyDialog.layerId) ?? null
  }, [symbologyDialog, layers])

  const setHiddenFieldsForLayer = useCallback((layerId: string, next: Set<string>) => {
    setHiddenTableFieldsByLayerId(prev => {
      const safe = new Set(next)
      return { ...prev, [String(layerId)]: safe }
    })
  }, [])

  const setFieldOrderForLayer = useCallback((layerId: string, next: string[]) => {
    setFieldOrderByLayerId(prev => ({ ...prev, [String(layerId)]: next.slice() }))
  }, [])

  type SymbologyContext = {
    cfg: Required<SymbologyConfig>
    geometryKind: 'point' | 'line' | 'polygon' | 'other'
    values: number[]
    breaks: number[]
    colors: string[]
    widths: number[]
    categories: string[]
    categoryColors: Record<string, string>
    uniqueDashes: Record<string, string>
    dotDashes: string[]
    otherColor: string
    threshold: number
    thresholdPoints?: any
  }

  const symbologyContexts = useMemo(() => {
    const dashPatterns = ['', '8 4', '2 3', '10 3 2 3', '1 4', '14 4', '4 2 1 2', '12 2 4 2']
    const toWidths = (k: number) => {
      const minW = 1.5
      const maxW = 6
      const out: number[] = []
      for (let i = 0; i < k; i += 1) out.push(lerp(minW, maxW, k === 1 ? 0 : i / (k - 1)))
      return out
    }
    const dotDashes = (k: number) => {
      const presets = ['1 10', '1 7', '1 5', '1 3.5', '1 2.5', '1 2', '1 1.6', '1 1.3', '1 1.1']
      return presets.slice(0, clampInt(k, 3, 9))
    }
    const m = new Map<string, SymbologyContext>()
    for (const layer of layers) {
      if (layer.type !== 'geojson' || !layer.data) continue
      const id = String(layer.id)
      const cfg = normalizeSymbology(layer, layer.symbology)
      const geometryKind = getLayerGeometryKind(layer.data)
      const features = Array.isArray((layer.data as any)?.features) ? ((layer.data as any).features as any[]) : []
      const values: number[] = []
      if (cfg.field && cfg.style !== 'unique') {
        for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
          const v = features[i]?.properties?.[cfg.field]
          if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
        }
      }
      const classes = clampInt(cfg.classes, 2, 12)
      const breaks = values.length ? computeBreaks(values, classes, cfg.method) : [0, 0]
      const colors = sampleRamp(cfg.colorRamp, classes)
      const widths = toWidths(classes)
      const otherColor = '#94a3b8'
      const categories: string[] = []
      const categoryColors: Record<string, string> = {}
      const uniqueDashes: Record<string, string> = {}
      if (cfg.style === 'unique' && cfg.field) {
        const counts = new Map<string, number>()
        for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
          const raw = features[i]?.properties?.[cfg.field]
          if (raw === null || raw === undefined || raw === '') continue
          const key = String(raw)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        const maxCats = clampInt(cfg.classes, 2, 12)
        const sortedCats = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([k]) => k)
          .slice(0, maxCats)
        categories.push(...sortedCats)
        if (geometryKind === 'line') {
          categories.slice(0, dashPatterns.length).forEach((v, idx) => {
            uniqueDashes[v] = dashPatterns[idx] ?? ''
          })
        } else {
          const palette = sampleRamp(cfg.colorRamp, Math.max(2, categories.length))
          categories.forEach((v, idx) => {
            categoryColors[v] = palette[idx % palette.length] ?? otherColor
          })
        }
      }
      const dots = dotDashes(classes)
      let threshold = cfg.threshold
      if (!Number.isFinite(threshold) && values.length) {
        const sorted = [...values].sort((a, b) => a - b)
        threshold = quantileAt(sorted, 0.8)
      }
      const ctx: SymbologyContext = {
        cfg,
        geometryKind,
        values,
        breaks,
        colors,
        widths,
        categories,
        categoryColors,
        uniqueDashes,
        dotDashes: dots,
        otherColor,
        threshold: Number.isFinite(threshold) ? threshold : 0,
      }
      if (cfg.style === 'threshold_markers' && cfg.field && values.length) {
        const pts: any[] = []
        for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
          const ft = features[i]
          const v = ft?.properties?.[cfg.field]
          if (typeof v !== 'number' || !Number.isFinite(v) || v < ctx.threshold) continue
          const center = getGeometryCenter(ft?.geometry)
          if (!center) continue
          pts.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: center },
            properties: { __value: v },
          })
        }
        ctx.thresholdPoints = { type: 'FeatureCollection', features: pts }
      }
      m.set(id, ctx)
    }
    return m
  }, [symbologySignature])

  const getFeatureStyle = (layer: LayerData, feature: any) => {
    const baseStroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseFill = layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseWeight = layer.weight ?? SI_DEFAULT_VECTOR_LINE_WEIGHT
    const baseOpacity = typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1
    const fillFact = fillOpacityFactorForFillStyle((layer as any).fillStyle as GisFillStyle | undefined)
    const polyFill = clampPolygonFillAlpha(layer) * baseOpacity * fillFact
    const geometryKind = getGeometryKind(feature?.geometry?.type)
    const ctx = symbologyContexts.get(String(layer.id))
    const blendCn = pathBlendClassName(layer.blendMode)
    const base: any = {
      color: baseStroke,
      weight: baseWeight,
      opacity: baseOpacity,
      fillColor: baseFill,
      fillOpacity: geometryKind === 'polygon' ? polyFill : geometryKind === 'point' ? 0.7 * baseOpacity : 0,
      dashArray: strokeDashFromStyle((layer as any).strokeStyle),
      className: blendCn,
    }
    if (geometryKind !== 'polygon') base.fillOpacity = 0
    if (!ctx || ctx.cfg.useArcGisOnline) {
      const arc = getArcGisPathStyleForFeature(layer, feature)
      if (arc) {
        const cn = [blendCn, (arc as any).className].filter(Boolean).join(' ')
        return { ...base, ...arc, ...(cn ? { className: cn } : {}) }
      }
      return base
    }

    if (ctx.cfg.style === 'single') {
      if (geometryKind === 'line') return { ...base, fillOpacity: 0 }
      if (geometryKind === 'polygon') return { ...base, fillColor: baseFill, fillOpacity: polyFill }
      return base
    }

    if (ctx.cfg.style === 'unique') {
      const raw = ctx.cfg.field ? feature?.properties?.[ctx.cfg.field] : undefined
      const key = raw === null || raw === undefined || raw === '' ? 'Other' : String(raw)
      if (geometryKind === 'line') {
        return { ...base, dashArray: ctx.uniqueDashes[key] ?? '', lineCap: 'round', fillOpacity: 0 }
      }
      const fill = ctx.categoryColors[key] ?? ctx.otherColor
      const stroke = darkenColor(fill, 0.25)
      if (geometryKind === 'polygon') return { ...base, color: stroke, fillColor: fill, fillOpacity: polyFill }
      return { ...base, color: stroke, fillColor: fill, fillOpacity: 0 }
    }

    const vRaw = ctx.cfg.field ? feature?.properties?.[ctx.cfg.field] : undefined
    const v = typeof vRaw === 'number' && Number.isFinite(vRaw) ? vRaw : null
    const idx = v === null ? 0 : getClassIndex(v, ctx.breaks)
    const classColor = ctx.colors[idx] ?? baseStroke
    const classWidth = ctx.widths[idx] ?? baseWeight

    if (ctx.cfg.style === 'color') {
      if (geometryKind === 'polygon') return { ...base, color: darkenColor(classColor, 0.25), fillColor: classColor, fillOpacity: polyFill }
      if (geometryKind === 'line') return { ...base, color: classColor, fillOpacity: 0 }
      return base
    }

    if (ctx.cfg.style === 'size') {
      if (geometryKind === 'polygon') return { ...base, weight: classWidth, fillColor: baseFill, fillOpacity: polyFill }
      if (geometryKind === 'line') return { ...base, weight: classWidth, fillOpacity: 0 }
      return base
    }

    if (ctx.cfg.style === 'color_size') {
      if (geometryKind === 'polygon')
        return { ...base, color: darkenColor(classColor, 0.25), fillColor: classColor, weight: classWidth, fillOpacity: polyFill }
      if (geometryKind === 'line') return { ...base, color: classColor, weight: classWidth, fillOpacity: 0 }
      return base
    }

    if (ctx.cfg.style === 'dot_density') {
      if (geometryKind === 'polygon') return { ...base, dashArray: ctx.dotDashes[idx] ?? '1 5', lineCap: 'round', fillColor: baseFill, fillOpacity: polyFill }
      if (geometryKind === 'line') return { ...base, dashArray: ctx.dotDashes[idx] ?? '1 5', lineCap: 'round', fillOpacity: 0 }
      return base
    }

    if (ctx.cfg.style === 'threshold_markers') {
      if (geometryKind === 'polygon') return { ...base, fillColor: baseFill, fillOpacity: polyFill }
      if (geometryKind === 'line') return { ...base, fillOpacity: 0 }
      return base
    }

    return base
  }

  const getPointMarkerOptions = (layer: LayerData, feature: any) => {
    const baseStroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseFill = layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseWeight = layer.weight ?? SI_DEFAULT_VECTOR_LINE_WEIGHT
    const baseOpacity = typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1
    const ctx = symbologyContexts.get(String(layer.id))
    let radius = clampPointRadius(layer)
    let color = baseStroke
    let fillColor = baseFill
    let weight = baseWeight
    let opacity = baseOpacity
    let fillOpacity = 0.7 * baseOpacity

    if (ctx && !ctx.cfg.useArcGisOnline) {
      if (ctx.cfg.style === 'single') {
        return { radius, color, weight, opacity, fillColor, fillOpacity, className: pathBlendClassName(layer.blendMode) }
      }
      if (ctx.cfg.style === 'unique') {
        const raw = ctx.cfg.field ? feature?.properties?.[ctx.cfg.field] : undefined
        const key = raw === null || raw === undefined || raw === '' ? 'Other' : String(raw)
        const fill = ctx.categoryColors[key] ?? ctx.otherColor
        fillColor = fill
        color = darkenColor(fill, 0.25)
        radius = Math.max(radius, 7)
      } else {
        const vRaw = ctx.cfg.field ? feature?.properties?.[ctx.cfg.field] : undefined
        const v = typeof vRaw === 'number' && Number.isFinite(vRaw) ? vRaw : null
        const idx = v === null ? 0 : getClassIndex(v, ctx.breaks)
        const classColor = ctx.colors[idx] ?? baseStroke
        const classWidth = ctx.widths[idx] ?? baseWeight
        if (ctx.cfg.style === 'color') {
          fillColor = classColor
          color = darkenColor(classColor, 0.25)
        }
        if (ctx.cfg.style === 'size') radius = Math.max(4, Math.min(14, 3 + classWidth * 2))
        if (ctx.cfg.style === 'color_size') {
          fillColor = classColor
          color = darkenColor(classColor, 0.25)
          radius = Math.max(4, Math.min(14, 3 + classWidth * 2))
        }
        if (ctx.cfg.style === 'dot_density') radius = Math.max(4, Math.min(12, 4 + idx))
        if (ctx.cfg.style === 'threshold_markers' && v !== null && v >= ctx.threshold) {
          fillColor = '#ef4444'
          color = '#ef4444'
          radius = 8
        }
      }
    }

    return { radius, color, weight, opacity, fillColor, fillOpacity, className: pathBlendClassName(layer.blendMode) }
  }

  const applyLayerSymbology = (layerId: string, next?: SymbologyConfig) => {
    setLayers(prev =>
      prev.map(l => (String(l.id) === layerId ? { ...l, symbology: next && Object.keys(next).length ? next : undefined } : l)),
    )
  }

  const applyLayerAppearance = (layerId: string, next: GisLayerAppearancePersisted) => {
    setLayers(prev =>
      prev.map(l =>
        String(l.id) === layerId
          ? {
              ...l,
              color: next.color,
              fillColor: next.fillColor,
              weight: Math.max(0.5, Math.min(16, next.weight)),
              opacity: clamp01(next.opacity),
              strokeStyle: next.strokeStyle,
              polygonFillAlpha: clamp01(next.polygonFillAlpha),
              pointRadius: Math.max(3, Math.min(24, next.pointRadius)),
              fillStyle: next.fillStyle,
              blendMode: next.blendMode,
            }
          : l,
      ),
    )
  }

  const appearancePersisted = (a: GisSymbologyAppearance): GisLayerAppearancePersisted => {
    const { previewCornerRadius: _pc, ...rest } = a
    return rest
  }

  const cancelSymbology = () => {
    if (!symbologyDialog) return
    applyLayerSymbology(symbologyDialog.layerId, symbologyDialog.original)
    applyLayerAppearance(symbologyDialog.layerId, appearancePersisted(symbologyDialog.originalAppearance))
    setSymbologyDialog(null)
  }

  const openLayerSymbology = (layer: LayerData) => {
    const lid = String(layer.id)
    const original = layer.symbology
    let draft = normalizeSymbology(layer, original)
    if (layer.source === 'arcgis' && draft.useArcGisOnline) {
      const r = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
      draft = normalizeSymbology(layer, { ...draft, ...inferVisualizationFromArcgisRenderer(r) })
    }
    const app0 = appearanceFromLayer(layer)
    applyLayerSymbology(lid, draft)
    applyLayerAppearance(lid, appearancePersisted(app0))
    setSymbologyFillPreviewMode('solid')
    setSymbologyStudioSections({ visualization: true, studio: true, legend: true })
    setSymbologyDialog({
      layerId: lid,
      draft,
      original,
      originalAppearance: app0,
      draftAppearance: app0,
    })
  }

  const moveLayerDrawOrder = (layerId: string, dir: 'forward' | 'backward') => {
    setLayers(prev => {
      const idx = prev.findIndex(l => String(l.id) === layerId)
      if (idx < 0) return prev
      if (dir === 'forward' && idx >= prev.length - 1) return prev
      if (dir === 'backward' && idx <= 0) return prev
      const next = [...prev]
      const j = dir === 'forward' ? idx + 1 : idx - 1
      const a = next[idx]!
      const b = next[j]!
      next[idx] = b
      next[j] = a
      return next
    })
  }

  const saveSymbology = () => {
    setSymbologyDialog(null)
  }

  const updateSymbologyDraft = (patch: Partial<Required<SymbologyConfig>>) => {
    setSymbologyDialog(prev => {
      if (!prev) return prev
      let nextDraft: Required<SymbologyConfig> = { ...prev.draft, ...patch }
      const layer = symbologyLayer ?? layers.find(l => String(l.id) === prev.layerId)
      if (!layer) return prev
      if (patch.useArcGisOnline === true) {
        const renderer = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
        nextDraft = { ...nextDraft, ...inferVisualizationFromArcgisRenderer(renderer) }
      }
      const normalized = normalizeSymbology(layer, nextDraft)
      applyLayerSymbology(prev.layerId, normalized)
      return { ...prev, draft: normalized }
    })
  }

  const updateSymbologyAppearance = (patch: Partial<GisSymbologyAppearance>) => {
    setSymbologyDialog(prev => {
      if (!prev) return prev
      const merged: GisSymbologyAppearance = {
        ...prev.draftAppearance,
        ...patch,
      }
      merged.weight = Math.max(0.5, Math.min(16, Number.isFinite(merged.weight) ? merged.weight : 2))
      merged.opacity = clamp01(Number.isFinite(merged.opacity) ? merged.opacity : 1)
      merged.polygonFillAlpha = clamp01(Number.isFinite(merged.polygonFillAlpha) ? merged.polygonFillAlpha : 0.35)
      merged.pointRadius = Math.max(3, Math.min(24, Number.isFinite(merged.pointRadius) ? merged.pointRadius : 6))
      merged.previewCornerRadius = Math.max(0, Math.min(24, Number.isFinite(merged.previewCornerRadius) ? merged.previewCornerRadius : 8))
      const fs = merged.fillStyle
      merged.fillStyle =
        fs === 'pattern' || fs === 'hatch' || fs === 'gradient' || fs === 'solid' ? fs : 'solid'
      const bm = merged.blendMode
      merged.blendMode =
        bm === 'multiply' || bm === 'screen' || bm === 'overlay' || bm === 'darken' || bm === 'lighten' || bm === 'normal'
          ? bm
          : 'normal'
      applyLayerAppearance(prev.layerId, appearancePersisted(merged))
      return { ...prev, draftAppearance: merged }
    })
  }

  const buildArcGisUrl = (baseUrl: string, params: Record<string, string>) => {
    const normalized = baseUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
    const u = new URL(normalized, window.location.origin)
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '') search.set(k, v)
    })
    u.search = search.toString()
    return u.toString()
  }

  const normalizeArcGisServiceUrl = (raw: string) => {
    const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
    const parts = trimmed.split('/')
    const last = parts[parts.length - 1]
    const prev = parts[parts.length - 2]
    if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
      return parts.slice(0, -1).join('/')
    }
    return trimmed
  }

  /** Matches a direct single layer/table URL, e.g. `…/MapServer/124` or `…/FeatureServer/3`. */
  const arcgisDirectLayerUrlRe = /\/(?:MapServer|FeatureServer)\/(\d+)\/?$/i

  const discoverArcGisLayers = async () => {
    const cleaned = serviceUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
    if (!cleaned) return
    setIsDiscovering(true)
    setDiscoverError(null)
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    try {
      // Direct single-layer/table URL (…/MapServer/124): load THAT layer's definition
      // instead of enumerating the whole service root. Many secured/grouped service roots
      // don't list their layers, so stripping to the root would wrongly report
      // "No layers/tables found" even when the specific layer is valid open data.
      const directMatch = cleaned.match(arcgisDirectLayerUrlRe)
      if (directMatch) {
        const def = await fetchArcGisLayerDefinition(cleaned, token)
        const id = typeof def?.id === 'number' ? def.id : Number(directMatch[1])
        const name =
          typeof def?.name === 'string' && def.name.trim() ? (def.name as string) : `Layer ${id}`
        const isTable = typeof def?.type === 'string' && /table/i.test(def.type)
        const discovered = [
          {
            id,
            name,
            kind: (isTable ? 'table' : 'layer') as 'layer' | 'table',
            url: cleaned,
            geometryType: typeof def?.geometryType === 'string' ? (def.geometryType as string) : undefined,
          },
        ]
        setDiscoveredLayers(discovered)
        setSelectedDiscoveredUrl(discovered[0].url)
        setLayerName(prev => (prev.trim() ? prev : discovered[0].name))
        return
      }

      // Service root URL → enumerate its layers + tables.
      const base = normalizeArcGisServiceUrl(serviceUrl)
      const url = buildArcGisUrl(base, { f: 'json', token: token.trim() })
      const res = await fetch(url, { method: 'GET' })
      const json = await res.json()
      if (json?.error?.message) {
        const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
        throw new Error([json.error.message, details].filter(Boolean).join(' '))
      }
      const layersArr = Array.isArray(json?.layers) ? json.layers : []
      const tablesArr = Array.isArray(json?.tables) ? json.tables : []
      const discovered = [...layersArr.map((l: any) => ({ ...l, kind: 'layer' as const })), ...tablesArr.map((t: any) => ({ ...t, kind: 'table' as const }))]
        .filter((l: any) => typeof l?.id === 'number' && typeof l?.name === 'string')
        .map((l: any) => ({
          id: l.id as number,
          name: l.name as string,
          kind: l.kind as 'layer' | 'table',
          url: `${base.replace(/\/+$/, '')}/${l.id}`,
          geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
        }))
      if (discovered.length === 0) {
        throw new Error(
          'No layers/tables found in this service URL. For a single layer, paste its full URL ending in the layer id (e.g. …/MapServer/124).',
        )
      }
      setDiscoveredLayers(discovered)
      setSelectedDiscoveredUrl(discovered[0].url)
      setLayerName(prev => (prev.trim() ? prev : discovered[0].name))
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to connect to service.')
    } finally {
      setIsDiscovering(false)
    }
  }

  const fetchArcGisGeoJson = async (
    layerUrl: string,
    authToken?: string,
    opts?: {
      returnGeometry?: boolean
      onProgress?: (progress: import('../../lib/arcgisFeatureLayerGeoJson').ArcGisFeatureLayerFetchProgress) => void
    },
  ) => {
    return fetchArcGisFeatureLayerGeoJson(layerUrl, {
      token: authToken,
      returnGeometry: opts?.returnGeometry !== false,
      onProgress: opts?.onProgress,
    })
  }

  const fetchArcGisLayerDefinition = async (layerUrl: string, authToken?: string) => {
    const url = buildArcGisUrl(layerUrl.replace(/\/+$/, ''), { f: 'json', token: (authToken ?? '').trim() })
    const res = await fetch(url, { method: 'GET' })
    const json = await res.json()
    if (json?.error?.message) {
      const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
      throw new Error([json.error.message, details].filter(Boolean).join(' '))
    }
    return json
  }

  /** Turn on ArcGIS renderer preview: load drawingInfo if missing, align draft style/field with the service renderer, persist symbology. */
  const activateArcGisOnlineSymbology = async (layerId: string, draft: Required<SymbologyConfig>) => {
    const cur = layersRef.current.find(l => String(l.id) === layerId)
    if (!cur) return
    let fetchedDef: any = null
    let renderer = cur.arcgisRenderer ?? cur.arcgisLayerDefinition?.drawingInfo?.renderer
    if (!renderer && cur.source === 'arcgis' && typeof cur.url === 'string' && cur.url.trim()) {
      try {
        fetchedDef = await fetchArcGisLayerDefinition(cur.url, cur.authToken)
        renderer = fetchedDef?.drawingInfo?.renderer ?? renderer
      } catch {
        /* keep going — user still gets custom fallback if renderer stays empty */
      }
    }
    let layerForNormalize: LayerData = cur
    if (fetchedDef) {
      layerForNormalize = {
        ...cur,
        arcgisLayerDefinition: fetchedDef ?? cur.arcgisLayerDefinition,
        arcgisRenderer: renderer ?? cur.arcgisRenderer,
        arcgisStyleUrl: typeof fetchedDef?.styleUrl === 'string' ? fetchedDef.styleUrl : cur.arcgisStyleUrl,
      }
    }
    const infer = inferVisualizationFromArcgisRenderer(renderer)
    const normalized = normalizeSymbology(layerForNormalize, { ...draft, useArcGisOnline: true, ...infer })
    setLayers(prev =>
      prev.map(l => {
        if (String(l.id) !== layerId) return l
        if (fetchedDef) {
          return {
            ...l,
            arcgisLayerDefinition: fetchedDef ?? l.arcgisLayerDefinition,
            arcgisRenderer: renderer ?? l.arcgisRenderer,
            arcgisStyleUrl: typeof fetchedDef?.styleUrl === 'string' ? fetchedDef.styleUrl : l.arcgisStyleUrl,
            symbology: normalized,
          }
        }
        return { ...l, symbology: normalized }
      }),
    )
    setSymbologyDialog(prev => (prev && prev.layerId === layerId ? { ...prev, draft: normalized } : prev))
  }

  const extractArcGisPortalItemId = (def: any): string | undefined => {
    const direct = typeof def?.portalItem?.id === 'string' ? def.portalItem.id : undefined
    if (direct) return direct
    const serviceItemId = typeof def?.serviceItemId === 'string' ? def.serviceItemId : undefined
    if (serviceItemId) return serviceItemId
    const itemId = typeof def?.itemId === 'string' ? def.itemId : undefined
    if (itemId) return itemId
    return undefined
  }

  const syncArcGisLayer = async (layer: LayerData, opts?: { silent?: boolean }) => {
    const isArcGis = layer.source === 'arcgis' && typeof layer.url === 'string' && layer.url.trim() !== ''
    if (!isArcGis) return
    const layerKey = String(layer.id)
    if (!opts?.silent) setSyncingLayerKey(layerKey)
    try {
      const def = await fetchArcGisLayerDefinition(layer.url as string, layer.authToken).catch((e) => {
        console.error('ArcGIS layer definition fetch failed:', e)
        return null
      })
      const hasGeometry = (def?.type && String(def.type).toLowerCase() === 'table') ? false : typeof def?.geometryType === 'string' ? true : true
      const geojson = await fetchArcGisGeoJson(layer.url as string, layer.authToken, { returnGeometry: hasGeometry })
      setLayers(prev =>
        prev.map(l =>
          l.id === layer.id
            ? {
                ...l,
                data: geojson,
                arcgisLayerDefinition: def ?? l.arcgisLayerDefinition,
                arcgisRenderer: def?.drawingInfo?.renderer ?? l.arcgisRenderer,
                arcgisLabelingInfo: def?.drawingInfo?.labelingInfo ?? l.arcgisLabelingInfo,
                arcgisPortalItemId: (def ? extractArcGisPortalItemId(def) : undefined) ?? l.arcgisPortalItemId,
                arcgisStyleUrl: (typeof def?.styleUrl === 'string' ? def.styleUrl : undefined) ?? l.arcgisStyleUrl,
              }
            : l,
        ),
      )
    } catch (e) {
      if (!opts?.silent) {
        void appAlert(e instanceof Error ? e.message : 'Failed to sync layer.', { title: 'Sync failed' })
      }
    } finally {
      if (!opts?.silent) setSyncingLayerKey(null)
    }
  }

  const addArcGisLayerAsGeoJson = async (l: { id: number; name: string; kind: 'layer' | 'table'; url: string }) => {
    const layerKey = `arcgis:${l.url}`
    setAddingLayerKey(layerKey)
    setDiscoverError(null)
    try {
      const def = await fetchArcGisLayerDefinition(l.url, token).catch((e) => {
        console.error('ArcGIS layer definition fetch failed:', e)
        return null
      })
      const hasGeometry = (def?.type && String(def.type).toLowerCase() === 'table') ? false : typeof def?.geometryType === 'string' ? true : l.kind !== 'table'
      const geojson = await fetchArcGisGeoJson(l.url, token, {
        returnGeometry: hasGeometry,
        onProgress: progress => {
          if (progress.phase === 'page') {
            setDiscoverError(`Downloading geometry… ${progress.featureCount} features (page ${progress.page})`)
          }
        },
      })
      const name = layerName.trim() || l.name
      const hostedRow = publishVectorGeoJsonAsHostedFeatureLayer({
        title: name,
        geojson: geojson as GisHostedFeatureLayerGeoJson,
        sourceMethod: 'arcgis-url',
        externalServiceUrl: l.url,
      })
      const portalUrl = gisContentPortalLayerUrl(hostedRow.id)
      const newLayer: LayerData = {
        id: `hosted:${hostedRow.id}`,
        name: hostedRow.title,
        type: 'geojson',
        source: 'gis-portal',
        visible: true,
        opacity: 1,
        data: geojson,
        url: portalUrl,
        authToken: token.trim() ? token.trim() : undefined,
        ...siDefaultNewVectorLayerFields(),
        arcgisLayerDefinition: def ?? undefined,
        arcgisRenderer: def?.drawingInfo?.renderer ?? undefined,
        arcgisLabelingInfo: def?.drawingInfo?.labelingInfo ?? undefined,
        arcgisPortalItemId: def ? extractArcGisPortalItemId(def) : undefined,
        arcgisStyleUrl: typeof def?.styleUrl === 'string' ? def.styleUrl : undefined,
      }
      setLayers(prev => [...prev, newLayer])
      setDiscoverError(null)
      setSelectionNotice(`Published "${hostedRow.title}" as hosted feature layer in GIS Content.`)
      setIsAddOpen(false)
      setLayerName('')
      setServiceUrl('')
      setToken('')
      setDiscoveredLayers([])
      setSelectedDiscoveredUrl('')
      setUploadFile(null)
      setRemoteDataUrl('')
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to add layer.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const setUploadFromFile = (file: File | null) => {
    setUploadFile(file)
    if (!file) return
    if (layerName.trim()) return
    const stem = file.name.replace(/\.[^.]+$/, '').trim()
    if (stem) setLayerName(stem)
  }

  const addUploadLayerAsGeoJson = async () => {
    if (!uploadFile) return
    const key = `upload:${uploadFile.name}`
    setAddingLayerKey(key)
    setDiscoverError(null)
    try {
      const parsed = await parseFile(uploadFile)
      if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
      let geojson: any = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
      if (!normalized.features.length) {
        throw new Error(
          'No drawable features found. KML/KMZ may use empty folders, GroundOverlay-only files, or nested MultiGeometry — try a layer with placemark polygons/paths, or export as GeoJSON.',
        )
      }
      geojson = normalized
      const name = layerName.trim() || uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'Layer'
      const hostedRow = publishVectorGeoJsonAsHostedFeatureLayer({
        title: name,
        geojson: geojson as GisHostedFeatureLayerGeoJson,
        sourceMethod: 'upload',
        sourceFileName: uploadFile.name,
      })
      const portalUrl = gisContentPortalLayerUrl(hostedRow.id)
      const newLayer: LayerData = {
        id: `hosted:${hostedRow.id}`,
        name: hostedRow.title,
        type: 'geojson',
        source: 'gis-portal',
        visible: true,
        opacity: 1,
        data: geojson,
        url: portalUrl,
        ...siDefaultNewVectorLayerFields(),
      }
      setLayers(prev => [...prev, newLayer])
      setSelectionNotice(`Published "${hostedRow.title}" as hosted feature layer in GIS Content.`)
      setIsAddOpen(false)
      setLayerName('')
      setUploadFile(null)
      setRemoteDataUrl('')
      setServiceUrl('')
      setDiscoveredLayers([])
      setSelectedDiscoveredUrl('')
      setDiscoverError(null)
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to import file.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const addUrlLayerAsGeoJson = async () => {
    const trimmed = remoteDataUrl.trim()
    if (!trimmed) return
    const opKey = `url:${trimmed}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const imageRoot = getImageServerServiceRootFromUrl(trimmed)
      if (imageRoot) {
        const meta = await fetchImageServerMeta(imageRoot, { token: getArcgisPortalToken() })
        const extentSource = meta.fullExtent ?? meta.extent
        const bbox = extentSource ? arcgisExtentToWgs84BBox(extentSource) : null
        const layerId = `url:esri-image:${newGisImportId()}`
        const name = layerName.trim() || meta.name || 'Image Server'
        const newLayer: LayerData = {
          id: layerId,
          name,
          type: 'tile',
          source: 'url',
          visible: true,
          opacity: 1,
          url: imageRoot,
          data: { esriImageServer: true },
          ...(bbox ? { bbox } : {}),
        }
        setLayers(prev => [...prev, newLayer])
        setIsAddOpen(false)
        setLayerName('')
        setUploadFile(null)
        setRemoteDataUrl('')
        setServiceUrl('')
        setDiscoveredLayers([])
        setSelectedDiscoveredUrl('')
        setDiscoverError(null)
        if (bbox && mapProjectionMode !== 'globe') {
          requestAnimationFrame(() => {
            const map = mapRef.current
            if (!map) return
            const b = L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]])
            if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 14 })
          })
        }
        return
      }

      const file = await parseRemoteUrlAsFile(trimmed)
      const parsed = await parseFile(file)
      if (parsed.type !== 'geojson') {
        throw new Error('URL must resolve to GIS features (GeoJSON/KML/KMZ/Shapefile zip/CSV with coordinates).')
      }
      let geojson: any = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const normalizedUrl = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
      if (!normalizedUrl.features.length) {
        throw new Error(
          'URL resolved to no drawable vector features. If this is KML/KMZ, ensure placemarks include geometry (not only network links or overlays).',
        )
      }
      geojson = normalizedUrl
      const stem = file.name.replace(/\.[^.]+$/, '').trim()
      const name = layerName.trim() || stem || 'Layer'
      const hostedRow = publishVectorGeoJsonAsHostedFeatureLayer({
        title: name,
        geojson: geojson as GisHostedFeatureLayerGeoJson,
        sourceMethod: 'url',
        externalServiceUrl: trimmed,
      })
      const portalUrl = gisContentPortalLayerUrl(hostedRow.id)
      const newLayer: LayerData = {
        id: `hosted:${hostedRow.id}`,
        name: hostedRow.title,
        type: 'geojson',
        source: 'gis-portal',
        visible: true,
        opacity: 1,
        data: geojson,
        url: portalUrl,
        ...siDefaultNewVectorLayerFields(),
      }
      setLayers(prev => [...prev, newLayer])
      setSelectionNotice(`Published "${hostedRow.title}" as hosted feature layer in GIS Content.`)
      setIsAddOpen(false)
      setLayerName('')
      setUploadFile(null)
      setRemoteDataUrl('')
      setServiceUrl('')
      setDiscoveredLayers([])
      setSelectedDiscoveredUrl('')
      setDiscoverError(null)
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to import from URL.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const importLayerFromGisContent = useCallback(
    (saved: LayerData) => {
      if (!gisMapLayerImportableFromStore(saved)) {
        setDiscoverError('This layer cannot be copied from GIS Content (needs feature data or an image service URL).')
        return
      }
      const opKey = `giscontent-src:${String(saved.id)}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        const newId = `giscontent:${newGisImportId()}`
        let data = saved.data
        try {
          if (data !== undefined) data = JSON.parse(JSON.stringify(data))
        } catch {
          /* keep reference */
        }
        const next: LayerData = { ...saved, id: newId, data }
        setLayers(prev => [...prev, next])
        setIsAddOpen(false)
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to import layer from GIS Content.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [setLayers],
  )

  const importPortalContentById = useCallback(
    async (contentId: string) => {
      const row = getGisContentRowById(contentId)
      if (!row || isGisContentRowInRecycle(row)) {
        setDiscoverError('GIS Content item is unavailable or in the Recycle bin.')
        return
      }
      try {
        const payload = await buildGisContentMapLayerPayloadAsync(row)
        const next: LayerData = {
          id: payload.id,
          name: payload.name,
          type: 'geojson',
          visible: true,
          opacity: 1,
          data: payload.geojson,
          url: payload.sourceUrl,
          ...siDefaultNewVectorLayerFields(),
        }
        setLayers(prev => {
          if (prev.some(l => parseGisContentPortalLayerUrl(String(l.url || '')) === contentId)) {
            return prev
          }
          return [...prev, next]
        })
        setDiscoverError(null)
        try {
          const bounds = L.geoJSON(payload.geojson as any).getBounds()
          if (bounds.isValid()) mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 })
        } catch {
          /* ignore fit errors */
        }
      } catch (err) {
        setDiscoverError(err instanceof Error ? err.message : 'Failed to load GIS Content layer.')
      }
    },
    [],
  )

  const applyWebMapSnapshot = useCallback(
    (snapshot: GisWebMapSnapshotV1, meta?: { id?: string; title?: string }) => {
      setSelectedBasemap(resolveBasemapId(snapshot.basemap as BasemapType))
      setLayers(prev => prev.filter(layer => !parseGisContentPortalLayerUrl(String(layer.url || ''))))
      snapshot.portalLayerIds.forEach(contentId => importPortalContentById(contentId))

      if (snapshot.projection === 'globe' && snapshot.view) {
        if (mapProjectionMode !== 'globe') changeProjectionMode('globe')
        setGlobeViewState(prev => ({
          ...prev,
          longitude: snapshot.view!.longitude,
          latitude: snapshot.view!.latitude,
          zoom: Math.max(0.5, snapshot.view!.zoom),
          pitch: snapshot.view!.pitch ?? prev.pitch,
          bearing: snapshot.view!.bearing ?? prev.bearing,
        }))
      } else if (snapshot.center && typeof snapshot.zoom === 'number') {
        if (mapProjectionMode !== '2d') changeProjectionMode('2d')
        requestAnimationFrame(() => {
          mapRef.current?.flyTo([snapshot.center!.lat, snapshot.center!.lng], snapshot.zoom!, { duration: 0.85 })
        })
      }

      if (meta?.id) setSavedPortalWebMapId(meta.id)
      else setSavedPortalWebMapId(null)
      setSavedPortalWebMapTitle(meta?.title ?? null)
    },
    [mapProjectionMode, changeProjectionMode, importPortalContentById],
  )

  const persistPortalWebMap = useCallback(
    async (mode: 'save' | 'saveAs') => {
      let title = savedPortalWebMapTitle ?? 'Untitled map'
      let id: string | undefined = savedPortalWebMapId ?? undefined

      if (mode === 'saveAs' || !savedPortalWebMapId) {
        const prompted = await appPrompt('Enter a title for this web map.', title, { title: mode === 'saveAs' ? 'Save as' : 'Save map' })
        if (!prompted?.trim()) return
        title = prompted.trim()
        if (mode === 'saveAs') id = undefined
      }

      const snapshot = buildCurrentWebMapSnapshot()
      const row = upsertGisContentPortalWebMap({ id, title, snapshot })
      setSavedPortalWebMapId(row.id)
      setSavedPortalWebMapTitle(row.title)
      setSelectionNotice(`Saved "${row.title}" to GIS Content as Web Map.`)
    },
    [buildCurrentWebMapSnapshot, savedPortalWebMapId, savedPortalWebMapTitle],
  )

  const persistMapLayerToGisContent = useCallback(
    async (layer: LayerData, mode: 'save' | 'saveAs') => {
      const geojson = geoJsonForGisContentLayerSave(layer.data)
      if (layer.type !== 'geojson' || !geojson) {
        void appAlert('Only vector feature layers can be saved to GIS Content.', { title: 'Save layer' })
        return
      }

      let title = layer.name
      const linkedId = parseGisContentPortalLayerUrl(String(layer.url ?? ''))

      if (mode === 'saveAs' || !linkedId) {
        const prompted = await appPrompt('Enter a title for this hosted feature layer in GIS Content.', title, {
          title: mode === 'saveAs' ? 'Save as' : 'Save layer',
        })
        if (!prompted?.trim()) return
        title = prompted.trim()
      }

      const row = saveMapVectorLayerToGisContent({
        layerName: layer.name,
        layerUrl: layer.url,
        geojson,
        mode,
        title,
      })

      setLayers(prev =>
        prev.map(l =>
          l.id === layer.id
            ? {
                ...l,
                name: row.title,
                source: 'gis-portal',
                url: gisContentPortalLayerUrl(row.id),
              }
            : l,
        ),
      )
      setSelectionNotice(`Saved "${row.title}" to GIS Content as Feature layer (hosted).`)
    },
    [],
  )

  const handlePortalWebMapNew = useCallback(async () => {
    const ok = await appConfirm('Start a new map? Unsaved changes to the current map will be lost.', { title: 'New map' })
    if (!ok) return
    setSavedPortalWebMapId(null)
    setSavedPortalWebMapTitle(null)
    setLayers([])
    setSelectedBasemap(defaultGisBasemapId())
    if (mapProjectionMode !== '2d') changeProjectionMode('2d')
    requestAnimationFrame(() => {
      mapRef.current?.flyTo([DEFAULT_GIS_CENTER.latitude, DEFAULT_GIS_CENTER.longitude], initialZoom, { duration: 0.65 })
    })
    setSelectionNotice('New map started.')
  }, [mapProjectionMode, changeProjectionMode, initialZoom])

  const handleOpenPortalWebMapRow = useCallback(
    (row: GisContentRow) => {
      const snapshot = readGisWebMapSnapshot(getGisContentItemDetails(row.id))
      if (!snapshot) {
        void appAlert('This Web Map does not contain a saved map view.', { title: 'Open map' })
        return
      }
      applyWebMapSnapshot(snapshot, { id: row.id, title: row.title })
      setOpenWebMapModalOpen(false)
      setSelectionNotice(`Opened "${row.title}" from GIS Content.`)
    },
    [applyWebMapSnapshot],
  )

  const addGisPortalRowToMap = useCallback(
    (row: GisContentRow) => {
      if (isGisContentRowInRecycle(row)) {
        setPortalBrowseStatus('This item is in the Recycle bin — restore it from GIS Content first.')
        return
      }
      if (!isGisPortalRowMapAddable(row.type)) {
        setPortalBrowseStatus(`"${row.title}" cannot be added as a map layer from this catalog entry.`)
        return
      }
      setAddingPortalRowId(row.id)
      void (async () => {
        try {
          const payload = await buildGisContentMapLayerPayloadAsync(row)
          let added = false
          setLayers(prev => {
            if (prev.some(l => parseGisContentPortalLayerUrl(String(l.url || '')) === row.id)) {
              return prev
            }
            added = true
            return [
              ...prev,
              {
                id: payload.id,
                name: payload.name,
                type: 'geojson',
                visible: true,
                opacity: 1,
                data: payload.geojson,
                url: payload.sourceUrl,
                ...siDefaultNewVectorLayerFields(),
              },
            ]
          })
          if (added) {
            setPortalBrowseStatus(`Added "${row.title}" to the map.`)
            try {
              const bounds = L.geoJSON(payload.geojson as any).getBounds()
              if (bounds.isValid()) mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 })
            } catch {
              /* ignore fit errors */
            }
          } else {
            setPortalBrowseStatus(`"${row.title}" is already on the map.`)
          }
        } catch (err) {
          setPortalBrowseStatus(err instanceof Error ? err.message : `Failed to add "${row.title}".`)
        } finally {
          setAddingPortalRowId(null)
        }
      })()
    },
    [],
  )

  useEffect(() => {
    const contentId = searchParams.get('content')
    if (!contentId || contentId === gisContentDeepLinkRef.current) return
    if (!layersLoaded) return
    gisContentDeepLinkRef.current = contentId
    const next = new URLSearchParams(searchParams)
    next.delete('content')
    setSearchParams(next, { replace: true })
    importPortalContentById(contentId)
  }, [searchParams, setSearchParams, layersLoaded, importPortalContentById])

  useEffect(() => {
    if (!layersLoaded) return
    const hydratePortalLinkedLayers = () => {
      void (async () => {
        const prev = layersRef.current ?? []
        const updates = await Promise.all(
          prev.map(async layer => {
            const rowId = parseGisContentPortalLayerUrl(String(layer.url || ''))
            if (!rowId) return { layer, changed: false as const }
            const row = getGisContentRowById(rowId)
            if (!row || isGisContentRowInRecycle(row)) return { layer, changed: false as const }
            try {
              const payload = await buildGisContentMapLayerPayloadAsync(row)
              const updated: LayerData = {
                ...layer,
                name: row.title,
                data: payload.geojson,
                url: payload.sourceUrl,
                source: 'gis-portal',
              }
              const changed =
                updated.name !== layer.name ||
                updated.url !== layer.url ||
                updated.source !== layer.source ||
                JSON.stringify(updated.data) !== JSON.stringify(layer.data)
              return { layer: changed ? updated : layer, changed }
            } catch {
              return { layer, changed: false as const }
            }
          }),
        )
        if (!updates.some(entry => entry.changed)) return
        setLayers(updates.map(entry => entry.layer))
      })()
    }
    hydratePortalLinkedLayers()
    window.addEventListener('gis-content-portal-changed', hydratePortalLinkedLayers)
    return () => window.removeEventListener('gis-content-portal-changed', hydratePortalLinkedLayers)
  }, [layersLoaded])

  useEffect(() => {
    const syncPortalLayers = () => {
      setLayers(prev =>
        prev.filter(layer => {
          const rowId = parseGisContentPortalLayerUrl(String(layer.url || ''))
          if (!rowId) return true
          const row = getGisContentRowById(rowId)
          return Boolean(row && !isGisContentRowInRecycle(row))
        }),
      )
    }
    window.addEventListener('gis-content-portal-changed', syncPortalLayers)
    return () => window.removeEventListener('gis-content-portal-changed', syncPortalLayers)
  }, [])

  const addDbPropertyRow = () => {
    setDbAdditionalProperties(prev => [...prev, { id: `db-prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, key: '', value: '' }])
  }

  const updateDbPropertyRow = (id: string, patch: Partial<{ key: string; value: string }>) => {
    setDbAdditionalProperties(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }

  const removeDbPropertyRow = (id: string) => {
    setDbAdditionalProperties(prev => prev.filter(row => row.id !== id))
  }

  const saveDatabaseConnectionProfile = async () => {
    const instance = dbInstance.trim()
    if (!instance) {
      setDbConnectionStatus('Instance / Host is required.')
      return
    }
    if (dbAuthType === 'database' && !dbUser.trim()) {
      setDbConnectionStatus('User Name is required for Database authentication.')
      return
    }
    setDbSaving(true)
    setDbConnectionStatus(null)
    try {
      const profile = {
        id: `db-${Date.now()}`,
        platform: dbPlatform,
        instance,
        authType: dbAuthType,
        username: dbAuthType === 'database' ? dbUser.trim() : '',
        password: dbAuthType === 'database' ? dbPassword : '',
        saveCredentials: dbSaveCredentials,
        database: dbDatabase.trim(),
        connectionFileName: dbConnectionFileName.trim(),
        geodatabaseVersion: dbVersion.trim(),
        role: dbRole.trim(),
        authDatabase: dbAuthDatabase.trim(),
        additionalProperties: dbAdditionalProperties
          .map(row => ({ key: row.key.trim(), value: row.value.trim() }))
          .filter(row => row.key || row.value),
      }
      const raw = window.localStorage.getItem(GIS_DB_CONNECTIONS_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      const existing = Array.isArray(parsed) ? (parsed as any[]) : []
      const next = [...existing, profile]
      window.localStorage.setItem(GIS_DB_CONNECTIONS_STORAGE_KEY, JSON.stringify(next))
      setDbConnectionStatus(`Connection profile saved (${profile.platform} @ ${profile.instance}).`)
    } catch (e: any) {
      setDbConnectionStatus(typeof e?.message === 'string' ? e.message : 'Failed to save database connection profile.')
    } finally {
      setDbSaving(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      const mobile = window.innerWidth <= 767
      const stacked = window.innerWidth <= 900
      setIsMobileDrawerViewport(mobile)
      setIsSplitDesktopLayout(window.innerWidth > 900)
      if (!mobile) setSidebarOpen(true)
      if (mobile || stacked) setLayersPanelCollapsed(false)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onRootTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!isMobileDrawerViewport) return
    const t = e.touches[0]
    if (!t) return
    swipeStartRef.current = { x: t.clientX, y: t.clientY }
  }

  const onRootTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!isMobileDrawerViewport || !swipeStartRef.current) return
    const t = e.changedTouches[0]
    if (!t) return
    const start = swipeStartRef.current
    swipeStartRef.current = null
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    if (dx > 0 && !sidebarOpen && start.x <= 28) setSidebarOpen(true)
    if (dx < 0 && sidebarOpen) setSidebarOpen(false)
  }

  const shouldRenderSidebar = sidebarOpen || isMobileDrawerViewport

  const mapToolPanelTitle = (t: NonNullable<GisMapToolPanel>): string => {
    switch (t) {
      case 'basemap':
        return 'Basemap'
      case 'legend':
        return 'Legend'
      case 'chart':
        return 'Charts'
      case 'print':
        return 'Print'
      case 'measure':
        return 'Measure'
      case 'search':
        return 'Search'
      case 'table':
        return 'Tables'
      case 'bookmarks':
        return 'Bookmarks'
      case 'saveOpen':
        return 'Save and open'
      case 'settings':
        return 'Map properties'
      case 'apps':
        return 'Create app'
      case 'embedMap':
        return 'Embed map'
      case 'shareMap':
        return 'Share map'
      case 'geoExplorer':
        return 'Geo AI chat'
      default:
        return 'Tools'
    }
  }

  const layersRailCollapsed = layersPanelCollapsed && !isMobileDrawerViewport
  /** Narrow 56px “collapsed layers” chrome — only when not split desktop; never hide AgOL rail toolbar. */
  const layersChromeCollapsed = Boolean(layersRailCollapsed && !isSplitDesktopLayout)
  const showDesktopGisRail = !isMobileDrawerViewport && isSplitDesktopLayout

  /** Collapse only the white action column; keep `gis-sidebar-v-toolbar` rail and optional active tool state. */
  const closeAgolActionPane = () => {
    if (!showDesktopGisRail) return
    setAgolContentColumnOpen(false)
    setLayersPaneView('layers')
    setLayersEmptyAddMenuOpen(false)
    setTablesAddMenuOpen(false)
    setActiveMapTool(null)
  }

  const focusLayersPanel = () => {
    if (
      agolContentColumnOpen &&
      activeMapTool === null &&
      layersPaneView === 'layers'
    ) {
      closeAgolActionPane()
      return
    }
    setLayersPanelCollapsed(false)
    setActiveMapTool(null)
    setAgolContentColumnOpen(true)
    setLayersPaneView('layers')
    setPortalBrowseStatus(null)
  }

  const isMapRailToolActive = (tool: NonNullable<GisMapToolPanel>) =>
    tool === 'saveOpen'
      ? activeMapTool === 'saveOpen'
      : agolContentColumnOpen && activeMapTool === tool

  const isMapRailLayersActive =
    agolContentColumnOpen && activeMapTool === null && layersPaneView !== 'browse'

  const dockMapToolInSidebar = Boolean(
    showDesktopGisRail &&
      agolContentColumnOpen &&
      activeMapTool &&
      activeMapTool !== 'geoExplorer' &&
      activeMapTool !== 'saveOpen',
  )
  const mapToolPanelRichSurface =
    activeMapTool === 'chart' ||
    activeMapTool === 'bookmarks' ||
    activeMapTool === 'shareMap' ||
    activeMapTool === 'apps'

  const onGeoAiTableMapAction = useCallback(
    (action: 'zoom' | 'highlight' | 'focus' | 'openTable', link: GeoExplorerMapLink) => {
      if (link.type === 'feature') {
        if (action === 'openTable' || action === 'focus') {
          const feature = featureByKeyByLayerRef.current.get(link.layerId)?.get(link.featureKey)
          const layer = layers.find(l => String(l.id) === link.layerId && l.type === 'geojson')
          if (feature && layer) {
            openAttributeTableForFeature(layer, feature)
            return
          }
          setSelectedFeatureKeys(new Set([link.featureKey]))
          showFeatureSelectionOnMap(link.layerId, link.featureKey, { zoom: true })
          return
        }
        setSelectedFeatureKeys(new Set([link.featureKey]))
        showFeatureSelectionOnMap(link.layerId, link.featureKey, { zoom: action === 'zoom' })
      } else {
        flyGisMapToLngLat(link.lng, link.lat, action === 'zoom' || action === 'focus' || action === 'openTable' ? 16 : 14)
      }
    },
    [layers, flyGisMapToLngLat, showFeatureSelectionOnMap, openAttributeTableForFeature],
  )

  const geoExplorerToolBody = (
    <div className="gis-geo-explorer-root">
      <div className="gis-geo-explorer">
        <div className="gis-geo-explorer-header">
          <h2 className="gis-geo-explorer-title">Geo Explorer</h2>
          <div className="gis-geo-explorer-header-actions">
            <button
              type="button"
              className="gis-geo-explorer-icon-btn"
              onClick={() => setGeoAiSmartSuggestionsEnabled(v => !v)}
              aria-label={geoAiSmartSuggestionsEnabled ? 'Disable smart suggestions' : 'Enable smart suggestions'}
              title={geoAiSmartSuggestionsEnabled ? 'Smart Suggestions: on' : 'Smart Suggestions: off'}
            >
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="gis-geo-explorer-icon-btn"
              onClick={clearGeoExplorerChat}
              aria-label="Clear chat"
              title="Clear chat"
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="gis-geo-explorer-icon-btn"
              onClick={() => setActiveMapTool(null)}
              aria-label="Close Geo Explorer"
              title="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>
        <GisGeoExplorerChartConfig
          config={gisChartPanelConfig}
          onChange={setGisChartPanelConfig}
          onOpenCharts={() => setActiveMapTool('chart')}
        />
        <div className="gis-geo-explorer-messages" ref={geoExplorerMessagesRef} onScroll={onGeoExplorerMessagesScroll}>
          {geoExplorerHasOlderMessages ? (
            <button
              type="button"
              className="gis-geo-explorer-load-more"
              onClick={loadOlderGeoExplorerMessages}
              aria-label="Load older messages"
            >
              Load earlier messages
            </button>
          ) : null}
          <div className="gis-geo-explorer-row gis-geo-explorer-row--model">
            <div className="gis-geo-explorer-avatar" aria-hidden>
              <i className="fa-solid fa-globe" />
            </div>
            <div className="gis-geo-explorer-bubble">
              <p className="gis-geo-explorer-bubble-text">
                Hello! Im Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions. When a location is
                clear, the map will fly there
              </p>
            </div>
          </div>
          {visibleGeoExplorerMessages.map(msg => (
            <div key={msg.id} className={`gis-geo-explorer-row gis-geo-explorer-row--${msg.role}`}>
              {msg.role === 'model' ? (
                <div className="gis-geo-explorer-avatar" aria-hidden>
                  <i className="fa-solid fa-wand-magic-sparkles" />
                </div>
              ) : null}
              <div className="gis-geo-explorer-bubble">
                <GeoExplorerGeminiMessageParts
                  msg={msg}
                  cssPrefix="gis-geo-explorer"
                  onTableMapAction={onGeoAiTableMapAction}
                  onSaveEditedUserMessage={saveEditedGeoExplorerGeminiQuestion}
                  onSendEditedToComposer={setGeoExplorerDraft}
                  suggestLayers={geoAiSuggestContext.layers}
                  suggestFields={geoAiSuggestContext.fields}
                  suggestNumericFields={geoAiSuggestContext.numericFields}
                />
              </div>
            </div>
          ))}
          {geoExplorerBusy ? (
            <div className="gis-geo-explorer-row gis-geo-explorer-row--model">
              <div className="gis-geo-explorer-avatar" aria-hidden>
                <i className="fa-solid fa-wand-magic-sparkles" />
              </div>
              <div className="gis-geo-explorer-bubble gis-geo-explorer-bubble--typing">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden />{' '}
                {geoExplorerAwaitKind === 'edit' ? 'Updating…' : 'Thinking…'}
              </div>
            </div>
          ) : null}
        </div>
        {geoExplorerChatError ? (
          <div className="gis-geo-explorer-error-row">
            <p className="gis-geo-explorer-error">{geoExplorerChatError}</p>
            <SiCopyTextButton
              text={geoExplorerChatError}
              className="gis-geo-explorer-error-copy-btn"
              title="Copy error message"
              ariaLabel="Copy error text"
              variant="compact"
            />
          </div>
        ) : null}
        {geoExplorerPendingImage ? (
          <p className="gis-geo-explorer-pending-img">
            <i className="fa-solid fa-image" aria-hidden /> Image ready to send
            <button type="button" className="gis-geo-explorer-linkish" onClick={() => setGeoExplorerPendingImage(null)}>
              Remove
            </button>
          </p>
        ) : null}
        <GeoExplorerGeminiInputRow
          cssPrefix="gis-geo-explorer"
          draft={geoExplorerDraft}
          onDraftChange={setGeoExplorerDraft}
          onSend={sendGeoExplorerChat}
          busy={geoExplorerBusy}
          pendingImage={geoExplorerPendingImage}
          fileInputRef={geoExplorerFileInputRef}
          onAttachChange={onGeoExplorerAttachChange}
          textareaAriaLabel="Geo Explorer message"
          availableLayers={geoAiSuggestContext.layers}
          availableFields={geoAiSuggestContext.fields}
          availableNumericFields={geoAiSuggestContext.numericFields}
          availableGeometryOps={geoAiSuggestContext.geometryOps}
          smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
        />
        <p className="gis-geo-explorer-footnote">
          Powered by Google Gemini. Set <code>VITE_GEMINI_API_KEY</code> or save under System Settings → API Tokens → Gemini
          API. Do not commit keys.
        </p>
      </div>
    </div>
  )

  const geoExplorerFloatingEl =
    activeMapTool === 'geoExplorer' && geoExplorerPopoverLayout ? (
      <div
        className="gis-geo-explorer-popover"
        ref={geoExplorerPopoverRef}
        style={{
          top: geoExplorerPopoverLayout.top,
          left: geoExplorerPopoverLayout.left,
          width: geoExplorerPopoverLayout.width,
          maxHeight: geoExplorerPopoverLayout.maxHeight,
        }}
        role="dialog"
        aria-label="Geo AI chat"
      >
        <div className="gis-map-tool-panel gis-map-tool-panel--geo-explorer">{geoExplorerToolBody}</div>
      </div>
    ) : null

  const renderLayerLegendCardInner = (layer: LayerData): ReactNode => {
    if (layer.type === 'tile' && (layer.data as { esriImageServer?: boolean })?.esriImageServer) {
      return (
        <div className="gis-style-card gis-style-card-legend">
          <p className="gis-style-info" style={{ margin: 0 }}>
            Image service — symbology is drawn in the map image.
          </p>
        </div>
      )
    }

    const ctx = symbologyContexts.get(String(layer.id))
    const geometryKindRaw = ctx?.geometryKind ?? getLayerGeometryKind(layer.data)
    const geometryKind: 'point' | 'line' | 'polygon' =
      geometryKindRaw === 'point' ? 'point' : geometryKindRaw === 'polygon' ? 'polygon' : 'line'
    const renderer = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
    /** Prefer ArcGIS renderer when present; allow layers without a local symbology ctx (still ArcGIS-backed). */
    const showArcGis = Boolean(layer.source === 'arcgis' && renderer && (!ctx || ctx.cfg.useArcGisOnline))
    const baseStroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseFill = layer.fillColor || layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
    const baseWeight = layer.weight ?? SI_DEFAULT_VECTOR_LINE_WEIGHT

    const renderArcGisSwatch = (symbol: any) => {
      const res = arcGisSymbolToLeaflet(symbol, geometryKind, layer.opacity, baseStroke, baseFill)
      if (geometryKind === 'point' && res.point) {
        if (res.point.kind === 'icon') {
          const iconUrl = resolveArcGisSymbolUrl(layer, res.point.url)
          return (
            <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
              <image href={iconUrl} x="22" y="1" width="18" height="12" preserveAspectRatio="xMidYMid meet" />
            </svg>
          )
        }
        const o = res.point.options as any
        const stroke = typeof o?.color === 'string' ? o.color : baseStroke
        const fill = typeof o?.fillColor === 'string' ? o.fillColor : baseFill
        const width = typeof o?.weight === 'number' && Number.isFinite(o.weight) ? Math.max(1, o.weight) : baseWeight
        return (
          <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
            <circle cx="31" cy="7" r="5" fill={fill} stroke={stroke} strokeWidth={Math.min(4, width)} />
          </svg>
        )
      }

      const p = res.path as any
      const stroke = typeof p?.color === 'string' ? p.color : baseStroke
      const width = typeof p?.weight === 'number' && Number.isFinite(p.weight) ? Math.max(1, p.weight) : baseWeight
      const dash = typeof p?.dashArray === 'string' && p.dashArray ? p.dashArray : undefined
      const fill = typeof p?.fillColor === 'string' ? p.fillColor : baseFill

      if (geometryKind === 'polygon') {
        return (
          <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
            <rect x="18" y="2" width="26" height="10" rx="3" fill={fill} stroke={stroke} strokeWidth={Math.min(4, width)} />
          </svg>
        )
      }

      return (
        <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
          <line
            x1="4"
            y1="7"
            x2="58"
            y2="7"
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </svg>
      )
    }

    const renderCustomSwatch = (it: {
      label: string
      kind: 'line' | 'point' | 'polygon'
      color: string
      width: number
      dash?: string
      fill?: string
    }) => (
      <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
        {it.kind === 'line' ? (
          <line
            x1="4"
            y1="7"
            x2="58"
            y2="7"
            stroke={it.color}
            strokeWidth={it.width}
            strokeLinecap="round"
            strokeDasharray={it.dash || undefined}
          />
        ) : it.kind === 'polygon' ? (
          <rect x="18" y="2" width="26" height="10" rx="3" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
        ) : (
          <circle cx="31" cy="7" r="5" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
        )}
      </svg>
    )

    if (showArcGis) {
      const entries = buildArcGisLegendEntries(renderer, 48)
      if (!entries.length) return <div className="gis-style-info">No legend entries found for this layer.</div>
      return (
        <div className="gis-style-card gis-style-card-legend">
          <div className="gis-style-legend">
            {entries.map((it, idx) => (
              <div key={idx} className="gis-style-legend-row">
                {renderArcGisSwatch(it.symbol)}
                <div className="gis-style-legend-text">{it.label}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    const items = (() => {
      const out: Array<{ label: string; kind: 'line' | 'point' | 'polygon'; color: string; width: number; dash?: string; fill?: string }> = []
      if (!ctx) return out
      const kind: 'line' | 'point' | 'polygon' = geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line'
      if (ctx.cfg.style === 'unique') {
        if (kind === 'line') {
          const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.uniqueDashes)
          vals.slice(0, 12).forEach(val => {
            out.push({ label: val, kind, color: baseStroke, width: baseWeight, dash: ctx.uniqueDashes[val] ?? '' })
          })
          if (vals.length === 0) out.push({ label: 'No values', kind, color: baseStroke, width: baseWeight })
          return out
        }
        const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors)
        vals.slice(0, 12).forEach(val => {
          const fill = ctx.categoryColors[val] ?? ctx.otherColor
          out.push({ label: val, kind, color: darkenColor(fill, 0.25), width: baseWeight, fill })
        })
        if (vals.length === 0) out.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke })
        return out
      }
      if (ctx.cfg.style === 'threshold_markers') {
        out.push({ label: 'Base', kind, color: baseStroke, width: baseWeight })
        out.push({ label: `Marker ≥ ${ctx.threshold.toFixed(2)}`, kind: 'point', color: '#ef4444', width: 4, fill: '#ef4444' })
        return out
      }
      const breaks = ctx.breaks
      const classes = clampInt(ctx.cfg.classes, 2, 12)
      const showColor = ctx.cfg.style === 'color' || ctx.cfg.style === 'color_size'
      const showSize = ctx.cfg.style === 'size' || ctx.cfg.style === 'color_size'
      for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
        const a = breaks[i]
        const b = breaks[i + 1]
        const label = `${a.toFixed(2)} – ${b.toFixed(2)}`
        const color = showColor ? ctx.colors[i] ?? baseStroke : baseStroke
        const width = showSize ? ctx.widths[i] ?? baseWeight : baseWeight
        const dash = ctx.cfg.style === 'dot_density' ? ctx.dotDashes[i] : undefined
        if (kind === 'polygon') {
          const fill = showColor ? color : baseStroke
          out.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill })
        } else if (kind === 'point') {
          const fill = showColor ? color : baseStroke
          out.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill })
        } else {
          out.push({ label, kind, color, width, dash })
        }
      }
      return out
    })()

    if (!items.length) return <div className="gis-style-info">No legend available for this layer.</div>
    return (
      <div className="gis-style-card gis-style-card-legend">
        <div className="gis-style-legend">
          {items.map((it, idx) => (
            <div key={idx} className="gis-style-legend-row">
              {renderCustomSwatch(it)}
              <div className="gis-style-legend-text">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const mapToolPanelEl = activeMapTool && activeMapTool !== 'geoExplorer' && activeMapTool !== 'saveOpen' ? (
      <div
        className={
          [
            'gis-map-tool-panel',
            dockMapToolInSidebar ? 'gis-map-tool-panel--embed-in-action-pane' : '',
            mapToolPanelRichSurface ? 'gis-map-tool-panel--rich-surface' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        role="dialog"
        aria-label={`${activeMapTool} tools`}
      >
        <div className="gis-map-tool-panel-head">
          <div className="gis-map-tool-panel-title">{mapToolPanelTitle(activeMapTool)}</div>
          <button className="gis-map-tool-close" type="button" onClick={() => setActiveMapTool(null)} aria-label="Close tool panel">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {activeMapTool === 'basemap' ? (
          <BasemapGallery selectedBasemap={selectedBasemap} onSelectBasemap={setSelectedBasemap} />
        ) : activeMapTool === 'legend' ? (
          <div className="gis-legend-classic-tool" role="region" aria-label="Map legend">
            {orderedLayers.filter(l => l.visible).length === 0 ? (
              <div className="gis-tool-empty">No visible layers to show in the legend.</div>
            ) : (
              <div className="gis-legend-classic-tool__scroll">
                {orderedLayers
                  .filter(l => l.visible)
                  .map(layer => {
                    const renderer = layer.arcgisRenderer ?? layer.arcgisLayerDefinition?.drawingInfo?.renderer
                    const fieldHint = arcgisRendererFieldHint(renderer)
                    return (
                      <section key={String(layer.id)} className="gis-legend-classic-tool__layer" aria-labelledby={`gis-legend-layer-${layer.id}`}>
                        <header className="gis-legend-classic-tool__layer-head">
                          <h3 className="gis-legend-classic-tool__layer-title" id={`gis-legend-layer-${layer.id}`}>
                            {layer.name}
                          </h3>
                          {fieldHint ? (
                            <div className="gis-legend-classic-tool__layer-field">{fieldHint}</div>
                          ) : null}
                        </header>
                        {renderLayerLegendCardInner(layer)}
                      </section>
                    )
                  })}
              </div>
            )}
          </div>
        ) : activeMapTool === 'chart' ? (
          <div
            className={`gis-tool-chart gis-map-tool-surface${
              gisChartPanelConfig.viz === 'donut' ? ' gis-map-tool-surface--chart-donut' : ''
            }`}
          >
            <div className="gis-map-tool-surface__header">
              <div className="gis-map-tool-surface__icon" aria-hidden="true">
                <i className="fa-solid fa-chart-simple" />
              </div>
              <div className="gis-map-tool-surface__titles">
                <span className="gis-map-tool-surface__kicker">Layer summary</span>
                <p className="gis-map-tool-surface__lede">
                  Relative feature counts per vector layer. Image services are shown with zero features. Adjust sort and
                  chart type in <strong>Geo AI chat</strong> → Configure chart.
                </p>
              </div>
            </div>
            {chartPanelLayerRows.length ? (
              gisChartPanelConfig.viz === 'donut' ? (
                <div className="gis-map-tool-chart-donut-layout">
                  <div
                    className="gis-map-tool-chart-donut-ring"
                    style={{ background: gisChartDonutConicBackground(chartPanelLayerRows) }}
                    role="img"
                    aria-label="Layer feature count proportions"
                  >
                    <div className="gis-map-tool-chart-donut-hole" />
                  </div>
                  <ul className="gis-map-tool-chart-donut-legend">
                    {chartPanelLayerRows.map(({ layer, count, color }) => (
                      <li key={String(layer.id)} className="gis-map-tool-chart-donut-legend__row">
                        <span className="gis-map-tool-chart-donut-legend__swatch" style={{ background: color }} aria-hidden />
                        <span className="gis-map-tool-chart-donut-legend__name" title={layer.name}>
                          {layer.name}
                        </span>
                        <strong className="gis-map-tool-chart-donut-legend__count">{count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="gis-map-tool-surface__scroll">
                  <div
                    className={`gis-map-tool-surface__list${
                      gisChartPanelConfig.layout === 'vertical' ? ' gis-map-tool-surface__list--chart-vertical' : ''
                    }`}
                  >
                    {(() => {
                      const max = Math.max(1, ...chartPanelLayerRows.map(r => r.count))
                      return chartPanelLayerRows.map(({ layer, count, color }) => (
                        <div
                          key={String(layer.id)}
                          className={`gis-map-tool-surface-chart-row${
                            gisChartPanelConfig.layout === 'vertical'
                              ? ' gis-map-tool-surface-chart-row--bars-vertical'
                              : ''
                          }`}
                        >
                          <div className="gis-map-tool-surface-chart-row__top">
                            <span
                              className="gis-map-tool-surface-chart-row__dot"
                              style={{ background: color }}
                              aria-hidden="true"
                            />
                            <div className="gis-tool-chart-label">
                              <span title={layer.name}>{layer.name}</span>
                              <strong>{count}</strong>
                            </div>
                          </div>
                          <div className="gis-tool-chart-track">
                            <span
                              style={
                                gisChartPanelConfig.layout === 'vertical'
                                  ? {
                                      height: `${Math.max(8, (count / max) * 100)}%`,
                                      background: color,
                                    }
                                  : {
                                      width: `${Math.max(6, (count / max) * 100)}%`,
                                      background: color,
                                    }
                              }
                            />
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )
            ) : (
              <div className="gis-map-tool-surface-empty" role="status">
                <div className="gis-map-tool-surface-empty__icon" aria-hidden="true">
                  <i className="fa-solid fa-chart-simple" />
                </div>
                <p className="gis-map-tool-surface-empty__message">Add layers to the map to see feature count charts.</p>
              </div>
            )}
          </div>
        ) : activeMapTool === 'measure' ? (
          <div className="gis-tool-measure">
            <div className="gis-measure-tool-list" role="listbox" aria-label="Measurement tool type">
              {MEASUREMENT_TOOLS.map(tool => (
                <button
                  key={tool.id}
                  className={measurementMode === tool.id ? 'gis-measure-tool-option active' : 'gis-measure-tool-option'}
                  type="button"
                  role="option"
                  aria-selected={measurementMode === tool.id}
                  disabled={tool.disabled}
                  onClick={() => {
                    setMeasurementMode(tool.id)
                    clearMeasurement()
                  }}
                  title={tool.disabled ? `${tool.label} is unavailable in 2D GIS mode` : tool.label}
                >
                  <span className="gis-measure-tool-icon" aria-hidden="true">
                    <i className={tool.icon} />
                  </span>
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
            <div className="gis-measure-settings" aria-label="Measurement settings">
              <label className="gis-measure-setting">
                <span className="gis-measure-setting-icon" aria-hidden="true">
                  <i className="fa-solid fa-ruler" />
                </span>
                <select
                  value={measurementMethod}
                  onChange={(e) => {
                    setMeasurementMethod(e.target.value as MeasurementMethod)
                    clearMeasurement()
                  }}
                  aria-label="Measurement method"
                >
                  {MEASUREMENT_METHODS.map(method => (
                    <option key={method.id} value={method.id}>{method.label}</option>
                  ))}
                </select>
              </label>
              <label className="gis-measure-setting">
                <span className="gis-measure-setting-label">Units</span>
                <select
                  value={measurementUnit}
                  onChange={(e) => setMeasurementUnit(e.target.value as MeasurementUnit)}
                  aria-label="Measurement units"
                >
                  {MEASUREMENT_UNITS.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="gis-tool-measure-value">{measurementDisplay}</div>
            {(measurementMode === 'area' || measurementMode === 'features') &&
            !measurementSketch.closed &&
            measurementSketch.points.length >= 3 ? (
              <button
                className="gis-btn"
                type="button"
                onClick={() => setMeasurementSketch(prev => ({ points: prev.points, closed: prev.points.length >= 3 }))}
              >
                Finish shape
              </button>
            ) : null}
            <div className="gis-tool-muted">{measurementFooterHint}</div>
            <button className="gis-btn" type="button" onClick={clearMeasurement}>Clear measurement</button>
          </div>
        ) : activeMapTool === 'search' ? (
          <div className="gis-tool-search">
            <div className="gis-tool-search-row">
              <input
                className="gis-input"
                value={mapSearchQuery}
                onChange={(e) => setMapSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleMapSearch()
                  }
                }}
                placeholder="Search place or coordinates..."
                aria-label="Search map"
              />
              <button className="gis-btn gis-btn-primary" type="button" onClick={() => void handleMapSearch()}>
                Search
              </button>
            </div>
            {mapSearchStatus ? <div className="gis-tool-muted">{mapSearchStatus}</div> : null}
          </div>
        ) : activeMapTool === 'table' ? (
          <div className="gis-tool-table-picker">
            {tableCapableLayers.length === 0 ? (
              <div className="gis-tables-agol-empty">
                <div className="gis-tables-agol-empty__icon" aria-hidden="true">
                  <i className="fa-solid fa-table" />
                </div>
                <div className="gis-tables-agol-empty__message">
                  Add tables to your map and they will appear here.
                </div>
                <div className="gis-tables-agol-add" ref={tablesAddMenuRef}>
                  <button
                    type="button"
                    className="gis-tables-agol-add__btn"
                    aria-haspopup="menu"
                    aria-expanded={tablesAddMenuOpen}
                    onClick={() => setTablesAddMenuOpen(v => !v)}
                  >
                    <i className="fa-solid fa-table" aria-hidden="true" />
                    <span>Add</span>
                    <span className="gis-tables-agol-add__btn-divider" aria-hidden="true" />
                    <i className={`fa-solid fa-chevron-down${tablesAddMenuOpen ? ' gis-tables-agol-add__chev--open' : ''}`} aria-hidden="true" />
                  </button>
                  {tablesAddMenuOpen ? (
                    <div className="gis-tables-agol-add__menu" role="menu">
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setTablesAddMenuOpen(false)
                          openBrowseLayersPane()
                        }}
                      >
                        <i className="fa-solid fa-layer-group" aria-hidden="true" />
                        <span>From GIS Content</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setTablesAddMenuOpen(false)
                          openAddLayerModal('arcgis')
                        }}
                      >
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                        <span>Browse tables</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setTablesAddMenuOpen(false)
                          openAddLayerModal('url')
                        }}
                      >
                        <i className="fa-solid fa-globe" aria-hidden="true" />
                        <span>Add from URL</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="gis-tables-agol-empty gis-tables-agol-empty--compact">
                  <div className="gis-tables-agol-empty__icon gis-tables-agol-empty__icon--sm" aria-hidden="true">
                    <i className="fa-solid fa-table" />
                  </div>
                  <div className="gis-tables-agol-empty__message gis-tables-agol-empty__message--inline">
                    Add tables to your map and they will appear here.
                  </div>
                  <div className="gis-tables-agol-add" ref={tablesAddMenuRef}>
                    <button
                      type="button"
                      className="gis-tables-agol-add__btn"
                      aria-haspopup="menu"
                      aria-expanded={tablesAddMenuOpen}
                      onClick={() => setTablesAddMenuOpen(v => !v)}
                    >
                      <i className="fa-solid fa-table" aria-hidden="true" />
                      <span>Add</span>
                      <span className="gis-tables-agol-add__btn-divider" aria-hidden="true" />
                      <i className={`fa-solid fa-chevron-down${tablesAddMenuOpen ? ' gis-tables-agol-add__chev--open' : ''}`} aria-hidden="true" />
                    </button>
                    {tablesAddMenuOpen ? (
                      <div className="gis-tables-agol-add__menu" role="menu">
                        <button
                          type="button"
                          className="gis-tables-agol-add__menu-item"
                          role="menuitem"
                          onClick={() => {
                            setTablesAddMenuOpen(false)
                            openBrowseLayersPane()
                          }}
                        >
                          <i className="fa-solid fa-layer-group" aria-hidden="true" />
                          <span>From GIS Content</span>
                        </button>
                        <button
                          type="button"
                          className="gis-tables-agol-add__menu-item"
                          role="menuitem"
                          onClick={() => {
                            setTablesAddMenuOpen(false)
                            openAddLayerModal('arcgis')
                          }}
                        >
                          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                          <span>Browse tables</span>
                        </button>
                        <button
                          type="button"
                          className="gis-tables-agol-add__menu-item"
                          role="menuitem"
                          onClick={() => {
                            setTablesAddMenuOpen(false)
                            openAddLayerModal('url')
                          }}
                        >
                          <i className="fa-solid fa-globe" aria-hidden="true" />
                          <span>Add from URL</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="gis-tables-agol-caption">Choose a layer to open its attribute table in the dock below.</p>
                <div className="gis-tool-list gis-tables-agol-layer-list">
                  {tableCapableLayers.map(layer => {
                    const fc = (layer.data as any)?.features
                    const n = Array.isArray(fc) ? fc.length : 0
                    return (
                      <button
                        key={String(layer.id)}
                        type="button"
                        className="gis-tables-agol-layer-row"
                        onClick={() => {
                          setTablesAddMenuOpen(false)
                          setActiveMapTool(null)
                          setTableDockCollapsed(false)
                          setTableDockMinimized(false)
                          setLayerDialog({ mode: 'table', layerId: String(layer.id) })
                        }}
                      >
                        <span className="gis-tables-agol-layer-row__dot" style={{ background: layer.color || '#22c55e' }} aria-hidden="true" />
                        <span className="gis-tables-agol-layer-row__main">
                          <strong>{layer.name}</strong>
                          <small>
                            {n} record{n === 1 ? '' : 's'} · attribute table
                          </small>
                        </span>
                        <i className="fa-solid fa-table-cells gis-tables-agol-layer-row__icon" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        ) : activeMapTool === 'bookmarks' ? (
          <div className="gis-tool-bookmarks gis-map-tool-surface">
            <div className="gis-map-tool-surface__header">
              <div className="gis-map-tool-surface__icon" aria-hidden="true">
                <i className="fa-solid fa-bookmark" />
              </div>
              <div className="gis-map-tool-surface__titles">
                <span className="gis-map-tool-surface__kicker">Saved views</span>
                <p className="gis-map-tool-surface__lede">
                  Capture the current extent and basemap context, then jump back with one tap—same flow as picking a
                  table from the Tables tool.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="gis-map-tool-surface__primary"
              onClick={() => {
                void (async () => {
                  const v = captureViewForBookmark()
                  if (!v) return
                  const name = await appPrompt('Enter a name for this bookmark.', 'My place', { title: 'Bookmark' })
                  if (name === null || !String(name).trim()) return
                  const row: GisMapBookmark = { id: `${Date.now()}`, name: String(name).trim(), ...v }
                  setGisBookmarks(prev => [row, ...prev].slice(0, 40))
                })()
              }}
            >
              <i className="fa-solid fa-camera" aria-hidden="true" />
              <span>Save current extent</span>
            </button>
            {gisBookmarks.length ? (
              <div className="gis-map-tool-surface__scroll">
                <ul className="gis-map-tool-surface__list gis-bookmark-list">
                  {gisBookmarks.map(b => (
                    <li key={b.id} className="gis-bookmark-list__item">
                      <button type="button" className="gis-bookmark-list__go" onClick={() => applyBookmark(b)}>
                        <i className="fa-solid fa-location-dot gis-bookmark-list__go-icon" aria-hidden="true" />
                        <span className="gis-bookmark-list__go-text">{b.name}</span>
                      </button>
                      <button
                        type="button"
                        className="gis-bookmark-list__del"
                        aria-label={`Remove bookmark ${b.name}`}
                        onClick={() => setGisBookmarks(p => p.filter(x => x.id !== b.id))}
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="gis-map-tool-surface-empty gis-map-tool-surface-empty--compact" role="status">
                <p className="gis-map-tool-surface-empty__message">No bookmarks yet. Save an extent to build your list.</p>
              </div>
            )}
          </div>
        ) : activeMapTool === 'settings' ? (
          <div className="gis-tool-settings">
            <p className="gis-tool-muted">Map projection</p>
            <div className="gis-map-projection-toggle gis-map-projection-toggle--vertical" aria-label="Map projection mode">
              <button
                className={mapProjectionMode === '2d' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
                type="button"
                onClick={() => changeProjectionMode('2d')}
                title="2D map (F)"
                aria-label="Switch to 2D map projection. Shortcut F"
                aria-pressed={mapProjectionMode === '2d'}
              >
                <i className="fa-solid fa-map-location-dot" aria-hidden="true" />
              </button>
              <button
                className={mapProjectionMode === 'globe' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
                type="button"
                onClick={() => changeProjectionMode('globe')}
                title="3D Globe (G)"
                aria-label="Switch to 3D Globe projection. Shortcut G"
                aria-pressed={mapProjectionMode === 'globe'}
              >
                <i className="fa-solid fa-globe" aria-hidden="true" />
              </button>
            </div>
            <p className="gis-tool-muted" style={{ marginTop: 12 }}>
              Workspace configuration (themes, API tokens, navigation) lives in system settings.
            </p>
            <a className="gis-btn" href="/admin/system-settings" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>
              Open system settings
            </a>
          </div>
        ) : activeMapTool === 'apps' ? (
          <div className="gis-tool-apps gis-map-tool-surface">
            <div className="gis-map-tool-surface__header">
              <div className="gis-map-tool-surface__icon" aria-hidden="true">
                <i className="fa-solid fa-grid-2" />
              </div>
              <div className="gis-map-tool-surface__titles">
                <span className="gis-map-tool-surface__kicker">Workspace</span>
                <p className="gis-map-tool-surface__lede">Open other Agro Cloud modules without leaving the map context.</p>
              </div>
            </div>
            <div className="gis-map-tool-surface__list gis-map-tool-surface-app-links">
              <a className="gis-map-tool-surface-app-row" href="/">
                <span className="gis-map-tool-surface-app-row__icon" aria-hidden="true">
                  <i className="fa-solid fa-house" />
                </span>
                <span className="gis-map-tool-surface-app-row__main">
                  <strong>Home</strong>
                  <small>Landing &amp; navigation</small>
                </span>
                <i className="fa-solid fa-chevron-right gis-map-tool-surface-app-row__chev" aria-hidden="true" />
              </a>
              <a className="gis-map-tool-surface-app-row" href="/satellite/indices">
                <span className="gis-map-tool-surface-app-row__icon" aria-hidden="true">
                  <i className="fa-solid fa-satellite" />
                </span>
                <span className="gis-map-tool-surface-app-row__main">
                  <strong>Satellite Intelligence</strong>
                  <small>Indices &amp; imagery workflows</small>
                </span>
                <i className="fa-solid fa-chevron-right gis-map-tool-surface-app-row__chev" aria-hidden="true" />
              </a>
              <a className="gis-map-tool-surface-app-row" href="/satellite/gis">
                <span className="gis-map-tool-surface-app-row__icon" aria-hidden="true">
                  <i className="fa-solid fa-map-location-dot" />
                </span>
                <span className="gis-map-tool-surface-app-row__main">
                  <strong>GIS Map</strong>
                  <small>This page</small>
                </span>
                <i className="fa-solid fa-chevron-right gis-map-tool-surface-app-row__chev" aria-hidden="true" />
              </a>
              <a className="gis-map-tool-surface-app-row" href="/master/gis-content">
                <span className="gis-map-tool-surface-app-row__icon" aria-hidden="true">
                  <i className="fa-solid fa-layer-group" />
                </span>
                <span className="gis-map-tool-surface-app-row__main">
                  <strong>GIS Content</strong>
                  <small>Catalog &amp; published layers</small>
                </span>
                <i className="fa-solid fa-chevron-right gis-map-tool-surface-app-row__chev" aria-hidden="true" />
              </a>
              <a className="gis-map-tool-surface-app-row" href="/admin/system-settings">
                <span className="gis-map-tool-surface-app-row__icon" aria-hidden="true">
                  <i className="fa-solid fa-gear" />
                </span>
                <span className="gis-map-tool-surface-app-row__main">
                  <strong>System settings</strong>
                  <small>Tokens, theme, APIs</small>
                </span>
                <i className="fa-solid fa-chevron-right gis-map-tool-surface-app-row__chev" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : activeMapTool === 'shareMap' ? (
          <div className="gis-tool-share gis-map-tool-surface">
            <div className="gis-map-tool-surface__header">
              <div className="gis-map-tool-surface__icon" aria-hidden="true">
                <i className="fa-solid fa-link" />
              </div>
              <div className="gis-map-tool-surface__titles">
                <span className="gis-map-tool-surface__kicker">Share</span>
                <p className="gis-map-tool-surface__lede">
                  Copy the full URL of this map (same origin). Recipients see the same app route; layer state follows your
                  app persistence rules.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="gis-map-tool-surface__primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  setSelectionNotice('Map link copied to clipboard.')
                } catch {
                  setSelectionNotice('Could not copy link.')
                }
              }}
            >
              <i className="fa-solid fa-copy" aria-hidden="true" />
              <span>Copy map link</span>
            </button>
            <p className="gis-map-tool-surface__footnote">
              <i className="fa-solid fa-circle-info" aria-hidden="true" /> For iframe embedding, use{' '}
              <button type="button" className="gis-map-tool-surface__linkish" onClick={() => setActiveMapTool('embedMap')}>
                Embed map
              </button>{' '}
              in the toolbar.
            </p>
          </div>
        ) : activeMapTool === 'embedMap' ? (
          <div className="gis-tool-embed">
            <p className="gis-tool-muted">
              Paste this iframe into a page that is allowed to embed this site. Width and height are starting points—adjust as needed.
            </p>
            <textarea
              className="gis-input"
              readOnly
              rows={5}
              value={`<iframe src="${typeof window !== 'undefined' ? window.location.href.split('#')[0] : ''}" width="100%" height="520" style="border:0" loading="lazy" title="GIS Map"></iframe>`}
              onFocus={e => e.currentTarget.select()}
              aria-label="Embed code"
            />
          </div>
        ) : null}
      </div>
  ) : null

  /** Same ArcGIS-style tool order as desktop rail — reused in mobile drawer (`gis-sidebar-body`). */
  const mapToolsRailGroups = (
    <>
      <div className="gis-sidebar-rail__group" role="presentation">
        <button
          type="button"
          className="gis-sidebar-rail-btn"
          onClick={() => openAddLayerModal()}
          title="Add data"
          aria-label="Add"
        >
          <i className="fa-solid fa-circle-plus" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Add</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailLayersActive ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={focusLayersPanel}
          title="Layers"
          aria-label="Layers"
        >
          <i className="fa-solid fa-layer-group" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Layers</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('table') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('table')}
          title="Tables"
          aria-label="Tables"
        >
          <i className="fa-solid fa-table-cells" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Tables</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('basemap') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('basemap')}
          title="Basemap"
          aria-label="Basemap"
        >
          <i className="fa-solid fa-border-all" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Basemap</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('legend') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('legend')}
          title="Legend"
          aria-label="Legend"
        >
          <i className="fa-solid fa-list-ul" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Legend</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('bookmarks') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('bookmarks')}
          title="Bookmarks"
          aria-label="Bookmarks"
        >
          <i className="fa-solid fa-bookmark" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Bookmarks</span>
        </button>
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('chart') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('chart')}
          title="Charts"
          aria-label="Charts"
        >
          <i className="fa-solid fa-chart-column" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Charts</span>
        </button>
      </div>
      <div className="gis-sidebar-rail__sep" aria-hidden="true" />
      <div className="gis-sidebar-rail__group" role="presentation">
        <button
          ref={saveOpenRailBtnRef}
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('saveOpen') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('saveOpen')}
          title="Save and open"
          aria-label="Save and open"
        >
          <i className="fa-solid fa-folder-open" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Save and open</span>
        </button>
      </div>
      <div className="gis-sidebar-rail__sep" aria-hidden="true" />
      <div className="gis-sidebar-rail__group" role="presentation">
        <button
          type="button"
          className={['gis-sidebar-rail-btn', isMapRailToolActive('apps') ? 'gis-sidebar-rail-btn--active' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleMapTool('apps')}
          title="Create app"
          aria-label="Create app"
        >
          <i className="fa-solid fa-grip" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Create app</span>
        </button>
        <button type="button" className="gis-sidebar-rail-btn" onClick={() => window.print()} title="Print" aria-label="Print">
          <i className="fa-solid fa-print" aria-hidden="true" />
          <span className="gis-sidebar-rail-btn__label">Print</span>
        </button>
      </div>
    </>
  )

  return (
    <div
      className={[
        sidebarOpen ? 'gis-map-page' : 'gis-map-page sidebar-closed',
        layersChromeCollapsed ? 'gis-map-page--layers-collapsed' : '',
        showDesktopGisRail ? 'gis-map-page--agol-rail' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onTouchStart={onRootTouchStart}
      onTouchEnd={onRootTouchEnd}
    >
      {isMobileDrawerViewport && sidebarOpen ? (
        <button className="gis-sidebar-drawer-backdrop" type="button" aria-label="Close GIS launcher" onClick={() => setSidebarOpen(false)} />
      ) : null}
      {shouldRenderSidebar ? (
        <aside
          className={[
            'gis-sidebar',
            isMobileDrawerViewport ? (sidebarOpen ? 'is-open' : 'is-collapsed') : '',
            layersChromeCollapsed ? 'gis-sidebar--layers-collapsed' : '',
            showDesktopGisRail ? 'gis-sidebar--has-rail' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="GIS Layers"
        >
          <div
            className={['gis-sidebar-inner', showDesktopGisRail ? 'gis-sidebar-inner--agol-action-bar gis-map-action-bar-container' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {showDesktopGisRail ? (
              <nav
                className={['gis-sidebar-rail', 'gis-sidebar-rail--agol', agolRailCompact ? 'gis-sidebar-rail--agol--compact' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Map tools (ArcGIS-style)"
              >
                <div className="gis-sidebar-v-toolbar" data-scale="m">
                  <div
                    className="gis-sidebar-v-toolbar__main"
                    data-slot="main"
                    role="toolbar"
                    aria-orientation="vertical"
                    aria-label="Map tools"
                  >
                    {mapToolsRailGroups}
                  </div>
                  <div
                    className="gis-sidebar-v-toolbar__end gis-sidebar-v-toolbar__end--overlay gis-sidebar-v-toolbar__end--agol-footer"
                    role="presentation"
                  >
                    <button
                      type="button"
                      className="gis-sidebar-rail-btn gis-sidebar-rail-btn--information"
                      onClick={() =>
                        setSelectionNotice(
                          'Agro Cloud Map Viewer — add layers, tables, and analysis tools from the toolbar. Measurement tools are on the map canvas.',
                        )
                      }
                      title="Information"
                      aria-label="Information"
                    >
                      <span className="gis-sidebar-rail-btn__icon-badge">
                        <i className="fa-solid fa-circle-info" aria-hidden="true" />
                        <span className="gis-sidebar-rail-btn__notify-dot" aria-hidden="true" />
                      </span>
                      <span className="gis-sidebar-rail-btn__label">Information</span>
                    </button>
                    <button
                      type="button"
                      className="gis-sidebar-rail-btn gis-sidebar-rail-btn--collapse-rail"
                      onClick={() => setAgolRailCompact(v => !v)}
                      title={agolRailCompact ? 'Expand toolbar' : 'Collapse toolbar'}
                      aria-label={agolRailCompact ? 'Expand toolbar' : 'Collapse toolbar'}
                      aria-expanded={!agolRailCompact}
                    >
                      <i
                        className={agolRailCompact ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'}
                        aria-hidden="true"
                      />
                      <span className="gis-sidebar-rail-btn__label">Collapse</span>
                    </button>
                  </div>
                </div>
              </nav>
            ) : null}
            {(!showDesktopGisRail || agolContentColumnOpen) ? (
            <div
              className={[
                'gis-sidebar-column',
                showDesktopGisRail ? 'gis-sidebar-column--action-pane' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {showDesktopGisRail && agolContentColumnOpen ? (
                <div className={`gis-sidebar-action-pane__head${layersPaneView === 'browse' ? ' gis-map-browse-layers-head' : ''}`}>
                  {layersPaneView === 'browse' ? (
                    <button
                      type="button"
                      className="gis-map-browse-layers-head__back"
                      aria-label="Back to Layers"
                      title="Back"
                      onClick={() => {
                        setLayersPaneView('layers')
                        setPortalBrowseStatus(null)
                      }}
                    >
                      <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                    </button>
                  ) : null}
                  <div className="gis-sidebar-action-pane__title">
                    {layersPaneView === 'browse'
                      ? 'Add layer'
                      : activeMapTool && activeMapTool !== 'geoExplorer'
                        ? mapToolPanelTitle(activeMapTool)
                        : 'Layers'}
                  </div>
                  <button
                    type="button"
                    className="gis-sidebar-action-pane__close gis-sidebar-action-pane__close--collapse"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      closeAgolActionPane()
                    }}
                    aria-label="Close Layers panel"
                    title="Close"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
          {(!showDesktopGisRail || agolContentColumnOpen) ? (
          <div
            className={[
              'gis-sidebar-body',
              showDesktopGisRail ? 'gis-sidebar-body--action-pane' : '',
              dockMapToolInSidebar ? 'gis-sidebar-body--tool-dock' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {dockMapToolInSidebar ? (
              <div
                className="gis-sidebar-content-wrapper gis-sidebar-tool-dock"
                role="region"
                aria-label={activeMapTool ? mapToolPanelTitle(activeMapTool) : undefined}
              >
                {mapToolPanelEl}
              </div>
            ) : (
              <>
            <div
              className={[
                'gis-sidebar-body-main',
                layersChromeCollapsed ? 'gis-sidebar-body-main--collapsed-rail' : '',
                isMobileDrawerViewport ? 'gis-sidebar-body-main--with-atlas-rail' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
            {isMobileDrawerViewport ? (
              <nav
                className="gis-sidebar-rail gis-sidebar-rail--agol gis-sidebar-rail--agol--compact gis-sidebar-rail--mobile-drawer"
                aria-label="Map tools (ArcGIS-style)"
              >
                <div className="gis-sidebar-v-toolbar" data-scale="m">
                  <div
                    className="gis-sidebar-v-toolbar__main"
                    role="toolbar"
                    aria-orientation="vertical"
                    aria-label="Map tools"
                  >
                    {mapToolsRailGroups}
                  </div>
                </div>
              </nav>
            ) : null}
            <div
              className={
                isMobileDrawerViewport ? 'gis-sidebar-body-main__fill' : 'gis-sidebar-body-main__fill gis-sidebar-body-main__fill--desktop'
              }
            >
            {layersPaneView === 'browse' ? (
              <GisMapBrowseLayersPane
                onAddRow={addGisPortalRowToMap}
                addingRowId={addingPortalRowId}
                statusMessage={portalBrowseStatus}
              />
            ) : !layersChromeCollapsed && layers.length === 0 ? (
            showDesktopGisRail ? (
              <div className="gis-sidebar-layers-empty-agol" role="status" aria-live="polite">
                <div className="gis-sidebar-layers-empty-agol__icon" aria-hidden="true">
                  <i className="fa-solid fa-layer-group" />
                </div>
                <div className="gis-sidebar-layers-empty-agol__message">
                  Add layers to your map and they will appear here.
                </div>
                <div className="gis-tables-agol-add" ref={layersEmptyAddMenuRef}>
                  <button
                    type="button"
                    className="gis-tables-agol-add__btn"
                    aria-haspopup="menu"
                    aria-expanded={layersEmptyAddMenuOpen}
                    onClick={() => setLayersEmptyAddMenuOpen(v => !v)}
                  >
                    <i className="fa-solid fa-layer-group" aria-hidden="true" />
                    <span>Add</span>
                    <span className="gis-tables-agol-add__btn-divider" aria-hidden="true" />
                    <i className={`fa-solid fa-chevron-down${layersEmptyAddMenuOpen ? ' gis-tables-agol-add__chev--open' : ''}`} aria-hidden="true" />
                  </button>
                  {layersEmptyAddMenuOpen ? (
                    <div className="gis-tables-agol-add__menu" role="menu">
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setLayersEmptyAddMenuOpen(false)
                          openBrowseLayersPane()
                        }}
                      >
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                        <span>Browse layers</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setLayersEmptyAddMenuOpen(false)
                          openAddLayerModal('url')
                        }}
                      >
                        <i className="fa-solid fa-globe" aria-hidden="true" />
                        <span>Add layer from URL</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setLayersEmptyAddMenuOpen(false)
                          openAddLayerModal('upload')
                        }}
                      >
                        <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
                        <span>Add layer from file</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setLayersEmptyAddMenuOpen(false)
                          setDrawingEditorOpen(true)
                          setDrawingActiveTool('polygon')
                        }}
                      >
                        <i className="fa-solid fa-pencil" aria-hidden="true" />
                        <span>Create sketch layer</span>
                      </button>
                      <button
                        type="button"
                        className="gis-tables-agol-add__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setLayersEmptyAddMenuOpen(false)
                          openAddLayerModal('upload')
                        }}
                      >
                        <i className="fa-solid fa-image" aria-hidden="true" />
                        <span>Add media layer</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="gis-empty" role="status" aria-live="polite">
                <div className="gis-empty-title">No layers yet</div>
                <div className="gis-empty-sub">No layers yet. Add an ArcGIS connection or upload a file.</div>
              </div>
            )
          ) : null}
            {layersPaneView !== 'browse' && !layersChromeCollapsed && layers.length > 0 ? (
            <>
            {showDesktopGisRail ? (
              <button
                type="button"
                className="gis-map-browse-layers-trigger"
                onClick={openBrowseLayersPane}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span>Browse layers</span>
              </button>
            ) : null}
            <div id="gis-sidebar-layers-scroll" className="gis-layer-list" role="list" aria-label="Layers list">
              {orderedLayers.map(layer => {
                const layerId = String(layer.id)
                const isMenuOpen = openLayerMenuId === layerId
                const isEsriImage = layer.type === 'tile' && (layer.data as any)?.esriImageServer
                const featureCount = Array.isArray((layer.data as any)?.features) ? (layer.data as any).features.length : 0
                const countLabel = isEsriImage ? 'Image service' : `${featureCount} features`
                const isArcTable = String(layer.arcgisLayerDefinition?.type || '').toLowerCase() === 'table'
                const hasAnyGeometry = Array.isArray((layer.data as any)?.features)
                  ? (layer.data as any).features.some((f: any) => Boolean(f?.geometry))
                  : false
                const isTableLayer = Boolean(isArcTable || (layer.source === 'arcgis' && layer.type === 'geojson' && !hasAnyGeometry))
                const layerKindLabel = isEsriImage
                  ? 'Imagery layer'
                  : isTableLayer
                    ? 'Table'
                    : layer.type === 'tile'
                      ? 'Tile layer'
                      : 'Vector layer'
                const layerSubline = isEsriImage ? layerKindLabel : `${layerKindLabel} - ${countLabel}`

                const layerOptionsMenu = (
                      <div
                        className="gis-layer-menu"
                        data-layer-menu-root={layerId}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className={isMenuOpen ? 'gis-layer-menu-btn active' : 'gis-layer-menu-btn'}
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          aria-label={`Options for ${layer.name}`}
                          title="Options"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (openLayerMenuId === layerId) {
                              setOpenLayerMenuId(null)
                              return
                            }
                            layerMenuAnchorRef.current = e.currentTarget
                            setLayerMenuPos(computeLayerMenuPositionFromAnchor(e.currentTarget))
                            setOpenLayerMenuId(layerId)
                          }}
                        >
                          <i
                            className={showDesktopGisRail ? 'fa-solid fa-ellipsis' : 'fa-solid fa-ellipsis-vertical'}
                            aria-hidden="true"
                          />
                        </button>

                        {isMenuOpen ? (
                          createPortal(
                            <div
                              className="gis-layer-menu-popover gis-layer-menu-popover--pro"
                              data-gis-layer-menu-floating="1"
                              role="menu"
                              aria-label={`Layer options menu for ${layer.name}`}
                              style={
                                layerMenuPos
                                  ? {
                                      position: 'fixed',
                                      top: layerMenuPos.top,
                                      left: layerMenuPos.left,
                                      width: GIS_LAYER_MENU_WIDTH,
                                      maxHeight: layerMenuPos.maxHeight,
                                      zIndex: 12000,
                                    }
                                  : undefined
                              }
                            >
                            {(() => {
                              const stackIdx = layers.findIndex(l => String(l.id) === layerId)
                              const canBringForward = stackIdx >= 0 && stackIdx < layers.length - 1
                              const canSendBackward = stackIdx > 0
                              const canTable = layer.type === 'geojson' && Boolean(layer.data) && !isTableLayer
                              const canStyle = layer.type === 'geojson' && !isTableLayer
                              const canRefresh = layer.source === 'arcgis' && Boolean(layer.url?.trim())
                              return (
                                <>
                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                zoomToLayer(layer)
                              }}
                            >
                              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                              <span>Zoom to layer</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canTable}
                              title={!canTable ? 'Available for feature layers with geometry' : undefined}
                              onClick={() => {
                                if (!canTable) return
                                setOpenLayerMenuId(null)
                                setTableDockMinimized(false)
                                setLayerDialog({ mode: 'table', layerId })
                                setTableDockCollapsed(false)
                              }}
                            >
                              <i className="fa-solid fa-table-cells" aria-hidden="true" />
                              <span>Attribute table</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canStyle}
                              title={!canStyle ? 'Symbology is available for vector feature layers' : undefined}
                              onClick={() => {
                                if (!canStyle) return
                                setOpenLayerMenuId(null)
                                openLayerSymbology(layer)
                              }}
                            >
                              <i className="fa-solid fa-sliders" aria-hidden="true" />
                              <span>Symbology</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canStyle}
                              title={!canStyle ? 'Legend is available for vector feature layers' : undefined}
                              onClick={() => {
                                if (!canStyle) return
                                setOpenLayerMenuId(null)
                                setLayerDialog({ mode: 'legend', layerId })
                              }}
                            >
                              <i className="fa-solid fa-key" aria-hidden="true" />
                              <span>Legend</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                setLayerDialog({ mode: 'props', layerId, propsFocus: 'metadata' })
                              }}
                            >
                              <i className="fa-solid fa-circle-info" aria-hidden="true" />
                              <span>Layer properties</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                setLayerDialog({ mode: 'props', layerId, propsFocus: 'popup' })
                              }}
                            >
                              <i className="fa-solid fa-message" aria-hidden="true" />
                              <span>Configure pop-ups</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void (async () => {
                                  setOpenLayerMenuId(null)
                                  const cur = Math.round(
                                    (typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? layer.opacity : 1) * 100,
                                  )
                                  const next = await appPrompt('Layer opacity (0–100):', String(cur), {
                                    title: 'Layer opacity',
                                  })
                                  if (next === null) return
                                  const n = Math.max(0, Math.min(100, Math.round(Number(String(next).replace(/%/g, '').trim()))))
                                  if (!Number.isFinite(n)) return
                                  setLayers(prev =>
                                    prev.map(l => (l.id === layer.id ? { ...l, opacity: n / 100 } : l)),
                                  )
                                })()
                              }}
                            >
                              <i className="fa-solid fa-droplet" aria-hidden="true" />
                              <span>Layer opacity…</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canBringForward}
                              title={!canBringForward ? 'Layer is already on top' : 'Draw this layer above the next one in the stack'}
                              onClick={() => {
                                if (!canBringForward) return
                                setOpenLayerMenuId(null)
                                moveLayerDrawOrder(layerId, 'forward')
                              }}
                            >
                              <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                              <span>Bring forward (draw order)</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canSendBackward}
                              title={!canSendBackward ? 'Layer is already at the bottom' : 'Draw this layer below the previous one in the stack'}
                              onClick={() => {
                                if (!canSendBackward) return
                                setOpenLayerMenuId(null)
                                moveLayerDrawOrder(layerId, 'backward')
                              }}
                            >
                              <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                              <span>Send backward (draw order)</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                void navigator.clipboard.writeText(layer.name).then(
                                  () => setSelectionNotice('Layer name copied.'),
                                  () => setSelectionNotice('Could not copy layer name.'),
                                )
                              }}
                            >
                              <i className="fa-regular fa-clone" aria-hidden="true" />
                              <span>Copy layer name</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void (async () => {
                                  setOpenLayerMenuId(null)
                                  const next = await appPrompt('Enter the new layer name.', layer.name, {
                                    title: 'Rename layer',
                                  })
                                  if (next === null) return
                                  const name = next.trim()
                                  if (!name) return
                                  setLayers(prev => prev.map(l => (l.id === layer.id ? { ...l, name } : l)))
                                })()
                              }}
                            >
                              <i className="fa-solid fa-pen" aria-hidden="true" />
                              <span>Rename layer</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              disabled={!canRefresh}
                              title={!canRefresh ? 'Only ArcGIS layers with a service URL can be refreshed' : 'Reload data from the service'}
                              onClick={() => {
                                if (!canRefresh) return
                                setOpenLayerMenuId(null)
                                void syncArcGisLayer(layer)
                              }}
                            >
                              <i
                                className={
                                  syncingLayerKey === String(layer.id) ? 'fa-solid fa-arrows-rotate fa-spin' : 'fa-solid fa-arrows-rotate'
                                }
                                aria-hidden="true"
                              />
                              <span>Refresh layer data</span>
                            </button>

                            <button className="gis-layer-menu-item is-disabled" type="button" disabled aria-disabled="true" title="Planned">
                              <i className="fa-solid fa-tag" aria-hidden="true" />
                              <span>Labeling (Pro-style)</span>
                            </button>

                            <button className="gis-layer-menu-item is-disabled" type="button" disabled aria-disabled="true" title="Planned">
                              <i className="fa-solid fa-filter" aria-hidden="true" />
                              <span>Definition query…</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                void persistMapLayerToGisContent(layer, 'save')
                              }}
                            >
                              <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                              <span>Save</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                void persistMapLayerToGisContent(layer, 'saveAs')
                              }}
                            >
                              <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                              <span>Save as</span>
                            </button>

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                const cloneId = `${layerId}:copy:${Date.now()}`
                                const name = `${layer.name} (copy)`
                                setLayers(prev => [...prev, { ...layer, id: cloneId, name }])
                              }}
                            >
                              <i className="fa-regular fa-copy" aria-hidden="true" />
                              <span>Duplicate</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void (async () => {
                                  setOpenLayerMenuId(null)
                                  const next = await appPrompt('Group name (leave empty to clear):', layer.group ?? '', {
                                    title: 'Layer group',
                                  })
                                  if (next === null) return
                                  const group = next.trim()
                                  setLayers(prev =>
                                    prev.map(l => (l.id === layer.id ? { ...l, group: group || undefined } : l)),
                                  )
                                })()
                              }}
                            >
                              <i className="fa-solid fa-layer-group" aria-hidden="true" />
                              <span>Group</span>
                            </button>

                            <div className="gis-layer-menu-sep" role="separator" />

                            <button
                              className="gis-layer-menu-item danger"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenLayerMenuId(null)
                                setLayers(prev => prev.filter(l => l.id !== layer.id))
                              }}
                            >
                              <i className="fa-solid fa-trash-can" aria-hidden="true" />
                              <span>Remove from map</span>
                            </button>
                                </>
                              )
                            })()}
                          </div>,
                            document.body,
                          )
                        ) : null}
                      </div>
                )

                const layerVisibilityBtn = (
                  <button
                    className={layer.visible ? 'gis-layer-visibility-btn active' : 'gis-layer-visibility-btn'}
                    type="button"
                    aria-pressed={layer.visible}
                    onClick={() => setLayers(prev => prev.map(l => (l.id === layer.id ? { ...l, visible: !l.visible } : l)))}
                    aria-label={`Toggle ${layer.name}`}
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                  >
                    <i className={layer.visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'} aria-hidden="true" />
                  </button>
                )

                return (
                  <div
                    key={layerId}
                    role="listitem"
                    className={showDesktopGisRail ? 'gis-layer-card gis-layer-card--agol-row' : 'gis-layer-card'}
                  >
                    {showDesktopGisRail ? (
                      <>
                        <span className="gis-layer-drag-handle" aria-hidden="true" title="Drag to reorder">
                          <i className="fa-solid fa-grip-vertical" />
                        </span>
                        <div className="gis-layer-row-main">
                          <span className="gis-layer-name" title={layer.name}>
                            {layer.name}
                          </span>
                          <span className="gis-layer-subline" title={layerSubline}>
                            {layerSubline}
                          </span>
                        </div>
                        <div className="gis-layer-row-trailing">
                          {layerVisibilityBtn}
                          {layerOptionsMenu}
                        </div>
                      </>
                    ) : (
                      <div className="gis-layer-top">
                        <div className="gis-layer-header">
                          {layerVisibilityBtn}
                          <span className="gis-layer-dot" aria-hidden="true" style={{ background: layer.color || '#22c55e' }} />
                          <span className="gis-layer-titlewrap">
                            <span className="gis-layer-name" title={layer.name}>
                              {layer.name}
                            </span>
                            <span className="gis-layer-meta" aria-label="Layer metadata">
                              <i
                                className={
                                  layer.source === 'gis-portal' || parseGisContentPortalLayerUrl(String(layer.url || ''))
                                    ? 'fa-solid fa-database'
                                    : layer.source === 'arcgis'
                                      ? 'fa-solid fa-cloud'
                                      : layer.source === 'url'
                                        ? 'fa-solid fa-globe'
                                        : 'fa-solid fa-file-arrow-up'
                                }
                                aria-hidden="true"
                              />
                              <span>
                                {(layer.source === 'gis-portal' || parseGisContentPortalLayerUrl(String(layer.url || ''))
                                  ? 'GIS Content'
                                  : layer.source === 'arcgis'
                                    ? 'ArcGIS'
                                    : layer.source === 'url'
                                      ? 'URL'
                                      : 'Upload') +
                                  ' - ' +
                                  countLabel}
                              </span>
                            </span>
                          </span>
                        </div>
                        {layerOptionsMenu}
                      </div>
                    )}

                  {!showDesktopGisRail ? (
                  <div
                    className="gis-layer-actions-row"
                    aria-label={`Quick actions for ${layer.name}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      className="gis-icon-btn"
                      type="button"
                      onClick={() => syncArcGisLayer(layer)}
                      disabled={layer.source !== 'arcgis' || !layer.url}
                      aria-label={`Sync ${layer.name} from ArcGIS`}
                      title="Sync from ArcGIS"
                    >
                      <i
                        className={syncingLayerKey === String(layer.id) ? 'fa-solid fa-arrows-rotate fa-spin' : 'fa-solid fa-arrows-rotate'}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      className="gis-icon-btn"
                      type="button"
                      onClick={() => {
                        setTableDockMinimized(false)
                        setLayerDialog({ mode: 'table', layerId })
                        setTableDockCollapsed(false)
                      }}
                      disabled={layer.type !== 'geojson' || !layer.data}
                      aria-label={`Open table for ${layer.name}`}
                      title="Attribute table"
                    >
                      <i className="fa-solid fa-table-cells" aria-hidden="true" />
                    </button>
                    {!isTableLayer ? (
                      <>
                        <button
                          className="gis-icon-btn"
                          type="button"
                          onClick={() => {
                            openLayerSymbology(layer)
                          }}
                          disabled={layer.type !== 'geojson'}
                          aria-label={`Symbology for ${layer.name}`}
                          title="Symbology"
                        >
                          <i className="fa-solid fa-sliders" aria-hidden="true" />
                        </button>
                        <button
                          className={
                            layerDialog?.mode === 'legend' && String(layerDialog.layerId) === String(layer.id) ? 'gis-icon-btn active' : 'gis-icon-btn'
                          }
                          type="button"
                          onClick={() => setLayerDialog({ mode: 'legend', layerId })}
                          disabled={layer.type !== 'geojson'}
                          aria-label={`Legend for ${layer.name}`}
                          title="Legend"
                        >
                          <i className="fa-solid fa-key" aria-hidden="true" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  ) : null}
                  </div>
                )
              })}
            </div>
            </>
          ) : null}
            </div>
            </div>
              </>
            )}
        </div>
          ) : null}
            </div>
            ) : null}
          </div>
        </aside>
      ) : null}
      {isMobileDrawerViewport && !sidebarOpen ? (
        <nav className="gis-map-mobile-layers-dock" aria-label="GIS map tools">
          <button
            type="button"
            className="gis-map-mobile-layers-dock__pill"
            onClick={() => {
              setSidebarOpen(true)
              setActiveMapTool(null)
            }}
            aria-label="Open layers and map tools"
            title="Layers & tools"
          >
            <span className="gis-map-mobile-layers-dock__icon" aria-hidden="true">
              <i className="fa-solid fa-layer-group" />
            </span>
            <span className="gis-map-mobile-layers-dock__label">Layers & tools</span>
            <i className="fa-solid fa-chevron-right gis-map-mobile-layers-dock__chev" aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      <section
        ref={mapCanvasSectionRef}
        className={`gis-map-canvas ${mapProjectionMode === 'globe' ? 'projection-globe' : 'projection-2d'}`}
        aria-label="Map"
        data-edit-open={featureDialog ? 'true' : 'false'}
        data-projection={mapProjectionMode}
      >
        {mapProjectionMode === 'globe' ? (
          <MapboxMap
            key="gis-globe-map"
            ref={mapboxGlobeRef}
            {...globeViewState}
            onMove={evt => {
              setGlobeViewState(evt.viewState)
              syncAgroCloudTerrain3d(getGlobeMapInstance(), globeBasemapId, evt.viewState.pitch)
            }}
            style={{ width: '100%', height: '100%', cursor: globeMapMouse.mapCursor }}
            mapStyle={globeMapStyle}
            mapboxAccessToken={mapboxGlRendererToken}
            attributionControl={false}
            projection={{ name: 'globe' }}
            {...globeMapMouse.mapProps}
            {...globeMapMouse.mapPointerHandlers}
            minZoom={0.4}
            maxZoom={18}
            padding={GLOBE_CAMERA_PADDING}
            fog={{ range: [0.4, 9], color: '#050816', 'horizon-blend': 0.16, 'high-color': '#1d4ed8', 'space-color': '#020617', 'star-intensity': 0.55 }}
            onLoad={(evt) => {
              const map = evt.target
              const finish = () => {
                setGlobeLoaded(true)
                try {
                  globeMapMouse.applyBranding(map.getContainer())
                  map.setProjection({ name: 'globe' })
                  map.setFog({ range: [0.4, 9], color: '#050816', 'horizon-blend': 0.16, 'high-color': '#1d4ed8', 'space-color': '#020617', 'star-intensity': 0.55 })
                  const pitch = is3dTopographicBasemapId(globeBasemapId) ? 55 : 34
                  warmAgroCloudTerrainDemSource(map)
                  syncAgroCloudTerrain3d(map, globeBasemapId, pitch)
                  ensureAgroCloudMapScrollZoom(map)
                  map.easeTo({ pitch, bearing: -12, padding: GLOBE_CAMERA_PADDING, duration: 900 })
                } catch {}
              }
              try {
                if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) finish()
                else map.once('style.load', finish)
              } catch {
                finish()
              }
            }}
            onError={(evt: any) => {
              const message = evt?.error?.message || ''
              const url = evt?.error?.url || ''
              const status = evt?.error?.status
              if (message.includes('ERR_ABORTED') || status === 0) return
              if (
                !gisBasemapRasterFallbackRef.current &&
                basemapTileErrorShouldFallback(url, status)
              ) {
                gisBasemapRasterFallbackRef.current = true
                setSelectedBasemap(RASTER_BASEMAP_FALLBACK_ID as BasemapType)
                return
              }
              if (!message.includes('ERR_ABORTED')) console.warn('3D globe error:', evt)
            }}
          >
            {globeLoaded ? (
              <>
                <NavigationControl position="bottom-right" visualizePitch />
                {orderedLayers.map(layer => {
                  if (!layer.visible || layer.type !== 'geojson' || !layer.data) return null
                  const id = safeMapboxId(layer.id)
                  const stroke = layer.color || SI_DEFAULT_VECTOR_OUTLINE_COLOR
                  const fill = layer.fillColor || stroke
                  const op = typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? clamp01(layer.opacity) : 1
                  const polyA =
                    clampPolygonFillAlpha(layer) * fillOpacityFactorForFillStyle((layer as any).fillStyle as GisFillStyle | undefined) * op
                  const lw = Math.max(0.5, Math.min(16, layer.weight ?? SI_DEFAULT_VECTOR_LINE_WEIGHT))
                  const dash = mapboxLineDashArray((layer as any).strokeStyle)
                  const pr = clampPointRadius(layer)
                  const linePaint: Record<string, unknown> = {
                    'line-color': stroke,
                    'line-opacity': op * 0.92,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 2, lw * 0.35, 10, lw * 0.85, 16, lw * 1.25],
                  }
                  if (dash) linePaint['line-dasharray'] = dash
                  return (
                    <Source key={`globe-source-${id}`} id={`globe-source-${id}`} type="geojson" data={layer.data as any} tolerance={0.8} buffer={64} maxzoom={14}>
                      <Layer
                        id={`globe-fill-${id}`}
                        type="fill"
                        filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]] as any}
                        paint={{ 'fill-color': fill, 'fill-opacity': polyA }}
                      />
                      <Layer
                        id={`globe-line-${id}`}
                        type="line"
                        filter={['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']]] as any}
                        paint={linePaint as any}
                      />
                      <Layer
                        id={`globe-point-${id}`}
                        type="circle"
                        filter={['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]] as any}
                        paint={{
                          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, pr * 0.4, 10, pr * 0.95, 16, pr * 1.35],
                          'circle-color': fill,
                          'circle-stroke-color': stroke,
                          'circle-stroke-width': Math.max(0.5, lw * 0.55),
                          'circle-opacity': op * 0.92,
                        }}
                      />
                    </Source>
                  )
                })}
              </>
            ) : null}
          </MapboxMap>
        ) : (
        <MapView
          center={[DEFAULT_GIS_CENTER.latitude, DEFAULT_GIS_CENTER.longitude]}
          zoom={initialZoom}
          zoomSnap={0.1}
          zoomDelta={0.5}
          onMapReady={(m) => {
            mapRef.current = m
            if (!selectionOverlayRef.current) {
              selectionOverlayRef.current = L.layerGroup()
              selectionOverlayRef.current.addTo(m)
            }
            if (!measurementLayerRef.current) {
              measurementLayerRef.current = L.layerGroup()
              measurementLayerRef.current.addTo(m)
            }
          }}
          showBaseLayer={false}
          showZoomControl={false}
          showScaleControl={false}
        >
          <BasemapLayer selectedBasemap={selectedBasemap} />
          <DrawToolsController
            activeTool={drawingActiveTool}
            onToolActivate={(tool) => {
              setDrawingActiveTool(tool)
              if (tool === null && drawingIsEditing) setDrawingDirty(true)
            }}
            featureGroupRef={drawingFeatureGroupRef}
            shapeColor={drawingColor}
            onAOICreated={() => {
              setDrawingDirty(true)
            }}
            onSelectionChange={(layer) => {
              setDrawingSelected(layer)
              zoomToDrawing(layer)
            }}
            onDrawingChanged={(count) => {
              setDrawingCount(count)
              if (count === 0) setDrawingSelected(null)
              if (drawingIsEditing) setDrawingDirty(true)
            }}
          />
          {layers.map((layer, layerStackIndex) =>
            layer.visible && layer.type === 'tile' && layer.url && (layer.data as any)?.esriImageServer ? (
              <EsriImageServerLayer
                key={String(layer.id)}
                serviceUrl={layer.url}
                layerAuthToken={typeof layer.authToken === 'string' ? layer.authToken : undefined}
                opacity={layer.opacity}
                visible
                zIndex={380 + layerStackIndex}
              />
            ) : null,
          )}
          {layers.map(layer =>
            layer.visible && layer.type === 'geojson' && layer.data ? (
              <GeoJSON
                key={`gj:${String(layer.id)}:${layer.symbology?.useArcGisOnline ? 'ag1' : 'ag0'}:${layer.symbology?.style ?? 's'}:${(layer.arcgisRenderer as any)?.type ?? 'nr'}:${layerAppearanceFingerprint(layer)}`}
                data={layer.data as any}
                style={(feature: any) => getFeatureStyle(layer, feature)}
                onEachFeature={(feature: any, ll: any) => {
                  try {
                    ll?.off?.('click')
                    ll?.on?.('click', (e: any) => {
                      const currentDlg = layerDialogRef.current
                      if (currentDlg?.mode === 'table' && String(currentDlg.layerId) !== String(layer.id)) {
                        setLayerDialog(null)
                      }
                      const layerFeatures = Array.isArray((layer.data as { features?: unknown[] })?.features)
                        ? ((layer.data as { features: any[] }).features as any[])
                        : []
                      const origIdx = layerFeatures.indexOf(feature)
                      const key =
                        getFeatureKeyFromCache(feature) ??
                        getFeatureKey(feature, origIdx >= 0 ? origIdx : 0)
                      if (!key) {
                        setSelectionNotice('لا يمكن تحديد هذا العنصر بسبب عدم توفر مُعرّف مناسب.')
                        return
                      }
                      setShowSelectedOnly(false)
                      setSelectedFeatureKeys(new Set([String(key)]))
                      const llLatLng = e?.latlng
                      const lat = typeof llLatLng?.lat === 'number' ? llLatLng.lat : undefined
                      const lng = typeof llLatLng?.lng === 'number' ? llLatLng.lng : undefined
                      if (typeof lat === 'number' && typeof lng === 'number') {
                        showFeatureSelectionOnMap(String(layer.id), String(key), { zoom: true })
                        if (
                          currentDlg?.mode === 'table' &&
                          String(currentDlg.layerId) === String(layer.id)
                        ) {
                          requestAnimationFrame(() => scrollSelectedRowIntoView(String(key)))
                        } else {
                          openMapPopup({ layer, feature, latlng: { lat, lng } })
                        }
                      }
                    })
                  } catch {}
                }}
                pointToLayer={(feature: any, latlng) => {
                  const ctx = symbologyContexts.get(String(layer.id))
                  if (ctx?.cfg.useArcGisOnline) {
                    const arc = getArcGisPointLayer(layer, feature, latlng)
                    if (arc) return arc
                  }
                  const opts = getPointMarkerOptions(layer, feature)
                  return L.circleMarker(latlng, opts as any)
                }}
              />
            ) : null
          )}
          {layers.map(layer => {
            if (!layer.visible || layer.type !== 'geojson' || !layer.data) return null
            const ctx = symbologyContexts.get(String(layer.id))
            if (!ctx || ctx.cfg.useArcGisOnline) return null
            if (ctx.cfg.style !== 'threshold_markers' || !ctx.thresholdPoints) return null
            return (
              <GeoJSON
                key={`${String(layer.id)}:threshold`}
                data={ctx.thresholdPoints as any}
                pointToLayer={(_, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 6,
                    color: '#ef4444',
                    weight: 2,
                    opacity: 1,
                    fillColor: '#ef4444',
                    fillOpacity: 0.85,
                  })
                }
              />
            )
          })}
        </MapView>
        )}

        <div className="gis-map-quick-tools" role="toolbar" aria-label="Quick map tools">
          <button
            type="button"
            className={['gis-map-quick-tools__btn', quickSearchOpen ? 'active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setQuickSearchOpen(v => !v)
              if (activeMapTool === 'search') setActiveMapTool(null)
            }}
            title="Search"
            aria-label="Search"
          >
            <i className="fa-solid fa-magnifying-glass-location" aria-hidden="true" />
          </button>
          <button
            type="button"
            ref={geoExplorerQuickToolBtnRef}
            className={['gis-map-quick-tools__btn', activeMapTool === 'geoExplorer' ? 'active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              geoExplorerAnchorSourceRef.current = 'quick'
              setActiveMapTool(prev => (prev === 'geoExplorer' ? null : 'geoExplorer'))
            }}
            title="Geo AI chat"
            aria-label="Geo AI chat"
          >
            <i className="fa-solid fa-comments" aria-hidden="true" />
          </button>
        </div>
        {quickSearchOpen ? (
          <div className="gis-map-quick-search-popover" ref={quickSearchRef} role="search">
            <div className="gis-map-quick-search-popover__bar">
              <button
                type="button"
                className="gis-map-quick-search-popover__close"
                onClick={() => setQuickSearchOpen(false)}
                aria-label="Close search"
                title="Close"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
              <div className="gis-map-quick-search-popover__capsule" dir="ltr">
                <span className="gis-map-quick-search-popover__lead-icon" aria-hidden="true">
                  <i className="fa-solid fa-magnifying-glass" />
                </span>
                <input
                  className="gis-map-quick-search-popover__field"
                  value={mapSearchQuery}
                  onChange={(e) => setMapSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleMapSearch()
                    }
                  }}
                  placeholder="Place name or layer code (e.g. MH101)"
                  aria-label="Search map"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="gis-map-quick-search-popover__submit"
                  onClick={() => void handleMapSearch()}
                  aria-label="Run search"
                  title="Search"
                >
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </button>
              </div>
            </div>
            {mapSearchStatus ? <div className="gis-map-quick-search-popover__status">{mapSearchStatus}</div> : null}
          </div>
        ) : null}

        {!showDesktopGisRail ? (
          <>
            <div className="gis-map-zoom-cluster gis-map-zoom-cluster--nav" role="group" aria-label="Map navigation">
              <button
                type="button"
                className="gis-map-zoom-cluster__btn gis-map-zoom-cluster__btn--nav"
                onClick={() => zoomMap('in')}
                title="Zoom in"
                aria-label="Zoom in"
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="gis-map-zoom-cluster__btn gis-map-zoom-cluster__btn--nav"
                onClick={() => zoomMap('out')}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <i className="fa-solid fa-minus" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="gis-map-zoom-cluster__btn gis-map-zoom-cluster__btn--nav"
                onClick={resetMapBearingToNorth}
                title={mapProjectionMode === 'globe' ? 'Reset bearing to north' : 'North is up (2D map)'}
                aria-label={mapProjectionMode === 'globe' ? 'Reset bearing to north' : 'Compass: map is north-up in 2D'}
              >
                <span className="gis-map-zoom-cluster__compass" aria-hidden="true">
                  <span className="gis-map-zoom-cluster__compass-n" />
                  <span className="gis-map-zoom-cluster__compass-s" />
                </span>
              </button>
            </div>

            <div className="gis-map-projection-float" role="group" aria-label="Map projection mode">
              <div className="gis-map-projection-toggle gis-map-projection-toggle--vertical gis-map-projection-toggle--float">
                <button
                  className={mapProjectionMode === '2d' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
                  type="button"
                  onClick={() => changeProjectionMode('2d')}
                  title="2D projection (F)"
                  aria-label="Switch to 2D map projection. Shortcut F"
                  aria-pressed={mapProjectionMode === '2d'}
                >
                  <i className="fa-solid fa-map-location-dot" aria-hidden="true" />
                </button>
                <button
                  className={mapProjectionMode === 'globe' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
                  type="button"
                  onClick={() => changeProjectionMode('globe')}
                  title="3D Globe projection (G)"
                  aria-label="Switch to 3D Globe projection. Shortcut G"
                  aria-pressed={mapProjectionMode === 'globe'}
                >
                  <i className="fa-solid fa-globe" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : null}

        {!showDesktopGisRail ? (
          <div className="gis-map-toolbar" role="toolbar" aria-label="GIS map tools">
            <button className={activeMapTool === 'basemap' ? 'gis-map-tool active' : 'gis-map-tool'} type="button" onClick={() => toggleMapTool('basemap')} title="BaseMap List" aria-label="BaseMap List">
              <i className="fa-solid fa-map" aria-hidden="true" />
              <span>BaseMap</span>
            </button>
            <button className={activeMapTool === 'legend' ? 'gis-map-tool active' : 'gis-map-tool'} type="button" onClick={() => toggleMapTool('legend')} title="Legend" aria-label="Legend">
              <i className="fa-solid fa-list" aria-hidden="true" />
              <span>Legend</span>
            </button>
            <button className={activeMapTool === 'chart' ? 'gis-map-tool active' : 'gis-map-tool'} type="button" onClick={() => toggleMapTool('chart')} title="Chart" aria-label="Chart">
              <i className="fa-solid fa-chart-column" aria-hidden="true" />
              <span>Chart</span>
            </button>
            <button className="gis-map-tool" type="button" onClick={() => window.print()} title="Print" aria-label="Print map">
              <i className="fa-solid fa-print" aria-hidden="true" />
              <span>Print</span>
            </button>
            <button className={activeMapTool === 'measure' ? 'gis-map-tool active' : 'gis-map-tool'} type="button" onClick={() => toggleMapTool('measure')} title="Measurement tools" aria-label="Measurement tools">
              <i className="fa-solid fa-ruler-combined" aria-hidden="true" />
              <span>Measure</span>
            </button>
            <button className={activeMapTool === 'search' ? 'gis-map-tool active' : 'gis-map-tool'} type="button" onClick={() => toggleMapTool('search')} title="Search tools" aria-label="Search tools">
              <i className="fa-solid fa-magnifying-glass-location" aria-hidden="true" />
              <span>Search</span>
            </button>
            <button
              ref={geoExplorerMapToolbarChatRef}
              className={activeMapTool === 'geoExplorer' ? 'gis-map-tool active' : 'gis-map-tool'}
              type="button"
              onClick={() => {
                geoExplorerAnchorSourceRef.current = 'toolbar'
                toggleMapTool('geoExplorer')
              }}
              title="Geo Explorer (Gemini chat)"
              aria-label="Geo Explorer chat"
              aria-pressed={activeMapTool === 'geoExplorer'}
            >
              <i className="fa-solid fa-comments" aria-hidden="true" />
              <span>Chat</span>
            </button>
          </div>
        ) : null}

        <div
          className={projectionToast ? 'gis-map-projection-toast show' : 'gis-map-projection-toast'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {projectionToast}
        </div>

        {!dockMapToolInSidebar && (!showDesktopGisRail || agolContentColumnOpen) ? mapToolPanelEl : null}
        <GisMapSaveOpenFlyout
          open={Boolean(showDesktopGisRail && activeMapTool === 'saveOpen')}
          anchorRef={saveOpenRailBtnRef}
          onClose={() => setActiveMapTool(null)}
          onSave={() => void persistPortalWebMap('save')}
          onSaveAs={() => void persistPortalWebMap('saveAs')}
          onNewMap={() => void handlePortalWebMapNew()}
          onOpenMap={() => setOpenWebMapModalOpen(true)}
        />
        {geoExplorerFloatingEl}

        {drawingEditorOpen ? (
          <div className="gis-modal-overlay" role="presentation" onClick={() => closeDrawingEditor()}>
            <div className="gis-modal gis-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="gis-modal-header">
                <div className="gis-modal-title">Edit drawing</div>
                <button className="gis-sidebar-close" type="button" onClick={() => closeDrawingEditor()} aria-label="Close dialog">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="gis-modal-body">
                <div className="gis-layer-panel">
                  <div className="gis-layer-panel-title">
                    <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                    Editing tools
                  </div>
                  <div className="gis-layer-actions-row" style={{ flexWrap: 'wrap' }}>
                    <button
                      className={drawingActiveTool === 'edit' ? 'gis-icon-btn active' : 'gis-icon-btn'}
                      type="button"
                      onClick={() => setDrawingActiveTool('edit')}
                      title="Move / reshape"
                      aria-label="Move / reshape"
                    >
                      <i className="fa-solid fa-up-down-left-right" aria-hidden="true" />
                    </button>
                    <button
                      className={drawingActiveTool === 'delete_mode' ? 'gis-icon-btn active danger' : 'gis-icon-btn danger'}
                      type="button"
                      onClick={() => setDrawingActiveTool(drawingActiveTool === 'delete_mode' ? 'edit' : 'delete_mode')}
                      title="Delete shapes"
                      aria-label="Delete shapes"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                    <button className="gis-icon-btn" type="button" onClick={() => setDrawingActiveTool('polygon')} title="Add polygon" aria-label="Add polygon">
                      <i className="fa-solid fa-draw-polygon" aria-hidden="true" />
                    </button>
                    <button className="gis-icon-btn" type="button" onClick={() => setDrawingActiveTool('rectangle')} title="Add rectangle" aria-label="Add rectangle">
                      <i className="fa-regular fa-square" aria-hidden="true" />
                    </button>
                    <button className="gis-icon-btn" type="button" onClick={() => setDrawingActiveTool('circle')} title="Add circle" aria-label="Add circle">
                      <i className="fa-solid fa-circle" aria-hidden="true" />
                    </button>
                    <button className="gis-icon-btn" type="button" onClick={() => setDrawingActiveTool('marker')} title="Add marker" aria-label="Add marker">
                      <i className="fa-solid fa-location-dot" aria-hidden="true" />
                    </button>
                    <button className="gis-icon-btn" type="button" onClick={() => zoomToDrawing()} title="Zoom" aria-label="Zoom">
                      <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="gis-layer-panel">
                  <div className="gis-layer-panel-title">
                    <i className="fa-solid fa-palette" aria-hidden="true" />
                    Appearance
                  </div>
                  <div className="gis-layer-panel-row">
                    <div className="gis-layer-panel-label">Color</div>
                    <input
                      className="gis-input"
                      type="color"
                      value={drawingColor}
                      onChange={(e) => {
                        const next = e.target.value
                        setDrawingColor(next)
                        applyDrawingColor(next)
                      }}
                      aria-label="Drawing color"
                    />
                  </div>
                </div>

                <div className="gis-layer-panel">
                  <div className="gis-layer-panel-title">
                    <i className="fa-solid fa-list-check" aria-hidden="true" />
                    Selection
                  </div>
                  <div className="gis-layer-panel-muted">
                    {drawingSelected ? 'A shape is selected. Use Zoom to focus on it.' : 'Click a shape on the map to select it.'}
                  </div>
                </div>
              </div>
              <div className="gis-modal-actions">
                <button className="gis-btn" type="button" onClick={() => setDrawingConfirm({ kind: 'deleteAll' })} disabled={!drawingCount}>
                  حذف الكل
                </button>
                <button
                  className="gis-btn"
                  type="button"
                  onClick={() => {
                    if (drawingDirty) setDrawingConfirm({ kind: 'discard' })
                    else closeDrawingEditor()
                  }}
                >
                  إلغاء
                </button>
                <button className="gis-btn gis-btn-primary" type="button" onClick={() => setDrawingConfirm({ kind: 'save' })} disabled={!drawingDirty}>
                  حفظ
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {drawingConfirm ? (
          <div className="gis-modal-overlay" role="presentation" onClick={() => setDrawingConfirm(null)}>
            <div className="gis-modal gis-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="gis-modal-header">
                <div className="gis-modal-title">تأكيد</div>
                <button className="gis-sidebar-close" type="button" onClick={() => setDrawingConfirm(null)} aria-label="Close dialog">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="gis-modal-body">
                {drawingConfirm.kind === 'save'
                  ? 'هل تريد حفظ تغييرات الرسم؟'
                  : drawingConfirm.kind === 'discard'
                    ? 'هل تريد تجاهل التغييرات والرجوع للحالة السابقة؟'
                    : 'هل تريد حذف جميع مكونات الرسم؟'}
              </div>
              <div className="gis-modal-actions">
                <button className="gis-btn" type="button" onClick={() => setDrawingConfirm(null)}>
                  إلغاء
                </button>
                <button
                  className="gis-btn gis-btn-primary"
                  type="button"
                  onClick={() => {
                    const kind = drawingConfirm.kind
                    setDrawingConfirm(null)
                    if (kind === 'save') {
                      setDrawingIsEditing(false)
                      setDrawingEditorOpen(false)
                      setDrawingActiveTool(null)
                      setDrawingDirty(false)
                      drawingSnapshotRef.current = null
                    } else if (kind === 'discard') {
                      restoreDrawing(drawingSnapshotRef.current)
                      setDrawingIsEditing(false)
                      setDrawingEditorOpen(false)
                      setDrawingActiveTool(null)
                      setDrawingDirty(false)
                      drawingSnapshotRef.current = null
                    } else if (kind === 'deleteAll') {
                      try {
                        drawingFeatureGroupRef.current?.clearLayers()
                      } catch {
                      }
                      setDrawingSelected(null)
                      setDrawingCount(0)
                      setDrawingDirty(false)
                      setDrawingActiveTool(null)
                    }
                  }}
                >
                  تأكيد
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {mapPopup && mapPopupPos ? (
          <MapPopup
            popup={mapPopup}
            pos={mapPopupPos}
            layer={layers.find(l => String(l.id) === String(mapPopup.layerId)) ?? null}
            compactSummary={Boolean(mapPopup.compactSummary)}
            rootRef={popupRef}
            onClose={closeMapPopup}
            onZoomTo={() => {
              setSelectedFeatureKeys(new Set([mapPopup.featureKey]))
              showFeatureSelectionOnMap(mapPopup.layerId, mapPopup.featureKey, { zoom: true })
            }}
            onOpenAttributeTable={() => {
              if (!mapPopup || mapPopup.phase === 'closing') return
              const layer = layers.find(l => String(l.id) === String(mapPopup.layerId))
              if (!layer) return
              openAttributeTableForFeature(layer, mapPopup.feature)
            }}
            onUpdateFeature={(nextFeature) => {
              setLayers((prev) =>
                prev.map((l) => {
                  if (String(l.id) === String(mapPopup.layerId) && l.data && Array.isArray((l.data as any).features)) {
                    const newFeatures = (l.data as any).features.map((f: any, i: number) => {
                      const fKey = getFeatureKey(f, i)
                      if (fKey === mapPopup.featureKey) return nextFeature
                      return f
                    })
                    return { ...l, data: { ...l.data, features: newFeatures } }
                  }
                  return l
                }),
              )
              setMapPopup((prev) => (prev ? { ...prev, feature: nextFeature } : prev))
            }}
          />
        ) : null}

        {layerDialog?.mode === 'table' && dialogLayer ? (
          (() => {
            const features = Array.isArray((dialogLayer.data as any)?.features) ? ((dialogLayer.data as any).features as any[]) : []
            const fields = getGeoJsonFields(dialogLayer.data)
            const hiddenFields = hiddenTableFieldsByLayerId[String(dialogLayer.id)] ?? new Set<string>()
            const fieldOrder = fieldOrderByLayerId[String(dialogLayer.id)] ?? []
            const orderedFields = [
              ...fieldOrder.filter(f => fields.includes(f)),
              ...fields.filter(f => !fieldOrder.includes(f)),
            ]
            const visibleFields = orderedFields.filter(f => !hiddenFields.has(f))
            const maxRows = 10000
            const allRows = features.slice(0, maxRows)
            const selectionCount = selectedFeatureKeys.size
            const isSyncing = syncingLayerKey === String(dialogLayer.id)
            const canRefresh = dialogLayer.source === 'arcgis' && typeof dialogLayer.url === 'string' && dialogLayer.url.trim() !== ''
            const arcDef = dialogLayer.source === 'arcgis' ? dialogLayer.arcgisLayerDefinition : null
            const arcTypeIdField =
              typeof arcDef?.typeIdField === 'string' && arcDef.typeIdField ? (arcDef.typeIdField as string) : undefined
            const arcTypes = Array.isArray(arcDef?.types) ? (arcDef.types as any[]) : []
            const arcTypesById = new Map<string, any>(arcTypes.map(t => [String(t?.id), t]))
            const arcFields = Array.isArray(arcDef?.fields) ? (arcDef.fields as any[]) : []
            const arcFieldsByLower = new Map<string, any>(
              arcFields
                .filter(f => typeof f?.name === 'string' && f.name)
                .map(f => [String(f.name).toLowerCase(), f]),
            )
            const getArcSubtype = (ft: any) => {
              if (!arcTypeIdField) return null
              const raw = ft?.properties?.[arcTypeIdField]
              if (raw === null || raw === undefined || raw === '') return null
              return arcTypesById.get(String(raw)) ?? null
            }
            const getArcDomainForField = (ft: any, fieldName: string) => {
              if (!arcDef) return null
              const subtype = getArcSubtype(ft)
              const subtypeDomains = subtype && subtype.domains && typeof subtype.domains === 'object' ? subtype.domains : null
              const subtypeDomain = subtypeDomains ? subtypeDomains[fieldName] ?? subtypeDomains[String(fieldName)] : null
              if (subtypeDomain) return subtypeDomain
              const fieldDef = arcFieldsByLower.get(String(fieldName).toLowerCase())
              return fieldDef?.domain ?? null
            }
            const readCodedValueDescription = (coded: any) => {
              const candidates = [coded?.description, coded?.label, coded?.name, coded?.displayName]
              const found = candidates.find(v => typeof v === 'string' && v.trim())
              return typeof found === 'string' ? found.trim() : ''
            }
            const getArcDisplayValue = (ft: any, fieldName: string, raw: any) => {
              const rawText = raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
              if (!arcDef) {
                return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }
              }

              if (arcTypeIdField && String(fieldName).toLowerCase() === String(arcTypeIdField).toLowerCase()) {
                const subtype = getArcSubtype(ft)
                const label = typeof subtype?.name === 'string' && subtype.name ? subtype.name : typeof subtype?.description === 'string' ? subtype.description : ''
                const description = label.trim()
                const display = tableDomainDisplayMode === 'description' && description ? description : rawText
                const title = description ? `${description} (code: ${rawText})` : rawText
                return { code: rawText, description, display, title, hasDomain: Boolean(subtype), missingDescription: Boolean(subtype && rawText && !description) }
              }

              const domain = getArcDomainForField(ft, fieldName)

              if (domain?.type === 'codedValue' && Array.isArray(domain?.codedValues)) {
                const coded = domain.codedValues.find((cv: any) => String(cv?.code) === rawText)
                const description = readCodedValueDescription(coded)
                const display = tableDomainDisplayMode === 'description' && description ? description : rawText
                const title = description ? `${description} (code: ${rawText})` : rawText
                return { code: rawText, description, display, title, hasDomain: Boolean(coded), missingDescription: Boolean(coded && rawText && !description) }
              }

              return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }
            }
            const getTableSearchText = (ft: any, fieldName: string, mode: TableSearchMode = tableSearchMode) => {
              const value = getArcDisplayValue(ft, fieldName, ft?.properties?.[fieldName])
              if (mode === 'description') return value.description || value.display || value.code
              if (mode === 'code') return value.code
              return [value.display, value.description, value.code].filter(Boolean).join(' ')
            }
            const passesRuleFilter = (ft: any) => {
              if (!tableFilterField) return true
              const haystack = getTableSearchText(ft, tableFilterField, 'both').toLowerCase()
              const needle = tableFilterValue.trim().toLowerCase()
              if (tableFilterOperator === 'empty') return haystack.length === 0
              if (tableFilterOperator === 'not_empty') return haystack.length > 0
              if (!needle) return true
              if (tableFilterOperator === 'equals') return haystack === needle
              if (tableFilterOperator === 'not_equals') return haystack !== needle
              return haystack.includes(needle)
            }
            const selectedRows = showSelectedOnly
              ? allRows.filter(ft => {
                  const origIdx = features.indexOf(ft)
                  return selectedFeatureKeys.has(getFeatureKey(ft, origIdx >= 0 ? origIdx : 0))
                })
              : allRows
            const ruleFilteredRows = selectedRows.filter(passesRuleFilter)
            const tableQuery = tableSearchQuery.trim().toLowerCase()
            const filteredRows = tableQuery
              ? ruleFilteredRows.filter(ft =>
                  fields.some(fieldName => getTableSearchText(ft, fieldName).toLowerCase().includes(tableQuery))
                )
              : ruleFilteredRows
            const hasSelection = selectionCount > 0
            const onToggleAll = () => {
              setSelectedFeatureKeys(prev => {
                const next = new Set(prev)
                const keys = filteredRows.map((ft, idx) => getFeatureKey(ft, idx))
                const allSelected = keys.length > 0 && keys.every(k => next.has(k))
                if (allSelected) keys.forEach(k => next.delete(k))
                else keys.forEach(k => next.add(k))
                return next
              })
            }
            const onToggleOne = (key: string) => {
              setSelectedFeatureKeys(prev => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }
            const escapeCsv = (value: unknown) => {
              const text = value === null || value === undefined ? '' : String(value)
              return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
            }
            const exportCurrentTable = () => {
              const header = visibleFields.map(escapeCsv).join(',')
              const rows = filteredRows.map(ft =>
                visibleFields
                  .map(fieldName => escapeCsv(getArcDisplayValue(ft, fieldName, ft?.properties?.[fieldName]).display))
                  .join(',')
              )
              const suffix = 'descriptions'
              downloadTextFile(`${sanitizeFileName(dialogLayer.name)}-${suffix}.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8')
            }
            const saveTableFormat = () => {
              const payload = {
                displayMode: 'description' as const,
                searchMode: tableSearchMode,
                hiddenFields: Array.from(hiddenFields),
                fieldOrder: orderedFields,
                filter: { field: tableFilterField, operator: tableFilterOperator, value: tableFilterValue },
              }
              try {
                localStorage.setItem(`gis:table-format:${String(dialogLayer.id)}`, JSON.stringify(payload))
              } catch {}
            }
            const applyTableFormat = () => {
              try {
                const raw = localStorage.getItem(`gis:table-format:${String(dialogLayer.id)}`)
                if (!raw) return
                const parsed = JSON.parse(raw)
                if (parsed?.searchMode === 'description' || parsed?.searchMode === 'code' || parsed?.searchMode === 'both') setTableSearchMode(parsed.searchMode)
                if (Array.isArray(parsed?.hiddenFields)) setHiddenFieldsForLayer(String(dialogLayer.id), new Set(parsed.hiddenFields.map(String)))
                if (Array.isArray(parsed?.fieldOrder)) setFieldOrderForLayer(String(dialogLayer.id), parsed.fieldOrder.map(String))
                if (parsed?.filter && typeof parsed.filter === 'object') {
                  setTableFilterField(typeof parsed.filter.field === 'string' ? parsed.filter.field : '')
                  setTableFilterOperator(['contains', 'equals', 'not_equals', 'empty', 'not_empty'].includes(parsed.filter.operator) ? parsed.filter.operator : 'contains')
                  setTableFilterValue(typeof parsed.filter.value === 'string' ? parsed.filter.value : '')
                }
              } catch {}
            }
            const moveColumn = (from: string, to: string) => {
              if (!from || !to || from === to) return
              const current = orderedFields.slice()
              const fromIndex = current.indexOf(from)
              const toIndex = current.indexOf(to)
              if (fromIndex < 0 || toIndex < 0) return
              current.splice(fromIndex, 1)
              current.splice(toIndex, 0, from)
              setFieldOrderForLayer(String(dialogLayer.id), current)
            }
            const moveColumnByOffset = (fieldName: string, offset: number) => {
              const current = orderedFields.slice()
              const fromIndex = current.indexOf(fieldName)
              const toIndex = fromIndex + offset
              if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return
              current.splice(fromIndex, 1)
              current.splice(toIndex, 0, fieldName)
              setFieldOrderForLayer(String(dialogLayer.id), current)
            }
            const renderHighlightedValue = (text: string) => {
              const q = tableSearchQuery.trim()
              if (!q) return text
              const lower = text.toLowerCase()
              const at = lower.indexOf(q.toLowerCase())
              if (at < 0) return text
              return (
                <>
                  {text.slice(0, at)}
                  <mark className="gis-table-match">{text.slice(at, at + q.length)}</mark>
                  {text.slice(at + q.length)}
                </>
              )
            }
            return (
              <div
                className={
                  tableDockMinimized
                    ? 'gis-table-dock collapsed minimized'
                    : tableDockCollapsed
                      ? 'gis-table-dock collapsed'
                      : 'gis-table-dock'
                }
                style={{ height: tableDockMinimized ? 38 : tableDockCollapsed ? 56 : tableDockHeight }}
                role="dialog"
                aria-label={`Table: ${dialogLayer.name}`}
              >
                {tableDockCollapsed ? null : (
                  <div className="gis-table-dock-resize" onPointerDown={startTableResize} aria-hidden="true" />
                )}
                <div className="gis-table-dock-header">
                  <div className="gis-table-dock-title" title={dialogLayer.name}>
                    <AgroCloudMark size={28} className="gis-table-browser-mark" title="Table Browser" />
                    <span>{dialogLayer.name}</span>
                  </div>
                  <div className="gis-table-dock-meta">
                    {features.length} record{features.length === 1 ? '' : 's'}, {selectionCount} selected
                  </div>
                  <div className="gis-table-dock-actions" aria-label="Table actions">
                    <button
                      className="gis-table-dock-collapse"
                      type="button"
                      onClick={() => {
                        setTableDockMinimized(false)
                        setTableDockCollapsed(false)
                      }}
                      aria-label="Expand table"
                      title="Expand"
                      disabled={!tableDockCollapsed && !tableDockMinimized}
                    >
                      <i className="fa-solid fa-chevron-up" aria-hidden="true" />
                    </button>
                    <button
                      className="gis-table-dock-collapse"
                      type="button"
                      onClick={() => {
                        setTableDockMinimized(false)
                        setTableDockCollapsed(true)
                      }}
                      aria-label="Collapse table"
                      title="Collapse"
                      disabled={tableDockCollapsed && !tableDockMinimized}
                    >
                      <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                    </button>
                    <button
                      className="gis-table-dock-collapse"
                      type="button"
                      onClick={() => {
                        setTableDockMinimized(true)
                        setTableDockCollapsed(true)
                      }}
                      aria-label="Minimize table"
                      title="Minimize"
                      disabled={tableDockMinimized}
                    >
                      <i className="fa-solid fa-minus" aria-hidden="true" />
                    </button>
                  </div>
                  <button className="gis-table-dock-close" type="button" onClick={() => setLayerDialog(null)} aria-label="Close table">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>

                {tableDockCollapsed ? null : (
                <div className="gis-table-dock-body">
                  {fields.length === 0 ? (
                    <div className="gis-layer-panel-muted">No fields found.</div>
                  ) : (
                    <div className="gis-table-dock-layout">
                      <aside
                        className={`gis-workspace-sidebar gis-table-dock-sidebar${tableToolsCollapsed ? ' collapsed' : ''}`}
                        aria-label="GIS workspace — table tools, search, and filters"
                      >
                        <div className="gis-workspace-sidebar__scope" aria-hidden={tableToolsCollapsed ? true : undefined}>
                          <AgroCloudMark size={22} className="gis-table-browser-mark" title="Table Browser" />
                          <div className="gis-workspace-sidebar__scope-text">
                            <span className="gis-workspace-sidebar__scope-label">Table Browser</span>
                            <span className="gis-workspace-sidebar__scope-hint">Attribute workspace</span>
                          </div>
                        </div>
                        <div className="gis-workspace-sidebar__tools" role="toolbar" aria-label="Table actions">
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => zoomToFeatures(filteredRows.filter((ft, idx) => selectedFeatureKeys.has(getFeatureKey(ft, idx))))}
                          disabled={!hasSelection}
                          title="Zoom to selection"
                        >
                          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                          <span className="gis-table-tooltext">Zoom to selection</span>
                        </button>

                        <button className="gis-table-toolbtn" type="button" onClick={goHome} title="Home">
                          <i className="fa-solid fa-house" aria-hidden="true" />
                          <span className="gis-table-tooltext">Home</span>
                        </button>

                        <div className="gis-table-toolsep" role="separator" />

                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setSelectedFeatureKeys(new Set())}
                          disabled={!hasSelection}
                          title="Clear selection"
                        >
                          <i className="fa-solid fa-eraser" aria-hidden="true" />
                          <span className="gis-table-tooltext">Clear selection</span>
                        </button>

                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setShowSelectedOnly(true)}
                          disabled={!hasSelection}
                          title="Show selected"
                        >
                          <i className="fa-solid fa-filter" aria-hidden="true" />
                          <span className="gis-table-tooltext">Show selected</span>
                        </button>

                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setShowSelectedOnly(false)}
                          disabled={!showSelectedOnly}
                          title="Show all"
                        >
                          <i className="fa-solid fa-list" aria-hidden="true" />
                          <span className="gis-table-tooltext">Show all</span>
                        </button>

                        <div className="gis-table-toolsep" role="separator" />

                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => syncArcGisLayer(dialogLayer)}
                          disabled={!canRefresh || isSyncing}
                          title="Refresh"
                        >
                          <i className="fa-solid fa-rotate-right" aria-hidden="true" />
                          <span className="gis-table-tooltext">{isSyncing ? 'Refreshing…' : 'Refresh'}</span>
                        </button>

                        <div className="gis-table-toolsep" role="separator" />

                        <button className="gis-table-toolbtn" type="button" onClick={exportCurrentTable} title="Export table">
                          <i className="fa-solid fa-file-export" aria-hidden="true" />
                          <span className="gis-table-tooltext">Export CSV</span>
                        </button>

                        <button className="gis-table-toolbtn" type="button" onClick={saveTableFormat} title="Save table format">
                          <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                          <span className="gis-table-tooltext">Save format</span>
                        </button>

                        <button className="gis-table-toolbtn" type="button" onClick={applyTableFormat} title="Apply saved format">
                          <i className="fa-solid fa-layer-group" aria-hidden="true" />
                          <span className="gis-table-tooltext">Apply format</span>
                        </button>
                        </div>

                        <div className="gis-workspace-sidebar__rich" role="region" aria-label="Table search and filters">
                          <details className="gis-workspace-acc" open>
                            <summary className="gis-workspace-acc__summary">Search &amp; browse</summary>
                            <div className="gis-workspace-acc__body gis-workspace-acc__body--stack">
                              <div className="gis-table-controls gis-table-controls--workspace">
                                <label className="gis-table-domain-toggle">
                                  <span>Search mode</span>
                                  <select
                                    value={tableSearchMode}
                                    onChange={(e) => setTableSearchMode(e.target.value as TableSearchMode)}
                                    aria-label="Table search mode"
                                  >
                                    <option value="description">Description</option>
                                    <option value="code">Code</option>
                                    <option value="both">Both</option>
                                  </select>
                                </label>
                                <label className="gis-table-search">
                                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                                  <input
                                    value={tableSearchQuery}
                                    onChange={(e) => setTableSearchQuery(e.target.value)}
                                    placeholder={
                                      tableSearchMode === 'code'
                                        ? 'Search codes...'
                                        : tableSearchMode === 'both'
                                          ? 'Search descriptions or codes...'
                                          : 'Search descriptions...'
                                    }
                                    aria-label="Search table by selected display mode"
                                  />
                                </label>
                              </div>
                            </div>
                          </details>
                          <details className="gis-workspace-acc" open>
                            <summary className="gis-workspace-acc__summary">Field filter</summary>
                            <div className="gis-workspace-acc__body gis-workspace-acc__body--stack">
                              <div className="gis-table-advanced-controls gis-table-advanced-controls--workspace" aria-label="Advanced table filter">
                                <label>
                                  <span>Filter field</span>
                                  <select value={tableFilterField} onChange={(e) => setTableFilterField(e.target.value)}>
                                    <option value="">All records</option>
                                    {fields.map(f => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>Rule</span>
                                  <select
                                    value={tableFilterOperator}
                                    onChange={(e) => setTableFilterOperator(e.target.value as TableFilterOperator)}
                                  >
                                    <option value="contains">Contains</option>
                                    <option value="equals">Equals</option>
                                    <option value="not_equals">Not equals</option>
                                    <option value="empty">Is empty</option>
                                    <option value="not_empty">Is not empty</option>
                                  </select>
                                </label>
                                <label>
                                  <span>Value</span>
                                  <input
                                    value={tableFilterValue}
                                    onChange={(e) => setTableFilterValue(e.target.value)}
                                    disabled={tableFilterOperator === 'empty' || tableFilterOperator === 'not_empty'}
                                    placeholder="Filter value"
                                  />
                                </label>
                                <button
                                  className="gis-table-filter-clear"
                                  type="button"
                                  onClick={() => {
                                    setTableFilterField('')
                                    setTableFilterOperator('contains')
                                    setTableFilterValue('')
                                  }}
                                >
                                  Clear filter
                                </button>
                              </div>
                            </div>
                          </details>
                          <details className="gis-workspace-acc">
                            <summary className="gis-workspace-acc__summary">Map &amp; analysis hub</summary>
                            <div className="gis-workspace-acc__body gis-workspace-acc__body--prose">
                              <p>
                                Layer styling, pop-ups, related records, GeoAI, and map tools stay in the main map sidebar so they are
                                not duplicated here.
                              </p>
                            </div>
                          </details>
                        </div>

                        <button
                          className="gis-table-toolbtn gis-table-toolbtn--icon-only gis-workspace-sidebar__collapse"
                          type="button"
                          onClick={() => setTableToolsCollapsed(v => !v)}
                          aria-expanded={!tableToolsCollapsed}
                          aria-label={tableToolsCollapsed ? 'Expand workspace' : 'Collapse workspace'}
                          title={tableToolsCollapsed ? 'Expand workspace' : 'Collapse workspace'}
                        >
                          <i
                            className={tableToolsCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'}
                            aria-hidden="true"
                          />
                        </button>
                      </aside>

                      <div className="gis-layer-table-wrap gis-table-dock-table" aria-label="Layer table" ref={tableScrollRootRef}>
                        <div className="gis-layer-table-meta gis-layer-table-meta--table-only">
                          <div className="gis-layer-table-metatext">
                            {showSelectedOnly ? `Showing selected: ${filteredRows.length}` : `Showing ${filteredRows.length}`} of {features.length} feature(s)
                            {features.length > maxRows ? ` (first ${maxRows} loaded)` : ''}
                          </div>
                        </div>
                      {selectionNotice ? <div className="gis-layer-panel-muted">{selectionNotice}</div> : null}
                      <table className="gis-layer-table">
                        <thead>
                          <tr>
                            <th className="gis-layer-table-select">
                              <input
                                type="checkbox"
                                aria-label="Select all rows"
                                checked={filteredRows.length > 0 && filteredRows.every((ft, idx) => selectedFeatureKeys.has(getFeatureKey(ft, idx)))}
                                onChange={onToggleAll}
                              />
                            </th>
                            {visibleFields.map(f => (
                              <th
                                key={f}
                                draggable
                                className={draggingTableField === f ? 'gis-table-column-dragging' : undefined}
                                title="Drag to reorder column"
                                onDragStart={(e) => {
                                  setDraggingTableField(f)
                                  e.dataTransfer.effectAllowed = 'move'
                                  e.dataTransfer.setData('text/plain', f)
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  moveColumn(e.dataTransfer.getData('text/plain') || draggingTableField || '', f)
                                  setDraggingTableField(null)
                                }}
                                onDragEnd={() => setDraggingTableField(null)}
                              >
                                <span className="gis-table-column-label">
                                  <i className="fa-solid fa-grip-vertical" aria-hidden="true" />
                                  {f}
                                  <span className="gis-table-column-actions">
                                    <button
                                      type="button"
                                      onClick={() => moveColumnByOffset(f, -1)}
                                      disabled={orderedFields.indexOf(f) <= 0}
                                      aria-label={`Move ${f} column left`}
                                      title="Move left"
                                    >
                                      <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveColumnByOffset(f, 1)}
                                      disabled={orderedFields.indexOf(f) >= orderedFields.length - 1}
                                      aria-label={`Move ${f} column right`}
                                      title="Move right"
                                    >
                                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                                    </button>
                                  </span>
                                </span>
                              </th>
                            ))}
                            <th className="gis-layer-table-actions" aria-label="Actions" />
                            <th className="gis-layer-table-fieldvis" aria-label="Field visibility">
                              <FieldVisibilityControl
                                layerId={String(dialogLayer.id)}
                                fields={fields}
                                hiddenFields={hiddenFields}
                                onChangeHiddenFields={(next) => setHiddenFieldsForLayer(String(dialogLayer.id), next)}
                              />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.map(ft => {
                            const origIdx = features.indexOf(ft)
                            const key = getFeatureKey(ft, origIdx >= 0 ? origIdx : 0)
                            const isSelected = selectedFeatureKeys.has(key)
                            return (
                            <tr
                              key={key}
                              data-row-key={key}
                              className={isSelected ? 'gis-row-selected' : undefined}
                              onClick={(e) => {
                                const t = e.target
                                if (t instanceof Element && t.closest('input,button,a,select,textarea,label')) return
                                setSelectedFeatureKeys(new Set([key]))
                                showFeatureSelectionOnMap(String(dialogLayer.id), key, { zoom: true })
                                requestAnimationFrame(() => scrollSelectedRowIntoView(key))
                              }}
                            >
                              <td className="gis-layer-table-select">
                                <input
                                  type="checkbox"
                                  aria-label={`Select row ${origIdx >= 0 ? origIdx + 1 : key}`}
                                  checked={isSelected}
                                  onChange={() => onToggleOne(key)}
                                />
                              </td>
                              {visibleFields.map(f => {
                                const v = ft?.properties?.[f]
                                const out = getArcDisplayValue(ft, f, v)
                                return (
                                  <td key={f} title={out.title}>
                                    <span
                                      className={[
                                        'gis-domain-cell',
                                        out.missingDescription && tableDomainDisplayMode === 'description' ? 'missing-description' : '',
                                      ].filter(Boolean).join(' ')}
                                      data-code={out.code}
                                    >
                                      {out.missingDescription && tableDomainDisplayMode === 'description' ? (
                                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" title="No domain description found; code shown instead" />
                                      ) : null}
                                      {renderHighlightedValue(out.display)}
                                    </span>
                                  </td>
                                )
                              })}
                              <td className="gis-layer-table-actions">
                                <button
                                  className="gis-table-rowbtn"
                                  type="button"
                                  aria-label="Row details"
                                  title="Details"
                                  onClick={() => {
                                    setSelectedFeatureKeys(new Set([key]))
                                    showFeatureSelectionOnMap(String(dialogLayer.id), key)
                                    setFeatureDialog({ layerId: String(dialogLayer.id), featureKey: key, feature: ft, layerName: dialogLayer.name })
                                  }}
                                >
                                  <i className="fa-solid fa-pen" aria-hidden="true" />
                                </button>
                              </td>
                              <td className="gis-layer-table-fieldvis" aria-hidden="true" />
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            )
          })()
        ) : null}
      </section>

      {layerDialog?.mode === 'props' && dialogLayer ? (
        <div className="gis-modal-overlay" role="presentation" onClick={() => setLayerDialog(null)}>
          <div
            className="gis-modal gis-modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gis-layer-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gis-modal-header">
              <div className="gis-modal-title" id="gis-layer-dialog-title">
                {layerDialog.propsFocus === 'popup' ? `Configure pop-ups: ${dialogLayer.name}` : `Layer properties: ${dialogLayer.name}`}
              </div>
              <button className="gis-sidebar-close" type="button" onClick={() => setLayerDialog(null)} aria-label="Close dialog">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="gis-modal-body">
              {layerDialog.propsFocus === 'popup' ? (
                <p className="gis-layer-popup-hint">
                  Map pop-ups use feature attributes from this layer. Use the attribute table to inspect fields; a visual pop-up
                  designer can be added in a future release.
                </p>
              ) : null}
              <pre className="gis-layer-code">
                {JSON.stringify(
                  {
                    name: dialogLayer.name,
                    source: dialogLayer.source ?? null,
                    url: dialogLayer.url ?? null,
                    group: dialogLayer.group ?? null,
                    visible: dialogLayer.visible,
                    featureCount: Array.isArray((dialogLayer.data as any)?.features) ? (dialogLayer.data as any).features.length : 0,
                    fields: getGeoJsonFields(dialogLayer.data),
                    sampleProperties:
                      Array.isArray((dialogLayer.data as any)?.features) && (dialogLayer.data as any).features[0]?.properties
                        ? (dialogLayer.data as any).features[0].properties
                        : null,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {layerDialog?.mode === 'legend' && dialogLayer ? (
        <div className="gis-modal-overlay" role="presentation" onClick={() => setLayerDialog(null)}>
          <div
            className="gis-modal gis-modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gis-layer-legend-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gis-modal-header">
              <div className="gis-modal-title" id="gis-layer-legend-title">
                Legend: {dialogLayer.name}
              </div>
              <button className="gis-sidebar-close" type="button" onClick={() => setLayerDialog(null)} aria-label="Close dialog">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="gis-modal-body">{renderLayerLegendCardInner(dialogLayer)}</div>
          </div>
        </div>
      ) : null}

      {featureDialog ? (
        <div className="gis-right-sidebar">
          <div className="gis-right-sidebar-header">
            <button className="gis-right-sidebar-back" onClick={() => setFeatureDialog(null)} title="Back">
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <span className="gis-right-sidebar-title">Edit feature</span>
          </div>

          <div className="gis-right-sidebar-body">
            {(() => {
              const layer = layers.find(l => String(l.id) === featureDialog.layerId) ?? null
              const arcDef = layer?.source === 'arcgis' ? layer.arcgisLayerDefinition : null
              const arcTypeIdField =
                typeof arcDef?.typeIdField === 'string' && arcDef.typeIdField ? (arcDef.typeIdField as string) : undefined
              const arcTypes = Array.isArray(arcDef?.types) ? (arcDef.types as any[]) : []
              const arcTypesById = new Map<string, any>(arcTypes.map(t => [String(t?.id), t]))
              const arcFields = Array.isArray(arcDef?.fields) ? (arcDef.fields as any[]) : []
              const arcFieldsByLower = new Map<string, any>(
                arcFields
                  .filter(f => typeof f?.name === 'string' && f.name)
                  .map(f => [String(f.name).toLowerCase(), f]),
              )
              const getArcSubtype = (ft: any) => {
                if (!arcTypeIdField) return null
                const raw = ft?.properties?.[arcTypeIdField]
                if (raw === null || raw === undefined || raw === '') return null
                return arcTypesById.get(String(raw)) ?? null
              }
              const getArcDomainForField = (ft: any, fieldName: string) => {
                if (!arcDef) return null
                const subtype = getArcSubtype(ft)
                const subtypeDomains = subtype && subtype.domains && typeof subtype.domains === 'object' ? subtype.domains : null
                const subtypeDomain = subtypeDomains ? subtypeDomains[fieldName] ?? subtypeDomains[String(fieldName)] : null
                if (subtypeDomain) return subtypeDomain
                const fieldDef = arcFieldsByLower.get(String(fieldName).toLowerCase())
                return fieldDef?.domain ?? null
              }
              const getArcDisplayText = (ft: any, fieldName: string, raw: any) => {
                if (!arcDef) {
                  return raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
                }
                if (arcTypeIdField && String(fieldName).toLowerCase() === String(arcTypeIdField).toLowerCase()) {
                  const subtype = getArcSubtype(ft)
                  const label = typeof subtype?.name === 'string' ? subtype.name : ''
                  const rawText = raw === null || raw === undefined ? '' : String(raw)
                  return label || rawText
                }
                const domain = getArcDomainForField(ft, fieldName)
                const rawText = raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
                if (domain?.type === 'codedValue' && Array.isArray(domain?.codedValues)) {
                  const coded = domain.codedValues.find((cv: any) => String(cv?.code) === rawText)
                  const name = typeof coded?.name === 'string' ? coded.name : ''
                  return name || rawText
                }
                return rawText
              }
              const keys = Object.keys(featureDialog.feature?.properties || {})

              return (
                <>
            <div className="gis-edit-section">
              <button
                className="gis-edit-section-headerbtn"
                type="button"
                onClick={() => setEditSettingsCollapsed(v => !v)}
                aria-expanded={!editSettingsCollapsed}
                aria-controls="gis-edit-settings-content"
              >
                <span className="gis-edit-section-header">
                  <i className="fa-solid fa-gear" aria-hidden="true" /> Settings
                </span>
                <span className="gis-edit-section-header-icons" aria-hidden="true">
                  <i className={editSettingsCollapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up'} />
                </span>
              </button>

              {editSettingsCollapsed ? null : (
              <div className="gis-edit-section-content" id="gis-edit-settings-content">
                <label className="gis-edit-toggle">
                  <span>Enable tooltips</span>
                  <div className="gis-toggle-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="gis-slider"></span>
                  </div>
                </label>
                <label className="gis-edit-toggle">
                  <span>Enable snapping</span>
                  <div className="gis-toggle-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="gis-slider"></span>
                  </div>
                </label>
                <div className="gis-edit-sub-options">
                  <label className="gis-edit-toggle">
                    <span>Geometry guides</span>
                    <div className="gis-toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="gis-slider"></span>
                    </div>
                  </label>
                  <label className="gis-edit-toggle">
                    <span>Feature to feature</span>
                    <div className="gis-toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="gis-slider"></span>
                    </div>
                  </label>
                  <label className="gis-edit-toggle">
                    <span>Grid</span>
                    <div className="gis-toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="gis-slider"></span>
                    </div>
                  </label>
                </div>
                <button
                  className="gis-edit-accordion"
                  type="button"
                  onClick={() => setEditSnappingLayersOpen(v => !v)}
                  aria-expanded={editSnappingLayersOpen}
                  aria-controls="gis-edit-snapping-layers"
                >
                  <span>Snapping layers</span>
                  <i className={editSnappingLayersOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'} aria-hidden="true" />
                </button>
                {editSnappingLayersOpen ? (
                  <div className="gis-edit-accordion-panel" id="gis-edit-snapping-layers">
                    <div className="gis-edit-mini-actions">
                      <button
                        className="gis-edit-linkbtn"
                        type="button"
                        onClick={() => setEditSnappingLayerIds(new Set(layers.map(l => String(l.id))))}
                      >
                        Select all
                      </button>
                      <button className="gis-edit-linkbtn" type="button" onClick={() => setEditSnappingLayerIds(new Set())}>
                        Clear
                      </button>
                    </div>
                    <div className="gis-edit-checklist">
                      {layers.map((l) => {
                        const id = String(l.id)
                        const checked = editSnappingLayerIds.has(id)
                        return (
                          <label key={id} className="gis-edit-checkrow">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked
                                setEditSnappingLayerIds(prev => {
                                  const next = new Set(prev)
                                  if (nextChecked) next.add(id)
                                  else next.delete(id)
                                  return next
                                })
                              }}
                            />
                            <span className="gis-edit-checkname">{l.name || id}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <button
                  className="gis-edit-accordion"
                  type="button"
                  onClick={() => setEditGridOptionsOpen(v => !v)}
                  aria-expanded={editGridOptionsOpen}
                  aria-controls="gis-edit-grid-options"
                >
                  <span>Grid options</span>
                  <i className={editGridOptionsOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'} aria-hidden="true" />
                </button>
                {editGridOptionsOpen ? (
                  <div className="gis-edit-accordion-panel" id="gis-edit-grid-options">
                    <div className="gis-edit-gridform">
                      <label className="gis-edit-gridfield">
                        <span>Grid size</span>
                        <input
                          className="gis-edit-gridinput"
                          inputMode="numeric"
                          value={editGridSize}
                          onChange={(e) => setEditGridSize(e.target.value)}
                        />
                      </label>
                      <label className="gis-edit-gridfield">
                        <span>Unit</span>
                        <select className="gis-edit-gridselect" value={editGridUnit} onChange={(e) => setEditGridUnit(e.target.value)}>
                          <option value="m">m</option>
                          <option value="ft">ft</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}

                <div className="gis-edit-toolsbar" aria-label="Grid tools">
                  <button
                    className="gis-edit-iconbtn"
                    type="button"
                    title="Zoom"
                    aria-label="Zoom to feature"
                    onClick={() => zoomToFeatures([featureDialog.feature])}
                  >
                    <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                  </button>
                  <button
                    className="gis-edit-iconbtn"
                    type="button"
                    title="Open attribute table"
                    aria-label="Open attribute table"
                    onClick={() => {
                      const lyr = layers.find(l => String(l.id) === String(featureDialog.layerId))
                      if (lyr) openAttributeTableForFeature(lyr, featureDialog.feature)
                    }}
                  >
                    <i className="fa-solid fa-table-columns" aria-hidden="true" />
                  </button>
                  <input className="gis-edit-toolsinput" value={featureDialog.layerName} readOnly />
                </div>
              </div>
              )}
            </div>

            <div className="gis-edit-message">
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              Editing is restricted but you have privileges to edit this layer.
            </div>

            <div className="gis-edit-fields">
              {keys.map((key) => {
                const raw = featureDialog.feature?.properties?.[key]
                const domain = getArcDomainForField(featureDialog.feature, key)
                const subtype = getArcSubtype(featureDialog.feature)
                const subtypeText = typeof subtype?.name === 'string' && subtype.name ? subtype.name : ''
                const subtypeId = subtype?.id ?? (arcTypeIdField ? featureDialog.feature?.properties?.[arcTypeIdField] : null)
                const domainName =
                  domain && typeof domain === 'object' && typeof (domain as any).name === 'string' && (domain as any).name
                    ? String((domain as any).name)
                    : domain?.type
                      ? String(domain.type)
                      : ''
                const isSubtypeField = arcTypeIdField && String(key).toLowerCase() === String(arcTypeIdField).toLowerCase()
                const codedValues: any[] =
                  domain?.type === 'codedValue' && Array.isArray(domain?.codedValues) ? (domain.codedValues as any[]) : []
                const range = domain?.type === 'range' && domain && typeof domain === 'object' ? domain : null
                const display = getArcDisplayText(featureDialog.feature, key, raw)

                const setProp = (value: any) => {
                  setFeatureDialog((prev) =>
                    prev
                      ? {
                          ...prev,
                          feature: {
                            ...prev.feature,
                            properties: {
                              ...prev.feature.properties,
                              [key]: value,
                            },
                          },
                        }
                      : null,
                  )
                }

                return (
                  <div className="gis-edit-field" key={key}>
                    <label title={display !== (raw === null || raw === undefined ? '' : String(raw)) ? `${display} (code: ${String(raw ?? '')})` : undefined}>
                      {key.replace(/_/g, ' ')}
                    </label>
                    {domainName || subtypeText ? (
                      <div className="gis-edit-field-meta" aria-label="Domain and subtype details">
                        {domainName ? (
                          <div className="gis-edit-field-metaitem">
                            <span className="gis-edit-field-metak">Domain</span>
                            <span className="gis-edit-field-metav" title={domainName}>
                              {domainName}
                            </span>
                          </div>
                        ) : null}
                        {subtypeText ? (
                          <div className="gis-edit-field-metaitem">
                            <span className="gis-edit-field-metak">Subtype</span>
                            <span
                              className="gis-edit-field-metav"
                              title={subtypeId !== null && subtypeId !== undefined && subtypeId !== '' ? `${subtypeText} (${String(subtypeId)})` : subtypeText}
                            >
                              {subtypeId !== null && subtypeId !== undefined && subtypeId !== '' ? `${subtypeText} (${String(subtypeId)})` : subtypeText}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {isSubtypeField && arcTypes.length ? (
                      <select
                        value={raw === null || raw === undefined ? '' : String(raw)}
                        onChange={(e) => {
                          const selected = arcTypesById.get(String(e.target.value))
                          setProp(selected ? selected.id : e.target.value)
                        }}
                      >
                        <option value="">Select subtype</option>
                        {arcTypes.map(t => (
                          <option key={String(t?.id)} value={String(t?.id)}>
                            {typeof t?.name === 'string' && t.name ? t.name : String(t?.id ?? '')}
                          </option>
                        ))}
                      </select>
                    ) : codedValues.length ? (
                      <select
                        value={raw === null || raw === undefined ? '' : String(raw)}
                        onChange={(e) => {
                          const selected = codedValues.find(cv => String(cv?.code) === String(e.target.value))
                          setProp(selected ? selected.code : e.target.value)
                        }}
                      >
                        <option value="">Select value</option>
                        {codedValues.map((cv) => (
                          <option key={String(cv?.code)} value={String(cv?.code)}>
                            {typeof cv?.name === 'string' && cv.name ? cv.name : String(cv?.code ?? '')}
                          </option>
                        ))}
                      </select>
                    ) : range && (typeof range?.minValue === 'number' || typeof range?.maxValue === 'number') ? (
                      <input
                        type="number"
                        value={raw ?? ''}
                        min={typeof range.minValue === 'number' ? range.minValue : undefined}
                        max={typeof range.maxValue === 'number' ? range.maxValue : undefined}
                        onChange={(e) => setProp(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    ) : (
                      <input type="text" value={raw ?? ''} onChange={(e) => setProp(e.target.value)} />
                    )}
                  </div>
                )
              })}
            </div>
                </>
              )
            })()}
          </div>

          <div className="gis-right-sidebar-footer">
            <button
              className="gis-btn-update"
              onClick={() => {
                setLayers((prev) =>
                  prev.map((l) => {
                    if (String(l.id) === featureDialog.layerId && l.data && Array.isArray((l.data as any).features)) {
                      const newFeatures = (l.data as any).features.map((f: any, i: number) => {
                        const fKey = getFeatureKey(f, i)
                        if (fKey === featureDialog.featureKey) return featureDialog.feature
                        return f
                      })
                      return { ...l, data: { ...l.data, features: newFeatures } }
                    }
                    return l
                  })
                )
                setFeatureDialog(null)
              }}
            >
              Update
            </button>
            <button
              className="gis-btn-delete"
              onClick={() => {
                setLayers((prev) =>
                  prev.map((l) => {
                    if (String(l.id) === featureDialog.layerId && l.data && Array.isArray((l.data as any).features)) {
                      const newFeatures = (l.data as any).features.filter((f: any, i: number) => {
                        const fKey = getFeatureKey(f, i)
                        return fKey !== featureDialog.featureKey
                      })
                      return { ...l, data: { ...l.data, features: newFeatures } }
                    }
                    return l
                  })
                )
                setFeatureDialog(null)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {symbologyDialog && symbologyLayer ? (
        <div className="gis-modal-overlay" role="presentation" onClick={cancelSymbology}>
          <div className="gis-modal gis-modal-styles" role="dialog" aria-modal="true" aria-labelledby="gis-style-dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-palette" aria-hidden="true" />
                </div>
                <div className="gis-modal-title" id="gis-style-dialog-title">
                  Styles - {symbologyLayer.name}
                </div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={cancelSymbology} aria-label="Close dialog">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="gis-modal-body">
              <div className="gis-style-hero">
                <div className="gis-style-subtitle">Choose an attribute and visualization style. Preview updates live on the map.</div>
                <label
                  className={`gis-style-check${
                    symbologyLayer.source !== 'arcgis' && !symbologyDialog.draft.useArcGisOnline
                      ? ' gis-style-check--disabled'
                      : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={symbologyDialog.draft.useArcGisOnline}
                    onChange={(e) => {
                      if (!symbologyDialog) return
                      if (e.target.checked) {
                        void activateArcGisOnlineSymbology(symbologyDialog.layerId, symbologyDialog.draft)
                      } else {
                        updateSymbologyDraft({ useArcGisOnline: false })
                      }
                    }}
                    disabled={symbologyLayer.source !== 'arcgis' && !symbologyDialog.draft.useArcGisOnline}
                  />
                  <span>Use ArcGIS Online symbology</span>
                </label>
              </div>

              <div className="gis-style-toolbar" role="toolbar" aria-label="Style actions">
                <button
                  type="button"
                  className="gis-style-toolbtn"
                  onClick={() => {
                    if (!symbologyDialog) return
                    const layer = layers.find(l => String(l.id) === symbologyDialog.layerId)
                    if (!layer) return
                    const draft = normalizeSymbology(layer, symbologyDialog.original)
                    applyLayerSymbology(symbologyDialog.layerId, draft)
                    applyLayerAppearance(symbologyDialog.layerId, appearancePersisted(symbologyDialog.originalAppearance))
                    setSymbologyDialog(prev => (prev ? { ...prev, draft, draftAppearance: { ...prev.originalAppearance } } : prev))
                  }}
                  disabled={symbologyDialog.draft.useArcGisOnline}
                  title={
                    symbologyDialog.draft.useArcGisOnline
                      ? 'Unavailable while ArcGIS renderer is active'
                      : 'Restore visualization and symbol properties from when this panel opened'
                  }
                >
                  <i className="fa-solid fa-rotate-left" aria-hidden />
                  Reset
                </button>
                <button
                  type="button"
                  className="gis-style-toolbtn"
                  onClick={() => {
                    if (!symbologyDialog) return
                    writeGisStyleClipboard(appearancePersisted(symbologyDialog.draftAppearance))
                  }}
                  disabled={symbologyDialog.draft.useArcGisOnline}
                  title="Copy symbol appearance to local storage"
                >
                  <i className="fa-solid fa-copy" aria-hidden />
                  Copy style
                </button>
                <button
                  type="button"
                  className="gis-style-toolbtn"
                  onClick={() => {
                    if (!symbologyDialog) return
                    const clip = readGisStyleClipboard()
                    if (!clip) return
                    updateSymbologyAppearance({
                      ...clip,
                      previewCornerRadius: symbologyDialog.draftAppearance.previewCornerRadius,
                    })
                  }}
                  disabled={symbologyDialog.draft.useArcGisOnline}
                  title="Paste symbol appearance from clipboard"
                >
                  <i className="fa-solid fa-paste" aria-hidden />
                  Paste
                </button>
                <button
                  type="button"
                  className="gis-style-toolbtn"
                  onClick={() => {
                    if (!symbologyDialog) return
                    const snap = appearancePersisted(symbologyDialog.draftAppearance)
                    setLayers(prev => prev.map(l => (l.type === 'geojson' ? { ...l, ...snap } : l)))
                  }}
                  disabled={symbologyDialog.draft.useArcGisOnline}
                  title="Apply current fill, outline, opacity, dash, and blend to every GeoJSON layer"
                >
                  <i className="fa-solid fa-layer-group" aria-hidden />
                  Apply to all layers
                </button>
                <button
                  type="button"
                  className="gis-style-toolbtn"
                  onClick={() => {
                    if (!symbologyDialog) return
                    setDrawingColor(symbologyDialog.draftAppearance.fillColor)
                  }}
                  disabled={symbologyDialog.draft.useArcGisOnline}
                  title="Use current fill color for new AOI / draw shapes"
                >
                  <i className="fa-solid fa-pen-ruler" aria-hidden />
                  Sync draw color
                </button>
              </div>

              {symbologyDialog.draft.useArcGisOnline ? (
                <>
                  <div className="gis-style-info">
                    ArcGIS renderer preview is enabled. Uncheck &quot;Use ArcGIS Online symbology&quot; to configure custom styles.
                  </div>
                  {(() => {
                    const renderer = symbologyLayer.arcgisRenderer ?? symbologyLayer.arcgisLayerDefinition?.drawingInfo?.renderer
                    const visLabel = describeArcGisRendererVisualization(renderer)
                    const styleLabel =
                      symbologyDialog.draft.style === 'single'
                        ? 'Location (single symbol)'
                        : symbologyDialog.draft.style === 'unique'
                        ? 'Types (unique symbols)'
                        : symbologyDialog.draft.style === 'color_size'
                          ? 'Counts and Amounts (color + size)'
                          : symbologyDialog.draft.style === 'size'
                            ? 'Counts and Amounts (size)'
                            : symbologyDialog.draft.style === 'dot_density'
                              ? 'Dot density'
                              : symbologyDialog.draft.style === 'threshold_markers'
                                ? 'Single symbol + threshold markers'
                                : 'Counts and Amounts (color)'
                    return (
                      <div className="gis-style-card" aria-label="ArcGIS visualization">
                        <div className="gis-style-grid">
                          <div className="gis-style-field">
                            <div className="gis-style-label">Visualization style</div>
                            <div className="gis-style-readonly" title={visLabel}>
                              {renderer ? visLabel : 'Loading or unavailable — sync the layer if symbols look wrong.'}
                            </div>
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Linked custom style (when unchecked)</div>
                            <div className="gis-style-readonly">
                              {styleLabel}
                              {symbologyDialog.draft.field ? ` · ${symbologyDialog.draft.field}` : ''}
                            </div>
                          </div>
                        </div>
                        {renderer?.type === 'heatmap' ? (
                          <div className="gis-style-info" style={{ marginTop: 10 }}>
                            Heatmap renderers are not reproduced on this Leaflet map; use custom styles or a heatmap-capable client for this visualization.
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </>
              ) : (
                (() => {
                  const allFields = getGeoJsonFields(symbologyLayer.data)
                  const numericFields = getNumericFields(symbologyLayer.data)
                  const ctx = symbologyContexts.get(String(symbologyLayer.id))
                  const geometryKind = ctx?.geometryKind ?? getLayerGeometryKind(symbologyLayer.data)
                  const isUnique = symbologyDialog.draft.style === 'unique'
                  const isSingle = symbologyDialog.draft.style === 'single'
                  const classes = clampInt(symbologyDialog.draft.classes, 2, 12)
                  const showColor =
                    symbologyDialog.draft.style === 'color' ||
                    symbologyDialog.draft.style === 'color_size' ||
                    (isUnique && geometryKind !== 'line')
                  const showSize = symbologyDialog.draft.style === 'size' || symbologyDialog.draft.style === 'color_size'
                  const showMethod =
                    symbologyDialog.draft.style !== 'unique' &&
                    symbologyDialog.draft.style !== 'threshold_markers' &&
                    symbologyDialog.draft.style !== 'single'
                  const showClasses = !isSingle
                  const showFieldSelector = !isSingle
                  const appearance = symbologyDialog.draftAppearance
                  const previewDash = strokeDashFromStyle(appearance.strokeStyle)
                  const legendItems = (() => {
                    const items: Array<{ label: string; kind: 'line' | 'point' | 'polygon'; color: string; width: number; dash?: string; fill?: string }> = []
                    if (!ctx) return items
                    const baseStroke = symbologyLayer.color || '#22c55e'
                    const baseWeight = symbologyLayer.weight ?? 2
                    const kind: 'line' | 'point' | 'polygon' = geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line'
                    const arcDef = symbologyLayer.arcgisLayerDefinition ?? null
                    const fieldsByLower = buildArcFieldsByLower(arcDef)
                    const fieldNm = symbologyDialog.draft.field
                    const layerFeatures = Array.isArray((symbologyLayer.data as any)?.features)
                      ? ((symbologyLayer.data as any).features as any[])
                      : []
                    const uniqueLegendLabel = (val: string) => {
                      if (!fieldNm) return val
                      const rep = layerFeatures.find((f: any) => {
                        const r = f?.properties?.[fieldNm]
                        if (r === null || r === undefined || r === '') return false
                        return String(r) === val
                      })
                      if (rep && arcDef) {
                        const raw = rep.properties?.[fieldNm]
                        return arcSchemaDisplayValue(rep, fieldNm, raw, arcDef, fieldsByLower, 'description').display || val
                      }
                      if (arcDef) return arcLegendLabelForFieldValue(fieldNm, val, arcDef, fieldsByLower)
                      return val
                    }
                    if (symbologyDialog.draft.style === 'single') {
                      const fill = appearance.fillColor
                      items.push({
                        label: 'Base symbol',
                        kind,
                        color: appearance.color,
                        width: appearance.weight,
                        dash: previewDash || undefined,
                        fill,
                      })
                      return items
                    }
                    if (symbologyDialog.draft.style === 'unique') {
                      if (kind === 'line') {
                        const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.uniqueDashes)
                        vals.slice(0, 12).forEach((val) => {
                          items.push({
                            label: uniqueLegendLabel(val),
                            kind,
                            color: baseStroke,
                            width: baseWeight,
                            dash: ctx.uniqueDashes[val] ?? '',
                          })
                        })
                        if (vals.length === 0) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight })
                        return items
                      }
                      const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors)
                      vals.slice(0, 12).forEach((val) => {
                        const fill = ctx.categoryColors[val] ?? ctx.otherColor
                        items.push({
                          label: uniqueLegendLabel(val),
                          kind,
                          color: darkenColor(fill, 0.25),
                          width: baseWeight,
                          fill,
                        })
                      })
                      if (vals.length === 0) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke })
                      return items
                    }
                    if (symbologyDialog.draft.style === 'threshold_markers') {
                      items.push({ label: 'Base', kind, color: baseStroke, width: baseWeight })
                      items.push({ label: `Marker ≥ ${ctx.threshold.toFixed(2)}`, kind: 'point', color: '#ef4444', width: 4, fill: '#ef4444' })
                      return items
                    }
                    const breaks = ctx.breaks
                    for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
                      const a = breaks[i]
                      const b = breaks[i + 1]
                      const label = `${a.toFixed(2)} – ${b.toFixed(2)}`
                      const color = showColor ? ctx.colors[i] ?? baseStroke : baseStroke
                      const width = showSize ? ctx.widths[i] ?? baseWeight : baseWeight
                      const dash = symbologyDialog.draft.style === 'dot_density' ? ctx.dotDashes[i] : undefined
                      if (kind === 'polygon') {
                        const fill = showColor ? color : baseStroke
                        items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill })
                      } else if (kind === 'point') {
                        const fill = showColor ? color : baseStroke
                        items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill })
                      } else {
                        items.push({ label, kind, color, width, dash })
                      }
                    }
                    return items
                  })()

                  return (
                    <>
                      <button
                        type="button"
                        className="gis-style-acc-trigger"
                        onClick={() =>
                          setSymbologyStudioSections(s => {
                            const n = { ...s, visualization: !s.visualization }
                            saveGisStudioPrefs(n)
                            return n
                          })
                        }
                      >
                        <i className={`fa-solid fa-chevron-${symbologyStudioSections.visualization ? 'down' : 'right'}`} aria-hidden />
                        <span>Visualization & classification</span>
                      </button>
                      {symbologyStudioSections.visualization ? (
                      <div className="gis-style-card">
                      <div className="gis-style-grid">
                        <div className="gis-style-field">
                          <div className="gis-style-label">Style</div>
                          <div className="gis-style-selectwrap">
                            <select
                              className="gis-style-select"
                              value={symbologyDialog.draft.style}
                              onChange={(e) => updateSymbologyDraft({ style: e.target.value as SymbologyStyle })}
                            >
                              <option value="single">Location (single symbol)</option>
                              <option value="unique">Types (unique symbols)</option>
                              <option value="color">Counts and Amounts (color)</option>
                              <option value="size">Counts and Amounts (size)</option>
                              <option value="color_size">Counts and Amounts (color + size)</option>
                              <option value="dot_density">Dot density</option>
                              <option value="threshold_markers">Single symbol + threshold markers</option>
                            </select>
                            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                          </div>
                        </div>

                        {showFieldSelector ? (
                          <div className="gis-style-field">
                            <div className="gis-style-label">{isUnique ? 'Attribute (categorical)' : 'Attribute (numeric)'}</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={symbologyDialog.draft.field}
                                onChange={(e) => updateSymbologyDraft({ field: e.target.value })}
                              >
                                {isUnique ? (allFields.length ? null : <option value="">No fields</option>) : numericFields.length ? null : <option value="">No numeric fields</option>}
                                {(isUnique ? allFields : numericFields).map(f => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                        ) : null}

                        {showColor ? (
                          <div className="gis-style-field">
                            <div className="gis-style-label">Color ramp</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={symbologyDialog.draft.colorRamp}
                                onChange={(e) => updateSymbologyDraft({ colorRamp: e.target.value as SymbologyColorRamp })}
                              >
                                <option value="viridis">Viridis</option>
                                <option value="blues">Blues</option>
                                <option value="greens">Greens</option>
                                <option value="plasma">Plasma</option>
                                <option value="magma">Magma</option>
                                <option value="turbo">Turbo</option>
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                        ) : null}

                        {showClasses ? (
                          <div className="gis-style-field">
                            <div className="gis-style-label">{isUnique ? 'Max categories' : 'Classes'}</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={String(classes)}
                                onChange={(e) => updateSymbologyDraft({ classes: parseInt(e.target.value, 10) })}
                              >
                                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                  <option key={n} value={String(n)}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                        ) : null}

                        {showMethod ? (
                          <div className="gis-style-field">
                            <div className="gis-style-label">Method</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={symbologyDialog.draft.method}
                                onChange={(e) => updateSymbologyDraft({ method: e.target.value as SymbologyClassMethod })}
                              >
                                <option value="jenks">Natural breaks</option>
                                <option value="quantile">Quantile</option>
                                <option value="equal_interval">Equal interval</option>
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                        ) : null}

                        {symbologyDialog.draft.style === 'threshold_markers' ? (
                          <div className="gis-style-field">
                            <div className="gis-style-label">Threshold</div>
                            <input
                              className="gis-style-input"
                              type="number"
                              value={Number.isFinite(symbologyDialog.draft.threshold) ? String(symbologyDialog.draft.threshold) : ''}
                              onChange={(e) => updateSymbologyDraft({ threshold: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                              placeholder="Threshold"
                            />
                          </div>
                        ) : null}
                      </div>
                      </div>
                      ) : null}

                      <button
                        type="button"
                        className="gis-style-acc-trigger"
                        onClick={() =>
                          setSymbologyStudioSections(s => {
                            const n = { ...s, studio: !s.studio }
                            saveGisStudioPrefs(n)
                            return n
                          })
                        }
                      >
                        <i className={`fa-solid fa-chevron-${symbologyStudioSections.studio ? 'down' : 'right'}`} aria-hidden />
                        <span>Symbol Style Studio</span>
                      </button>
                      {symbologyStudioSections.studio ? (
                      <div className="gis-style-card">
                        <div className="gis-style-panel-title">Symbol appearance</div>
                        <div className="gis-style-preset-row" role="list">
                          {GIS_STYLE_PRESETS.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="gis-style-preset-chip"
                              onClick={() => updateSymbologyAppearance(p.patch)}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="gis-style-grid">
                          <div className="gis-style-field">
                            <div className="gis-style-label">Fill</div>
                            <input className="gis-style-input" type="color" value={appearance.fillColor} onChange={(e) => updateSymbologyAppearance({ fillColor: e.target.value })} />
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Outline</div>
                            <input className="gis-style-input" type="color" value={appearance.color} onChange={(e) => updateSymbologyAppearance({ color: e.target.value })} />
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Fill style (map)</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={appearance.fillStyle}
                                onChange={(e) => updateSymbologyAppearance({ fillStyle: e.target.value as GisFillStyle })}
                              >
                                <option value="solid">Solid</option>
                                <option value="pattern">Pattern</option>
                                <option value="hatch">Hatch</option>
                                <option value="gradient">Gradient</option>
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Blend mode</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={appearance.blendMode}
                                onChange={(e) =>
                                  updateSymbologyAppearance({
                                    blendMode: e.target.value as NonNullable<LayerData['blendMode']>,
                                  })
                                }
                              >
                                <option value="normal">Normal</option>
                                <option value="multiply">Multiply</option>
                                <option value="screen">Screen</option>
                                <option value="overlay">Overlay</option>
                                <option value="darken">Darken</option>
                                <option value="lighten">Lighten</option>
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Stroke style</div>
                            <div className="gis-style-selectwrap">
                              <select
                                className="gis-style-select"
                                value={appearance.strokeStyle}
                                onChange={(e) => updateSymbologyAppearance({ strokeStyle: e.target.value as SymbologyStrokeStyle })}
                              >
                                <option value="solid">Solid</option>
                                <option value="dashed">Dashed</option>
                                <option value="dotted">Dotted</option>
                                <option value="dashdot">Dash-dot</option>
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                            </div>
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Width ({appearance.weight.toFixed(1)} px)</div>
                            <input
                              className="gis-style-input"
                              type="range"
                              min={0.5}
                              max={16}
                              step={0.5}
                              value={appearance.weight}
                              onChange={(e) => updateSymbologyAppearance({ weight: Number(e.target.value) })}
                            />
                          </div>
                          <div className="gis-style-field">
                            <div className="gis-style-label">Transparency ({Math.round((1 - appearance.opacity) * 100)}%)</div>
                            <input
                              className="gis-style-input"
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round((1 - appearance.opacity) * 100)}
                              onChange={(e) => updateSymbologyAppearance({ opacity: 1 - Number(e.target.value) / 100 })}
                            />
                          </div>
                          {geometryKind === 'polygon' || geometryKind === 'other' ? (
                            <div className="gis-style-field">
                              <div className="gis-style-label">Polygon fill strength ({Math.round(appearance.polygonFillAlpha * 100)}%)</div>
                              <input
                                className="gis-style-input"
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={Math.round(appearance.polygonFillAlpha * 100)}
                                onChange={(e) => updateSymbologyAppearance({ polygonFillAlpha: Number(e.target.value) / 100 })}
                              />
                            </div>
                          ) : null}
                          {geometryKind === 'point' || geometryKind === 'other' ? (
                            <div className="gis-style-field">
                              <div className="gis-style-label">Point size ({appearance.pointRadius}px)</div>
                              <input
                                className="gis-style-input"
                                type="range"
                                min={3}
                                max={24}
                                step={1}
                                value={appearance.pointRadius}
                                onChange={(e) => updateSymbologyAppearance({ pointRadius: Number(e.target.value) })}
                              />
                            </div>
                          ) : null}
                          {geometryKind === 'polygon' || geometryKind === 'other' ? (
                            <div className="gis-style-field">
                              <div className="gis-style-label">Preview corner radius ({appearance.previewCornerRadius}px)</div>
                              <input
                                className="gis-style-input"
                                type="range"
                                min={0}
                                max={20}
                                step={1}
                                value={appearance.previewCornerRadius}
                                onChange={(e) => updateSymbologyAppearance({ previewCornerRadius: Number(e.target.value) })}
                              />
                            </div>
                          ) : null}
                          <div className="gis-style-field">
                            <div className="gis-style-label">Live preview</div>
                            <div className="gis-style-preview-modes" role="group" aria-label="Preview fill rendering">
                              {(['solid', 'hatch', 'gradient'] as const).map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  className={symbologyFillPreviewMode === m ? 'gis-style-preview-mode active' : 'gis-style-preview-mode'}
                                  onClick={() => setSymbologyFillPreviewMode(m)}
                                >
                                  {m === 'solid' ? 'Solid' : m === 'hatch' ? 'Hatch' : 'Gradient'}
                                </button>
                              ))}
                            </div>
                            <div className="gis-style-preview-box">
                              {(() => {
                                const pid = String(symbologyLayer.id).replace(/[^a-zA-Z0-9_-]/g, '_')
                                const gid = `gisSymGrad-${pid}`
                                const hid = `gisSymHatch-${pid}`
                                let polyFillUrl = appearance.fillColor
                                if (geometryKind === 'polygon' || geometryKind === 'other') {
                                  if (symbologyFillPreviewMode === 'gradient') polyFillUrl = `url(#${gid})`
                                  else if (symbologyFillPreviewMode === 'hatch') polyFillUrl = `url(#${hid})`
                                }
                                const pr = Math.max(4, Math.min(20, appearance.pointRadius))
                                const rx = Math.max(0, Math.min(20, appearance.previewCornerRadius))
                                return (
                              <svg width="100%" height="72" viewBox="0 0 240 72" aria-hidden="true">
                                <defs>
                                  <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={appearance.fillColor} stopOpacity="1" />
                                    <stop offset="100%" stopColor={appearance.color} stopOpacity="0.95" />
                                  </linearGradient>
                                  <pattern id={hid} width="10" height="10" patternUnits="userSpaceOnUse">
                                    <path
                                      d="M0,10 L10,0 M-2,2 L2,-2 M8,12 L12,8"
                                      stroke={appearance.color}
                                      strokeWidth="1.2"
                                      opacity="0.55"
                                    />
                                  </pattern>
                                </defs>
                                {geometryKind === 'line' ? (
                                  <line
                                    x1="14"
                                    y1="36"
                                    x2="226"
                                    y2="36"
                                    stroke={appearance.color}
                                    strokeWidth={Math.max(1, appearance.weight)}
                                    strokeDasharray={previewDash || undefined}
                                    strokeLinecap="round"
                                    opacity={appearance.opacity}
                                  />
                                ) : geometryKind === 'point' ? (
                                  <circle
                                    cx="120"
                                    cy="36"
                                    r={pr}
                                    fill={appearance.fillColor}
                                    stroke={appearance.color}
                                    strokeWidth={Math.max(1, appearance.weight * 0.55)}
                                    opacity={appearance.opacity}
                                  />
                                ) : (
                                  <rect
                                    x="60"
                                    y="14"
                                    width="120"
                                    height="44"
                                    rx={rx}
                                    ry={rx}
                                    fill={polyFillUrl}
                                    stroke={appearance.color}
                                    strokeWidth={Math.max(1, appearance.weight)}
                                    strokeDasharray={previewDash || undefined}
                                    opacity={appearance.opacity}
                                  />
                                )}
                              </svg>
                                )
                              })()}
                            </div>
                            <div className="gis-style-preview-hint">
                              2D map uses Leaflet paths (live). 3D globe uses Mapbox paint. Hatch/gradient show fully here; on the map, hatch/gradient adjust fill weight slightly except in this preview.
                            </div>
                          </div>
                        </div>
                      </div>
                      ) : null}

                      <button
                        type="button"
                        className="gis-style-acc-trigger"
                        onClick={() =>
                          setSymbologyStudioSections(s => {
                            const n = { ...s, legend: !s.legend }
                            saveGisStudioPrefs(n)
                            return n
                          })
                        }
                      >
                        <i className={`fa-solid fa-chevron-${symbologyStudioSections.legend ? 'down' : 'right'}`} aria-hidden />
                        <span>Legend preview</span>
                      </button>
                      {symbologyStudioSections.legend ? (
                      <div className="gis-style-card gis-style-card-legend">
                      <div className="gis-style-legend">
                        {legendItems.map((it, idx) => (
                          <div key={idx} className="gis-style-legend-row">
                            <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
                              {it.kind === 'line' ? (
                                <line
                                  x1="4"
                                  y1="7"
                                  x2="58"
                                  y2="7"
                                  stroke={it.color}
                                  strokeWidth={it.width}
                                  strokeLinecap="round"
                                  strokeDasharray={it.dash || undefined}
                                />
                              ) : it.kind === 'polygon' ? (
                                <rect x="18" y="2" width="26" height="10" rx="3" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                              ) : (
                                <circle cx="31" cy="7" r="5" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                              )}
                            </svg>
                            <div className="gis-style-legend-text">{it.label}</div>
                          </div>
                        ))}
                      </div>
                      </div>
                      ) : null}
                    </>
                  )
                })()
              )}
            </div>

            <div className="gis-style-footer">
              <button className="gis-btn" type="button" onClick={cancelSymbology}>
                Cancel
              </button>
              <button className="gis-btn gis-btn-primary" type="button" onClick={saveSymbology}>
                Save Style
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <GisDataManager
          open={isAddOpen}
          onClose={closeAddLayerModal}
          initialCategory="vector"
          portalItems={[]}
          statusExternal={discoverError || undefined}
          onAddPortalRow={() => {}}
          onImportFiles={async (files, opts) => {
            const file = files[0]
            if (!file) throw new Error('No file selected')
            if (opts?.layerName) setLayerName(opts.layerName)
            setUploadFile(file)
            const parsed = await parseFile(file)
            if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
            let geojson: any = parsed.data
            if (Array.isArray(geojson)) geojson = geojson[0]
            const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
            if (!normalized.features.length) throw new Error('No drawable features found in file.')
            const name = (opts?.layerName || layerName).trim() || file.name.replace(/\.[^.]+$/, '').trim() || 'Layer'
            const hostedRow = publishVectorGeoJsonAsHostedFeatureLayer({
              title: name,
              geojson: normalized as GisHostedFeatureLayerGeoJson,
              sourceMethod: 'upload',
              sourceFileName: file.name,
            })
            const portalUrl = gisContentPortalLayerUrl(hostedRow.id)
            const newLayer: LayerData = {
              id: `hosted:${hostedRow.id}`,
              name: hostedRow.title,
              type: 'geojson',
              source: 'gis-portal',
              visible: true,
              opacity: 1,
              data: normalized,
              url: portalUrl,
              ...siDefaultNewVectorLayerFields(),
            }
            setLayers(prev => [...prev, newLayer])
            setSelectionNotice(`Published "${hostedRow.title}" as hosted feature layer in GIS Content.`)
            closeAddLayerModal()
          }}
          onImportRemoteUrl={async (url, opts) => {
            if (opts?.layerName) setLayerName(opts.layerName)
            setRemoteDataUrl(url)
            const file = await parseRemoteUrlAsFile(url)
            if (opts?.layerName) setLayerName(opts.layerName)
            setUploadFile(file)
            const parsed = await parseFile(file)
            if (parsed.type !== 'geojson') throw new Error('Remote file must contain GIS features.')
            let geojson: any = parsed.data
            if (Array.isArray(geojson)) geojson = geojson[0]
            const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
            if (!normalized.features.length) throw new Error('No drawable features found.')
            const name = (opts?.layerName || layerName).trim() || parsed.filename || 'Remote Layer'
            const hostedRow = publishVectorGeoJsonAsHostedFeatureLayer({
              title: name,
              geojson: normalized as GisHostedFeatureLayerGeoJson,
              sourceMethod: 'upload',
              sourceFileName: parsed.filename,
            })
            setLayers(prev => [
              ...prev,
              {
                id: `hosted:${hostedRow.id}`,
                name: hostedRow.title,
                type: 'geojson',
                source: 'gis-portal',
                visible: true,
                opacity: 1,
                data: normalized,
                url: gisContentPortalLayerUrl(hostedRow.id),
                ...siDefaultNewVectorLayerFields(),
              },
            ])
            closeAddLayerModal()
          }}
          onConnectArcGis={async (url, token, name) => {
            setServiceUrl(url)
            if (token) setToken(token)
            if (name) setLayerName(name)
            setDiscoverError('Paste confirmed. Use ArcGIS Connect from Satellite Intelligence Data Manager for full discovery, or save the URL for this session.')
          }}
        />
      ) : null}

      <SelectMapFromGisContentModal
        open={openWebMapModalOpen}
        onClose={() => setOpenWebMapModalOpen(false)}
        onSelect={handleOpenPortalWebMapRow}
        title="Open map"
        webMapsOnly
      />
    </div>
  )
}
