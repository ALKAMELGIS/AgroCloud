import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import {
  remoteSensingCollectionsForProvider,
  remoteSensingProviderDef,
  remoteSensingProviderOptions,
} from '../../../lib/remoteSensingProviders'
import { RemoteSensingLayerSelect } from './RemoteSensingLayerSelect'
import { SiRsPanelSelect } from './SiRsPanelSelect'
import { SiAoiLayerModePanel } from './SiAoiLayerModePanel'
import type { SiAoiMaskBuilderLayerOption, SiAoiMaskBuilderSettings } from '../../../lib/siAoiMaskBuilder'
import type { RemoteSensingDrawingTool } from './RemoteSensingDrawingToolbar'

export const REMOTE_SENSING_PROVIDERS = remoteSensingProviderOptions()

export const REMOTE_SENSING_COLLECTIONS = remoteSensingCollectionsForProvider('sentinel-hub')

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
  showOnMapDisabled?: boolean
  showOnMapHint?: string | null
  wmsZoomWarning: string | null
  aoiLayerModeSettings: SiAoiMaskBuilderSettings
  onAoiLayerModeChange: (next: SiAoiMaskBuilderSettings) => void
  aoiLayerOptions: SiAoiMaskBuilderLayerOption[]
  aoiLayerMaskFeatureCount: number
  aoiLayerSelectedFeatureCount: number
  aoiLayerModeDisabled?: boolean
  sentinelLayerOptions: Array<{ id: string; label: string }>
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
  onOpenLayerLegend: () => void
  layerLegendOpen: boolean
  fieldTimelineActive: boolean
  onTimelinePrimaryClick: () => void
  fieldAnalysisStatus: string | null
  onExportGeoTiff?: () => void
  exportGeoTiffBusy?: boolean
  exportGeoTiffLabel?: string | null
  exportGeoTiffDisabled?: boolean
  /** UCSB CHIRPS precipitation controls (when PRECIP layer selected). */
  chirpsMode?: boolean
  chirpsAggregation?: 'daily' | 'monthly' | 'seasonal' | 'annual'
  onChirpsAggregationChange?: (v: 'daily' | 'monthly' | 'seasonal' | 'annual') => void
  onChirpsRun?: () => void
  chirpsBusy?: boolean
  chirpsStats?: Array<{ label: string; value: string }>
  chirpsError?: string | null
  onChirpsExportCsv?: () => void
  onChirpsExportExcel?: () => void
  onChirpsExportReport?: () => void
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
    layerGroups,
    layerValue,
    onLayerChange,
    isLoadingLayers,
    showOnMap,
    onShowOnMapChange,
    showOnMapLabel,
    showOnMapDisabled = false,
    showOnMapHint,
    wmsZoomWarning,
    aoiLayerModeSettings,
    onAoiLayerModeChange,
    aoiLayerOptions,
    aoiLayerMaskFeatureCount,
    aoiLayerSelectedFeatureCount,
    aoiLayerModeDisabled = false,
    sentinelLayerOptions,
    timeSeriesStart,
    timeSeriesEnd,
    onTimeSeriesStartChange,
    onTimeSeriesEndChange,
    rsDrawingModeActive,
    onRsDrawingModeChange,
    rsDrawingTool,
    onRsDrawingToolChange,
    hasClearableDrawing,
    onClearDrawing,
    onOpenLayerLegend,
    layerLegendOpen,
    fieldTimelineActive,
    onTimelinePrimaryClick,
    fieldAnalysisStatus,
    onExportGeoTiff,
    exportGeoTiffBusy = false,
    exportGeoTiffLabel = null,
    exportGeoTiffDisabled = false,
    chirpsMode = false,
    chirpsAggregation = 'daily',
    onChirpsAggregationChange,
    onChirpsRun,
    chirpsBusy = false,
    chirpsStats,
    chirpsError,
    onChirpsExportCsv,
    onChirpsExportExcel,
    onChirpsExportReport,
  } = props

  const providerMeta = remoteSensingProviderDef(provider)
  const collectionOptions = remoteSensingCollectionsForProvider(provider)

  return (
    <div className="si-env-section-card si-field-analysis si-rs-panel si-rs-panel--glass si-rs-panel--toolbox-v2 si-rs-panel--flat">
      <div className="si-rs-panel__body si-rs-panel__body--flat">
        <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--2">
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Provider</span>
            <SiRsPanelSelect
              options={REMOTE_SENSING_PROVIDERS}
              value={provider}
              onChange={onProviderChange}
              aria-label="Satellite provider"
            />
          </label>
          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">Collection</span>
            <SiRsPanelSelect
              options={collectionOptions}
              value={collection}
              onChange={onCollectionChange}
              aria-label="Sensor or collection"
            />
          </label>
        </div>

        {!providerMeta.integrated && providerMeta.hint ? (
          <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
            <i className="fa-solid fa-circle-info" aria-hidden /> {providerMeta.hint}
          </p>
        ) : null}

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
          <>
            <label className="si-rs-panel__show-box">
              <input
                type="checkbox"
                checked={showOnMap}
                onChange={e => onShowOnMapChange(e.target.checked)}
                disabled={showOnMapDisabled}
                aria-label={showOnMapLabel}
              />
              <span>{showOnMapLabel}</span>
            </label>
            {showOnMapHint ? (
              <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
                {showOnMapHint}
              </p>
            ) : null}
          </>
        ) : null}
        {wmsZoomWarning ? (
          <p className="si-rs-panel__meta si-rs-panel__meta--warn si-rs-panel__meta--inline" role="status">
            {wmsZoomWarning}
          </p>
        ) : null}

        <div className="si-rs-panel__stack si-rs-panel__stack--section">
          <span className="si-rs-panel__label">AOI layer mode</span>
          <SiAoiLayerModePanel
            settings={aoiLayerModeSettings}
            onChange={onAoiLayerModeChange}
            layerOptions={aoiLayerOptions}
            maskFeatureCount={aoiLayerMaskFeatureCount}
            selectedFeatureCount={aoiLayerSelectedFeatureCount}
            disabled={aoiLayerModeDisabled}
          />
        </div>

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

        {chirpsMode ? (
          <div className="si-rs-panel__stack si-rs-panel__stack--section">
            <span className="si-rs-panel__label">CHIRPS rainfall</span>
            <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="note">
              UCSB CHIRPS Daily · AOI rainfall (mm) · P · RAI · SPI · RTI · RDI · WAI
            </p>
            <label className="si-rs-panel__stack">
              <span className="si-rs-panel__label">Aggregation</span>
              <SiRsPanelSelect
                value={chirpsAggregation}
                onChange={v => onChirpsAggregationChange?.(v as 'daily' | 'monthly' | 'seasonal' | 'annual')}
                options={[
                  { id: 'daily', label: 'Daily' },
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'seasonal', label: 'Seasonal' },
                  { id: 'annual', label: 'Annual' },
                ]}
                aria-label="Rainfall aggregation"
              />
            </label>
            <button
              type="button"
              className="si-rs-panel__cta"
              onClick={onChirpsRun}
              disabled={chirpsBusy || exportGeoTiffDisabled}
            >
              {chirpsBusy ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
              ) : (
                <i className="fa-solid fa-cloud-rain" aria-hidden />
              )}
              {chirpsBusy ? 'Loading CHIRPS…' : 'Load rainfall map'}
            </button>
            {chirpsStats?.length ? (
              <dl className="si-rs-panel__meta" style={{ display: 'grid', gap: 4, margin: 0 }}>
                {chirpsStats.map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <dt>{s.label}</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {chirpsError ? (
              <p className="si-rs-panel__meta si-rs-panel__meta--warn" role="alert">
                {chirpsError}
              </p>
            ) : null}
            <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--2">
              {onChirpsExportCsv ? (
                <button type="button" className="si-rs-panel__cta si-rs-panel__cta--secondary" onClick={onChirpsExportCsv}>
                  CSV
                </button>
              ) : null}
              {onChirpsExportExcel ? (
                <button type="button" className="si-rs-panel__cta si-rs-panel__cta--secondary" onClick={onChirpsExportExcel}>
                  Excel
                </button>
              ) : null}
            </div>
            {onChirpsExportReport ? (
              <button type="button" className="si-rs-panel__cta si-rs-panel__cta--secondary" onClick={onChirpsExportReport}>
                Report (Word)
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="si-rs-panel__stack">
          <span className="si-rs-panel__label">Map tools</span>
          <div className="si-rs-panel__toolgrid" role="toolbar" aria-label="Map tools">
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

        {onExportGeoTiff ? (
          <button
            type="button"
            className="si-rs-panel__cta si-rs-panel__cta--secondary"
            onClick={onExportGeoTiff}
            disabled={exportGeoTiffBusy || exportGeoTiffDisabled || fieldTimelineActive}
            title="Export RGBA colour + Float32 GeoTIFF (NoData=−9999) for ArcGIS Pro / QGIS. Open *_rgb.tif first."
            aria-label="Export index GeoTIFF for GIS"
          >
            {exportGeoTiffBusy ? (
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
            ) : (
              <i className="fa-solid fa-globe" aria-hidden />
            )}
            {exportGeoTiffBusy
              ? exportGeoTiffLabel || 'Exporting GeoTIFF…'
              : 'Export GeoTIFF (GIS)'}
          </button>
        ) : null}

        {fieldAnalysisStatus ? <p className="si-rs-panel__status">{fieldAnalysisStatus}</p> : null}
      </div>
    </div>
  )
}
