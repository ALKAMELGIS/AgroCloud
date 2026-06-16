export type Role = 'Admin' | 'Manager' | 'Admin Manager' | 'Editor' | 'Viewer'

export type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role | string
  scope?: string
  managedById?: number
}

export const normalizeEmail = (value: unknown): string => {
  let v = String(value ?? '')
  try {
    v = v.normalize('NFKC')
  } catch {
  }
  return v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase()
}

export const normalizeRole = (value: unknown): Role => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'Viewer'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'admin manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'Admin Manager'
  if (raw === 'editor') return 'Editor'
  if (raw === 'viewer') return 'Viewer'
  if (raw.includes('admin') && raw.includes('manager')) return 'Admin Manager'
  return 'Viewer'
}

const CURRENT_USER_KEY = 'currentUser'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

type StoredSessionEnvelope = {
  token: string
  issuedAt: string
  expiresAt?: string
  user: CurrentUser
}

function readRawSessionOrLocal(): string | null {
  try {
    const sessionRaw = sessionStorage.getItem(CURRENT_USER_KEY)
    if (sessionRaw) return sessionRaw
    const localRaw = localStorage.getItem(CURRENT_USER_KEY)
    if (!localRaw) return null
    const parsed = JSON.parse(localRaw) as Partial<StoredSessionEnvelope> | null
    const expiresAt = typeof parsed?.expiresAt === 'string' ? parsed.expiresAt : ''
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(CURRENT_USER_KEY)
      return null
    }
    return localRaw
  } catch {
    return null
  }
}

function parseCurrentUser(raw: string | null): CurrentUser | null {
  try {
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const obj =
      'user' in (parsed as Record<string, unknown>) &&
      (parsed as Record<string, unknown>).user &&
      typeof (parsed as Record<string, unknown>).user === 'object'
        ? ((parsed as StoredSessionEnvelope).user as unknown as Record<string, unknown>)
        : (parsed as Record<string, unknown>)
    const id = typeof obj.id === 'number' ? obj.id : Number(obj.id ?? 0)
    const email = String(obj.email ?? '').trim()
    if (!email) return null
    return {
      id: Number.isFinite(id) && id > 0 ? id : Date.now(),
      name: String(obj.name ?? email),
      email,
      role: typeof obj.role === 'string' ? obj.role : normalizeRole(obj.role),
      scope: typeof obj.scope === 'string' && obj.scope.trim() ? obj.scope.trim() : undefined,
      managedById: typeof obj.managedById === 'number' ? obj.managedById : undefined,
    }
  } catch {
    return null
  }
}

export const readCurrentUser = (): CurrentUser | null => parseCurrentUser(readRawSessionOrLocal())

export type StartSessionOptions = {
  /** When true, session is kept in localStorage. Default true for cross-tab/browser-window continuity. */
  persist?: boolean
  /** Optional persistent session duration in milliseconds. */
  persistTtlMs?: number
}

export const startSession = (user: Partial<CurrentUser> | null, options?: StartSessionOptions): void => {
  try {
    if (!user) {
      sessionStorage.removeItem(CURRENT_USER_KEY)
      localStorage.removeItem(CURRENT_USER_KEY)
    } else {
      const persist = options?.persist !== false
      const existing = parseCurrentUser(readRawSessionOrLocal())
      const merged: CurrentUser = {
        id: typeof user.id === 'number' ? user.id : existing?.id ?? Date.now(),
        name: typeof user.name === 'string' && user.name.trim() ? user.name.trim() : existing?.name ?? 'User',
        email: typeof user.email === 'string' ? user.email.trim() : existing?.email ?? '',
        role: typeof user.role === 'string' ? user.role : existing?.role ?? 'Viewer',
        scope: typeof user.scope === 'string' && user.scope.trim() ? user.scope.trim() : existing?.scope,
        managedById: typeof user.managedById === 'number' ? user.managedById : existing?.managedById,
      }
      const now = Date.now()
      const sessionToken =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${now}-${Math.random().toString(36).slice(2)}`
      const ttl = Math.max(1000 * 60, Number(options?.persistTtlMs || SESSION_TTL_MS))
      const envelope: StoredSessionEnvelope = {
        token: sessionToken,
        issuedAt: new Date(now).toISOString(),
        expiresAt: persist ? new Date(now + ttl).toISOString() : undefined,
        user: merged,
      }
      const json = JSON.stringify(envelope)
      if (persist) {
        localStorage.setItem(CURRENT_USER_KEY, json)
        sessionStorage.removeItem(CURRENT_USER_KEY)
      } else {
        sessionStorage.setItem(CURRENT_USER_KEY, json)
        localStorage.removeItem(CURRENT_USER_KEY)
      }
    }
    window.dispatchEvent(new Event('storage'))
  } catch {
  }
}

const roleAllows = (role: Role, permission: string): boolean => {
  if (role === 'Admin') return true
  if (permission === 'dataSource.update') return role === 'Manager'
  if (permission === 'admin.users.manage') return role === 'Manager' || role === 'Admin Manager'
  return false
}

export const hasPermission = (permission: string, roleValue: unknown): boolean => {
  const role = normalizeRole(roleValue)
  return roleAllows(role, permission)
}

export const canManageDataSourceSettings = (): boolean => {
  const user = readCurrentUser()
  const role = normalizeRole(user?.role)
  return role === 'Admin' || role === 'Manager'
}
