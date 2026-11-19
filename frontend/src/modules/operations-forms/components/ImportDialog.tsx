import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { opsApi, type OpsForm, type OpsImportResult } from '../api'
import { parseWorkbookFile, type ParsedWorkbook } from '../import/parseWorkbook'
import { formatValue, useOps, useOpsText } from '../opsContext'
import { OpsModal } from './OpsModal'

type Props = { form: OpsForm; onClose: () => void; onImported: () => void }

type Stage = 'pick' | 'reading' | 'preview' | 'importing' | 'done'

const CHUNK = 2000
const PREVIEW_ROWS = 60

export function ImportDialog({ form, onClose, onImported }: Props) {
  const { lang } = useOps()
  const tx = useOpsText()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null)
  const [check, setCheck] = useState<OpsImportResult | null>(null)
  const [result, setResult] = useState<OpsImportResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const errorsByRow = useMemo(() => new Map((check?.errors ?? []).map(e => [e.row, e.errors])), [check])
  const previewFields = useMemo(() => form.fields.filter(f => !f.computed && f.type !== 'textarea'), [form])

  const readFile = async (file: File) => {
    setError(null)
    setFileName(file.name)
    setStage('reading')
    try {
      const wb = await parseWorkbookFile(form, file)
      setParsed(wb)
      if (!wb.rows.length) {
        setStage('preview')
        setCheck(null)
        return
      }
      setCheck(await opsApi.importRows(form.id, wb.rows, `import:${file.name}`, true))
      setStage('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('pick')
    }
  }

  const runImport = async () => {
    if (!parsed) return
    setStage('importing')
    setProgress(0)
    const total: OpsImportResult = { received: 0, valid: 0, inserted: 0, duplicates: 0, invalid: 0, errors: [] }
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK)
        const r = await opsApi.importRows(form.id, chunk, `import:${fileName}`)
        total.received += r.received
        total.valid += r.valid
        total.inserted += r.inserted
        total.duplicates += r.duplicates
        total.invalid += r.invalid
        total.errors.push(...r.errors.map(e => ({ ...e, row: e.row + i })))
        setProgress(Math.min(1, (i + chunk.length) / parsed.rows.length))
      }
      setResult(total)
      setStage('done')
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(total)
      setStage('done')
      onImported()
    }
  }

  const steps = [tx('1. Choose file', '١. اختيار الملف'), tx('2. Check', '٢. المراجعة'), tx('3. Import', '٣. الاستيراد')]
  const stepIdx = stage === 'pick' || stage === 'reading' ? 0 : stage === 'preview' ? 1 : 2

  return (
    <OpsModal
      title={tx('Import records', 'استيراد السجلات')}
      subtitle={form.title[lang] || form.title.en}
      onClose={onClose}
      closeLabel={tx('Close', 'إغلاق')}
      footer={
        <div className="ops-actions">
          {stage === 'preview' ? (
            <>
              <button type="button" className="ops-btn" onClick={() => { setStage('pick'); setParsed(null); setCheck(null) }}>
                {tx('Choose another file', 'اختيار ملف آخر')}
              </button>
              <button type="button" className="ops-btn ops-btn--primary" onClick={runImport} disabled={!check?.valid}>
                <Upload aria-hidden /> {tx(`Import ${check?.valid.toLocaleString() ?? 0} records`, `استيراد ${check?.valid.toLocaleString() ?? 0} سجل`)}
              </button>
            </>
          ) : stage === 'done' ? (
            <button type="button" className="ops-btn ops-btn--primary" onClick={onClose}>
              {tx('Done', 'تم')}
            </button>
          ) : (
            <button type="button" className="ops-btn" onClick={onClose} disabled={stage === 'importing'}>
              {tx('Cancel', 'إلغاء')}
            </button>
          )}
        </div>
      }
    >
      <div className="ops-steps" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={i === stepIdx ? 'is-active' : ''}>
            {s}
          </span>
        ))}
      </div>
      {error ? <div className="ops-alert" role="alert">{error}</div> : null}

      {stage === 'pick' || stage === 'reading' ? (
        <>
          <div
            className={`ops-drop${over ? ' is-over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={e => {
              e.preventDefault()
              setOver(false)
              const f = e.dataTransfer.files[0]
              if (f) void readFile(f)
            }}
          >
            <FileSpreadsheet aria-hidden />
            {stage === 'reading' ? (
              <strong>{tx(`Reading ${fileName}…`, `قراءة ${fileName}…`)}</strong>
            ) : (
              <>
                <strong>{tx('Drop an Excel or CSV file here, or click to choose', 'أسقط ملف Excel أو CSV هنا، أو انقر للاختيار')}</strong>
                <span>{tx('Your existing workbooks work as they are — every sheet is checked and the header row is found automatically.', 'ملفاتك الحالية تعمل كما هي — تتم قراءة كل ورقة واكتشاف صف العناوين تلقائياً.')}</span>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void readFile(f)
            }}
          />
        </>
      ) : null}

      {stage === 'preview' && parsed ? (
        <>
          <div className="ops-tiles">
            <div className="ops-tile">
              <span>{tx('Rows found', 'الصفوف المكتشفة')}</span>
              <strong>{parsed.rows.length.toLocaleString()}</strong>
            </div>
            <div className="ops-tile">
              <span>{tx('Ready to import', 'جاهزة للاستيراد')}</span>
              <strong style={{ color: 'var(--ops-primary)' }}>{(check?.valid ?? 0).toLocaleString()}</strong>
            </div>
            <div className="ops-tile">
              <span>{tx('Already in the system', 'موجودة مسبقاً')}</span>
              <strong>{(check?.duplicates ?? 0).toLocaleString()}</strong>
            </div>
            <div className="ops-tile">
              <span>{tx('Need correction', 'تحتاج تصحيح')}</span>
              <strong style={{ color: check?.invalid ? 'var(--ops-danger)' : undefined }}>{(check?.invalid ?? 0).toLocaleString()}</strong>
            </div>
          </div>

          <h3 className="ops-section" style={{ margin: '4px 0 8px', fontSize: 12 }}>
            {tx('Sheets', 'الأوراق')}
          </h3>
          <ul className="ops-sheet-list">
            {parsed.sheets.map(s => (
              <li key={s.name} className={s.status === 'skipped' ? 'is-skipped' : ''}>
                <span>
                  <strong>{s.name}</strong>
                  {s.status === 'skipped' ? ` — ${s.reason}` : s.headerRow ? ` — ${tx('header row', 'صف العناوين')} ${s.headerRow}, ${s.mapped.length} ${tx('columns', 'أعمدة')}` : ''}
                </span>
                <span>{s.status === 'imported' ? `${s.rows.toLocaleString()} ${tx('rows', 'صف')}` : tx('skipped', 'تم تخطيها')}</span>
              </li>
            ))}
          </ul>

          {check?.errors.length ? (
            <div className="ops-alert ops-alert--warn" style={{ marginTop: 12 }}>
              <span>
                {tx(
                  `${check.invalid} row(s) have errors and will be skipped (highlighted in red below). Fix them in the file and import it again — rows already imported are recognised and not duplicated.`,
                  `${check.invalid} صف بها أخطاء وسيتم تخطيها (مظللة بالأحمر). صححها في الملف وأعد الاستيراد — السجلات المستوردة مسبقاً لن تتكرر.`,
                )}
              </span>
            </div>
          ) : null}

          {parsed.rows.length ? (
            <div className="ops-table-card" style={{ marginTop: 12 }}>
              <div className="ops-table-scroll" style={{ maxHeight: 320 }}>
                <table className="ops-table ops-preview">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" tabIndex={-1}>#</button>
                      </th>
                      {previewFields.map(f => (
                        <th key={f.key}>
                          <button type="button" tabIndex={-1}>{f.label[lang] || f.label.en}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRowsForPreview(parsed.rows.length, errorsByRow).map(i => {
                      const row = parsed.rows[i]!
                      const errs = errorsByRow.get(i)
                      return (
                        <tr key={i} style={{ cursor: 'default' }}>
                          <td>{i + 1}</td>
                          {previewFields.map(f => (
                            <td key={f.key} className={errs?.[f.key] ? 'is-error' : ''} title={errs?.[f.key]}>
                              {formatValue(f, row[f.key])}
                              {errs?.[f.key] ? ` ⚠ ${errs[f.key]}` : ''}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ops-table-foot">
                {tx('Rows with errors are listed first.', 'الصفوف التي بها أخطاء تظهر أولاً.')} {tx(`Showing ${Math.min(PREVIEW_ROWS, parsed.rows.length)} of ${parsed.rows.length.toLocaleString()}.`, `عرض ${Math.min(PREVIEW_ROWS, parsed.rows.length)} من ${parsed.rows.length.toLocaleString()}.`)}
              </div>
            </div>
          ) : (
            <div className="ops-alert" style={{ marginTop: 12 }}>
              {tx('No records were found in this file for this form. Check that it is the right form.', 'لم يتم العثور على سجلات لهذه الاستمارة في الملف. تأكد أنه الملف الصحيح.')}
            </div>
          )}
        </>
      ) : null}

      {stage === 'importing' ? (
        <div style={{ display: 'grid', gap: 10, padding: '30px 0' }}>
          <strong>{tx('Importing…', 'جارٍ الاستيراد…')} {Math.round(progress * 100)}%</strong>
          <div className="ops-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : null}

      {stage === 'done' && result ? (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', padding: '24px 0', textAlign: 'center' }}>
          <CheckCircle2 aria-hidden style={{ width: 44, height: 44, color: 'var(--ops-primary)' }} />
          <strong style={{ fontSize: 16 }}>{tx(`${result.inserted.toLocaleString()} records imported`, `تم استيراد ${result.inserted.toLocaleString()} سجل`)}</strong>
          <span className="ops-field__hint">
            {tx(`${result.duplicates.toLocaleString()} already existed · ${result.invalid.toLocaleString()} skipped with errors`, `${result.duplicates.toLocaleString()} موجودة مسبقاً · ${result.invalid.toLocaleString()} تم تخطيها بسبب أخطاء`)}
          </span>
        </div>
      ) : null}
    </OpsModal>
  )
}

/** Rows with errors first, then the start of the file. */
function orderRowsForPreview(count: number, errors: Map<number, unknown>): number[] {
  const withErrors = [...errors.keys()].sort((a, b) => a - b)
  const out = withErrors.slice(0, PREVIEW_ROWS)
  for (let i = 0; i < count && out.length < PREVIEW_ROWS; i++) if (!errors.has(i)) out.push(i)
  return out
}
