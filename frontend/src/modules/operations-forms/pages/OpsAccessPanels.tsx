import { Download, ExternalLink, Lock, RotateCcw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { opsApi, type OpsAdminAction, type OpsAuditRow, type OpsFormAction, type OpsPermissionMatrix } from '../api'
import { downloadBlob } from '../reports/renderers'
import { useOps, useOpsText } from '../opsContext'

const ACTION_LABEL: Record<OpsFormAction | OpsAdminAction, [string, string]> = {
  view: ['View', 'عرض'],
  create: ['Add', 'إضافة'],
  edit: ['Edit', 'تعديل'],
  delete: ['Delete / restore', 'حذف / استعادة'],
  import: ['Import', 'استيراد'],
  export: ['Export & reports', 'تصدير وتقارير'],
  lists: ['Lookup lists', 'القوائم'],
  settings: ['Settings & permissions', 'الإعدادات والصلاحيات'],
  audit: ['Audit log', 'سجل التدقيق'],
}

const ROLE_AR: Record<string, string> = {
  Admin: 'مسؤول',
  'Admin Manager': 'مدير إداري',
  Manager: 'مدير',
  Editor: 'محرر',
  Viewer: 'مشاهد',
}

/* ───────────────────────────── Permissions matrix ───────────────────────────── */

export function PermissionsEditor({ onSaved }: { onSaved: () => Promise<void> }) {
  const { schema, t, lang } = useOps()
  const tx = useOpsText()
  const model = schema!.permissionModel
  const [matrix, setMatrix] = useState<OpsPermissionMatrix>(() => structuredClone(schema!.settings.permissions))
  const [role, setRole] = useState(model.roles.find(r => r !== 'Admin') ?? model.roles[0]!)
  const [state, setState] = useState<{ busy: boolean; msg: string | null; error: boolean }>({ busy: false, msg: null, error: false })
  const locked = role === 'Admin'
  const rights = matrix[role]!
  const dirty = JSON.stringify(matrix) !== JSON.stringify(schema!.settings.permissions)
  const roleLabel = (r: string) => (lang === 'ar' ? ROLE_AR[r] ?? r : r)

  const toggleForm = (formId: string, action: OpsFormAction) =>
    setMatrix(m => {
      const next = structuredClone(m)
      const acts = new Set(next[role]!.forms[formId] ?? [])
      if (acts.has(action)) {
        acts.delete(action)
        if (action === 'view') acts.clear() // no view → nothing else makes sense
      } else {
        acts.add(action)
        acts.add('view')
      }
      next[role]!.forms[formId] = model.formActions.filter(a => acts.has(a))
      return next
    })

  const setRow = (formId: string, on: boolean) =>
    setMatrix(m => {
      const next = structuredClone(m)
      next[role]!.forms[formId] = on ? [...model.formActions] : []
      return next
    })

  const setColumn = (action: OpsFormAction, on: boolean) =>
    setMatrix(m => {
      const next = structuredClone(m)
      for (const f of schema!.forms) {
        const acts = new Set(next[role]!.forms[f.id] ?? [])
        if (on) {
          acts.add(action)
          acts.add('view')
        } else {
          acts.delete(action)
          if (action === 'view') acts.clear()
        }
        next[role]!.forms[f.id] = model.formActions.filter(a => acts.has(a))
      }
      return next
    })

  const toggleAdmin = (action: OpsAdminAction) =>
    setMatrix(m => {
      const next = structuredClone(m)
      const acts = new Set(next[role]!.admin)
      if (acts.has(action)) acts.delete(action)
      else acts.add(action)
      next[role]!.admin = model.adminActions.filter(a => acts.has(a))
      return next
    })

  const save = async () => {
    setState({ busy: true, msg: null, error: false })
    try {
      await opsApi.saveSettings({ permissions: matrix })
      await onSaved()
      setState({ busy: false, msg: tx('Permissions saved — they apply immediately.', 'تم حفظ الصلاحيات — تُطبّق فوراً.'), error: false })
    } catch (e) {
      setState({ busy: false, msg: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  return (
    <>
      <h2 className="ops-panel-title">{tx('Permissions', 'الصلاحيات')}</h2>
      <p className="ops-field__hint" style={{ marginTop: 0 }}>
        {tx(
          'Choose what each role can do in every form. The server enforces these rights on every request. Administrators always keep full access.',
          'حدّد ما يستطيع كل دور فعله في كل استمارة. يطبّق الخادم هذه الصلاحيات على كل طلب. يحتفظ المسؤول دائماً بكامل الصلاحيات.',
        )}
      </p>

      <div className="ops-seg" role="tablist" aria-label={tx('Role', 'الدور')}>
        {model.roles.map(r => (
          <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'is-active' : ''} onClick={() => setRole(r)}>
            {r === 'Admin' ? <Lock aria-hidden /> : null}
            {roleLabel(r)}
          </button>
        ))}
      </div>

      {locked ? (
        <div className="ops-alert ops-alert--ok" role="status">
          {tx('The Admin role always has every right, so the system can never be locked out of its settings.', 'دور المسؤول يملك كل الصلاحيات دائماً حتى لا يُغلق النظام أمام إعداداته.')}
        </div>
      ) : null}

      <div className="ops-table-wrap ops-perm">
        <table className="ops-table">
          <thead>
            <tr>
              <th>
                <span className="ops-perm__head">{tx('Form', 'الاستمارة')}</span>
              </th>
              {model.formActions.map(a => {
                const all = schema!.forms.every(f => rights.forms[f.id]?.includes(a))
                return (
                  <th key={a} className="is-center">
                    <label className="ops-perm__col">
                      <span>{tx(...ACTION_LABEL[a])}</span>
                      <input type="checkbox" checked={all} disabled={locked} onChange={e => setColumn(a, e.target.checked)} aria-label={`${tx('All forms', 'كل الاستمارات')}: ${tx(...ACTION_LABEL[a])}`} />
                    </label>
                  </th>
                )
              })}
              <th className="is-center">
                <span className="ops-perm__head">{tx('All', 'الكل')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {schema!.forms.map(f => {
              const acts = rights.forms[f.id] ?? []
              return (
                <tr key={f.id}>
                  <td>
                    <strong>{t(f.title)}</strong>
                  </td>
                  {model.formActions.map(a => (
                    <td key={a} className="is-center">
                      <input
                        type="checkbox"
                        checked={acts.includes(a)}
                        disabled={locked}
                        onChange={() => toggleForm(f.id, a)}
                        aria-label={`${t(f.title)}: ${tx(...ACTION_LABEL[a])}`}
                      />
                    </td>
                  ))}
                  <td className="is-center">
                    <input
                      type="checkbox"
                      checked={acts.length === model.formActions.length}
                      disabled={locked}
                      onChange={e => setRow(f.id, e.target.checked)}
                      aria-label={`${t(f.title)}: ${tx('all rights', 'كل الصلاحيات')}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3 className="ops-section" style={{ margin: '18px 0 8px', fontSize: 12 }}>
        {tx('System', 'النظام')}
      </h3>
      <div className="ops-perm__system">
        {model.adminActions.map(a => (
          <label key={a} className="ops-dd__opt">
            <input type="checkbox" checked={rights.admin.includes(a)} disabled={locked} onChange={() => toggleAdmin(a)} />
            <span>{tx(...ACTION_LABEL[a])}</span>
          </label>
        ))}
      </div>

      <div className="ops-actions" style={{ marginTop: 16 }}>
        <button type="button" className="ops-btn ops-btn--primary" onClick={() => void save()} disabled={state.busy || !dirty}>
          <Save aria-hidden /> {state.busy ? tx('Saving…', 'جارٍ الحفظ…') : tx('Save permissions', 'حفظ الصلاحيات')}
        </button>
        <button type="button" className="ops-btn" onClick={() => setMatrix(structuredClone(schema!.settings.permissions))} disabled={state.busy || !dirty}>
          <RotateCcw aria-hidden /> {tx('Discard changes', 'تجاهل التعديلات')}
        </button>
        {state.msg ? (
          <span className={state.error ? 'ops-field__err' : 'ops-field__hint'} role={state.error ? 'alert' : 'status'}>
            {state.msg}
          </span>
        ) : null}
      </div>
      <p className="ops-field__hint">
        {tx('Your role', 'دورك')}: <strong>{roleLabel(schema!.me.role)}</strong>.{' '}
        {tx(
          'Without the identity service, the role comes from the signed-in profile on this device.',
          'عند عدم تفعيل خدمة الهوية، يُؤخذ الدور من الملف الشخصي المسجّل على هذا الجهاز.',
        )}
      </p>
    </>
  )
}

/* ───────────────────────────────── Audit log ───────────────────────────────── */

const AUDIT_ACTIONS: Record<string, [string, string, string]> = {
  create: ['Added', 'إضافة', 'ok'],
  update: ['Edited', 'تعديل', 'info'],
  delete: ['Deleted', 'حذف', 'danger'],
  restore: ['Restored', 'استعادة', 'ok'],
  import: ['Imported', 'استيراد', 'info'],
  settings: ['Settings', 'إعدادات', 'warn'],
  'list-add': ['List value added', 'إضافة قيمة', 'muted'],
  'list-update': ['List value edited', 'تعديل قيمة', 'muted'],
  'list-delete': ['List value removed', 'حذف قيمة', 'muted'],
}

type AuditQuery = { form?: string; actor?: string; action?: string; from?: string; to?: string; q?: string; page: number; pageSize: number }

export function AuditLog() {
  const { schema, t, lang } = useOps()
  const tx = useOpsText()
  const [query, setQuery] = useState<AuditQuery>({ page: 1, pageSize: 50 })
  const [qText, setQText] = useState('')
  const [data, setData] = useState<{ rows: OpsAuditRow[]; total: number; actors: { actor: string; n: number }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const formTitle = useCallback(
    (id: string) => {
      if (id === '_settings') return tx('Settings', 'الإعدادات')
      if (id === '_lists') return tx('Lookup lists', 'القوائم')
      const f = schema!.forms.find(x => x.id === id)
      return f ? t(f.title) : id
    },
    [schema, t, tx],
  )

  const fieldLabel = useCallback(
    (formId: string, key: string) => {
      const f = schema!.forms.find(x => x.id === formId)?.fields.find(x => x.key === key)
      return f ? t(f.label) : key
    },
    [schema, t],
  )

  // Debounced text search.
  useEffect(() => {
    const h = window.setTimeout(() => setQuery(q => (q.q === (qText || undefined) ? q : { ...q, q: qText || undefined, page: 1 })), 300)
    return () => window.clearTimeout(h)
  }, [qText])

  useEffect(() => {
    let alive = true
    opsApi
      .audit(query)
      .then(d => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch(e => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [query])

  const details = useCallback(
    (r: OpsAuditRow): string => {
      const c = r.changes as Record<string, unknown> | null
      if (!c) return ''
      if (r.action === 'update') {
        return Object.entries(c)
          .map(([k, v]) => {
            const [a, b] = Array.isArray(v) ? v : [null, v]
            return `${fieldLabel(r.form, k)}: ${a ?? '∅'} → ${b ?? '∅'}`
          })
          .join(' · ')
      }
      if (r.action === 'import') {
        const n = (k: string) => Number(c[k] ?? 0).toLocaleString()
        return `${tx('added', 'أُضيف')} ${n('inserted')} · ${tx('duplicates', 'مكرر')} ${n('duplicates')} · ${tx('invalid', 'غير صالح')} ${n('invalid')}${c.source ? ` · ${String(c.source).replace(/^import:/, '')}` : ''}`
      }
      if (r.action === 'settings') return (c.keys as string[] | undefined)?.join(', ') ?? ''
      if (r.action.startsWith('list-')) {
        const list = schema!.lists.find(l => l.key === c.list)
        return `${list ? t(list.label) : String(c.list ?? '')}: ${String(c.value ?? '')}`
      }
      return ''
    },
    [fieldLabel, schema, t, tx],
  )

  const fmtTime = useMemo(() => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }), [lang])

  const exportCsv = async () => {
    setBusy(true)
    try {
      const all: OpsAuditRow[] = []
      for (let page = 1; page <= 40; page++) {
        const d = await opsApi.audit({ ...query, page, pageSize: 500 })
        all.push(...d.rows)
        if (all.length >= d.total || !d.rows.length) break
      }
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        ['Time (UTC)', 'User', 'Form', 'Record', 'Action', 'Details'].map(esc).join(','),
        ...all.map(r => [r.at, r.actor, formTitle(r.form), r.recordId ?? '', AUDIT_ACTIONS[r.action]?.[0] ?? r.action, details(r)].map(esc).join(',')),
      ]
      downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `ops-audit-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<AuditQuery>) => setQuery(q => ({ ...q, ...patch, page: 1 }))
  const pages = data ? Math.max(1, Math.ceil(data.total / query.pageSize)) : 1

  return (
    <>
      <div className="ops-panel-head">
        <div>
          <h2 className="ops-panel-title">{tx('Audit log', 'سجل التدقيق')}</h2>
          <p className="ops-field__hint" style={{ margin: 0 }}>
            {tx('Every change to records, lookup lists and settings — who, what and when.', 'كل تغيير على السجلات والقوائم والإعدادات — من وماذا ومتى.')}
          </p>
        </div>
        <button type="button" className="ops-btn" onClick={() => void exportCsv()} disabled={busy || !data?.total}>
          <Download aria-hidden /> {busy ? tx('Exporting…', 'جارٍ التصدير…') : tx('Export CSV', 'تصدير CSV')}
        </button>
      </div>

      <div className="ops-filters" role="search">
        <input className="ops-input" value={qText} onChange={e => setQText(e.target.value)} placeholder={tx('Search details or record #…', 'ابحث في التفاصيل أو رقم السجل…')} aria-label={tx('Search the audit log', 'بحث في سجل التدقيق')} />
        <select className="ops-input" value={query.form ?? ''} onChange={e => set({ form: e.target.value || undefined })} aria-label={tx('Form', 'الاستمارة')}>
          <option value="">{tx('All forms', 'كل الاستمارات')}</option>
          {schema!.forms.map(f => (
            <option key={f.id} value={f.id}>
              {t(f.title)}
            </option>
          ))}
          <option value="_lists">{tx('Lookup lists', 'القوائم')}</option>
          <option value="_settings">{tx('Settings', 'الإعدادات')}</option>
        </select>
        <select className="ops-input" value={query.action ?? ''} onChange={e => set({ action: e.target.value || undefined })} aria-label={tx('Action', 'الإجراء')}>
          <option value="">{tx('All actions', 'كل الإجراءات')}</option>
          {Object.entries(AUDIT_ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {lang === 'ar' ? v[1] : v[0]}
            </option>
          ))}
        </select>
        <select className="ops-input" value={query.actor ?? ''} onChange={e => set({ actor: e.target.value || undefined })} aria-label={tx('User', 'المستخدم')}>
          <option value="">{tx('All users', 'كل المستخدمين')}</option>
          {(data?.actors ?? []).map(a => (
            <option key={a.actor} value={a.actor}>
              {safeDecode(a.actor)} ({a.n.toLocaleString()})
            </option>
          ))}
        </select>
        <input type="date" className="ops-input" value={query.from ?? ''} onChange={e => set({ from: e.target.value || undefined })} aria-label={tx('From', 'من')} />
        <input type="date" className="ops-input" value={query.to ?? ''} onChange={e => set({ to: e.target.value || undefined })} aria-label={tx('To', 'إلى')} />
      </div>

      {error ? (
        <div className="ops-alert" role="alert">
          {error}
        </div>
      ) : null}

      <div className="ops-table-wrap">
        <table className="ops-table ops-audit">
          <thead>
            <tr>
              <th><span className="ops-perm__head">{tx('Time', 'الوقت')}</span></th>
              <th><span className="ops-perm__head">{tx('User', 'المستخدم')}</span></th>
              <th><span className="ops-perm__head">{tx('Form', 'الاستمارة')}</span></th>
              <th><span className="ops-perm__head">{tx('Action', 'الإجراء')}</span></th>
              <th><span className="ops-perm__head">{tx('Details', 'التفاصيل')}</span></th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map(r => {
              const a = AUDIT_ACTIONS[r.action]
              const real = schema!.forms.some(f => f.id === r.form)
              return (
                <tr key={r.id}>
                  <td className="is-nowrap">{fmtTime.format(new Date(r.at.endsWith('Z') ? r.at : `${r.at}Z`))}</td>
                  <td className="is-nowrap">{safeDecode(r.actor ?? '—')}</td>
                  <td className="is-nowrap">
                    {formTitle(r.form)}
                    {real && r.recordId ? (
                      <Link to={`/ops/${r.form}?open=${r.recordId}`} className="ops-audit__rec" aria-label={`${tx('Open record', 'فتح السجل')} ${r.recordId}`}>
                        #{r.recordId} <ExternalLink aria-hidden />
                      </Link>
                    ) : null}
                  </td>
                  <td className="is-nowrap">
                    <span className={`ops-badge ops-badge--${a?.[2] ?? 'muted'}`}>{a ? (lang === 'ar' ? a[1] : a[0]) : r.action}</span>
                  </td>
                  <td className="ops-audit__details">{details(r)}</td>
                </tr>
              )
            })}
            {data && !data.rows.length ? (
              <tr>
                <td colSpan={5} className="ops-field__hint" style={{ padding: 18, textAlign: 'center' }}>
                  {tx('No changes match these filters.', 'لا توجد تغييرات تطابق هذه الفلاتر.')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="ops-pager">
        <span className="ops-field__hint">
          {(data?.total ?? 0).toLocaleString()} {tx('changes', 'تغيير')}
        </span>
        <div className="ops-actions">
          <button type="button" className="ops-btn ops-btn--sm" disabled={query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>
            {tx('Previous', 'السابق')}
          </button>
          <span className="ops-field__hint">
            {query.page} / {pages}
          </span>
          <button type="button" className="ops-btn ops-btn--sm" disabled={query.page >= pages} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>
            {tx('Next', 'التالي')}
          </button>
        </div>
      </div>
    </>
  )
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
