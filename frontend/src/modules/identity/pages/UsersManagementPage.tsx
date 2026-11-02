import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  LinearProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { PageContainer, PageHeader, StatePanel } from '@/components'
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

  const wrap = (body: ReactNode) =>
    embedded ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{body}</Box>
    ) : (
      <PageContainer width="wide">
        <PageHeader
          title="User management"
          description="Server identity accounts: create users, assign roles and disable access."
          icon={<PeopleAltOutlinedIcon />}
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'User management' }]}
          actions={
            identityAvailable && canView && canCreate ? (
              <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => setShowCreate(true)}>
                Create user
              </Button>
            ) : undefined
          }
        />
        {body}
      </PageContainer>
    )

  if (!identityAvailable) {
    return wrap(
      <StatePanel
        tone="offline"
        title="Server identity is not configured"
        description="Use legacy user management until the PostgreSQL identity service is available."
      />,
    )
  }

  if (!canView) {
    return wrap(
      <StatePanel
        tone="error"
        icon={<LockOutlinedIcon />}
        title="You do not have permission to view users"
        description="Ask an administrator to grant the users.view permission to your role."
      />,
    )
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
    {
      id: 'status',
      header: 'Status',
      render: (u: IdentityUser) => (
        <Chip
          size="small"
          variant="outlined"
          color={u.status === 'Active' ? 'success' : u.status === 'Disabled' ? 'default' : 'warning'}
          label={u.status}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (u: IdentityUser) =>
        can('users.disable') && u.status === 'Active' ? (
          <Button
            size="small"
            color="error"
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

  return wrap(
    <>
      {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
      <Card variant="outlined">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={1}
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            Signed in as {current?.email}
            {!loading ? ` · ${sorted.length} user${sorted.length === 1 ? '' : 's'}` : ''}
          </Typography>
          {embedded && canCreate ? (
            <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => setShowCreate(true)}>
              Create user
            </Button>
          ) : null}
        </Stack>
        {loading ? <LinearProgress aria-label="Loading users" /> : null}
        <Box sx={{ overflowX: 'auto', p: { xs: 1.5, sm: 0 } }}>
          <ResponsiveDataTable
            rows={sorted.map((u) => ({ ...u, id: String(u.uuid || u.id) }))}
            columns={columns}
            empty={
              loading ? null : (
                <StatePanel bare tone="empty" title="No users found" description="Create the first server identity user to get started." />
              )
            }
          />
        </Box>
      </Card>
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth autoComplete="name" />
            <TextField label="Email" required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} fullWidth autoComplete="email" helperText="Used to sign in." />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} fullWidth autoComplete="tel" helperText="Optional." />
            <TextField
              select
              label="Role"
              value={form.roleCode}
              onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}
              fullWidth
              helperText="Determines the permissions this user receives."
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
    </>,
  )
}
