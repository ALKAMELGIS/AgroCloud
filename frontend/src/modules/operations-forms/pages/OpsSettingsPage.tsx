import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { opsApi, type OpsListItem, type OpsSettings } from '../api'
import { useOps, useOpsText } from '../opsContext'
import { AuditLog, PermissionsEditor } from './OpsAccessPanels'

type Tab = { kind: 'list'; key: string } | { kind: 'report' } | { kind: 'limits' } | { kind: 'permissions' } | { kind: 'audit' }

export default function OpsSettingsPage() {
  const { schema, t, reload, canAdmin } = useOps()
  const tx = useOpsText()
  const may = { settings: canAdmin('settings'), lists: canAdmin('lists'), audit: canAdmin('audit') }
  const [tab, setTab] = useState<Tab>(() =>
    may.settings ? { kind: 'report' } : may.audit ? { kind: 'audit' } : may.lists && schema?.lists[0] ? { kind: 'list', key: schema.lists[0].key } : { kind: 'report' },
  )
  if (!schema) return null
  if (!may.settings && !may.lists && !may.audit) {
    return (
      <div className="ops">
        <div className="ops-alert" role="alert">
          {tx('Your role cannot open the forms settings.', 'دورك لا يسمح بفتح إعدادات الاستمارات.')}
        </div>
        <Link to="/ops" className="ops-btn">
          {tx('Back to forms', 'العودة للاستمارات')}
        </Link>
      </div>
    )
  }
  return (
    <div className="ops">
      <div className="ops-head">
        <div>
          <Link to="/ops" className="ops-crumb">
            {tx('Operations forms', 'استمارات العمليات')} /
          </Link>
          <h1>{tx('Settings & lists', 'الإعدادات والقوائم')}</h1>
          <p>{tx('Report headers, quality limits, lookup lists, permissions and the audit log.', 'رؤوس التقارير وحدود الجودة والقوائم والصلاحيات وسجل التدقيق.')}</p>
        </div>
      </div>
      <div className="ops-settings">
        <nav aria-label={tx('Settings sections', 'أقسام الإعدادات')}>
          {may.settings || may.audit ? <div className="ops-nav-group">{tx('Administration', 'الإدارة')}</div> : null}
          {may.settings ? (
            <button type="button" className={tab.kind === 'permissions' ? 'is-active' : ''} onClick={() => setTab({ kind: 'permissions' })}>
              {tx('Permissions', 'الصلاحيات')}
            </button>
          ) : null}
          {may.audit ? (
            <button type="button" className={tab.kind === 'audit' ? 'is-active' : ''} onClick={() => setTab({ kind: 'audit' })}>
              {tx('Audit log', 'سجل التدقيق')}
            </button>
          ) : null}
          {may.settings ? (
            <>
              <div className="ops-nav-group">{tx('Reports & quality', 'التقارير والجودة')}</div>
              <button type="button" className={tab.kind === 'report' ? 'is-active' : ''} onClick={() => setTab({ kind: 'report' })}>
                {tx('Report header', 'رأس التقارير')}
              </button>
              <button type="button" className={tab.kind === 'limits' ? 'is-active' : ''} onClick={() => setTab({ kind: 'limits' })}>
                {tx('EC / pH limits', 'حدود EC / pH')}
              </button>
            </>
          ) : null}
          {may.lists ? <div className="ops-nav-group">{tx('Lookup lists', 'القوائم')}</div> : null}
          {(may.lists ? schema.lists : []).map(l => (
            <button key={l.key} type="button" className={tab.kind === 'list' && tab.key === l.key ? 'is-active' : ''} onClick={() => setTab({ kind: 'list', key: l.key })}>
              {t(l.label)}
              <span>{schema.listItems[l.key]?.length ?? 0}</span>
            </button>
          ))}
        </nav>
        <section className="ops-card" style={{ minWidth: 0 }}>
          {tab.kind === 'permissions' && may.settings ? <PermissionsEditor onSaved={reload} /> : null}
          {tab.kind === 'audit' && may.audit ? <AuditLog /> : null}
          {tab.kind === 'report' && may.settings ? <ReportSettings settings={schema.settings} onSaved={reload} /> : null}
          {tab.kind === 'limits' && may.settings ? <LimitSettings settings={schema.settings} onSaved={reload} /> : null}
          {tab.kind === 'list' ? <ListEditor key={tab.key} listKey={tab.key} items={schema.listItems[tab.key] ?? []} metaKeys={schema.lists.find(l => l.key === tab.key)?.meta ?? []} onChanged={reload} /> : null}
        </section>
      </div>
    </div>
  )
}

function useSaver(onSaved: () => Promise<void>) {
  const tx = useOpsText()
  const [state, setState] = useState<{ busy: boolean; msg: string | null; error: boolean }>({ busy: false, msg: null, error: false })
  const run = async (fn: () => Promise<unknown>) => {
    setState({ busy: true, msg: null, error: false })
    try {
      await fn()
      await onSaved()
      setState({ busy: false, msg: tx('Saved.', 'تم الحفظ.'), error: false })
    } catch (e) {
      setState({ busy: false, msg: e instanceof Error ? e.message : String(e), error: true })
    }
  }
  return { ...state, run }
}

function ReportSettings({ settings, onSaved }: { settings: OpsSettings; onSaved: () => Promise<void> }) {
  const { schema, t } = useOps()
  const tx = useOpsText()
  const [company, setCompany] = useState(settings.company)
  const [forms, setForms] = useState(settings.forms ?? {})
  const [autoAdd, setAutoAdd] = useState(settings.autoAddListValues)
  const saver = useSaver(onSaved)
  return (
    <>
      <h2>{tx('Report header', 'رأس التقارير')}</h2>
      <div className="ops-grid">
        <div className="ops-field">
          <label htmlFor="ops-s-company">{tx('Company name', 'اسم الشركة')}</label>
          <input id="ops-s-company" className="ops-input" value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} />
        </div>
        <div className="ops-field">
          <label htmlFor="ops-s-issue">{tx('Issue / revision', 'الإصدار / المراجعة')}</label>
          <input id="ops-s-issue" className="ops-input" value={company.issue} onChange={e => setCompany(c => ({ ...c, issue: e.target.value }))} />
        </div>
      </div>
      <h3 className="ops-section" style={{ margin: '8px 0 0', fontSize: 12 }}>
        {tx('Document code per form', 'رمز الوثيقة لكل استمارة')}
      </h3>
      <div className="ops-grid">
        {schema!.forms.map(f => (
          <div key={f.id} className="ops-field">
            <label htmlFor={`ops-s-doc-${f.id}`}>{t(f.title)}</label>
            <input
              id={`ops-s-doc-${f.id}`}
              className="ops-input"
              placeholder={f.docCode}
              value={forms[f.id]?.docCode ?? ''}
              onChange={e => setForms(prev => ({ ...prev, [f.id]: { ...(prev[f.id] ?? {}), docCode: e.target.value } }))}
            />
          </div>
        ))}
      </div>
      <label className="ops-dd__opt" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={autoAdd} onChange={e => setAutoAdd(e.target.checked)} />
        <span>{tx('Add new values typed in forms or imports to the lists automatically', 'إضافة القيم الجديدة المدخلة أو المستوردة إلى القوائم تلقائياً')}</span>
      </label>
      <SaveBar saver={saver} onSave={() => saver.run(() => opsApi.saveSettings({ company, forms, autoAddListValues: autoAdd }))} />
    </>
  )
}

function LimitSettings({ settings, onSaved }: { settings: OpsSettings; onSaved: () => Promise<void> }) {
  const tx = useOpsText()
  const [limits, setLimits] = useState(settings.ecPhLimits)
  const saver = useSaver(onSaved)
  const fields: [keyof OpsSettings['ecPhLimits'], string][] = [
    ['ecMin', tx('EC minimum', 'أدنى EC')],
    ['ecMax', tx('EC maximum', 'أعلى EC')],
    ['phMin', tx('pH minimum', 'أدنى pH')],
    ['phMax', tx('pH maximum', 'أعلى pH')],
    ['drainMin', tx('Drain % minimum', 'أدنى نسبة صرف')],
    ['drainMax', tx('Drain % maximum', 'أعلى نسبة صرف')],
  ]
  return (
    <>
      <h2>{tx('EC / pH limits', 'حدود EC / pH')}</h2>
      <p className="ops-field__hint">{tx('Readings outside these limits are highlighted in the EC / pH table.', 'القراءات خارج هذه الحدود تظهر مميزة في جدول EC / pH.')}</p>
      <div className="ops-grid">
        {fields.map(([k, label]) => (
          <div key={k} className="ops-field">
            <label htmlFor={`ops-l-${k}`}>{label}</label>
            <input id={`ops-l-${k}`} className="ops-input" type="number" step="any" value={limits[k]} onChange={e => setLimits(l => ({ ...l, [k]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <SaveBar saver={saver} onSave={() => saver.run(() => opsApi.saveSettings({ ecPhLimits: limits }))} />
    </>
  )
}

function SaveBar({ saver, onSave }: { saver: ReturnType<typeof useSaver>; onSave: () => void }) {
  const tx = useOpsText()
  return (
    <div className="ops-actions" style={{ alignItems: 'center', marginTop: 8 }}>
      <button type="button" className="ops-btn ops-btn--primary" onClick={onSave} disabled={saver.busy}>
        <Save aria-hidden /> {tx('Save', 'حفظ')}
      </button>
      {saver.msg ? (
        <span role="status" style={{ color: saver.error ? 'var(--ops-danger)' : 'var(--ops-muted)' }}>
          {saver.msg}
        </span>
      ) : null}
    </div>
  )
}

function ListEditor({ listKey, items, metaKeys, onChanged }: { listKey: string; items: OpsListItem[]; metaKeys: string[]; onChanged: () => Promise<void> }) {
  const { schema, t } = useOps()
  const tx = useOpsText()
  const [rows, setRows] = useState(items)
  const [filter, setFilter] = useState('')
  const [newValue, setNewValue] = useState('')
  const saver = useSaver(onChanged)
  useEffect(() => setRows(items), [items])
  const meta = schema!.lists.find(l => l.key === listKey)
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? rows.filter(r => r.value.toLowerCase().includes(q) || (r.labelAr ?? '').includes(q)) : rows
  }, [filter, rows])
  const patch = (id: number, p: Partial<OpsListItem>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const dirtyRows = rows.filter(r => {
    const o = items.find(i => i.id === r.id)
    return o && JSON.stringify(o) !== JSON.stringify(r)
  })

  return (
    <>
      <h2>{meta ? t(meta.label) : listKey}</h2>
      <div className="ops-filters" style={{ marginBottom: 8 }}>
        <input className="ops-input" style={{ flex: '1 1 200px' }} placeholder={tx('Filter…', 'تصفية…')} value={filter} onChange={e => setFilter(e.target.value)} aria-label={tx('Filter list', 'تصفية القائمة')} />
        <input className="ops-input" style={{ flex: '1 1 200px' }} placeholder={tx('New value', 'قيمة جديدة')} value={newValue} onChange={e => setNewValue(e.target.value)} aria-label={tx('New value', 'قيمة جديدة')} onKeyDown={e => e.key === 'Enter' && newValue.trim() && saver.run(() => opsApi.saveListItem(listKey, { value: newValue.trim() }).then(() => setNewValue('')))} />
        <button type="button" className="ops-btn" disabled={!newValue.trim() || saver.busy} onClick={() => saver.run(() => opsApi.saveListItem(listKey, { value: newValue.trim() }).then(() => setNewValue('')))}>
          <Plus aria-hidden /> {tx('Add', 'إضافة')}
        </button>
      </div>
      <div className="ops-table-card">
        <div className="ops-table-scroll" style={{ maxHeight: 460 }}>
          <table className="ops-table ops-list-table">
            <thead>
              <tr>
                <th><button type="button" tabIndex={-1}>{tx('Value', 'القيمة')}</button></th>
                <th><button type="button" tabIndex={-1}>{tx('Arabic label', 'الاسم بالعربية')}</button></th>
                {metaKeys.map(k => (
                  <th key={k}><button type="button" tabIndex={-1}>{k.replace(/_/g, ' ')}</button></th>
                ))}
                <th><button type="button" tabIndex={-1}>{tx('Active', 'نشط')}</button></th>
                <th aria-label={tx('Actions', 'إجراءات')} />
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td><input className="ops-input" value={r.value} onChange={e => patch(r.id, { value: e.target.value })} aria-label={tx('Value', 'القيمة')} /></td>
                  <td><input className="ops-input" dir="rtl" value={r.labelAr ?? ''} onChange={e => patch(r.id, { labelAr: e.target.value })} aria-label={tx('Arabic label', 'الاسم بالعربية')} /></td>
                  {metaKeys.map(k => (
                    <td key={k}>
                      <input className="ops-input" value={String(r.meta?.[k] ?? '')} onChange={e => patch(r.id, { meta: { ...(r.meta ?? {}), [k]: e.target.value } })} aria-label={k} />
                    </td>
                  ))}
                  <td><input type="checkbox" checked={r.active} onChange={e => patch(r.id, { active: e.target.checked })} aria-label={tx('Active', 'نشط')} /></td>
                  <td>
                    <button type="button" className="ops-icon-btn" onClick={() => saver.run(() => opsApi.deleteListItem(listKey, r.id))} aria-label={`${tx('Delete', 'حذف')} ${r.value}`} title={tx('Delete', 'حذف')}>
                      <Trash2 aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
              {!visible.length ? (
                <tr>
                  <td colSpan={4 + metaKeys.length} style={{ color: 'var(--ops-muted)' }}>
                    {tx('Empty — values are also added automatically when forms are saved or imported.', 'فارغة — تُضاف القيم تلقائياً عند الحفظ أو الاستيراد.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <SaveBar saver={saver} onSave={() => saver.run(() => Promise.all(dirtyRows.map(r => opsApi.saveListItem(listKey, r))))} />
    </>
  )
}
