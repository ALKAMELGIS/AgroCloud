import type {
  CropAlertEngineSettings,
  CropAlertFieldResult,
  CropAlertIndexId,
  CropAlertStatus,
  CropAlertTypeId,
} from '../../../lib/siCropAlertEngine'
import {
  CROP_ALERT_STATUS_COLORS,
  CROP_ALERT_STATUS_LABELS,
} from '../../../lib/siCropAlertEngine'
import type { CropAlertImageryContext } from '../../../lib/siCropAlertImageryValidation'
import type { CropAlertSentinelFetchProgress } from '../../../lib/siCropAlertSentinelLive'
import './SiCropAlertCenterPanel.css'

export type SiCropAlertCenterPanelProps = {
  settings: CropAlertEngineSettings
  onChange: (next: CropAlertEngineSettings) => void
  results: CropAlertFieldResult[]
  referenceDate: string
  userRequestedDate: string
  imageryContext: CropAlertImageryContext
  fieldCount: number
  isRunning: boolean
  lastRunAt: number | null
  progress: CropAlertSentinelFetchProgress | null
  liveFieldCount: number
  selectedFieldKey: string | null
  onSelectField: (fieldKey: string | null) => void
  onRefresh: () => void
}

const INDEX_OPTIONS: CropAlertIndexId[] = ['NDVI', 'NDWI', 'NDMI', 'EVI']

const ALERT_TYPE_OPTIONS: Array<{ id: CropAlertTypeId; label: string }> = [
  { id: 'crop-stress', label: 'Crop Stress' },
  { id: 'water-stress', label: 'Water Stress' },
  { id: 'drought-risk', label: 'Drought Risk' },
  { id: 'disease-risk', label: 'Disease Risk' },
  { id: 'harvest-readiness', label: 'Harvest Readiness' },
  { id: 'irrigation-required', label: 'Irrigation Required' },
  { id: 'vegetation-recovery', label: 'Vegetation Recovery' },
]

const STATUS_FILTER: CropAlertStatus[] = [
  'critical',
  'water-stress',
  'watch',
  'harvest-detected',
  'harvest-approaching',
  'healthy',
  'growing',
  'no-vegetation',
  'bare-soil',
  'harvest-completed',
]

export function SiCropAlertCenterPanel({
  settings,
  onChange,
  results,
  referenceDate,
  userRequestedDate,
  imageryContext,
  fieldCount,
  isRunning,
  lastRunAt,
  progress,
  liveFieldCount,
  selectedFieldKey,
  onSelectField,
  onRefresh,
}: SiCropAlertCenterPanelProps) {
  const patch = (partial: Partial<CropAlertEngineSettings>) => onChange({ ...settings, ...partial })

  const criticalCount = results.filter(r => r.liveVerified && r.severity === 'critical').length
  const warningCount = results.filter(
    r => r.liveVerified && (r.severity === 'warning' || r.severity === 'high'),
  ).length
  const selected = results.find(r => r.fieldKey === selectedFieldKey) ?? null

  const alertsFeed = [...results]
    .filter(r => r.liveVerified && (r.severity !== 'normal' || r.status === 'watch'))
    .sort((a, b) => {
      const rank = (s: string) =>
        s === 'critical' ? 0 : s === 'high' ? 1 : s === 'warning' ? 2 : 3
      return rank(a.severity) - rank(b.severity)
    })
    .slice(0, 12)

  return (
    <div className="si-crop-alert">
      <div className="si-crop-alert__header">
        <div>
          <div className="si-crop-alert__kicker">Sentinel Live · Real-Time</div>
          <h3 className="si-crop-alert__title">Agro Sentinel Alert Engine</h3>
        </div>
        <label className="si-crop-alert__power">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
            aria-label="Enable crop alert engine"
          />
          <span>{settings.enabled ? 'ON' : 'OFF'}</span>
        </label>
      </div>

      <div className="si-crop-alert__body">
        <div className="si-crop-alert__stats">
          <div className="si-crop-alert__stat">
            <span className="si-crop-alert__stat-n">{fieldCount}</span>
            <span className="si-crop-alert__stat-l">Fields</span>
          </div>
          <div className="si-crop-alert__stat si-crop-alert__stat--crit">
            <span className="si-crop-alert__stat-n">{criticalCount}</span>
            <span className="si-crop-alert__stat-l">Critical</span>
          </div>
          <div className="si-crop-alert__stat si-crop-alert__stat--warn">
            <span className="si-crop-alert__stat-n">{warningCount}</span>
            <span className="si-crop-alert__stat-l">Alerts</span>
          </div>
        </div>

        <div className="si-crop-alert__divider" aria-hidden />

        <p className="si-crop-alert__label">AOI Source</p>
        <div className="si-crop-alert__aoi-row">
          <label className="si-crop-alert__radio">
            <input
              type="radio"
              name="crop-alert-aoi"
              checked={settings.aoiMode === 'agro-default'}
              onChange={() => patch({ aoiMode: 'agro-default' })}
            />
            <span>Agro_Structures · Farm Plots &amp; PIVOT</span>
          </label>
          <label className="si-crop-alert__radio">
            <input
              type="radio"
              name="crop-alert-aoi"
              checked={settings.aoiMode === 'builder'}
              onChange={() => patch({ aoiMode: 'builder' })}
            />
            <span>AOI Mask Builder (custom)</span>
          </label>
        </div>
        <p className="si-crop-alert__hint">
          Image date: <strong>{referenceDate}</strong>
          {userRequestedDate !== referenceDate ? (
            <>
              {' '}
              · Selected <strong>{userRequestedDate}</strong>
            </>
          ) : null}
          {lastRunAt ? ` · Updated ${new Date(lastRunAt).toLocaleTimeString()}` : ''}
          {liveFieldCount > 0 ? ` · Sentinel Live ${liveFieldCount}/${fieldCount}` : ''}
        </p>
        {imageryContext.warningMessage ? (
          <p className="si-crop-alert__imagery-warn" role="status">
            {imageryContext.warningMessage}
          </p>
        ) : null}
        <p className="si-crop-alert__hint si-crop-alert__hint--meta">
          Analysis date: <strong>{imageryContext.analysisDate}</strong> · Data source:{' '}
          <strong>{imageryContext.dataSource}</strong>
        </p>
        {isRunning && progress ? (
          <div className="si-crop-alert__progress" role="status">
            <div
              className="si-crop-alert__progress-bar"
              style={{
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
            <span>
              Fetching Sentinel stats {progress.done}/{progress.total}
              {progress.live ? ` · ${progress.live} live` : ''}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className="si-crop-alert__refresh"
          onClick={onRefresh}
          disabled={!settings.enabled || isRunning}
        >
          <i className={`fa-solid ${isRunning ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden />
          {isRunning ? 'Analyzing…' : 'Run analysis now'}
        </button>

        <div className="si-crop-alert__divider" aria-hidden />

        <p className="si-crop-alert__label">Alert Source</p>
        <div className="si-crop-alert__chips">
          {INDEX_OPTIONS.map(id => (
            <label key={id} className="si-crop-alert__chip">
              <input
                type="checkbox"
                checked={settings.indices[id]}
                onChange={e => patch({ indices: { ...settings.indices, [id]: e.target.checked } })}
              />
              <span>{id}</span>
            </label>
          ))}
        </div>

        <div className="si-crop-alert__divider" aria-hidden />

        <p className="si-crop-alert__label">Alert Types</p>
        <div className="si-crop-alert__chips">
          {ALERT_TYPE_OPTIONS.map(opt => (
            <label key={opt.id} className="si-crop-alert__chip">
              <input
                type="checkbox"
                checked={settings.alertTypes[opt.id]}
                onChange={e =>
                  patch({ alertTypes: { ...settings.alertTypes, [opt.id]: e.target.checked } })
                }
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="si-crop-alert__divider" aria-hidden />

        <p className="si-crop-alert__label">Notifications</p>
        <div className="si-crop-alert__notify-row">
          <label className="si-crop-alert__chip">
            <input
              type="checkbox"
              checked={settings.notifyInApp}
              onChange={e => patch({ notifyInApp: e.target.checked })}
            />
            <span>In-App</span>
          </label>
          <label className="si-crop-alert__chip si-crop-alert__chip--soon">
            <input type="checkbox" checked={settings.notifyEmail} disabled />
            <span>Email</span>
          </label>
          <label className="si-crop-alert__chip si-crop-alert__chip--soon">
            <input type="checkbox" checked={settings.notifySms} disabled />
            <span>SMS</span>
          </label>
          <label className="si-crop-alert__chip si-crop-alert__chip--soon">
            <input type="checkbox" checked={settings.notifyPush} disabled />
            <span>Push</span>
          </label>
        </div>

        <div className="si-crop-alert__divider" aria-hidden />

        <div className="si-crop-alert__legend">
          {STATUS_FILTER.slice(0, 8).map(st => (
            <span key={st} className="si-crop-alert__legend-item">
              <i className="si-crop-alert__dot" style={{ background: CROP_ALERT_STATUS_COLORS[st] }} aria-hidden />
              {CROP_ALERT_STATUS_LABELS[st]}
            </span>
          ))}
        </div>

        {selected ? (
          <div className="si-crop-alert__detail" role="region" aria-label="Selected field alert">
            <div className="si-crop-alert__detail-head">
              <strong>{selected.farmName || selected.farmCode || `#${selected.objectId}`}</strong>
              <span
                className="si-crop-alert__badge"
                style={{ background: CROP_ALERT_STATUS_COLORS[selected.status] }}
              >
                {selected.title}
              </span>
            </div>
            <p className="si-crop-alert__detail-msg">{selected.message}</p>
            {selected.dataWarning ? (
              <p className="si-crop-alert__imagery-warn">{selected.dataWarning}</p>
            ) : null}
            <div className="si-crop-alert__detail-meta">
              <span>Image {selected.imageDate ?? '—'}</span>
              <span>Analysis {selected.analysisDate}</span>
              <span>{selected.dataSource}</span>
            </div>
            {selected.liveVerified ? (
              <div className="si-crop-alert__metrics">
                <span>NDVI {selected.current.ndvi.toFixed(2)}</span>
                <span>Mean3 {selected.ndviMean3?.toFixed(2) ?? '—'}</span>
                <span>Δ2 {selected.ndviChangePct2 ?? selected.deltaPct.ndvi}%</span>
                <span>NDWI {selected.current.ndwi.toFixed(2)}</span>
                <span>NDMI {selected.current.ndmi.toFixed(2)}</span>
                <span>Trend {selected.trend}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="si-crop-alert__divider" aria-hidden />

        <div className="si-crop-alert__feed">
          <p className="si-crop-alert__label">Alert Center</p>
          {alertsFeed.length === 0 ? (
            <p className="si-crop-alert__empty">
              {settings.enabled ? 'No active alerts — crops look stable.' : 'Enable the engine to start monitoring.'}
            </p>
          ) : (
            <ul className="si-crop-alert__feed-list">
              {alertsFeed.map(item => (
                <li key={item.fieldKey}>
                  <button
                    type="button"
                    className={`si-crop-alert__feed-item${selectedFieldKey === item.fieldKey ? ' si-crop-alert__feed-item--on' : ''}`}
                    onClick={() => onSelectField(item.fieldKey)}
                  >
                    <span
                      className="si-crop-alert__dot"
                      style={{ background: CROP_ALERT_STATUS_COLORS[item.status] }}
                      aria-hidden
                    />
                    <span className="si-crop-alert__feed-text">
                      <strong>{item.farmName || item.farmCode || `#${item.objectId}`}</strong>
                      <small>{item.message}</small>
                    </span>
                    <span className={`si-crop-alert__sev si-crop-alert__sev--${item.severity}`}>
                      {item.severity}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
