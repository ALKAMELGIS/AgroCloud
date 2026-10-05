import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLngExpression, Layer } from 'leaflet'
import L from 'leaflet'
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import {
  collectIrrigationMainPipeArrowPlacements,
  irrigationMainPipeArrowIconHtml,
  irrigationMainPipeArrowSizePx,
  irrigationMainPipeArrowSpacingMeters,
  irrigationMainPipePathOptions,
  irrigationMainPipeShowFlowArrows,
} from './developEliteIrrigationMainPipeSymbology'
import {
  arcgisFeaturePointSymbolPreview,
  arcgisFeatureToLeafletPathOptions,
  layerOpacityFromDrawingInfo,
} from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import { DEVELOP_ELITE_MAP_DATA_PANE } from './developEliteMapPanes'
import { createDevelopEliteMapDataSvgRenderer } from './developEliteMapRenderers'
import {
  bindDevelopEliteMapLayerPopup,
  buildDevelopEliteArcgisFeaturePopupHtml,
  developEliteMapLayerSupportsPopup,
} from './developEliteMapFeaturePopup'

/** Slightly larger map markers for AgroLocation (picture / simple points). */
const DEVELOP_ELITE_AGRI_LOCATION_POINT_SCALE = 1.22
/** Irrigation valve picture markers are small in ArcGIS (10–15px); boost for satellite basemap. */
const DEVELOP_ELITE_IRRIGATION_VALVES_POINT_SCALE = 1.45

type Props = {
  layerKey: DevelopEliteMapDataLayerId
  layerLabel: string
  geojson: GeoJSON.FeatureCollection
  drawingInfo: Record<string, unknown> | null
  interactive?: boolean
  countryLabels?: Map<string, string> | null
  onFeatureClick?: (feature: GeoJSON.Feature) => void
}

function pointLayer(
  latlng: LatLngExpression,
  preview: ReturnType<typeof arcgisFeaturePointSymbolPreview>,
  scale = 1,
  vectorPane = DEVELOP_ELITE_MAP_DATA_PANE,
) {
  const s = scale > 0 ? scale : 1
  if (!preview) {
    const r = Math.max(3, 5 * s)
    return L.circleMarker(latlng, {
      radius: r,
      color: '#7ee787',
      fillColor: '#39ff14',
      fillOpacity: 0.85,
      pane: vectorPane,
    })
  }
  if (preview.kind === 'picture' && preview.imageUrl) {
    const w = Math.round((preview.imageWidth ?? 15) * s)
    const h = Math.round((preview.imageHeight ?? 15) * s)
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl: preview.imageUrl,
        iconSize: [w, h],
        iconAnchor: [w / 2, h / 2],
      }),
      pane: vectorPane,
      interactive: true,
      zIndexOffset: 120,
    })
  }
  return L.circleMarker(latlng, {
    radius: Math.max(2, preview.radius * s),
    color: preview.strokeColor,
    weight: preview.strokeWidth,
    fillColor: preview.fillColor,
    fillOpacity: preview.opacity,
    opacity: preview.opacity,
    pane: vectorPane,
  })
}

export function DevelopEliteMapArcgisLayer({
  layerKey,
  layerLabel,
  geojson,
  drawingInfo,
  interactive = true,
  countryLabels = null,
  onFeatureClick,
}: Props) {
  const map = useMap()
  const isMainPipeLayer = layerKey === 'irrigation-main-pipe'
  const [mapZoom, setMapZoom] = useState(() => map.getZoom())
  useMapEvents({
    zoomend: () => setMapZoom(map.getZoom()),
    moveend: () => setMapZoom(map.getZoom()),
  })
  const layerOpacity = useMemo(() => layerOpacityFromDrawingInfo(drawingInfo), [drawingInfo])
  const drawingSig = useMemo(() => JSON.stringify(drawingInfo ?? null), [drawingInfo])
  const pointSymbolScale =
    layerKey === 'agri-location'
      ? DEVELOP_ELITE_AGRI_LOCATION_POINT_SCALE
      : layerKey === 'irrigation-valves'
        ? DEVELOP_ELITE_IRRIGATION_VALVES_POINT_SCALE
        : 1
  const vectorSmoothFactor = 1
  const vectorPane = DEVELOP_ELITE_MAP_DATA_PANE

  const vectorRenderer = useMemo(() => createDevelopEliteMapDataSvgRenderer(map), [map])

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      if (isMainPipeLayer) {
        return irrigationMainPipePathOptions(drawingInfo, feature?.properties, mapZoom, { layerOpacity })
      }
      const base = arcgisFeatureToLeafletPathOptions(drawingInfo, feature?.properties, { layerOpacity })
      if (layerKey !== 'world-countries') return base
      const weight = base.weight ?? 1
      const stroke = base.color ?? ''
      const invisibleStroke =
        !stroke ||
        stroke === 'transparent' ||
        (base.opacity ?? 1) < 0.05 ||
        (weight < 1 && (base.fillOpacity ?? 0) < 0.05)
      if (invisibleStroke || weight < 0.75) {
        return {
          color: '#4ce600',
          weight: 2,
          fillOpacity: 0,
          opacity: 1,
        }
      }
      if ((base.fillOpacity ?? 0) < 0.05) {
        return { ...base, fillOpacity: 0, weight: Math.max(weight, 2) }
      }
      return base
    },
    [drawingInfo, isMainPipeLayer, layerKey, layerOpacity, mapZoom],
  )

  useEffect(() => {
    if (!isMainPipeLayer || !geojson.features.length) return
    const group = L.layerGroup([], { pane: vectorPane })
    map.addLayer(group)
    const latitude = map.getCenter().lat
    const spacing = irrigationMainPipeArrowSpacingMeters(mapZoom, latitude)
    if (irrigationMainPipeShowFlowArrows(mapZoom)) {
      for (const feature of geojson.features) {
        const style = irrigationMainPipePathOptions(drawingInfo, feature.properties, mapZoom, { layerOpacity })
        const color = String(style.color ?? '#004da8')
        const weight = style.weight ?? 4
        const size = irrigationMainPipeArrowSizePx(weight)
        const placements = collectIrrigationMainPipeArrowPlacements(feature.geometry ?? null, spacing)
        for (const placement of placements) {
          const icon = L.divIcon({
            className: 'develop-elite-irrigation-pipe-arrow-icon',
            html: irrigationMainPipeArrowIconHtml(color, size, placement.bearingDeg),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          })
          L.marker([placement.lat, placement.lng], {
            icon,
            pane: vectorPane,
            interactive: false,
            keyboard: false,
          }).addTo(group)
        }
      }
    }
    return () => {
      map.removeLayer(group)
    }
  }, [drawingInfo, geojson, isMainPipeLayer, layerOpacity, map, mapZoom, vectorPane])

  const pointToLayer = useCallback(
    (feature: GeoJSON.Feature, latlng: LatLngExpression) => {
      const preview = arcgisFeaturePointSymbolPreview(drawingInfo, feature.properties, { layerOpacity })
      const layer = pointLayer(latlng, preview, pointSymbolScale, vectorPane)
      if (!interactive) layer.options.interactive = false
      return layer
    },
    [drawingInfo, interactive, layerOpacity, pointSymbolScale, vectorPane],
  )

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: Layer) => {
      if (!interactive) return
      const props = (feature.properties ?? {}) as Record<string, unknown>
      if (developEliteMapLayerSupportsPopup(layerKey)) {
        bindDevelopEliteMapLayerPopup(
          layer,
          buildDevelopEliteArcgisFeaturePopupHtml(layerLabel, props, {
            layerKey,
            drawingInfo,
            countryLabels,
          }),
          undefined,
          map,
        )
      }
      layer.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event)
        onFeatureClick?.(feature)
      })
    },
    [countryLabels, drawingInfo, interactive, layerKey, layerLabel, map, onFeatureClick],
  )

  if (!geojson.features.length) return null

  const hasPoints = geojson.features.some(f => f.geometry?.type === 'Point')
  const dataSig = `${geojson.features.length}`

  return (
    <GeoJSON
      key={`${layerKey}-${drawingSig}-${dataSig}${isMainPipeLayer ? `-z${mapZoom}` : ''}`}
      data={geojson as GeoJSON.GeoJsonObject}
      pane={vectorPane}
      renderer={vectorRenderer}
      smoothFactor={vectorSmoothFactor}
      style={styleFeature}
      pointToLayer={hasPoints ? pointToLayer : undefined}
      onEachFeature={onEachFeature}
      interactive={interactive}
    />
  )
}
