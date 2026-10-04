import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { KpiCard } from '@/components/data-display/KpiCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuthorization } from '@/modules/identity/hooks/useAuthorization'
import { allocateManpower, fetchManpowerSummary, type ManpowerSummary } from '../api/manpowerApi'
import { useAppSnackbar } from '@/components/feedback/AppSnackbarProvider'

export default function ManpowerDashboard() {
  const { can, identityAvailable } = useAuthorization()
  const { showSnack } = useAppSnackbar()
  const [summary, setSummary] = useState<ManpowerSummary | null>(null)
  const [roleCode, setRoleCode] = useState('STAFF')
  const [total, setTotal] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = () => {
    setLoading(true)
    fetchManpowerSummary()
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (identityAvailable && can('manpower.view')) reload()
  }, [identityAvailable, can])

  if (!identityAvailable) return <Typography>Manpower requires PostgreSQL identity.</Typography>
  if (!can('manpower.view')) return <Typography>Forbidden.</Typography>

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader title="Manpower" />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <KpiCard title="Total" value={summary?.total ?? '—'} loading={loading && !summary} />
        <KpiCard title="Used" value={summary?.used ?? '—'} loading={loading && !summary} />
        <KpiCard title="Reserved" value={summary?.reserved ?? '—'} loading={loading && !summary} />
        <KpiCard title="Available" value={summary?.available ?? '—'} loading={loading && !summary} />
      </Box>
      {can('manpower.allocate') ? (
        <Box component="section">
          <Typography variant="h6" gutterBottom>Set allocation</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }}>
            <TextField
              select
              label="Role"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              {['STAFF', 'SUPERVISOR', 'MANAGER', 'DIRECTOR'].map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
            <TextField
              type="number"
              label="Total seats"
              inputProps={{ min: 0 }}
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
            />
            <Button
              variant="contained"
              onClick={() =>
                allocateManpower({ roleCode, total, reason: 'admin UI' })
                  .then(() => {
                    showSnack('success', 'Allocation saved')
                    reload()
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
              }
            >
              Save allocation
            </Button>
          </Stack>
        </Box>
      ) : null}
    </Box>
  )
}
