import { useCallback, useEffect, useMemo, useState } from 'react'
import { appAlert } from '../../lib/appDialog'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import { generateRecipeReportPdf } from '../../lib/recipeReport/generateRecipeReportPdf'
import { loadRecipeRows, rowsToCsv } from '../../lib/recipeReport/loadRecipeRows'
import { getRecipeColumnsForForm } from '../../lib/formFieldColumns'
import { WorkflowHeroStepper } from './components/WorkflowHeroStepper'
import { RecipeReportConfigModal, type RecipeReportConfigPayload } from './components/RecipeReportConfigModal'
import { getWorkflowShellMeta, stepLabels } from './workflowMeta'
import './EC.css'
import './recipes.css'

const SLUG_TO_FORM_KEY: Record<string, string> = {
  'ec-ph': 'EC',
  irrigation: 'Irrigation',
  harvest: 'Harvest',
  production: 'Production',
  qhis: 'QHIS',
  fertigation: 'Fertigation',
}

const SLUG_TO_ENTRY_PATH: Record<string, string> = {
  'ec-ph': '/data/ec-ph',
  irrigation: '/data/irrigation',
  harvest: '/data/harvest',
  production: '/data/production',
  qhis: '/data/qhis',
  fertigation: '/data/irrigation',
}

const DB_NAME = 'GisMapStore'
const STORE_NAME = 'layers'

const copy = (lang: 'en' | 'ar') => {
  const en = {
    recipes: 'Recipes',
    stepDataEntry: 'Data Entry',
    stepRecipes: 'Recipes',
    subtitle: 'Columns match the primary fields enabled for this workflow in Master Data → Data Management.',
    cardHint: 'No recipe rows saved yet.',
    emptyConfigured: 'No fields are configured yet for this workflow. Choose layers and fields in Settings, then return here.',
    emptyPlaceholder: 'Saved recipe rows will appear here once linked to your publishing workflow.',
    back: '← Back to data entry',
    exportData: 'Export Data',
    generateReport: 'Generate Report',
    autoRefreshOn: 'Auto-refresh ON',
    autoRefreshOff: 'Auto-refresh OFF',
    recycleBin: 'Recycle Bin',
    actions: 'Actions',
    invalid: 'Unknown workflow.',
    reportSoon: 'Report builder coming soon.',
    binSoon: 'Recycle bin coming soon.',
    exportSoon: 'Export coming soon.',
  }
  const ar: typeof en = {
    ...en,
    recipes: 'الوصفات',
    stepDataEntry: 'إدخال البيانات',
    stepRecipes: 'الوصفات',
    subtitle: 'الأعمدة تطابق الحقول الأساسية المفعّلة لهذا النموذج من البيانات الرئيسية ← إدارة البيانات.',
    cardHint: 'لا توجد صفوف محفوظة بعد.',
    emptyConfigured: 'لم يُضبط حقول لهذا النموذج بعد. اختر الطبقات والحقول من الإعدادات ثم عد إلى هنا.',
    emptyPlaceholder: 'ستظهر صفوف الوصفات المحفوظة هنا عند ربطها بسير النشر.',
    back: '← العودة إلى إدخال البيانات',
    exportData: 'تصدير البيانات',
    generateReport: 'إنشاء تقرير',
    autoRefreshOn: 'تحديث تلقائي تشغيل',
    autoRefreshOff: 'تحديث تلقائي إيقاف',
    recycleBin: 'سلة المحذوفات',
    actions: 'إجراءات',
    invalid: 'مسار غير معروف.',
    reportSoon: 'مُنشئ التقارير قريباً.',
    binSoon: 'سلة المحذوفات قريباً.',
    exportSoon: 'التصدير قريباً.',
  }
  return lang === 'ar' ? ar : en
}

export default function Recipes() {
  const navigate = useNavigate()
  const { formSlug = '' } = useParams<{ formSlug: string }>()
  const { language } = useLanguage()
  const uiLang = language === 'ar' ? 'ar' : 'en'
  const c = useMemo(() => copy(uiLang), [uiLang])

  const formKey = SLUG_TO_FORM_KEY[formSlug]
  const backPath = SLUG_TO_ENTRY_PATH[formSlug]

  const [layerNameById, setLayerNameById] = useState<Record<string, string>>({})
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [recycleBinCount] = useState(0)
  const [bindingsTick, setBindingsTick] = useState(0)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => setBindingsTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 1)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get('savedLayers')
        const layers = await new Promise<any[]>((resolve) => {
          req.onsuccess = () => resolve(req.result || [])
          req.onerror = () => resolve([])
        })
        if (cancelled) return
        const next: Record<string, string> = {}
        ;(Array.isArray(layers) ? layers : []).forEach((l: any) => {
          const id = String(l?.id ?? '').trim()
          const name = String(l?.name ?? '').trim()
          if (id && name) next[id] = name
        })
        setLayerNameById(next)
      } catch {
        if (!cancelled) setLayerNameById({})
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const columns = useMemo(
    () => (formKey ? getRecipeColumnsForForm(formKey, layerNameById) : []),
    [formKey, layerNameById, bindingsTick],
  )

  const reportTitleEn = useMemo(() => {
    if (!formSlug || !formKey) return ''
    return getWorkflowShellMeta(formSlug, 'en').title
  }, [formSlug, formKey])

  const recipeRows = useMemo(() => loadRecipeRows(formKey ?? '', columns), [formKey, columns, bindingsTick])

  const runGenerateReport = useCallback(
    async (payload: RecipeReportConfigPayload) => {
      if (!formKey) return
      setReportBusy(true)
      try {
        await generateRecipeReportPdf({
          workflowTitle: reportTitleEn || formSlug.replace(/-/g, ' '),
          formSlug,
          columns: payload.columns,
          rows: payload.rows,
          periodLabel: payload.periodLabel,
          reportLang: uiLang,
        })
        setReportModalOpen(false)
      } catch (err) {
        try {
          console.error('[Recipes report]', err)
        } catch {
        }
        await appAlert(
          typeof err === 'object' && err && typeof (err as Error).message === 'string'
            ? (err as Error).message
            : 'Could not generate the PDF report.',
          { title: 'Report error' },
        )
      } finally {
        setReportBusy(false)
      }
    },
    [formKey, formSlug, reportTitleEn, uiLang],
  )

  const runExportCsv = useCallback(() => {
    if (!columns.length) return
    const csv = rowsToCsv(columns, recipeRows)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recipes-${formSlug}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [columns, formSlug, recipeRows])

  if (!formSlug || !formKey || !backPath) {
    return (
      <div className="workflow-shell-page recipes-page">
        <div className="recipes-inner">
          <p style={{ color: '#64748b', fontWeight: 700 }}>{c.invalid}</p>
          <Link to="/">Home</Link>
        </div>
      </div>
    )
  }

  const emptyPrimary = columns.length === 0
  const hero = getWorkflowShellMeta(formSlug, uiLang)
  const steps = stepLabels(uiLang)

  return (
    <div className="workflow-shell-page recipes-page" dir={uiLang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="recipes-inner ec-animate-in">
        <WorkflowHeroStepper
          phase="recipes"
          iconClass={hero.iconClass}
          title={hero.title}
          tagline={hero.tagline}
          dataEntryPath={backPath}
          recipesPath={`/data/recipes/${formSlug}`}
          labelDataEntry={steps.dataEntry}
          labelRecipes={steps.recipes}
        />

        <div className="recipes-card">
          <div className="recipes-card__head">
            <div className="recipes-card__lead">
              <div className="recipes-card__title-row">
                <i className="fa-solid fa-list-ul" aria-hidden />
                <h2 className="recipes-card__title">{c.recipes}</h2>
              </div>
              <p className="recipes-card__hint">{c.cardHint}</p>
              <p className="recipes-card__subtitle">{c.subtitle}</p>
            </div>
            <div className="recipes-toolbar recipes-toolbar--tools" role="toolbar" aria-label="Recipe table actions">
              <button
                type="button"
                className="recipes-tool-btn recipes-tool-btn--report"
                disabled={reportBusy || emptyPrimary}
                title={emptyPrimary ? c.emptyConfigured : c.generateReport}
                onClick={() => !emptyPrimary && setReportModalOpen(true)}
              >
                <i className="fa-solid fa-chart-pie" aria-hidden />
                <span>{c.generateReport}</span>
              </button>
              <button
                type="button"
                className={`recipes-tool-btn${autoRefresh ? ' recipes-tool-btn--on' : ''}`}
                onClick={() => setAutoRefresh(v => !v)}
                title={autoRefresh ? c.autoRefreshOn : c.autoRefreshOff}
              >
                <i className="fa-solid fa-arrows-rotate" aria-hidden />
                <span>{autoRefresh ? c.autoRefreshOn : c.autoRefreshOff}</span>
              </button>
              <button
                type="button"
                className="recipes-tool-btn"
                title={`${c.recycleBin} — ${c.binSoon}`}
              >
                <i className="fa-solid fa-trash-can" aria-hidden />
                <span>
                  {c.recycleBin} ({recycleBinCount})
                </span>
              </button>
              <button
                type="button"
                className="recipes-btn-export"
                disabled={emptyPrimary}
                title={emptyPrimary ? c.emptyConfigured : c.exportData}
                onClick={runExportCsv}
              >
                <i className="fa-solid fa-file-arrow-down" aria-hidden />
                <span>{c.exportData}</span>
              </button>
            </div>
          </div>

          <div className="recipes-table-wrap">
            {emptyPrimary ? (
              <div className="recipes-empty">{c.emptyConfigured}</div>
            ) : (
              <table className="recipes-table">
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.id} scope="col">
                        {col.header.replace(/_/g, ' ')}
                      </th>
                    ))}
                    <th scope="col">{c.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {recipeRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="recipes-empty" style={{ border: 'none' }}>
                        {c.emptyPlaceholder}
                      </td>
                    </tr>
                  ) : (
                    recipeRows.map(row => (
                      <tr key={row.recordId}>
                        {columns.map(col => (
                          <td key={col.id}>{row.cells[col.id] ?? ''}</td>
                        ))}
                        <td>
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="recipes-back">
          <button type="button" className="ec-btn ec-btn-ghost" onClick={() => navigate(backPath)}>
            {c.back}
          </button>
        </div>

        <RecipeReportConfigModal
          open={reportModalOpen}
          onClose={() => !reportBusy && setReportModalOpen(false)}
          columns={columns}
          rows={recipeRows}
          uiLang={uiLang}
          busy={reportBusy}
          onConfirm={runGenerateReport}
        />
      </div>
    </div>
  )
}
