import { useCallback, type RefObject } from 'react'
import { RemoteSensingLayerLiveStrip } from '@/modules/remote-sensing/imagery/RemoteSensingLayerLiveStrip'
import '@/modules/remote-sensing/imagery/RemoteSensingPanel.css'
import { useDevelopEliteMapLayerLive } from './developEliteMapLayerLiveContext'

export function DevelopEliteMapLayerLivePanel({
  menuBoundsRef,
}: {
  menuBoundsRef?: RefObject<HTMLElement | null>
} = {}) {
  const {
    layerLiveStatus,
    wmsDate,
    onWmsDateChange,
    onResetImageryDateAuto,
    imageryDateAutoFollow,
    isFetchingSentinelScenes,
    layerGroups,
    layerValue,
    onLayerChange,
    isLoadingLayers,
    layerLiveActive,
    hasDrawnAoiClip,
    onToggleLayerLive,
    layerLiveTitle,
    cloudCoverage,
    onCloudCoverageChange,
    layerLiveLegendOpen,
    toggleLayerLiveLegend,
  } = useDevelopEliteMapLayerLive()
  const onOpenLayerLegend = useCallback(() => {
    toggleLayerLiveLegend()
  }, [toggleLayerLiveLegend])
  return (
    <div className="develop-elite-map__si-rs-panel si-rs-panel si-rs-panel--flat">
      <RemoteSensingLayerLiveStrip
        className="develop-elite-map__si-strip"
        layerSelectMenuPortal
        layerSelectRootClassName="si-rs-panel-select"
        layerSelectMenuClassName="develop-elite-map__layer-select-menu"
        layerSelectMenuBoundsRef={menuBoundsRef}
        layerSelectMenuMaxHeight={220}
        wmsDate={wmsDate}
        onWmsDateChange={onWmsDateChange}
        onResetImageryDateAuto={onResetImageryDateAuto}
        imageryDateAutoFollow={imageryDateAutoFollow}
        isFetchingSentinelScenes={isFetchingSentinelScenes}
        layerGroups={layerGroups}
        layerValue={layerValue}
        onLayerChange={onLayerChange}
        isLoadingLayers={isLoadingLayers}
        layerLiveActive={layerLiveActive}
        layerLiveDisabled={!hasDrawnAoiClip}
        onToggleLayerLive={onToggleLayerLive}
        layerLiveTitle={layerLiveTitle}
        cloudCoverage={cloudCoverage}
        onCloudCoverageChange={onCloudCoverageChange}
        layerLegendOpen={layerLiveLegendOpen}
        onOpenLayerLegend={onOpenLayerLegend}
      />
      {layerLiveStatus ? (
        <p className="develop-elite-map__layer-live-status" role="status">{layerLiveStatus}</p>
      ) : null}
    </div>
  )
}
