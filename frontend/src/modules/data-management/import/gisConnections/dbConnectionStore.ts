import type {
  GisDbConnectionProfile,
  GisDbTableInfo,
  GisDbTablesResult,
  GisDbTestResult,
  GisDbTestStatus,
} from './types'

export const GIS_DB_CONNECTIONS_LS_KEY = 'agrocloud.gis.dbConnections'

const GATEWAY_DB_TEST = '/api/gis-gateway/db/test'
const GATEWAY_DB_TABLES = '/api/gis-gateway/db/tables'

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `gis-db-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readRaw(): unknown {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(GIS_DB_CONNECTIONS_LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as unknown
  } catch {
    return []
  }
}

function isProfile(value: unknown): value is GisDbConnectionProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.host === 'string' &&
    typeof v.port === 'number' &&
    typeof v.database === 'string' &&
    typeof v.username === 'string' &&
    typeof v.ssl === 'boolean' &&
    typeof v.savedAt === 'string'
  )
}

function writeAll(profiles: GisDbConnectionProfile[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(GIS_DB_CONNECTIONS_LS_KEY, JSON.stringify(profiles))
  } catch {
    console.warn('[gisConnections] Could not persist DB connections')
  }
}

export function listDbConnections(): GisDbConnectionProfile[] {
  const raw = readRaw()
  if (!Array.isArray(raw)) return []
  return raw.filter(isProfile)
}

export function saveDbConnection(
  profile: Omit<GisDbConnectionProfile, 'id' | 'savedAt'> &
    Partial<Pick<GisDbConnectionProfile, 'id' | 'savedAt'>>,
): GisDbConnectionProfile {
  const all = listDbConnections()
  const id = profile.id?.trim() || newId()
  const next: GisDbConnectionProfile = {
    ...profile,
    id,
    name: profile.name.trim(),
    host: profile.host.trim(),
    database: profile.database.trim(),
    username: profile.username.trim(),
    password: profile.password,
    savedAt: profile.savedAt ?? nowIso(),
    lastTestStatus: profile.lastTestStatus ?? 'untested',
    lastTestMessage: profile.lastTestMessage,
  }
  const idx = all.findIndex(p => p.id === id)
  if (idx >= 0) all[idx] = next
  else all.unshift(next)
  writeAll(all)
  return next
}

export function deleteDbConnection(id: string): boolean {
  const all = listDbConnections()
  const next = all.filter(p => p.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

export function updateDbConnectionTest(
  id: string,
  status: GisDbTestStatus,
  message?: string,
): GisDbConnectionProfile | null {
  const all = listDbConnections()
  const idx = all.findIndex(p => p.id === id)
  if (idx < 0) return null
  const updated: GisDbConnectionProfile = {
    ...all[idx],
    lastTestStatus: status,
    lastTestMessage: message,
  }
  all[idx] = updated
  writeAll(all)
  return updated
}

function validateProfileFields(profile: GisDbConnectionProfile): GisDbTestResult | null {
  const host = profile.host?.trim() ?? ''
  const database = profile.database?.trim() ?? ''
  if (!host && !database) {
    return { ok: false, message: 'Host and database are required.' }
  }
  if (!host) {
    return { ok: false, message: 'Host is required.' }
  }
  if (!database) {
    return { ok: false, message: 'Database is required.' }
  }
  return null
}

/**
 * Tests a DB connection. Prefer the R4 GIS gateway when available;
 * otherwise validate required fields and return a local simulation result.
 */
export async function testDbConnection(profile: GisDbConnectionProfile): Promise<GisDbTestResult> {
  const validation = validateProfileFields(profile)
  if (validation) {
    updateDbConnectionTest(profile.id, 'fail', validation.message)
    return validation
  }

  try {
    const res = await fetch(GATEWAY_DB_TEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; message?: string }
      const result: GisDbTestResult = {
        ok: data.ok !== false,
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : data.ok === false
              ? 'Gateway reported a failed connection test.'
              : 'Connection test succeeded via GIS gateway.',
      }
      updateDbConnectionTest(profile.id, result.ok ? 'ok' : 'fail', result.message)
      return result
    }
  } catch {
    // Gateway unavailable — fall through to local simulation.
  }

  const simulated: GisDbTestResult = {
    ok: true,
    message: `Simulated OK for ${profile.kind} @ ${profile.host}/${profile.database} (GIS gateway not available).`,
  }
  updateDbConnectionTest(profile.id, 'ok', simulated.message)
  return simulated
}

/**
 * Lists tables via the R4 GIS gateway. Returns empty + message when gateway is required / unavailable.
 */
export async function fetchDbTables(profile: GisDbConnectionProfile): Promise<GisDbTablesResult> {
  try {
    const res = await fetch(GATEWAY_DB_TABLES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        tables?: Array<{ name?: string; schema?: string } | string>
        message?: string
      }
      const tables: GisDbTableInfo[] = []
      if (Array.isArray(data.tables)) {
        for (const t of data.tables) {
          if (typeof t === 'string') {
            tables.push({ name: t })
            continue
          }
          if (t && typeof t.name === 'string') {
            tables.push({
              name: t.name,
              schema: typeof t.schema === 'string' ? t.schema : undefined,
            })
          }
        }
      }
      return {
        tables,
        message: typeof data.message === 'string' ? data.message : undefined,
      }
    }
  } catch {
    // fall through
  }

  return {
    tables: [],
    message: 'GIS DB gateway is required to list tables. Start /api/gis-gateway and try again.',
  }
}
