import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import LinkRoundedIcon from '@mui/icons-material/LinkRounded'
import { useLanguage } from '@/core/localization/i18n'
import { PageContainer, PageHeader, SectionHeader } from '@/components'
import {
  AGRO_CLOUD_EMBED_CHANGED_EVENT,
  AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT,
  DEFAULT_AGRO_CLOUD_DASHBOARD_URL,
  isValidEmbedUrl,
  readAgroCloudDashboardUrl,
  readAgroCloudKeepAlive,
  resetAgroCloudDashboardUrl,
  writeAgroCloudDashboardUrl,
  writeAgroCloudKeepAlive,
} from './agrocloud/agroCloudDashboardStorage'
import './dashboard-settings.css'

const DASHBOARD_URL_PRESETS_LS = 'agro-cloud-dashboard-url-presets-v1'

export default function DashboardSettings() {
  const { language } = useLanguage()
  const [draft, setDraft] = useState(readAgroCloudDashboardUrl)
  const [pinDashboard, setPinDashboard] = useState(readAgroCloudKeepAlive)
  const [savedUrls, setSavedUrls] = useState<string[]>([])
  const [flash, setFlash] = useState<string | null>(null)

  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            title: 'إعدادات لوحة التحكم',
            lead: 'اضبط رابط تضمين لوحة Agro Cloud Dashboard. يُخزَّن في المتصفح فقط.',
            urlLabel: 'رابط ArcGIS Dashboard',
            pinHeading: 'سلوك العرض',
            pinLabel: 'تثبيت اللوحة عند التنقل (بدون إعادة تحميل)',
            pinHint:
              'عند التفعيل تبقى اللوحة محمّلة في الخلفية عند الانتقال لصفحات أخرى والعودة، وهو مناسب عندما يكون الرابط ثابتاً.',
            quickLinksHeading: 'روابط محفوظة',
            quickLinksLead: 'أضف روابط لوحات متعددة للوصول السريع والتبديل بينها.',
            addCurrent: 'إضافة الرابط الحالي',
            clearAll: 'حذف الكل',
            applySaved: 'تطبيق',
            save: 'حفظ',
            reset: 'الافتراضي',
            hint: 'الافتراضي: لوحة ArcGIS التابعة لـ EAP.',
            invalid: 'الرابط غير صالح (استخدم http/https)',
            saved: 'تم الحفظ.',
            savedPin: 'تم حفظ تفضيل العرض.',
            added: 'تمت إضافة الرابط إلى القائمة.',
            removed: 'تم حذف الرابط.',
            noSaved: 'لا توجد روابط محفوظة بعد.',
            remove: 'حذف الرابط',
            crumbMaster: 'البيانات الرئيسية',
          }
        : {
            title: 'Dashboard Settings',
            lead: 'Set the embed URL for the Agro Cloud Dashboard page. Stored in your browser only.',
            urlLabel: 'ArcGIS Dashboard URL',
            pinHeading: 'Display behavior',
            pinLabel: 'Keep dashboard loaded when switching pages',
            pinHint:
              'When on, the embedded view stays in memory while you browse other pages and return — avoids reload and loading spinners for a fixed URL.',
            quickLinksHeading: 'Saved dashboard links',
            quickLinksLead: 'Add multiple dashboard URLs for quick switch and apply.',
            addCurrent: 'Add current URL',
            clearAll: 'Clear all',
            applySaved: 'Apply',
            save: 'Save',
            reset: 'Use default',
            hint: 'URL is stored in your browser only.',
            invalid: 'Invalid URL — use https://…',
            saved: 'Saved.',
            savedPin: 'Display preference saved.',
            added: 'URL added to saved links.',
            removed: 'URL removed.',
            noSaved: 'No saved links yet.',
            remove: 'Remove link',
            crumbMaster: 'Master Data',
          },
    [language],
  )

  useEffect(() => {
    setDraft(readAgroCloudDashboardUrl())
  }, [])

  useEffect(() => {
    const sync = () => setPinDashboard(readAgroCloudKeepAlive())
    window.addEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_URL_PRESETS_LS)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((v): v is string => typeof v === 'string' && isValidEmbedUrl(v))
        setSavedUrls(clean)
      }
    } catch {
      setSavedUrls([])
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3200)
    return () => window.clearTimeout(t)
  }, [flash])

  const handleSave = useCallback(() => {
    const next = draft.trim()
    if (!isValidEmbedUrl(next)) {
      setFlash(copy.invalid)
      return
    }
    try {
      writeAgroCloudDashboardUrl(next)
      setFlash(copy.saved)
    } catch {
      setFlash(copy.invalid)
    }
  }, [draft, copy.invalid, copy.saved])

  const handleReset = useCallback(() => {
    setDraft(DEFAULT_AGRO_CLOUD_DASHBOARD_URL)
    try {
      resetAgroCloudDashboardUrl()
      setFlash(copy.saved)
    } catch {
      setFlash(copy.invalid)
    }
  }, [copy.saved])

  const handlePinChange = useCallback(
    (checked: boolean) => {
      setPinDashboard(checked)
      writeAgroCloudKeepAlive(checked)
      setFlash(copy.savedPin)
    },
    [copy.savedPin],
  )

  const persistSavedUrls = useCallback((next: string[]) => {
    setSavedUrls(next)
    localStorage.setItem(DASHBOARD_URL_PRESETS_LS, JSON.stringify(next))
  }, [])

  const addCurrentUrl = useCallback(() => {
    const next = draft.trim()
    if (!isValidEmbedUrl(next)) {
      setFlash(copy.invalid)
      return
    }
    const merged = [next, ...savedUrls.filter(u => u !== next)].slice(0, 10)
    persistSavedUrls(merged)
    setFlash(copy.added)
  }, [copy.added, copy.invalid, draft, persistSavedUrls, savedUrls])

  const removeSavedUrl = useCallback(
    (url: string) => {
      persistSavedUrls(savedUrls.filter(u => u !== url))
      setFlash(copy.removed)
    },
    [copy.removed, persistSavedUrls, savedUrls],
  )

  const clearSavedUrls = useCallback(() => {
    persistSavedUrls([])
    setFlash(copy.removed)
  }, [copy.removed, persistSavedUrls])

  const applySavedUrl = (url: string) => {
    setDraft(url)
    writeAgroCloudDashboardUrl(url)
    window.dispatchEvent(new Event(AGRO_CLOUD_EMBED_CHANGED_EVENT))
    setFlash(copy.saved)
  }

  const flashIsError = flash === copy.invalid

  return (
    <PageContainer sx={{ maxWidth: 980 }}>
      <PageHeader
        title={copy.title}
        description={copy.lead}
        icon={<DashboardCustomizeOutlinedIcon />}
        breadcrumbs={[{ label: copy.crumbMaster }, { label: copy.title }]}
      />

      <Paper variant="outlined" component="section" aria-labelledby="dash-url-heading" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3.5 }}>
        <Typography id="dash-url-heading" variant="h6" component="h2" sx={{ mb: 2 }}>
          {copy.urlLabel}
        </Typography>
        <TextField
          id="master-agro-dash-url"
          fullWidth
          type="url"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={DEFAULT_AGRO_CLOUD_DASHBOARD_URL}
          error={flashIsError}
          slotProps={{
            htmlInput: {
              'aria-label': copy.urlLabel,
              dir: 'ltr',
              spellCheck: false,
              autoComplete: 'off',
            },
          }}
        />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
          <Button variant="contained" onClick={handleSave}>
            {copy.save}
          </Button>
          <Button variant="outlined" onClick={handleReset}>
            {copy.reset}
          </Button>
        </Stack>
        {flash ? (
          <Alert severity={flashIsError ? 'error' : 'success'} sx={{ mt: 2 }} role="status">
            {flash}
          </Alert>
        ) : null}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2, mb: 0 }}>
          {language === 'ar' ? (
            <>الافتراضي: لوحة ArcGIS على نطاق EAP. الرابط يُحفظ محلياً في هذا المتصفح.</>
          ) : (
            <>
              Embedded from{' '}
              <Link href={DEFAULT_AGRO_CLOUD_DASHBOARD_URL} target="_blank" rel="noreferrer">
                ArcGIS Dashboards (EAP)
              </Link>
              . Change the URL above if your organization hosts a different dashboard.
            </>
          )}
        </Typography>
      </Paper>

      <Paper variant="outlined" component="section" aria-labelledby="dash-pin-heading" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3.5 }}>
        <Typography id="dash-pin-heading" variant="h6" component="h2" sx={{ mb: 1 }}>
          {copy.pinHeading}
        </Typography>
        <FormControlLabel
          sx={{ mx: 0, gap: 1.5, alignItems: 'center' }}
          control={<Switch checked={pinDashboard} onChange={e => handlePinChange(e.target.checked)} />}
          label={<Typography variant="body2" fontWeight={600}>{copy.pinLabel}</Typography>}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
          {copy.pinHint}
        </Typography>
      </Paper>

      <Paper variant="outlined" component="section" aria-label={copy.quickLinksHeading} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3.5 }}>
        <SectionHeader
            title={copy.quickLinksHeading}
            description={copy.quickLinksLead}
            actions={
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addCurrentUrl}>
                  {copy.addCurrent}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineRoundedIcon />}
                  onClick={clearSavedUrls}
                  disabled={savedUrls.length === 0}
                >
                  {copy.clearAll}
                </Button>
              </Stack>
            }
          />
        {savedUrls.length === 0 ? (
          <Typography variant="body2" color="text.secondary" className="dashboard-settings-empty">
            {copy.noSaved}
          </Typography>
        ) : (
          <div className="dashboard-settings-preset-list" role="list">
            {savedUrls.map((url, i) => (
              <div className="dashboard-settings-preset-item" role="listitem" key={url}>
                {i > 0 ? <Divider className="dashboard-settings-preset-divider" /> : null}
                <div className="dashboard-settings-preset-row">
                  <LinkRoundedIcon fontSize="small" className="dashboard-settings-preset-icon" aria-hidden />
                  <button
                    type="button"
                    className="dashboard-settings-preset-link"
                    onClick={() => applySavedUrl(url)}
                    title={url}
                    dir="ltr"
                  >
                    {url}
                  </button>
                  <div className="dashboard-settings-preset-actions">
                    <Button size="small" variant="outlined" onClick={() => applySavedUrl(url)}>
                      {copy.applySaved}
                    </Button>
                    <Tooltip title={copy.remove}>
                      <IconButton size="small" aria-label={copy.remove} onClick={() => removeSavedUrl(url)}>
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Paper>
    </PageContainer>
  )
}
