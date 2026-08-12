import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import {
  remoteSensingCollectionsForProvider,
  remoteSensingProviderOptions,
} from '../../../lib/remoteSensingProviders'
import { isSentinel2L2ACollection } from '../../../lib/agriFieldBoundary/sen2srClient'
import { RemoteSensingLayerSelect } from './RemoteSensingLayerSelect'
import { SiRsPanelSelect } from './SiRsPanelSelect'
import { SiAoiLayerModePanel } from './SiAoiLayerModePanel'
import type { SiAoiMaskBuilderLayerOption, SiAoiMaskBuilderSettings } from '../../../lib/siAoiMaskBuilder'
import type { RemoteSensingDrawingTool } from './RemoteSensingDrawingToolbar'
import { Sen2srProductControls } from './Sen2srProductControls'
import { useSen2srControls } from './useSen2srControls'
import { useEffect, useState } from 'react'

export const REMOTE_SENSING_PROVIDERS = remoteSensingProviderOptions()

export const REMOTE_SENSING_COLLECTIONS = remoteSensingCollectionsForProvider('sentinel-hub')

export type RemoteSensingDrawTool = RemoteSensingDrawingTool | 'select' | 'polyline' | string

export type RemoteSensingToolboxPanelProps = {
  provider: string
  onProviderChange: (id: string) => void
  collection: string
  onCollectionChange: (id: string) => void
  /** Live status for which provider/backend is driving MapGL WMS tiles. */
  mapStatusLine?: string | null
  wmsDate: string
  onWmsDateChange: (iso: string) => void
  onResetImageryDateAuto: () => void
  imageryDateAutoFollow: boolean
  isFetchingSentinelScenes: boolean
  imageryDateMeta: string | null
  /** Max cloud cover % for scene catalog / WMS (0–100). */
  cloudCoverage: number
  onCloudCoverageChange: (pct: number) => void
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
  /** Optional AOI clip for SEN2SR enhance when a local L2A GeoTIFF is uploaded. */
  resolveSen2srAoi?: () =>
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon
    | GeoJSON.Feature
    | GeoJSON.FeatureCollection
    | null
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
    cloudCoverage,
    onCloudCoverageChange,
    layerGroups,
    layerValue,
    onLayerChange,
    isLoadingLayers,
    showOnMap,
    onShowOnMapChange,
    showOnMapLabel,
    showOnMapDisabled = false,
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
    resolveSen2srAoi,
  } = props

  const collectionOptions = remoteSensingCollectionsForProvider(provider)
  const showSen2sr = isSentinel2L2ACollection(collection)
  const sen2sr = useSen2srControls({
    enabled: showSen2sr,
    resolveAoi: resolveSen2srAoi,
  })
  const cloudSafe = Math.max(0, Math.min(100, Math.round(Number(cloudCoverage) || 0)))
  const [cloudDraft, setCloudDraft] = useState(cloudSafe)
  useEffect(() => {
    setCloudDraft(cloudSafe)
  }, [cloudSafe])

  const commitCloud = () => {
    if (cloudDraft !== cloudSafe) onCloudCoverageChange(cloudDraft)
  }

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

        <div className="si-rs-panel__stack si-rs-panel__stack--cloud">
          <div className="si-rs-panel__cloud-row">
            <span className="si-rs-panel__cloud-label">Cloud</span>
            <input
              type="range"
              className="si-rs-panel__cloud-slider"
              min={0}
              max={100}
              step={1}
              value={cloudDraft}
              aria-label="Maximum cloud coverage percent"
              onChange={e => setCloudDraft(Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
              onPointerUp={commitCloud}
              onKeyUp={commitCloud}
              onBlur={commitCloud}
            />
            <span className="si-rs-panel__cloud-value" title="Max cloud coverage">
              <i className="fa-solid fa-cloud" aria-hidden />
              <strong>{cloudDraft}%</strong>
            </span>
          </div>
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

        <label className="si-rs-panel__stack">
          <span className="si-rs-panel__label">Index layer</span>
          <RemoteSensingLayerSelect
            groups={layerGroups}
            value={isLoadingLayers ? '' : layerValue}
            onChange={onLayerChange}
            loading={isLoadingLayers}
            loadingLabel="Loading layers…"
            emptyLabel="No layers for this satellite — check credentials or pick another provider."
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
          </>
        ) : null}
        {wmsZoomWarning ? (
          <p className="si-rs-panel__meta si-rs-panel__meta--warn si-rs-panel__meta--inline" role="status">
            {wmsZoomWarning}
          </p>
        ) : null}

        {showSen2sr ? (
          <div className="si-rs-panel__stack si-rs-panel__stack--section">
            <Sen2srProductControls
              status={sen2sr.status}
              productMode={sen2sr.productMode}
              onProductModeChange={sen2sr.setProductMode}
              display1m={sen2sr.display1m}
              onDisplay1mChange={sen2sr.setDisplay1m}
              showFilePicker
              geotiffFileName={sen2sr.geotiffFileName}
              onPickGeotiff={sen2sr.pickGeotiff}
              onEnhance={() => void sen2sr.enhance()}
              canEnhance={sen2sr.canEnhance}
              enhanceBusy={sen2sr.busy}
              enhanceError={sen2sr.error}
              enhanceNotice={sen2sr.notice}
              rawHint="RAW mode keeps the existing WMS / index pipeline at native Sentinel-2 10 m."
              sen2srHint="SEN2SR needs a local Sentinel-2 L2A GeoTIFF — WMS tiles are not rewritten as native 2.5 m."
            />
          </div>
        ) : null}

        <div className="si-rs-panel__stack si-rs-panel__stack--section">
          <SiAoiLayerModePanel
            settings={aoiLayerModeSettings}
            onChange={onAoiLayerModeChange}
            layerOptions={aoiLayerOptions}
            maskFeatureCount={aoiLayerMaskFeatureCount}
            selectedFeatureCount={aoiLayerSelectedFeatureCount}
            disabled={aoiLayerModeDisabled}
            zoomWarning={aoiLayerModeSettings.enabled ? wmsZoomWarning : null}
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
