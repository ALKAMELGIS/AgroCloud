import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppLanguage } from '../../../lib/i18n'
import type { ThemeMode } from '../../../types/systemSettings'
import {
  FONT_CATEGORY_LABEL,
  HEADER_FONT_PRESETS,
  findPresetByCss,
  getSmartFontAdvice,
  normalizeFontFamily,
  previewFontFamily,
  themeDefaultPresetId,
  type FontCategoryId,
  type FontPreset,
} from './headerFontCatalog'
import { ensureBundledFontPreset, preloadOptionalPickerFonts } from '../../../lib/loadBundledFontPreset'

const CATEGORY_ORDER: FontCategoryId[] = ['design', 'system', 'modern', 'elegant', 'mono', 'arabic']

const PREVIEW_SAMPLE = 'AgroCloud · أجرو'

export type HeaderFontStackPickerProps = {
  id?: string
  value: string
  onChange: (next: string) => void
  themeMode: ThemeMode
  language: AppLanguage
  /** Full header restore (typography, layout, toggles) — same as system Default preset */
  onResetHeaderToSystemDefaults: () => void
}

export function HeaderFontStackPicker({
  id = 'hs-font-stack',
  value,
  onChange,
  themeMode,
  language,
  onResetHeaderToSystemDefaults,
}: HeaderFontStackPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [prefersDark, setPrefersDark] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const sync = () => setPrefersDark(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const advice = useMemo(
    () => getSmartFontAdvice(themeMode, prefersDark, language === 'ar' ? 'ar' : 'en'),
    [themeMode, prefersDark, language],
  )

  const matchedPreset = useMemo(() => findPresetByCss(value), [value])
  const isCustom = !matchedPreset && normalizeFontFamily(value).length > 0

  useEffect(() => {
    if (!open) return
    void preloadOptionalPickerFonts()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el || el.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byCat = new Map<FontCategoryId, FontPreset[]>()
    for (const p of HEADER_FONT_PRESETS) {
      if (q) {
        const hay = `${p.label} ${p.cssFamily} ${FONT_CATEGORY_LABEL[p.category]}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      const arr = byCat.get(p.category) ?? []
      arr.push(p)
      byCat.set(p.category, arr)
    }
    return CATEGORY_ORDER.map(cat => ({ cat, items: byCat.get(cat) ?? [] })).filter(g => g.items.length > 0)
  }, [query])

  const applyPreset = useCallback(
    (p: FontPreset) => {
      void ensureBundledFontPreset(p.id).finally(() => {
        onChange(p.cssFamily)
        setOpen(false)
        setQuery('')
      })
    },
    [onChange],
  )

  const applyAdvice = useCallback(() => {
    const p = HEADER_FONT_PRESETS.find(x => x.id === advice.presetId)
    if (p) applyPreset(p)
  }, [advice.presetId, applyPreset])

  const applyThemeDefault = useCallback(() => {
    const tid = themeDefaultPresetId(themeMode, prefersDark)
    const p = HEADER_FONT_PRESETS.find(x => x.id === tid)
    if (p) applyPreset(p)
  }, [applyPreset, prefersDark, themeMode])

  const applyFullSystemDefault = useCallback(() => {
    onResetHeaderToSystemDefaults()
    setOpen(false)
    setQuery('')
  }, [onResetHeaderToSystemDefaults])

  const triggerPreview = matchedPreset ? previewFontFamily(matchedPreset) : value

  return (
    <div className="hs-font-picker" ref={wrapRef}>
      <div className="hs-font-picker__smart">
        <div className="hs-font-picker__smart-text">
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
          <span>{language === 'ar' ? advice.hintAr : advice.hintEn}</span>
        </div>
        <div className="hs-font-picker__smart-actions">
          <button type="button" className="hs-font-picker__chip" onClick={applyAdvice}>
            {language === 'ar' ? 'تطبيق التوصية' : 'Apply suggestion'}
          </button>
          <button type="button" className="hs-font-picker__chip hs-font-picker__chip--ghost" onClick={applyThemeDefault}>
            {language === 'ar' ? 'افتراضي حسب الثيم' : 'Theme default'}
          </button>
        </div>
      </div>

      <button
        type="button"
        id={id}
        className={`hs-font-picker__trigger${open ? ' hs-font-picker__trigger--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="hs-font-picker__trigger-preview" style={{ fontFamily: triggerPreview || 'inherit' }}>
          {PREVIEW_SAMPLE}
        </span>
        <span className="hs-font-picker__trigger-meta">
          <span className="hs-font-picker__trigger-label">
            {matchedPreset ? matchedPreset.label : isCustom ? (language === 'ar' ? 'مخصص' : 'Custom stack') : language === 'ar' ? 'اختر خطاً' : 'Choose a font'}
          </span>
          <span className="hs-font-picker__trigger-code" title={value}>
            {value.length > 52 ? `${value.slice(0, 52)}…` : value}
          </span>
        </span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} hs-font-picker__trigger-chevron`} aria-hidden />
      </button>

      {open ? (
        <div className="hs-font-picker__dropdown" role="listbox" aria-label={language === 'ar' ? 'قائمة الخطوط' : 'Font list'}>
          <button
            type="button"
            className="hs-font-picker__reset"
            onClick={applyFullSystemDefault}
            aria-label={
              language === 'ar'
                ? 'استعادة الافتراضي للنظام: إعادة كل إعدادات الهيدر والخط'
                : 'Reset to system default: restore all header and typography settings'
            }
            title={language === 'ar' ? 'استعادة كل إعدادات الهيدر والخط للوضع الافتراضي' : 'Restore all header & font settings to system defaults'}
          >
            <span className="hs-font-picker__reset-icon" aria-hidden>
              <i className="fa-solid fa-rotate-left" />
            </span>
            <span className="hs-font-picker__reset-body">
              <span className="hs-font-picker__reset-title">
                {language === 'ar' ? 'استعادة الافتراضي للنظام' : 'Reset to System Default'}
              </span>
              <span className="hs-font-picker__reset-preview" style={{ fontFamily: 'var(--ds-font-sans), system-ui, sans-serif' }}>
                {PREVIEW_SAMPLE}
              </span>
              <span className="hs-font-picker__reset-desc">
                {language === 'ar'
                  ? 'إلغاء تخصيصات الخط وإرجاع الهيدر بالكامل إلى الإعدادات الأصلية.'
                  : 'Clears font overrides and restores the full header to factory defaults.'}
              </span>
            </span>
          </button>
          <div className="hs-font-picker__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              className="hs-font-picker__search-input"
              placeholder={language === 'ar' ? 'ابحث عن خط أو فئة…' : 'Search fonts or stacks…'}
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="hs-font-picker__scroll">
            {filteredGroups.map(({ cat, items }) => (
              <div key={cat} className="hs-font-picker__group">
                <div className="hs-font-picker__group-title">{FONT_CATEGORY_LABEL[cat]}</div>
                {items.map(p => {
                  const active = matchedPreset?.id === p.id
                  const recommended = p.id === advice.presetId
                  const ff = previewFontFamily(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`hs-font-picker__option${active ? ' hs-font-picker__option--active' : ''}`}
                      onClick={() => applyPreset(p)}
                    >
                      <span className="hs-font-picker__option-preview" style={{ fontFamily: ff }}>
                        {PREVIEW_SAMPLE}
                      </span>
                      <span className="hs-font-picker__option-row">
                        <span className="hs-font-picker__option-name">{p.label}</span>
                        {recommended ? (
                          <span className="hs-font-picker__badge">{language === 'ar' ? 'موصى به' : 'Suggested'}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
            {!filteredGroups.length ? (
              <div className="hs-font-picker__empty">{language === 'ar' ? 'لا توجد نتائج' : 'No matching fonts'}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <details className="hs-font-picker__advanced">
        <summary>{language === 'ar' ? 'مكدس خط مخصص (CSS)' : 'Custom font-family (CSS)'}</summary>
        <textarea
          className="gis-input hs-font-picker__textarea"
          rows={2}
          spellCheck={false}
          dir="ltr"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder='e.g. "Inter", system-ui, sans-serif'
        />
      </details>
    </div>
  )
}
