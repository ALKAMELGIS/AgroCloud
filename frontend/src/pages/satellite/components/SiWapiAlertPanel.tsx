import { useMemo, useState } from 'react'
import type { CropAlertSentinelFetchProgress } from '../../../lib/siCropAlertSentinelLive'
import {
  WAPI_ALERT_LEVEL_COLORS,
  WAPI_ALERT_LEVEL_ICONS,
  WAPI_ALERT_LEVEL_LABELS,
  WAPI_HARVEST_STAGE_LABELS,
  compareIssAlertPriority,
  summarizeWapiAlertCounts,
  type WapiAlertDataRawRow,
  type WapiAlertEngineSettings,
  type WapiAlertFieldResult,
  type WapiAlertLevel,
} from '../../../lib/siWapiAlertEngine'
import {
  downloadWapiAlertExcelBlob,
  generateWapiAlertExcel,
} from '../../../lib/siWapiAlertExcel'
import './SiWapiAlertPanel.css'

export type SiWapiAlertPanelProps = {
  settings: WapiAlertEngineSettings
  onChange: (next: WapiAlertEngineSettings) => void
  results: WapiAlertFieldResult[]
  rawRows?: WapiAlertDataRawRow[]
  referenceDate: string
  aoiLabel?: string
  fieldCount: number
  isRunning: boolean
  lastRunAt: number | null
  progress: CropAlertSentinelFetchProgress | null
  liveFieldCount: number
  selectedFieldKey: string | null
  onSelectField: (fieldKey: string | null) => void
  onRefresh: () => void
  onClear: () => void
}

const LEVEL_ORDER: WapiAlertLevel[] = [
  'critical',
  'severe',
  'warning',
  'watch',
  'safe',
  'overwatering',
]

export function SiWapiAlertPanel({
  settings,
  onChange,
  results,
  rawRows = [],
  referenceDate,
  aoiLabel = 'Active AOI layer',
  fieldCount,
  isRunning,
  lastRunAt,
  progress,
  liveFieldCount,
  selectedFieldKey,
  onSelectField,
  onRefresh,
  onClear,
}: SiWapiAlertPanelProps) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const patch = (partial: Partial<WapiAlertEngineSettings>) => onChange({ ...settings, ...partial })

  const counts = useMemo(() => summarizeWapiAlertCounts(results), [results])
  const feed = useMemo(() => [...results].sort(compareIssAlertPriority), [results])
  const selected = useMemo(
    () => results.find(r => r.fieldKey === selectedFieldKey) ?? null,
    [results, selectedFieldKey],
  )
  const actionCount = counts.critical + counts.severe + counts.warning

  const handleExport = async () => {
    if (!results.length || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      const { blob, filename } = await generateWapiAlertExcel(results, {
        aoiName: aoiLabel,
        referenceDate: settings.periodEnd || referenceDate,
        periodStart: settings.periodStart,
        periodEnd: settings.periodEnd,
        rawRows,
      })
      downloadWapiAlertExcelBlob(blob, filename)
    } catch (err) {
      setExportError(String((err as Error)?.message || err || 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="si-wapi-alert">
      <div className="si-wapi-alert__header">
        <div />
        <label className="si-wapi-alert__power">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
            aria-label="Enable ISS irrigation alert engine"
          />
          <span>{settings.enabled ? 'ON' : 'OFF'}</span>
        </label>
      </div>

      <div className="si-wapi-alert__body">
        <div className="si-wapi-alert__stats">
          <div className="si-wapi-alert__stat">
            <span className="si-wapi-alert__stat-n">{fieldCount}</span>
            <span className="si-wapi-alert__stat-l">Fields</span>
          </div>
          <div className="si-wapi-alert__stat si-wapi-alert__stat--crit">
            <span className="si-wapi-alert__stat-n">{counts.critical}</span>
            <span className="si-wapi-alert__stat-l">Critical</span>
          </div>
          <div className="si-wapi-alert__stat si-wapi-alert__stat--warn">
            <span className="si-wapi-alert__stat-n">{actionCount}</span>
            <span className="si-wapi-alert__stat-l">Action</span>
          </div>
        </div>

        <section className="si-wapi-alert__section">
          <p className="si-wapi-alert__label">AOI Source</p>
          <p className="si-wapi-alert__aoi">{aoiLabel}</p>

          <dl className="si-wapi-alert__meta">
            <div className="si-wapi-alert__meta-row">
              <dt>Period</dt>
              <dd>
                {settings.periodStart} → {settings.periodEnd}
              </dd>
            </div>
            {lastRunAt ? (
              <div className="si-wapi-alert__meta-row">
                <dt>Updated</dt>
                <dd>{new Date(lastRunAt).toLocaleTimeString()}</dd>
              </div>
            ) : null}
            {liveFieldCount > 0 ? (
              <div className="si-wapi-alert__meta-row">
                <dt>Sentinel Live</dt>
                <dd>
                  {liveFieldCount}/{fieldCount}
                </dd>
              </div>
            ) : null}
            {rawRows.length > 0 ? (
              <div className="si-wapi-alert__meta-row">
                <dt>DataRaw</dt>
                <dd>{rawRows.length} scenes</dd>
              </div>
            ) : null}
          </dl>

          <div className="si-wapi-alert__date-range" aria-label="Analysis period">
            <label className="si-wapi-alert__field si-wapi-alert__field--date">
              <span>Start</span>
              <input
                type="date"
                max={settings.periodEnd}
                value={settings.periodStart}
                onChange={e => patch({ periodStart: e.target.value || settings.periodStart })}
                disabled={!settings.enabled || isRunning}
              />
            </label>
            <label className="si-wapi-alert__field si-wapi-alert__field--date">
              <span>End</span>
              <input
                type="date"
                min={settings.periodStart}
                max={referenceDate || undefined}
                value={settings.periodEnd}
                onChange={e => patch({ periodEnd: e.target.value || settings.periodEnd })}
                disabled={!settings.enabled || isRunning}
              />
            </label>
          </div>

          {isRunning && progress ? (
            <div className="si-wapi-alert__progress" role="status">
              <div
                className="si-wapi-alert__progress-bar"
                style={{
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
              <span>
                Scoring fields {progress.done}/{progress.total}
                {progress.live ? ` · ${progress.live} live` : ''}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            className="si-wapi-alert__refresh"
            onClick={onRefresh}
            disabled={!settings.enabled || isRunning || fieldCount === 0}
          >
            <i className={`fa-solid ${isRunning ? 'fa-spinner fa-spin' : results.length ? 'fa-rotate' : 'fa-play'}`} aria-hidden />
            {isRunning ? 'Running…' : 'Run'}
          </button>

          <div className="si-wapi-alert__toolbar">
            {results.length > 0 ? (
              <button
                type="button"
                className="si-wapi-alert__tool"
                onClick={onClear}
                disabled={isRunning}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="si-wapi-alert__tool"
              onClick={() => void handleExport()}
              disabled={!results.length || exporting}
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          </div>
          {exportError ? (
            <p className="si-wapi-alert__error" role="alert">
              {exportError}
            </p>
          ) : null}
        </section>

        <section className="si-wapi-alert__section">
          <p className="si-wapi-alert__label">Map Display</p>
          <div className="si-wapi-alert__chips">
            <label className="si-wapi-alert__chip">
              <input
                type="checkbox"
                checked={settings.showMapIcons}
                onChange={e => patch({ showMapIcons: e.target.checked })}
                disabled={!settings.enabled}
              />
              <span>Field icons</span>
            </label>
          </div>
        </section>

        <section className="si-wapi-alert__section">
          <p className="si-wapi-alert__label">Status Legend</p>
          <div className="si-wapi-alert__legend">
            {LEVEL_ORDER.map(level => (
              <span key={level} className="si-wapi-alert__legend-item">
                <i
                  className="si-wapi-alert__dot"
                  style={{ background: WAPI_ALERT_LEVEL_COLORS[level] }}
                  aria-hidden
                />
                <i
                  className={`fa-solid ${WAPI_ALERT_LEVEL_ICONS[level]} si-wapi-alert__legend-ico`}
                  style={{ color: WAPI_ALERT_LEVEL_COLORS[level] }}
                  aria-hidden
                />
                {WAPI_ALERT_LEVEL_LABELS[level]}
                <em>{counts[level]}</em>
              </span>
            ))}
          </div>
        </section>

        {selected ? (
          <section
            className="si-wapi-alert__section si-wapi-alert__section--detail"
            role="region"
            aria-label="Selected field alert"
          >
            <div className="si-wapi-alert__detail-head">
              <strong>{selected.fieldName}</strong>
              <span
                className="si-wapi-alert__badge"
                style={{ background: selected.color }}
              >
                {WAPI_ALERT_LEVEL_LABELS[selected.alertLevel]}
              </span>
            </div>
            <p className="si-wapi-alert__detail-msg">{selected.recommendedAction}</p>
            <div className="si-wapi-alert__detail-meta">
              <span>ISS {selected.iss.toFixed(3)}</span>
              <span>ΔISS {selected.deltaIss >= 0 ? '+' : ''}{selected.deltaIss.toFixed(3)}</span>
              <span>{WAPI_HARVEST_STAGE_LABELS[selected.harvestStage]}</span>
              <span>#{selected.priorityRank}</span>
            </div>
          </section>
        ) : null}

        <section className="si-wapi-alert__section">
          <p className="si-wapi-alert__label">Priority Feed</p>
          {feed.length === 0 ? (
            <p className="si-wapi-alert__empty">
              {settings.enabled
                ? fieldCount
                  ? 'Run analysis to build the irrigation priority list.'
                  : 'Enable AOI layer mode with plot polygons to score fields.'
                : 'Turn ON to score the active AOI layer.'}
            </p>
          ) : (
            <ul className="si-wapi-alert__feed">
              {feed.map(row => (
                <li key={row.fieldKey}>
                  <button
                    type="button"
                    className={`si-wapi-alert__row${selectedFieldKey === row.fieldKey ? ' is-selected' : ''}`}
                    onClick={() =>
                      onSelectField(selectedFieldKey === row.fieldKey ? null : row.fieldKey)
                    }
                  >
                    <i
                      className={`fa-solid ${WAPI_ALERT_LEVEL_ICONS[row.alertLevel]} si-wapi-alert__row-ico`}
                      style={{ color: row.color }}
                      aria-hidden
                    />
                    <span className="si-wapi-alert__row-main">
                      <strong>{row.fieldName}</strong>
                      <span>
                        #{row.priorityRank} · {WAPI_ALERT_LEVEL_LABELS[row.alertLevel]} · ISS{' '}
                        {row.iss.toFixed(2)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
