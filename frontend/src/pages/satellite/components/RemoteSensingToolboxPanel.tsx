import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import type { SiAoiMaskBuilderSettings } from '../../../lib/siAoiMaskBuilder'
import { RemoteSensingLayerSelect } from './RemoteSensingLayerSelect'
import { SiAoiMaskBuilderPanel } from './SiAoiMaskBuilderPanel'

export const REMOTE_SENSING_PROVIDERS = [{ id: 'sentinel-hub', label: 'Sentinel Hub' }] as const

export const REMOTE_SENSING_COLLECTIONS = [
  { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
  { id: 'sentinel-2-l1c', label: 'Sentinel-2 L1C' },
] as const

export type RemoteSensingDrawTool = 'rectangle' | 'polygon' | 'circle' | 'select' | 'polyline' | string

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
  mapDrawTool: RemoteSensingDrawTool
  mapPanLocked: boolean
  onDrawTool: (tool: RemoteSensingDrawTool) => void
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
    mapDrawTool,
    mapPanLocked,
    onDrawTool,
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
    <div className="si-env-section-card si-field-analysis si-rs-panel si-rs-panel--glass si-rs-panel--toolbox-v2">
      <div className="si-rs-panel__header">
        <h2 className="si-rs-panel__title">Remote Sensing</h2>
        <button type="button" className="si-rs-panel__close" onClick={onClose} aria-label="Close panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-rs-panel__body">
        <label className="si-rs-panel__stack">
          <span className="si-rs-panel__label">Satellite provider</span>
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
          <span className="si-rs-panel__label">Sensor / Collection</span>
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
          <span className="si-rs-panel__label">Layer</span>
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
          <span>Add Data Source (AOI)</span>
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

        <div className="si-rs-panel__section">
          <span className="si-rs-panel__section-kicker">Time-series analysis</span>
          <div className="si-rs-panel__row si-rs-panel__row--pair">
            <label className="si-rs-panel__mini-field">
              <span className="si-rs-panel__label">Start</span>
              <input
                type="date"
                value={timeSeriesStart}
                onChange={e => onTimeSeriesStartChange(e.target.value)}
                aria-label="Time series start"
              />
            </label>
            <label className="si-rs-panel__mini-field">
              <span className="si-rs-panel__label">End</span>
              <input
                type="date"
                value={timeSeriesEnd}
                onChange={e => onTimeSeriesEndChange(e.target.value)}
                aria-label="Time series end"
              />
            </label>
          </div>
        </div>

        <div className="si-rs-panel__section">
          <span className="si-rs-panel__section-kicker">Drawing tools</span>
          <div className="si-rs-panel__toolgrid" role="toolbar" aria-label="Drawing and map navigation tools">
            <button
              type="button"
              className={`si-rs-panel__tool${mapDrawTool === 'rectangle' ? ' is-on' : ''}`}
              title="Rectangle AOI"
              aria-pressed={mapDrawTool === 'rectangle'}
              onClick={() => onDrawTool('rectangle')}
            >
              <i className="fa-regular fa-square" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-rs-panel__tool${mapDrawTool === 'polygon' ? ' is-on' : ''}`}
              title="Polygon AOI"
              aria-pressed={mapDrawTool === 'polygon'}
              onClick={() => onDrawTool('polygon')}
            >
              <i className="fa-solid fa-draw-polygon" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-rs-panel__tool${mapDrawTool === 'circle' ? ' is-on' : ''}`}
              title="Circle AOI"
              aria-pressed={mapDrawTool === 'circle'}
              onClick={() => onDrawTool('circle')}
            >
              <i className="fa-regular fa-circle" aria-hidden />
            </button>
            <button
              type="button"
              className="si-rs-panel__tool"
              disabled={!hasClearableDrawing}
              title="Clear drawing"
              aria-label="Clear drawing"
              onClick={onClearDrawing}
            >
              <i className="fa-solid fa-eraser" aria-hidden />
            </button>
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
              className={`si-rs-panel__tool${mapDrawTool === 'polyline' ? ' is-on' : ''}`}
              title="Measure distance"
              aria-pressed={mapDrawTool === 'polyline'}
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
        </div>

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
