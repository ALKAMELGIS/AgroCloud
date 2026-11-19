import { ChevronLeft, ChevronRight, Copy, History, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { OpsApiError, opsApi, type OpsField, type OpsForm, type OpsQuery, type OpsRecord } from '../api'
import { applyComputed } from '../compute'
import { formatValue, useOps, useOpsText } from '../opsContext'
import { OpsModal } from './OpsModal'

type Props = {
  form: OpsForm
  /** null = new record. */
  recordId: number | null
  /** Current table query: Previous / Next walk the same filtered, sorted list. */
  query: OpsQuery
  /** Values to start a new record with (Save & New keeps date / place / people). */
  initialValues?: Record<string, unknown>
  onClose: () => void
  onSaved: (record: OpsRecord, mode: 'save' | 'save-new') => void
  onDeleted: (id: number) => void
  onNavigate: (id: number) => void
  /** Start a new record pre-filled with these values. */
  onDuplicate: (values: Record<string, unknown>) => void
}

/** Fields carried into the next record by "Save & new" — the ones that repeat during a data-entry session. */
const STICKY = new Set(['farm', 'location', 'harvest_date', 'record_date', 'application_date', 'issue_date', 'operator', 'authorized_by', 'packhouse', 'crop', 'product', 'variety', 'method', 'station', 'system', 'pump_room', 'shift', 'weather', 'recipe'])

const today = () => new Date().toISOString().slice(0, 10)

function emptyValues(form: OpsForm): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  for (const f of form.fields) v[f.key] = ''
  v[form.dateField] = today()
  return v
}

function toInputValue(f: OpsField, v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

export function RecordEditor({ form, recordId, query, initialValues, onClose, onSaved, onDeleted, onNavigate, onDuplicate }: Props) {
  const { schema, t, lang, can } = useOps()
  const tx = useOpsText()
  const [values, setValuesRaw] = useState<Record<string, unknown>>(() => ({ ...emptyValues(form), ...(initialValues ?? {}) }))
  /** Values the record started from (loaded, blank, or carried over by Save & new) — "unsaved" means different from these. */
  const [baseline, setBaseline] = useState<Record<string, unknown>>(() => ({ ...emptyValues(form), ...(initialValues ?? {}) }))
  const setValues = (next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>), asBaseline = false) => {
    setValuesRaw(next)
    if (asBaseline && typeof next !== 'function') setBaseline(next)
  }
  const [original, setOriginal] = useState<OpsRecord | null>(null)
  const [nav, setNav] = useState<{ index: number; total: number; prev: number | null; next: number | null } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ tone: 'error' | 'ok' | 'warn'; text: string; duplicateId?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(recordId != null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof opsApi.history>>['history'] | null>(null)
  const firstInputRef = useRef<HTMLDivElement>(null)

  const isNew = recordId == null
  const mayCreate = can(form.id, 'create')
  const mayDelete = can(form.id, 'delete')
  /** Can the fields be changed at all: a new record needs create, an existing one edit. */
  const writable = isNew ? mayCreate : can(form.id, 'edit')
  const deleted = !!original?.deleted_at

  useEffect(() => {
    setErrors({})
    setMessage(null)
    setConfirmDelete(false)
    setHistory(null)
    if (recordId == null) {
      setOriginal(null)
      setNav(null)
      setValues({ ...emptyValues(form), ...(initialValues ?? {}) }, true)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    opsApi
      .get(form.id, recordId, query)
      .then(res => {
        if (!alive) return
        setOriginal(res.record)
        setValues({ ...res.record }, true)
        setNav(res.nav ?? null)
      })
      .catch(e => alive && setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) }))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // query is a snapshot for navigation; re-fetch only when the record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, recordId])

  const preview = useMemo(() => applyComputed(form, values), [form, values])

  const dirty = useMemo(
    () => form.fields.some(f => !f.computed && String(values[f.key] ?? '') !== String(baseline[f.key] ?? '')),
    [baseline, form, values],
  )

  const set = (key: string, v: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: v }
      // Picking a known PPP product fills its defaults (active ingredient, unit, PHI, price).
      if (form.id === 'ppp' && key === 'ppp_name') {
        const item = schema?.listItems.ppp_products?.find(i => i.value === v)
        const meta = item?.meta ?? {}
        for (const k of ['active_ingredient', 'uom', 'phi_days', 'unit_price']) {
          if (meta[k] != null && (prev[k] == null || prev[k] === '')) next[k] = String(meta[k])
        }
      }
      return next
    })
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }))
  }

  const save = useCallback(
    async (mode: 'save' | 'save-new', allowDuplicate = false) => {
      setBusy(true)
      setMessage(null)
      try {
        const payload: Record<string, unknown> = {}
        for (const f of form.fields) if (!f.computed) payload[f.key] = values[f.key] === '' ? null : values[f.key]
        const res = isNew ? await opsApi.create(form.id, payload, allowDuplicate) : await opsApi.update(form.id, recordId!, payload)
        setErrors({})
        onSaved(res.record, mode)
        if (mode === 'save-new') {
          const carry: Record<string, unknown> = {}
          for (const f of form.fields) if (STICKY.has(f.key) && res.record[f.key] != null) carry[f.key] = res.record[f.key]
          setValues({ ...emptyValues(form), ...carry }, true)
          setOriginal(null)
          setMessage({ tone: 'ok', text: tx('Saved. Enter the next record.', 'تم الحفظ. أدخل السجل التالي.') })
          firstInputRef.current?.querySelector<HTMLElement>('input, select')?.focus()
        } else if (isNew) {
          onNavigate(res.record.id)
        } else {
          setOriginal(res.record)
          setValues({ ...res.record }, true)
          setMessage({ tone: 'ok', text: tx('Changes saved.', 'تم حفظ التعديلات.') })
        }
      } catch (e) {
        if (e instanceof OpsApiError && e.status === 422 && e.details) {
          setErrors(e.details as Record<string, string>)
          setMessage({ tone: 'error', text: tx('Please correct the highlighted fields.', 'يرجى تصحيح الحقول المحددة.') })
        } else if (e instanceof OpsApiError && e.status === 409) {
          setMessage({ tone: 'warn', text: tx('An identical record already exists.', 'يوجد سجل مطابق مسبقاً.'), duplicateId: Number(e.details?.duplicateId) || undefined })
        } else {
          setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      } finally {
        setBusy(false)
      }
    },
    [form, isNew, onNavigate, onSaved, recordId, tx, values],
  )

  // Ctrl/⌘+S saves, Ctrl/⌘+Enter saves and starts the next record.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || busy || deleted) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (writable) void save('save')
      } else if (e.key === 'Enter' && writable && mayCreate) {
        e.preventDefault()
        void save('save-new')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, deleted, save, writable, mayCreate])

  const go = (id: number | null) => {
    if (id == null) return
    if (dirty && !window.confirm(tx('Discard unsaved changes?', 'تجاهل التعديلات غير المحفوظة؟'))) return
    onNavigate(id)
  }

  const remove = async () => {
    setBusy(true)
    try {
      await opsApi.remove(form.id, recordId!)
      onDeleted(recordId!)
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
      setBusy(false)
    }
  }

  const restore = async () => {
    setBusy(true)
    try {
      const res = await opsApi.restore(form.id, recordId!)
      setOriginal(res.record)
      setValues({ ...res.record }, true)
      onSaved(res.record, 'save')
      setMessage({ tone: 'ok', text: tx('Record restored.', 'تمت استعادة السجل.') })
    } finally {
      setBusy(false)
    }
  }

  const sections = useMemo(() => {
    const order: string[] = []
    const by: Record<string, OpsField[]> = {}
    for (const f of form.fields) {
      if (!by[f.section]) {
        by[f.section] = []
        order.push(f.section)
      }
      by[f.section]!.push(f)
    }
    return order.map(s => ({ id: s, fields: by[s]! }))
  }, [form])

  const title = isNew ? tx('New record', 'سجل جديد') : `${t(form.title)} #${recordId}`
  const subtitle = isNew
    ? t(form.title)
    : original
      ? `${tx('Created', 'أُنشئ')} ${original.created_at?.toString().slice(0, 16).replace('T', ' ')}${original.created_by ? ` · ${original.created_by}` : ''}${original.updated_at ? ` · ${tx('edited', 'عُدّل')} ${String(original.updated_at).slice(0, 16).replace('T', ' ')}` : ''}`
      : ''

  return (
    <OpsModal
      variant="drawer"
      title={title}
      subtitle={subtitle}
      onClose={() => {
        if (dirty && !window.confirm(tx('Discard unsaved changes?', 'تجاهل التعديلات غير المحفوظة؟'))) return
        onClose()
      }}
      closeLabel={tx('Close', 'إغلاق')}
      footer={
        <>
          <div className="ops-nav">
            {!isNew && nav ? (
              <>
                <button type="button" className="ops-icon-btn" onClick={() => go(nav.prev)} disabled={nav.prev == null || busy} aria-label={tx('Previous record', 'السجل السابق')} title={tx('Previous record', 'السجل السابق')}>
                  {lang === 'ar' ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
                </button>
                <span>
                  {nav.index + 1} / {nav.total.toLocaleString()}
                </span>
                <button type="button" className="ops-icon-btn" onClick={() => go(nav.next)} disabled={nav.next == null || busy} aria-label={tx('Next record', 'السجل التالي')} title={tx('Next record', 'السجل التالي')}>
                  {lang === 'ar' ? <ChevronLeft aria-hidden /> : <ChevronRight aria-hidden />}
                </button>
              </>
            ) : null}
            {!isNew && !deleted ? (
              <>
                <button type="button" className="ops-icon-btn" onClick={() => opsApi.history(form.id, recordId!).then(r => setHistory(r.history))} aria-label={tx('History', 'السجل التاريخي')} title={tx('History', 'السجل التاريخي')}>
                  <History aria-hidden />
                </button>
                {mayCreate ? (
                <button
                  type="button"
                  className="ops-icon-btn"
                  onClick={() => {
                    if (dirty && !window.confirm(tx('Discard unsaved changes?', 'تجاهل التعديلات غير المحفوظة؟'))) return
                    const copy: Record<string, unknown> = {}
                    for (const f of form.fields) if (!f.computed) copy[f.key] = values[f.key] ?? ''
                    onDuplicate(copy)
                  }}
                  aria-label={tx('Duplicate as new', 'نسخ كسجل جديد')}
                  title={tx('Duplicate as new', 'نسخ كسجل جديد')}
                >
                  <Copy aria-hidden />
                </button>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="ops-actions">
            {deleted ? (
              mayDelete ? (
                <button type="button" className="ops-btn" onClick={restore} disabled={busy}>
                  <RotateCcw aria-hidden /> {tx('Restore', 'استعادة')}
                </button>
              ) : null
            ) : !writable ? (
              <span className="ops-field__hint">{tx('Read only — your role cannot change this record.', 'للقراءة فقط — دورك لا يسمح بتعديل هذا السجل.')}</span>
            ) : (
              <>
                {!isNew && mayDelete ? (
                  confirmDelete ? (
                    <>
                      <button type="button" className="ops-btn ops-btn--danger" onClick={remove} disabled={busy}>
                        {tx('Confirm delete', 'تأكيد الحذف')}
                      </button>
                      <button type="button" className="ops-btn" onClick={() => setConfirmDelete(false)}>
                        {tx('Cancel', 'إلغاء')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ops-btn ops-btn--danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                      <Trash2 aria-hidden /> {tx('Delete', 'حذف')}
                    </button>
                  )
                ) : null}
                {mayCreate ? (
                  <button type="button" className="ops-btn" onClick={() => save('save-new')} disabled={busy || loading} title="Ctrl+Enter">
                    {tx('Save & new', 'حفظ وجديد')}
                  </button>
                ) : null}
                <button type="button" className="ops-btn ops-btn--primary" onClick={() => save('save')} disabled={busy || loading || (!isNew && !dirty)} title="Ctrl+S">
                  <Save aria-hidden /> {busy ? tx('Saving…', 'جارٍ الحفظ…') : tx('Save', 'حفظ')}
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      {message ? (
        <div className={`ops-alert${message.tone === 'ok' ? ' ops-alert--ok' : message.tone === 'warn' ? ' ops-alert--warn' : ''}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          <span style={{ flex: 1 }}>{message.text}</span>
          {message.duplicateId ? (
            <>
              <button type="button" className="ops-btn ops-btn--sm" onClick={() => onNavigate(message.duplicateId!)}>
                {tx('Open it', 'فتحه')}
              </button>
              <button type="button" className="ops-btn ops-btn--sm" onClick={() => save('save', true)}>
                {tx('Save anyway', 'حفظ على أي حال')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {deleted ? <div className="ops-alert ops-alert--warn">{tx('This record was deleted. Restore it to edit.', 'هذا السجل محذوف. استعده للتعديل.')}</div> : null}
      {loading ? (
        <p className="ops-field__hint">{tx('Loading…', 'جارٍ التحميل…')}</p>
      ) : history ? (
        <>
          <button type="button" className="ops-btn ops-btn--sm" onClick={() => setHistory(null)} style={{ marginBottom: 10 }}>
            {lang === 'ar' ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />} {tx('Back to record', 'العودة للسجل')}
          </button>
          <ul className="ops-history">
            {history.map(h => (
              <li key={h.id}>
                <strong>{h.action}</strong> <small>· {h.at.slice(0, 16).replace('T', ' ')} · {decodeURIComponent(h.actor || '—')}</small>
                {h.changes && h.action === 'update' ? (
                  <ul>
                    {Object.entries(h.changes).map(([k, [a, b]]) => (
                      <li key={k} style={{ border: 0, padding: 0 }}>
                        {form.fields.find(f => f.key === k)?.label[lang] ?? k}: <s>{String(a ?? '—')}</s> → <strong>{String(b ?? '—')}</strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div ref={firstInputRef}>
          {sections.map(sec => (
            <section key={sec.id} className="ops-section">
              <h3>{schema?.sections[sec.id] ? t(schema.sections[sec.id]!) : sec.id}</h3>
              <div className="ops-grid">
                {sec.fields.map(f => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={f.computed ? preview[f.key] : values[f.key]}
                    error={errors[f.key]}
                    disabled={deleted || !writable}
                    options={f.list ? schema?.listItems[f.list] ?? [] : []}
                    lang={lang}
                    onChange={v => set(f.key, v)}
                    computedHint={tx('Calculated automatically', 'يُحسب تلقائياً')}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </OpsModal>
  )
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  options,
  lang,
  onChange,
  computedHint,
}: {
  field: OpsField
  value: unknown
  error?: string
  disabled?: boolean
  options: { value: string; labelAr: string | null; active: boolean }[]
  lang: 'en' | 'ar'
  onChange: (v: string) => void
  computedHint: string
}) {
  const id = `ops-f-${field.key}`
  const listId = `${id}-list`
  const label = field.label[lang] || field.label.en
  const common = {
    id,
    className: `ops-input${error ? ' is-invalid' : ''}`,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-err` : undefined,
    disabled,
  }
  let control
  if (field.computed) {
    control = <input {...common} readOnly value={formatValue(field, value)} aria-readonly="true" />
  } else if (field.type === 'textarea') {
    control = <textarea {...common} rows={3} value={toInputValue(field, value)} onChange={e => onChange(e.target.value)} />
  } else if (field.type === 'select') {
    control = (
      <>
        <input {...common} list={listId} autoComplete="off" value={toInputValue(field, value)} onChange={e => onChange(e.target.value)} />
        <datalist id={listId}>
          {options
            .filter(o => o.active)
            .map(o => (
              <option key={o.value} value={o.value}>
                {lang === 'ar' && o.labelAr ? o.labelAr : undefined}
              </option>
            ))}
        </datalist>
      </>
    )
  } else {
    const type = field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'number' || field.type === 'integer' ? 'number' : 'text'
    control = (
      <input
        {...common}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step={field.type === 'integer' ? 1 : type === 'number' ? 'any' : undefined}
        min={field.min}
        max={field.max}
        value={toInputValue(field, value)}
        onChange={e => onChange(e.target.value)}
      />
    )
  }
  return (
    <div className={`ops-field${field.type === 'textarea' ? ' ops-field--wide' : ''}`}>
      <label htmlFor={id}>
        {label} {field.required ? <span className="req">*</span> : null} {field.unit ? <span className="unit">({field.unit})</span> : null}
      </label>
      {control}
      {error ? (
        <span id={`${id}-err`} className="ops-field__err">
          {error}
        </span>
      ) : field.computed ? (
        <span className="ops-field__hint">{computedHint}</span>
      ) : null}
    </div>
  )
}
