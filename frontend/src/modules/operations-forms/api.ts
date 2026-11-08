/** Client for /api/ops (operations forms). Types mirror backend/server/operations/formSchemas.js. */
import { apiUrl } from '@/core/api/apiOrigin'
import { readCurrentUser } from '@/core/auth/auth'

export type Bilingual = { en: string; ar: string }

export type OpsFieldType = 'date' | 'time' | 'number' | 'integer' | 'text' | 'textarea' | 'select'

export type OpsField = {
  key: string
  type: OpsFieldType
  label: Bilingual
  section: string
  required?: boolean
  list?: string
  min?: number
  max?: number
  unit?: string
  computed?: string
  aliases?: string[]
}

export type OpsMetric = { key: string; agg: 'sum' | 'avg' | 'count' | 'min' | 'max'; label: Bilingual; unit?: string }

export type OpsForm = {
  id: string
  table: string
  group: string
  icon: string
  title: Bilingual
  docCode: string
  docTitle: string
  dateField: string
  titleField: string
  uniqueKey: string[]
  importLayout?: 'irrigation-wide' | 'fertilizer-issue-wide'
  fields: OpsField[]
  metrics: OpsMetric[]
  dimensions: string[]
  filters: string[]
}

export type OpsListItem = { id: number; value: string; labelAr: string | null; meta: Record<string, unknown> | null; active: boolean; sortOrder: number }

export type OpsSettings = {
  company: { name: string; issue: string }
  ecPhLimits: { ecMin: number; ecMax: number; phMin: number; phMax: number; drainMin: number; drainMax: number }
  autoAddListValues: boolean
  forms: Record<string, { docCode?: string; docTitle?: string }>
}

export type OpsSchema = {
  forms: OpsForm[]
  groups: { id: string; label: Bilingual; forms: string[] }[]
  sections: Record<string, Bilingual>
  lists: { key: string; label: Bilingual; meta?: string[] }[]
  listItems: Record<string, OpsListItem[]>
  settings: OpsSettings
  counts: Record<string, { total: number; lastDate: string | null }>
}

export type OpsRecord = Record<string, string | number | null> & { id: number }

export type OpsQuery = {
  from?: string
  to?: string
  q?: string
  filters?: Record<string, string[]>
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  deleted?: boolean
}

export type OpsImportResult = {
  received: number
  valid: number
  inserted: number
  duplicates: number
  invalid: number
  errors: { row: number; errors: Record<string, string> }[]
}

export type OpsAggregate = {
  groups: string[]
  metrics: OpsMetric[]
  rows: { keys: (string | null)[]; values: (number | null)[] }[]
}

export class OpsApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, unknown> | null = null,
  ) {
    super(message)
  }
}

function actorName(): string {
  const u = readCurrentUser() as { name?: string; email?: string; user?: { name?: string; email?: string } } | null
  const name = u?.name || u?.user?.name || u?.email || u?.user?.email || ''
  // HTTP headers are ISO-8859-1; percent-encode anything else (Arabic names).
  return /^[\x20-\x7e]*$/.test(name) ? name : encodeURIComponent(name)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(`/api/ops${path}`), {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-agrocloud-user': actorName() },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new OpsApiError(0, 'The AgroCloud server cannot be reached. Check that it is running.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: Record<string, unknown> }
  if (!res.ok) throw new OpsApiError(res.status, data.error || `Request failed (${res.status})`, data.details ?? null)
  return data as T
}

export function queryString(q: OpsQuery & { groupBy?: string; groupBy2?: string; nav?: boolean } = {}): string {
  const p = new URLSearchParams()
  if (q.from) p.set('from', q.from)
  if (q.to) p.set('to', q.to)
  if (q.q) p.set('q', q.q)
  if (q.sort) p.set('sort', q.sort)
  if (q.dir) p.set('dir', q.dir)
  if (q.page) p.set('page', String(q.page))
  if (q.pageSize) p.set('pageSize', String(q.pageSize))
  if (q.deleted) p.set('deleted', '1')
  if (q.groupBy) p.set('groupBy', q.groupBy)
  if (q.groupBy2) p.set('groupBy2', q.groupBy2)
  if (q.nav) p.set('nav', '1')
  for (const [k, vals] of Object.entries(q.filters ?? {})) if (vals.length) p.set(`f.${k}`, vals.join('||'))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const opsApi = {
  schema: () => request<OpsSchema>('GET', '/schema'),
  list: (form: string, q: OpsQuery) => request<{ rows: OpsRecord[]; total: number; page: number; pageSize: number }>('GET', `/forms/${form}/records${queryString(q)}`),
  get: (form: string, id: number, navQuery?: OpsQuery) =>
    request<{ record: OpsRecord; nav?: { index: number; total: number; prev: number | null; next: number | null } }>(
      'GET',
      `/forms/${form}/records/${id}${navQuery ? queryString({ ...navQuery, page: undefined, pageSize: undefined, nav: true }) : ''}`,
    ),
  create: (form: string, values: Record<string, unknown>, allowDuplicate = false) =>
    request<{ record: OpsRecord }>('POST', `/forms/${form}/records${allowDuplicate ? '?allowDuplicate=1' : ''}`, values),
  update: (form: string, id: number, values: Record<string, unknown>) => request<{ record: OpsRecord }>('PUT', `/forms/${form}/records/${id}`, values),
  remove: (form: string, id: number) => request<{ ok: true }>('DELETE', `/forms/${form}/records/${id}`),
  restore: (form: string, id: number) => request<{ record: OpsRecord }>('POST', `/forms/${form}/records/${id}/restore`),
  history: (form: string, id: number) =>
    request<{ history: { id: number; action: string; actor: string | null; at: string; changes: Record<string, [unknown, unknown]> | null }[] }>(
      'GET',
      `/forms/${form}/records/${id}/history`,
    ),
  importRows: (form: string, rows: Record<string, unknown>[], source: string, dryRun = false) =>
    request<OpsImportResult>('POST', `/forms/${form}/import`, { rows, source, dryRun }),
  filters: (form: string) =>
    request<{ options: Record<string, { value: string; count: number }[]>; dateRange: { min: string | null; max: string | null }; total: number }>('GET', `/forms/${form}/filters`),
  aggregate: (form: string, q: OpsQuery & { groupBy?: string; groupBy2?: string }) => request<OpsAggregate>('GET', `/forms/${form}/aggregate${queryString(q)}`),
  saveListItem: (list: string, item: Partial<OpsListItem>) =>
    item.id ? request<{ id: number }>('PUT', `/lists/${list}/${item.id}`, item) : request<{ id: number }>('POST', `/lists/${list}`, item),
  deleteListItem: (list: string, id: number) => request<{ ok: true }>('DELETE', `/lists/${list}/${id}`),
  saveSettings: (patch: Partial<OpsSettings>) => request<{ settings: OpsSettings }>('PUT', '/settings', patch),
}

/** Fetch every record matching a query (for exports and reports), page by page. */
export async function fetchAllRecords(form: string, q: OpsQuery, onProgress?: (done: number, total: number) => void): Promise<OpsRecord[]> {
  const out: OpsRecord[] = []
  let page = 1
  for (;;) {
    const res = await opsApi.list(form, { ...q, page, pageSize: 5000 })
    out.push(...res.rows)
    onProgress?.(out.length, res.total)
    if (out.length >= res.total || !res.rows.length) return out
    page += 1
  }
}
