/**
 * Report model shared by the PDF, Excel and Word renderers: header (company, document code,
 * filters), total tiles and tables built from the server's aggregation + records.
 */
import { fetchAllRecords, opsApi, type OpsAggregate, type OpsForm, type OpsQuery, type OpsRecord, type OpsSettings } from '../api'

export type ReportKind = 'summary' | 'period' | 'matrix' | 'detail'
export type ReportPeriod = 'day' | 'week' | 'month' | 'year'

export type ReportOptions = {
  kind: ReportKind
  dimension: string
  period: ReportPeriod
  includeDetail: boolean
  lang: 'en' | 'ar'
}

export type ReportCell = string | number | null
export type ReportTable = {
  title: string
  columns: { label: string; numeric?: boolean }[]
  rows: ReportCell[][]
  totalRow?: ReportCell[]
}

export type ReportModel = {
  fileBase: string
  company: string
  issue: string
  docCode: string
  docTitle: string
  title: string
  filterText: string
  generatedAt: string
  generatedBy: string
  totals: { label: string; value: string }[]
  tables: ReportTable[]
  rtl: boolean
}

const PERIOD_LABEL: Record<ReportPeriod, { en: string; ar: string }> = {
  day: { en: 'Day', ar: 'اليوم' },
  week: { en: 'Week', ar: 'الأسبوع' },
  month: { en: 'Month', ar: 'الشهر' },
  year: { en: 'Year', ar: 'السنة' },
}

const fmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v)

function label(form: OpsForm, key: string, lang: 'en' | 'ar') {
  const f = form.fields.find(x => x.key === key)
  return f ? f.label[lang] || f.label.en : key
}

export function describeFilters(form: OpsForm, q: OpsQuery, lang: 'en' | 'ar'): string {
  const parts: string[] = []
  if (q.from || q.to) parts.push(`${lang === 'ar' ? 'الفترة' : 'Period'}: ${q.from ?? '…'} → ${q.to ?? '…'}`)
  for (const [k, vals] of Object.entries(q.filters ?? {})) if (vals.length) parts.push(`${label(form, k, lang)}: ${vals.join(', ')}`)
  if (q.q) parts.push(`${lang === 'ar' ? 'بحث' : 'Search'}: "${q.q}"`)
  return parts.length ? parts.join(' · ') : lang === 'ar' ? 'كل السجلات' : 'All records'
}

function metricLabel(m: OpsAggregate['metrics'][number], lang: 'en' | 'ar') {
  return m.label[lang] || m.label.en
}

function aggregateTable(title: string, agg: OpsAggregate, keyLabels: string[], lang: 'en' | 'ar', grand: OpsAggregate): ReportTable {
  const columns = [...keyLabels.map(l => ({ label: l })), ...agg.metrics.map(m => ({ label: metricLabel(m, lang), numeric: true }))]
  const rows = agg.rows.map(r => [...r.keys.map(k => k ?? '—'), ...r.values.map(v => (v == null ? null : Math.round(v * 100) / 100))])
  const g = grand.rows[0]?.values ?? []
  const totalRow = [lang === 'ar' ? 'الإجمالي' : 'Total', ...keyLabels.slice(1).map(() => ''), ...g.map(v => (v == null ? null : Math.round(v * 100) / 100))]
  return { title, columns, rows, totalRow }
}

/** Period × dimension matrix for the first metric (e.g. kg per crop per week). */
function matrixTable(form: OpsForm, agg: OpsAggregate, periodLabel: string, dimLabel: string, lang: 'en' | 'ar'): ReportTable {
  const periods = [...new Set(agg.rows.map(r => String(r.keys[0])))].sort()
  const dims = [...new Set(agg.rows.map(r => String(r.keys[1])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const metric = agg.metrics[0]!
  const cell = new Map(agg.rows.map(r => [`${r.keys[0]}|${r.keys[1]}`, r.values[0] ?? 0]))
  const rows = periods.map(p => {
    const vals = dims.map(d => cell.get(`${p}|${d}`) ?? 0)
    return [p, ...vals.map(v => Math.round(v * 100) / 100), Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100]
  })
  const colTotals = dims.map(d => periods.reduce((s, p) => s + (cell.get(`${p}|${d}`) ?? 0), 0))
  return {
    title: `${metricLabel(metric, lang)} — ${periodLabel} × ${dimLabel}`,
    columns: [{ label: periodLabel }, ...dims.map(d => ({ label: d, numeric: true })), { label: lang === 'ar' ? 'الإجمالي' : 'Total', numeric: true }],
    rows,
    totalRow: [lang === 'ar' ? 'الإجمالي' : 'Total', ...colTotals.map(v => Math.round(v * 100) / 100), Math.round(colTotals.reduce((a, b) => a + b, 0) * 100) / 100],
  }
}

function detailTable(form: OpsForm, rows: OpsRecord[], lang: 'en' | 'ar'): ReportTable {
  const fields = form.fields.filter(f => f.type !== 'textarea')
  return {
    title: lang === 'ar' ? `السجلات (${rows.length})` : `Records (${rows.length})`,
    columns: fields.map(f => ({ label: f.label[lang] || f.label.en, numeric: f.type === 'number' || f.type === 'integer' })),
    rows: rows.map(r => fields.map(f => (r[f.key] ?? null) as ReportCell)),
  }
}

export const DETAIL_ROW_LIMIT = 20000

export async function buildReportModel(
  form: OpsForm,
  query: OpsQuery,
  options: ReportOptions,
  settings: OpsSettings,
  user: string,
  onProgress?: (text: string) => void,
): Promise<ReportModel> {
  const { lang } = options
  const base = { ...query, page: undefined, pageSize: undefined }
  onProgress?.(lang === 'ar' ? 'حساب الإجماليات…' : 'Calculating totals…')
  const grand = await opsApi.aggregate(form.id, base)
  const tables: ReportTable[] = []
  const dimLabel = label(form, options.dimension, lang)
  const periodLabel = PERIOD_LABEL[options.period][lang]

  if (options.kind === 'summary') {
    const agg = await opsApi.aggregate(form.id, { ...base, groupBy: options.dimension })
    tables.push(aggregateTable(`${lang === 'ar' ? 'حسب' : 'By'} ${dimLabel}`, agg, [dimLabel], lang, grand))
  } else if (options.kind === 'period') {
    const agg = await opsApi.aggregate(form.id, { ...base, groupBy: options.period })
    tables.push(aggregateTable(`${lang === 'ar' ? 'حسب' : 'By'} ${periodLabel}`, agg, [periodLabel], lang, grand))
  } else if (options.kind === 'matrix') {
    const agg = await opsApi.aggregate(form.id, { ...base, groupBy: options.period, groupBy2: options.dimension })
    tables.push(matrixTable(form, agg, periodLabel, dimLabel, lang))
    const byDim = await opsApi.aggregate(form.id, { ...base, groupBy: options.dimension })
    tables.push(aggregateTable(`${lang === 'ar' ? 'حسب' : 'By'} ${dimLabel}`, byDim, [dimLabel], lang, grand))
  }

  if (options.kind === 'detail' || options.includeDetail) {
    onProgress?.(lang === 'ar' ? 'تحميل السجلات…' : 'Loading records…')
    const rows = await fetchAllRecords(form.id, { ...base, sort: form.dateField, dir: 'asc' }, (done, total) =>
      onProgress?.(`${lang === 'ar' ? 'تحميل السجلات' : 'Loading records'} ${done.toLocaleString()} / ${total.toLocaleString()}`),
    )
    tables.push(detailTable(form, rows.slice(0, DETAIL_ROW_LIMIT), lang))
  }

  const g = grand.rows[0]?.values ?? []
  const docOverride = settings.forms?.[form.id] ?? {}
  const now = new Date()
  return {
    fileBase: `${form.id}-${options.kind}-${now.toISOString().slice(0, 10)}`,
    company: settings.company.name,
    issue: settings.company.issue,
    docCode: docOverride.docCode || form.docCode,
    docTitle: docOverride.docTitle || form.docTitle,
    title: form.title[lang] || form.title.en,
    filterText: describeFilters(form, query, lang),
    generatedAt: now.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB'),
    generatedBy: user,
    totals: grand.metrics.map((m, i) => ({ label: metricLabel(m, lang), value: `${fmt(g[i] ?? null)}${m.unit ? ` ${m.unit}` : ''}` })),
    tables,
    rtl: lang === 'ar',
  }
}
