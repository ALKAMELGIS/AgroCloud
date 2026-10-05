import type { ArcGisTableRow, DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import { DEFAULT_DEVELOP_ELITE_CHART_PALETTE } from './developEliteChartsConfig'
import { resolveDevelopEliteSliceColor } from './developEliteCropChartColors'
import type { DevelopEliteChartSlice } from './useDevelopEliteDashboardData'

export function readArcGisField(row: ArcGisTableRow, field: string): unknown {
  const key = field.trim()
  if (!key) return undefined
  const direct = row[key]
  if (direct != null && direct !== '') return direct
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === lower && v != null && v !== '') return v
  }
  return undefined
}

export function readArcGisNumber(row: ArcGisTableRow, field: string): number | null {
  const raw = readArcGisField(row, field)
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function resolveDevelopEliteFieldDomainLabels(
  meta: DevelopEliteLayerMeta,
  field: string,
): Map<string, string> | undefined {
  const want = field.trim().toLowerCase()
  if (!want) return undefined
  for (const [name, labels] of meta.fieldDomainLabels ?? new Map()) {
    if (name.toLowerCase() === want) return labels
  }
  if (want === 'crop_type' && meta.cropTypeLabels.size) return meta.cropTypeLabels
  return undefined
}

/** Resolve ArcGIS coded-value domain code → description (e.g. Variety 14012 → cultivar name). */
export function resolveCodedFieldLabel(
  row: ArcGisTableRow,
  meta: DevelopEliteLayerMeta,
  field: string,
): string {
  const raw = readArcGisField(row, field)
  if (raw == null || raw === '') {
    return field.toLowerCase() === 'crop_type' ? 'Unknown' : ''
  }
  const key = String(raw).trim()
  const domain = resolveDevelopEliteFieldDomainLabels(meta, field)
  if (domain) {
    return domain.get(key) ?? domain.get(String(Number(key))) ?? key
  }
  return key
}

export function resolveCropLabel(row: ArcGisTableRow, meta: DevelopEliteLayerMeta, field: string): string {
  return resolveCodedFieldLabel(row, meta, field)
}

function buildAggregateMap(
  rows: ArcGisTableRow[],
  groupField: string,
  meta: DevelopEliteLayerMeta,
  sumField?: string,
): Map<string, number> {
  const map = new Map<string, number>()
  const valueKey = sumField?.trim()
  for (const row of rows) {
    const label = resolveCropLabel(row, meta, groupField)
    let delta = 1
    if (valueKey) {
      delta = readArcGisNumber(row, valueKey) ?? 0
    }
    map.set(label, (map.get(label) ?? 0) + delta)
  }
  return map
}

function mapToSlices(map: Map<string, number>): DevelopEliteChartSlice[] {
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
  const palette = DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  return entries.map(([label, value], i) => ({
    label,
    value,
    color: resolveDevelopEliteSliceColor(label, i, palette, 'pie'),
  }))
}

const CHART_SUM_FIELD_ALIASES = [
  'Total_Tree',
  'TOTAL_TREE',
  'total_tree',
  'TotalTrees',
  'total_trees',
  'Per_Tons',
  'PER_TONS',
  'per_tons',
  'Per Tons',
  'Total_Tons',
  'TOTAL_TONS',
  'Tons',
]

function resolveSumField(rows: ArcGisTableRow[], configured?: string): string | undefined {
  const key = configured?.trim()
  if (!key) return undefined
  const candidates = [key, ...CHART_SUM_FIELD_ALIASES.filter(a => a.toLowerCase() !== key.toLowerCase())]
  for (const field of candidates) {
    if (rows.some(r => (readArcGisNumber(r, field) ?? 0) > 0)) return field
  }
  return key
}

export function aggregateChartSlices(
  rows: ArcGisTableRow[],
  groupField: string,
  meta: DevelopEliteLayerMeta,
  valueField?: string,
): DevelopEliteChartSlice[] {
  const valueKey = resolveSumField(rows, valueField)
  if (!valueKey) return mapToSlices(buildAggregateMap(rows, groupField, meta))

  const summed = buildAggregateMap(rows, groupField, meta, valueKey)
  const total = [...summed.values()].reduce((a, b) => a + b, 0)
  if (rows.length > 0 && total <= 0) {
    return mapToSlices(buildAggregateMap(rows, groupField, meta))
  }
  return mapToSlices(summed)
}
