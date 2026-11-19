import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, Download, FileBarChart2, Inbox, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { fetchAllRecords, opsApi, type OpsForm, type OpsQuery, type OpsRecord } from '../api'
import { FilterSelect } from '../components/FilterSelect'
import { ImportDialog } from '../components/ImportDialog'
import { RecordEditor } from '../components/RecordEditor'
import { ReportDialog } from '../components/ReportDialog'
import { exportRecordsCsv, exportRecordsXlsx } from '../reports/renderers'
import { formatNumber, formatValue, useOps, useOpsText } from '../opsContext'

const PAGE_SIZES = [25, 50, 100, 200]

type Preset = 'all' | 'today' | 'week' | 'month' | 'last30' | 'season' | 'custom'

const iso = (d: Date) => d.toISOString().slice(0, 10)

function presetRange(p: Preset): { from?: string; to?: string } {
  const now = new Date()
  const today = iso(now)
  switch (p) {
    case 'today':
      return { from: today, to: today }
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return { from: iso(d), to: today }
    }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today }
    case 'last30': {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { from: iso(d), to: today }
    }
    case 'season': {
      // Growing season Sept → Aug.
      const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
      return { from: `${y}-09-01`, to: `${y + 1}-08-31` }
    }
    default:
      return {}
  }
}

function storageKey(formId: string, what: string) {
  return `agro-ops:${formId}:${what}`
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key) ?? localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export default function OpsFormPage() {
  const { formId = '' } = useParams()
  const { schema, lang, t, reload, can } = useOps()
  const form = schema?.forms.find(f => f.id === formId)
  if (!schema) return null
  if (form && !can(form.id, 'view')) {
    return (
      <div className="ops">
        <div className="ops-alert" role="alert">
          {lang === 'ar' ? 'دورك لا يملك صلاحية عرض هذه الاستمارة.' : 'Your role does not have access to this form.'}
        </div>
        <Link to="/ops" className="ops-btn">
          {lang === 'ar' ? 'العودة للاستمارات' : 'Back to forms'}
        </Link>
      </div>
    )
  }
  if (!form) {
    return (
      <div className="ops">
        <div className="ops-alert">Unknown form “{formId}”.</div>
        <Link to="/ops" className="ops-btn">
          {lang === 'ar' ? 'العودة للاستمارات' : 'Back to forms'}
        </Link>
      </div>
    )
  }
  return <FormWorkspace key={form.id} form={form} lang={lang} t={t} reloadSchema={reload} />
}

function FormWorkspace({ form, lang, t, reloadSchema }: { form: OpsForm; lang: 'en' | 'ar'; t: ReturnType<typeof useOps>['t']; reloadSchema: () => Promise<void> }) {
  const { schema, can } = useOps()
  const tx = useOpsText()
  const may = {
    create: can(form.id, 'create'),
    edit: can(form.id, 'edit'),
    delete: can(form.id, 'delete'),
    import: can(form.id, 'import'),
    export: can(form.id, 'export'),
  }
  const [preset, setPreset] = useState<Preset>(() => readJson(storageKey(form.id, 'preset'), 'all'))
  const [query, setQuery] = useState<OpsQuery>(() => readJson(storageKey(form.id, 'query'), { sort: form.dateField, dir: 'desc', page: 1, pageSize: 50, filters: {} }))
  const [searchText, setSearchText] = useState(query.q ?? '')
  const [rows, setRows] = useState<OpsRecord[]>([])
  const [total, setTotal] = useState(0)
  const [totals, setTotals] = useState<(number | null)[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<Record<string, { value: string; count: number }[]>>({})
  const [editor, setEditor] = useState<{ id: number | null; initial?: Record<string, unknown>; nonce: number } | null>(null)
  const [dialog, setDialog] = useState<'import' | 'report' | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)
  const defaultCols = useMemo(() => form.fields.filter(f => f.type !== 'textarea').slice(0, 10).map(f => f.key), [form])
  const [columns, setColumns] = useState<string[]>(() => readJson(storageKey(form.id, 'columns'), defaultCols))

  useFlashReset(flashId, setFlashId)

  // Links from the forms hub: ?new=1 opens a blank record, ?report=1 the report dialog.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    // ?open=<id> comes from the audit log.
    const open = Number(params.get('open'))
    if (params.get('new') === '1' && may.create) setEditor({ id: null, nonce: Date.now() })
    else if (open > 0) setEditor({ id: open, nonce: Date.now() })
    if (params.get('report') === '1' && may.export) setDialog('report')
    if (params.has('new') || params.has('report') || params.has('open')) setParams({}, { replace: true })
    // Run once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(form.id, 'query'), JSON.stringify(query))
      sessionStorage.setItem(storageKey(form.id, 'preset'), JSON.stringify(preset))
      localStorage.setItem(storageKey(form.id, 'columns'), JSON.stringify(columns))
    } catch {
      /* ignore */
    }
  }, [columns, form.id, preset, query])

  // Search as you type (debounced).
  useEffect(() => {
    const h = setTimeout(() => setQuery(q => (q.q === searchText ? q : { ...q, q: searchText || undefined, page: 1 })), 300)
    return () => clearTimeout(h)
  }, [searchText])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, agg] = await Promise.all([opsApi.list(form.id, query), opsApi.aggregate(form.id, { ...query, page: undefined, pageSize: undefined })])
      setRows(list.rows)
      setTotal(list.total)
      setTotals(agg.rows[0]?.values ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [form.id, query])

  const loadOptions = useCallback(() => {
    opsApi
      .filters(form.id)
      .then(r => setOptions(r.options))
      .catch(() => undefined)
  }, [form.id])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(loadOptions, [loadOptions])

  const setFilter = (key: string, values: string[]) => setQuery(q => ({ ...q, filters: { ...(q.filters ?? {}), [key]: values }, page: 1 }))
  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') setQuery(q => ({ ...q, ...presetRange(p), ...(p === 'all' ? { from: undefined, to: undefined } : {}), page: 1 }))
  }
  const sortBy = (key: string) =>
    setQuery(q => ({ ...q, sort: key, dir: q.sort === key && q.dir === 'desc' ? 'asc' : 'desc', page: 1 }))

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    for (const [k, vals] of Object.entries(query.filters ?? {}))
      for (const v of vals) chips.push({ key: `${k}:${v}`, label: `${form.fields.find(f => f.key === k)?.label[lang] ?? k}: ${v}`, clear: () => setFilter(k, vals.filter(x => x !== v)) })
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, lang, query.filters])

  const limits = schema?.settings.ecPhLimits
  const isOut = (key: string, v: unknown): boolean => {
    if (form.id !== 'ec_ph' || typeof v !== 'number' || !limits) return false
    if (key.startsWith('ec_')) return v < limits.ecMin || v > limits.ecMax
    if (key.startsWith('ph_')) return v < limits.phMin || v > limits.phMax
    if (key === 'drain_pct') return v < limits.drainMin || v > limits.drainMax
    return false
  }

  const doExport = async (kind: 'xlsx' | 'csv') => {
    setExportOpen(false)
    setBusy(tx('Preparing export…', 'جارٍ تحضير التصدير…'))
    try {
      const all = await fetchAllRecords(form.id, { ...query, page: undefined, pageSize: undefined }, (d, n) => setBusy(`${tx('Exporting', 'تصدير')} ${d.toLocaleString()} / ${n.toLocaleString()}`))
      const base = `${form.id}-${new Date().toISOString().slice(0, 10)}`
      if (kind === 'xlsx') await exportRecordsXlsx(form, all, lang, base)
      else exportRecordsCsv(form, all, lang, base)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / (query.pageSize ?? 50)))
  const visibleFields = form.fields.filter(f => columns.includes(f.key))
  const hasFilters = !!(query.from || query.to || query.q || activeChips.length)

  return (
    <div className="ops">
      <div className="ops-head">
        <div>
          <Link to="/ops" className="ops-crumb">
            {tx('Operations forms', 'استمارات العمليات')} /
          </Link>
          <h1>
            {t(form.title)}
            <span className="ops-doc">{schema?.settings.forms?.[form.id]?.docCode || form.docCode}</span>
          </h1>
          <p>
            {total.toLocaleString()} {tx('records', 'سجل')}
            {query.deleted ? ` · ${tx('deleted', 'محذوفة')}` : ''}
          </p>
        </div>
        <div className="ops-actions">
          {may.import ? (
            <button type="button" className="ops-btn" onClick={() => setDialog('import')}>
              <Upload aria-hidden /> {tx('Import', 'استيراد')}
            </button>
          ) : null}
          {may.export ? (
          <div className="ops-dd">
            <button type="button" className="ops-btn" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(o => !o)} disabled={!!busy || !total}>
              <Download aria-hidden /> {tx('Export', 'تصدير')} <ChevronDown aria-hidden />
            </button>
            {exportOpen ? (
              <div className="ops-dd__panel" role="menu" style={{ width: 200, padding: 6 }}>
                <button type="button" role="menuitem" className="ops-btn ops-btn--ghost" style={{ justifyContent: 'flex-start' }} onClick={() => doExport('xlsx')}>
                  Excel (.xlsx)
                </button>
                <button type="button" role="menuitem" className="ops-btn ops-btn--ghost" style={{ justifyContent: 'flex-start' }} onClick={() => doExport('csv')}>
                  CSV (.csv)
                </button>
              </div>
            ) : null}
          </div>
          ) : null}
          {may.export ? (
            <button type="button" className="ops-btn" onClick={() => setDialog('report')} disabled={!total}>
              <FileBarChart2 aria-hidden /> {tx('Report', 'تقرير')}
            </button>
          ) : null}
          {may.create ? (
            <button type="button" className="ops-btn ops-btn--primary" onClick={() => setEditor({ id: null, nonce: Date.now() })}>
              <Plus aria-hidden /> {tx('New record', 'سجل جديد')}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="ops-alert" role="alert">
          {error}
        </div>
      ) : null}
      {busy ? <div className="ops-alert ops-alert--ok" role="status">{busy}</div> : null}

      <div className="ops-filters" role="search">
        <div className="ops-search">
          <Search aria-hidden />
          <input className="ops-input" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={tx('Search…', 'بحث…')} aria-label={tx('Search records', 'بحث في السجلات')} />
        </div>
        <select className="ops-input" value={preset} onChange={e => applyPreset(e.target.value as Preset)} aria-label={tx('Date range', 'نطاق التاريخ')}>
          <option value="all">{tx('All dates', 'كل التواريخ')}</option>
          <option value="today">{tx('Today', 'اليوم')}</option>
          <option value="week">{tx('This week', 'هذا الأسبوع')}</option>
          <option value="month">{tx('This month', 'هذا الشهر')}</option>
          <option value="last30">{tx('Last 30 days', 'آخر 30 يوماً')}</option>
          <option value="season">{tx('This season (Sep–Aug)', 'هذا الموسم (سبتمبر–أغسطس)')}</option>
          <option value="custom">{tx('Custom range…', 'نطاق مخصص…')}</option>
        </select>
        {preset === 'custom' ? (
          <>
            <input type="date" className="ops-input" value={query.from ?? ''} onChange={e => setQuery(q => ({ ...q, from: e.target.value || undefined, page: 1 }))} aria-label={tx('From', 'من')} />
            <input type="date" className="ops-input" value={query.to ?? ''} onChange={e => setQuery(q => ({ ...q, to: e.target.value || undefined, page: 1 }))} aria-label={tx('To', 'إلى')} />
          </>
        ) : null}
        {form.filters.map(key => (
          <FilterSelect
            key={key}
            label={form.fields.find(f => f.key === key)?.label[lang] ?? key}
            options={options[key] ?? []}
            selected={query.filters?.[key] ?? []}
            onChange={v => setFilter(key, v)}
            searchPlaceholder={tx('Search…', 'بحث…')}
            clearLabel={tx('Clear', 'مسح')}
          />
        ))}
        <div className="ops-dd">
          <button type="button" className="ops-btn" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(o => !o)} title={tx('Columns', 'الأعمدة')}>
            <Columns3 aria-hidden /> {tx('Columns', 'الأعمدة')}
          </button>
          {columnsOpen ? (
            <div className="ops-dd__panel">
              <div className="ops-dd__list" style={{ paddingTop: 6 }}>
                {form.fields.map(f => (
                  <label key={f.key} className="ops-dd__opt">
                    <input type="checkbox" checked={columns.includes(f.key)} onChange={() => setColumns(c => (c.includes(f.key) ? c.filter(x => x !== f.key) : form.fields.map(x => x.key).filter(k => k === f.key || c.includes(k))))} />
                    <span>{f.label[lang] || f.label.en}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" style={{ margin: 6 }} onClick={() => setColumns(defaultCols)}>
                {tx('Reset columns', 'إعادة الأعمدة')}
              </button>
            </div>
          ) : null}
        </div>
        {may.delete ? (
          <label className="ops-dd__opt" style={{ width: 'auto' }}>
            <input type="checkbox" checked={!!query.deleted} onChange={e => setQuery(q => ({ ...q, deleted: e.target.checked || undefined, page: 1 }))} />
            <Trash2 aria-hidden style={{ width: 14, height: 14 }} />
            <span>{tx('Deleted', 'المحذوفة')}</span>
          </label>
        ) : null}
        {hasFilters ? (
          <button
            type="button"
            className="ops-btn ops-btn--ghost"
            onClick={() => {
              setSearchText('')
              setPreset('all')
              setQuery(q => ({ sort: q.sort, dir: q.dir, page: 1, pageSize: q.pageSize, filters: {} }))
            }}
          >
            <X aria-hidden /> {tx('Clear filters', 'مسح الفلاتر')}
          </button>
        ) : null}
        {activeChips.length ? (
          <div className="ops-chip-row">
            {activeChips.map(c => (
              <span key={c.key} className="ops-chip">
                {c.label}
                <button type="button" onClick={c.clear} aria-label={`${tx('Remove filter', 'إزالة الفلتر')} ${c.label}`}>
                  <X aria-hidden style={{ width: 12, height: 12 }} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ops-tiles">
        {form.metrics.map((m, i) => (
          <div key={m.key + m.agg} className="ops-tile">
            <span>{m.label[lang] || m.label.en}</span>
            <strong>
              {formatNumber(totals[i] ?? null)}
              {m.unit && totals[i] != null ? <small style={{ fontSize: 12, fontWeight: 500 }}> {m.unit}</small> : null}
            </strong>
          </div>
        ))}
      </div>

      <div className="ops-table-card">
        <div className="ops-table-scroll">
          {rows.length ? (
            <table className="ops-table" aria-busy={loading}>
              <thead>
                <tr>
                  {visibleFields.map(f => {
                    const active = query.sort === f.key
                    return (
                      <th key={f.key} aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => sortBy(f.key)}>
                          {f.label[lang] || f.label.en}
                          {active ? query.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden /> : <ArrowUpDown aria-hidden style={{ opacity: 0.35 }} />}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.id}
                    className={flashId === r.id ? 'is-flash' : ''}
                    tabIndex={0}
                    onClick={() => setEditor({ id: r.id, nonce: Date.now() })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setEditor({ id: r.id, nonce: Date.now() })
                    }}
                    aria-label={`${tx('Open record', 'فتح السجل')} ${r.id}`}
                  >
                    {visibleFields.map(f => (
                      <td key={f.key} className={`${f.type === 'number' || f.type === 'integer' ? 'is-num' : ''}${isOut(f.key, r[f.key]) ? ' is-warn' : ''}`}>
                        {formatValue(f, r[f.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ops-empty">
              <Inbox aria-hidden />
              {loading ? (
                <span>{tx('Loading…', 'جارٍ التحميل…')}</span>
              ) : hasFilters ? (
                <span>{tx('No records match these filters.', 'لا توجد سجلات تطابق هذه الفلاتر.')}</span>
              ) : (
                <>
                  <strong>{tx('No records yet', 'لا توجد سجلات بعد')}</strong>
                  <span>{tx('Add the first record, or import your existing Excel file.', 'أضف أول سجل، أو استورد ملف Excel الحالي.')}</span>
                  <div className="ops-actions">
                    {may.import ? (
                      <button type="button" className="ops-btn" onClick={() => setDialog('import')}>
                        <Upload aria-hidden /> {tx('Import', 'استيراد')}
                      </button>
                    ) : null}
                    {may.create ? (
                      <button type="button" className="ops-btn ops-btn--primary" onClick={() => setEditor({ id: null, nonce: Date.now() })}>
                        <Plus aria-hidden /> {tx('New record', 'سجل جديد')}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="ops-table-foot">
          <span>
            {total ? `${((query.page! - 1) * query.pageSize! + 1).toLocaleString()}–${Math.min(total, query.page! * query.pageSize!).toLocaleString()} ${tx('of', 'من')} ${total.toLocaleString()}` : ''}
          </span>
          <span className="ops-pager">
            <select className="ops-input" value={query.pageSize} onChange={e => setQuery(q => ({ ...q, pageSize: Number(e.target.value), page: 1 }))} aria-label={tx('Rows per page', 'صفوف لكل صفحة')}>
              {PAGE_SIZES.map(n => (
                <option key={n} value={n}>
                  {n} / {tx('page', 'صفحة')}
                </option>
              ))}
            </select>
            <button type="button" className="ops-btn ops-btn--sm" disabled={query.page! <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page! - 1 }))}>
              {tx('Previous', 'السابق')}
            </button>
            <span>
              {query.page} / {pages}
            </span>
            <button type="button" className="ops-btn ops-btn--sm" disabled={query.page! >= pages} onClick={() => setQuery(q => ({ ...q, page: q.page! + 1 }))}>
              {tx('Next', 'التالي')}
            </button>
          </span>
        </div>
      </div>

      {editor ? (
        <RecordEditor
          key={`${editor.id ?? 'new'}-${editor.nonce}`}
          form={form}
          recordId={editor.id}
          initialValues={editor.initial}
          query={query}
          onClose={() => setEditor(null)}
          onSaved={(rec, mode) => {
            setFlashId(rec.id)
            void load()
            loadOptions()
            if (mode === 'save-new') void reloadSchema()
          }}
          onDeleted={() => {
            setEditor(null)
            void load()
          }}
          onNavigate={id => setEditor({ id, nonce: Date.now() })}
          onDuplicate={values => setEditor({ id: null, initial: values, nonce: Date.now() })}
        />
      ) : null}
      {dialog === 'import' ? (
        <ImportDialog
          form={form}
          onClose={() => setDialog(null)}
          onImported={() => {
            void load()
            loadOptions()
            void reloadSchema()
          }}
        />
      ) : null}
      {dialog === 'report' ? <ReportDialog form={form} query={query} onClose={() => setDialog(null)} /> : null}
    </div>
  )
}

export function useFlashReset(id: number | null, setId: (v: number | null) => void) {
  const ref = useRef<number | null>(null)
  useEffect(() => {
    if (id == null) return
    window.clearTimeout(ref.current ?? undefined)
    ref.current = window.setTimeout(() => setId(null), 1700)
  }, [id, setId])
}
