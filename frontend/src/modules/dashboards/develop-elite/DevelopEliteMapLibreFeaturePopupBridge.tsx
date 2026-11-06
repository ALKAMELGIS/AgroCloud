import { useEffect, useRef } from 'react'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import {
  registerDevelopEliteMapLibreFeaturePopup,
  type DevelopEliteMapLibreFeaturePopupHandle,
} from './developEliteMapLibreFeaturePopup'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'
import type { DevelopEliteCropTablePopupLink } from './developEliteMapCropTablePopup'
import { useMemo } from 'react'

type Props = {
  geojson: GeoJSON.FeatureCollection
  treesGeojson?: GeoJSON.FeatureCollection | null
  irrigationValvesGeojson?: GeoJSON.FeatureCollection | null
  irrigationMainPipeGeojson?: GeoJSON.FeatureCollection | null
  agriLocationGeojson?: GeoJSON.FeatureCollection | null
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  structuresDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  countryLabels?: Map<string, string> | null
  cropTableLink?: DevelopEliteCropTablePopupLink | null
  mapPopupFieldKey?: string | null
  mapPopupRequest?: number
  mapTableIdentifyRequest?: {
    feature: GeoJSON.Feature
    layerKey: DevelopEliteMapDataLayerId
    nonce: number
  } | null
  onSelectFieldKey?: (key: string | null) => void
  onFocusCropTableRowId?: (rowId: string) => void
}

export function DevelopEliteMapLibreFeaturePopupBridge({
  geojson,
  treesGeojson,
  irrigationValvesGeojson,
  irrigationMainPipeGeojson,
  agriLocationGeojson,
  worldCountriesGeojson,
  mapLayerVisibility,
  structuresDrawingInfo,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  countryLabels,
  cropTableLink,
  mapPopupFieldKey,
  mapPopupRequest = 0,
  mapTableIdentifyRequest = null,
  onSelectFieldKey,
  onFocusCropTableRowId,
}: Props) {
  const { mapRef, mapReady, viewMode3d } = useDevelopEliteMapLibre()
  const draw = useDevelopEliteMapDraw()
  const insight = useDevelopEliteMapInsight()
  const compactViewport = useDevelopEliteCompactViewport()
  const popupHandleRef = useRef<DevelopEliteMapLibreFeaturePopupHandle | null>(null)

  const sources = useMemo<DevelopEliteMapSearchSources>(
    () => ({
      structures: geojson,
      trees: treesGeojson,
      irrigationValves: irrigationValvesGeojson,
      irrigationMainPipe: irrigationMainPipeGeojson,
      agriLocation: agriLocationGeojson,
      worldCountries: worldCountriesGeojson,
      countryLabels,
      mapLayerVisibility,
    }),
    [
      agriLocationGeojson,
      countryLabels,
      geojson,
      irrigationMainPipeGeojson,
      irrigationValvesGeojson,
      mapLayerVisibility,
      treesGeojson,
      worldCountriesGeojson,
    ],
  )

  const identifyEnabled =
    mapReady && insight?.tool !== 'swipe' && insight?.tool !== 'intel' && !draw?.drawingActive

  useEffect(() => {
    const map = mapRef.current
    if (!map || !identifyEnabled) return

    const handle = registerDevelopEliteMapLibreFeaturePopup(map, {
      viewMode3d,
      identifyHitRadiusPx: compactViewport ? 18 : viewMode3d ? 24 : 12,
      sources,
      countryLabels,
      structuresDrawingInfo,
      treesDrawingInfo,
      irrigationValvesDrawingInfo,
      irrigationMainPipeDrawingInfo,
      agriLocationDrawingInfo,
      cropTableLink: cropTableLink ?? null,
      onSelectStructureFieldKey: fieldKey => onSelectFieldKey?.(fieldKey),
      onFocusCropTableRowId: onFocusCropTableRowId,
    })
    popupHandleRef.current = handle
    return () => {
      handle.dispose()
      popupHandleRef.current = null
    }
  }, [
    agriLocationDrawingInfo,
    compactViewport,
    countryLabels,
    cropTableLink,
    identifyEnabled,
    irrigationMainPipeDrawingInfo,
    irrigationValvesDrawingInfo,
    mapRef,
    onFocusCropTableRowId,
    onSelectFieldKey,
    sources,
    structuresDrawingInfo,
    treesDrawingInfo,
    viewMode3d,
  ])

  useEffect(() => {
    if (!mapPopupRequest || !mapPopupFieldKey?.trim()) return
    const handle = popupHandleRef.current
    if (!handle) return
    const fieldKey = mapPopupFieldKey.trim()
    const hit = geojson.features.find((f, i) => computeStableGisFeatureKey(f, i) === fieldKey)
    if (!hit) return
    handle.openFeature(hit, 'agro-structures')
  }, [geojson.features, mapPopupFieldKey, mapPopupRequest])

  useEffect(() => {
    if (!mapTableIdentifyRequest?.nonce) return
    const handle = popupHandleRef.current
    if (!handle) return
    handle.openFeature(mapTableIdentifyRequest.feature, mapTableIdentifyRequest.layerKey)
  }, [mapTableIdentifyRequest])

  return null
}
