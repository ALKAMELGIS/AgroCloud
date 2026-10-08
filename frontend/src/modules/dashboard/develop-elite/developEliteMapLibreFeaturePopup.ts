import maplibregl, {
  type Map as MaplibreMap,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl'
import { bbox } from '@turf/turf'
import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import { DEVELOP_ELITE_MAP_DATA_LAYERS } from './developEliteMapDataLayers'
import {
  buildDevelopEliteArcgisFeaturePopupHtml,
  developEliteMapLayerSupportsPopup,
  DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS,
  wireDevelopEliteMapPopupPager,
  wireDevelopEliteMapPopupZoomButton,
} from './developEliteMapFeaturePopup'
import { DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS } from './developEliteMapLibreOverlays'
import { DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS } from './developEliteMapLibreStructureFlash'
import { developEliteMapLibreCinematicFlyToBbox } from './developEliteMapLibreCinematicFly'
import { developEliteMapLibreHasLayer } from './developEliteMapLibreStyle'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'
import {
  enrichDevelopEliteMapIdentifyFeature,
  fallbackDevelopEliteMapIdentifyAtLngLat,
} from './developEliteMapLibreIdentify'
import { developEliteMapAllowsPrimaryPointerOrbit } from './developEliteMapLibreOrbit'

export type DevelopEliteMapLibreFeaturePopupOpts = {
  viewMode3d: boolean
  identifyHitRadiusPx?: number
  countryLabels?: Map<string, string> | null
  sources?: DevelopEliteMapSearchSources | null
  structuresDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  onSelectStructureFieldKey?: (fieldKey: string) => void
}

const DEFAULT_IDENTIFY_HIT_RADIUS_PX = 8
const TAP_IDENTIFY_MAX_MOVE_PX = 6

type PopupCandidate = {
  feature: GeoJSON.Feature
  layerKey: DevelopEliteMapDataLayerId
}

const HIGHLIGHT_LAYER_TO_DATA: Record<string, DevelopEliteMapDataLayerId> = {
  'de-agro-structures-highlight-fill': 'agro-structures',
  'de-agro-structures-highlight-extrude': 'agro-structures',
  'de-agro-structures-highlight-line': 'agro-structures',
}

const OVERLAY_LAYER_TO_DATA: Record<string, DevelopEliteMapDataLayerId> = {
  'de-agro-structures-fill': 'agro-structures',
  'de-agro-structures-extrude': 'agro-structures',
  'de-agro-structures-line': 'agro-structures',
  'de-trees-circle': 'trees',
  'de-trees-icon': 'trees',
  'de-trees-extrude': 'trees',
  'de-irrigation-valves-circle': 'irrigation-valves',
  'de-irrigation-valves-icon': 'irrigation-valves',
  'de-irrigation-main-pipe-line': 'irrigation-main-pipe',
  'de-irrigation-main-pipe-arrows': 'irrigation-main-pipe',
  'de-agri-location-circle': 'agri-location',
  'de-agri-location-icon': 'agri-location',
}

const LAYER_LABEL = new Map(DEVELOP_ELITE_MAP_DATA_LAYERS.map(row => [row.id, row.label]))

function resolvePopupDataLayer(layerId: string): DevelopEliteMapDataLayerId | null {
  return HIGHLIGHT_LAYER_TO_DATA[layerId] ?? OVERLAY_LAYER_TO_DATA[layerId] ?? null
}

function drawingInfoForLayer(
  layerKey: DevelopEliteMapDataLayerId,
  opts: DevelopEliteMapLibreFeaturePopupOpts,
): Record<string, unknown> | null {
  switch (layerKey) {
    case 'agro-structures':
      return opts.structuresDrawingInfo ?? null
    case 'trees':
      return opts.treesDrawingInfo ?? null
    case 'irrigation-valves':
      return opts.irrigationValvesDrawingInfo ?? null
    case 'irrigation-main-pipe':
      return opts.irrigationMainPipeDrawingInfo ?? null
    case 'agri-location':
      return opts.agriLocationDrawingInfo ?? null
    default:
      return null
  }
}

function queryPopupLayerIds(map: MaplibreMap): string[] {
  const ids = [...DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS, ...DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS]
  return ids.filter(id => {
    if (!developEliteMapLibreHasLayer(map, id)) return false
    try {
      const visibility = map.getLayoutProperty(id, 'visibility')
      return visibility !== 'none'
    } catch {
      return true
    }
  })
}

function queryIdentifyFeatures(
  map: MaplibreMap,
  point: { x: number; y: number },
  layerIds: string[],
  radiusPx: number,
): ReturnType<MaplibreMap['queryRenderedFeatures']> {
  if (!layerIds.length) return []
  let hits = map.queryRenderedFeatures([point.x, point.y], { layers: layerIds })
  if (hits.length) return hits
  const radius = Math.max(4, radiusPx)
  const box: [[number, number], [number, number]] = [
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius],
  ]
  return map.queryRenderedFeatures(box, { layers: layerIds })
}

export function zoomDevelopEliteMapLibreFeature(
  map: MaplibreMap,
  feature: GeoJSON.Feature,
  viewMode3d: boolean,
): void {
  if (!feature.geometry) return
  try {
    const box = bbox(feature) as [number, number, number, number]
    developEliteMapLibreCinematicFlyToBbox(map, box, {
      viewMode3d,
      padding: 56,
      maxZoom: 17,
    })
  } catch {
    /* ignore */
  }
}

export function registerDevelopEliteMapLibreFeaturePopup(
  map: MaplibreMap,
  opts: DevelopEliteMapLibreFeaturePopupOpts,
): () => void {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    className: `${DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS} develop-elite-map-popup-wrap--ago`,
    maxWidth: '320px',
    offset: 16,
    anchor: 'bottom',
  })

  let identifyStack: PopupCandidate[] = []
  let identifyIndex = 0
  let identifyLngLat: [number, number] | null = null

  const boundLayerIds = new Set<string>()

  const candidateDedupeKey = (candidate: PopupCandidate): string => {
    const enriched = enrichDevelopEliteMapIdentifyFeature(candidate.feature, candidate.layerKey, opts.sources)
    const stable = computeStableGisFeatureKey(enriched)
    if (stable) return `${candidate.layerKey}:${stable}`
    const oid = (enriched.properties as Record<string, unknown> | undefined)?.OBJECTID
    return `${candidate.layerKey}:${String(oid ?? '')}:${candidate.layerKey}`
  }

  const hitsToCandidates = (hits: ReturnType<MaplibreMap['queryRenderedFeatures']>): PopupCandidate[] => {
    const seen = new Set<string>()
    const out: PopupCandidate[] = []
    for (const hit of hits) {
      const layerKey = resolvePopupDataLayer(hit.layer.id)
      if (!layerKey || !developEliteMapLayerSupportsPopup(layerKey)) continue
      const geometry = hit.geometry as GeoJSON.Geometry | undefined
      if (!geometry) continue
      const feature: GeoJSON.Feature = {
        type: 'Feature',
        geometry,
        properties: (hit.properties ?? {}) as Record<string, unknown>,
      }
      const candidate: PopupCandidate = { feature, layerKey }
      const key = candidateDedupeKey(candidate)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(candidate)
    }
    return out
  }

  const wirePopupActions = (feature: GeoJSON.Feature) => {
    const root = popup.getElement()
    wireDevelopEliteMapPopupZoomButton(root, () => {
      zoomDevelopEliteMapLibreFeature(map, feature, opts.viewMode3d)
    })
    wireDevelopEliteMapPopupPager(root, {
      onPrev:
        identifyStack.length > 1
          ? () => {
              identifyIndex = Math.max(0, identifyIndex - 1)
              renderIdentifyPopup()
            }
          : undefined,
      onNext:
        identifyStack.length > 1
          ? () => {
              identifyIndex = Math.min(identifyStack.length - 1, identifyIndex + 1)
              renderIdentifyPopup()
            }
          : undefined,
    })
  }

  const renderIdentifyPopup = () => {
    if (!identifyLngLat || !identifyStack.length) return
    const candidate = identifyStack[identifyIndex]
    if (!candidate) return

    const enriched = enrichDevelopEliteMapIdentifyFeature(candidate.feature, candidate.layerKey, opts.sources)
    const props = (enriched.properties ?? {}) as Record<string, unknown>
    const layerTitle = LAYER_LABEL.get(candidate.layerKey) ?? candidate.layerKey
    const html = buildDevelopEliteArcgisFeaturePopupHtml(layerTitle, props, {
      layerKey: candidate.layerKey,
      drawingInfo: drawingInfoForLayer(candidate.layerKey, opts),
      countryLabels: opts.countryLabels ?? null,
      agoStyle: true,
      pageIndex: identifyIndex,
      pageTotal: identifyStack.length,
    })

    popup.setHTML(html).setLngLat(identifyLngLat).addTo(map)
    wirePopupActions(enriched)

    if (candidate.layerKey === 'agro-structures' && opts.onSelectStructureFieldKey) {
      const fieldKey = computeStableGisFeatureKey(enriched)
      if (fieldKey) opts.onSelectStructureFieldKey(fieldKey)
    }
  }

  const openIdentifyAtLocation = (candidates: PopupCandidate[], lngLat: [number, number]) => {
    if (!candidates.length) return
    identifyStack = candidates
    identifyIndex = 0
    identifyLngLat = lngLat
    renderIdentifyPopup()
  }

  const identifyHitRadiusPx =
    opts.identifyHitRadiusPx ?? (opts.viewMode3d ? 22 : DEFAULT_IDENTIFY_HIT_RADIUS_PX)

  const runIdentify = (lngLat: [number, number], point: { x: number; y: number }, originalEvent?: MouseEvent) => {
    const layerIds = queryPopupLayerIds(map)
    let candidates: PopupCandidate[] = []
    if (layerIds.length) {
      const hits = queryIdentifyFeatures(map, point, layerIds, identifyHitRadiusPx)
      candidates = hitsToCandidates(hits)
    }

    if (!candidates.length) {
      const fallback = fallbackDevelopEliteMapIdentifyAtLngLat(lngLat, opts.sources, opts.viewMode3d)
      if (fallback) {
        candidates = [{ feature: fallback.feature, layerKey: fallback.layerKey }]
      }
    }

    if (!candidates.length) return

    openIdentifyAtLocation(candidates, lngLat)
    originalEvent?.preventDefault()
    originalEvent?.stopPropagation()
  }

  let pointerTapDown: { x: number; y: number; lngLat: [number, number] } | null = null
  let lastIdentifyAtMs = 0

  const shouldUseTapIdentifyOnMouseUp = (): boolean =>
    opts.viewMode3d && developEliteMapAllowsPrimaryPointerOrbit(map, opts.viewMode3d)

  const onMapClick = (event: MapMouseEvent) => {
    lastIdentifyAtMs = Date.now()
    runIdentify([event.lngLat.lng, event.lngLat.lat], event.point, event.originalEvent)
  }

  const onMapMouseDown = (event: MapMouseEvent) => {
    if (event.originalEvent.button !== 0) return
    pointerTapDown = {
      x: event.point.x,
      y: event.point.y,
      lngLat: [event.lngLat.lng, event.lngLat.lat],
    }
  }

  const onMapMouseUp = (event: MapMouseEvent) => {
    const down = pointerTapDown
    pointerTapDown = null
    if (!down || event.originalEvent.button !== 0 || !shouldUseTapIdentifyOnMouseUp()) return
    const dx = event.point.x - down.x
    const dy = event.point.y - down.y
    if (dx * dx + dy * dy > TAP_IDENTIFY_MAX_MOVE_PX * TAP_IDENTIFY_MAX_MOVE_PX) return
    if (Date.now() - lastIdentifyAtMs < 120) return
    runIdentify(down.lngLat, { x: down.x, y: down.y }, event.originalEvent)
  }

  const onLayerClick = (event: MapLayerMouseEvent) => {
    if (!event.features?.length) return
    const lngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat]
    const candidates = hitsToCandidates(event.features)
    if (!candidates.length) return
    openIdentifyAtLocation(candidates, lngLat)
    event.preventDefault()
  }

  const syncLayerClickHandlers = () => {
    const layerIds = queryPopupLayerIds(map)
    for (const id of layerIds) {
      if (boundLayerIds.has(id)) continue
      map.on('click', id, onLayerClick)
      boundLayerIds.add(id)
    }
  }

  const onEnter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
  }

  const bindCursorHandlers = () => {
    for (const id of queryPopupLayerIds(map)) {
      map.on('mouseenter', id, onEnter)
      map.on('mouseleave', id, onLeave)
    }
  }

  const unbindCursorHandlers = () => {
    for (const id of [...DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS, ...DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS]) {
      map.off('mouseenter', id, onEnter)
      map.off('mouseleave', id, onLeave)
    }
  }

  syncLayerClickHandlers()
  bindCursorHandlers()
  map.on('click', onMapClick)
  map.on('mousedown', onMapMouseDown)
  map.on('mouseup', onMapMouseUp)
  map.on('idle', syncLayerClickHandlers)

  return () => {
    popup.remove()
    map.off('click', onMapClick)
    map.off('mousedown', onMapMouseDown)
    map.off('mouseup', onMapMouseUp)
    map.off('idle', syncLayerClickHandlers)
    for (const id of boundLayerIds) {
      map.off('click', id, onLayerClick)
    }
    boundLayerIds.clear()
    unbindCursorHandlers()
  }
}
