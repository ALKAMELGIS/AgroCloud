/**
 * Syncs User Management (adminUsers) + audit log to the Node backend file store
 * so changes survive deploys/restarts when AGRI_ADMIN_DIRECTORY_FILE is on a persistent volume.
 *
 * @see backend/server/adminDirectoryPersistence.js
 */
import { AUDIT_LOG_STORAGE_KEY } from './audit'

const ADMIN_USERS_KEY = 'adminUsers'
const DEFAULT_DIRECTORY_API = '/api/v1/admin/directory'

function adminDirectoryApiBase(): string {
  const raw = import.meta.env.VITE_AGRI_ADMIN_DIRECTORY_URL
  const u = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  return u || DEFAULT_DIRECTORY_API
}

function adminDirectoryAuthHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_ADMIN_DIRECTORY_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return {}
  return { 'X-Agri-Admin-Directory-Token': t, Authorization: `Bearer ${t}` }
}

function readUsersFromStorage(): unknown[] {
  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readAuditFromStorage(): unknown[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export type AdminDirectoryPayload = {
  users: unknown[]
  auditLog: unknown[]
  updatedAt?: string | null
}

export async function pullAdminDirectoryFromServer(): Promise<AdminDirectoryPayload | null> {
  try {
    const res = await fetch(adminDirectoryApiBase(), {
      method: 'GET',
      headers: { ...adminDirectoryAuthHeaders() },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; users?: unknown[]; auditLog?: unknown[]; updatedAt?: string | null }
    if (!data || data.ok === false) return null
    const users = Array.isArray(data.users) ? data.users : []
    const auditLog = Array.isArray(data.auditLog) ? data.auditLog : []
    return { users, auditLog, updatedAt: data.updatedAt ?? null }
  } catch {
    return null
  }
}

export async function pushAdminDirectoryToServer(users: unknown[], auditLog: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(adminDirectoryApiBase(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminDirectoryAuthHeaders() },
      body: JSON.stringify({ users, auditLog }),
    })
    return res.ok
  } catch {
    return false
  }
}

let syncTimer: number | null = null

/** Debounced full snapshot sync (reads latest localStorage). */
export function scheduleAdminDirectorySync(): void {
  if (syncTimer != null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void flushAdminDirectoryToServer()
  }, 450)
}

export async function flushAdminDirectoryToServer(): Promise<boolean> {
  const users = readUsersFromStorage()
  const auditLog = readAuditFromStorage()
  return pushAdminDirectoryToServer(users, auditLog)
}
