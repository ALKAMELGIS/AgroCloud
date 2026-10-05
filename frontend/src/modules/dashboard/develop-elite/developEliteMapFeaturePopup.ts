import {
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import {
  resolveAgroStructuresCountryDisplayName,
  resolveAgroStructuresStructureTypeLabel,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import type L from 'leaflet'
import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import { flyToLatLng } from './developEliteMapFly'

export const DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS = 'develop-elite-map-popup-wrap'
export const DEVELOP_ELITE_MAP_POPUP_ZOOM_ATTR = 'data-develop-elite-popup-zoom'

const POPUP_FIELD_SKIP =
  /^(shape|shape__|st_area|st_length|globalid$|created_?(date|user)|last_?edited_?(date|user)|editor_?tracking)/i

const POPUP_FIELD_ORDER = [
  'Farm_Name',
  'Farm_Code',
  'Name',
  'Valve_Name',
  'Valve_Code',
  'DEVELOPERNAME',
  'Crop_Type',
  'Variety',
  'Subtype',
  'SUBTYPE',
  'ZONE_ID',
  'Zone_ID',
  'Country',
  'Country_Name',
  'COUNTRY',
  'ALL_COUNTRY',
  'COUNTRYAFF',
  'CONTINENT',
  'LAND TYPE',
  'LAND_TYPE',
  'Structure_Type',
  'Area_ha',
  'Area_Ha',
  'ProjectCode',
  'Project_Name',
  'Status',
  'Region',
  'City',
]

const LAYER_POPUP_FIELD_PRIORITY: Partial<Record<DevelopEliteMapDataLayerId, string[]>> = {
  'world-countries': ['ALL_COUNTRY', 'COUNTRYAFF', 'CONTINENT', 'STATUS', 'LAND TYPE', 'LAND_TYPE', 'Name'],
  'agro-structures': [
    'Farm_Name',
    'Farm_Code',
    'Structure_Type',
    'Crop_Type',
    'ZONE_ID',
    'Country_Name',
    'Country',
    'Area_ha',
    'ProjectCode',
    'Status',
    'Region',
  ],
  trees: ['Name', 'Tree_Type', 'TREE_TYPE', 'Species', 'Farm_Name', 'Farm_Code', 'ZONE_ID', 'Subtype'],
  'agri-location': ['Name', 'ProjectCode', 'Project_Name', 'Subtype', 'Farm_Name', 'Farm_Code', 'Status', 'Area_ha'],
  'irrigation-valves': [
    'Valve_Name',
    'Valve_Code',
    'DEVELOPERNAME',
    'Farm_Name',
    'Farm_Code',
    'SUBTYPE',
    'Subtype',
    'ZONE_ID',
    'Status',
  ],
  'irrigation-main-pipe': [
    'FACILITYID',
    'DEVELOPERNAME',
    'SUBTYPE',
    'Subtype',
    'COMMENTS',
    'INSTALLATIONDATE',
    'Farm_Name',
    'Farm_Code',
    'ZONE_ID',
  ],
}

export function escapeDevelopEliteMapPopupHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readProp(props: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(props, key)) return props[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(props)) {
    if (k.toLowerCase() === lower) return props[k]
  }
  return undefined
}

function shouldSkipPopupField(key: string): boolean {
  if (!key || POPUP_FIELD_SKIP.test(key)) return true
  if (key.startsWith('__')) return true
  if (/^objectid$/i.test(key)) return true
  return false
}

function popupRowLabel(key: string): string {
  const normalized = key.replace(/_/g, ' ').trim()
  if (!normalized) return key
  return normalized.replace(/\b\w/g, ch => ch.toUpperCase())
}

function resolvePopupMaxRows(
  layerKey: DevelopEliteMapDataLayerId | undefined,
  maxRows?: number,
): number {
  if (maxRows != null) return maxRows
  if (layerKey === 'agri-location') return 6
  if (layerKey === 'trees') return 7
  if (layerKey === 'irrigation-valves') return 8
  if (layerKey === 'irrigation-main-pipe') return 8
  return 8
}

function uniqueValueLabel(
  drawingInfo: Record<string, unknown> | null | undefined,
  field: string,
  raw: unknown,
): string | null {
  const ren = (drawingInfo as { renderer?: { type?: string; field1?: string } } | null)?.renderer
  if (!ren || String(ren.type || '') !== 'uniqueValue') return null
  const renField = String(ren.field1 ?? '').trim()
  if (renField && renField.toLowerCase() !== field.toLowerCase()) return null
  const key = normalizeUniqueValueKey(raw)
  for (const uvi of flattenArcgisUniqueValueInfos(ren)) {
    if (normalizeUniqueValueKey(uvi?.value) === key) {
      const lab = String(uvi?.label ?? '').trim()
      return lab || null
    }
  }
  return null
}

function formatPopupValue(
  key: string,
  raw: unknown,
  layerKey: DevelopEliteMapDataLayerId | undefined,
  drawingInfo: Record<string, unknown> | null | undefined,
  countryLabels: Map<string, string> | null | undefined,
): string {
  if (raw === null || raw === undefined || raw === '') return ''
  if (layerKey === 'agro-structures' && key.toLowerCase() === 'structure_type') {
    return resolveAgroStructuresStructureTypeLabel({ Structure_Type: raw })
  }
  if (
    (key === 'Country' || key === 'Country_Name' || key === 'COUNTRY') &&
    countryLabels?.size
  ) {
    const code = String(raw).trim()
    const fromDomain = countryLabels.get(code)
    if (fromDomain) return fromDomain
  }
  const uv = uniqueValueLabel(drawingInfo, key, raw)
  if (uv) return uv
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (key.toLowerCase().includes('area')) {
      return raw.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
    return String(raw)
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  return String(raw).trim()
}

function popupFieldKeys(
  props: Record<string, unknown>,
  layerKey?: DevelopEliteMapDataLayerId,
): string[] {
  const keys = Object.keys(props).filter(k => !shouldSkipPopupField(k))
  const layerOrder = layerKey ? LAYER_POPUP_FIELD_PRIORITY[layerKey] : undefined
  const orderIndex = new Map(
    (layerOrder ?? POPUP_FIELD_ORDER).map((k, i) => [k.toLowerCase(), i]),
  )
  for (const k of POPUP_FIELD_ORDER) {
    if (!orderIndex.has(k.toLowerCase())) {
      orderIndex.set(k.toLowerCase(), orderIndex.size)
    }
  }
  return keys.sort((a, b) => {
    const ai = orderIndex.get(a.toLowerCase())
    const bi = orderIndex.get(b.toLowerCase())
    if (ai != null && bi != null) return ai - bi
    if (ai != null) return -1
    if (bi != null) return 1
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
}

/** Re-open popup after React/Leaflet rebinds layers (e.g. structure selection). */
export function scheduleDevelopEliteMapPopupReopen(
  resolveLayer: () => L.Layer | undefined,
  latlng: L.LatLng,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const layer = resolveLayer()
      if (!layer) return
      layer.openPopup(latlng)
    })
  })
}

export function wireDevelopEliteMapFeatureActivate(
  layer: L.Layer,
  onActivate: () => void,
  resolveLayer: () => L.Layer | undefined,
): void {
  layer.on('click', (event: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(event)
    onActivate()
    scheduleDevelopEliteMapPopupReopen(resolveLayer, event.latlng)
  })
}

function buildDevelopEliteMapPopupHeadHtml(layerTitle: string): string {
  const title = escapeDevelopEliteMapPopupHtml(layerTitle)
  return `<div class="develop-elite-map-popup__head"><span class="develop-elite-map-popup__title">${title}</span><button type="button" class="develop-elite-map-popup__zoom" title="Zoom to location" aria-label="Zoom to location" ${DEVELOP_ELITE_MAP_POPUP_ZOOM_ATTR}><i class="fa-solid fa-magnifying-glass-location" aria-hidden="true"></i></button></div>`
}

export function zoomDevelopEliteMapPopupLayer(map: L.Map, layer: L.Layer): void {
  try {
    const withBounds = layer as L.Polyline
    if (typeof withBounds.getBounds === 'function') {
      const bounds = withBounds.getBounds()
      if (bounds?.isValid?.()) {
        map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 17, duration: 0.7 })
        return
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const marker = layer as L.Marker
    if (typeof marker.getLatLng === 'function') {
      const ll = marker.getLatLng()
      if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
        flyToLatLng(map, ll.lat, ll.lng, Math.max(map.getZoom(), 15))
      }
    }
  } catch {
    /* ignore */
  }
}

function resolveLayerMap(layer: L.Layer): L.Map | null {
  const withMap = layer as L.Layer & { _map?: L.Map | null }
  return withMap._map ?? null
}

export function developEliteMapLayerSupportsPopup(layerKey?: DevelopEliteMapDataLayerId): boolean {
  return layerKey !== 'world-countries'
}

export function bindDevelopEliteMapLayerPopup(
  layer: L.Layer,
  html: string,
  popupOptions?: L.PopupOptions,
  map?: L.Map | null,
): void {
  layer.bindPopup(html, {
    className: DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS,
    maxWidth: 224,
    autoPan: true,
    autoPanPadding: [16, 16],
    keepInView: true,
    ...popupOptions,
  })
  layer.on('popupopen', () => {
    const root = layer.getPopup()?.getElement()
    const btn = root?.querySelector(`[${DEVELOP_ELITE_MAP_POPUP_ZOOM_ATTR}]`)
    if (!(btn instanceof HTMLButtonElement)) return
    if (btn.dataset.dePopupZoomWired === '1') return
    btn.dataset.dePopupZoomWired = '1'
    btn.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      const activeMap = map ?? resolveLayerMap(layer)
      if (activeMap) zoomDevelopEliteMapPopupLayer(activeMap, layer)
    })
  })
}

export function buildDevelopEliteArcgisFeaturePopupHtml(
  layerTitle: string,
  props: Record<string, unknown>,
  options?: {
    layerKey?: DevelopEliteMapDataLayerId
    drawingInfo?: Record<string, unknown> | null
    countryLabels?: Map<string, string> | null
    maxRows?: number
  },
): string {
  const layerKey = options?.layerKey
  const drawingInfo = options?.drawingInfo ?? null
  const countryLabels = options?.countryLabels ?? null
  const maxRows = resolvePopupMaxRows(layerKey, options?.maxRows)

  const rows: Array<{ label: string; value: string }> = []
  for (const key of popupFieldKeys(props, layerKey)) {
    const formatted = formatPopupValue(key, readProp(props, key), layerKey, drawingInfo, countryLabels)
    if (!formatted) continue
    if (
      (key === 'Country' || key === 'COUNTRY') &&
      /^\d+$/.test(formatted) &&
      countryLabels?.size
    ) {
      const named = countryLabels.get(formatted.trim())
      if (named) {
        rows.push({ label: popupRowLabel('Country'), value: named })
        if (rows.length >= maxRows) break
        continue
      }
    }
    rows.push({ label: popupRowLabel(key), value: formatted })
    if (rows.length >= maxRows) break
  }

  if (layerKey === 'agro-structures' && rows.length === 0) {
    const country = resolveAgroStructuresCountryDisplayName(props, countryLabels)
    const title = String(props.Farm_Name ?? props.Farm_Code ?? '').trim()
    if (title) rows.push({ label: 'Farm', value: title })
    if (country && country !== 'Unknown') rows.push({ label: 'Country', value: country })
  }

  const head = buildDevelopEliteMapPopupHeadHtml(layerTitle)
  if (!rows.length) {
    return `<div class="develop-elite-map-popup develop-elite-map-popup--compact">${head}<p class="develop-elite-map-popup__empty">No attributes</p></div>`
  }

  const body = rows
    .map(
      row =>
        `<div class="develop-elite-map-popup__row"><dt>${escapeDevelopEliteMapPopupHtml(row.label)}</dt><dd>${escapeDevelopEliteMapPopupHtml(row.value)}</dd></div>`,
    )
    .join('')

  return `<div class="develop-elite-map-popup develop-elite-map-popup--compact">${head}<dl class="develop-elite-map-popup__attrs develop-elite-map-popup__scroll">${body}</dl></div>`
}
