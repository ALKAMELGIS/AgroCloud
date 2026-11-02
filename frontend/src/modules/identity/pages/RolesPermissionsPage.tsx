import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import { PageContainer, PageHeader, StatePanel } from '@/components'
import { useLanguage } from '@/core/localization/i18n'
import { fetchIdentityRoles } from '../api/identityApi'
import { useAuthorization } from '../hooks/useAuthorization'
import { IdentityGate, IdentityLoadingSkeleton } from '../components/IdentityGate'

type RoleRow = {
  code: string
  name: string
  level: number
  permissions: string[]
}

const copy = {
  en: {
    title: 'Roles & permissions',
    description: 'Server-managed roles, their hierarchy level and the permission codes each one grants.',
    refresh: 'Refresh',
    level: 'Level',
    permissions: (n: number) => `${n} permission${n === 1 ? '' : 's'}`,
    noPermissions: 'No permissions assigned.',
    emptyTitle: 'No roles defined',
    emptyBody: 'The identity service returned no roles. Seed roles on the server, then refresh.',
  },
  ar: {
    title: 'الأدوار والصلاحيات',
    description: 'الأدوار المُدارة من الخادم ومستواها في التسلسل ورموز الصلاحيات التي يمنحها كل دور.',
    refresh: 'تحديث',
    level: 'المستوى',
    permissions: (n: number) => `${n} صلاحية`,
    noPermissions: 'لا توجد صلاحيات مسندة.',
    emptyTitle: 'لا توجد أدوار معرّفة',
    emptyBody: 'لم تُرجع خدمة الهوية أي أدوار. أضف الأدوار على الخادم ثم حدّث الصفحة.',
  },
} as const

export default function RolesPermissionsPage() {
  const { language } = useLanguage()
  const t = copy[language === 'ar' ? 'ar' : 'en']
  const { can, identityAvailable, identityChecked, recheckIdentity } = useAuthorization()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const allowed = can('roles.view')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchIdentityRoles()
      .then((raw) => {
        setRoles(
          (raw as RoleRow[]).map((r) => ({
            code: r.code,
            name: r.name,
            level: r.level,
            permissions: Array.isArray(r.permissions) ? r.permissions : [],
          })),
        )
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    if (!identityAvailable || !allowed) return
    load()
  }, [identityAvailable, allowed, load])

  const ready = identityAvailable && allowed

  return (
    <PageContainer>
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<AdminPanelSettingsOutlinedIcon />}
        actions={
          ready ? (
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
              {t.refresh}
            </Button>
          ) : undefined
        }
      />
      <IdentityGate checked={identityChecked} available={identityAvailable} allowed={allowed} onRetry={recheckIdentity}>
        {error ? (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>{t.refresh}</Button>}>
            {error}
          </Alert>
        ) : null}
        {!loaded && loading ? (
          <IdentityLoadingSkeleton />
        ) : loaded && !roles.length && !error ? (
          <StatePanel tone="empty" title={t.emptyTitle} description={t.emptyBody} actionLabel={t.refresh} onAction={load} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {roles.map((role) => (
              <Card key={role.code} variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" component="h2">{role.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {role.code}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`${t.level} ${role.level}`}
                      sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                    />
                  </Stack>
                  <Typography variant="overline" color="text.secondary" display="block">
                    {t.permissions(role.permissions.length)}
                  </Typography>
                  {role.permissions.length ? (
                    <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap>
                      {role.permissions.map((p) => (
                        <Chip key={p} label={p} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">{t.noPermissions}</Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </IdentityGate>
    </PageContainer>
  )
}
