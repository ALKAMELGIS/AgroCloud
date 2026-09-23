import { apiUrl } from './apiOrigin'

export type JohnDeereSetup = {
  oauthConfigured: boolean
  redirectUri: string
  apiBase: string
  scope: string
  successRoute: string
  mapEmbedDefaultUrl: string
  mapEmbedProxyLoginPath: string
  developerPortal: string
}

export type JohnDeereOAuthConfig = {
  configured: boolean
  redirectUri?: string
  apiBase?: string
  scope?: string
  authorizeHost?: string
  successRoute?: string
}

export type JohnDeereOAuthStatus = {
  connected: boolean
  configured: boolean
  scope?: string
  updatedAt?: string
}

export type JohnDeereOrg = {
  id?: string
  name?: string
  type?: string
  links?: { rel?: string; uri?: string }[]
  [key: string]: unknown
}

export type JohnDeereMachine = {
  id?: string
  name?: string
  serialNumber?: string
  model?: { name?: string }
  make?: { name?: string }
  [key: string]: unknown
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data && typeof data === 'object' && 'error' in data ? String((data as { error: string }).error) : res.statusText
    throw new Error(err || 'Request failed')
  }
  return data as T
}

export async function fetchJohnDeereSetup(): Promise<JohnDeereSetup> {
  const res = await fetch(apiUrl('/api/john-deere/setup'), { credentials: 'include' })
  return parseJson(res)
}

export async function fetchJohnDeereMapEmbedHealth(): Promise<{
  ok: boolean
  loginPath?: string
  upstreamStatus?: number
}> {
  const res = await fetch(apiUrl('/api/gps/john-deere-map/health'), { credentials: 'include' })
  return parseJson(res)
}

export async function fetchJohnDeereOAuthConfig(): Promise<JohnDeereOAuthConfig> {
  const res = await fetch(apiUrl('/api/john-deere/oauth/config'), { credentials: 'include' })
  return parseJson(res)
}

export async function fetchJohnDeereOAuthStatus(): Promise<JohnDeereOAuthStatus> {
  const res = await fetch(apiUrl('/api/john-deere/oauth/status'), { credentials: 'include' })
  return parseJson(res)
}

export function startJohnDeereOAuthConnect(): void {
  window.location.assign(apiUrl('/api/john-deere/oauth/start'))
}

export async function disconnectJohnDeereOAuth(): Promise<void> {
  const res = await fetch(apiUrl('/api/john-deere/oauth/disconnect'), { method: 'POST', credentials: 'include' })
  await parseJson(res)
}

export async function fetchJohnDeereOrganizations(): Promise<JohnDeereOrg[]> {
  const res = await fetch(apiUrl('/api/john-deere/organizations'), { credentials: 'include' })
  const data = await parseJson<{ items: JohnDeereOrg[] }>(res)
  return Array.isArray(data.items) ? data.items : []
}

export async function fetchJohnDeereMachines(orgId: string): Promise<JohnDeereMachine[]> {
  const res = await fetch(apiUrl(`/api/john-deere/organizations/${encodeURIComponent(orgId)}/machines`), {
    credentials: 'include',
  })
  const data = await parseJson<{ items: JohnDeereMachine[] }>(res)
  return Array.isArray(data.items) ? data.items : []
}

export function orgIdFromRow(org: JohnDeereOrg): string {
  if (typeof org.id === 'string' && org.id.trim()) return org.id.trim()
  const self = Array.isArray(org.links) ? org.links.find(l => l?.rel === 'self') : undefined
  if (self?.uri) {
    const m = String(self.uri).match(/\/organizations\/([^/?]+)/)
    if (m?.[1]) return m[1]
  }
  return ''
}

export function orgDisplayName(org: JohnDeereOrg): string {
  return String(org.name || orgIdFromRow(org) || 'Organization')
}
