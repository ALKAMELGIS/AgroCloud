import { CalendarRange, FileDown, FileSpreadsheet, FileText, Grid3x3, LayoutList, ListTree } from 'lucide-react'
import { useState } from 'react'

import { readCurrentUser } from '@/core/auth/auth'
import type { OpsForm, OpsQuery } from '../api'
import { useOps, useOpsText } from '../opsContext'
import { buildReportModel, describeFilters, type ReportKind, type ReportPeriod } from '../reports/reportModel'
import { downloadBlob, renderDocx, renderPdf, renderXlsx } from '../reports/renderers'
import { OpsModal } from './OpsModal'

type Props = { form: OpsForm; query: OpsQuery; onClose: () => void }

type Format = 'pdf' | 'xlsx' | 'docx'

const STORE_KEY = 'agro-ops-report-options'

function readStored(): Partial<{ kind: ReportKind; period: ReportPeriod; format: Format; includeDetail: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function ReportDialog({ form, query, onClose }: Props) {
  const { schema, lang } = useOps()
  const tx = useOpsText()
  const stored = readStored()
  const [kind, setKind] = useState<ReportKind>(stored.kind ?? 'summary')
  const [dimension, setDimension] = useState(form.dimensions[0] ?? '')
  const [period, setPeriod] = useState<ReportPeriod>(stored.period ?? 'month')
  const [format, setFormat] = useState<Format>(stored.format ?? 'pdf')
  const [includeDetail, setIncludeDetail] = useState(stored.includeDetail ?? false)
  const [reportLang, setReportLang] = useState<'en' | 'ar'>(lang)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kinds: { id: ReportKind; icon: typeof LayoutList; title: string; hint: string }[] = [
    { id: 'summary', icon: ListTree, title: tx('Summary', 'ملخص'), hint: tx('Totals by a field', 'إجماليات حسب حقل') },
    { id: 'period', icon: CalendarRange, title: tx('By period', 'حسب الفترة'), hint: tx('Day / week / month', 'يوم / أسبوع / شهر') },
    { id: 'matrix', icon: Grid3x3, title: tx('Period × field', 'فترة × حقل'), hint: tx('e.g. kg per crop per week', 'مثال: كغ لكل محصول أسبوعياً') },
    { id: 'detail', icon: LayoutList, title: tx('Detailed list', 'قائمة تفصيلية'), hint: tx('Every record', 'كل السجلات') },
  ]
  const formats: { id: Format; icon: typeof FileText; title: string }[] = [
    { id: 'pdf', icon: FileText, title: 'PDF' },
    { id: 'xlsx', icon: FileSpreadsheet, title: 'Excel' },
    { id: 'docx', icon: FileDown, title: 'Word' },
  ]

  const generate = async () => {
    setError(null)
    setBusy(tx('Preparing…', 'جارٍ التحضير…'))
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ kind, period, format, includeDetail }))
    } catch {
      /* ignore */
    }
    try {
      const user = readCurrentUser() as { name?: string; email?: string } | null
      const model = await buildReportModel(form, query, { kind, dimension, period, includeDetail, lang: format === 'pdf' ? 'en' : reportLang }, schema!.settings, user?.name || user?.email || '', setBusy)
      setBusy(tx('Building the file…', 'جارٍ إنشاء الملف…'))
      const blob = format === 'pdf' ? await renderPdf(model) : format === 'xlsx' ? await renderXlsx(model) : await renderDocx(model)
      downloadBlob(blob, `${model.fileBase}.${format}`)
      setBusy(null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  return (
    <OpsModal
      title={tx('Generate report', 'إنشاء تقرير')}
      subtitle={`${form.title[lang] || form.title.en} · ${describeFilters(form, query, lang)}`}
      onClose={onClose}
      closeLabel={tx('Close', 'إغلاق')}
      footer={
        <>
          <span className="ops-field__hint">{busy ?? tx('The report follows the filters on the page.', 'التقرير يتبع الفلاتر المحددة في الصفحة.')}</span>
          <div className="ops-actions">
            <button type="button" className="ops-btn" onClick={onClose} disabled={!!busy}>
              {tx('Cancel', 'إلغاء')}
            </button>
            <button type="button" className="ops-btn ops-btn--primary" onClick={generate} disabled={!!busy}>
              <FileDown aria-hidden /> {tx(`Download ${format.toUpperCase()}`, `تنزيل ${format.toUpperCase()}`)}
            </button>
          </div>
        </>
      }
    >
      {error ? <div className="ops-alert" role="alert">{error}</div> : null}
      <section className="ops-section">
        <h3>{tx('Report type', 'نوع التقرير')}</h3>
        <div className="ops-choice-row" role="radiogroup" aria-label={tx('Report type', 'نوع التقرير')}>
          {kinds.map(k => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`ops-choice${kind === k.id ? ' is-active' : ''}`} onClick={() => setKind(k.id)}>
              <k.icon aria-hidden />
              <span>
                <strong>{k.title}</strong>
                <small>{k.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="ops-section">
        <h3>{tx('Grouping', 'التجميع')}</h3>
        <div className="ops-grid">
          {kind === 'summary' || kind === 'matrix' ? (
            <div className="ops-field">
              <label htmlFor="ops-rep-dim">{tx('Group by field', 'التجميع حسب الحقل')}</label>
              <select id="ops-rep-dim" className="ops-input" value={dimension} onChange={e => setDimension(e.target.value)}>
                {form.dimensions.map(d => (
                  <option key={d} value={d}>
                    {form.fields.find(f => f.key === d)?.label[lang] ?? d}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === 'period' || kind === 'matrix' ? (
            <div className="ops-field">
              <label htmlFor="ops-rep-period">{tx('Period', 'الفترة')}</label>
              <select id="ops-rep-period" className="ops-input" value={period} onChange={e => setPeriod(e.target.value as ReportPeriod)}>
                <option value="day">{tx('Daily', 'يومي')}</option>
                <option value="week">{tx('Weekly', 'أسبوعي')}</option>
                <option value="month">{tx('Monthly', 'شهري')}</option>
                <option value="year">{tx('Yearly', 'سنوي')}</option>
              </select>
            </div>
          ) : null}
          {kind !== 'detail' ? (
            <label className="ops-dd__opt" style={{ alignSelf: 'end' }}>
              <input type="checkbox" checked={includeDetail} onChange={e => setIncludeDetail(e.target.checked)} />
              <span>{tx('Add the detailed records', 'إضافة السجلات التفصيلية')}</span>
            </label>
          ) : null}
        </div>
      </section>

      <section className="ops-section">
        <h3>{tx('Format', 'الصيغة')}</h3>
        <div className="ops-choice-row" role="radiogroup" aria-label={tx('Format', 'الصيغة')}>
          {formats.map(f => (
            <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`ops-choice${format === f.id ? ' is-active' : ''}`} onClick={() => setFormat(f.id)}>
              <f.icon aria-hidden />
              <strong>{f.title}</strong>
            </button>
          ))}
        </div>
        {format !== 'pdf' ? (
          <div className="ops-field" style={{ marginTop: 10, maxWidth: 260 }}>
            <label htmlFor="ops-rep-lang">{tx('Report language', 'لغة التقرير')}</label>
            <select id="ops-rep-lang" className="ops-input" value={reportLang} onChange={e => setReportLang(e.target.value as 'en' | 'ar')}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        ) : (
          <p className="ops-field__hint" style={{ marginTop: 8 }}>
            {tx('PDF reports are in English; Excel and Word can be in Arabic.', 'تقارير PDF باللغة الإنجليزية؛ ويمكن إصدار Excel وWord بالعربية.')}
          </p>
        )}
      </section>
    </OpsModal>
  )
}
