import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import { KpiCard, PageContainer, PageHeader, SectionHeader } from '@/components'
import { useAuthorization } from '@/modules/identity/hooks/useAuthorization'
import { IdentityGate } from '@/modules/identity/components/IdentityGate'
import { allocateManpower, fetchManpowerSummary, type ManpowerSummary } from '../api/manpowerApi'
import { useAppSnackbar } from '@/components/feedback/AppSnackbarProvider'

const ROLE_OPTIONS = ['STAFF', 'SUPERVISOR', 'MANAGER', 'DIRECTOR']

export default function ManpowerDashboard() {
  const { can, identityAvailable, identityChecked, recheckIdentity } = useAuthorization()
  const { showSnack } = useAppSnackbar()
  const [summary, setSummary] = useState<ManpowerSummary | null>(null)
  const [roleCode, setRoleCode] = useState('STAFF')
  const [total, setTotal] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const allowed = can('manpower.view')

  const reload = useCallback(() => {
    setLoading(true)
    fetchManpowerSummary()
      .then((s) => {
        setSummary(s)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (identityAvailable && allowed) reload()
  }, [identityAvailable, allowed, reload])

  const totalInvalid = !Number.isFinite(total) || total < 0

  const saveAllocation = () => {
    if (totalInvalid) return
    setSaving(true)
    allocateManpower({ roleCode, total, reason: 'admin UI' })
      .then(() => {
        showSnack('success', 'Allocation saved')
        reload()
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setSaving(false))
  }

  const ready = identityAvailable && allowed

  return (
    <PageContainer>
      <PageHeader
        title="Manpower"
        description="Seat capacity per role: how many seats are allocated, in use, reserved and still available."
        icon={<GroupsOutlinedIcon />}
        actions={
          ready ? (
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
              Refresh
            </Button>
          ) : undefined
        }
      />
      <IdentityGate
        checked={identityChecked}
        available={identityAvailable}
        allowed={allowed}
        onRetry={recheckIdentity}
        offlineTitle="Manpower needs the identity service"
        offlineDescription="Seat allocation is stored in the PostgreSQL identity database, which is not reachable. Start the API server with DATABASE_URL configured, then retry."
      >
        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          <KpiCard title="Total" value={summary?.total ?? '—'} subtitle="Seats allocated" loading={loading && !summary} />
          <KpiCard title="Used" value={summary?.used ?? '—'} subtitle="Assigned to users" loading={loading && !summary} />
          <KpiCard title="Reserved" value={summary?.reserved ?? '—'} subtitle="Held for invites" loading={loading && !summary} />
          <KpiCard title="Available" value={summary?.available ?? '—'} subtitle="Free to assign" loading={loading && !summary} />
        </Box>
        {can('manpower.allocate') ? (
          <Card variant="outlined" component="section">
            <CardContent>
              <SectionHeader
                title="Set allocation"
                description="Sets the total seat count for one role. Existing assignments are kept."
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                <TextField
                  select
                  label="Role"
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                  helperText="Role to update"
                  sx={{ minWidth: { sm: 200 } }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  type="number"
                  label="Total seats"
                  inputProps={{ min: 0, inputMode: 'numeric' }}
                  value={total}
                  onChange={(e) => setTotal(Number(e.target.value))}
                  error={totalInvalid}
                  helperText={totalInvalid ? 'Enter 0 or a positive number' : 'New total for this role'}
                  sx={{ minWidth: { sm: 180 }, '& input': { fontVariantNumeric: 'tabular-nums' } }}
                />
                <Button
                  variant="contained"
                  onClick={saveAllocation}
                  disabled={saving || totalInvalid}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, mt: { sm: 0 } }}
                >
                  {saving ? 'Saving…' : 'Save allocation'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </IdentityGate>
    </PageContainer>
  )
}
