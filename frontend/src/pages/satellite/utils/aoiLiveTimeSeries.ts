/**
 * Live AOI / pixel time series from Sentinel Hub Statistical API.
 */

import { evaluateImageryLayerDailyValue } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import {
  buildStaticAoiMultiChartDatasets,
  formatStaticChartWeekLabel,
  metaForLayerLiveStats,
  staticAoiLayerMeanForWeek,
  type LayerLiveStatsLayerId,
  type WeeklyCompositeLite,
} from './staticAoiMultiChartData'

export type AoiWeeklyComposite = WeeklyCompositeLite & {
  label: string
  mean: number
  min: number
  max: number
  itemCount: number
  enabled: boolean
}

export type AoiStatsSampleMode = 'aoi' | 'pixel'

export type AoiLiveChartBuild = {
  labels: string[]
  datasets: Array<{
    id: string
    label: string
    data: number[]
    borderColor: string
    backgroundColor: string
    yAxisID: string
  }>
  hasLst: boolean
  hasEt: boolean
}

const DATASET_COLORS = ['#4f46e5', '#0d9488', '#ca8a04', '#b91c1c', '#7c3aed', '#15803d', '#0369a1']

type DailyIndexKey = keyof Pick<
  SentinelHubDailyIndexMeans,
  'ndvi' | 'ndwi' | 'ndmi' | 'evi' | 'savi' | 'ciRe'
>

const LAYER_TO_DAILY_KEY: Record<string, DailyIndexKey> = {
  NDVI: 'ndvi',
  NDWI: 'ndwi',
  NDMI: 'ndmi',
  EVI: 'evi',
  SAVI: 'savi',
  CIRE: 'ciRe',
  CI_RE: 'ciRe',
}

/** ~20 m square around a map click — one Sentinel-2 pixel sample at 10 m. */
export function buildSentinelPixelSamplePolygon(
  lng: number,
  lat: number,
  halfSizeM = 10,
): GeoJSON.Polygon {
  const dLat = halfSizeM / 111_320
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6
  const dLng = halfSizeM / (111_320 * cosLat)
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  }
}

export function layerIdToDailyKey(layerId: string): DailyIndexKey | null {
  return LAYER_TO_DAILY_KEY[layerId.trim().toUpperCase()] ?? null
}

export function meanDailyInWindow(
  daily: SentinelHubDailyIndexMeans[],
  startDate: string,
  endDate: string,
  key: DailyIndexKey,
): number | null {
  const vals: number[] = []
  for (const row of daily) {
    if (row.date < startDate || row.date > endDate) continue
    const v = row[key]
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
  }
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function buildWeeklyCompositesFromDaily(
  daily: SentinelHubDailyIndexMeans[],
  weeklyWindows: WeeklyCompositeLite[],
  primaryLayerId: string,
): AoiWeeklyComposite[] {
  const primaryKey = layerIdToDailyKey(primaryLayerId) ?? 'ndvi'
  return weeklyWindows.map(week => {
    const valsInWeek: number[] = []
    for (const row of daily) {
      if (row.date < week.startDate || row.date > week.endDate) continue
      const v = row[primaryKey]
      if (typeof v === 'number' && Number.isFinite(v)) valsInWeek.push(v)
    }
    const itemCount = valsInWeek.length
    const mean = itemCount ? valsInWeek.reduce((a, b) => a + b, 0) / itemCount : 0
    const min = itemCount ? Math.min(...valsInWeek) : mean
    const max = itemCount ? Math.max(...valsInWeek) : mean
    return {
      ...week,
      label:
        week.label ??
        `W${String(week.weekIndex).padStart(2, '0')} ${formatStaticChartWeekLabel(week.startDate)}`,
      mean: Number(mean.toFixed(3)),
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      itemCount,
      enabled: itemCount > 0,
    }
  })
}

export function buildLiveAoiMultiChartDatasets(
  weekly: WeeklyCompositeLite[],
  layerIds: LayerLiveStatsLayerId[],
  daily: SentinelHubDailyIndexMeans[],
  aoiKey: string | null,
  anchorWeeklyMeans: number[],
): AoiLiveChartBuild {
  if (!weekly.length || !layerIds.length || !daily.length) {
    return { labels: [], datasets: [], hasLst: false, hasEt: false }
  }
  const n = weekly.length
  const labels = weekly.map(w => formatStaticChartWeekLabel(w.startDate))
  const datasets = layerIds.map((id, di) => {
    const opt = metaForLayerLiveStats(id)
    const color = DATASET_COLORS[di % DATASET_COLORS.length]!
    const key = layerIdToDailyKey(id)
    const data = weekly.map((week, i) => {
      if (id.trim().toUpperCase() === 'ET') {
        const vals: number[] = []
        for (const row of daily) {
          if (row.date < week.startDate || row.date > week.endDate) continue
          const v = evaluateImageryLayerDailyValue('ET', row)
          if (v != null && Number.isFinite(v)) vals.push(v)
        }
        if (vals.length) {
          return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
        }
      }
      if (key) {
        const live = meanDailyInWindow(daily, week.startDate, week.endDate, key)
        if (live != null) return Number(live.toFixed(id === 'LST' || id === 'ET' ? 2 : 3))
      }
      const anchor = anchorWeeklyMeans[i] ?? week.mean ?? 0
      return staticAoiLayerMeanForWeek(id, i, n, aoiKey, anchor)
    })
    const u = id.trim().toUpperCase()
    return {
      id,
      label: opt.label,
      data,
      borderColor: color,
      backgroundColor: `${color}22`,
      yAxisID: u === 'LST' ? 'yLST' : u === 'ET' ? 'yET' : 'yIndex',
    }
  })
  return {
    labels,
    datasets,
    hasLst: layerIds.some(l => l.trim().toUpperCase() === 'LST'),
    hasEt: layerIds.some(l => l.trim().toUpperCase() === 'ET'),
  }
}

/** Prefer live series; fall back to synthetic multi-layer builder. */
export function buildAoiMultiChartDatasets(
  weekly: WeeklyCompositeLite[],
  layerIds: LayerLiveStatsLayerId[],
  daily: SentinelHubDailyIndexMeans[] | null,
  aoiKey: string | null,
): AoiLiveChartBuild {
  if (daily?.length) {
    const anchors = weekly.map(w => w.mean ?? 0)
    return buildLiveAoiMultiChartDatasets(weekly, layerIds, daily, aoiKey, anchors)
  }
  const built = buildStaticAoiMultiChartDatasets(weekly, layerIds, aoiKey)
  return {
    ...built,
    hasLst: layerIds.some(l => l.trim().toUpperCase() === 'LST'),
    hasEt: layerIds.some(l => l.trim().toUpperCase() === 'ET'),
  }
}
