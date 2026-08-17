import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_BOUNDARY_BUFFER_M,
  DEFAULT_IOU_THRESHOLD,
  DEFAULT_SWEEP_THRESHOLDS,
  buildValidationContext,
  metricsAtThreshold,
  summarizeFieldGeometry,
  sweepIouThresholds,
  validationMetricsCsv,
  type FieldValidationMetrics,
  type IouSweepPoint,
  type ValidationContext,
} from '../../../lib/agriFieldBoundary/fieldValidationMetrics'
import { normalizeEpochHistory } from '../../../lib/trainingAi/analyzeTrainingHistory'
import {
  fetchLatestEpochHistory,
  fetchTrainingModel,
  type TrainingEpochRecord,
} from '../../../lib/trainingAi/trainingAiClient'
import {
  EPOCH_HISTORY_CHANGED_EVENT,
  loadPersistedEpochHistory,
  loadPersistedTrainingModel,
  savePersistedEpochHistory,
} from '../../../lib/trainingAi/trainingModelPersistence'
import { ConfusionMatrixHeatmap } from './ConfusionMatrixHeatmap'
import { EpochDetailsTable, type EpochDetailRow } from './EpochDetailsTable'
import { ValidationLinePlot, type PlotSeries } from './ValidationLinePlot'
import './AgriFieldBoundaryValidatePanel.css'

export type AgriFieldBoundaryValidatePanelProps = {
  /** Detected field polygons from the last run. */
  geojson: GeoJSON.FeatureCollection | null
  fieldCount: number
  totalAreaHa: number
  engine: string | null
  score?: number | null
  /** Optional epoch rows (Training & AI). Falls back to the last persisted run. */
  epochHistory?: EpochDetailRow[] | null
  /** Auto-apply Training & AI samples or a reference layer when the user has not picked one. */
  initialReference?: GeoJSON.FeatureCollection | null
  initialReferenceName?: string | null
  /** Status while auto FoW / FTW dataset reference is loading. */
  referenceNotice?: string | null
  referenceBusy?: boolean
  /**
   * `dashboard` = embedded in the floating Results Dashboard (hides duplicate
   * KPI chips and Epochs Details — those live in the dashboard chrome).
   */
  variant?: 'dock' | 'dashboard'
}

const SWEEP_SERIES: Array<{ id: keyof IouSweepPoint; label: string; color: string }> = [
  { id: 'precision', label: 'Precision', color: '#a3a3a3' },
  { id: 'recall', label: 'Recall', color: '#60a5fa' },
  { id: 'f1', label: 'F1', color: '#f87171' },
]

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

function num(v: number | null | undefined, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

export function AgriFieldBoundaryValidatePanel({
  geojson,
  fieldCount,
  totalAreaHa,
  engine,
  score,
  epochHistory = null,
  initialReference = null,
  initialReferenceName = null,
  referenceNotice = null,
  referenceBusy = false,
  variant = 'dock',
}: AgriFieldBoundaryValidatePanelProps) {
  const [reference, setReference] = useState<GeoJSON.FeatureCollection | null>(null)
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [iouThreshold, setIouThreshold] = useState(DEFAULT_IOU_THRESHOLD)
  const [bufferM, setBufferM] = useState(DEFAULT_BOUNDARY_BUFFER_M)
  const [ctx, setCtx] = useState<ValidationContext | null>(null)
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const referenceTouchedRef = useRef(false)

  useEffect(() => {
    if (!initialReference?.features?.length || referenceTouchedRef.current) return
    setReference(initialReference)
    setReferenceName(
      initialReferenceName ??
        `Training samples · ${initialReference.features.length} field polygon${initialReference.features.length === 1 ? '' : 's'}`,
    )
    setReferenceError(null)
  }, [initialReference, initialReferenceName])

  const summary = useMemo(() => summarizeFieldGeometry(geojson), [geojson])
  const [liveEpochRows, setLiveEpochRows] = useState<EpochDetailRow[]>(() =>
    normalizeEpochHistory(epochHistory?.length ? epochHistory : loadPersistedEpochHistory()),
  )

  // Keep Epochs Details filled from props → localStorage → last trained model on :8095.
  useEffect(() => {
    if (epochHistory?.length) {
      setLiveEpochRows(normalizeEpochHistory(epochHistory))
      return
    }
    const apply = (rows: TrainingEpochRecord[], mode: 'merge' | 'replace' = 'merge') => {
      const next = normalizeEpochHistory(rows)
      if (!next.length) return
      setLiveEpochRows(prev => {
        if (mode === 'replace') return next
        return prev.length > next.length ? prev : next
      })
      if (mode === 'replace') {
        savePersistedEpochHistory(next)
        return
      }
      const stored = loadPersistedEpochHistory()
      if (stored.length > next.length) return
      savePersistedEpochHistory(next)
    }
    const fromStorage = loadPersistedEpochHistory()
    if (fromStorage.length) setLiveEpochRows(fromStorage)

    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent<{ rows?: TrainingEpochRecord[] }>).detail
      if (detail?.rows?.length) apply(detail.rows, 'replace')
      else {
        const rows = loadPersistedEpochHistory()
        if (rows.length) setLiveEpochRows(rows)
      }
    }
    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== 'agrocloud.trainingAi.lastEpochHistory.v1') return
      const rows = loadPersistedEpochHistory()
      if (rows.length) setLiveEpochRows(rows)
    }
    window.addEventListener(EPOCH_HISTORY_CHANGED_EVENT, onLocal)
    window.addEventListener('storage', onStorage)

    const ac = new AbortController()
    const hydrateFromTrainer = async () => {
      try {
        const persistedModel = loadPersistedTrainingModel()
        if (persistedModel?.model_id) {
          const detail = await fetchTrainingModel(persistedModel.model_id, ac.signal)
          if (detail?.loss_history?.length) {
            apply(detail.loss_history, 'merge')
            return
          }
        }
        const latest = await fetchLatestEpochHistory(ac.signal)
        if (latest.length) apply(latest, 'merge')
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
      }
    }
    if (!fromStorage.length) void hydrateFromTrainer()
    // Re-check periodically so opening Validate after Train never stays empty.
    const id = window.setInterval(() => {
      const rows = loadPersistedEpochHistory()
      if (rows.length) setLiveEpochRows(rows)
      else void hydrateFromTrainer()
    }, 8000)

    return () => {
      ac.abort()
      window.clearInterval(id)
      window.removeEventListener(EPOCH_HISTORY_CHANGED_EVENT, onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [epochHistory])

  const epochRows = liveEpochRows

  useEffect(() => {
    if (!geojson || !reference) {
      setCtx(null)
      setComputeError(null)
      return
    }
    let cancelled = false
    setComputing(true)
    setComputeError(null)
    // Yield a frame so the "Comparing…" state paints before the geometry pass.
    const timer = window.setTimeout(() => {
      try {
        const next = buildValidationContext(geojson, reference, { boundaryBufferM: bufferM })
        if (cancelled) return
        setCtx(next)
        if (!next) setComputeError('Reference layer has no usable polygons.')
      } catch (err) {
        if (!cancelled) {
          setCtx(null)
          setComputeError(err instanceof Error ? err.message : 'Comparison failed.')
        }
      } finally {
        if (!cancelled) setComputing(false)
      }
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [geojson, reference, bufferM])

  const metrics: FieldValidationMetrics | null = useMemo(
    () => (ctx ? metricsAtThreshold(ctx, iouThreshold) : null),
    [ctx, iouThreshold],
  )
  const sweep = useMemo(() => (ctx ? sweepIouThresholds(ctx, DEFAULT_SWEEP_THRESHOLDS) : []), [ctx])

  const curveSeries: PlotSeries[] = useMemo(
    () =>
      SWEEP_SERIES.map(s => ({
        id: String(s.id),
        label: s.label,
        color: s.color,
        markers: true,
        points: sweep.map(p => ({ x: p.threshold, y: Number(p[s.id]) })),
      })),
    [sweep],
  )

  const bestF1 = useMemo(() => sweep.reduce((a, p) => Math.max(a, p.f1), 0), [sweep])

  const onPickReference = useCallback(async (file: File | null) => {
    if (!file) return
    setReferenceError(null)
    try {
      const parsed = JSON.parse(await file.text()) as GeoJSON.FeatureCollection | GeoJSON.Feature
      const fc: GeoJSON.FeatureCollection =
        parsed.type === 'FeatureCollection'
          ? parsed
          : { type: 'FeatureCollection', features: [parsed as GeoJSON.Feature] }
      const count = (fc.features || []).filter(
        f => f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon',
      ).length
      if (!count) {
        setReferenceError('No polygon features found in this file.')
        return
      }
      referenceTouchedRef.current = true
      setReference(fc)
      setReferenceName(`${file.name} · ${count} polygons`)
    } catch {
      setReferenceError('Could not parse GeoJSON — expected a .geojson / .json FeatureCollection.')
    }
  }, [])

  const clearReference = useCallback(() => {
    referenceTouchedRef.current = true
    setReference(null)
    setReferenceName(null)
    setReferenceError(null)
    setCtx(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const downloadCsv = useCallback(() => {
    if (!metrics) return
    const csv = validationMetricsCsv(metrics, sweep)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `field-boundary-validation-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [metrics, sweep])

  const analysisVerdict = useMemo(() => {
    if (!metrics) return null
    const f1 = metrics.f1
    const iou = metrics.iou
    const boundary = metrics.boundaryF1
    let grade: 'strong' | 'fair' | 'weak'
    if (f1 >= 0.75 && iou >= 0.55) grade = 'strong'
    else if (f1 >= 0.5 || iou >= 0.35) grade = 'fair'
    else grade = 'weak'
    const parts = [
      grade === 'strong'
        ? 'Strong agreement with the reference layer.'
        : grade === 'fair'
          ? 'Moderate agreement — review false positives / missed parcels.'
          : 'Weak agreement — check AOI, confidence, or reference alignment.',
      `Precision ${pct(metrics.precision)}, recall ${pct(metrics.recall)}, F1 ${num(metrics.f1)}.`,
      `Area IoU ${num(iou)}; matched IoU ${num(metrics.meanMatchedIou)}.`,
    ]
    if (boundary != null) parts.push(`Boundary F1 ${num(boundary)} (tolerance ${metrics.boundaryBufferM} m).`)
    if (metrics.areaErrorPct != null) {
      parts.push(`Field-area error ${metrics.areaErrorPct.toFixed(1)}%.`)
    }
    parts.push(
      `Matched ${metrics.counts.tp} of ${metrics.counts.gt} reference parcels; ${metrics.counts.fp} extra detections.`,
    )
    return { grade, text: parts.join(' ') }
  }, [metrics])

  if (!geojson || !fieldCount) {
    return (
      <div className={`si-afbv${variant === 'dashboard' ? ' si-afbv--dashboard' : ''}`}>
        <p className="si-afb__hint">
          Run <strong>Detect Fields</strong> first — validation charts and the accuracy matrix are
          built from the detected polygons.
        </p>
      </div>
    )
  }

  const isDashboard = variant === 'dashboard'
  const chartWidth = isDashboard ? 420 : 260
  const chartHeight = isDashboard ? 180 : 156

  const metricsBody =
    !reference ? null : computing ? (
      <div className="si-afb__status">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Comparing {fieldCount}{' '}
        detected against reference…
      </div>
    ) : metrics ? (
      <>
        {analysisVerdict ? (
          <p className={`si-afbv__verdict is-${analysisVerdict.grade}`}>{analysisVerdict.text}</p>
        ) : null}

        <div className="si-afbv__row">
          <span className="si-afb__label">
            IoU match threshold <em>{iouThreshold.toFixed(2)}</em>
          </span>
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.05}
            value={iouThreshold}
            onChange={e => setIouThreshold(Number(e.target.value))}
          />
        </div>
        <div className="si-afbv__row">
          <span className="si-afb__label">
            Boundary tolerance <em>{bufferM} m</em>
          </span>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={bufferM}
            onChange={e => setBufferM(Number(e.target.value))}
          />
        </div>

        <ValidationLinePlot
          series={curveSeries}
          markerX={iouThreshold}
          yDomain={[0, 1]}
          formatY={v => v.toFixed(2)}
          refLine={bestF1 > 0 ? { y: bestF1, label: `best F1 ${bestF1.toFixed(2)}` } : null}
          xLabel="IoU threshold"
          yLabel="Score"
          width={chartWidth}
          height={chartHeight}
          ariaLabel="Precision, recall and F1 across IoU match thresholds for agricultural field delineation"
        />

        <div className="si-afbv__chips">
          <div className="si-afbv__chip">
            Precision<strong>{pct(metrics.precision)}</strong>
          </div>
          <div className="si-afbv__chip">
            Recall<strong>{pct(metrics.recall)}</strong>
          </div>
          <div className="si-afbv__chip">
            F1<strong>{num(metrics.f1)}</strong>
          </div>
          <div className="si-afbv__chip">
            Area IoU<strong>{num(metrics.iou)}</strong>
          </div>
          <div className="si-afbv__chip">
            Matched IoU<strong>{num(metrics.meanMatchedIou)}</strong>
          </div>
          <div className="si-afbv__chip" title={`Boundary buffer ${metrics.boundaryBufferM} m`}>
            Boundary F1<strong>{num(metrics.boundaryF1)}</strong>
          </div>
          <div className="si-afbv__chip">
            Area error
            <strong>
              {metrics.areaErrorPct == null ? '—' : `${metrics.areaErrorPct.toFixed(1)}%`}
            </strong>
          </div>
        </div>

        <div className="si-afbv__metrics-panel">
          <ConfusionMatrixHeatmap
            counts={[
              [metrics.counts.tp, metrics.counts.fn],
              [metrics.counts.fp, 0],
            ]}
            labels={['In reference', 'Not in ref.']}
            columnLabels={['Detected', 'Missed']}
            title={`Confusion matrix · IoU ≥ ${iouThreshold.toFixed(2)}`}
            ariaLabel="Detection confusion matrix heatmap: matched, missed and spurious fields"
          />

          <div className="si-afbv__table-scroll">
            <table className="si-afbv__table si-afbv__table--confusion">
              <caption>Confusion matrix at IoU ≥ {iouThreshold.toFixed(2)}</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Detected</th>
                  <th scope="col">Missed</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">In reference</th>
                  <td className="is-tp" title="True positive — matched field">
                    {metrics.counts.tp}
                  </td>
                  <td className="is-fn" title="False negative — reference field not detected">
                    {metrics.counts.fn}
                  </td>
                  <td className="is-total">{metrics.counts.gt}</td>
                </tr>
                <tr>
                  <th scope="row">Not in reference</th>
                  <td className="is-fp" title="False positive — detected field with no match">
                    {metrics.counts.fp}
                  </td>
                  <td>·</td>
                  <td className="is-total">{metrics.counts.fp}</td>
                </tr>
                <tr>
                  <th scope="row">Total</th>
                  <td className="is-total">{metrics.counts.pred}</td>
                  <td className="is-total">{metrics.counts.fn}</td>
                  <td className="is-total">{metrics.counts.pred + metrics.counts.fn}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="si-afbv__table-scroll">
          <table className="si-afbv__table">
            <caption>Threshold sweep</caption>
            <thead>
              <tr>
                <th scope="col">IoU ≥</th>
                <th scope="col">TP</th>
                <th scope="col">FP</th>
                <th scope="col">FN</th>
                <th scope="col">P</th>
                <th scope="col">R</th>
                <th scope="col">F1</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map(p => (
                <tr
                  key={p.threshold}
                  className={Math.abs(p.threshold - iouThreshold) < 0.026 ? 'is-active' : undefined}
                >
                  <th scope="row">{p.threshold.toFixed(2)}</th>
                  <td className="is-tp">{p.tp}</td>
                  <td className="is-fp">{p.fp}</td>
                  <td className="is-fn">{p.fn}</td>
                  <td>{num(p.precision, 2)}</td>
                  <td>{num(p.recall, 2)}</td>
                  <td className="is-total">{num(p.f1, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="si-afbv__toolbar">
          <button type="button" className="si-afb__btn" onClick={downloadCsv}>
            <i className="fa-solid fa-file-csv" aria-hidden /> Export metrics CSV
          </button>
        </div>
      </>
    ) : null

  return (
    <div className={`si-afbv${isDashboard ? ' si-afbv--dashboard' : ''}`}>
      {!isDashboard ? (
        <div className="si-afbv__chips" aria-label="Detection summary">
          <div className="si-afbv__chip">
            Fields<strong>{fieldCount}</strong>
          </div>
          <div className="si-afbv__chip">
            Area<strong>{totalAreaHa.toFixed(2)} ha</strong>
          </div>
          <div className="si-afbv__chip">
            Mean<strong>{summary.meanAreaHa.toFixed(2)} ha</strong>
          </div>
          <div className="si-afbv__chip">
            Median<strong>{summary.medianAreaHa.toFixed(2)} ha</strong>
          </div>
          <div className="si-afbv__chip">
            Regularized<strong>{summary.regularizedCount}</strong>
          </div>
          {typeof score === 'number' ? (
            <div className="si-afbv__chip">
              Quality<strong>{pct(score, 0)}</strong>
            </div>
          ) : null}
          {engine ? (
            <div className="si-afbv__chip">
              Engine<strong>{engine}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isDashboard ? (
        <section className="si-afbv__block">
          <EpochDetailsTable rows={epochRows} showEmpty />
        </section>
      ) : null}

      <section className="si-afbv__block si-afbv__block--validation">
        <header className="si-afbv__block-head">
          <h4>Validation Detection</h4>
          {metrics ? <span>IoU {pct(metrics.iou)}</span> : <span>Needs reference</span>}
        </header>
        {!isDashboard ? (
          <>
            <p className="si-afbv__lede">
              Compare detections with a reference layer for precision, recall, F1 and IoU.
            </p>
            <ul className="si-afbv__metric-list" aria-label="Validation metrics">
              <li>Precision / Recall / F1</li>
              <li>Area &amp; boundary IoU</li>
            </ul>
          </>
        ) : (
          <p className="si-afbv__lede si-afbv__lede--tight">
            Reference layer → Precision · Recall · F1 · IoU
          </p>
        )}

        {referenceBusy || referenceNotice ? (
          <div
            className={`si-afb__status${referenceBusy ? '' : referenceNotice && !referenceName ? ' is-error' : ''}`}
            role="status"
          >
            {referenceBusy ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> {referenceNotice || 'Loading FoW reference…'}
              </>
            ) : (
              <>
                <i className="fa-solid fa-database" aria-hidden /> {referenceNotice}
              </>
            )}
          </div>
        ) : null}

        <div className="si-afbv__ref">
          <input
            ref={fileRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="si-afb__file-input"
            id="si-afbv-ref-file"
            onChange={e => void onPickReference(e.target.files?.[0] ?? null)}
          />
          <label className="si-afb__btn" htmlFor="si-afbv-ref-file">
            <i className="fa-solid fa-file-import" aria-hidden />{' '}
            {referenceName ? 'Change reference…' : 'Upload reference…'}
          </label>
          {referenceName ? (
            <>
              <span className="si-afbv__ref-name" title={referenceName}>
                {referenceName}
              </span>
              <button type="button" className="si-afb__btn si-afb__btn--ghost" onClick={clearReference}>
                Clear
              </button>
            </>
          ) : null}
        </div>

        {referenceError ? <div className="si-afb__status is-error">{referenceError}</div> : null}
        {computeError ? <div className="si-afb__status is-error">{computeError}</div> : null}

        {!reference ? (
          <div className="si-afbv__need-ref">
            <i className="fa-solid fa-chart-column" aria-hidden />
            <p>
              {referenceBusy
                ? 'Loading FoW reference for this AOI…'
                : 'Upload a reference GeoJSON, or wait for FoW / FTW parcels to load.'}
            </p>
          </div>
        ) : (
          metricsBody
        )}
      </section>
    </div>
  )
}

