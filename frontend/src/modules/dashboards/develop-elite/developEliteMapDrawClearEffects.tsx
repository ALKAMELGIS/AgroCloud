import { useEffect, useRef } from 'react'
import { clearDevelopEliteLayerLiveMaplibre } from './developEliteMapLayerLiveMaplibreMount'
import { developEliteLayerLiveHasDrawnAoiClip } from './developEliteMapLayerLiveCore'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
import { useDevelopEliteMapLayerLiveOptional } from './developEliteMapLayerLiveContext'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'

/** When the user clears the AOI sketch, drop Layer Live / analysis overlays immediately. */
export function DevelopEliteMapDrawClearEffects() {
  const draw = useDevelopEliteMapDraw()
  const layerLive = useDevelopEliteMapLayerLiveOptional()
  const insight = useDevelopEliteMapInsight()
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const hadDrawnClipRef = useRef(false)

  useEffect(() => {
    const hasClip = developEliteLayerLiveHasDrawnAoiClip(draw?.clipGeoJson)
    const hadClip = hadDrawnClipRef.current
    hadDrawnClipRef.current = hasClip
    if (!hadClip || hasClip) return

    layerLive?.deactivateLayerLive()
    if (insight?.imageryTimeSeriesOpen) insight.setImageryTimeSeriesOpen(false)
    if (insight?.tool === 'swipe') insight.toggleTool('swipe')

    const map = mapRef.current
    if (map && mapReady) clearDevelopEliteLayerLiveMaplibre(map)
  }, [draw?.clipGeoJson, insight, layerLive, mapReady, mapRef])

  return null
}
