import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './field-calculate-tools.css'

const STORAGE_KEY = 'dsf_field_calculator_v1'

export type CalcLang = 'arcade' | 'python' | 'sql'

type CalcDraft = {
  targetField: string
  expression: string
  language: CalcLang
  updatedAt: string
}

type CalcStore = Record<string, Record<string, CalcDraft>>

const copyUi = (lang: 'en' | 'ar') => {
  const en = {
    title: 'Calculate field',
    hint: 'Draft expressions are saved in this browser only. Apply bulk updates in ArcGIS (Field Calculator) or your publishing workflow.',
    targetPlaceholder: 'Select target field',
    exprPlaceholder: 'Enter an expression (e.g. area, concatenation…)',
    langLabel: 'Language',
    arcade: 'Arcade',
    python: 'Python',
    sql: 'SQL',
    calculate: 'Calculate',
    copy: 'Copy',
    saved: 'Saved.',
    copied: 'Copied.',
    pickTarget: 'Choose a target field first.',
    addFieldToExpr: 'Insert field into expression',
    filterFields: 'Filter fields…',
    noMatches: 'No matching fields.',
  }
  const ar: typeof en = {
    ...en,
    title: 'حقل حسابي',
    hint: 'تُحفظ المسودات محلياً في المتصفح فقط. نفّذ التحديثات الجماعية في ArcGIS (حاسبة الحقول) أو سير النشر.',
    targetPlaceholder: 'اختر الحقل المستهدف',
    exprPlaceholder: 'أدخل تعبيراً (مثال: مساحة، دمج نصوص…)',
    langLabel: 'اللغة',
    arcade: 'Arcade',
    python: 'Python',
    sql: 'SQL',
    calculate: 'احسب',
    copy: 'نسخ',
    saved: 'تم الحفظ.',
    copied: 'تم النسخ.',
    pickTarget: 'اختر حقلًا مستهدفًا أولاً.',
    addFieldToExpr: 'إدراج حقل في التعبير',
    filterFields: 'تصفية الحقول…',
    noMatches: 'لا توجد حقول مطابقة.',
  }
  return lang === 'ar' ? ar : en
}

function readStore(): CalcStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as CalcStore
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function writeStore(store: CalcStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

export function fieldToken(field: string, lang: CalcLang): string {
  const safe = String(field ?? '').trim()
  if (!safe) return ''
  switch (lang) {
    case 'arcade':
      return `$feature.${safe}`
    case 'python':
      return `!${safe}!`
    case 'sql':
      return `[${safe.replace(/]/g, '')}]`
    default:
      return safe
  }
}

type Props = {
  formKey: string
  sourceId: string
  layerName: string
  availableFields: string[]
  uiLang: 'en' | 'ar'
}

export function FieldCalculateTools({ formKey, sourceId, layerName, availableFields, uiLang }: Props) {
  const c = useMemo(() => copyUi(uiLang), [uiLang])
  const fields = useMemo(() => Array.from(new Set(availableFields.map(f => String(f).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [availableFields])

  const [targetField, setTargetField] = useState('')
  const [expression, setExpression] = useState('')
  const [language, setLanguage] = useState<CalcLang>('arcade')
  const [flash, setFlash] = useState<string | null>(null)
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const exprWrapRef = useRef<HTMLDivElement>(null)

  const loadDraft = useCallback(() => {
    const store = readStore()
    const draft = store[formKey]?.[sourceId]
    if (!draft) return
    setTargetField(draft.targetField ?? '')
    setExpression(draft.expression ?? '')
    setLanguage(draft.language === 'python' || draft.language === 'sql' ? draft.language : 'arcade')
  }, [formKey, sourceId])

  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2600)
    return () => window.clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (!fieldPickerOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = exprWrapRef.current
      if (el && !el.contains(e.target as Node)) setFieldPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFieldPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [fieldPickerOpen])

  const pickerFields = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase()
    if (!q) return fields
    return fields.filter(f => f.toLowerCase().includes(q))
  }, [fields, pickerFilter])

  const persist = useCallback(() => {
    const store = readStore()
    const nextForm = { ...(store[formKey] ?? {}) }
    nextForm[sourceId] = {
      targetField: targetField.trim(),
      expression,
      language,
      updatedAt: new Date().toISOString(),
    }
    writeStore({ ...store, [formKey]: nextForm })
  }, [expression, formKey, language, sourceId, targetField])

  const onCalculate = () => {
    if (!targetField.trim()) {
      setFlash(c.pickTarget)
      return
    }
    persist()
    setFlash(c.saved)
  }

  const onCopy = async () => {
    const blob = [`Target: ${targetField}`, `Lang: ${language}`, expression].join('\n')
    try {
      await navigator.clipboard.writeText(blob)
      setFlash(c.copied)
    } catch {
      setFlash(c.saved)
    }
  }

  const insertToken = (fname: string) => {
    const tok = fieldToken(fname, language)
    setExpression(prev => (prev && !/\s$/.test(prev) ? `${prev} ${tok}` : `${prev}${tok}`))
  }

  const onPickField = (fname: string) => {
    insertToken(fname)
    setFieldPickerOpen(false)
    setPickerFilter('')
  }

  if (!fields.length) return null

  return (
    <div className="dsf-calc-tools" dir={uiLang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="dsf-calc-tools__label-row">
        <div className="dsf-calc-tools__title">
          <i className="fa-solid fa-calculator" aria-hidden />
          {c.title}
          <span style={{ fontWeight: 700, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>({layerName})</span>
        </div>
      </div>
      <p className="dsf-calc-tools__hint">{c.hint}</p>

      <div className="dsf-calc-tools__row">
        <select
          className="dsf-calc-tools__target"
          value={targetField}
          onChange={e => setTargetField(e.target.value)}
          aria-label={c.targetPlaceholder}
        >
          <option value="">{c.targetPlaceholder}</option>
          {fields.map(f => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="dsf-calc-tools__eq" aria-hidden>
          =
        </span>
        <div className="dsf-calc-tools__expr-wrap" ref={exprWrapRef} dir="ltr">
          <input
            type="text"
            className="dsf-calc-tools__expr"
            value={expression}
            onChange={e => setExpression(e.target.value)}
            placeholder={c.exprPlaceholder}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className={`dsf-calc-tools__expr-addon${fieldPickerOpen ? ' dsf-calc-tools__expr-addon--open' : ''}`}
            aria-label={c.addFieldToExpr}
            aria-expanded={fieldPickerOpen}
            aria-haspopup="listbox"
            onClick={() => setFieldPickerOpen(v => !v)}
          >
            <svg className="dsf-calc-tools__insert-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden>
              <rect x="2" y="4.25" width="9.5" height="1.35" rx="0.45" fill="currentColor" opacity="0.88" />
              <rect x="2" y="7.9" width="9.5" height="1.35" rx="0.45" fill="currentColor" opacity="0.88" />
              <rect x="2" y="11.55" width="6.75" height="1.35" rx="0.45" fill="currentColor" opacity="0.88" />
              <rect x="11.35" y="2.35" width="6.65" height="6.65" rx="1.85" fill="currentColor" opacity="0.12" />
              <path
                d="M14.65 4.55v2.25M13.45 5.675h2.45"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {fieldPickerOpen ? (
            <div className="dsf-calc-tools__picker" role="listbox" aria-label={c.addFieldToExpr}>
              <input
                type="text"
                className="dsf-calc-tools__picker-filter"
                value={pickerFilter}
                onChange={e => setPickerFilter(e.target.value)}
                placeholder={c.filterFields}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="dsf-calc-tools__picker-list">
                {pickerFields.length ? (
                  pickerFields.map(f => (
                    <button key={f} type="button" className="dsf-calc-tools__picker-item" role="option" onClick={() => onPickField(f)}>
                      <code>{fieldToken(f, language)}</code>
                      <span className="dsf-calc-tools__picker-name">{f}</span>
                    </button>
                  ))
                ) : (
                  <div className="dsf-calc-tools__picker-empty">{c.noMatches}</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
        <select className="dsf-calc-tools__lang" value={language} onChange={e => setLanguage(e.target.value as CalcLang)} aria-label={c.langLabel}>
          <option value="arcade">{c.arcade}</option>
          <option value="python">{c.python}</option>
          <option value="sql">{c.sql}</option>
        </select>
        <button type="button" className="dsf-calc-tools__btn" onClick={onCalculate}>
          <i className="fa-solid fa-play" style={{ fontSize: 10, opacity: 0.95 }} aria-hidden />
          {c.calculate}
        </button>
        <button type="button" className="dsf-calc-tools__btn dsf-calc-tools__btn-ghost" onClick={() => void onCopy()}>
          <i className="fa-solid fa-copy" aria-hidden />
          {c.copy}
        </button>
      </div>

      {flash ? (
        <div className="dsf-calc-tools__flash" role="status">
          {flash}
        </div>
      ) : null}
    </div>
  )
}
