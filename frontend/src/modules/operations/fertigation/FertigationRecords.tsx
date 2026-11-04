import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataSourceFieldsPanel, type DataSourceFormState } from '@/modules/forms/components/datasourcefieldspanel'
import { canManageDataSourceSettings } from '@/core/auth/auth'
import { FertigationReportModal } from '@/modules/reports/operational/FertigationReportModal'
import { EntryFormCardHeader } from '@/modules/operations/shared/DataEntryChrome'
import './EC.css'
import './fertigation-records.css'

type FertigationEntry = {
  id: number
  site: string
  project: string
  block: string
  date: string
  time: string
  country?: string
  location?: string
  fertilizerType?: string
  concentration?: string
  status?: string
  flowRate: string
  durationHours: string
  cycles: string
  totalVolume: string
}

const STORAGE_KEY = 'fertigation_records_v1'

const statusTone = (status: string): 'planned' | 'progress' | 'done' => {
  if (status === 'Completed') return 'done'
  if (status === 'In Progress') return 'progress'
  return 'planned'
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
  }
}

export default function FertigationRecords() {
  const navigate = useNavigate()
  const canManageSettings = useMemo(() => canManageDataSourceSettings(), [])
  const [, setDataSourceState] = useState<DataSourceFormState>({ sourceIds: [], selectedFieldsBySource: {}, valuesBySource: {} })
  const [isOpeningSettings, setIsOpeningSettings] = useState(false)

  const [records, setRecords] = useState<FertigationEntry[]>(() => readJson<FertigationEntry[]>(STORAGE_KEY, []))
  const [isReportOpen, setIsReportOpen] = useState(false)

  const [draft, setDraft] = useState<Omit<FertigationEntry, 'id'>>({
    site: '',
    project: '',
    block: '',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    country: '',
    location: '',
    fertilizerType: '',
    concentration: '',
    status: 'Planned',
    flowRate: '',
    durationHours: '',
    cycles: '1',
    totalVolume: '',
  })

  useEffect(() => {
    writeJson(STORAGE_KEY, records)
  }, [records])

  const sorted = useMemo(() => {
    const next = records.slice()
    next.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    return next
  }, [records])

  const canSave = Boolean(draft.site.trim() && draft.project.trim() && draft.block.trim() && draft.date && draft.time)

  const addRecord = () => {
    const next: FertigationEntry = { id: Date.now(), ...draft }
    setRecords(prev => [next, ...prev].slice(0, 2000))
    setDraft(prev => ({ ...prev, project: '', block: '', flowRate: '', durationHours: '', totalVolume: '' }))
  }

  return (
    <div className="ec-page fert-page">
      <div className="ec-container ec-animate-in">
        <header className="ec-header fert-header">
          <div className="ec-title">
            <span className="ops-head-icon ops-head-icon--rose" aria-hidden>
              <i className="fa-solid fa-flask" />
            </span>
            <div>
              <h1 className="fert-header__title">Fertigation Records</h1>
              <div className="ec-section-subtitle">Plan and track fertigation schedules</div>
            </div>
          </div>
        </header>

        <div className="ec-card">
          <EntryFormCardHeader
            title="Basic Information"
            settingsAriaLabel="Open data source settings"
            settingsBusy={isOpeningSettings}
            onOpenSettings={
              canManageSettings
                ? () => {
                    setIsOpeningSettings(true)
                    navigate('/master/workflow-settings?form=Fertigation')
                  }
                : undefined
            }
          />
          <div className="ec-card-body">
            <DataSourceFieldsPanel formKey="Fertigation" mode="fill" variant="embedded" onChange={setDataSourceState} />
          </div>
        </div>

        <div className="ec-card">
          <div className="ec-card-header">
            <div className="ec-card-title">
              <i className="fa-solid fa-pen-to-square fert-icon--info" aria-hidden="true"></i>
              New Record
            </div>
            <div className="ec-card-header-actions">
              <button type="button" className="ec-btn ec-btn-secondary ec-btn-sm" onClick={() => setIsReportOpen(true)}>
                <i className="fa-solid fa-chart-pie"></i> Report
              </button>
            </div>
          </div>
          <form
            className="ec-card-body fert-form"
            onSubmit={e => {
              e.preventDefault()
              if (canSave) addRecord()
            }}
          >
            <div className="fert-form__grid">
            <label className="ec-input-group">
              <span className="ec-label">Date<span className="fert-req" aria-hidden="true"> *</span></span>
              <input className="ec-input" type="date" required value={draft.date} onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Time<span className="fert-req" aria-hidden="true"> *</span></span>
              <input className="ec-input" type="time" required value={draft.time} onChange={e => setDraft(prev => ({ ...prev, time: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Country</span>
              <input className="ec-input" value={draft.country ?? ''} onChange={e => setDraft(prev => ({ ...prev, country: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Site<span className="fert-req" aria-hidden="true"> *</span></span>
              <input className="ec-input" required value={draft.site} onChange={e => setDraft(prev => ({ ...prev, site: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Project<span className="fert-req" aria-hidden="true"> *</span></span>
              <input className="ec-input" required value={draft.project} onChange={e => setDraft(prev => ({ ...prev, project: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Location</span>
              <input className="ec-input" value={draft.location ?? ''} onChange={e => setDraft(prev => ({ ...prev, location: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Block<span className="fert-req" aria-hidden="true"> *</span></span>
              <input className="ec-input" required value={draft.block} onChange={e => setDraft(prev => ({ ...prev, block: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Fertilizer Type</span>
              <input className="ec-input" value={draft.fertilizerType ?? ''} onChange={e => setDraft(prev => ({ ...prev, fertilizerType: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Concentration (ppm)</span>
              <input className="ec-input fert-num" inputMode="decimal" value={draft.concentration ?? ''} onChange={e => setDraft(prev => ({ ...prev, concentration: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Status</span>
              <select className="ec-select" value={draft.status ?? 'Planned'} onChange={e => setDraft(prev => ({ ...prev, status: e.target.value }))}>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Flow Rate (m³/h)</span>
              <input className="ec-input fert-num" inputMode="decimal" value={draft.flowRate} onChange={e => setDraft(prev => ({ ...prev, flowRate: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Duration (h)</span>
              <input className="ec-input fert-num" inputMode="decimal" value={draft.durationHours} onChange={e => setDraft(prev => ({ ...prev, durationHours: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Cycles</span>
              <input className="ec-input fert-num" inputMode="numeric" value={draft.cycles} onChange={e => setDraft(prev => ({ ...prev, cycles: e.target.value }))} />
            </label>
            <label className="ec-input-group">
              <span className="ec-label">Total Volume (m³)</span>
              <input className="ec-input fert-num" inputMode="decimal" value={draft.totalVolume} onChange={e => setDraft(prev => ({ ...prev, totalVolume: e.target.value }))} />
            </label>
            </div>
            <div className="fert-form__actions">
              <span className="fert-form__hint">
                <span aria-hidden="true">*</span> Required: date, time, site, project and block
              </span>
              <button
                type="button"
                className="ec-btn ec-btn-ghost entry-btn entry-btn--quiet"
                onClick={() => setDraft(prev => ({ ...prev, site: '', project: '', block: '', flowRate: '', durationHours: '', cycles: '1', totalVolume: '' }))}
              >
                Clear
              </button>
              <button type="submit" className="ec-btn ec-btn-primary entry-btn entry-btn--primary" disabled={!canSave}>
                <i className="fa-solid fa-plus" aria-hidden="true"></i> Add
              </button>
            </div>
          </form>
        </div>

        <div className="ec-card">
          <div className="ec-card-header">
            <div className="ec-card-title">
              <i className="fa-solid fa-list fert-icon--muted" aria-hidden="true"></i>
              Recent Records
            </div>
            {sorted.length ? <span className="fert-count">{sorted.length}</span> : null}
          </div>
          <div className="ec-card-body fert-records">
            {sorted.length === 0 ? (
              <div className="fert-empty" role="status">
                <span className="fert-empty__icon" aria-hidden="true">
                  <i className="fa-solid fa-flask" />
                </span>
                <p className="fert-empty__title">No records yet.</p>
                <p className="fert-empty__body">Fill in the form above and press Add — new records appear here, newest first.</p>
              </div>
            ) : (
              <div className="ds-table-wrap fert-table-wrap">
                <table className="fert-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Site</th>
                      <th scope="col">Project</th>
                      <th scope="col">Block</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="fert-table__num">Volume</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(r => (
                      <tr key={r.id}>
                        <td className="fert-table__date">
                          {r.date} {r.time}
                        </td>
                        <td>{r.site}</td>
                        <td>{r.project}</td>
                        <td>{r.block}</td>
                        <td>{r.status ? <span className={`fert-status fert-status--${statusTone(r.status)}`}>{r.status}</span> : '—'}</td>
                        <td className="fert-table__num">{r.totalVolume || '—'}</td>
                        <td className="fert-table__actions">
                          <button
                            type="button"
                            className="ec-btn ec-btn-ghost ec-btn-sm fert-delete"
                            aria-label={`Delete record ${r.date} ${r.time} ${r.site}`}
                            onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))}
                          >
                            <i className="fa-solid fa-trash-can" aria-hidden="true"></i> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <FertigationReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} records={records} />
    </div>
  )
}
