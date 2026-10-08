import { useEffect } from 'react'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { registerDevelopEliteMapLibreFeaturePopup } from './developEliteMapLibreFeaturePopup'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'

type Props = {
  structuresDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  countryLabels?: Map<string, string> | null
  onSelectFieldKey?: (key: string | null) => void
}

export function DevelopEliteMapLibreFeaturePopupBridge({
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

  const identifyEnabled =
    mapReady && insight?.tool !== 'intel' && insight?.tool !== 'swipe' && !draw?.drawingActive

  useEffect(() => {
    const map = mapRef.current
    if (!map || !identifyEnabled) return

    return registerDevelopEliteMapLibreFeaturePopup(map, {
      viewMode3d,
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
    countryLabels,
    identifyEnabled,
    irrigationMainPipeDrawingInfo,
    irrigationValvesDrawingInfo,
    mapRef,
    onSelectFieldKey,
    structuresDrawingInfo,
    treesDrawingInfo,
    viewMode3d,
  ])

  return null
}
