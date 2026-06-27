import { useCallback, useEffect, useMemo, useState } from 'react'
import { appConfirm } from '../../lib/appDialog'
import { useLocation } from 'react-router-dom'
import * as yup from 'yup'
import { useLanguage } from '../../lib/i18n'
import { hasPermission, normalizeRole, readCurrentUser } from '../../lib/auth'
import { NAV_DEFAULT_GROUPS, NAV_GROUP_IDS } from '../../nav/navManifest'
import { isExternalPageLink } from '../../lib/defaultPageLinks'
import {
  DEFAULT_SYSTEM_SETTINGS,
  DIRECTORY_ROLES_CANONICAL,
  loadSystemSettings,
  mergeWithDefaults,
  normalizeAppPath,
  sanitizeExternalUrl,
} from '../../services/settingsStorage'
import { applyThemeToDocument, useSystemSettings } from '../../store/SystemSettingsContext'
import { clearCustomUserApiTokenEverywhere } from '../../lib/browserApiSecretsVault'
import { getUserApiTokenValue, persistUserApiTokenValue } from '../../lib/customUserApiTokens'
import type { CustomApiTokenSlot, CustomPageRecord, SystemSettingsPersistedV1 } from '../../types/systemSettings'
import './system-settings.css'
import { NavGroupEditor } from './system-settings/NavGroupEditor'
import { createPageLinkRecord, LinkManagementSection } from './system-settings/LinkManagementSection'
import {
  getArcgisPortalTokenBrowserOverride,
  persistArcgisPortalTokenInBrowser,
} from '../../lib/arcgisPortalToken'
import {
  getMapboxAccessTokenBrowserOverride,
  getMapboxAccessTokenFromEnv,
  persistMapboxAccessTokenInBrowser,
} from '../../lib/mapboxAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from '../../lib/sentinelHubWmsInstance'
import {
  getSentinelHubAccessTokenBrowserOverride,
  persistSentinelHubAccessTokenInBrowser,
} from '../../lib/sentinelHubAccessToken'
import {
  getGeminiApiKeyBrowserOverride,
  persistGeminiApiKeyInBrowser,
} from '../../lib/geminiApiKey'
import {
  getClaudeApiKeyBrowserOverride,
  persistClaudeApiKeyInBrowser,
} from '../../lib/claudeApiKey'
import {
  getDeepseekApiKeyBrowserOverride,
  persistDeepseekApiKeyInBrowser,
} from '../../lib/deepseekApiKey'
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  getOllamaBaseUrlBrowserOverride,
  getOllamaModelBrowserOverride,
  persistOllamaBaseUrlInBrowser,
  persistOllamaModelInBrowser,
} from '../../lib/ollamaConfig'
import {
  getOpenWeatherMapApiKeyBrowserOverride,
  persistOpenWeatherMapApiKeyInBrowser,
} from '../../lib/openWeatherMapApiKey'
import { persistApiSecretsPatchToServer } from '../../lib/apiSecretsServerPersistence'

const PAGE_ICON_PRESETS = [
  'fa-solid fa-file',
  'fa-solid fa-house',
  'fa-solid fa-map',
  'fa-solid fa-chart-line',
  'fa-solid fa-table',
  'fa-solid fa-leaf',
  'fa-solid fa-droplet',
  'fa-solid fa-tractor',
  'fa-solid fa-layer-group',
] as const

const CUSTOM_API_SLOT_ICONS = [
  'fa-solid fa-key',
  'fa-solid fa-cloud',
  'fa-solid fa-bolt',
  'fa-solid fa-server',
  'fa-solid fa-link',
  'fa-solid fa-shield-halved',
  'fa-solid fa-code',
  'fa-solid fa-database',
  'fa-solid fa-robot',
  'fa-solid fa-wand-magic-sparkles',
] as const

const SETTINGS_TABS = [
  { id: 'theme' as const, label: 'Theme', icon: 'fa-solid fa-palette' },
  { id: 'logos' as const, label: 'Logos', icon: 'fa-solid fa-image' },
  { id: 'nav' as const, label: 'Navigation', icon: 'fa-solid fa-bars-staggered' },
  { id: 'pages' as const, label: 'Pages', icon: 'fa-solid fa-layer-group' },
  { id: 'signup-roles' as const, label: 'Sign-up & roles', icon: 'fa-solid fa-user-plus' },
  { id: 'api-tokens' as const, label: 'API Tokens', icon: 'fa-solid fa-key' },
]

const themeSchema = yup.object({
  themeMode: yup.string().oneOf(['light', 'dark', 'custom', 'system']).required(),
  customPrimaryHex: yup.string().matches(/^#[0-9A-Fa-f]{6}$/, 'Use #RRGGBB'),
})

type ApiTokenMergeFieldProps = {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  password?: boolean
  onSave: () => void | Promise<void>
  onClear: () => void | Promise<void>
  saveAria: string
  clearAria: string
  saveTitle: string
  clearTitle: string
  actionsGroupLabel: string
}

function ApiTokenMergeField({
  id,
  label,
  value,
  onChange,
  placeholder,
  password,
  onSave,
  onClear,
  saveAria,
  clearAria,
  saveTitle,
  clearTitle,
  actionsGroupLabel,
}: ApiTokenMergeFieldProps) {
  return (
    <div className="sys-api-token-field">
      <label className="sys-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="sys-api-token-row">
        <div className="sys-api-token-merge" dir="ltr">
          <input
            id={id}
            className="gis-input sys-api-token-merge__input"
            type={password ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
          <div className="sys-api-token-actions" role="group" aria-label={actionsGroupLabel}>
            <button type="button" className="sys-api-icon-btn sys-api-icon-btn--primary" onClick={onSave} title={saveTitle} aria-label={saveAria}>
              <i className="fa-solid fa-check" aria-hidden />
            </button>
            <button type="button" className="sys-api-icon-btn sys-api-icon-btn--ghost" onClick={onClear} title={clearTitle} aria-label={clearAria}>
              <i className="fa-regular fa-trash-can" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SystemSettings() {
  const { draft, setDraft, settings, setSettings, saveDraft, cancelDraft, resetToDefaults, pushToast } = useSystemSettings()
  const { language } = useLanguage()
  const [tab, setTab] = useState<'theme' | 'logos' | 'nav' | 'pages' | 'signup-roles' | 'api-tokens'>('theme')
  const [mapboxTokenDraft, setMapboxTokenDraft] = useState('')
  const [arcgisTokenDraft, setArcgisTokenDraft] = useState('')
  const [sentinelHubInstanceDraft, setSentinelHubInstanceDraft] = useState('')
  const [sentinelAccessDraft, setSentinelAccessDraft] = useState('')
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('')
  const [claudeApiKeyDraft, setClaudeApiKeyDraft] = useState('')
  const [deepseekApiKeyDraft, setDeepseekApiKeyDraft] = useState('')
  const [ollamaBaseUrlDraft, setOllamaBaseUrlDraft] = useState('')
  const [ollamaModelDraft, setOllamaModelDraft] = useState('')
  const [openWeatherMapApiKeyDraft, setOpenWeatherMapApiKeyDraft] = useState('')
  const [customUserTokenDrafts, setCustomUserTokenDrafts] = useState<Record<string, string>>({})
  const [addApiModalOpen, setAddApiModalOpen] = useState(false)
  const [addApiForm, setAddApiForm] = useState({
    title: '',
    titleAr: '',
    description: '',
    descriptionAr: '',
    fieldLabel: 'API secret',
    fieldLabelAr: '',
    placeholder: '',
    placeholderAr: '',
    iconClass: 'fa-solid fa-key',
  })
  const [confirmReset, setConfirmReset] = useState(false)
  const [pageQuery, setPageQuery] = useState('')
  const [pageGroupFilter, setPageGroupFilter] = useState<'all' | string>('all')
  const [navPickGroup, setNavPickGroup] = useState<string>(
    () => NAV_DEFAULT_GROUPS.find(g => g.id !== 'data')?.id ?? 'dashboard',
  )
  const location = useLocation()

  const role = normalizeRole(readCurrentUser()?.role)

  const allowed = hasPermission('admin.users.manage', role)

  useEffect(() => {
    setDraft(settings)
  }, [location.pathname, setDraft, settings])

  useEffect(() => {
    applyThemeToDocument(draft)
  }, [draft.themeMode, draft.customPrimaryHex])

  useEffect(() => {
    return () => {
      applyThemeToDocument(loadSystemSettings())
    }
  }, [])

  const mapboxTokenFromEnv = useMemo(() => getMapboxAccessTokenFromEnv().length > 0, [])

  const arcgisTokenFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_ARCGIS_PORTAL_TOKEN
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const sentinelHubInstanceFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_SENTINEL_HUB_WMS_INSTANCE_ID
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const sentinelAccessFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_SENTINEL_HUB_ACCESS_TOKEN
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const geminiApiKeyFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_GEMINI_API_KEY
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const claudeApiKeyFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_CLAUDE_API_KEY
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const deepseekApiKeyFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_DEEPSEEK_API_KEY
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  const openWeatherMapApiKeyFromEnv = useMemo(() => {
    const raw = import.meta.env.VITE_OPENWEATHER_API_KEY
    return typeof raw === 'string' && raw.trim().length > 0
  }, [])

  useEffect(() => {
    if (tab !== 'api-tokens') return
    const refreshApiDrafts = () => {
      setMapboxTokenDraft(getMapboxAccessTokenBrowserOverride())
      setArcgisTokenDraft(getArcgisPortalTokenBrowserOverride())
      setSentinelHubInstanceDraft(getSentinelHubWmsInstanceIdBrowserOverride())
      setSentinelAccessDraft(getSentinelHubAccessTokenBrowserOverride())
      setGeminiApiKeyDraft(getGeminiApiKeyBrowserOverride())
      setClaudeApiKeyDraft(getClaudeApiKeyBrowserOverride())
      setDeepseekApiKeyDraft(getDeepseekApiKeyBrowserOverride())
      setOllamaBaseUrlDraft(getOllamaBaseUrlBrowserOverride())
      setOllamaModelDraft(getOllamaModelBrowserOverride())
      setOpenWeatherMapApiKeyDraft(getOpenWeatherMapApiKeyBrowserOverride())
    }
    refreshApiDrafts()
    window.addEventListener('agri-api-secrets-hydrated', refreshApiDrafts)
    return () => window.removeEventListener('agri-api-secrets-hydrated', refreshApiDrafts)
  }, [tab])

  useEffect(() => {
    if (tab !== 'api-tokens') return
    setCustomUserTokenDrafts(prev => {
      const next = { ...prev }
      for (const slot of draft.customApiTokenSlots) {
        if (!(slot.id in next)) next[slot.id] = getUserApiTokenValue(slot.id)
      }
      for (const id of Object.keys(next)) {
        if (!draft.customApiTokenSlots.some(s => s.id === id)) delete next[id]
      }
      return next
    })
  }, [tab, draft.customApiTokenSlots])

  const resetAddApiForm = useCallback(() => {
    setAddApiForm({
      title: '',
      titleAr: '',
      description: '',
      descriptionAr: '',
      fieldLabel: language === 'ar' ? 'القيمة السرية' : 'API secret',
      fieldLabelAr: '',
      placeholder: '',
      placeholderAr: '',
      iconClass: 'fa-solid fa-key',
    })
  }, [language])

  const submitAddApiToken = useCallback(() => {
    const title = addApiForm.title.trim()
    const fieldLabel = addApiForm.fieldLabel.trim()
    if (!title) {
      pushToast('error', language === 'ar' ? 'أدخل اسماً للبطاقة.' : 'Enter a display name for the card.')
      return
    }
    if (!fieldLabel) {
      pushToast('error', language === 'ar' ? 'أدخل تسمية الحقل.' : 'Enter a label for the secret field.')
      return
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const slot: CustomApiTokenSlot = {
      id,
      title,
      ...(addApiForm.titleAr.trim() ? { titleAr: addApiForm.titleAr.trim() } : {}),
      description: addApiForm.description.trim(),
      ...(addApiForm.descriptionAr.trim() ? { descriptionAr: addApiForm.descriptionAr.trim() } : {}),
      fieldLabel,
      ...(addApiForm.fieldLabelAr.trim() ? { fieldLabelAr: addApiForm.fieldLabelAr.trim() } : {}),
      ...(addApiForm.placeholder.trim() ? { placeholder: addApiForm.placeholder.trim() } : {}),
      ...(addApiForm.placeholderAr.trim() ? { placeholderAr: addApiForm.placeholderAr.trim() } : {}),
      iconClass: addApiForm.iconClass || 'fa-solid fa-key',
    }
    setDraft(d => ({ ...d, customApiTokenSlots: [...d.customApiTokenSlots, slot] }))
    setCustomUserTokenDrafts(p => ({ ...p, [id]: '' }))
    setAddApiModalOpen(false)
    resetAddApiForm()
    pushToast(
      'success',
      language === 'ar' ? 'تمت الإضافة. احفظ الإعدادات لتثبيت البطاقة.' : 'Added. Save settings to persist this entry.',
    )
  }, [addApiForm, language, pushToast, resetAddApiForm, setDraft])

  const removeCustomApiSlot = useCallback(
    async (slotId: string) => {
      const ok = await appConfirm(
        language === 'ar'
          ? 'حذف بطاقة الرمز والقيمة المحفوظة في هذا المتصفح وعلى الخادم؟'
          : 'Remove this token card and its saved value in this browser and on the server?',
        {
          title: language === 'ar' ? 'إزالة البطاقة' : 'Remove token card',
          danger: true,
          confirmLabel: language === 'ar' ? 'إزالة' : 'Remove',
          cancelLabel: language === 'ar' ? 'إلغاء' : 'Cancel',
        },
      )
      if (!ok) return
      clearCustomUserApiTokenEverywhere(slotId)
      void persistApiSecretsPatchToServer({ customSlots: { [slotId]: '' } })
      setDraft(d => ({ ...d, customApiTokenSlots: d.customApiTokenSlots.filter(s => s.id !== slotId) }))
      setCustomUserTokenDrafts(p => {
        const next = { ...p }
        delete next[slotId]
        return next
      })
      pushToast('success', language === 'ar' ? 'تمت الإزالة.' : 'Removed.')
    },
    [language, pushToast, setDraft],
  )

  const pageSchema = useMemo(
    () =>
      yup.object({
        name: yup.string().min(1).max(120).required(),
        path: yup
          .string()
          .matches(/^\/?[A-Za-z0-9/_-]+$/)
          .required(),
        iconClass: yup.string().min(3).max(120).required(),
      }),
    [],
  )

  if (!allowed) {
    return (
      <div className="gis-page-padding" style={{ padding: 24 }}>
        <h1>Access denied</h1>
        <p>{language === 'ar' ? 'تحتاج صلاحيات المدير لعرض إعدادات النظام.' : 'You need administrator access to manage system settings.'}</p>
      </div>
    )
  }

  const validateTheme = async () => {
    try {
      await themeSchema.validate(
        { themeMode: draft.themeMode, customPrimaryHex: draft.customPrimaryHex },
        { abortEarly: false },
      )
      return true
    } catch (e) {
      if (e instanceof yup.ValidationError) pushToast('error', e.errors[0] ?? 'Validation failed')
      return false
    }
  }

  const handleSave = async () => {
    if (!(await validateTheme())) return
    for (const p of draft.customPages) {
      const gid = String(p.navGroupId ?? '').trim()
      if (!NAV_GROUP_IDS.includes(gid)) {
        pushToast('error', `Page "${p.name}": choose a valid sidebar group (dashboard, satellite, data, …).`)
        return
      }
      try {
        await pageSchema.validate(p)
      } catch (e) {
        if (e instanceof yup.ValidationError) {
          pushToast('error', `Page "${p.name}": ${e.errors[0]}`)
          return
        }
      }
      if (p.bindTarget === 'external' && !sanitizeExternalUrl(p.externalUrl)) {
        pushToast('error', `Page link "${p.name}": enter a valid http/https URL.`)
        return
      }
    }
    saveDraft()
  }

  const handleCancel = () => {
    void (async () => {
      const ok = await appConfirm(
        language === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?',
        {
          title: language === 'ar' ? 'تجاهل التغييرات' : 'Discard changes',
          danger: true,
          confirmLabel: language === 'ar' ? 'تجاهل' : 'Discard',
          cancelLabel: language === 'ar' ? 'البقاء' : 'Stay',
        },
      )
      if (ok) cancelDraft()
    })()
  }

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result ?? ''))
      r.onerror = () => reject(new Error('read'))
      r.readAsDataURL(file)
    })

  const onLogoUpload = async (which: 'logoLight' | 'logoDark' | 'logoIcon', file: File | undefined) => {
    if (!file) return
    try {
      const url = await readFileAsDataUrl(file)
      setDraft((d: SystemSettingsPersistedV1) => ({ ...d, [which]: url }))
    } catch {
      pushToast('error', 'Could not read file.')
    }
  }

  const updateNavOverride = (id: string, patch: Partial<SystemSettingsPersistedV1['navOverrides'][string]>) => {
    setDraft(d => ({
      ...d,
      navOverrides: {
        ...d.navOverrides,
        [id]: { ...(d.navOverrides[id] ?? {}), ...patch },
      },
    }))
  }

  const reorderGroups = (from: number, to: number) => {
    const ids = NAV_DEFAULT_GROUPS.map(g => g.id)
    const cur = draft.navGroupOrder.length ? [...draft.navGroupOrder] : ids
    const [m] = cur.splice(from, 1)
    cur.splice(to, 0, m)
    setDraft(d => ({ ...d, navGroupOrder: cur }))
  }

  const reorderItem = (groupId: string, from: number, to: number) => {
    const g = NAV_DEFAULT_GROUPS.find(x => x.id === groupId)
    if (!g) return
    const base = g.children.map(c => c.id)
    const cur = draft.navItemOrders[groupId]?.length ? [...draft.navItemOrders[groupId]] : base
    const [m] = cur.splice(from, 1)
    cur.splice(to, 0, m)
    setDraft(d => ({
      ...d,
      navItemOrders: { ...d.navItemOrders, [groupId]: cur },
    }))
  }

  const addPage = () => {
    const id = `page-${Date.now()}`
    const rec: CustomPageRecord = {
      id,
      name: 'New page',
      path: `/pages/${id}`,
      iconClass: 'fa-solid fa-file',
      visible: true,
      bindTarget: 'placeholder',
      navGroupId: 'data',
      subitemClass: '',
    }
    setDraft(d => ({ ...d, customPages: [...d.customPages, rec] }))
  }

  const addPageLink = () => {
    const rec = createPageLinkRecord()
    setDraft(d => ({ ...d, customPages: [...d.customPages, rec] }))
  }

  const updatePage = (id: string, patch: Partial<CustomPageRecord>) => {
    setDraft(d => ({
      ...d,
      customPages: d.customPages.map(p => (p.id === id ? { ...p, ...patch, path: patch.path ? normalizeAppPath(patch.path) : p.path } : p)),
    }))
  }

  const removePage = (id: string) => {
    setDraft(d => ({ ...d, customPages: d.customPages.filter(p => p.id !== id) }))
  }

  const reorderPages = (from: number, to: number) => {
    setDraft(d => {
      const next = [...d.customPages]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return { ...d, customPages: next }
    })
  }

  const duplicatePage = (id: string) => {
    setDraft(d => {
      const idx = d.customPages.findIndex(p => p.id === id)
      if (idx < 0) return d
      const src = d.customPages[idx]
      const newId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const clone: CustomPageRecord = {
        ...src,
        id: newId,
        name: `${src.name} Copy`,
        path: normalizeAppPath(`${src.path}-copy`),
      }
      const next = [...d.customPages]
      next.splice(idx + 1, 0, clone)
      return { ...d, customPages: next }
    })
  }

  const movePageByDelta = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= draft.customPages.length) return
    reorderPages(index, target)
  }

  const dataNavGroup = NAV_DEFAULT_GROUPS.find(g => g.id === 'data')
  const navGroupsExceptData = NAV_DEFAULT_GROUPS.filter(g => g.id !== 'data')
  const currentGroupDef = navGroupsExceptData.find(g => g.id === navPickGroup)
  const pageRows = draft.customPages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => {
      if (isExternalPageLink(page)) return false
      if (pageGroupFilter !== 'all' && (page.navGroupId || 'data') !== pageGroupFilter) return false
      const q = pageQuery.trim().toLowerCase()
      if (!q) return true
      return (
        page.name.toLowerCase().includes(q) ||
        (page.nameAr ?? '').toLowerCase().includes(q) ||
        page.path.toLowerCase().includes(q) ||
        (page.navGroupId || 'data').toLowerCase().includes(q)
      )
    })

  const settingsDirty = useMemo(
    () => JSON.stringify(mergeWithDefaults(settings)) !== JSON.stringify(mergeWithDefaults(draft)),
    [settings, draft],
  )
  const inlineSettingsActions = (
    <footer
      className="sys-settings-actions"
      role="region"
      aria-label={language === 'ar' ? 'إجراءات حفظ الإعدادات' : 'Settings save actions'}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="sys-settings-actions__inner">
        <div className="sys-settings-actions__buttons">
          <button
            type="button"
            className="gis-btn gis-btn-primary sys-settings-actions__btn sys-settings-actions__btn--icon-only"
            onClick={() => void handleSave()}
            title={language === 'ar' ? 'حفظ الإعدادات' : 'Save settings'}
            aria-label={language === 'ar' ? 'حفظ الإعدادات' : 'Save settings'}
          >
            <i className="fa-solid fa-check" aria-hidden />
          </button>
          <button
            type="button"
            className="gis-btn gis-btn-outline sys-settings-actions__btn sys-settings-actions__btn--icon-only"
            onClick={handleCancel}
            disabled={!settingsDirty}
            title={language === 'ar' ? 'تجاهل التعديلات واسترجاع آخر نسخة محفوظة' : 'Discard edits and reload last saved'}
            aria-label={language === 'ar' ? 'تجاهل التعديلات' : 'Discard changes'}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
          <button
            type="button"
            className="gis-btn gis-btn-outline sys-settings-actions__btn sys-settings-actions__btn--danger sys-settings-actions__btn--icon-only"
            onClick={() => setConfirmReset(true)}
            title={language === 'ar' ? 'استعادة إعدادات المصنع' : 'Restore factory defaults'}
            aria-label={language === 'ar' ? 'استعادة إعدادات المصنع' : 'Reset to defaults'}
          >
            <i className="fa-solid fa-rotate-left" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  )

  return (
    <div className="gis-page-padding sys-settings">
      <div className="sys-settings-shell">
        <div className="sys-settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`sys-settings-tab ${tab === id ? 'sys-settings-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span className="sys-settings-tab__icon" aria-hidden>
                <i className={icon} />
              </span>
              {id === 'api-tokens' && language === 'ar'
                ? 'رموز API'
                : id === 'signup-roles' && language === 'ar'
                  ? 'التسجيل والأدوار'
                  : label}
            </button>
          ))}
        </div>

      <section className="sys-settings-panel sys-settings-panel--unified">
      {tab === 'theme' ? (
        <div className="sys-settings-tab-pane">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-brush" aria-hidden />
              Appearance
            </h2>
            <p className="sys-settings-panel__desc">
              Choose a base theme. Custom applies your brand color across buttons and accents while keeping a light shell.
            </p>
          </div>

          <span className="sys-field-label">Mode</span>
          <div className="sys-theme-picks" role="radiogroup" aria-label="Theme mode">
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'system'}
              className={`sys-theme-pick ${draft.themeMode === 'system' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'system' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-desktop" />
              </span>
              System
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'light'}
              className={`sys-theme-pick ${draft.themeMode === 'light' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'light' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-sun" />
              </span>
              Light
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'dark'}
              className={`sys-theme-pick ${draft.themeMode === 'dark' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'dark' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-moon" />
              </span>
              Dark
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'custom'}
              className={`sys-theme-pick ${draft.themeMode === 'custom' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'custom' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-droplet" />
              </span>
              Custom
            </button>
          </div>

          {draft.themeMode === 'custom' ? (
            <div className="sys-color-editor">
              <span className="sys-field-label">Primary brand color</span>
              <div className="sys-color-row">
                <div className="sys-color-swatch" title="Pick color">
                  <input
                    type="color"
                    value={draft.customPrimaryHex.match(/^#[0-9A-Fa-f]{6}$/) ? draft.customPrimaryHex : '#047857'}
                    onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                    aria-label="Pick primary color"
                  />
                </div>
                <div className="sys-color-hex">
                  <label htmlFor="sys-theme-hex" className="sys-field-label">
                    Hex value
                  </label>
                  <input
                    id="sys-theme-hex"
                    className="gis-input"
                    value={draft.customPrimaryHex}
                    onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                    placeholder="#047857"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {inlineSettingsActions}
        </div>
      ) : null}

      {tab === 'logos' ? (
        <div className="sys-settings-tab-pane">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-images" aria-hidden />
              Logo management
            </h2>
            <p className="sys-settings-panel__desc">
              PNG or SVG recommended. Files are stored locally in your browser as Data URLs — ideal for branded headers.
            </p>
          </div>

          <div className="sys-logo-grid">
            <div>
              <span className="sys-field-label">App logo icon</span>
              <label className="sys-logo-zone">
                <input
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload('logoIcon', e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {draft.logoIcon ? (
                    <>
                      <img src={draft.logoIcon} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className="fa-solid fa-leaf" />
                      </div>
                      <div className="sys-logo-zone__title">Upload icon</div>
                      <div className="sys-logo-zone__hint">Used in header logo icon area</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, logoIcon: '' }))}>
                  Clear
                </button>
              </div>
            </div>
            <div>
              <span className="sys-field-label">Light theme header</span>
              <label className="sys-logo-zone">
                <input
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload('logoLight', e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {draft.logoLight ? (
                    <>
                      <img src={draft.logoLight} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </div>
                      <div className="sys-logo-zone__title">Upload logo</div>
                      <div className="sys-logo-zone__hint">Click or tap to choose a file</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, logoLight: '' }))}>
                  Clear
                </button>
              </div>
            </div>
            <div>
              <span className="sys-field-label">Dark theme header</span>
              <label className="sys-logo-zone">
                <input
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload('logoDark', e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {draft.logoDark ? (
                    <>
                      <img src={draft.logoDark} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </div>
                      <div className="sys-logo-zone__title">Upload logo</div>
                      <div className="sys-logo-zone__hint">Often a lighter mark on dark chrome</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, logoDark: '' }))}>
                  Clear
                </button>
              </div>
            </div>
          </div>
          {inlineSettingsActions}
        </div>
      ) : null}

      {tab === 'nav' ? (
        <div className="sys-settings-tab-pane">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-route" aria-hidden />
              Navigation menu
            </h2>
            <p className="sys-settings-panel__desc">
              Override labels (EN/AR), Font Awesome icon classes, and visibility. Drag rows to reorder groups or items.
              Use <strong>Link Management</strong> to bind in-app routes to external URLs.
            </p>
          </div>

          <LinkManagementSection
            language={language}
            pages={draft.customPages}
            onAdd={addPageLink}
            onUpdate={updatePage}
            onRemove={removePage}
          />

          <hr className="sys-divider" />

          {dataNavGroup ? (
            <section
              id="nav-group-data-settings"
              className="sys-nav-data"
              aria-labelledby="nav-group-data-heading"
            >
              <div className="sys-nav-data__top">
                <div>
                  <span className="sys-nav-data__badge">nav-group-data</span>
                  <h3 id="nav-group-data-heading" className="sys-nav-data__h">
                    Operations / Data
                  </h3>
                  <p className="sys-nav-data__p">
                    Sidebar flyout DOM id <code style={{ fontSize: '0.85em' }}>nav-group-data</code> — irrigation, EC/pH,
                    harvest, QHIS, production routes under{' '}
                    <code>/data/…</code>.
                  </p>
                </div>
              </div>
              <NavGroupEditor
                groupDef={dataNavGroup}
                draft={draft}
                updateNavOverride={updateNavOverride}
                reorderItem={reorderItem}
              />
            </section>
          ) : null}

          <div style={{ marginBottom: 22 }}>
            <p className="sys-section-label">Sidebar group order</p>
            <ul className="sys-drag-list">
              {(draft.navGroupOrder.length ? draft.navGroupOrder : NAV_DEFAULT_GROUPS.map(g => g.id)).map((gid, idx) => (
                <li
                  key={gid}
                  className="sys-drag-row"
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/group', String(idx))
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const from = Number(e.dataTransfer.getData('text/group'))
                    if (!Number.isFinite(from)) return
                    reorderGroups(from, idx)
                  }}
                >
                  <span className="sys-drag-row__handle" aria-hidden>
                    <i className="fa-solid fa-grip-vertical" />
                  </span>
                  {gid}
                  {gid === 'data' ? <span className="sys-drag-row__hint">Operations · see section above</span> : null}
                </li>
              ))}
            </ul>
          </div>

          <hr className="sys-divider" />

          <label className="sys-field-label" htmlFor="sys-nav-other-group" style={{ display: 'block', marginBottom: 8 }}>
            Edit another group
          </label>
          <select
            id="sys-nav-other-group"
            className="gis-input"
            style={{ display: 'block', width: '100%', maxWidth: 400, marginBottom: 16 }}
            value={navPickGroup}
            onChange={e => setNavPickGroup(e.target.value)}
          >
            {navGroupsExceptData.map(g => (
              <option key={g.id} value={g.id}>
                {g.id}
              </option>
            ))}
          </select>

          {currentGroupDef ? (
            <NavGroupEditor
              groupDef={currentGroupDef}
              draft={draft}
              updateNavOverride={updateNavOverride}
              reorderItem={reorderItem}
            />
          ) : null}
          {inlineSettingsActions}
        </div>
      ) : null}

      {tab === 'pages' ? (
        <div className="sys-settings-tab-pane">
          <div className="sys-pages-head">
            <div>
              <h2>Dynamic pages</h2>
              <p>
                Register routes and choose which sidebar group they appear under — same flyout ids as the manifest (
                <code dir="ltr">nav-group-data</code>, <code dir="ltr">nav-group-sensors</code>, …). For external URLs,
                use <strong>Navigation → Link Management → Add Page Link</strong>.
              </p>
            </div>
            <button type="button" className="gis-btn gis-btn-primary sys-pages-add" onClick={addPage}>
              <i className="fa-solid fa-plus" aria-hidden />
              Add page
            </button>
          </div>

          <div className="sys-pages-toolbar">
            <label className="sys-pages-toolbar__search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                className="gis-input"
                value={pageQuery}
                onChange={e => setPageQuery(e.target.value)}
                placeholder="Search by name, path, or group…"
              />
            </label>
            <select
              className="gis-input"
              value={pageGroupFilter}
              onChange={e => setPageGroupFilter(e.target.value)}
              aria-label="Filter pages by sidebar group"
            >
              <option value="all">All groups</option>
              {NAV_GROUP_IDS.map(gid => (
                <option key={gid} value={gid}>{gid}</option>
              ))}
            </select>
            <span className="sys-pages-toolbar__count">
              {pageRows.length} / {draft.customPages.length} pages
            </span>
          </div>

          {draft.customPages.length === 0 ? (
            <div className="sys-empty-state">
              <i className="fa-solid fa-circle-plus" aria-hidden />
              No custom pages yet. Use <strong>Add page</strong> to register a path and bind it to a screen.
            </div>
          ) : pageRows.length === 0 ? (
            <div className="sys-empty-state">
              <i className="fa-solid fa-filter-circle-xmark" aria-hidden />
              No pages match your current search/filter.
            </div>
          ) : (
            <div className="sys-pages-list">
              {pageRows.map(({ page: p, index: rowIdx }) => (
                <article
                  key={p.id}
                  className="sys-page-card"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const from = Number(e.dataTransfer.getData('text/page-row-abs'))
                    if (!Number.isFinite(from)) return
                    reorderPages(from, rowIdx)
                  }}
                >
                  <div
                    className="sys-page-card__drag"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/page-row-abs', String(rowIdx))
                    }}
                    title="Drag to reorder"
                    aria-hidden
                  >
                    <i className="fa-solid fa-grip-vertical" style={{ fontSize: 18 }} />
                  </div>
                  <div className="sys-page-card__main">
                    <div className="sys-page-card__topbar">
                      <span className="sys-page-card__index">#{rowIdx + 1}</span>
                      <div className="sys-page-card__quick-actions">
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => movePageByDelta(rowIdx, -1)} disabled={rowIdx === 0}>
                          <i className="fa-solid fa-arrow-up" aria-hidden /> Up
                        </button>
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => movePageByDelta(rowIdx, 1)} disabled={rowIdx === draft.customPages.length - 1}>
                          <i className="fa-solid fa-arrow-down" aria-hidden /> Down
                        </button>
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => duplicatePage(p.id)}>
                          <i className="fa-solid fa-copy" aria-hidden /> Duplicate
                        </button>
                      </div>
                    </div>
                    <div className="sys-page-card__grid">
                      <div className="sys-page-field">
                        <label htmlFor={`page-name-${p.id}`}>Display name (EN)</label>
                        <input
                          id={`page-name-${p.id}`}
                          className="gis-input"
                          value={p.name}
                          onChange={e => updatePage(p.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-name-ar-${p.id}`}>Display name (AR)</label>
                        <input
                          id={`page-name-ar-${p.id}`}
                          className="gis-input"
                          dir="rtl"
                          placeholder={p.name}
                          value={p.nameAr ?? ''}
                          onChange={e => updatePage(p.id, { nameAr: e.target.value })}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-path-${p.id}`}>Route path</label>
                        <input
                          id={`page-path-${p.id}`}
                          className="gis-input"
                          dir="ltr"
                          value={p.path}
                          onChange={e => updatePage(p.id, { path: e.target.value })}
                          spellCheck={false}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-bind-${p.id}`}>Bind target</label>
                        <select
                          id={`page-bind-${p.id}`}
                          className="gis-input"
                          value={p.bindTarget}
                          onChange={e =>
                            updatePage(p.id, { bindTarget: e.target.value as CustomPageRecord['bindTarget'] })
                          }
                        >
                          <option value="placeholder">Placeholder</option>
                          <option value="home">Home</option>
                          <option value="gis">GIS Map</option>
                          <option value="satellite-indices">Satellite Intelligence</option>
                          <option value="dashboards-overview">Dashboard overview</option>
                          <option value="external">External URL (page link)</option>
                        </select>
                      </div>
                      {p.bindTarget === 'external' ? (
                        <div className="sys-page-field sys-page-field--wide">
                          <label htmlFor={`page-exturl-${p.id}`}>External URL</label>
                          <input
                            id={`page-exturl-${p.id}`}
                            className="gis-input"
                            dir="ltr"
                            type="url"
                            placeholder="https://"
                            value={p.externalUrl ?? ''}
                            onChange={e => updatePage(p.id, { externalUrl: e.target.value })}
                            spellCheck={false}
                          />
                        </div>
                      ) : null}
                      <div className="sys-page-field">
                        <label htmlFor={`page-navgrp-${p.id}`}>Sidebar group</label>
                        <select
                          id={`page-navgrp-${p.id}`}
                          className="gis-input"
                          value={p.navGroupId || 'data'}
                          onChange={e => updatePage(p.id, { navGroupId: e.target.value })}
                        >
                          {NAV_GROUP_IDS.map(gid => (
                            <option key={gid} value={gid}>
                              {gid === 'data'
                                ? 'Operations / Data (nav-group-data)'
                                : gid.charAt(0).toUpperCase() + gid.slice(1)}
                            </option>
                          ))}
                        </select>
                        <small style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ds-color-text-muted)' }}>
                          Flyout container id:{' '}
                          <code dir="ltr">{`nav-group-${p.navGroupId || 'data'}`}</code>
                        </small>
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-subcls-${p.id}`}>Sublist row CSS (<code dir="ltr">subitemClass</code>)</label>
                        <input
                          id={`page-subcls-${p.id}`}
                          className="gis-input"
                          dir="ltr"
                          placeholder="Leave empty for auto (same style as group default)"
                          value={p.subitemClass ?? ''}
                          onChange={e => updatePage(p.id, { subitemClass: e.target.value })}
                          spellCheck={false}
                          list={`page-subcls-datalist-${p.id}`}
                        />
                        <datalist id={`page-subcls-datalist-${p.id}`}>
                          {(NAV_DEFAULT_GROUPS.find(g => g.id === (p.navGroupId || 'data'))?.children ?? []).map(leaf => (
                            <option key={leaf.id} value={leaf.subitemClass} />
                          ))}
                        </datalist>
                        <small style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ds-color-text-muted)' }}>
                          Pick a built-in row class from suggestions or type your own — matches{' '}
                          <code dir="ltr">nav-item-*</code> entries under this group&apos;s sublist.
                        </small>
                      </div>
                    </div>

                    <div className="sys-page-field" style={{ marginTop: 14 }}>
                      <label htmlFor={`page-icon-${p.id}`}>Icon (Font Awesome class)</label>
                      <div className="sys-page-iconrow">
                        <span className="sys-page-icon-preview" aria-hidden>
                          <i className={p.iconClass || 'fa-solid fa-file'} />
                        </span>
                        <input
                          id={`page-icon-${p.id}`}
                          className="gis-input"
                          style={{ flex: 1, minWidth: 140 }}
                          value={p.iconClass}
                          onChange={e => updatePage(p.id, { iconClass: e.target.value })}
                          spellCheck={false}
                          placeholder="fa-solid fa-file"
                        />
                      </div>
                      <div className="sys-page-icon-chips" style={{ marginTop: 10 }}>
                        {PAGE_ICON_PRESETS.map(ic => (
                          <button
                            key={ic}
                            type="button"
                            className="sys-page-icon-chip"
                            title={ic}
                            aria-label={`Use icon ${ic}`}
                            onClick={() => updatePage(p.id, { iconClass: ic })}
                          >
                            <i className={ic} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sys-page-actions">
                      <label className="sys-page-visible">
                        <input
                          type="checkbox"
                          checked={p.visible}
                          onChange={e => updatePage(p.id, { visible: e.target.checked })}
                        />
                        Visible in app routes
                      </label>
                      <button
                        type="button"
                        className="gis-btn gis-btn-outline sys-btn-icon-danger"
                        onClick={() => removePage(p.id)}
                      >
                        <i className="fa-solid fa-trash" aria-hidden style={{ marginInlineEnd: 6 }} />
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {inlineSettingsActions}
        </div>
      ) : null}

      {tab === 'signup-roles' ? (
        <div className="sys-settings-tab-pane">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-user-plus" aria-hidden />
              {language === 'ar' ? 'التسجيل وكتالوج الأدوار' : 'Sign-up & directory roles'}
            </h2>
            <p className="sys-settings-panel__desc">
              {language === 'ar'
                ? 'الأدوار المفعّلة تظهر في شاشة إنشاء الحساب وفي قوائم الدور داخل إدارة المستخدمين. يبقى تقييد من يستطيع تعيين أي دور وفق صلاحيات المسؤول.'
                : 'Checked roles appear on public sign-up and in User Management role pickers. Who may assign each tier is still enforced by administrator permissions (for example, Admin Manager can only assign Editor or Viewer).'}
            </p>
          </div>
          <span className="sys-field-label">{language === 'ar' ? 'الأدوار المتاحة' : 'Roles offered'}</span>
          <div className="sys-role-catalog-list">
            {DIRECTORY_ROLES_CANONICAL.map(roleId => {
              const enabled = draft.directoryRoleCatalog.includes(roleId)
              return (
                <label key={roleId} className="sys-role-catalog-row">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => {
                      setDraft(d => {
                        const cur = new Set(d.directoryRoleCatalog)
                        if (cur.has(roleId)) {
                          if (cur.size <= 1) return d
                          cur.delete(roleId)
                        } else {
                          cur.add(roleId)
                        }
                        const next = DIRECTORY_ROLES_CANONICAL.filter(r => cur.has(r))
                        return {
                          ...d,
                          directoryRoleCatalog: next.length ? next : [...DIRECTORY_ROLES_CANONICAL],
                        }
                      })
                    }}
                  />
                  <span>{roleId}</span>
                </label>
              )
            })}
          </div>
          <p className="sys-settings-panel__desc" style={{ marginTop: 12 }}>
            {language === 'ar'
              ? 'يُنصح بإبقاء دور منخفض الصلاحية (مثل مشاهد) مفعّلاً إذا استخدمتم التسجيل الذاتي.'
              : 'Keep at least one lower-privilege role (for example Viewer) enabled if you use self-service registration.'}
          </p>
          {inlineSettingsActions}
        </div>
      ) : null}

      {tab === 'api-tokens' ? (
        <div className="sys-settings-tab-pane sys-api-tab">
          <header className="sys-api-hero">
            <div className="sys-api-hero__text">
              <h2 className="sys-api-hero__title">
                <span className="sys-api-hero__title-icon" aria-hidden>
                  <i className="fa-solid fa-key" />
                </span>
                {language === 'ar' ? 'رموز API' : 'API Tokens'}
              </h2>
            </div>
            <button
              type="button"
              className="sys-api-add-btn"
              onClick={() => {
                resetAddApiForm()
                setAddApiModalOpen(true)
              }}
            >
              <i className="fa-solid fa-plus" aria-hidden />
              {language === 'ar' ? 'إضافة رموز API' : 'Add API Tokens'}
            </button>
          </header>

          <section className="sys-api-section" aria-labelledby="sys-api-built-in-heading">
            <div className="sys-api-section__head">
              <h3 id="sys-api-built-in-heading" className="sys-api-section__title">
                {language === 'ar' ? 'التكاملات المدمجة' : 'Built-in integrations'}
              </h3>
            </div>
          <div className="sys-api-tokens-grid">
            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-map" aria-hidden />
                Mapbox
              </h3>
              {mapboxTokenFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'متاح من البناء:' : 'Available from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'يُستخدم VITE_MAPBOX_TOKEN أو VITE_MAPBOX_ACCESS_TOKEN إذا لم يكن هناك مفتاح محفوظ في هذا المتصفح؛ القيمة المحفوظة أدناه تتقدم عليهما.'
                    : 'VITE_MAPBOX_TOKEN or VITE_MAPBOX_ACCESS_TOKEN is used when this browser has no saved token; a token saved below takes precedence.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-mapbox-token"
                label={language === 'ar' ? 'مفتاح Mapbox (المتصفح + الخادم)' : 'Mapbox token (browser + server)'}
                value={mapboxTokenDraft}
                onChange={setMapboxTokenDraft}
                placeholder={language === 'ar' ? 'pk.eyJ1I…' : 'pk.eyJ1I…'}
                password
                onSave={async () => {
                  persistMapboxAccessTokenInBrowser(mapboxTokenDraft)
                  const r = await persistApiSecretsPatchToServer({ mapboxToken: mapboxTokenDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ مفتاح Mapbox على الخادم والمتصفح.'
                        : 'Mapbox token saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم (تأكد من تشغيل API).'
                        : 'Saved in this browser; server copy not updated (is the API running?).',
                  )
                }}
                onClear={async () => {
                  persistMapboxAccessTokenInBrowser('')
                  setMapboxTokenDraft('')
                  const r = await persistApiSecretsPatchToServer({ mapboxToken: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل مفتاح Mapbox من الخادم والمتصفح.'
                        : 'Mapbox token cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server copy may still exist until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ مفتاح Mapbox' : 'Save Mapbox token'}
                clearAria={language === 'ar' ? 'مسح مفتاح Mapbox' : 'Clear Mapbox token'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات مفتاح Mapbox' : 'Mapbox token actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'مطلوب لـ Mapbox GL (خرائط الاستخبارات والـ Globe). بعد الحفظ تُحدَّث الخرائط فوراً.'
                  : 'Required for Mapbox GL (Satellite intelligence & globe). Maps refresh after save.'}
              </p>
            </div>

            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-globe" aria-hidden />
                ArcGIS API
              </h3>
              {arcgisTokenFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar' ? 'VITE_ARCGIS_PORTAL_TOKEN يتقدم على الحقل أدناه.' : 'VITE_ARCGIS_PORTAL_TOKEN overrides the field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-arcgis-token"
                label={language === 'ar' ? 'رمز ArcGIS / Portal (المتصفح + الخادم)' : 'ArcGIS / Portal token (browser + server)'}
                value={arcgisTokenDraft}
                onChange={setArcgisTokenDraft}
                placeholder={language === 'ar' ? 'رمز REST أو OAuth…' : 'REST or OAuth token…'}
                password
                onSave={async () => {
                  persistArcgisPortalTokenInBrowser(arcgisTokenDraft)
                  const r = await persistApiSecretsPatchToServer({ arcgisPortalToken: arcgisTokenDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ رمز ArcGIS على الخادم والمتصفح.'
                        : 'ArcGIS token saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistArcgisPortalTokenInBrowser('')
                  setArcgisTokenDraft('')
                  const r = await persistApiSecretsPatchToServer({ arcgisPortalToken: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل رمز ArcGIS من الخادم والمتصفح.'
                        : 'ArcGIS token cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ رمز ArcGIS' : 'Save ArcGIS token'}
                clearAria={language === 'ar' ? 'مسح رمز ArcGIS' : 'Clear ArcGIS token'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات رمز ArcGIS' : 'ArcGIS token actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'يُستخدم لخدمات ArcGIS المحمية (مثل Feature Service وImageServer) عند الاستيراد من الرابط أو الخريطة. يمكن تركه فارغاً للخدمات العامة.'
                  : 'Used for secured ArcGIS REST layers (Feature Service, ImageServer from URL, etc.). Leave empty for public services only.'}
              </p>
            </div>

            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-cloud-sun" aria-hidden />
                Open Weather Map
              </h3>
              {openWeatherMapApiKeyFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'متاح من البناء:' : 'Available from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'يُستخدم VITE_OPENWEATHER_API_KEY إذا لم يكن هناك مفتاح محفوظ في هذا المتصفح؛ القيمة المحفوظة أدناه تتقدم عليه.'
                    : 'VITE_OPENWEATHER_API_KEY is used when this browser has no saved key; a key saved below takes precedence.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-openweathermap-api-key"
                label={
                  language === 'ar'
                    ? 'مفتاح OpenWeatherMap API (المتصفح + الخادم)'
                    : 'OpenWeatherMap API key (browser + server)'
                }
                value={openWeatherMapApiKeyDraft}
                onChange={setOpenWeatherMapApiKeyDraft}
                placeholder={language === 'ar' ? 'مفتاح API…' : 'API key…'}
                password
                onSave={async () => {
                  persistOpenWeatherMapApiKeyInBrowser(openWeatherMapApiKeyDraft)
                  const r = await persistApiSecretsPatchToServer({
                    openWeatherMapApiKey: openWeatherMapApiKeyDraft.trim(),
                  })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ مفتاح OpenWeather على الخادم والمتصفح.'
                        : 'OpenWeatherMap API key saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistOpenWeatherMapApiKeyInBrowser('')
                  setOpenWeatherMapApiKeyDraft('')
                  const r = await persistApiSecretsPatchToServer({ openWeatherMapApiKey: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل مفتاح OpenWeather من الخادم والمتصفح.'
                        : 'OpenWeatherMap API key cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ مفتاح OpenWeatherMap' : 'Save OpenWeatherMap API key'}
                clearAria={language === 'ar' ? 'مسح مفتاح OpenWeatherMap' : 'Clear OpenWeatherMap API key'}
                actionsGroupLabel={
                  language === 'ar' ? 'إجراءات مفتاح OpenWeatherMap' : 'OpenWeatherMap API key actions'
                }
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'اختياري: يُستخدم لسياق الطقس في Geo AI (الحالي والتوقعات القصيرة) عبر api.openweathermap.org. بدون مفتاح يبقى Open-Meteo فقط.'
                  : 'Optional: enriches Geo AI weather context (current + short forecast) via api.openweathermap.org. Without a key, Open-Meteo-only context is used.'}
              </p>
            </div>

            <div id="sentinel-api-tokens" className="sys-api-tokens-card sys-api-tokens-card--wide">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-satellite" aria-hidden />
                {language === 'ar' ? 'رموز Sentinel API' : 'Sentinel API tokens'}
              </h3>
              <p className="sys-settings-panel__desc sys-settings-api-envnote sys-settings-api-lead">
                {language === 'ar'
                  ? 'رمز وصول Sentinel Hub (اختياري) ثم معرّف مثيل WMS لطبقات Sentinel-2.'
                  : 'Optional Sentinel Hub access token, then WMS instance UUID for Sentinel-2 overlays.'}
              </p>

              {sentinelAccessFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'VITE_SENTINEL_HUB_ACCESS_TOKEN يتقدم على حقل رمز الوصول أدناه.'
                    : 'VITE_SENTINEL_HUB_ACCESS_TOKEN overrides the access token field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-sentinel-hub-access"
                label={language === 'ar' ? 'رمز وصول Sentinel Hub (المتصفح + الخادم)' : 'Sentinel Hub access token (browser + server)'}
                value={sentinelAccessDraft}
                onChange={setSentinelAccessDraft}
                placeholder={language === 'ar' ? 'OAuth / Process API…' : 'OAuth / Process API…'}
                password
                onSave={async () => {
                  persistSentinelHubAccessTokenInBrowser(sentinelAccessDraft)
                  const r = await persistApiSecretsPatchToServer({ sentinelHubAccessToken: sentinelAccessDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ رمز Sentinel Hub على الخادم والمتصفح.'
                        : 'Sentinel Hub access token saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistSentinelHubAccessTokenInBrowser('')
                  setSentinelAccessDraft('')
                  const r = await persistApiSecretsPatchToServer({ sentinelHubAccessToken: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل رمز Sentinel من الخادم والمتصفح.'
                        : 'Sentinel Hub access token cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ رمز وصول Sentinel Hub' : 'Save Sentinel Hub access token'}
                clearAria={language === 'ar' ? 'مسح رمز وصول Sentinel Hub' : 'Clear Sentinel Hub access token'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات رمز Sentinel' : 'Sentinel Hub access token actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'للاستدعاءات المصادق عليها على Sentinel Hub (مثل Process API). اتركه فارغاً إن لم تكن بحاجة إليه.'
                  : 'For authenticated Sentinel Hub REST usage (e.g. Process API). Leave empty if you do not need it.'}
              </p>

              {sentinelHubInstanceFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'VITE_SENTINEL_HUB_WMS_INSTANCE_ID يتقدم على حقل معرّف المثيل أدناه.'
                    : 'VITE_SENTINEL_HUB_WMS_INSTANCE_ID overrides the instance field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-sentinel-hub-instance"
                label={language === 'ar' ? 'معرّف مثيل WMS (المتصفح + الخادم)' : 'WMS instance ID (browser + server)'}
                value={sentinelHubInstanceDraft}
                onChange={setSentinelHubInstanceDraft}
                placeholder="60de79ca-16a7-4afd-bcbd-0261bf0156fa"
                onSave={async () => {
                  persistSentinelHubWmsInstanceIdInBrowser(sentinelHubInstanceDraft)
                  const r = await persistApiSecretsPatchToServer({ sentinelHubWmsInstanceId: sentinelHubInstanceDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ معرّف Sentinel Hub على الخادم والمتصفح.'
                        : 'Sentinel Hub WMS instance ID saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistSentinelHubWmsInstanceIdInBrowser('')
                  setSentinelHubInstanceDraft('')
                  const r = await persistApiSecretsPatchToServer({ sentinelHubWmsInstanceId: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل معرّف Sentinel Hub من الخادم والمتصفح.'
                        : 'Sentinel Hub instance ID cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ معرّف Sentinel Hub' : 'Save Sentinel Hub instance ID'}
                clearAria={language === 'ar' ? 'مسح معرّف Sentinel Hub' : 'Clear Sentinel Hub instance ID'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات معرّف WMS' : 'Sentinel Hub WMS instance actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'معرّف مثيل Sentinel Hub لـ OGC WMS في خرائط الاستخبارات. اتركه فارغاً للقيمة الافتراضية.'
                  : 'Sentinel Hub OGC WMS instance UUID for Sentinel-2 overlays in Satellite Intelligence. Leave empty for the app default.'}
              </p>
            </div>

            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
                {language === 'ar' ? 'Google Gemini (السحابة)' : 'Google Gemini (Cloud AI)'}
              </h3>
              {geminiApiKeyFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'VITE_GEMINI_API_KEY يتقدم على الحقل أدناه.'
                    : 'VITE_GEMINI_API_KEY overrides the field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-gemini-api-key"
                label={language === 'ar' ? 'مفتاح Gemini API (المتصفح + الخادم)' : 'Gemini API key (browser + server)'}
                value={geminiApiKeyDraft}
                onChange={setGeminiApiKeyDraft}
                placeholder={language === 'ar' ? 'مفتاح Google AI…' : 'Google AI API key…'}
                password
                onSave={async () => {
                  persistGeminiApiKeyInBrowser(geminiApiKeyDraft)
                  const r = await persistApiSecretsPatchToServer({ geminiApiKey: geminiApiKeyDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ مفتاح Gemini على الخادم والمتصفح.'
                        : 'Gemini API key saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistGeminiApiKeyInBrowser('')
                  setGeminiApiKeyDraft('')
                  const r = await persistApiSecretsPatchToServer({ geminiApiKey: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل مفتاح Gemini من الخادم والمتصفح.'
                        : 'Gemini API key cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ مفتاح Gemini API' : 'Save Gemini API key'}
                clearAria={language === 'ar' ? 'مسح مفتاح Gemini API' : 'Clear Gemini API key'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات مفتاح Gemini' : 'Gemini API key actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'مفتاح Google AI (Gemini) لـ Geo Explorer ولمحادثة AI Agro-Chat عند اختيار وضع السحابة. يُستخدم فور الحفظ.'
                  : 'Google AI (Gemini) key for Geo Explorer and for AI Agro-Chat when “Gemini (Cloud AI)” is selected. Used immediately after save.'}
              </p>
            </div>

            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-bolt" aria-hidden />
                {language === 'ar' ? 'واجهة DeepSeek API' : 'DeepSeek API'}
              </h3>
              {deepseekApiKeyFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'VITE_DEEPSEEK_API_KEY يتقدم على الحقل أدناه.'
                    : 'VITE_DEEPSEEK_API_KEY overrides the field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-deepseek-api-key"
                label={language === 'ar' ? 'مفتاح DeepSeek API (المتصفح + الخادم)' : 'DeepSeek API key (browser + server)'}
                value={deepseekApiKeyDraft}
                onChange={setDeepseekApiKeyDraft}
                placeholder={language === 'ar' ? 'sk-…' : 'sk-…'}
                password
                onSave={async () => {
                  persistDeepseekApiKeyInBrowser(deepseekApiKeyDraft)
                  const r = await persistApiSecretsPatchToServer({ deepseekApiKey: deepseekApiKeyDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ مفتاح DeepSeek على الخادم والمتصفح.'
                        : 'DeepSeek API key saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistDeepseekApiKeyInBrowser('')
                  setDeepseekApiKeyDraft('')
                  const r = await persistApiSecretsPatchToServer({ deepseekApiKey: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل مفتاح DeepSeek من الخادم والمتصفح.'
                        : 'DeepSeek API key cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ مفتاح DeepSeek' : 'Save DeepSeek API key'}
                clearAria={language === 'ar' ? 'مسح مفتاح DeepSeek' : 'Clear DeepSeek API key'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات مفتاح DeepSeek' : 'DeepSeek API key actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'اختياري لمحادثة AI Agro-Chat عند اختيار DeepSeek. الطرف: api.deepseek.com.'
                  : 'Optional: powers AI Agro-Chat when “DeepSeek” is selected. Endpoint: api.deepseek.com.'}
              </p>
            </div>

            <div className="sys-api-tokens-card">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-server" aria-hidden />
                {language === 'ar' ? 'Ollama (محلي)' : 'Ollama (local)'}
              </h3>
              <p className="sys-settings-panel__desc sys-settings-api-envnote">
                {language === 'ar'
                  ? 'لا يتطلب مفتاح API — يعمل محلياً. شغّل "ollama serve" ونزّل نموذجاً (مثل "ollama pull llama3.1").'
                  : 'No API key needed — runs locally. Start with "ollama serve" and pull a model (e.g. "ollama pull llama3.1").'}
              </p>
              <ApiTokenMergeField
                id="sys-ollama-base-url"
                label={language === 'ar' ? 'عنوان خادم Ollama' : 'Ollama server URL'}
                value={ollamaBaseUrlDraft}
                onChange={setOllamaBaseUrlDraft}
                placeholder={DEFAULT_OLLAMA_BASE_URL}
                onSave={async () => {
                  persistOllamaBaseUrlInBrowser(ollamaBaseUrlDraft)
                  pushToast(
                    'success',
                    language === 'ar' ? 'تم حفظ عنوان خادم Ollama في هذا المتصفح.' : 'Ollama server URL saved in this browser.',
                  )
                }}
                onClear={async () => {
                  persistOllamaBaseUrlInBrowser('')
                  setOllamaBaseUrlDraft('')
                  pushToast(
                    'success',
                    language === 'ar' ? 'تمت إعادة عنوان Ollama إلى الافتراضي.' : 'Ollama server URL reset to default.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ عنوان Ollama' : 'Save Ollama server URL'}
                clearAria={language === 'ar' ? 'مسح عنوان Ollama' : 'Clear Ollama server URL'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات عنوان Ollama' : 'Ollama server URL actions'}
              />
              <ApiTokenMergeField
                id="sys-ollama-model"
                label={language === 'ar' ? 'نموذج Ollama' : 'Ollama model'}
                value={ollamaModelDraft}
                onChange={setOllamaModelDraft}
                placeholder={DEFAULT_OLLAMA_MODEL}
                onSave={async () => {
                  persistOllamaModelInBrowser(ollamaModelDraft)
                  pushToast(
                    'success',
                    language === 'ar' ? 'تم حفظ نموذج Ollama في هذا المتصفح.' : 'Ollama model saved in this browser.',
                  )
                }}
                onClear={async () => {
                  persistOllamaModelInBrowser('')
                  setOllamaModelDraft('')
                  pushToast(
                    'success',
                    language === 'ar' ? 'تمت إعادة نموذج Ollama إلى الافتراضي.' : 'Ollama model reset to default.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ نموذج Ollama' : 'Save Ollama model'}
                clearAria={language === 'ar' ? 'مسح نموذج Ollama' : 'Clear Ollama model'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات نموذج Ollama' : 'Ollama model actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'يشغّل تبويب Geo AI → Ollama محلياً وبدون اتصال. الافتراضي: http://localhost:11434 · llama3.1.'
                  : 'Powers Geo AI → Ollama tab locally / offline. Defaults: http://localhost:11434 · llama3.1.'}
              </p>
            </div>

            <div className="sys-api-tokens-card sys-api-tokens-card--wide">
              <h3 className="sys-settings-panel__title sys-settings-api-h3">
                <i className="fa-solid fa-robot" aria-hidden />
                {language === 'ar' ? 'Claude API (Anthropic)' : 'Claude API (Anthropic)'}
              </h3>
              {claudeApiKeyFromEnv ? (
                <p className="sys-settings-panel__desc sys-settings-api-envnote">
                  <strong>{language === 'ar' ? 'نشط من البناء:' : 'Active from build:'}</strong>{' '}
                  {language === 'ar'
                    ? 'VITE_CLAUDE_API_KEY يتقدم على الحقل أدناه.'
                    : 'VITE_CLAUDE_API_KEY overrides the field below.'}
                </p>
              ) : null}
              <ApiTokenMergeField
                id="sys-claude-api-key"
                label={language === 'ar' ? 'مفتاح Claude API (المتصفح + الخادم)' : 'Claude API key (browser + server)'}
                value={claudeApiKeyDraft}
                onChange={setClaudeApiKeyDraft}
                placeholder={language === 'ar' ? 'sk-ant-api03-…' : 'sk-ant-api03-…'}
                password
                onSave={async () => {
                  persistClaudeApiKeyInBrowser(claudeApiKeyDraft)
                  const r = await persistApiSecretsPatchToServer({ claudeApiKey: claudeApiKeyDraft.trim() })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'تم حفظ مفتاح Claude على الخادم والمتصفح.'
                        : 'Claude API key saved on server and in this browser.'
                      : language === 'ar'
                        ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Saved in this browser; server copy not updated.',
                  )
                }}
                onClear={async () => {
                  persistClaudeApiKeyInBrowser('')
                  setClaudeApiKeyDraft('')
                  const r = await persistApiSecretsPatchToServer({ claudeApiKey: '' })
                  pushToast(
                    'success',
                    r.ok
                      ? language === 'ar'
                        ? 'أُزيل مفتاح Claude من الخادم والمتصفح.'
                        : 'Claude API key cleared on server and in this browser.'
                      : language === 'ar'
                        ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                        : 'Cleared in this browser; server may be unchanged until API is reachable.',
                  )
                }}
                saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                saveAria={language === 'ar' ? 'حفظ مفتاح Claude API' : 'Save Claude API key'}
                clearAria={language === 'ar' ? 'مسح مفتاح Claude API' : 'Clear Claude API key'}
                actionsGroupLabel={language === 'ar' ? 'إجراءات مفتاح Claude' : 'Claude API key actions'}
              />
              <p className="sys-settings-panel__desc sys-settings-api-hint">
                {language === 'ar'
                  ? 'يُفعّل Geo AI Chat في استخبارات الأقمار: يفسّر الطبقات والحقول بناءً على ما هو محفوظ في GIS Map (GIS Content) ولقطة بيانات لوحة التطوير → Data فقط، دون اختلاق قيم.'
                  : 'Powers Geo AI Chat in Satellite Intelligence: answers use only GIS Map saved layers (GIS Content) plus the Develop Dashboard → Data snapshot—no invented field values. Save the key here or use VITE_CLAUDE_API_KEY at build time.'}
              </p>
            </div>

            {draft.customApiTokenSlots.map(slot => {
              const cardTitle = language === 'ar' && slot.titleAr ? slot.titleAr : slot.title
              const cardDesc = language === 'ar' && slot.descriptionAr ? slot.descriptionAr : slot.description
              const fLabel = language === 'ar' && slot.fieldLabelAr ? slot.fieldLabelAr : slot.fieldLabel
              const ph =
                language === 'ar' && slot.placeholderAr ? slot.placeholderAr : slot.placeholder ?? ''
              return (
                <div key={slot.id} className="sys-api-tokens-card sys-api-tokens-card--custom">
                  <div className="sys-api-card-head">
                    <h3 className="sys-settings-panel__title sys-settings-api-h3 sys-api-card-head__title">
                      <i className={slot.iconClass} aria-hidden />
                      {cardTitle}
                    </h3>
                    <button
                      type="button"
                      className="sys-api-card-remove"
                      onClick={() => removeCustomApiSlot(slot.id)}
                      title={language === 'ar' ? 'حذف البطاقة' : 'Remove card'}
                      aria-label={language === 'ar' ? 'حذف بطاقة الرمز' : 'Remove API token card'}
                    >
                      <i className="fa-solid fa-trash" aria-hidden />
                    </button>
                  </div>
                  {cardDesc ? <p className="sys-settings-panel__desc sys-api-card-lead">{cardDesc}</p> : null}
                  <ApiTokenMergeField
                    id={`sys-custom-api-${slot.id}`}
                    label={fLabel}
                    value={customUserTokenDrafts[slot.id] ?? ''}
                    onChange={next =>
                      setCustomUserTokenDrafts(p => ({
                        ...p,
                        [slot.id]: next,
                      }))
                    }
                    placeholder={ph || (language === 'ar' ? '••••••••' : '••••••••')}
                    password
                    onSave={async () => {
                      const v = customUserTokenDrafts[slot.id] ?? ''
                      persistUserApiTokenValue(slot.id, v)
                      const r = await persistApiSecretsPatchToServer({ customSlots: { [slot.id]: v.trim() } })
                      pushToast(
                        'success',
                        r.ok
                          ? language === 'ar'
                            ? 'تم الحفظ على الخادم والمتصفح.'
                            : 'Saved on server and in this browser.'
                          : language === 'ar'
                            ? 'حُفظ في المتصفح؛ تعذّر تحديث الخادم.'
                            : 'Saved in this browser; server copy not updated.',
                      )
                    }}
                    onClear={async () => {
                      persistUserApiTokenValue(slot.id, '')
                      setCustomUserTokenDrafts(p => ({ ...p, [slot.id]: '' }))
                      const r = await persistApiSecretsPatchToServer({ customSlots: { [slot.id]: '' } })
                      pushToast(
                        'success',
                        r.ok
                          ? language === 'ar'
                            ? 'تم المسح من الخادم والمتصفح.'
                            : 'Cleared on server and in this browser.'
                          : language === 'ar'
                            ? 'أُزيل من المتصفح؛ تعذّر تحديث الخادم.'
                            : 'Cleared in this browser; server may be unchanged until API is reachable.',
                      )
                    }}
                    saveTitle={language === 'ar' ? 'حفظ' : 'Save'}
                    clearTitle={language === 'ar' ? 'مسح' : 'Clear'}
                    saveAria={language === 'ar' ? 'حفظ السر' : 'Save secret'}
                    clearAria={language === 'ar' ? 'مسح السر' : 'Clear secret'}
                    actionsGroupLabel={language === 'ar' ? 'إجراءات السر' : 'Secret actions'}
                  />
                </div>
              )
            })}
          </div>
          </section>

          <section
            className="sys-api-section sys-api-section--settings-toolbar"
            aria-label={language === 'ar' ? 'إجراءات حفظ إعدادات النظام' : 'System settings save actions'}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            <div className="sys-api-settings-toolbar">
              <div
                role="status"
                className={`sys-api-settings-toolbar__status${settingsDirty ? ' sys-api-settings-toolbar__status--dirty' : ''}`}
                title={
                  settingsDirty
                    ? language === 'ar'
                      ? 'تغييرات غير محفوظة في إعدادات النظام (السمات، التنقل، البطاقات…)'
                      : 'Unsaved system settings (theme, navigation, cards…)'
                    : language === 'ar'
                      ? 'لا توجد تغييرات معلّقة على إعدادات النظام'
                      : 'No pending system settings changes'
                }
                aria-label={
                  settingsDirty
                    ? language === 'ar'
                      ? 'تغييرات غير محفوظة في إعدادات النظام'
                      : 'Unsaved system settings'
                    : language === 'ar'
                      ? 'لا توجد تغييرات معلّقة'
                      : 'No pending changes'
                }
              >
                <i
                  className={settingsDirty ? 'fa-solid fa-pen-to-square' : 'fa-solid fa-circle-check'}
                  aria-hidden
                />
              </div>
              <div className="sys-api-settings-toolbar__actions" role="group" aria-label={language === 'ar' ? 'أدوات الحفظ' : 'Save tools'}>
                <button
                  type="button"
                  className="sys-api-icon-btn sys-api-icon-btn--primary sys-api-icon-btn--toolbar"
                  onClick={() => void handleSave()}
                  title={language === 'ar' ? 'حفظ إعدادات النظام (السمات، التنقل، تعريف بطاقات API…)' : 'Save system settings (theme, nav, API card definitions…)'}
                  aria-label={language === 'ar' ? 'حفظ إعدادات النظام' : 'Save system settings'}
                >
                  <i className="fa-solid fa-floppy-disk" aria-hidden />
                </button>
                <button
                  type="button"
                  className="sys-api-icon-btn sys-api-icon-btn--toolbar sys-api-icon-btn--toolbar-muted"
                  onClick={handleCancel}
                  disabled={!settingsDirty}
                  title={language === 'ar' ? 'تجاهل التعديلات واسترجاع آخر نسخة محفوظة' : 'Discard edits and reload last saved'}
                  aria-label={language === 'ar' ? 'تجاهل التغييرات' : 'Discard changes'}
                >
                  <i className="fa-solid fa-ban" aria-hidden />
                </button>
                <button
                  type="button"
                  className="sys-api-icon-btn sys-api-icon-btn--toolbar sys-api-icon-btn--danger-outline"
                  onClick={() => setConfirmReset(true)}
                  title={language === 'ar' ? 'استعادة إعدادات المصنع' : 'Restore factory defaults'}
                  aria-label={language === 'ar' ? 'استعادة الافتراضي' : 'Reset to defaults'}
                >
                  <i className="fa-solid fa-rotate-left" aria-hidden />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      </section>
      </div>

      {addApiModalOpen ? (
        <div
          className="sys-api-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sys-api-add-modal-title"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setAddApiModalOpen(false)
              resetAddApiForm()
            }
          }}
        >
          <div className="sys-api-modal">
            <h2 id="sys-api-add-modal-title" className="sys-api-modal__title">
              {language === 'ar' ? 'إضافة نوع رمز API' : 'Add API token type'}
            </h2>
            <p className="sys-api-modal__lead">
              {language === 'ar'
                ? 'أنشئ بطاقة جديدة (اسم، وصف، تسمية الحقل). القيمة السرية تُحفظ لاحقاً عبر زر الحفظ بجانب الحقل.'
                : 'Create a new card (name, description, field label). Save the secret later with the check button next to the input.'}
            </p>
            <div className="sys-api-modal__grid">
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">
                  {language === 'ar' ? 'اسم العرض (إنجليزي) *' : 'Display name (English) *'}
                </span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.title}
                  onChange={e => setAddApiForm(f => ({ ...f, title: e.target.value }))}
                  autoComplete="off"
                  placeholder={language === 'ar' ? 'مثال: My Weather API' : 'e.g. My Weather API'}
                />
              </label>
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">{language === 'ar' ? 'اسم العرض (عربي)' : 'Display name (Arabic)'}</span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.titleAr}
                  onChange={e => setAddApiForm(f => ({ ...f, titleAr: e.target.value }))}
                  autoComplete="off"
                  dir="rtl"
                  placeholder={language === 'ar' ? 'اختياري' : 'Optional'}
                />
              </label>
              <label className="sys-api-modal__field sys-api-modal__field--full">
                <span className="sys-api-modal__label">{language === 'ar' ? 'الوصف (إنجليزي)' : 'Description (English)'}</span>
                <textarea
                  className="gis-input sys-api-modal__textarea"
                  rows={2}
                  value={addApiForm.description}
                  onChange={e => setAddApiForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={language === 'ar' ? 'متى يُستخدم هذا الرمز؟' : 'When is this token used?'}
                />
              </label>
              <label className="sys-api-modal__field sys-api-modal__field--full">
                <span className="sys-api-modal__label">{language === 'ar' ? 'الوصف (عربي)' : 'Description (Arabic)'}</span>
                <textarea
                  className="gis-input sys-api-modal__textarea"
                  rows={2}
                  value={addApiForm.descriptionAr}
                  onChange={e => setAddApiForm(f => ({ ...f, descriptionAr: e.target.value }))}
                  dir="rtl"
                  placeholder={language === 'ar' ? 'اختياري' : 'Optional'}
                />
              </label>
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">
                  {language === 'ar' ? 'تسمية حقل السر (إنجليزي) *' : 'Secret field label (English) *'}
                </span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.fieldLabel}
                  onChange={e => setAddApiForm(f => ({ ...f, fieldLabel: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">{language === 'ar' ? 'تسمية الحقل (عربي)' : 'Field label (Arabic)'}</span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.fieldLabelAr}
                  onChange={e => setAddApiForm(f => ({ ...f, fieldLabelAr: e.target.value }))}
                  autoComplete="off"
                  dir="rtl"
                  placeholder={language === 'ar' ? 'اختياري' : 'Optional'}
                />
              </label>
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">{language === 'ar' ? 'نص توضيحي للحقل (إنجليزي)' : 'Input placeholder (English)'}</span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.placeholder}
                  onChange={e => setAddApiForm(f => ({ ...f, placeholder: e.target.value }))}
                  autoComplete="off"
                  placeholder="sk-…"
                />
              </label>
              <label className="sys-api-modal__field">
                <span className="sys-api-modal__label">{language === 'ar' ? 'نص توضيحي (عربي)' : 'Placeholder (Arabic)'}</span>
                <input
                  className="gis-input sys-api-modal__input"
                  value={addApiForm.placeholderAr}
                  onChange={e => setAddApiForm(f => ({ ...f, placeholderAr: e.target.value }))}
                  autoComplete="off"
                  dir="rtl"
                  placeholder={language === 'ar' ? 'اختياري' : 'Optional'}
                />
              </label>
            </div>
            <div className="sys-api-modal__icons" role="group" aria-label={language === 'ar' ? 'أيقونة البطاقة' : 'Card icon'}>
              {CUSTOM_API_SLOT_ICONS.map(ic => (
                <button
                  key={ic}
                  type="button"
                  className={`sys-api-modal__iconchip${addApiForm.iconClass === ic ? ' sys-api-modal__iconchip--active' : ''}`}
                  title={ic}
                  aria-label={ic}
                  aria-pressed={addApiForm.iconClass === ic}
                  onClick={() => setAddApiForm(f => ({ ...f, iconClass: ic }))}
                >
                  <i className={ic} aria-hidden />
                </button>
              ))}
            </div>
            <div className="sys-api-modal__actions">
              <button
                type="button"
                className="gis-btn gis-btn-outline"
                onClick={() => {
                  setAddApiModalOpen(false)
                  resetAddApiForm()
                }}
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="button" className="gis-btn" style={{ background: 'var(--ds-color-primary)', color: '#fff' }} onClick={submitAddApiToken}>
                {language === 'ar' ? 'إضافة' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmReset ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
          }}
        >
          <div style={{ background: 'var(--ds-color-surface)', padding: 24, borderRadius: 12, maxWidth: 400 }}>
            <p>Reset all system settings to factory defaults?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="gis-btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="gis-btn"
                style={{ background: 'var(--ds-color-danger)', color: '#fff' }}
                onClick={() => {
                  resetToDefaults()
                  setConfirmReset(false)
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
