import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DataSourceFieldsPanel, type DataSourceFormState } from '@/modules/forms/components/datasourcefieldspanel'
import '@/modules/operations/fertigation/EC.css'
import './Settings.css'
import { Alert, Box, Button, Card, CardContent, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { PageContainer, PageHeader } from '@/components'
import { canManageDataSourceSettings } from '../auth'
import { useCommonText } from '../../localization/i18n'

type Role = 'Admin' | 'Manager' | 'Editor' | 'Viewer'

type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role | string
}

const FORM_KEYS = ['EC', 'Fertigation', 'Irrigation', 'Harvest', 'Production', 'QHIS'] as const
type FormKey = (typeof FORM_KEYS)[number]

const readCurrentUser = (): CurrentUser | null => {
  try {
    const raw = localStorage.getItem('currentUser')
    if (!raw) return null
    const parsed = JSON.parse(raw) as CurrentUser
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

type FieldConfig = { name: string; enabled: boolean }
type ManagementLayerBinding = { sourceId: string; selectedFields: string[]; availableFields?: string[] }
type FormBindings = Record<
  string,
  {
    sourceId?: string
    sourceIds?: string[]
    fieldConfigsBySource?: Record<string, FieldConfig[]>
    selectedFieldsBySource?: Record<string, string[]>
    managementLayer?: ManagementLayerBinding
  }
>

const normalizeEnabledFields = (
  bindings: FormBindings,
  formKey: string
): { sourceIds: string[]; enabledBySource: Record<string, string[]> } => {
  const form = bindings[formKey] || {}
  const rawIds = Array.isArray(form.sourceIds) ? form.sourceIds : []
  const sourceIds = rawIds.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean)
  const legacy = typeof form.sourceId === 'string' ? form.sourceId.trim() : ''
  const ids = sourceIds.length ? Array.from(new Set(sourceIds)) : legacy ? [legacy] : []
  const mgmtSourceId = typeof form.managementLayer?.sourceId === 'string' ? form.managementLayer.sourceId.trim() : ''
  const mgmtSelected = Array.isArray(form.managementLayer?.selectedFields) ? form.managementLayer!.selectedFields.filter(Boolean) : []
  const mgmtKey = mgmtSourceId && mgmtSelected.length ? `management:${mgmtSourceId}` : ''

  if (!ids.length && !mgmtKey) return { sourceIds: [], enabledBySource: {} }

  const enabledBySource: Record<string, string[]> = {}
  if (mgmtKey) enabledBySource[mgmtKey] = mgmtSelected.slice()
  for (const sourceId of ids) {
    const configs = form.fieldConfigsBySource?.[sourceId]
    if (Array.isArray(configs)) {
      enabledBySource[sourceId] = configs.filter(c => c && c.enabled).map(c => c.name)
      continue
    }

    const v1 = form.selectedFieldsBySource?.[sourceId]
    enabledBySource[sourceId] = Array.isArray(v1) ? v1.slice() : []
  }

  return { sourceIds: mgmtKey ? [mgmtKey, ...ids] : ids, enabledBySource }
}

export default function Settings() {
  const location = useLocation()
  const navigate = useNavigate()
  const text = useCommonText()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const defaultForm = (qs.get('form') || '').trim()
  const [activeForm, setActiveForm] = useState<FormKey>(() => ((FORM_KEYS as readonly string[]).includes(defaultForm) ? (defaultForm as FormKey) : 'EC'))
  const [ready, setReady] = useState(false)

  const currentUser = useMemo(() => readCurrentUser(), [])
  const canManageSettings = canManageDataSourceSettings()

  useEffect(() => {
    const next = (qs.get('form') || '').trim()
    if ((FORM_KEYS as readonly string[]).includes(next)) setActiveForm(next as FormKey)
  }, [qs])

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 120)
    return () => window.clearTimeout(t)
  }, [])

  const [lastState, setLastState] = useState<DataSourceFormState | null>(null)

  const bindings = useMemo(() => readJson<FormBindings>('form_data_source_bindings_v1', {}), [activeForm, ready])
  const enabledInfo = useMemo(() => normalizeEnabledFields(bindings, activeForm), [bindings, activeForm])
  const enabledTotal = useMemo(
    () => Object.values(enabledInfo.enabledBySource).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0),
    [enabledInfo]
  )

  useEffect(() => {
    document.title = text.workflowDataSources
  }, [text.workflowDataSources])

  const goBackPage = () => {
    if (location.key && location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  const scrollToDataSourceCard = () => {
    document.getElementById('data-source-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openConfigureFields = () => {
    scrollToDataSourceCard()
    window.setTimeout(() => {
      ;(document.getElementById('open-fields-btn') as HTMLButtonElement | null)?.click()
    }, 350)
  }

  return (
    <div className="settings-page account-settings-page">
      <PageContainer width="wide">
        <PageHeader
          title={text.workflowDataSources}
          description={text.dataSource}
          icon={<i className="fa-solid fa-database" aria-hidden />}
          actions={
            <>
              <Button variant="text" onClick={goBackPage} startIcon={<i className="fa-solid fa-arrow-left-long account-settings-back-icon" aria-hidden />}>
                {text.backPage}
              </Button>
              {canManageSettings ? (
                <Button
                  variant="contained"
                  onClick={openConfigureFields}
                  startIcon={<i className="fa-solid fa-sliders" aria-hidden />}
                >
                  {text.configureFields}
                </Button>
              ) : null}
            </>
          }
        />

        {!ready ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary" role="status">
                {text.loadingSettings}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined" className="account-settings-card" id="data-source-settings">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'flex-end' }} justifyContent="space-between">
                <TextField
                  select
                  id="account-settings-workflow"
                  label={text.selectWorkflow}
                  value={activeForm}
                  onChange={e => setActiveForm(e.target.value as FormKey)}
                  sx={{ minWidth: { sm: 280 }, maxWidth: { sm: 380 } }}
                  fullWidth
                >
                  {FORM_KEYS.map(k => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
                <IconButton
                  aria-label={text.jumpToSection}
                  title={text.jumpToSection}
                  onClick={scrollToDataSourceCard}
                  sx={{ alignSelf: { xs: 'flex-end', sm: 'center' }, border: 1, borderColor: 'divider' }}
                >
                  <i className="fa-solid fa-arrow-down-long" aria-hidden style={{ fontSize: 16 }} />
                </IconButton>
              </Stack>

              {canManageSettings ? (
                <DataSourceFieldsPanel formKey={activeForm} mode="settings" onChange={setLastState} />
              ) : (
                <Stack spacing={1.25}>
                  <Alert severity="info" variant="outlined">
                    You have read-only access. Only Admins and Managers can change data source settings.
                  </Alert>
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 700 }}>Configured sources:</Box>{' '}
                    {enabledInfo.sourceIds.length ? enabledInfo.sourceIds.join(', ') : '—'}
                  </Typography>
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 700 }}>Enabled fields:</Box>{' '}
                    {enabledTotal
                      ? enabledInfo.sourceIds
                          .map(id => `${id}: ${(enabledInfo.enabledBySource[id] || []).join(', ')}`)
                          .filter(Boolean)
                          .join(' • ')
                      : '—'}
                  </Typography>
                </Stack>
              )}

              {canManageSettings && lastState ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {text.currentSelection}: {lastState.sourceIds.length ? lastState.sourceIds.join(', ') : '—'} •{' '}
                  {Object.values(lastState.selectedFieldsBySource || {}).reduce<number>(
                    (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
                    0
                  )}{' '}
                  {text.fieldsEnabled}
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        )}
      </PageContainer>
    </div>
  )
}
