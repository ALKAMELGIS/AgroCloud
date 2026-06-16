/**
 * Derives ordered table columns from the same bindings used by Data Source Fields (Master Data / workflow settings).
 * Mirrors normalizeEnabledBySource in datasourcefieldspanel.tsx.
 */

export const FORM_DATA_SOURCE_BINDINGS_KEY = 'form_data_source_bindings_v1'

type FieldConfig = { name: string; enabled: boolean }
type ManagementLayerBinding = { sourceId: string; selectedFields: string[] }
export type FormBinding = {
  sourceId?: string
  sourceIds?: string[]
  fieldConfigsBySource?: Record<string, FieldConfig[]>
  selectedFieldsBySource?: Record<string, string[]>
  managementLayer?: ManagementLayerBinding
}
type FormBindings = Record<string, FormBinding>

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const normalizeIds = (input: unknown): string[] =>
  Array.isArray(input) ? input.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean) : []

export const normalizeEnabledBySource = (
  binding: FormBinding | undefined,
): { sourceIds: string[]; enabledBySource: Record<string, string[]> } => {
  const sourceIds = normalizeIds(binding?.sourceIds)
  const legacy = typeof binding?.sourceId === 'string' ? binding.sourceId.trim() : ''
  const ids = sourceIds.length ? Array.from(new Set(sourceIds)) : legacy ? [legacy] : []
  const enabledBySource: Record<string, string[]> = {}
  for (const id of ids) {
    const configs = binding?.fieldConfigsBySource?.[id]
    if (Array.isArray(configs)) {
      enabledBySource[id] = configs.filter(c => c && c.enabled).map(c => c.name).filter(Boolean)
      continue
    }
    const legacySelected = binding?.selectedFieldsBySource?.[id]
    enabledBySource[id] = Array.isArray(legacySelected) ? legacySelected.filter(Boolean) : []
  }
  return { sourceIds: ids, enabledBySource }
}

export type RecipeColumn = {
  id: string
  /** Column header — includes layer hint when the same field name appears on multiple layers */
  header: string
  fieldName: string
  sourceKey: string
  layerLabel: string
}

function layerDisplayLabel(sourceKey: string, layerNameById: Record<string, string>): string {
  if (sourceKey.startsWith('management:')) {
    const raw = sourceKey.slice('management:'.length)
    return layerNameById[raw]?.trim() || 'Management'
  }
  return layerNameById[sourceKey]?.trim() || sourceKey.split(/[/:]/).pop() || sourceKey
}

/**
 * Columns in the same order as the fill form: management layer fields first (if any), then each configured layer’s enabled fields.
 */
export function getRecipeColumnsForForm(formKey: string, layerNameById: Record<string, string> = {}): RecipeColumn[] {
  const bindings = readJson<FormBindings>(FORM_DATA_SOURCE_BINDINGS_KEY, {})
  const binding = bindings[formKey]
  const { sourceIds, enabledBySource } = normalizeEnabledBySource(binding)
  const mgmt = binding?.managementLayer

  const mgmtKey =
    mgmt?.sourceId && Array.isArray(mgmt.selectedFields) && mgmt.selectedFields.length
      ? `management:${mgmt.sourceId}`
      : null

  const rows: Omit<RecipeColumn, 'header'>[] = []

  const pushFields = (sourceKey: string, fields: string[]) => {
    const layerLabel = layerDisplayLabel(sourceKey, layerNameById)
    for (const fieldName of fields) {
      const fn = String(fieldName ?? '').trim()
      if (!fn) continue
      const safeSource = sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeField = fn.replace(/[^a-zA-Z0-9_-]/g, '_')
      rows.push({
        id: `${safeSource}__${safeField}`,
        fieldName: fn,
        sourceKey,
        layerLabel,
      })
    }
  }

  if (mgmtKey && mgmt?.selectedFields?.length) {
    pushFields(mgmtKey, mgmt.selectedFields)
  }
  for (const sid of sourceIds) {
    pushFields(sid, enabledBySource[sid] ?? [])
  }

  const counts = new Map<string, number>()
  for (const r of rows) {
    counts.set(r.fieldName, (counts.get(r.fieldName) ?? 0) + 1)
  }

  return rows.map(r => ({
    ...r,
    header: (counts.get(r.fieldName) ?? 0) > 1 ? `${r.fieldName} · ${r.layerLabel}` : r.fieldName,
  }))
}
