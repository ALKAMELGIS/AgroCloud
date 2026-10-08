import { useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { SiInstanceScopeProvider } from '@/app/providers/siInstanceScope'
import { LayerLiveLegendFloatingPanel } from '@/modules/remote-sensing/indices/LayerLiveLegendFloatingPanel'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { developEliteCommittedAoiGeometry } from './developEliteImageryTimeSeriesAoi'
import { developEliteLayerLiveSelectOptions } from './developEliteMapLayerLiveCore'
import { useDevelopEliteMapLayerLiveOptional } from './developEliteMapLayerLiveContext'

type Props = {
  viewportRef: RefObject<HTMLElement | null>
}

export function DevelopEliteMapLayerLiveLegendHost({ viewportRef }: Props) {
  const layerLive = useDevelopEliteMapLayerLiveOptional()
  const draw = useDevelopEliteMapDraw()
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!layerLive?.layerLiveLegendOpen) {
      setPortalHost(null)
      return
    }
    setPortalHost(viewportRef.current)
  }, [layerLive?.layerLiveLegendOpen, viewportRef])

  const layerOptions = useMemo(
    () => developEliteLayerLiveSelectOptions(layerLive?.layerGroups ?? []),
    [layerLive?.layerGroups],
  )

  const aoiGeometry = useMemo(() => {
    const clip = draw?.clipGeoJson ?? layerLive?.clipSource ?? null
    return developEliteCommittedAoiGeometry(clip)
  }, [draw?.clipGeoJson, layerLive?.clipSource])

  if (!layerLive?.layerLiveLegendOpen || !portalHost) return null

  return createPortal(
    <SiInstanceScopeProvider scope="develop-elite">
      <LayerLiveLegendFloatingPanel
        open
        embeddedInMap
        onClose={() => layerLive.setLayerLiveLegendOpen(false)}
        containerRef={viewportRef}
        layerOptions={layerOptions}
        layerGroups={layerLive.layerGroups}
        activeLayerId={layerLive.layerValue}
        aoiGeometry={aoiGeometry}
        sceneDate={layerLive.wmsDate}
      />
    </SiInstanceScopeProvider>,
    portalHost,
  )
}
