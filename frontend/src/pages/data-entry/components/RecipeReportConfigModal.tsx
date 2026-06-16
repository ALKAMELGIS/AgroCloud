import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { appAlert } from '../../../lib/appDialog'
import type { RecipeColumn } from '../../../lib/formFieldColumns'
import type { RecipeRow } from '../../../lib/recipeReport/loadRecipeRows'
import '../recipe-report-modal.css'

export type RecipeReportConfigPayload = {
  columns: RecipeColumn[]
  rows: RecipeRow[]
  periodLabel: string
}

type Copy = {
  title: string
  subtitle: string
  period: string
  start: string
  end: string
  leaveEmpty: string
  columns: string
  selectAll: string
  clearAll: string
  matchingRows: string
  noRows: string
  cancel: string
  generate: string
  generating: string
  needColumn: string
}

const strings = (lang: 'en' | 'ar'): Copy =>
  lang === 'ar'
    ? {
        title: 'إعداد التقرير',
        subtitle: 'اختر فترة التاريخ والحقول، ثم أنشئ ملخصاً من صفحة واحدة (A4) يتضمن جدولاً ومجاميع ومتوسطات ونسباً وتحليلاً مختصراً.',
        period: 'فترة التاريخ',
        start: 'بداية',
        end: 'نهاية',
        leaveEmpty: 'اترك الحقلين فارغين لتضمين كل التواريخ المتاحة.',
        columns: 'حقول البيانات في التقرير',
        selectAll: 'تحديد الكل',
        clearAll: 'إلغاء الكل',
        matchingRows: 'صفوف ضمن الفترة',
        noRows: 'لا توجد صفوف مطابقة لهذه الفترة. عدّل التواريخ أو امسحها.',
        cancel: 'إلغاء',
        generate: 'إنشاء PDF',
        generating: 'جاري إنشاء PDF…',
        needColumn: 'فعّل حقلاً واحداً على الأقل.',
      }
    : {
        title: 'Report setup',
        subtitle:
          'Choose a date range and which saved columns to include. The PDF is a concise A4 summary with a tidy table, totals, averages, percentages, and a short data-driven interpretation.',
        period: 'Date range',
        start: 'Start',
        end: 'End',
        leaveEmpty: 'Leave both dates empty to include all available timestamps.',
        columns: 'Data fields in the report',
        selectAll: 'Select all',
        clearAll: 'Clear all',
        matchingRows: 'Rows in range',
        noRows: 'No rows match this range. Adjust or clear the dates.',
        cancel: 'Cancel',
        generate: 'Create PDF',
        generating: 'Creating PDF…',
        needColumn: 'Select at least one field.',
      }

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(ymd: string): Date | null {
  const t = ymd.trim()
  if (!t) return null
  const [y, m, d] = t.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function parseRecipeRowDate(row: RecipeRow): Date | null {
  const raw = String(row.tsUtc ?? '').trim()
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  for (const v of Object.values(row.cells)) {
    const s = String(v ?? '').trim()
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) {
      const d = new Date(m[1])
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return null
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function filterRowsByRange(rows: RecipeRow[], startYmd: string, endYmd: string): RecipeRow[] {
  const start = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  const hasStart = Boolean(start)
  const hasEnd = Boolean(end)
  if (!hasStart && !hasEnd) return rows

  const startDay = start ? startOfLocalDay(start) : null
  const endDay = end ? endOfLocalDay(end) : null

  return rows.filter((r) => {
    const rd = parseRecipeRowDate(r)
    if (!rd) return false
    const day = startOfLocalDay(rd)
    if (startDay && day < startDay) return false
    if (endDay && day > endDay) return false
    return true
  })
}

function periodLabelFromInputs(lang: 'en' | 'ar', startYmd: string, endYmd: string): string {
  const a = startYmd.trim()
  const b = endYmd.trim()
  if (!a && !b) return lang === 'ar' ? 'كل الفترات' : 'All dates'
  if (a && b) return lang === 'ar' ? `${a} → ${b}` : `${a} – ${b}`
  if (a) return lang === 'ar' ? `من ${a}` : `From ${a}`
  return lang === 'ar' ? `حتى ${b}` : `Through ${b}`
}

type Props = {
  open: boolean
  onClose: () => void
  columns: RecipeColumn[]
  rows: RecipeRow[]
  uiLang: 'en' | 'ar'
  busy: boolean
  onConfirm: (payload: RecipeReportConfigPayload) => Promise<void>
}

export function RecipeReportConfigModal({ open, onClose, columns, rows, uiLang, busy, onConfirm }: Props) {
  const t = useMemo(() => strings(uiLang), [uiLang])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const bounds = useMemo(() => {
    let min: Date | null = null
    let max: Date | null = null
    for (const r of rows) {
      const d = parseRecipeRowDate(r)
      if (!d) continue
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
    return { min, max }
  }, [rows])

  useEffect(() => {
    if (!open) return
    setStartDate(bounds.min ? toYmd(bounds.min) : '')
    setEndDate(bounds.max ? toYmd(bounds.max) : '')
    setSelectedIds(new Set(columns.map((c) => c.id)))
  }, [open, bounds.min, bounds.max, columns])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const filteredRows = useMemo(() => filterRowsByRange(rows, startDate, endDate), [rows, startDate, endDate])

  const selectedColumns = useMemo(
    () => columns.filter((c) => selectedIds.has(c.id)),
    [columns, selectedIds],
  )

  const toggleCol = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(columns.map((c) => c.id)))
  }, [columns])

  const clearAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleSubmit = useCallback(async () => {
    if (selectedColumns.length === 0) {
      await appAlert(t.needColumn, { title: t.title })
      return
    }
    if (filteredRows.length === 0) {
      await appAlert(t.noRows, { title: t.title })
      return
    }
    await onConfirm({
      columns: selectedColumns,
      rows: filteredRows,
      periodLabel: periodLabelFromInputs(uiLang, startDate, endDate),
    })
  }, [filteredRows, onConfirm, selectedColumns, startDate, endDate, t, uiLang])

  if (!open) return null

  const modal = (
    <div
      className="recipe-report-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="recipe-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-report-modal-title"
        dir={uiLang === 'ar' ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recipe-report-modal__brand-strip" aria-hidden />
        <div className="recipe-report-modal__head">
          <div>
            <h2 id="recipe-report-modal-title" className="recipe-report-modal__title">
              {t.title}
            </h2>
            <p className="recipe-report-modal__subtitle">{t.subtitle}</p>
          </div>
          <button type="button" className="recipe-report-modal__close" onClick={() => !busy && onClose()} aria-label={t.cancel}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>

        <div className="recipe-report-modal__body">
          <section className="recipe-report-modal__section" aria-label={t.period}>
            <div className="recipe-report-modal__label">{t.period}</div>
            <div className="recipe-report-modal__dates">
              <label className="recipe-report-modal__field">
                <span>{t.start}</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
              </label>
              <label className="recipe-report-modal__field">
                <span>{t.end}</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy} />
              </label>
            </div>
            <p className="recipe-report-modal__hint">{t.leaveEmpty}</p>
            <div className="recipe-report-modal__meta">
              {t.matchingRows}: <strong>{filteredRows.length}</strong>
            </div>
          </section>

          <section className="recipe-report-modal__section" aria-label={t.columns}>
            <div className="recipe-report-modal__rowhead">
              <div className="recipe-report-modal__label">{t.columns}</div>
              <div className="recipe-report-modal__colactions">
                <button type="button" className="recipe-report-modal__linkish" onClick={selectAll} disabled={busy}>
                  {t.selectAll}
                </button>
                <button type="button" className="recipe-report-modal__linkish" onClick={clearAll} disabled={busy}>
                  {t.clearAll}
                </button>
              </div>
            </div>
            <div className="recipe-report-modal__chips">
              {columns.map((col) => {
                const on = selectedIds.has(col.id)
                return (
                  <label key={col.id} className={`recipe-report-modal__chip${on ? ' recipe-report-modal__chip--on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleCol(col.id)} disabled={busy} />
                    <span>{col.header.replace(/_/g, ' ')}</span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        <div className="recipe-report-modal__foot">
          <button type="button" className="recipe-report-modal__btn recipe-report-modal__btn--ghost" onClick={() => !busy && onClose()} disabled={busy}>
            {t.cancel}
          </button>
          <button type="button" className="recipe-report-modal__btn recipe-report-modal__btn--primary" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
            <span>{busy ? t.generating : t.generate}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
