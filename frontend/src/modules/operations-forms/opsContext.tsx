import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useLanguage } from '@/core/localization/i18n'
import { opsApi, type Bilingual, type OpsField, type OpsForm, type OpsSchema } from './api'

type Ctx = {
  schema: OpsSchema | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  lang: 'en' | 'ar'
  t: (b: Bilingual | string) => string
}

const OpsCtx = createContext<Ctx | null>(null)

export function OpsProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  const lang: 'en' | 'ar' = language === 'ar' ? 'ar' : 'en'
  const [schema, setSchema] = useState<OpsSchema | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setSchema(await opsApi.schema())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo<Ctx>(
    () => ({
      schema,
      error,
      loading,
      reload,
      lang,
      t: b => (typeof b === 'string' ? b : b[lang] || b.en),
    }),
    [error, lang, loading, reload, schema],
  )
  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>
}

export function useOps(): Ctx {
  const ctx = useContext(OpsCtx)
  if (!ctx) throw new Error('useOps must be used inside <OpsProvider>')
  return ctx
}

/** UI strings not tied to a field. */
export function useOpsText() {
  const { lang } = useOps()
  return (en: string, ar: string) => (lang === 'ar' ? ar : en)
}

export function formFields(form: OpsForm, opts: { includeComputed?: boolean } = {}): OpsField[] {
  return form.fields.filter(f => opts.includeComputed !== false || !f.computed)
}

export function fieldLabel(form: OpsForm, key: string, lang: 'en' | 'ar'): string {
  const f = form.fields.find(x => x.key === key)
  return f ? f.label[lang] || f.label.en : key
}

const NUM = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export function formatValue(field: OpsField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (field && (field.type === 'number' || field.type === 'integer') && typeof value === 'number') return NUM.format(value)
  return String(value)
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(v)
}
