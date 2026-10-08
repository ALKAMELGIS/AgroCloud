import { useEffect, useMemo } from 'react'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { registerDevelopEliteMapLibreFeaturePopup } from './developEliteMapLibreFeaturePopup'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'

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
  onSelectFieldKey?: (key: string | null) => void
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
  onSelectFieldKey,
}: Props) {
  const { mapRef, mapReady, viewMode3d } = useDevelopEliteMapLibre()
  const draw = useDevelopEliteMapDraw()
  const insight = useDevelopEliteMapInsight()
  const compactViewport = useDevelopEliteCompactViewport()

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
    mapReady && insight?.tool !== 'intel' && insight?.tool !== 'swipe' && !draw?.drawingActive

  useEffect(() => {
    const map = mapRef.current
    if (!map || !identifyEnabled) return

    return registerDevelopEliteMapLibreFeaturePopup(map, {
      viewMode3d,
      identifyHitRadiusPx: compactViewport ? 18 : viewMode3d ? 24 : 12,
      sources,
      countryLabels,
      structuresDrawingInfo,
      treesDrawingInfo,
      irrigationValvesDrawingInfo,
      irrigationMainPipeDrawingInfo,
      agriLocationDrawingInfo,
      onSelectStructureFieldKey: fieldKey => onSelectFieldKey?.(fieldKey),
    })
  }, [
    agriLocationDrawingInfo,
    compactViewport,
    countryLabels,
    identifyEnabled,
    irrigationMainPipeDrawingInfo,
    irrigationValvesDrawingInfo,
    mapRef,
    onSelectFieldKey,
    sources,
    structuresDrawingInfo,
    treesDrawingInfo,
    viewMode3d,
  ])

  return null
}
