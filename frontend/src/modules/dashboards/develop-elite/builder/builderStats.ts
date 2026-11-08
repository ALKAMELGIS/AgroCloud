import type {
  BuilderFilterCondition,
  BuilderNumberFormat,
  BuilderSortOrder,
  BuilderStatistic,
} from './builderTypes'

export type BuilderRow = Record<string, unknown>

export type BuilderFieldInfo = {
  name: string
  alias: string
  type: 'number' | 'string' | 'date' | 'other'
  /** Coded-value domain: stored code → label. */
  codes?: Map<string, string>
}

/** Cross-filter coming from another element's selection. */
export type BuilderSelectionFilter = {
  field: string
  values: string[]
}

export type BuilderCategory = {
  key: string
  label: string
  value: number
  count: number
}

const EMPTY_LABEL = '(empty)'

function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/** Raw value as a comparable string key (selection and category grouping use the same key). */
export function builderValueKey(v: unknown): string {
  if (isEmpty(v)) return ''
  return String(v).trim()
}

export function builderDisplayValue(v: unknown, field?: BuilderFieldInfo): string {
  const key = builderValueKey(v)
  if (!key) return EMPTY_LABEL
  const coded = field?.codes?.get(key)
  if (coded) return coded
  if (field?.type === 'date') {
    const n = Number(v)
    if (Number.isFinite(n) && n > 1e11) return new Date(n).toLocaleDateString()
  }
  return key
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function matchesCondition(row: BuilderRow, c: BuilderFilterCondition): boolean {
  const raw = row[c.field]
  if (c.op === 'empty') return isEmpty(raw)
  if (c.op === 'not-empty') return !isEmpty(raw)
  const left = builderValueKey(raw)
  const right = c.value.trim()
  if (c.op === 'contains') return left.toLowerCase().includes(right.toLowerCase())
  const ln = toNumber(raw)
  const rn = toNumber(right)
  const numeric = ln != null && rn != null
  switch (c.op) {
    case '=':
      return numeric ? ln === rn : left.toLowerCase() === right.toLowerCase()
    case '!=':
      return numeric ? ln !== rn : left.toLowerCase() !== right.toLowerCase()
    case '>':
      return numeric ? ln > rn : left > right
    case '>=':
      return numeric ? ln >= rn : left >= right
    case '<':
      return numeric ? ln < rn : left < right
    case '<=':
      return numeric ? ln <= rn : left <= right
    default:
      return true
  }
}

/**
 * Element filter conditions (all must match) + cross-filters from selections. A selection on a
 * field the rows do not have is ignored, so a selector only filters elements it can apply to.
 */
export function applyBuilderFilters(
  rows: BuilderRow[],
  conditions: BuilderFilterCondition[],
  selections: BuilderSelectionFilter[] = [],
): BuilderRow[] {
  const active = conditions.filter(c => c.field)
  const sample = rows[0]
  const sels = selections.filter(s => s.values.length > 0 && sample != null && s.field in sample)
  if (!active.length && !sels.length) return rows
  const selSets = sels.map(s => ({ field: s.field, values: new Set(s.values) }))
  return rows.filter(
    row =>
      active.every(c => matchesCondition(row, c)) &&
      selSets.every(s => s.values.has(builderValueKey(row[s.field]))),
  )
}

/** count / sum / avg / min / max. Non-numeric values are skipped (count counts rows). */
export function builderStatistic(rows: BuilderRow[], statistic: BuilderStatistic, field: string): number | null {
  if (statistic === 'count') return rows.length
  if (!field) return null
  let n = 0
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    const v = toNumber(row[field])
    if (v == null) continue
    n += 1
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  if (n === 0) return null
  if (statistic === 'sum') return sum
  if (statistic === 'avg') return sum / n
  if (statistic === 'min') return min
  return max
}

/** Group rows by a field and compute the statistic per category, sorted and capped (rest → "Other"). */
export function builderCategories(
  rows: BuilderRow[],
  categoryField: string,
  statistic: BuilderStatistic,
  valueField: string,
  options: { sort: BuilderSortOrder; max: number; field?: BuilderFieldInfo; otherLabel?: string | null },
): BuilderCategory[] {
  if (!categoryField) return []
  const groups = new Map<string, BuilderRow[]>()
  for (const row of rows) {
    const key = builderValueKey(row[categoryField])
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  const cats: BuilderCategory[] = []
  for (const [key, list] of groups) {
    cats.push({
      key,
      label: key ? builderDisplayValue(key, options.field) : EMPTY_LABEL,
      value: builderStatistic(list, statistic, valueField) ?? 0,
      count: list.length,
    })
  }
  const byLabel = (a: BuilderCategory, b: BuilderCategory) => a.label.localeCompare(b.label, undefined, { numeric: true })
  cats.sort((a, b) => {
    switch (options.sort) {
      case 'value-asc':
        return a.value - b.value || byLabel(a, b)
      case 'label-asc':
        return byLabel(a, b)
      case 'label-desc':
        return byLabel(b, a)
      default:
        return b.value - a.value || byLabel(a, b)
    }
  })
  const max = Math.max(1, options.max)
  if (cats.length <= max || options.otherLabel === null) return cats.slice(0, max)
  const head = cats.slice(0, max - 1)
  const tail = cats.slice(max - 1)
  const additive = statistic === 'count' || statistic === 'sum'
  head.push({
    key: '__other__',
    label: options.otherLabel ?? 'Other',
    value: additive ? tail.reduce((s, c) => s + c.value, 0) : builderStatistic(tail.flatMap(c => groups.get(c.key) ?? []), statistic, valueField) ?? 0,
    count: tail.reduce((s, c) => s + c.count, 0),
  })
  return head
}

/** Distinct values of a field (for selectors / filter value pickers). */
export function builderDistinctValues(rows: BuilderRow[], field: string, fieldInfo?: BuilderFieldInfo, limit = 500): { key: string; label: string; count: number }[] {
  if (!field) return []
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = builderValueKey(row[field])
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key ? builderDisplayValue(key, fieldInfo) : EMPTY_LABEL, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .slice(0, limit)
}

export function formatBuilderNumber(value: number | null, format: BuilderNumberFormat): string {
  if (value == null || !Number.isFinite(value)) return '—'
  let body: string
  if (format.compact && Math.abs(value) >= 1000) {
    body = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: Math.max(1, format.decimals) }).format(value)
  } else {
    body = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: format.decimals,
      maximumFractionDigits: format.decimals,
    }).format(value)
  }
  return `${format.prefix}${body}${format.suffix}`
}

export function builderStatisticLabel(statistic: BuilderStatistic): string {
  return { count: 'Count', sum: 'Sum', avg: 'Average', min: 'Minimum', max: 'Maximum' }[statistic]
}
