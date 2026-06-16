import type { RecipeColumn } from '../formFieldColumns'

type ValuesBySourceState = {
  valuesBySource?: Record<string, Record<string, string>>
}

export type RecipeRow = {
  recordId: string
  tsUtc: string
  cells: Record<string, string>
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const STORAGE_BY_FORM: Record<string, string> = {
  EC: 'ecph_records_v1',
  Irrigation: 'irrigation_scheduling_records_v1',
  Harvest: 'harvest_logging_records_v1',
  Production: 'production_tracking_records_v1',
  QHIS: 'qhis_records_v1',
  Fertigation: 'fertigation_records_v1',
}

type SaveRecordish = {
  id?: string
  tsUtc?: string
  state?: ValuesBySourceState
  formKey?: string
}

type FertigationEntry = {
  id?: number
  site?: string
  project?: string
  block?: string
  date?: string
  time?: string
  country?: string
  location?: string
  fertilizerType?: string
  concentration?: string
  status?: string
  flowRate?: string
  durationHours?: string
  cycles?: string
  totalVolume?: string
}

export function flattenStateToCells(state: ValuesBySourceState | undefined, columns: RecipeColumn[]): Record<string, string> {
  const vs = state?.valuesBySource ?? {}
  const out: Record<string, string> = {}
  for (const col of columns) {
    const raw = vs[col.sourceKey]?.[col.fieldName]
    out[col.id] = raw !== undefined && raw !== null ? String(raw).trim() : ''
  }
  return out
}

function rowFromFertObject(obj: FertigationEntry, columns: RecipeColumn[]): Record<string, string> {
  const flat: Record<string, string> = {}
  const keys = new Map<string, string>()
  for (const [k, v] of Object.entries(obj)) {
    keys.set(k.toLowerCase(), String(v ?? '').trim())
  }
  for (const col of columns) {
    const fn = col.fieldName
    const direct =
      (obj as any)[fn] ??
      (obj as any)[fn.toLowerCase()] ??
      keys.get(fn.toLowerCase())
    flat[col.id] = direct !== undefined && direct !== null ? String(direct).trim() : ''
  }
  return flat
}

/**
 * Locally saved submissions for the workflow (same stores data-entry forms use).
 */
export function loadRecipeRows(formKey: string, columns: RecipeColumn[]): RecipeRow[] {
  const storageKey = STORAGE_BY_FORM[formKey]
  if (!storageKey || columns.length === 0) return []

  const raw = readJson<unknown[]>(storageKey, [])
  if (!Array.isArray(raw) || raw.length === 0) return []

  const rows: RecipeRow[] = []

  if (formKey === 'Fertigation') {
    for (const item of raw as FertigationEntry[]) {
      if (!item || typeof item !== 'object') continue
      rows.push({
        recordId: String(item.id ?? Math.random()),
        tsUtc: String((item as any).date ?? '') || new Date().toISOString(),
        cells: rowFromFertObject(item, columns),
      })
    }
    return rows
  }

  for (const item of raw as SaveRecordish[]) {
    if (!item || typeof item !== 'object') continue
    const state = item.state
    if (!state || typeof state !== 'object') continue
    rows.push({
      recordId: String(item.id ?? ''),
      tsUtc: String(item.tsUtc ?? ''),
      cells: flattenStateToCells(state, columns),
    })
  }

  return rows
}

export function rowsToCsv(columns: RecipeColumn[], rows: RecipeRow[]): string {
  const headers = columns.map(c => c.header.replace(/"/g, '""'))
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(columns.map(c => esc(r.cells[c.id] ?? '')).join(','))
  }
  return lines.join('\r\n')
}
