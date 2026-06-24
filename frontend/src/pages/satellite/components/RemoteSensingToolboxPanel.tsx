import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import type { SiAoiMaskBuilderSettings } from '../../../lib/siAoiMaskBuilder'
import { RemoteSensingLayerSelect } from './RemoteSensingLayerSelect'
import { SiAoiMaskBuilderPanel } from './SiAoiMaskBuilderPanel'
import {
  RemoteSensingDrawingToolbar,
  type RemoteSensingDrawingTool,
} from './RemoteSensingDrawingToolbar'

export const REMOTE_SENSING_PROVIDERS = [{ id: 'sentinel-hub', label: 'Sentinel Hub' }] as const

export const REMOTE_SENSING_COLLECTIONS = [
  { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
  { id: 'sentinel-2-l1c', label: 'Sentinel-2 L1C' },
] as const

export type RemoteSensingDrawTool = RemoteSensingDrawingTool | 'select' | 'polyline' | string

export type RemoteSensingToolboxPanelProps = {
  provider: string
  onProviderChange: (id: string) => void
  collection: string
  onCollectionChange: (id: string) => void
  wmsDate: string
  onWmsDateChange: (iso: string) => void
  onResetImageryDateAuto: () => void
  imageryDateAutoFollow: boolean
  isFetchingSentinelScenes: boolean
  imageryDateMeta: string | null
  layerGroups: RemoteSensingLayerSelectGroup[]
  layerValue: string
  onLayerChange: (layerId: string) => void
  isLoadingLayers: boolean
  showOnMap: boolean
  onShowOnMapChange: (checked: boolean) => void
  showOnMapLabel: string
  wmsZoomWarning: string | null
  onAddDataSource: () => void
  aoiMaskBuilderSettings: SiAoiMaskBuilderSettings
  onAoiMaskBuilderChange: (next: SiAoiMaskBuilderSettings) => void
  customLayers: Parameters<typeof SiAoiMaskBuilderPanel>[0]['customLayers']
  sentinelLayerOptions: Parameters<typeof SiAoiMaskBuilderPanel>[0]['sentinelLayerOptions']
  maskFeatureCount: number
  selectedFeatureCount: number
  timeSeriesStart: string
  timeSeriesEnd: string
  onTimeSeriesStartChange: (iso: string) => void
  onTimeSeriesEndChange: (iso: string) => void
  rsDrawingModeActive: boolean
  onRsDrawingModeChange: (active: boolean) => void
  rsDrawingTool: RemoteSensingDrawingTool | null
  onRsDrawingToolChange: (tool: RemoteSensingDrawingTool) => void
  mapPanLocked: boolean
  onPanNavigate: () => void
  onToggleMapPanLock: () => void
  onMeasureTool: () => void
  hasClearableDrawing: boolean
  onClearDrawing: () => void
  staticChartsOpen: boolean
  onToggleStaticCharts: () => void
  onOpenLayerLegend: () => void
  layerLegendOpen: boolean
  fieldTimelineActive: boolean
  onTimelinePrimaryClick: () => void
  fieldAnalysisStatus: string | null
  onClose: () => void
}

export function RemoteSensingToolboxPanel(props: RemoteSensingToolboxPanelProps) {
  const {
    provider,
    onProviderChange,
    collection,
    onCollectionChange,
    wmsDate,
    onWmsDateChange,
    onResetImageryDateAuto,
    imageryDateAutoFollow,
    isFetchingSentinelScenes,
    imageryDateMeta,
    layerGroups,
    layerValue,
    onLayerChange,
    isLoadingLayers,
    showOnMap,
    onShowOnMapChange,
    showOnMapLabel,
    wmsZoomWarning,
    onAddDataSource,
    aoiMaskBuilderSettings,
    onAoiMaskBuilderChange,
    customLayers,
    sentinelLayerOptions,
    maskFeatureCount,
    selectedFeatureCount,
    timeSeriesStart,
    timeSeriesEnd,
    onTimeSeriesStartChange,
    onTimeSeriesEndChange,
    rsDrawingModeActive,
    onRsDrawingModeChange,
    rsDrawingTool,
    onRsDrawingToolChange,
    mapPanLocked,
    onPanNavigate,
    onToggleMapPanLock,
    onMeasureTool,
    hasClearableDrawing,
    onClearDrawing,
    staticChartsOpen,
    onToggleStaticCharts,
    onOpenLayerLegend,
    layerLegendOpen,
    fieldTimelineActive,
    onTimelinePrimaryClick,
    fieldAnalysisStatus,
    onClose,
  } = props

  return (
    <div className="si-env-section-card si-field-analysis si-rs-panel si-rs-panel--glass si-rs-panel--toolbox-v2 si-rs-panel--flat">
      <div className="si-rs-panel__header">
        <h2 className="si-rs-panel__title">Remote Sensing</h2>
        <button type="button" className="si-rs-panel__close" onClick={onClose} aria-label="Close panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-rs-panel__body si-rs-panel__body--flat">
        <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--2">
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Provider</span>
            <select
              className="si-rs-panel__select"
              value={provider}
              onChange={e => onProviderChange(e.target.value)}
              aria-label="Satellite provider"
            >
              {REMOTE_SENSING_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Collection</span>
            <select
              className="si-rs-panel__select"
              value={collection}
              onChange={e => onCollectionChange(e.target.value)}
              aria-label="Sensor or collection"
            >
              {REMOTE_SENSING_COLLECTIONS.map(c => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

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
        {imageryDateMeta ? (
          <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
            {imageryDateMeta}
          </p>
        ) : null}

        <label className="si-rs-panel__stack">
          <span className="si-rs-panel__label">Index layer</span>
          <RemoteSensingLayerSelect
            groups={layerGroups}
            value={isLoadingLayers ? '' : layerValue}
            onChange={onLayerChange}
            loading={isLoadingLayers}
            disabled={isLoadingLayers}
            aria-label="Layer"
          />
        </label>

        {!isLoadingLayers && sentinelLayerOptions.length > 0 ? (
          <label className="si-rs-panel__show-box">
            <input
              type="checkbox"
              checked={showOnMap}
              onChange={e => onShowOnMapChange(e.target.checked)}
              aria-label={showOnMapLabel}
            />
            <span>{showOnMapLabel}</span>
          </label>
        ) : null}
        {wmsZoomWarning ? (
          <p className="si-rs-panel__meta si-rs-panel__meta--warn si-rs-panel__meta--inline" role="status">
            {wmsZoomWarning}
          </p>
        ) : null}

        <button
          type="button"
          className="si-rs-panel__action"
          onClick={onAddDataSource}
          title="Add Data Source (AOI): SHP (.zip), KML/KMZ, GeoJSON"
        >
          <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
          <span>Add data source (AOI)</span>
        </button>

        <SiAoiMaskBuilderPanel
          settings={aoiMaskBuilderSettings}
          onChange={onAoiMaskBuilderChange}
          customLayers={customLayers}
          sentinelLayerOptions={sentinelLayerOptions}
          maskFeatureCount={maskFeatureCount}
          selectedFeatureCount={selectedFeatureCount}
          flat
        />

        <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--2">
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Series start</span>
            <span className="si-rs-panel__field">
              <input
                type="date"
                value={timeSeriesStart}
                onChange={e => onTimeSeriesStartChange(e.target.value)}
                aria-label="Time series start"
              />
            </span>
          </label>
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Series end</span>
            <span className="si-rs-panel__field">
              <input
                type="date"
                value={timeSeriesEnd}
                onChange={e => onTimeSeriesEndChange(e.target.value)}
                aria-label="Time series end"
              />
            </span>
          </label>
        </div>

        <RemoteSensingDrawingToolbar
          drawingModeActive={rsDrawingModeActive}
          onDrawingModeChange={onRsDrawingModeChange}
          activeTool={rsDrawingTool}
          onToolChange={onRsDrawingToolChange}
          hasClearableDrawing={hasClearableDrawing}
          onClearDrawing={onClearDrawing}
        />

        <label className="si-rs-panel__stack">
          <span className="si-rs-panel__label">Map navigation</span>
          <div className="si-rs-panel__toolgrid" role="toolbar" aria-label="Map navigation tools">
            <button
              type="button"
              className={`si-rs-panel__tool${!mapPanLocked ? ' is-on' : ''}`}
              title="Pan map"
              aria-pressed={!mapPanLocked}
              onClick={onPanNavigate}
            >
              <i className="fa-solid fa-hand" aria-hidden />
            </button>
            <button
              type="button"
              className="si-rs-panel__tool"
              title="Measure distance"
              aria-label="Measure distance"
              onClick={onMeasureTool}
            >
              <i className="fa-solid fa-ruler-combined" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-rs-panel__tool si-rs-panel__tool--pan-lock${mapPanLocked ? ' is-on' : ''}`}
              title={mapPanLocked ? 'Map pan locked — click to unlock' : 'Lock map pan'}
              aria-pressed={mapPanLocked}
              aria-label={mapPanLocked ? 'Map pan locked' : 'Lock map pan'}
              onClick={onToggleMapPanLock}
            >
              <i className="fa-solid fa-up-down-left-right" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-rs-panel__tool${staticChartsOpen ? ' is-on' : ''}`}
              title={staticChartsOpen ? 'Hide AOI charts on map' : 'Show AOI charts on map'}
              aria-pressed={staticChartsOpen}
              onClick={onToggleStaticCharts}
            >
              <i className="fa-solid fa-chart-pie" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-rs-panel__tool${layerLegendOpen ? ' is-on' : ''}`}
              title={layerLegendOpen ? 'Hide layer legend' : 'Show layer legend'}
              aria-pressed={layerLegendOpen}
              onClick={onOpenLayerLegend}
            >
              <i className="fa-solid fa-palette" aria-hidden />
            </button>
          </div>
        </label>

        <button
          type="button"
          className={'si-rs-panel__cta' + (fieldTimelineActive ? ' si-rs-panel__cta--stop' : '')}
          onClick={onTimelinePrimaryClick}
          aria-label={
            fieldTimelineActive
              ? 'Stop timeline playback'
              : 'Generate weekly timeline from selected date range'
          }
        >
          <i
            className={fieldTimelineActive ? 'fa-solid fa-stop' : 'fa-solid fa-chart-line'}
            aria-hidden
          />
          {fieldTimelineActive ? 'Stop timeline' : 'Generate timeline'}
        </button>

        {fieldAnalysisStatus ? <p className="si-rs-panel__status">{fieldAnalysisStatus}</p> : null}
      </div>
    </div>
  )
}
