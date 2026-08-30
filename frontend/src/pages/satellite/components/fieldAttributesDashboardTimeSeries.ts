/**
 * AOI-mean index time series for the field attributes dashboard.
 * Persisted on enriched GeoJSON as `si_field_dash_ts` (JSON).
 */

import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import { evaluateImageryLayerDailyValue } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export const FIELD_DASH_TS_PROP = 'si_field_dash_ts'

export type FieldDashIndexId = 'NDVI' | 'NDRE' | 'NDMI' | 'NDWI' | 'SAVI' | 'ET'

export type FieldDashIndexTimeSeries = {
  dates: string[]
  indices: Record<FieldDashIndexId, Array<number | null>>
}

const INDEX_EXTRACTORS: Record<
  FieldDashIndexId,
  (row: SentinelHubDailyIndexMeans) => number | null
> = {
  NDVI: row => finiteOrNull(row.ndvi),
  NDRE: row => finiteOrNull(row.ndre),
  NDMI: row => finiteOrNull(row.ndmi),
  NDWI: row => finiteOrNull(row.ndwi),
  SAVI: row => finiteOrNull(row.savi),
  ET: row => evaluateImageryLayerDailyValue('ET', row),
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Mean across all fields per date for each dashboard index. */
export function aggregateAoiIndexTimeSeries(
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>,
): FieldDashIndexTimeSeries | null {
  const groups = [...dailyByFieldKey.values()].filter(rows => rows?.length)
  if (!groups.length) return null

  const dateSet = new Set<string>()
  for (const rows of groups) {
    for (const row of rows) {
      if (row?.date) dateSet.add(row.date)
    }
  }
  const dates = [...dateSet].sort()
  if (dates.length < 2) return null

  const indices = {} as FieldDashIndexTimeSeries['indices']
  for (const indexId of Object.keys(INDEX_EXTRACTORS) as FieldDashIndexId[]) {
    const extract = INDEX_EXTRACTORS[indexId]
    indices[indexId] = dates.map(date => {
      const vals: number[] = []
      for (const rows of groups) {
        const row = rows.find(r => r.date === date)
        if (!row) continue
        const v = extract(row)
        if (v != null && Number.isFinite(v)) vals.push(v)
      }
      if (!vals.length) return null
      return round3(vals.reduce((a, b) => a + b, 0) / vals.length)
    })
  }

  const hasSignal = (Object.values(indices) as Array<Array<number | null>>).some(series =>
    series.some(v => v != null),
  )
  if (!hasSignal) return null

  return { dates, indices }
}

export function serializeFieldDashTimeSeries(ts: FieldDashIndexTimeSeries): string {
  return JSON.stringify(ts)
}

export function parseFieldDashTimeSeries(raw: unknown): FieldDashIndexTimeSeries | null {
  if (raw == null || raw === '') return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    const dates = Array.isArray((parsed as FieldDashIndexTimeSeries).dates)
      ? (parsed as FieldDashIndexTimeSeries).dates.map(String)
      : []
    const indices = (parsed as FieldDashIndexTimeSeries).indices
    if (!dates.length || !indices || typeof indices !== 'object') return null
    return { dates, indices }
  } catch {
    return null
  }
}

export function readFieldDashTimeSeriesFromGeojson(
  fc: GeoJSON.FeatureCollection | null | undefined,
): FieldDashIndexTimeSeries | null {
  for (const f of fc?.features ?? []) {
    const props = f.properties as Record<string, unknown> | undefined
    if (!props) continue
    const ts = parseFieldDashTimeSeries(props[FIELD_DASH_TS_PROP])
    if (ts) return ts
  }
  return null
}

/** ET values are mm/day — scale ÷10 to share the 0–1 vegetation index axis. */
export const FIELD_DASH_ET_CHART_SCALE = 10
