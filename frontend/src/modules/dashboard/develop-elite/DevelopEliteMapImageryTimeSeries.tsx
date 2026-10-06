import { useEffect, useMemo, type RefObject } from 'react'
import { getMapboxAccessToken } from '@/core/config/mapboxAccessToken'
import { SiImageryTimeSeriesFloatingPanel } from '@/modules/remote-sensing/temporal-analysis/SiImageryTimeSeriesFloatingPanel'
import { SI_IMAGERY_COMMITTED_AOI_KEY } from '@/modules/remote-sensing/temporal-analysis/siImageryTimeSeriesFields'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapLayerLive } from './developEliteMapLayerLiveContext'
import {
  developEliteCommittedAoiGeometry,
  developEliteDrawnAoiToAoiFields,
} from './developEliteImageryTimeSeriesAoi'
import { prefetchDevelopEliteImageryTimeSeriesPanel } from './developElitePrefetchImageryTimeSeries'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
import { developEliteLayerLiveHasDrawnAoiClip } from './developEliteMapLayerLiveCore'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

type Props = {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  highlightFieldKey: string | null
  onSelectFieldKey: (key: string | null) => void
}

export function DevelopEliteMapImageryTimeSeries({
  open,
  onClose,
  containerRef,
  highlightFieldKey,
  onSelectFieldKey,
}: Props) {
  const draw = useDevelopEliteMapDraw()
  const layerLive = useDevelopEliteMapLayerLive()

  useEffect(() => {
    prefetchDevelopEliteImageryTimeSeriesPanel()
  }, [])

  useEffect(() => {
    if (open) prefetchDevelopEliteImageryTimeSeriesPanel()
  }, [open])

  const committedAoiGeometry = useMemo(
    () => developEliteCommittedAoiGeometry(draw?.clipGeoJson ?? null),
    [draw?.clipGeoJson],
  )

  const aoiFields = useMemo(
    () => (open && committedAoiGeometry ? developEliteDrawnAoiToAoiFields(draw?.clipGeoJson ?? null) : []),
    [committedAoiGeometry, draw?.clipGeoJson, open],
  )

  const mapboxToken = getMapboxAccessToken()

  const hasDrawnClip = developEliteLayerLiveHasDrawnAoiClip(draw?.clipGeoJson)

  const selectedFieldKey = committedAoiGeometry
    ? SI_IMAGERY_COMMITTED_AOI_KEY
    : highlightFieldKey

  if (open && !hasDrawnClip) {
    return null
  }

  return (
    <SiImageryTimeSeriesFloatingPanel
      open={open}
      onClose={onClose}
      containerRef={containerRef}
      agroStructuresMask={EMPTY_FC}
      aoiFields={aoiFields}
      vectorLayers={null}
      committedAoiGeometry={committedAoiGeometry}
      defaultLayerId={layerLive.layerValue}
      analysisDate={layerLive.wmsDate}
      imageryDateAutoFollow={layerLive.imageryDateAutoFollow}
      onMapDateFromChart={layerLive.onWmsDateChange}
      selectedFieldKey={selectedFieldKey}
      onSelectedFieldKeyChange={key => onSelectFieldKey(key)}
      mapboxToken={mapboxToken || undefined}
      eagerPanel
      drawnAoiOnly
      chartLookbackDays={90}
      defaultPanelSize={{ w: 720, h: 340 }}
    />
  )
}

export function DevelopEliteMapImageryTimeSeriesHost({
  containerRef,
  highlightFieldKey,
  onSelectFieldKey,
}: Omit<Props, 'open' | 'onClose'>) {
  const insight = useDevelopEliteMapInsight()
  const draw = useDevelopEliteMapDraw()

  useEffect(() => {
    if (!insight?.imageryTimeSeriesOpen) return
    if (!developEliteLayerLiveHasDrawnAoiClip(draw?.clipGeoJson)) {
      insight.setImageryTimeSeriesOpen(false)
    }
  }, [draw?.clipGeoJson, insight])

  if (!insight) return null
  return (
    <DevelopEliteMapImageryTimeSeries
      open={insight.imageryTimeSeriesOpen}
      onClose={() => insight.setImageryTimeSeriesOpen(false)}
      containerRef={containerRef}
      highlightFieldKey={highlightFieldKey}
      onSelectFieldKey={onSelectFieldKey}
    />
  )
}
