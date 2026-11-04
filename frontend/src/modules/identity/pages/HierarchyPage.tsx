import { useCallback, useEffect, useState } from 'react'
import { Alert, Avatar, Box, Button, Card, Chip, List, ListItem, ListItemAvatar, ListItemText } from '@mui/material'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import { alpha } from '@mui/material/styles'
import { PageContainer, PageHeader, StatePanel } from '@/components'
import { useLanguage } from '@/core/localization/i18n'
import { fetchIdentityHierarchy } from '../api/identityApi'
import { useAuthorization } from '../hooks/useAuthorization'
import { IdentityGate, IdentityLoadingSkeleton } from '../components/IdentityGate'

type Node = { id: string; name: string; email: string; role_code: string; depth: number }

const copy = {
  en: {
    title: 'Organization hierarchy',
    description: 'Reporting lines from the identity service: each person is indented under the manager they report to.',
    refresh: 'Refresh',
    emptyTitle: 'No hierarchy yet',
    emptyBody: 'No users with reporting lines were returned. Assign managers in User Management, then refresh.',
  },
  ar: {
    title: 'الهيكل التنظيمي',
    description: 'خطوط الإشراف من خدمة الهوية: يظهر كل شخص تحت المدير الذي يتبع له.',
    refresh: 'تحديث',
    emptyTitle: 'لا يوجد هيكل بعد',
    emptyBody: 'لم تُرجع الخدمة مستخدمين بخطوط إشراف. عيّن المدراء في إدارة المستخدمين ثم حدّث الصفحة.',
  },
} as const

function initials(name: string) {
  return (
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default function HierarchyPage() {
  const { language } = useLanguage()
  const t = copy[language === 'ar' ? 'ar' : 'en']
  const { can, identityAvailable, identityChecked, recheckIdentity } = useAuthorization()
  const [nodes, setNodes] = useState<Node[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const allowed = can('users.view')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchIdentityHierarchy()
      .then((raw) => setNodes(raw as Node[]))
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
        icon={<AccountTreeOutlinedIcon />}
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
          <IdentityLoadingSkeleton rows={2} />
        ) : loaded && !nodes.length && !error ? (
          <StatePanel tone="empty" title={t.emptyTitle} description={t.emptyBody} actionLabel={t.refresh} onAction={load} />
        ) : (
          <Card variant="outlined">
            <Box sx={{ overflowX: 'auto' }}>
              <List disablePadding aria-label={t.title}>
                {nodes.map((n, i) => (
                  <ListItem
                    key={n.id}
                    divider={i < nodes.length - 1}
                    sx={(theme) => ({
                      paddingInlineStart: `${16 + Math.max(0, n.depth) * 24}px`,
                      position: 'relative',
                      '&::before':
                        n.depth > 0
                          ? {
                              content: '""',
                              position: 'absolute',
                              insetInlineStart: `${4 + n.depth * 24}px`,
                              top: 0,
                              bottom: 0,
                              borderInlineStart: `2px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                            }
                          : undefined,
                    })}
                  >
                    <ListItemAvatar>
                      <Avatar
                        sx={(theme) => ({
                          bgcolor: alpha(theme.palette.primary.main, 0.12),
                          color: 'primary.main',
                          fontSize: '0.875rem',
                          fontWeight: 700,
                        })}
                      >
                        {initials(n.name)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={n.name}
                      secondary={n.email}
                      primaryTypographyProps={{ fontWeight: 600 }}
                      sx={{ minWidth: 0, '& .MuiListItemText-secondary': { overflowWrap: 'anywhere' } }}
                    />
                    <Chip size="small" variant="outlined" label={n.role_code} sx={{ flexShrink: 0, marginInlineStart: 1 }} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Card>
        )}
      </IdentityGate>
    </PageContainer>
  )
}
