import { useCallback, useState } from 'react'
import type { HydroStepId } from './hydroEngine'
import {
  defaultExportFormatForResult,
  exportFormatsForResult,
  type HydroExportFormat,
} from './hydroStepExport'
import type { HydroStepState } from './useHydroWatershed'
import './HydroWatershedPanel.css'

type StepMeta = {
  id: HydroStepId
  icon: string
  label: string
}

/** Ordered analysis steps — icon-first, minimal text, each emits a map layer. */
const STEPS: StepMeta[] = [
  { id: 'dem', icon: 'fa-solid fa-mountain', label: 'Elevation' },
  { id: 'hillshade', icon: 'fa-solid fa-mound', label: 'Hillshade' },
  { id: 'slope', icon: 'fa-solid fa-chart-line', label: 'Slope' },
  { id: 'flow-direction', icon: 'fa-solid fa-compass', label: 'Flow direction' },
  { id: 'flow-accum', icon: 'fa-solid fa-water', label: 'Flow accumulation' },
  { id: 'streams', icon: 'fa-solid fa-timeline', label: 'Stream network' },
  { id: 'contours', icon: 'fa-solid fa-bullseye', label: 'Contours' },
  { id: 'watershed', icon: 'fa-solid fa-fill-drip', label: 'Watershed' },
  { id: 'basins', icon: 'fa-solid fa-layer-group', label: 'Drainage basins' },
]

const CONTOUR_INTERVALS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Auto' },
  { value: 5, label: '5 m' },
  { value: 10, label: '10 m' },
  { value: 20, label: '20 m' },
  { value: 25, label: '25 m' },
  { value: 50, label: '50 m' },
  { value: 100, label: '100 m' },
]

const BASIN_COUNTS = [4, 6, 8, 12]

type HydroWatershedPanelProps = {
  steps: Record<HydroStepId, HydroStepState>
  demLoading: boolean
  demError: string | null
  hasAoi: boolean
  streamModel: 'strahler' | 'shreve'
  onStreamModelChange: (model: 'strahler' | 'shreve') => void
  /** Contour interval (m); 0 = auto. */
  contourInterval: number
  onContourIntervalChange: (interval: number) => void
  /** Number of largest drainage basins to delineate. */
  basinCount: number
  onBasinCountChange: (count: number) => void
  onExportStep: (
    id: HydroStepId,
    format: HydroExportFormat,
    streamModel: 'strahler' | 'shreve',
  ) => void | Promise<void>
  onRunAll: () => void
  onExportReport?: () => void
  exportReportBusy?: boolean
  exportReportLabel?: string
}

function stepCanExport(st: HydroStepState): boolean {
  if (st.status !== 'done' || !st.result) return false
  if (st.result.kind === 'raster') return !!st.result.band
  return st.result.data.features.length > 0
}

export function HydroWatershedPanel({
  steps,
  demLoading,
  demError,
  hasAoi,
  streamModel,
  onStreamModelChange,
  contourInterval,
  onContourIntervalChange,
  basinCount,
  onBasinCountChange,
  onExportStep,
  onRunAll,
  onExportReport,
  exportReportBusy,
  exportReportLabel,
}: HydroWatershedPanelProps) {
  const anyDone = Object.values(steps).some(st => st.status === 'done')
  const [formatByStep, setFormatByStep] = useState<Partial<Record<HydroStepId, HydroExportFormat>>>({})
  const [exportBusyId, setExportBusyId] = useState<HydroStepId | null>(null)

  const resolveFormat = useCallback(
    (stepId: HydroStepId, st: HydroStepState): HydroExportFormat => {
      const result = st.result!
      const picked = formatByStep[stepId]
      const allowed = exportFormatsForResult(result, stepId).map(f => f.id)
      if (picked && allowed.includes(picked)) return picked
      return defaultExportFormatForResult(result)
    },
    [formatByStep],
  )

  const handleExport = useCallback(
    async (stepId: HydroStepId) => {
      const st = steps[stepId]
      if (!stepCanExport(st)) return
      const format = resolveFormat(stepId, st)
      setExportBusyId(stepId)
      try {
        await onExportStep(stepId, format, streamModel)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
      } finally {
        setExportBusyId(null)
      }
    },
    [onExportStep, resolveFormat, steps, streamModel],
  )

  return (
    <div className="si-hydro">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-water" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Hydro Watershed</span>
          <span className="si-hydro__subtitle">Terrain hydrology workflow</span>
        </span>
      </header>

      <div className="si-hydro__toolbar">
        <button
          type="button"
          className="si-hydro__runall"
          onClick={onRunAll}
          disabled={!hasAoi || demLoading}
        >
          {demLoading ? (
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          ) : (
            <i className="fa-solid fa-gears" aria-hidden />
          )}
          <span>Run analysis</span>
        </button>
        {onExportReport ? (
          <button
            type="button"
            className="si-hydro__export-report"
            onClick={onExportReport}
            disabled={!hasAoi || !anyDone || exportReportBusy || demLoading}
            title="Export Hydro Watershed & Flood Risk Assessment Report (Word)"
          >
            {exportReportBusy ? (
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
            ) : (
              <i className="fa-solid fa-file-word" aria-hidden />
            )}
            <span>{exportReportLabel ?? 'Export Hydro Report'}</span>
          </button>
        ) : null}
      </div>

      {demError ? (
        <p className="si-hydro__error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {demError}
        </p>
      ) : null}

      <div className="si-hydro__grid" role="list">
        {STEPS.map(step => {
          const st = steps[step.id]
          const running = st.status === 'running'
          const done = st.status === 'done'
          const failed = st.status === 'error'
          const canExport = stepCanExport(st)
          return (
            <div
              key={step.id}
              role="listitem"
              className={`si-hydro__card${done ? ' is-done' : ''}${failed ? ' is-error' : ''}${running ? ' is-running' : ''}`}
            >
              <div className="si-hydro__run si-hydro__run--status" aria-label={step.label}>
                <span className="si-hydro__run-icon" aria-hidden>
                  {running ? (
                    <i className="fa-solid fa-circle-notch fa-spin" />
                  ) : (
                    <i className={step.icon} />
                  )}
                </span>
                <span className="si-hydro__run-label">{step.label}</span>
                {!done && !failed && !running ? (
                  <span className="si-hydro__status-badge">Pending</span>
                ) : null}
                {running ? <span className="si-hydro__status-badge">Running…</span> : null}
              </div>

              {done && st.result ? (
                <div className="si-hydro__layer">
                  {step.id === 'streams' ? (
                    <div className="si-hydro__model" role="group" aria-label="Stream classification model">
                      <button
                        type="button"
                        className={`si-hydro__model-opt${streamModel === 'strahler' ? ' is-on' : ''}`}
                        onClick={() => onStreamModelChange('strahler')}
                        aria-pressed={streamModel === 'strahler'}
                        title="Strahler stream order"
                      >
                        Strahler
                      </button>
                      <button
                        type="button"
                        className={`si-hydro__model-opt${streamModel === 'shreve' ? ' is-on' : ''}`}
                        onClick={() => onStreamModelChange('shreve')}
                        aria-pressed={streamModel === 'shreve'}
                        title="Shreve stream magnitude"
                      >
                        Shreve
                      </button>
                    </div>
                  ) : null}
                  {step.id === 'contours' ? (
                    <label className="si-hydro__opt" title="Contour interval">
                      <span className="si-hydro__opt-label">Interval</span>
                      <select
                        className="si-hydro__opt-select"
                        value={contourInterval}
                        onChange={e => onContourIntervalChange(Number(e.target.value))}
                        aria-label="Contour interval"
                      >
                        {CONTOUR_INTERVALS.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {step.id === 'basins' || step.id === 'watershed' ? (
                    <label className="si-hydro__opt" title="Number of primary basins">
                      <span className="si-hydro__opt-label">Basins</span>
                      <select
                        className="si-hydro__opt-select"
                        value={basinCount}
                        onChange={e => onBasinCountChange(Number(e.target.value))}
                        aria-label="Number of primary drainage basins"
                      >
                        {BASIN_COUNTS.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {st.result.stats.length ? (
                    <dl className="si-hydro__stats">
                      {st.result.stats.map(s => (
                        <div key={s.label} className="si-hydro__stat">
                          <dt>{s.label}</dt>
                          <dd>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {canExport ? (
                    <div className="si-hydro__actions si-hydro__actions--export">
                      <label className="si-hydro__export-fmt">
                        <span className="visually-hidden">Export format</span>
                        <select
                          className="si-hydro__opt-select si-hydro__export-select"
                          value={resolveFormat(step.id, st)}
                          onChange={e =>
                            setFormatByStep(prev => ({
                              ...prev,
                              [step.id]: e.target.value as HydroExportFormat,
                            }))
                          }
                          aria-label={`Export format for ${step.label}`}
                        >
                          {exportFormatsForResult(st.result, step.id).map(f => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="si-hydro__act"
                        onClick={() => void handleExport(step.id)}
                        disabled={exportBusyId === step.id}
                        title={
                          st.result.kind === 'raster'
                            ? 'Export raster — GeoTIFF clipped to AOI'
                            : 'Export vector — clipped to AOI'
                        }
                      >
                        {exportBusyId === step.id ? (
                          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                        ) : (
                          <i className="fa-solid fa-file-export" aria-hidden />
                        )}
                        <span className="si-hydro__act-text">Export</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {failed ? <p className="si-hydro__card-err">{st.error}</p> : null}
            </div>
          )
        })}
      </div>
      <p className="si-hydro__layers-note">
        Manage added layers in <strong>Layer settings → Main</strong>.
      </p>
    </div>
  )
}

export default HydroWatershedPanel
