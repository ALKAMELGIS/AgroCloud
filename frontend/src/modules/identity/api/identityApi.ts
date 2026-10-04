export type IdentityUser = {
  id: number | string
  uuid?: string
  name: string
  email: string
  role: string
  roleCode?: string
  scope?: string
  managedById?: number
  status: string
  lastLogin?: string
  permissions?: string[]
  organizationId?: string
  dataScope?: string
}

const jsonHeaders = { 'Content-Type': 'application/json' }

async function parse<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchIdentityStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/identity/status', { credentials: 'include' })
    if (!res.ok) return false
    const data = await parse<{ ok?: boolean; identity?: boolean }>(res)
    return Boolean(data?.ok && data?.identity)
  } catch {
    return false
  }
}

export async function fetchIdentityMe(): Promise<{ user: IdentityUser; permissions: string[] } | null> {
  try {
    const res = await fetch('/api/v1/identity/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = await parse<{ ok?: boolean; user?: IdentityUser; permissions?: string[] }>(res)
    if (!data?.ok || !data.user) return null
    return { user: data.user, permissions: Array.isArray(data.permissions) ? data.permissions : [] }
  } catch {
    return null
  }
}

export async function logoutIdentity(): Promise<void> {
  try {
    await fetch('/api/v1/identity/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* ignore */
  }
}

export async function listIdentityUsers(): Promise<IdentityUser[]> {
  const res = await fetch('/api/v1/identity/users', { credentials: 'include' })
  const data = await parse<{ ok?: boolean; users?: IdentityUser[] }>(res)
  if (!res.ok || !data?.users) throw new Error('Failed to load users')
  return data.users
}

export async function createIdentityUser(body: Record<string, unknown>): Promise<IdentityUser> {
  const res = await fetch('/api/v1/identity/users', {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  })
  const data = await parse<{ ok?: boolean; user?: IdentityUser; error?: string; code?: string }>(res)
  if (!res.ok || !data?.user) throw new Error(data?.error || 'Create failed')
  return data.user
}

export async function disableIdentityUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/identity/users/${id}/disable`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Disable failed')
}

export async function fetchIdentityRoles(): Promise<unknown[]> {
  const res = await fetch('/api/v1/identity/roles', { credentials: 'include' })
  const data = await parse<{ ok?: boolean; roles?: unknown[] }>(res)
  if (!res.ok || !data?.roles) return []
  return data.roles
}

export async function fetchIdentityHierarchy(root?: string): Promise<unknown[]> {
  const q = root ? `?root=${encodeURIComponent(root)}` : ''
  const res = await fetch(`/api/v1/identity/hierarchy${q}`, { credentials: 'include' })
  const data = await parse<{ ok?: boolean; nodes?: unknown[] }>(res)
  return data?.nodes || []
}

export const IDENTITY_PERMISSIONS_KEY = 'identityPermissions'

export function persistIdentityPermissions(permissions: string[]) {
  try {
    localStorage.setItem(IDENTITY_PERMISSIONS_KEY, JSON.stringify(permissions))
  } catch {
    /* ignore */
  }
}

export function readIdentityPermissions(): string[] {
  try {
    const raw = localStorage.getItem(IDENTITY_PERMISSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function clearIdentityPermissions() {
  try {
    localStorage.removeItem(IDENTITY_PERMISSIONS_KEY)
  } catch {
    /* ignore */
  }
}
