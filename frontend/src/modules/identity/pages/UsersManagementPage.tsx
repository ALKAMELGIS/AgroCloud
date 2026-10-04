import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '@/components/layout/PageHeader'
import { ResponsiveDataTable } from '@/components/data-display/ResponsiveDataTable'
import { useAuthorization } from '../hooks/useAuthorization'
import {
  createIdentityUser,
  disableIdentityUser,
  listIdentityUsers,
  type IdentityUser,
} from '../api/identityApi'
import { readCurrentUser } from '@/core/auth/auth'
import { useAppSnackbar } from '@/components/feedback/AppSnackbarProvider'

const ROLE_OPTIONS = ['STAFF', 'SUPERVISOR', 'MANAGER', 'DIRECTOR']

export default function UsersManagementPage({ embedded }: { embedded?: boolean } = {}) {
  const { showSnack } = useAppSnackbar()
  const { can, identityAvailable, loading: authLoading } = useAuthorization()
  const [users, setUsers] = useState<IdentityUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', roleCode: 'STAFF', phone: '' })

  const canView = can('users.view')
  const canCreate = can('users.create')

  useEffect(() => {
    if (!identityAvailable || authLoading) return
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    listIdentityUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [identityAvailable, authLoading, canView])

  const current = readCurrentUser()

  const sorted = useMemo(
    () => [...users].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [users],
  )

  if (!identityAvailable) {
    return <Typography color="text.secondary">Server identity is not configured. Use legacy user management.</Typography>
  }

  if (!canView) {
    return <Typography color="text.secondary">You do not have permission to view users.</Typography>
  }

  const handleCreate = async () => {
    try {
      const user = await createIdentityUser({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        roleCode: form.roleCode,
        status: 'Active',
      })
      setUsers((prev) => [...prev, user])
      setShowCreate(false)
      setForm({ name: '', email: '', roleCode: 'STAFF', phone: '' })
      showSnack('success', 'User created')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  const columns = [
    { id: 'name', header: 'Name', mobilePrimary: true, render: (u: IdentityUser) => u.name },
    { id: 'email', header: 'Email', render: (u: IdentityUser) => u.email },
    { id: 'role', header: 'Role', render: (u: IdentityUser) => u.roleCode || u.role },
    { id: 'status', header: 'Status', render: (u: IdentityUser) => u.status },
    {
      id: 'actions',
      header: 'Actions',
      render: (u: IdentityUser) =>
        can('users.disable') && u.status === 'Active' ? (
          <Button
            size="small"
            onClick={() =>
              disableIdentityUser(String(u.uuid || u.id)).then(() => {
                setUsers((prev) =>
                  prev.map((x) => (x.email === u.email ? { ...x, status: 'Disabled' } : x)),
                )
                showSnack('info', 'User disabled')
              })
            }
          >
            Disable
          </Button>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {!embedded ? (
        <PageHeader
          title="User management"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'User management' }]}
        />
      ) : null}
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
        {canCreate ? (
          <Button variant="contained" onClick={() => setShowCreate(true)}>Create user</Button>
        ) : <span />}
        <Typography variant="body2" color="text.secondary">Signed in as {current?.email}</Typography>
      </Stack>
      {loading ? <Typography>Loading users…</Typography> : null}
      <ResponsiveDataTable
        rows={sorted.map((u) => ({ ...u, id: String(u.uuid || u.id) }))}
        columns={columns}
        empty={<Typography color="text.secondary">No users found.</Typography>}
      />
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} fullWidth />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} fullWidth />
            <TextField
              select
              label="Role"
              value={form.roleCode}
              onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}
              fullWidth
            >
              {ROLE_OPTIONS.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
