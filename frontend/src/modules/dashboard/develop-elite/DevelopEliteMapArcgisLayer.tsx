import { useCallback, useMemo } from 'react'
import type { LatLngExpression, Layer } from 'leaflet'
import L from 'leaflet'
import { GeoJSON, useMap } from 'react-leaflet'
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
      interactive: true,
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
  const layerOpacity = useMemo(() => layerOpacityFromDrawingInfo(drawingInfo), [drawingInfo])
  const drawingSig = useMemo(() => JSON.stringify(drawingInfo ?? null), [drawingInfo])
  const pointSymbolScale =
    layerKey === 'agri-location' ? DEVELOP_ELITE_AGRI_LOCATION_POINT_SCALE : 1
  const vectorSmoothFactor = 1
  const vectorPane = DEVELOP_ELITE_MAP_DATA_PANE

  const vectorRenderer = useMemo(() => createDevelopEliteMapDataSvgRenderer(map), [map])

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
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
    [drawingInfo, layerKey, layerOpacity],
  )

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
      key={`${layerKey}-${drawingSig}-${dataSig}`}
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
