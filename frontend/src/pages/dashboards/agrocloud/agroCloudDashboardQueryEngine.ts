/**
 * Dashboard query engine — filters, group-by, and aggregations over GIS data sources.
 * UI widgets consume query results; this module stays independent of React.
 */
import type { AgroCloudDashboardAggregation, AgroCloudDashboardElement } from './agroCloudDashboardData'
import type { DashboardDataSourceField } from './agroCloudDashboardDataSourceEngine'

export type DashboardQueryFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'

export type DashboardQueryFilter = {
  field: string
  op: DashboardQueryFilterOp
  value: string | number | boolean | string[]
}

export type DashboardQueryGroupBy = {
  field: string
  /** Optional time bin for date fields (ArcGIS serial charts). */
  timeInterval?: 'day' | 'week' | 'month' | 'year'
}

export type DashboardQueryStatistic = {
  field: string
  aggregation: AgroCloudDashboardAggregation
  alias?: string
}

export type DashboardQueryDefinition = {
  dataSourceId: string
  layerName: string
  filters?: DashboardQueryFilter[]
  groupBy?: DashboardQueryGroupBy[]
  statistics?: DashboardQueryStatistic[]
  orderBy?: { field: string; direction: 'asc' | 'desc' }[]
  limit?: number
}

export type DashboardQueryRow = Record<string, string | number | boolean | null>

export type DashboardQueryResult = {
  rows: DashboardQueryRow[]
  totalCount: number
  updatedAt: number
}

export type DashboardGlobalFilter = {
  id: string
  label: string
  field: string
  value: string | number | boolean | null
}

/** Build a query definition from a bound dashboard element. */
export function queryDefinitionFromElement(el: AgroCloudDashboardElement): DashboardQueryDefinition | null {
  if (!el.dataSourceId || !el.sourceLayer) return null
  const stats: DashboardQueryStatistic[] = []
  if (el.field && el.aggregation && el.aggregation !== 'none') {
    stats.push({ field: el.field, aggregation: el.aggregation })
  }
  return {
    dataSourceId: el.dataSourceId,
    layerName: el.sourceLayer,
    statistics: stats.length ? stats : undefined,
  }
}

/** Merge global filters into a query (cross-widget filtering). */
export function applyGlobalFilters(
  query: DashboardQueryDefinition,
  globalFilters: DashboardGlobalFilter[],
): DashboardQueryDefinition {
  if (!globalFilters.length) return query
  const extra: DashboardQueryFilter[] = globalFilters
    .filter(g => g.value != null && g.value !== '')
    .map(g => ({ field: g.field, op: 'eq', value: g.value as string | number | boolean }))
  return {
    ...query,
    filters: [...(query.filters ?? []), ...extra],
  }
}

/** Mock executor — replace with REST / hosted feature layer client. */
export function executeDashboardQuery(query: DashboardQueryDefinition): DashboardQueryResult {
  const stat = query.statistics?.[0]
  const mockValue =
    stat?.aggregation === 'count'
      ? 128
      : stat?.aggregation === 'avg'
        ? 42.6
        : stat?.aggregation === 'sum'
          ? 1840
          : 0

  const rows: DashboardQueryRow[] = query.groupBy?.length
    ? [
        { category: 'Zone A', value: mockValue * 0.4 },
        { category: 'Zone B', value: mockValue * 0.35 },
        { category: 'Zone C', value: mockValue * 0.25 },
      ]
    : [{ [stat?.field ?? 'value']: mockValue }]

  return { rows, totalCount: rows.length, updatedAt: Date.now() }
}

export function fieldSupportsAggregation(
  field: DashboardDataSourceField,
  aggregation: AgroCloudDashboardAggregation,
): boolean {
  if (aggregation === 'count') return true
  if (aggregation === 'none') return true
  return field.type === 'integer' || field.type === 'double'
}
