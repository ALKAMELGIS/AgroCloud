import { useEffect, useState } from 'react'
import { Alert, Box, List, ListItem, ListItemText, Typography } from '@mui/material'
import { PageHeader } from '@/components/layout/PageHeader'
import { fetchIdentityHierarchy } from '../api/identityApi'
import { useAuthorization } from '../hooks/useAuthorization'

type Node = { id: string; name: string; email: string; role_code: string; depth: number }

export default function HierarchyPage() {
  const { can, identityAvailable } = useAuthorization()
  const [nodes, setNodes] = useState<Node[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!identityAvailable || !can('users.view')) return
    fetchIdentityHierarchy()
      .then((raw) => setNodes(raw as Node[]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [identityAvailable, can])

  if (!identityAvailable) return <Typography>Identity service unavailable.</Typography>
  if (!can('users.view')) return <Typography>Forbidden.</Typography>

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <PageHeader title="Organization hierarchy" />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <List disablePadding>
        {nodes.map((n) => (
          <ListItem key={n.id} sx={{ pl: 2 + n.depth * 2 }}>
            <ListItemText
              primary={n.name}
              secondary={`${n.role_code} · ${n.email}`}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
