import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { mergeNavigationManifest, type MergedGroup, type MergedLeaf } from '../nav/navManifest'
import {
  clearBrowserApiVaultCustomSection,
  scheduleBrowserApiSecretsVaultSnapshot,
} from '../lib/browserApiSecretsVault'
import {
  DEFAULT_SYSTEM_SETTINGS,
  loadSystemSettings,
  mergeWithDefaults,
  saveSystemSettings,
  SYSTEM_SETTINGS_UPDATED_EVENT,
} from '../services/settingsStorage'
import type { SystemSettingsPersistedV1 } from '../types/systemSettings'
import { useLanguage } from '../lib/i18n'
import { ensureBrowserApiSecretsHydrated } from '../lib/apiSecretsServerPersistence'

type ToastState = { kind: 'success' | 'error'; message: string } | null

type Ctx = {
  settings: SystemSettingsPersistedV1
  /** Update and persist immediately (e.g. theme from any screen) */
  setSettings: (next: SystemSettingsPersistedV1) => void
  /** Draft for settings page */
  draft: SystemSettingsPersistedV1
  setDraft: React.Dispatch<React.SetStateAction<SystemSettingsPersistedV1>>
  saveDraft: () => void
  cancelDraft: () => void
  resetToDefaults: () => void
  toast: ToastState
  pushToast: (kind: 'success' | 'error', message: string) => void
  dismissToast: () => void
}

const SystemSettingsContext = createContext<Ctx | null>(null)

function clampHex(hex: string): string {
  const h = hex.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h
  return '#047857'
}

function shadeHex(hex: string, fraction: number): string {
  const c = clampHex(hex).slice(1)
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const blend = (x: number) => Math.round(Math.max(0, Math.min(255, x * (1 - fraction))))
  const rr = blend(r).toString(16).padStart(2, '0')
  const gg = blend(g).toString(16).padStart(2, '0')
  const bb = blend(b).toString(16).padStart(2, '0')
  return `#${rr}${gg}${bb}`
}

function hexToRgba(hex: string, alpha: number): string {
  const c = clampHex(hex).slice(1)
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function applyThemeToDocument(s: Pick<SystemSettingsPersistedV1, 'themeMode' | 'customPrimaryHex'>): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.removeProperty('--ds-color-primary')
  root.style.removeProperty('--ds-color-primary-hover')
  root.style.removeProperty('--ds-color-primary-soft')
  const isSystemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches

  // Always set an explicit data-theme so CSS + SI dock observers stay in sync.
  const resolvedDark =
    s.themeMode === 'dark' || (s.themeMode === 'system' && isSystemDark)
  root.setAttribute('data-theme', resolvedDark ? 'dark' : 'light')

  if (s.themeMode === 'custom') {
    const hex = clampHex(s.customPrimaryHex || '#047857')
    root.style.setProperty('--ds-color-primary', hex)
    root.style.setProperty('--ds-color-primary-hover', shadeHex(hex, 0.18))
    root.style.setProperty('--ds-color-primary-soft', hexToRgba(hex, 0.14))
  }
}

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  const [settings, setSettingsState] = useState<SystemSettingsPersistedV1>(() => loadSystemSettings())
  const [draft, setDraft] = useState<SystemSettingsPersistedV1>(() => loadSystemSettings())
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    applyThemeToDocument(settings)
  }, [settings.themeMode, settings.customPrimaryHex])

  useEffect(() => {
    if (settings.themeMode !== 'system') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => applyThemeToDocument(settings)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [settings.themeMode, settings.customPrimaryHex])

  useEffect(() => {
    let cancelled = false
    // Shares the single in-flight hydration kicked off early in main.tsx (deduped).
    void ensureBrowserApiSecretsHydrated().then(() => {
      if (cancelled) return
      scheduleBrowserApiSecretsVaultSnapshot()
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const on = () => scheduleBrowserApiSecretsVaultSnapshot()
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, on)
    return () => window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, on)
  }, [])

  const setSettings = useCallback((next: SystemSettingsPersistedV1) => {
    const merged = mergeWithDefaults(next)
    saveSystemSettings(merged)
    setSettingsState(merged)
    setDraft(merged)
  }, [])

  const pushToast = useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message })
    window.setTimeout(() => setToast(null), 4200)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const saveDraft = useCallback(() => {
    try {
      const merged = mergeWithDefaults(draft)
      saveSystemSettings(merged)
      setSettingsState(merged)
      setDraft(merged)
      applyThemeToDocument(merged)
      pushToast('success', language === 'ar' ? 'تم الحفظ.' : 'Saved.')
    } catch {
      pushToast('error', language === 'ar' ? 'تعذّر حفظ الإعدادات.' : 'Could not save settings.')
    }
  }, [draft, pushToast, language])

  const cancelDraft = useCallback(() => {
    setDraft(settings)
    applyThemeToDocument(settings)
  }, [settings])

  const resetToDefaults = useCallback(() => {
    clearBrowserApiVaultCustomSection()
    const next = { ...DEFAULT_SYSTEM_SETTINGS }
    saveSystemSettings(next)
    setSettingsState(next)
    setDraft(next)
    applyThemeToDocument(next)
    pushToast('success', 'Restored default settings.')
  }, [pushToast])

  const value = useMemo(
    () =>
      ({
        settings,
        setSettings,
        draft,
        setDraft,
        saveDraft,
        cancelDraft,
        resetToDefaults,
        toast,
        pushToast,
        dismissToast,
      }) satisfies Ctx,
    [settings, setSettings, draft, saveDraft, cancelDraft, resetToDefaults, toast, pushToast, dismissToast],
  )

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="ds-toast-host ds-toast-host--system-settings">
          <div
            role="status"
            className={`system-settings-toast ds-toast system-settings-toast-${toast.kind}`}
            style={{
              color: 'var(--ds-color-text)',
              fontSize: 14,
            }}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </SystemSettingsContext.Provider>
  )
}

export function useSystemSettings(): Ctx {
  const ctx = useContext(SystemSettingsContext)
  if (!ctx) throw new Error('useSystemSettings must be used within SystemSettingsProvider')
  return ctx
}

export function useMergedNavigation(): { home: MergedLeaf; groups: MergedGroup[] } {
  const { settings } = useSystemSettings()
  return useMemo(() => mergeNavigationManifest(settings), [settings])
}

/** Safe hook when provider optional (tests) */
export function useSystemSettingsOptional(): Ctx | null {
  return useContext(SystemSettingsContext)
}
