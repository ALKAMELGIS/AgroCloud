import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import GitHubIcon from '@mui/icons-material/GitHub'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { PageContainer, PageHeader, SectionHeader, StatePanel } from '@/components'
import { connectRealtime } from '../api/realtime'

type Repo = {
  id: number
  full_name: string
  private: boolean
  html_url: string
}

type Issue = {
  id: number
  number: number
  title: string
  html_url: string
  state: string
  pull_request?: unknown
}

type Pull = {
  id: number
  number: number
  title: string
  html_url: string
  state: string
}

type GhEvent = {
  id: string
  at: string
  event: string
  action?: string
  repo?: string
  sender?: string
}

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error && typeof e.message === 'string' && e.message ? e.message : fallback

const REQUIRED_ENV = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'APP_ORIGIN', 'GITHUB_OAUTH_REDIRECT_URL']

function ListRow({ href, title, state }: { href: string; title: string; state: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      underline="none"
      color="inherit"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        minHeight: 44,
        px: 1.5,
        borderRadius: 2,
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
        {title}
      </Typography>
      <Chip size="small" variant="outlined" label={state} sx={{ flexShrink: 0 }} />
    </Link>
  )
}

function PanelCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <SectionHeader title={title} actions={action} />
        {children}
      </CardContent>
    </Card>
  )
}

const getWsUrl = () => {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const proto = isHttps ? 'wss' : 'ws'
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5180'
  return `${proto}://${host}/ws`
}

export default function GitHubIntegration() {
  const navigate = useNavigate()
  const location = useLocation()
  const [connected, setConnected] = useState(false)
  const [scope, setScope] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string>('')
  const [issues, setIssues] = useState<Issue[]>([])
  const [pulls, setPulls] = useState<Pull[]>([])
  const [events, setEvents] = useState<GhEvent[]>([])

  const [newIssueTitle, setNewIssueTitle] = useState('')
  const [newIssueBody, setNewIssueBody] = useState('')

  const selectedRepo = useMemo(() => repos.find(r => r.full_name === selectedRepoFullName) || null, [repos, selectedRepoFullName])

  const loadStatus = async () => {
    const res = await fetch('/api/github/status')
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error((data && data.error) || 'Failed to load GitHub status.')
    setConnected(Boolean(data?.connected))
    setScope(String(data?.scope || ''))
  }

  const loadRepos = async () => {
    const res = await fetch('/api/github/repos')
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error((data && data.error) || 'Failed to load repos.')
    const items = Array.isArray(data?.items) ? (data.items as Repo[]) : []
    setRepos(items)
    const first = items[0]?.full_name
    setSelectedRepoFullName(prev => (prev ? prev : first ? String(first) : ''))
    setScope(String(data?.scope || scope))
  }

  const loadRepoDetails = async (fullName: string) => {
    const [owner, repo] = String(fullName).split('/')
    if (!owner || !repo) return

    const issuesRes = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`)
    const issuesData = await issuesRes.json().catch(() => null)
    if (!issuesRes.ok) throw new Error((issuesData && issuesData.error) || 'Failed to load issues.')
    const listIssues = Array.isArray(issuesData?.items) ? (issuesData.items as Issue[]) : []
    setIssues(listIssues.filter(i => !i.pull_request))

    const pullsRes = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`)
    const pullsData = await pullsRes.json().catch(() => null)
    if (!pullsRes.ok) throw new Error((pullsData && pullsData.error) || 'Failed to load pull requests.')
    setPulls(Array.isArray(pullsData?.items) ? (pullsData.items as Pull[]) : [])
  }

  const loadEvents = async () => {
    const res = await fetch('/api/github/events')
    const data = await res.json().catch(() => null)
    if (!res.ok) return
    setEvents(Array.isArray(data?.items) ? (data.items as GhEvent[]) : [])
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const err = params.get('error')
    if (err) setError(err)
    void (async () => {
      try {
        await loadStatus()
        setError(null)
      } catch (e: unknown) {
        setError(errorMessage(e, 'Failed to load status.'))
      }
    })()
  }, [location.search])

  useEffect(() => {
    if (!connected) return
    setBusy(true)
    void (async () => {
      try {
        await Promise.all([loadRepos(), loadEvents()])
        setError(null)
      } catch (e: unknown) {
        setError(errorMessage(e, 'Failed to load GitHub data.'))
      } finally {
        setBusy(false)
      }
    })()
  }, [connected])

  useEffect(() => {
    if (!connected) return
    if (!selectedRepoFullName) return
    setBusy(true)
    void (async () => {
      try {
        await loadRepoDetails(selectedRepoFullName)
        setError(null)
      } catch (e: unknown) {
        setError(errorMessage(e, 'Failed to load repo details.'))
      } finally {
        setBusy(false)
      }
    })()
  }, [connected, selectedRepoFullName])

  useEffect(() => {
    const disconnect = connectRealtime(getWsUrl(), (u) => {
      if (u?.topic !== 'github') return
      const ev = u.payload as GhEvent | null | undefined
      if (!ev || typeof ev !== 'object') return
      setEvents(prev => [{ ...ev }, ...prev].slice(0, 50))
      if (ev.repo && typeof ev.repo === 'string' && selectedRepoFullName && ev.repo === selectedRepoFullName) {
        void loadRepoDetails(selectedRepoFullName).catch(() => {})
      }
    })
    return disconnect
  }, [selectedRepoFullName])

  const onConnect = () => {
    window.location.href = '/api/github/oauth/start'
  }

  const onDisconnect = async () => {
    setBusy(true)
    try {
      await fetch('/api/github/disconnect', { method: 'POST' })
      setConnected(false)
      setScope('')
      setRepos([])
      setSelectedRepoFullName('')
      setIssues([])
      setPulls([])
      setEvents([])
    } finally {
      setBusy(false)
    }
  }

  const onCreateIssue = async () => {
    if (!selectedRepoFullName) return
    const title = newIssueTitle.trim()
    if (!title) {
      setError('Issue title is required.')
      return
    }
    const [owner, repo] = String(selectedRepoFullName).split('/')
    setBusy(true)
    try {
      const res = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: newIssueBody }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error((data && data.error) || 'Failed to create issue.')
      setNewIssueTitle('')
      setNewIssueBody('')
      await loadRepoDetails(selectedRepoFullName)
      setError(null)
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create issue.'))
    } finally {
      setBusy(false)
    }
  }

  const issuesHref = selectedRepo ? selectedRepo.html_url + '/issues' : ''
  const pullsHref = selectedRepo ? selectedRepo.html_url + '/pulls' : ''

  return (
    <PageContainer>
      <PageHeader
        title="GitHub Integration"
        description="OAuth connection, repos, issues, pull requests, and real-time sync via webhooks."
        icon={<GitHubIcon />}
        actions={
          <>
            <Button variant="text" startIcon={<ArrowBackIcon sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />} onClick={() => navigate('/', { state: { openGroup: 'admin' } })}>
              Back
            </Button>
            {connected ? (
              <Button variant="outlined" color="error" onClick={() => void onDisconnect()} disabled={busy}>
                Disconnect
              </Button>
            ) : (
              <Button variant="contained" startIcon={<GitHubIcon />} onClick={onConnect} disabled={busy}>
                Connect GitHub
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <Alert severity="error" role="status" aria-live="polite" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {connected ? (
        <Card variant="outlined">
          {busy ? <LinearProgress aria-label="Loading GitHub data" /> : null}
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
              <TextField
                select
                label="Repository"
                value={selectedRepoFullName}
                onChange={e => setSelectedRepoFullName(e.target.value)}
                disabled={busy || repos.length === 0}
                helperText="Issues, pull requests and events below follow this repository."
                sx={{ flex: 1, minWidth: 0 }}
                SelectProps={{ displayEmpty: true }}
              >
                {repos.length === 0 ? <MenuItem value="">No repos</MenuItem> : null}
                {repos.map(r => (
                  <MenuItem key={r.id} value={r.full_name}>
                    {r.full_name}{r.private ? ' (private)' : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: { md: 1 } }}>
                <Chip color="success" variant="outlined" label="Connected" />
                {scope ? <Chip variant="outlined" label={`Scopes: ${scope || '—'}`} /> : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <StatePanel
          tone="offline"
          icon={<GitHubIcon />}
          title="GitHub is not connected"
          description={
            <>
              Configure these server environment variables, then click Connect GitHub:
              <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.75, mt: 1.5 }}>
                {REQUIRED_ENV.map(v => (
                  <Box
                    key={v}
                    component="code"
                    sx={{ fontFamily: 'monospace', fontSize: '0.8125rem', px: 1, py: 0.25, borderRadius: 1, bgcolor: 'action.hover', color: 'text.primary' }}
                  >
                    {v}
                  </Box>
                ))}
              </Box>
            </>
          }
          actionLabel="Connect GitHub"
          onAction={onConnect}
        />
      )}

      {connected && selectedRepo ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <PanelCard
            title="Open Issues"
            action={
              <Button size="small" endIcon={<OpenInNewIcon />} href={issuesHref} target="_blank" rel="noreferrer">
                Open on GitHub
              </Button>
            }
          >
            <Stack spacing={0.5}>
              {issues.length === 0 ? <Typography variant="body2" color="text.secondary">No open issues.</Typography> : null}
              {issues.slice(0, 15).map(i => (
                <ListRow key={i.id} href={i.html_url} title={`#${i.number} ${i.title}`} state={i.state} />
              ))}
            </Stack>
            <Divider />
            <Typography variant="subtitle2" component="h3">Create Issue</Typography>
            <TextField
              label="Title"
              required
              value={newIssueTitle}
              onChange={e => setNewIssueTitle(e.target.value)}
              disabled={busy}
              fullWidth
            />
            <TextField
              label="Body"
              value={newIssueBody}
              onChange={e => setNewIssueBody(e.target.value)}
              disabled={busy}
              fullWidth
              multiline
              minRows={3}
              helperText="Markdown is supported."
            />
            <Stack direction="row" justifyContent="flex-end">
              <Button variant="contained" onClick={() => void onCreateIssue()} disabled={busy}>
                Create
              </Button>
            </Stack>
          </PanelCard>

          <PanelCard
            title="Open Pull Requests"
            action={
              <Button size="small" endIcon={<OpenInNewIcon />} href={pullsHref} target="_blank" rel="noreferrer">
                Open on GitHub
              </Button>
            }
          >
            <Stack spacing={0.5}>
              {pulls.length === 0 ? <Typography variant="body2" color="text.secondary">No open pull requests.</Typography> : null}
              {pulls.slice(0, 15).map(p => (
                <ListRow key={p.id} href={p.html_url} title={`#${p.number} ${p.title}`} state={p.state} />
              ))}
            </Stack>
          </PanelCard>

          <PanelCard
            title="Real-time Events"
            action={
              <Button size="small" startIcon={<RefreshIcon />} onClick={() => void loadEvents()} disabled={busy}>
                Refresh
              </Button>
            }
          >
            <Stack spacing={1}>
              {events.length === 0 ? <Typography variant="body2" color="text.secondary">No events received yet.</Typography> : null}
              {events.slice(0, 20).map(e => (
                <Box key={e.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, bgcolor: 'background.default' }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={700} sx={{ minWidth: 0 }} noWrap>
                      {e.event}{e.action ? ` • ${e.action}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(e.at).toLocaleString()}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {(e.repo || '—') + (e.sender ? ` • ${e.sender}` : '')}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </PanelCard>
        </Box>
      ) : null}
    </PageContainer>
  )
}
