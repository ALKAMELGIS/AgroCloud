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
import {
  bindDevelopEliteMapLayerPopup,
  buildDevelopEliteArcgisFeaturePopupHtml,
} from './developEliteMapFeaturePopup'

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
) {
  if (!preview) {
    return L.circleMarker(latlng, { radius: 5, color: '#7ee787', fillColor: '#39ff14', fillOpacity: 0.85 })
  }
  if (preview.kind === 'picture' && preview.imageUrl) {
    const w = preview.imageWidth ?? 15
    const h = preview.imageHeight ?? 15
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
    radius: preview.radius,
    color: preview.strokeColor,
    weight: preview.strokeWidth,
    fillColor: preview.fillColor,
    fillOpacity: preview.opacity,
    opacity: preview.opacity,
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
  const layerOpacity = useMemo(() => layerOpacityFromDrawingInfo(drawingInfo), [drawingInfo])
  const drawingSig = useMemo(() => JSON.stringify(drawingInfo ?? null), [drawingInfo])

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
      const layer = pointLayer(latlng, preview)
      if (!interactive) layer.options.interactive = false
      return layer
    },
    [drawingInfo, interactive, layerOpacity],
  )

  const map = useMap()

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: Layer) => {
      if (!interactive) return
      const props = (feature.properties ?? {}) as Record<string, unknown>
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
      if (onFeatureClick) {
        layer.on('click', () => onFeatureClick(feature))
      }
    },
    [countryLabels, drawingInfo, interactive, layerKey, layerLabel, map, onFeatureClick],
  )

  if (!geojson.features.length) return null

  const hasPoints = geojson.features.some(f => f.geometry?.type === 'Point')

  return (
    <GeoJSON
      key={`${layerKey}-${drawingSig}`}
      data={geojson as GeoJSON.GeoJsonObject}
      style={styleFeature}
      pointToLayer={hasPoints ? pointToLayer : undefined}
      onEachFeature={onEachFeature}
      interactive={interactive}
    />
  )
}
