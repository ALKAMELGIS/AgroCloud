import type { ArcGisTableRow, DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import { colorForCropChartLabel } from './developEliteCropChartColors'
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

export function resolveCropLabel(row: ArcGisTableRow, meta: DevelopEliteLayerMeta, field: string): string {
  const raw = readArcGisField(row, field)
  if (raw == null || raw === '') return 'Unknown'
  const key = String(raw).trim()
  return (
    meta.cropTypeLabels.get(key) ??
    meta.cropTypeLabels.get(String(Number(key))) ??
    key
  )
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
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: colorForCropChartLabel(label, i),
    }))
}

const TOTAL_TREE_FIELD_ALIASES = ['Total_Tree', 'TOTAL_TREE', 'total_tree', 'TotalTrees', 'total_trees']

function resolveSumField(rows: ArcGisTableRow[], configured?: string): string | undefined {
  const key = configured?.trim()
  if (!key) return undefined
  const candidates = [key, ...TOTAL_TREE_FIELD_ALIASES.filter(a => a.toLowerCase() !== key.toLowerCase())]
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
