import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AppLanguage = 'en' | 'ar'

type LanguageContextValue = {
  language: AppLanguage
  direction: 'ltr' | 'rtl'
  setLanguage: (language: AppLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const readStoredLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'en'
  return localStorage.getItem('appLanguage') === 'ar' ? 'ar' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage)
  const direction = language === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = language
    document.documentElement.dir = direction
    document.documentElement.dataset.language = language
    document.body?.setAttribute('dir', direction)
    document.body?.setAttribute('lang', language)
    if (typeof window !== 'undefined') {
      localStorage.setItem('appLanguage', language)
      window.dispatchEvent(new CustomEvent('app-language-change', { detail: language }))
    }
  }, [direction, language])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = () => setLanguageState(readStoredLanguage())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction,
      setLanguage: setLanguageState,
    }),
    [direction, language]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    return {
      language: readStoredLanguage(),
      direction: readStoredLanguage() === 'ar' ? 'rtl' : 'ltr',
      setLanguage: () => undefined,
    } satisfies LanguageContextValue
  }
  return ctx
}

export const commonTranslations = {
  en: {
    backPage: 'Back Page',
    configureFields: 'Configure Fields',
    currentSelection: 'Current selection',
    dataSource: 'Data Source',
    enabledFields: 'Enabled Fields',
    fieldsEnabled: 'fields enabled',
    jumpToSection: 'Jump to Section',
    loading: 'Loading',
    loadingSettings: 'Loading settings...',
    selectWorkflow: 'Workflow',
    settings: 'Settings',
    workflowDataSources: 'Data Management',
    workflowDescription: 'Configure workflows, connect layers, and choose fields used for data collection.',
    activeWorkflow: 'Active Workflow',
    connectedLayers: 'Connected Layers',
  },
  ar: {
    backPage: 'رجوع',
    configureFields: 'إعداد الحقول',
    currentSelection: 'التحديد الحالي',
    dataSource: 'مصدر البيانات',
    enabledFields: 'الحقول المفعلة',
    fieldsEnabled: 'حقلاً مفعلاً',
    jumpToSection: 'الانتقال إلى القسم',
    loading: 'جار التحميل',
    loadingSettings: 'جار تحميل الإعدادات...',
    selectWorkflow: 'سير العمل',
    settings: 'الإعدادات',
    workflowDataSources: 'إدارة البيانات',
    workflowDescription: 'قم بإعداد سير العمل وربط الطبقات واختيار الحقول المستخدمة في جمع البيانات.',
    activeWorkflow: 'سير العمل الحالي',
    connectedLayers: 'الطبقات المرتبطة',
  },
} as const

export function useCommonText() {
  const { language } = useLanguage()
  return commonTranslations[language]
}
