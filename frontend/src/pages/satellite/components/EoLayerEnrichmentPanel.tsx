import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import {
  buildEoEnrichmentPopupConfig,
  collectEoEnrichmentFieldKeys,
  downloadEoCsv,
  downloadEoGeoJson,
  runEoLayerEnrichment,
} from '../../../lib/eoLayerEnrichmentRun'
import { generateEoEnrichmentReportDocx } from '../../../lib/eoEnrichmentReport/generateEoEnrichmentReportDocx'
import { exportVectorLayer } from '../../../lib/vectorLayerExport'
import type { SiLayerPopupConfig } from '../../../lib/siLayerPopupConfig'
import type { FieldImagerySource } from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import type { FieldBoundaryPhase } from './useAgriFieldBoundary'
import './EoLayerEnrichmentPanel.css'

export type EoEnrichMapLayerOption = {
  id: string
  name: string
  geojson: FeatureCollection | unknown
}

export type EoEnrichApplyPayload = {
  geojson: FeatureCollection
  name: string
  /** When set, update this map layer in place; otherwise add a new layer. */
  sourceLayerId?: string | null
  popupConfig: SiLayerPopupConfig
  fieldOrder: string[]
  openAttributeTable?: boolean
}

export type EoWorkflowMode = 'attributes' | 'segmentations'

export type EoSegmentationsProps = {
  hasAoi: boolean
  source: FieldImagerySource
  onSourceChange: (s: FieldImagerySource) => void
  sourceOptions: Array<{ id: FieldImagerySource; label: string }>
  minConfidence: number
  onMinConfidenceChange: (v: number) => void
  minAreaM2: number
  onMinAreaM2Change: (v: number) => void
  phase: FieldBoundaryPhase
  progress: number
  busy: boolean
  error: string | null
  fieldCount: number
  totalAreaHa: number
  hasResult: boolean
  onRun: () => void
  onAddToLayers: () => void
  onDownloadShp: () => void | Promise<void>
}

type EoLayerEnrichmentPanelProps = {
  onClose: () => void
  /** Vector layers currently on the map (Layers list). */
  mapLayers?: EoEnrichMapLayerOption[]
  /** Active Edit AOI / drawn clip — auto-enriched from latest Sentinel-2. */
  activeAoi?: FeatureCollection | null
  /**
   * Apply enrichment to the map: updates Attributes + Popups.
   * Called automatically after a successful Run.
   */
  onApplyEnrichedLayer?: (payload: EoEnrichApplyPayload) => void
  /** Field-boundary detection controls for Segmentations workflow. */
  segmentations?: EoSegmentationsProps
}

function asFc(input: unknown): FeatureCollection {
  if (!input || typeof input !== 'object') return { type: 'FeatureCollection', features: [] }
  const any = input as { type?: string; features?: FeatureCollection['features'] }
  if (any.type === 'FeatureCollection' && Array.isArray(any.features)) {
    return { type: 'FeatureCollection', features: any.features }
  }
  return { type: 'FeatureCollection', features: [] }
}

function polygonCount(fc: FeatureCollection): number {
  return (fc.features ?? []).filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  ).length
}

type SourceMode = 'aoi' | 'map' | 'file'

const SEG_PHASE_LABEL: Record<FieldBoundaryPhase, string> = {
  idle: 'Ready',
  capturing: 'Capturing imagery…',
  detecting: 'Detecting fields…',
  done: 'Fields ready',
  error: 'Detection failed',
}

export function EoLayerEnrichmentPanel({
  onClose,
  mapLayers = [],
  activeAoi = null,
  onApplyEnrichedLayer,
  segmentations,
}: EoLayerEnrichmentPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const aoiFc = useMemo(() => asFc(activeAoi), [activeAoi])
  const aoiPolyCount = polygonCount(aoiFc)

  const vectorMapLayers = useMemo(
    () =>
      mapLayers.filter(l => {
        const fc = asFc(l.geojson)
        return polygonCount(fc) > 0
      }),
    [mapLayers],
  )

  const defaultMode: SourceMode = aoiPolyCount
    ? 'aoi'
    : vectorMapLayers.length
      ? 'map'
      : 'file'

  const [workflowMode, setWorkflowMode] = useState<EoWorkflowMode>('attributes')
  const [sourceMode, setSourceMode] = useState<SourceMode>(defaultMode)
  const [selectedLayerId, setSelectedLayerId] = useState(vectorMapLayers[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [maxCloud, setMaxCloud] = useState(20)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState(
    aoiPolyCount
      ? ''
      : vectorMapLayers.length
        ? 'Select a layer from the list, or upload a vector file.'
        : 'Select a KMZ / KML / SHP / GeoJSON / GPKG farm layer.',
  )
  const [error, setError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [result, setResult] = useState<{
    geojson: FeatureCollection
    featureCount: number
    acquisitionDate: string | null
    sourceLayerId: string | null
    baseName: string
  } | null>(null)

  useEffect(() => {
    if (aoiPolyCount > 0 && sourceMode !== 'aoi' && !busy && !result) {
      setSourceMode('aoi')
      setMessage('')
    }
  }, [aoiPolyCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMapLayer = vectorMapLayers.find(l => l.id === selectedLayerId) ?? null
  const canRun =
    sourceMode === 'file'
      ? !!file
      : sourceMode === 'aoi'
        ? aoiPolyCount > 0
        : !!selectedMapLayer && polygonCount(asFc(selectedMapLayer.geojson)) > 0

  const applyResult = useCallback(
    (out: {
      geojson: FeatureCollection
      featureCount: number
      acquisitionDate: string | null
      sourceLayerId: string | null
      baseName: string
    }) => {
      if (!onApplyEnrichedLayer) return
      const fieldOrder = collectEoEnrichmentFieldKeys(out.geojson)
      const popupConfig = buildEoEnrichmentPopupConfig(out.geojson) as SiLayerPopupConfig
      onApplyEnrichedLayer({
        geojson: out.geojson,
        name: out.sourceLayerId ? out.baseName : `${out.baseName}_enriched`,
        sourceLayerId: out.sourceLayerId,
        popupConfig,
        fieldOrder,
        openAttributeTable: true,
      })
    },
    [onApplyEnrichedLayer],
  )

  const onDownloadLayer = useCallback(
    async (format: 'geojson' | 'csv' | 'kmz' | 'shp' | 'xlsx') => {
      if (!result) return
      setExportMsg(null)
      setExportBusy(true)
      try {
        const base = `${result.baseName}_enriched`
        if (format === 'geojson') downloadEoGeoJson(result.geojson, `${base}.geojson`)
        else if (format === 'csv') downloadEoCsv(result.geojson, `${base}.csv`)
        else await exportVectorLayer(result.geojson, format, base)
        setExportMsg(`Downloaded ${format.toUpperCase()} · updated layer.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setExportBusy(false)
      }
    },
    [result],
  )

  const onExportDocx = useCallback(async () => {
    if (!result) return
    setExportMsg(null)
    setExportBusy(true)
    try {
      await generateEoEnrichmentReportDocx({
        geojson: result.geojson,
        layerName: result.baseName,
        acquisitionDate: result.acquisitionDate,
      })
      setExportMsg('Professional DOCX report exported.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExportBusy(false)
    }
  }, [result])

  const onRun = useCallback(async () => {
    if (sourceMode === 'file' && !file) {
      setError('Choose a vector file first.')
      return
    }
    if (sourceMode === 'map' && !selectedMapLayer) {
      setError('Select a layer from the list.')
      return
    }
    if (sourceMode === 'aoi' && aoiPolyCount === 0) {
      setError('Draw or select an Edit AOI first.')
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setError(null)
    setExportMsg(null)
    setResult(null)
    setProgress(0)
    try {
      const baseName =
        sourceMode === 'file'
          ? file!.name.replace(/\.[^.]+$/, '') || 'layer'
          : sourceMode === 'aoi'
            ? 'Edit_AOI'
            : selectedMapLayer!.name || 'layer'

      const geojson =
        sourceMode === 'aoi'
          ? aoiFc
          : sourceMode === 'map'
            ? asFc(selectedMapLayer!.geojson)
            : null

      const out = await runEoLayerEnrichment({
        file: sourceMode === 'file' ? file : null,
        geojson,
        maxCloudCoverage: maxCloud,
        lookbackDays: 180,
        signal: ac.signal,
        onProgress: p => {
          setProgress(p.pct)
          setMessage(p.message)
        },
      })

      const packed = {
        ...out,
        sourceLayerId: sourceMode === 'map' ? selectedMapLayer!.id : null,
        baseName,
      }
      setResult(packed)
      setMessage(
        `Filled existing fields on ${out.featureCount} polygon(s)${out.acquisitionDate ? ` · latest S2 ${out.acquisitionDate}` : ''}.`,
      )
      applyResult(packed)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setMessage('Cancelled.')
      } else {
        setError(err instanceof Error ? err.message : String(err))
        setMessage('Enrichment failed.')
      }
    } finally {
      setBusy(false)
    }
  }, [file, maxCloud, sourceMode, selectedMapLayer, aoiFc, aoiPolyCount, applyResult])

  const onCancel = () => {
    abortRef.current?.abort()
    setBusy(false)
  }

  const segBusy = Boolean(segmentations?.busy)
  const segCanRun = Boolean(segmentations?.hasAoi && !segBusy)

  return (
    <div className="si-env-section-card si-field-analysis si-eo-enrich-panel si-rs-panel--glass">
      <div className="si-eo-enrich__head">
        <div>
          <div className="si-eo-enrich__title">EO Layer Enrichment</div>
        </div>
        <button type="button" className="si-env-close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <div className="si-eo-enrich__workflow" role="group" aria-label="Workflow">
        <button
          type="button"
          className={`si-eo-enrich__mode-btn${workflowMode === 'attributes' ? ' is-on' : ''}`}
          disabled={busy || segBusy}
          onClick={() => setWorkflowMode('attributes')}
        >
          Attributes
        </button>
        <button
          type="button"
          className={`si-eo-enrich__mode-btn${workflowMode === 'segmentations' ? ' is-on' : ''}`}
          disabled={busy || segBusy || !segmentations}
          onClick={() => setWorkflowMode('segmentations')}
        >
          Segmentations
        </button>
      </div>

      {workflowMode === 'segmentations' && segmentations ? (
        <>
          <label className="si-eo-enrich__field">
            <span>Source</span>
            <select
              value={segmentations.source}
              disabled={segBusy}
              onChange={e => segmentations.onSourceChange(e.target.value as FieldImagerySource)}
            >
              {segmentations.sourceOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="si-eo-enrich__field">
            <span>
              Confidence <em>{Math.round(segmentations.minConfidence * 100)}%</em>
            </span>
            <input
              type="range"
              min={0.2}
              max={0.9}
              step={0.05}
              value={segmentations.minConfidence}
              disabled={segBusy}
              onChange={e => segmentations.onMinConfidenceChange(Number(e.target.value))}
            />
          </label>

          <label className="si-eo-enrich__field">
            <span>
              Min area <em>{segmentations.minAreaM2} m²</em>
            </span>
            <input
              type="range"
              min={50}
              max={5000}
              step={50}
              value={segmentations.minAreaM2}
              disabled={segBusy}
              onChange={e => segmentations.onMinAreaM2Change(Number(e.target.value))}
            />
          </label>

          {!segmentations.hasAoi ? (
            <div className="si-eo-enrich__file">Draw an AOI on the map first.</div>
          ) : null}

          <div className="si-eo-enrich__progress" aria-live="polite">
            <div className="si-eo-enrich__bar">
              <div
                className="si-eo-enrich__bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, segmentations.progress))}%`,
                }}
              />
            </div>
            <div className="si-eo-enrich__msg">
              {segmentations.phase === 'error'
                ? segmentations.error || SEG_PHASE_LABEL.error
                : SEG_PHASE_LABEL[segmentations.phase]}
              {segBusy && segmentations.phase === 'detecting'
                ? ` · ${Math.round(segmentations.progress)}%`
                : ''}
            </div>
          </div>

          {segmentations.error && segmentations.phase === 'error' ? (
            <div className="si-eo-enrich__error">{segmentations.error}</div>
          ) : null}

          <div className="si-eo-enrich__actions">
            <button
              type="button"
              className="si-eo-enrich__btn si-eo-enrich__btn--primary"
              onClick={segmentations.onRun}
              disabled={!segCanRun}
            >
              <i className="fa-solid fa-crop-simple" aria-hidden />{' '}
              {segBusy ? 'Detecting…' : 'Run'}
            </button>
          </div>

          {segmentations.hasResult ? (
            <div className="si-eo-enrich__exports">
              <div className="si-eo-enrich__exports-title">
                {segmentations.fieldCount} fields · {segmentations.totalAreaHa.toFixed(2)} ha
              </div>
              <div className="si-eo-enrich__actions">
                <button
                  type="button"
                  className="si-eo-enrich__btn si-eo-enrich__btn--primary"
                  onClick={segmentations.onAddToLayers}
                >
                  <i className="fa-solid fa-layer-group" aria-hidden /> Add to Layers (SHP)
                </button>
                <button
                  type="button"
                  className="si-eo-enrich__btn"
                  onClick={() => void segmentations.onDownloadShp()}
                >
                  <i className="fa-solid fa-file-zipper" aria-hidden /> Download SHP
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="si-eo-enrich__mode" role="group" aria-label="Source">
            <button
              type="button"
              className={`si-eo-enrich__mode-btn${sourceMode === 'aoi' ? ' is-on' : ''}`}
              disabled={!aoiPolyCount || busy}
              onClick={() => {
                setSourceMode('aoi')
                setError(null)
                setResult(null)
                setMessage('')
              }}
            >
              Edit AOI
            </button>
            <button
              type="button"
              className={`si-eo-enrich__mode-btn${sourceMode === 'map' ? ' is-on' : ''}`}
              disabled={!vectorMapLayers.length || busy}
              onClick={() => {
                setSourceMode('map')
                setError(null)
                setResult(null)
                setMessage(
                  vectorMapLayers.length
                    ? 'Select a polygon layer from Layers.'
                    : 'No polygon layers on the map.',
                )
              }}
            >
              List (Layers)
            </button>
            <button
              type="button"
              className={`si-eo-enrich__mode-btn${sourceMode === 'file' ? ' is-on' : ''}`}
              disabled={busy}
              onClick={() => {
                setSourceMode('file')
                setError(null)
                setResult(null)
                setMessage('Upload a KMZ / KML / SHP / GeoJSON / GPKG file.')
              }}
            >
              Upload file
            </button>
          </div>

          {sourceMode === 'aoi' ? (
            <div className="si-eo-enrich__field">
              <span>Active AOI</span>
              <div className="si-eo-enrich__file">
                {aoiPolyCount
                  ? `${aoiPolyCount} polygon(s)`
                  : 'Draw or select an Edit AOI on the map first.'}
              </div>
            </div>
          ) : sourceMode === 'map' ? (
            <label className="si-eo-enrich__field">
              <span>Layer</span>
              <select
                value={selectedLayerId}
                disabled={busy || !vectorMapLayers.length}
                onChange={e => {
                  setSelectedLayerId(e.target.value)
                  setResult(null)
                  setError(null)
                  const hit = vectorMapLayers.find(l => l.id === e.target.value)
                  const n = hit ? polygonCount(asFc(hit.geojson)) : 0
                  setMessage(n ? `${n} polygon(s) selected.` : 'Select a layer.')
                }}
              >
                {!vectorMapLayers.length ? <option value="">No polygon layers</option> : null}
                {vectorMapLayers.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({polygonCount(asFc(l.geojson))} polygons)
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="si-eo-enrich__field">
              <span>Vector layer</span>
              <input
                ref={inputRef}
                type="file"
                accept=".kmz,.kml,.shp,.zip,.geojson,.json,.gpkg"
                disabled={busy}
                onChange={e => {
                  setFile(e.target.files?.[0] ?? null)
                  setResult(null)
                  setError(null)
                }}
              />
              {file ? <span className="si-eo-enrich__file">{file.name}</span> : null}
            </label>
          )}

          <label className="si-eo-enrich__field">
            <span>Max cloud cover %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={maxCloud}
              disabled={busy}
              onChange={e => setMaxCloud(Number(e.target.value) || 20)}
            />
          </label>

          <div className="si-eo-enrich__progress" aria-live="polite">
            <div className="si-eo-enrich__bar">
              <div
                className="si-eo-enrich__bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {message ? <div className="si-eo-enrich__msg">{message}</div> : null}
          </div>

          {error ? <div className="si-eo-enrich__error">{error}</div> : null}

          <div className="si-eo-enrich__actions">
            {!busy ? (
              <button
                type="button"
                className="si-eo-enrich__btn si-eo-enrich__btn--primary"
                onClick={() => void onRun()}
                disabled={!canRun}
              >
                <i className="fa-solid fa-satellite" aria-hidden /> Run enrichment
              </button>
            ) : (
              <button type="button" className="si-eo-enrich__btn" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>

          {result ? (
            <div className="si-eo-enrich__exports">
              <div className="si-eo-enrich__exports-title">Export updated layer (KMZ · SHP · XLSX)</div>
              <div className="si-eo-enrich__actions">
                <button
                  type="button"
                  className="si-eo-enrich__btn si-eo-enrich__btn--primary"
                  disabled={exportBusy}
                  onClick={() => void onDownloadLayer('geojson')}
                >
                  <i className="fa-solid fa-download" aria-hidden /> GeoJSON
                </button>
                <button
                  type="button"
                  className="si-eo-enrich__btn"
                  disabled={exportBusy}
                  onClick={() => void onDownloadLayer('csv')}
                >
                  <i className="fa-solid fa-file-csv" aria-hidden /> CSV
                </button>
                <button
                  type="button"
                  className="si-eo-enrich__btn"
                  disabled={exportBusy}
                  onClick={() => void onDownloadLayer('kmz')}
                >
                  <i className="fa-solid fa-globe" aria-hidden /> KMZ
                </button>
                <button
                  type="button"
                  className="si-eo-enrich__btn"
                  disabled={exportBusy}
                  onClick={() => void onDownloadLayer('shp')}
                >
                  <i className="fa-solid fa-draw-polygon" aria-hidden /> SHP
                </button>
                <button
                  type="button"
                  className="si-eo-enrich__btn"
                  disabled={exportBusy}
                  onClick={() => void onDownloadLayer('xlsx')}
                >
                  <i className="fa-solid fa-file-excel" aria-hidden /> Excel
                </button>
              </div>

              <div className="si-eo-enrich__exports-title">Professional report</div>
              <div className="si-eo-enrich__actions">
                <button
                  type="button"
                  className="si-eo-enrich__btn si-eo-enrich__btn--primary"
                  disabled={exportBusy}
                  onClick={() => void onExportDocx()}
                >
                  <i className="fa-solid fa-file-word" aria-hidden /> Export to DOCX
                </button>
                {onApplyEnrichedLayer ? (
                  <button
                    type="button"
                    className="si-eo-enrich__btn"
                    disabled={exportBusy}
                    onClick={() => applyResult(result)}
                  >
                    <i className="fa-solid fa-table-cells" aria-hidden /> Open attributes
                  </button>
                ) : null}
              </div>
              {exportMsg ? <div className="si-eo-enrich__export-msg">{exportMsg}</div> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export default EoLayerEnrichmentPanel
