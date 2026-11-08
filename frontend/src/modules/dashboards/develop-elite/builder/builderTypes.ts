/**
 * Dashboard Builder — element model (ArcGIS Dashboards–style elements on the Develop Elite grid).
 *
 * Elements live in `layout.builderElements` keyed by widget id (`el-…`); their position is a normal
 * grid layout item, so move / resize / undo work exactly like the built-in widgets.
 */

export type BuilderElementType =
  | 'indicator'
  | 'gauge'
  | 'serial-chart'
  | 'pie-chart'
  | 'table'
  | 'list'
  | 'category-selector'
  | 'text'
  | 'embed'

export type BuilderStatistic = 'count' | 'sum' | 'avg' | 'min' | 'max'

export type BuilderFilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'empty' | 'not-empty'

export type BuilderFilterCondition = {
  field: string
  op: BuilderFilterOperator
  value: string
}

/** A dashboard data source key (Settings → Data) or a custom FeatureServer layer/table URL. */
export type BuilderDataSourceRef =
  | { kind: 'catalog'; key: string }
  | { kind: 'url'; url: string }

export type BuilderSortOrder = 'value-desc' | 'value-asc' | 'label-asc' | 'label-desc'

export type BuilderNumberFormat = {
  decimals: number
  prefix: string
  suffix: string
  /** Show 12.4K / 3.1M. */
  compact: boolean
}

export type BuilderElementConfig = {
  id: string
  type: BuilderElementType
  title: string
  showTitle: boolean
  description: string
  /** Data source (ignored by text / embed). */
  source: BuilderDataSourceRef | null
  filters: BuilderFilterCondition[]
  /** Value: statistic over `valueField` (count ignores the field). */
  statistic: BuilderStatistic
  valueField: string
  /** Group-by field for charts, lists and selectors. */
  categoryField: string
  maxCategories: number
  sort: BuilderSortOrder
  /** Table columns (empty = first 6 fields). */
  columns: string[]
  /** List item subtitle field. */
  subtitleField: string
  format: BuilderNumberFormat
  color: string
  /** Indicator: icon class (Font Awesome) shown beside the value. */
  icon: string
  /** Indicator: optional reference value → shows "% of reference". */
  referenceStatistic: BuilderStatistic | 'none'
  referenceField: string
  /** Gauge range. */
  gaugeMin: number
  gaugeMax: number
  /** Serial chart. */
  chartKind: 'bar' | 'column' | 'line'
  /** Pie chart. */
  donut: boolean
  /** Category selector presentation. */
  selectorStyle: 'dropdown' | 'buttons'
  multiSelect: boolean
  /** Actions: selecting a category filters these elements ('all' = every element on the same field). */
  actionTargets: 'none' | 'all' | string[]
  /** Text element (supports # headings, **bold**, - lists). */
  text: string
  textAlign: 'start' | 'center' | 'end'
  textSize: number
  /** Embedded HTTPS page. */
  embedUrl: string
}

export type BuilderElementKind = {
  type: BuilderElementType
  label: string
  description: string
  icon: string
  group: 'Indicators' | 'Charts' | 'Lists & tables' | 'Selectors' | 'Content'
  /** Default grid size (lg breakpoint, 24 columns). */
  w: number
  h: number
  needsData: boolean
  /** Can drive a cross-filter (selecting a category). */
  selectable: boolean
}

export const BUILDER_ELEMENT_KINDS: BuilderElementKind[] = [
  { type: 'indicator', label: 'Indicator', description: 'One number: count, sum or average of a field.', icon: 'fa-solid fa-hashtag', group: 'Indicators', w: 4, h: 3, needsData: true, selectable: false },
  { type: 'gauge', label: 'Gauge', description: 'A value against a minimum and maximum.', icon: 'fa-solid fa-gauge-high', group: 'Indicators', w: 4, h: 5, needsData: true, selectable: false },
  { type: 'serial-chart', label: 'Bar / line chart', description: 'Compare a statistic across categories.', icon: 'fa-solid fa-chart-column', group: 'Charts', w: 8, h: 7, needsData: true, selectable: true },
  { type: 'pie-chart', label: 'Pie chart', description: 'Share of each category in the total.', icon: 'fa-solid fa-chart-pie', group: 'Charts', w: 6, h: 7, needsData: true, selectable: true },
  { type: 'table', label: 'Table', description: 'Rows and chosen columns, sortable.', icon: 'fa-solid fa-table', group: 'Lists & tables', w: 10, h: 7, needsData: true, selectable: false },
  { type: 'list', label: 'List', description: 'Categories with their values; click to filter.', icon: 'fa-solid fa-list-ul', group: 'Lists & tables', w: 5, h: 7, needsData: true, selectable: true },
  { type: 'category-selector', label: 'Category selector', description: 'Filter other elements by a field value.', icon: 'fa-solid fa-filter', group: 'Selectors', w: 6, h: 3, needsData: true, selectable: true },
  { type: 'text', label: 'Text', description: 'Heading, notes or instructions.', icon: 'fa-solid fa-font', group: 'Content', w: 6, h: 3, needsData: false, selectable: false },
  { type: 'embed', label: 'Embedded page', description: 'Show an HTTPS page (report, video, app).', icon: 'fa-solid fa-window-maximize', group: 'Content', w: 8, h: 7, needsData: false, selectable: false },
]

export function builderElementKind(type: BuilderElementType): BuilderElementKind {
  return BUILDER_ELEMENT_KINDS.find(k => k.type === type) ?? BUILDER_ELEMENT_KINDS[0]!
}

export const BUILDER_ELEMENT_ID_PREFIX = 'el-'

export function isBuilderElementId(id: string): boolean {
  return id.startsWith(BUILDER_ELEMENT_ID_PREFIX)
}

export function newBuilderElementId(): string {
  return `${BUILDER_ELEMENT_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const DEFAULT_FORMAT: BuilderNumberFormat = { decimals: 0, prefix: '', suffix: '', compact: false }

export const BUILDER_PALETTE = ['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#14b8a6', '#facc15', '#fb7185', '#60a5fa', '#a3e635']

export function createBuilderElement(type: BuilderElementType, id = newBuilderElementId()): BuilderElementConfig {
  const kind = builderElementKind(type)
  return {
    id,
    type,
    title: kind.label,
    showTitle: true,
    description: '',
    source: kind.needsData ? { kind: 'catalog', key: 'structuresLayerUrl' } : null,
    filters: [],
    statistic: 'count',
    valueField: '',
    categoryField: '',
    maxCategories: 10,
    sort: 'value-desc',
    columns: [],
    subtitleField: '',
    format: { ...DEFAULT_FORMAT },
    color: '#22c55e',
    icon: type === 'indicator' ? 'fa-solid fa-layer-group' : '',
    referenceStatistic: 'none',
    referenceField: '',
    gaugeMin: 0,
    gaugeMax: 100,
    chartKind: 'column',
    donut: true,
    selectorStyle: 'dropdown',
    multiSelect: false,
    actionTargets: kind.selectable ? 'all' : 'none',
    text: type === 'text' ? '# Section title\nWrite notes here. Use **bold** and - lists.' : '',
    textAlign: 'start',
    textSize: 14,
    embedUrl: '',
  }
}

const TYPES = new Set(BUILDER_ELEMENT_KINDS.map(k => k.type))
const STATS = new Set<BuilderStatistic>(['count', 'sum', 'avg', 'min', 'max'])
const OPS = new Set<BuilderFilterOperator>(['=', '!=', '>', '>=', '<', '<=', 'contains', 'empty', 'not-empty'])
const SORTS = new Set<BuilderSortOrder>(['value-desc', 'value-asc', 'label-asc', 'label-desc'])

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback: number, min = -1e12, max = 1e12): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function pick<T extends string>(v: unknown, allowed: readonly T[] | Set<T>, fallback: T): T {
  const set = allowed instanceof Set ? allowed : new Set(allowed)
  return set.has(v as T) ? (v as T) : fallback
}

function normalizeSource(v: unknown): BuilderDataSourceRef | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.kind === 'catalog' && typeof o.key === 'string' && o.key) return { kind: 'catalog', key: o.key }
  if (o.kind === 'url' && typeof o.url === 'string') return { kind: 'url', url: o.url.trim() }
  return null
}

/** Repair a stored element (unknown keys dropped, bad values replaced by defaults). */
export function normalizeBuilderElement(raw: unknown, id: string): BuilderElementConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = o.type as BuilderElementType
  if (!TYPES.has(type)) return null
  const d = createBuilderElement(type, id)
  const fmt = (o.format && typeof o.format === 'object' ? o.format : {}) as Record<string, unknown>
  const targets = o.actionTargets
  return {
    ...d,
    title: str(o.title, d.title).slice(0, 120),
    showTitle: o.showTitle !== false,
    description: str(o.description).slice(0, 400),
    source: builderElementKind(type).needsData ? (normalizeSource(o.source) ?? d.source) : null,
    filters: Array.isArray(o.filters)
      ? o.filters
          .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map(f => ({ field: str(f.field), op: pick(f.op, OPS, '='), value: str(f.value) }))
          .filter(f => f.field)
          .slice(0, 12)
      : [],
    statistic: pick(o.statistic, STATS, d.statistic),
    valueField: str(o.valueField),
    categoryField: str(o.categoryField),
    maxCategories: Math.round(num(o.maxCategories, d.maxCategories, 1, 100)),
    sort: pick(o.sort, SORTS, d.sort),
    columns: Array.isArray(o.columns) ? o.columns.map(c => str(c)).filter(Boolean).slice(0, 30) : [],
    subtitleField: str(o.subtitleField),
    format: {
      decimals: Math.round(num(fmt.decimals, 0, 0, 6)),
      prefix: str(fmt.prefix).slice(0, 12),
      suffix: str(fmt.suffix).slice(0, 12),
      compact: fmt.compact === true,
    },
    color: /^#[0-9a-f]{3,8}$/i.test(str(o.color)) ? str(o.color) : d.color,
    icon: str(o.icon, d.icon).slice(0, 60),
    referenceStatistic: STATS.has(o.referenceStatistic as BuilderStatistic)
      ? (o.referenceStatistic as BuilderStatistic)
      : 'none',
    referenceField: str(o.referenceField),
    gaugeMin: num(o.gaugeMin, d.gaugeMin),
    gaugeMax: num(o.gaugeMax, d.gaugeMax),
    chartKind: pick(o.chartKind, ['bar', 'column', 'line'] as const, d.chartKind),
    donut: o.donut !== false,
    selectorStyle: pick(o.selectorStyle, ['dropdown', 'buttons'] as const, d.selectorStyle),
    multiSelect: o.multiSelect === true,
    actionTargets:
      targets === 'none' || targets === 'all'
        ? targets
        : Array.isArray(targets)
          ? targets.map(t => str(t)).filter(Boolean)
          : d.actionTargets,
    text: str(o.text, d.text).slice(0, 8000),
    textAlign: pick(o.textAlign, ['start', 'center', 'end'] as const, d.textAlign),
    textSize: Math.round(num(o.textSize, d.textSize, 10, 48)),
    embedUrl: str(o.embedUrl).slice(0, 2000),
  }
}

export function normalizeBuilderElements(raw: unknown): Record<string, BuilderElementConfig> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, BuilderElementConfig> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBuilderElementId(id)) continue
    const el = normalizeBuilderElement(value, id)
    if (el) out[id] = el
  }
  return out
}

/** Only HTTPS pages can be embedded (matches the CSP frame-src). */
export function isEmbeddableUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
