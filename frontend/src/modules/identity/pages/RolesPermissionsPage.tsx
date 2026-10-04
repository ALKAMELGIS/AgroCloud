import { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { PageHeader } from '@/components/layout/PageHeader'
import { fetchIdentityRoles } from '../api/identityApi'
import { useAuthorization } from '../hooks/useAuthorization'

type RoleRow = {
  code: string
  name: string
  level: number
  permissions: string[]
}

export default function RolesPermissionsPage() {
  const { can, identityAvailable } = useAuthorization()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!identityAvailable || !can('roles.view')) return
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
  }, [identityAvailable, can])

  if (!identityAvailable) return <Typography>Identity service unavailable.</Typography>
  if (!can('roles.view')) return <Typography>Forbidden.</Typography>

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <PageHeader title="Roles & permissions" />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Stack spacing={2}>
        {roles.map((role) => (
          <Card key={role.code} variant="outlined">
            <CardContent>
              <Typography variant="h6">{role.name}</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {role.code} — level {role.level}
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
                {role.permissions.map((p) => (
                  <Chip key={p} label={p} size="small" variant="outlined" />
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
