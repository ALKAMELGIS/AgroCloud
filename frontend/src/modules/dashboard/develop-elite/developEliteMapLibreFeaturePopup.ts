import maplibregl, { type Map as MaplibreMap, type MapMouseEvent } from 'maplibre-gl'
import { bbox } from '@turf/turf'
import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import { DEVELOP_ELITE_MAP_DATA_LAYERS } from './developEliteMapDataLayers'
import {
  buildDevelopEliteArcgisFeaturePopupHtml,
  developEliteMapLayerSupportsPopup,
  DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS,
  wireDevelopEliteMapPopupZoomButton,
} from './developEliteMapFeaturePopup'
import { DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS } from './developEliteMapLibreOverlays'
import { DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS } from './developEliteMapLibreStructureFlash'
import { developEliteMapLibreCinematicFlyToBbox } from './developEliteMapLibreCinematicFly'
import { developEliteMapLibreHasLayer } from './developEliteMapLibreStyle'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'

export type DevelopEliteMapLibreFeaturePopupOpts = {
  viewMode3d: boolean
  countryLabels?: Map<string, string> | null
  structuresDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  onSelectStructureFieldKey?: (fieldKey: string) => void
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
  const ids = [
    ...DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS,
    ...DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS,
  ]
  return ids.filter(id => developEliteMapLibreHasLayer(map, id))
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
    closeOnClick: true,
    className: DEVELOP_ELITE_MAP_POPUP_WRAP_CLASS,
    maxWidth: '224px',
    offset: 12,
    anchor: 'bottom',
  })

  const popupFeatureRef = new WeakMap<maplibregl.Popup, GeoJSON.Feature>()

  const onZoom = (feature: GeoJSON.Feature) => {
    zoomDevelopEliteMapLibreFeature(map, feature, opts.viewMode3d)
  }

  popup.on('open', () => {
    const feature = popupFeatureRef.get(popup)
    wireDevelopEliteMapPopupZoomButton(popup.getElement(), () => {
      if (feature) onZoom(feature)
    })
  })

  const showFeature = (feature: GeoJSON.Feature, layerKey: DevelopEliteMapDataLayerId, lngLat: [number, number]) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const layerTitle = LAYER_LABEL.get(layerKey) ?? layerKey
    const html = buildDevelopEliteArcgisFeaturePopupHtml(layerTitle, props, {
      layerKey,
      drawingInfo: drawingInfoForLayer(layerKey, opts),
      countryLabels: opts.countryLabels ?? null,
    })
    popupFeatureRef.set(popup, feature)
    popup.setHTML(html).setLngLat(lngLat).addTo(map)

    if (layerKey === 'agro-structures' && opts.onSelectStructureFieldKey) {
      const fieldKey = computeStableGisFeatureKey(feature)
      if (fieldKey) opts.onSelectStructureFieldKey(fieldKey)
    }
  }

  const onClick = (event: MapMouseEvent) => {
    const layerIds = queryPopupLayerIds(map)
    if (!layerIds.length) return

    let hits = map.queryRenderedFeatures(event.point, { layers: layerIds })
    if (!hits.length) {
      const radius = 6
      const box: [[number, number], [number, number]] = [
        [event.point.x - radius, event.point.y - radius],
        [event.point.x + radius, event.point.y + radius],
      ]
      hits = map.queryRenderedFeatures(box, { layers: layerIds })
    }
    if (!hits.length) return

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
      event.preventDefault()
      showFeature(feature, layerKey, [event.lngLat.lng, event.lngLat.lat])
      return
    }
  }

  const cursorLayers = queryPopupLayerIds(map)
  const onEnter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
  }

  for (const id of cursorLayers) {
    map.on('mouseenter', id, onEnter)
    map.on('mouseleave', id, onLeave)
  }

  map.on('click', onClick)

  return () => {
    popup.remove()
    map.off('click', onClick)
    for (const id of cursorLayers) {
      map.off('mouseenter', id, onEnter)
      map.off('mouseleave', id, onLeave)
    }
  }
}
