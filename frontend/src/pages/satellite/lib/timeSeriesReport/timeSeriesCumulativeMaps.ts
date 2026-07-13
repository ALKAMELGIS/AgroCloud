import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import {
  compositeAoiMapSnapshotBase64,
  dataUrlToPngBase64,
  fetchIndexLayerMapSnapshotBase64,
  fetchSatelliteBasemapSnapshot,
  resolveTimeSeriesSnapshotExtent,
  resolveTimeSeriesSnapshotLayout,
} from './timeSeriesMapSnapshot'
import type { TimeSeriesMapSnapshot, TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'

const SNAPSHOT_WIDTH = 520
const SNAPSHOT_HEIGHT = 390
const DATA_SOURCE = 'Sentinel-2 L2A (Sentinel Hub WMS) · cumulative period composite'
const CONCURRENCY = 2

/** Day aggregation still gets yearly cumulative appendix maps. */
export function cumulativeAggregationMode(
  timeAggregation: ImageryTimeAggregation | undefined,
): Exclude<ImageryTimeAggregation, 'day'> {
  if (!timeAggregation || timeAggregation === 'day') return 'year'
  return timeAggregation
}

export function cumulativeAggregationTitle(
  mode: Exclude<ImageryTimeAggregation, 'day'>,
): string {
  if (mode === 'week') return 'Cumulative Maps by Week'
  if (mode === 'month') return 'Cumulative Maps by Month'
  return 'Cumulative Maps by Year'
}

function formatLegendText(layerId: string): string {
  const spec = resolveLayerLiveLegendSpec(layerId)
  if (!spec) return layerId
  if (spec.classes?.length) {
    return spec.classes
      .slice(0, 8)
      .map(c => `${c.label}${c.rangeLabel ? ` (${c.rangeLabel})` : ''}`)
      .join(' · ')
  }
  if (spec.gradientCss && spec.valueMin != null && spec.valueMax != null) {
    return `${spec.title}: ${spec.valueMin} → ${spec.valueMax}`
  }
  return spec.subtitle || spec.title || layerId
}

export type CumulativePeriodPick = {
  periodKey: string
  periodLabel: string
  sceneDate: string
  mean: number | null
}

/**
 * For each period bucket, pick the scene date with the strongest index signal
 * (peak absolute mean) — a cumulative “best-of-period” representative map.
 */
export function collectCumulativePeriodPicks(input: {
  layerId: string
  dailyRows: SentinelHubDailyIndexMeans[]
  timeAggregation: ImageryTimeAggregation | undefined
}): CumulativePeriodPick[] {
  const mode = cumulativeAggregationMode(input.timeAggregation)
  const buckets = new Map<string, Array<{ date: string; mean: number }>>()

  for (const row of input.dailyRows) {
    const date = row.date?.slice(0, 10)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const mean = evaluateImageryLayerDailyValue(input.layerId, row)
    if (mean == null || !Number.isFinite(mean)) continue
    const key = imageryTimePeriodKey(date, mode)
    const list = buckets.get(key) ?? []
    list.push({ date, mean })
    buckets.set(key, list)
  }

  const picks: CumulativePeriodPick[] = []
  for (const [periodKey, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!list.length) continue
    // Peak greenness / strongest absolute reading in the bucket
    const best = list.reduce((a, b) => (Math.abs(b.mean) >= Math.abs(a.mean) ? b : a))
    picks.push({
      periodKey,
      periodLabel: formatImageryTimePeriodLabel(periodKey, mode),
      sceneDate: best.date,
      mean: best.mean,
    })
  }
  return picks
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

export async function buildCumulativeMapSnapshotGroups(input: {
  geometry: GeoJSON.Geometry
  layerIds: string[]
  dailyRows: SentinelHubDailyIndexMeans[]
  timeAggregation?: ImageryTimeAggregation
  areaHa: number
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}): Promise<TimeSeriesMapSnapshotGroup[]> {
  const mode = cumulativeAggregationMode(input.timeAggregation)
  const layout = resolveTimeSeriesSnapshotLayout(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  const extent = resolveTimeSeriesSnapshotExtent(input.geometry, layout.mapW, layout.mapH)

  const basemapDataUrl = await fetchSatelliteBasemapSnapshot(
    input.geometry,
    input.mapboxToken,
    SNAPSHOT_WIDTH,
    SNAPSHOT_HEIGHT,
    input.signal,
  )
  const basemapBase64 = dataUrlToPngBase64(basemapDataUrl)

  const groups: TimeSeriesMapSnapshotGroup[] = []
  const jobs = input.layerIds.map(layerId => ({
    layerId,
    picks: collectCumulativePeriodPicks({
      layerId,
      dailyRows: input.dailyRows,
      timeAggregation: input.timeAggregation,
    }),
  }))
  const total = jobs.reduce((n, j) => n + j.picks.length, 0)
  let completed = 0

  for (const job of jobs) {
    if (input.signal?.aborted || !job.picks.length) continue
    const snapshots = await mapPool(job.picks, CONCURRENCY, async pick => {
      if (input.signal?.aborted) {
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: `${job.layerId.toUpperCase()} cumulative`,
          sceneDate: pick.sceneDate,
          periodLabel: pick.periodLabel,
          imageBase64: basemapBase64,
          dataSource: DATA_SOURCE,
          mean: pick.mean,
          min: pick.mean,
          max: pick.mean,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Export cancelled.',
        } satisfies TimeSeriesMapSnapshot
      }

      let indexBase64: string | null = null
      try {
        indexBase64 = await fetchIndexLayerMapSnapshotBase64({
          geometry: input.geometry,
          layerId: job.layerId,
          sceneDate: pick.sceneDate,
          widthPx: SNAPSHOT_WIDTH,
          heightPx: SNAPSHOT_HEIGHT,
          extent,
          signal: input.signal,
        })
      } catch {
        indexBase64 = null
      }

      let imageBase64: string | null = null
      try {
        imageBase64 = await compositeAoiMapSnapshotBase64({
          geometry: input.geometry,
          basemapDataUrl,
          indexBase64,
          layerId: job.layerId,
          widthPx: SNAPSHOT_WIDTH,
          heightPx: SNAPSHOT_HEIGHT,
          extent,
        })
      } catch {
        imageBase64 = indexBase64 ?? basemapBase64
      }

      completed += 1
      input.onProgress?.(completed, Math.max(total, 1))

      return {
        layerId: job.layerId.toUpperCase(),
        layerLabel: `${job.layerId.toUpperCase()} cumulative`,
        sceneDate: pick.sceneDate,
        periodLabel: pick.periodLabel,
        imageBase64,
        dataSource: DATA_SOURCE,
        mean: pick.mean,
        min: pick.mean,
        max: pick.mean,
        areaHa: input.areaHa,
        legendText: formatLegendText(job.layerId),
        notes: `Cumulative ${mode} composite for ${pick.periodLabel}: peak ${job.layerId.toUpperCase()} scene on ${pick.sceneDate} (mean ${pick.mean != null ? pick.mean.toFixed(4) : '—'}).`,
      } satisfies TimeSeriesMapSnapshot
    })

    groups.push({
      layerId: `CUMULATIVE_${job.layerId.toUpperCase()}`,
      title: `Cumulative ${job.layerId.toUpperCase()} — by ${mode}`,
      snapshots,
    })
  }

  return groups
}
