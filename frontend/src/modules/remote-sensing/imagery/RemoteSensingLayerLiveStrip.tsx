import { useEffect, useState, type RefObject } from 'react'
import type { RemoteSensingLayerSelectGroup } from '../indices/agroCompositeIndices'
import { RemoteSensingLayerSelect } from './RemoteSensingLayerSelect'

export type RemoteSensingLayerLiveStripProps = {
  wmsDate: string
  onWmsDateChange: (iso: string) => void
  onResetImageryDateAuto: () => void
  imageryDateAutoFollow: boolean
  isFetchingSentinelScenes: boolean
  layerGroups: RemoteSensingLayerSelectGroup[]
  layerValue: string
  onLayerChange: (layerId: string) => void
  isLoadingLayers: boolean
  layerLiveActive: boolean
  layerLiveDisabled?: boolean
  onToggleLayerLive: () => void
  layerLiveTitle: string
  /** Extra class on the root strip (e.g. develop-elite map panel theming). */
  className?: string
  /** Portals the index layer menu (recommended inside clipped map panels). */
  layerSelectMenuPortal?: boolean
  layerSelectMenuClassName?: string
  layerSelectRootClassName?: string
  layerSelectMenuBoundsRef?: RefObject<HTMLElement | null>
  layerSelectMenuMaxHeight?: number
  cloudCoverage?: number
  onCloudCoverageChange?: (value: number) => void
  layerLegendOpen?: boolean
  onOpenLayerLegend?: () => void
}

/** Imagery date, index layer, and Layer Live — embedded under the map Layers toolbox list. */
export function RemoteSensingLayerLiveStrip({
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
  layerLiveDisabled = false,
  onToggleLayerLive,
  layerLiveTitle,
  className,
  layerSelectMenuPortal = false,
  layerSelectMenuClassName,
  layerSelectRootClassName,
  layerSelectMenuBoundsRef,
  layerSelectMenuMaxHeight,
  cloudCoverage,
  onCloudCoverageChange,
  layerLegendOpen = false,
  onOpenLayerLegend,
}: RemoteSensingLayerLiveStripProps) {
  const rootClass = ['si-map-toolbox-layer-live-strip', className].filter(Boolean).join(' ')
  const cloudSafe =
    cloudCoverage != null
      ? Math.max(0, Math.min(100, Math.round(Number(cloudCoverage) || 0)))
      : null
  const [cloudDraft, setCloudDraft] = useState(cloudSafe ?? 10)
  useEffect(() => {
    if (cloudSafe != null) setCloudDraft(cloudSafe)
  }, [cloudSafe])

  const commitCloud = () => {
    if (cloudSafe == null || !onCloudCoverageChange) return
    if (cloudDraft !== cloudSafe) onCloudCoverageChange(cloudDraft)
  }

  return (
    <div className={rootClass}>
      <label className="si-rs-panel__stack">
        <span className="si-rs-panel__label">Imagery date</span>
        <div className="si-rs-panel__control">
          <span className="si-rs-panel__field">
            <input
              type="date"
              value={wmsDate}
              onChange={e => {
                const v = e.target.value
                if (v) onWmsDateChange(v)
              }}
              aria-label="Imagery date"
            />
          </span>
          <button
            type="button"
            className="si-rs-panel__icon-btn"
            onClick={onResetImageryDateAuto}
            disabled={imageryDateAutoFollow && !isFetchingSentinelScenes}
            title="Reset to auto (latest valid Sentinel scene)"
            aria-label="Reset imagery date to auto"
          >
            <i className="fa-solid fa-rotate-left" aria-hidden />
          </button>
        </div>
      </label>

      <div className="si-rs-panel__stack si-rs-panel__stack--index-layer">
        <span className="si-rs-panel__label">Index layer</span>
        <div className="si-rs-panel__control si-rs-panel__control--index-layer">
          <RemoteSensingLayerSelect
            groups={layerGroups}
            value={isLoadingLayers ? '' : layerValue}
            onChange={onLayerChange}
            loading={isLoadingLayers}
            loadingLabel="Loading layers…"
            emptyLabel="No layers for this satellite — check credentials or pick another provider."
            disabled={isLoadingLayers}
            triggerVariant={layerSelectMenuPortal ? 'panel' : 'field'}
            menuPortal={layerSelectMenuPortal}
            menuClassName={layerSelectMenuClassName}
            rootClassName={layerSelectRootClassName}
            menuMinWidth={228}
            menuBoundsRef={layerSelectMenuBoundsRef}
            menuMaxHeight={layerSelectMenuMaxHeight}
            aria-label="Layer"
          />
          {onOpenLayerLegend ? (
            <button
              type="button"
              className={`si-rs-panel__icon-btn si-rs-panel__legend-btn${layerLegendOpen ? ' is-on' : ''}`}
              title={
                layerLegendOpen
                  ? 'Hide Layer Live color key'
                  : 'Layer Live legend — color keys for the active index layer'
              }
              aria-label="Layer Live legend — color keys for the active index layer"
              aria-pressed={layerLegendOpen}
              onClick={onOpenLayerLegend}
            >
              <i className="fa-solid fa-bars-staggered" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {cloudSafe != null && onCloudCoverageChange ? (
        <div className="si-rs-panel__stack si-rs-panel__stack--cloud">
          <span className="si-rs-panel__label">Cloud cover</span>
          <div className="si-rs-panel__cloud-row">
            <span className="si-rs-panel__cloud-label" title="Prefer scenes with at most this cloud percent">
              ≤
            </span>
            <input
              type="range"
              className="si-rs-panel__cloud-slider"
              min={0}
              max={100}
              step={1}
              value={cloudDraft}
              aria-label="Cloud cover preference percent"
              onChange={e => setCloudDraft(Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
              onPointerUp={commitCloud}
              onKeyUp={commitCloud}
              onBlur={commitCloud}
            />
            <span className="si-rs-panel__cloud-value" title="Scene ranking preference">
              <i className="fa-solid fa-cloud" aria-hidden />
              <strong>{cloudDraft}%</strong>
            </span>
          </div>
        </div>
      ) : null}

      <div className="si-map-toolbox-layer-live-strip__toggle">
        <button
          type="button"
          className={`si-basemap-button si-layer-live-button ${layerLiveActive ? 'active' : ''}`}
          onClick={onToggleLayerLive}
          disabled={layerLiveDisabled && !layerLiveActive}
          title={layerLiveTitle}
          aria-label="Toggle Layer Live index imagery on map"
          aria-pressed={layerLiveActive}
        >
          <i className="fa-regular fa-image" aria-hidden />
          <span className="si-map-toolbox-layer-live-strip__toggle-label">Layer Live</span>
        </button>
      </div>
    </div>
  )
}
