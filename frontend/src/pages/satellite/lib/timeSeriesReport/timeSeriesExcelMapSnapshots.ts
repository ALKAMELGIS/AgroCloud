import ExcelJS from 'exceljs'
import {
  evaluateImageryLayerDailyValue,
  imageryTimePeriodKey,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type {
  ImageryTimeAggregation,
  ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  collectLayerSnapshotDates,
  pickSnapshotSceneDateCandidates,
} from './dynamicMapSnapshots'
import {
  compositeAoiMapSnapshotBase64,
  fetchIndexLayerMapSnapshotBase64,
  fetchSatelliteBasemapSnapshot,
  resolveTimeSeriesSnapshotExtent,
  resolveTimeSeriesSnapshotLayout,
} from './timeSeriesMapSnapshot'
import type { TimeSeriesMapSnapshot, TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'

const BRAND_DARK = 'FF064E3B'
const SECTION_FILL = 'FFE2F5EE'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'
const DATA_SOURCE = 'Sentinel-2 L2A (Sentinel Hub WMS)'
/** Soft ceiling for Day atlas - keep long ranges exportable while matching T-23 “all dates”. */
const SOFT_MAX_DAY_SNAPSHOTS = 120
const SNAPSHOT_WIDTH = 720
/** Taller canvas so map frame stays near-square with title bar + Layer Live legend (T-23 cards). */
const SNAPSHOT_HEIGHT = 620
const CONCURRENCY = 3

function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '-'
  return n.toFixed(digits)
}

function layerSnapshotTitle(layerId: string, aggregation: ImageryTimeAggregation = 'day'): string {
  const u = layerId.trim().toUpperCase()
  const base =
    u === 'STRESS_ZONES' ? 'Stress Zones' : u === 'CHAS' ? 'CHAS' : u
  if (aggregation === 'week') return `${base} Weekly Average Maps`
  if (aggregation === 'month') return `${base} Monthly Average Maps`
  if (aggregation === 'year') return `${base} Yearly Average Maps`
  return `${base} Daily Maps`
}

export type MapSnapshotPeriodEntry = {
  periodIndex: number
  sceneDate: string
  periodLabel: string
  periodMean: number | null
  kind: 'period' | 'series-average'
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Pick a scene whose daily mean is closest to the period mean - better visual
 * for Week/Month/Year “average” maps than always using the last observation.
 * Always returns an ISO YYYY-MM-DD when possible (required for Sentinel Hub WMS TIME).
 */
export function pickRepresentativeSceneDate(input: {
  layerId: string
  periodKey: string
  periodMean: number | null
  timeAggregation: ImageryTimeAggregation
  dailyRows: SentinelHubDailyIndexMeans[]
  fallbackAnchor: string
}): string {
  const fallback = input.fallbackAnchor.trim().slice(0, 10)
  const periodKey = input.periodKey.trim()

  if (input.timeAggregation === 'day') {
    if (ISO_DAY_RE.test(fallback)) return fallback
    const keyDay = periodKey.slice(0, 10)
    if (ISO_DAY_RE.test(keyDay)) return keyDay
  }

  // Resolve which bucket type to search when periodKey is not an ISO day.
  let searchAgg: ImageryTimeAggregation = input.timeAggregation
  if (!ISO_DAY_RE.test(periodKey.slice(0, 10))) {
    if (periodKey.includes('-W')) searchAgg = 'week'
    else if (/^\d{4}-\d{2}$/.test(periodKey)) searchAgg = 'month'
    else if (/^\d{4}$/.test(periodKey)) searchAgg = 'year'
  }

  const candidates: Array<{ date: string; mean: number }> = []
  for (const row of input.dailyRows) {
    const date = row.date?.slice(0, 10)
    if (!date || !ISO_DAY_RE.test(date)) continue
    if (imageryTimePeriodKey(date, searchAgg) !== periodKey) continue
    const mean = evaluateImageryLayerDailyValue(input.layerId, row)
    if (mean == null || !Number.isFinite(mean)) continue
    candidates.push({ date, mean })
  }
  if (candidates.length) {
    if (input.periodMean == null || !Number.isFinite(input.periodMean)) {
      return candidates[Math.floor((candidates.length - 1) / 2)]!.date
    }
    return candidates.reduce((best, cur) =>
      Math.abs(cur.mean - input.periodMean!) < Math.abs(best.mean - input.periodMean!) ? cur : best,
    ).date
  }
  if (ISO_DAY_RE.test(fallback)) return fallback
  for (const row of input.dailyRows) {
    const date = row.date?.slice(0, 10)
    if (date && ISO_DAY_RE.test(date)) return date
  }
  return ''
}

/**
 * Include every finite chart period for the selected aggregation.
 * Day is evenly sampled above {@link SOFT_MAX_DAY_SNAPSHOTS} so long ranges stay exportable.
 * Year also prepends one series-average overview map per layer.
 */
export function selectMapSnapshotEntries(input: {
  layerId: string
  chartLabels: string[]
  displayLabels: string[]
  values: Array<number | null | undefined>
  periodAnchorDates: Record<string, string>
  dailyRows: SentinelHubDailyIndexMeans[]
  timeAggregation: ImageryTimeAggregation
  /** Override soft Day sample ceiling (default {@link SOFT_MAX_DAY_SNAPSHOTS}). */
  maxDaySnapshots?: number
}): MapSnapshotPeriodEntry[] {
  const aggregation = input.timeAggregation
  const periodEntries: MapSnapshotPeriodEntry[] = []

  for (let i = 0; i < input.chartLabels.length; i += 1) {
    const v = input.values[i]
    if (v == null || !Number.isFinite(v)) continue
    const periodKey = input.chartLabels[i]!
    const fallbackAnchor = (input.periodAnchorDates[periodKey] ?? periodKey).trim().slice(0, 10)
    const sceneDate = pickRepresentativeSceneDate({
      layerId: input.layerId,
      periodKey,
      periodMean: v,
      timeAggregation: aggregation,
      dailyRows: input.dailyRows,
      fallbackAnchor,
    })
    // Sentinel Hub WMS TIME requires YYYY-MM-DD - skip week/month keys that failed resolution.
    if (!sceneDate || !ISO_DAY_RE.test(sceneDate)) continue
    const periodLabel = input.displayLabels[i] ?? periodKey
    periodEntries.push({
      periodIndex: i,
      sceneDate,
      periodLabel,
      periodMean: v,
      kind: 'period',
    })
  }

  if (!periodEntries.length) return []

  // Soft sample only for very long Day exports (keeps Word/Excel usable).
  const softMax = Math.max(1, input.maxDaySnapshots ?? SOFT_MAX_DAY_SNAPSHOTS)
  let selected = periodEntries
  if (aggregation === 'day' && periodEntries.length > softMax) {
    const out: MapSnapshotPeriodEntry[] = []
    for (let i = 0; i < softMax; i += 1) {
      out.push(
        periodEntries[
          Math.round((i * (periodEntries.length - 1)) / (softMax - 1))
        ]!,
      )
    }
    selected = [...new Map(out.map(e => [e.periodIndex, e])).values()].sort(
      (a, b) => a.periodIndex - b.periodIndex,
    )
  }

  if (aggregation !== 'year') return selected

  // Year: one overview “series average” map, then every yearly average map.
  const finite = selected.map(e => e.periodMean).filter((n): n is number => n != null && Number.isFinite(n))
  const seriesMean =
    finite.length > 0 ? finite.reduce((a, b) => a + b, 0) / finite.length : null
  const yearKeys = selected.map(e => input.chartLabels[e.periodIndex]!).filter(Boolean)
  const fromYear = yearKeys[0] ?? ''
  const toYear = yearKeys[yearKeys.length - 1] ?? fromYear

  let bestOverview = selected[Math.floor((selected.length - 1) / 2)]!.sceneDate
  if (seriesMean != null && input.dailyRows.length) {
    let bestAbs = Number.POSITIVE_INFINITY
    for (const row of input.dailyRows) {
      const date = row.date?.slice(0, 10)
      if (!date) continue
      const mean = evaluateImageryLayerDailyValue(input.layerId, row)
      if (mean == null || !Number.isFinite(mean)) continue
      const abs = Math.abs(mean - seriesMean)
      if (abs < bestAbs) {
        bestAbs = abs
        bestOverview = date
      }
    }
  }
  const rangeLabel =
    fromYear && toYear && fromYear !== toYear
      ? `Series average (${fromYear}-${toYear})`
      : `Series average${fromYear ? ` (${fromYear})` : ''}`

  return [
    {
      periodIndex: -1,
      sceneDate: bestOverview,
      periodLabel: rangeLabel,
      periodMean: seriesMean,
      kind: 'series-average',
    },
    ...selected,
  ]
}

function formatLegendText(layerId: string): string {
  const spec = resolveLayerLiveLegendSpec(layerId)
  if (!spec) return layerId
  if (spec.classes?.length) {
    return spec.classes
      .slice(0, 6)
      .map(c => {
        const range = c.rangeLabel ? ` (${c.rangeLabel})` : ''
        return `${c.label}${range}`
      })
      .join(' - ')
  }
  return spec.subtitle || spec.title || layerId
}

function zonalKeyForLayer(layerId: string): 'ndvi' | 'ndmi' | 'ndwi' | 'savi' | 'evi' | null {
  const u = layerId.trim().toUpperCase()
  if (u === 'NDVI') return 'ndvi'
  if (u === 'NDMI') return 'ndmi'
  if (u === 'NDWI') return 'ndwi'
  if (u === 'SAVI') return 'savi'
  if (u === 'EVI') return 'evi'
  return null
}

function resolveSceneStats(
  layerId: string,
  sceneDate: string,
  periodMean: number | null,
  dailyRows: SentinelHubDailyIndexMeans[],
): { mean: number | null; min: number | null; max: number | null } {
  const fallback = periodMean != null && Number.isFinite(periodMean) ? periodMean : null
  const finiteOr = (v: number | null | undefined): number | null =>
    v != null && Number.isFinite(v) ? v : fallback

  const row = dailyRows.find(d => d.date?.slice(0, 10) === sceneDate.slice(0, 10))
  const zKey = zonalKeyForLayer(layerId)
  const zonal = zKey && row?.zonal?.[zKey]
  if (zonal) {
    return {
      mean: finiteOr(zonal.mean),
      min: finiteOr(zonal.min),
      max: finiteOr(zonal.max),
    }
  }
  const dailyMean = row ? evaluateImageryLayerDailyValue(layerId, row) : null
  const mean = finiteOr(dailyMean)
  return { mean, min: mean, max: mean }
}

function buildSnapshotNotes(
  layerId: string,
  mean: number | null,
  interpretations: ImageryIndexInterpretation[],
  kind: MapSnapshotPeriodEntry['kind'] = 'period',
): string {
  if (kind === 'series-average') {
    return `${layerId} series-average overview - representative scene closest to the multi-year mean (${fmtNum(mean, 4)}). Year-by-year average maps follow.`
  }
  const interp = interpretations.find(i => i.layerId.toUpperCase() === layerId.trim().toUpperCase())
  if (interp) {
    return [interp.summaryLine, interp.coverageLine, interp.actionsLine].filter(Boolean).join(' ')
  }
  if (mean == null) return 'No index statistics for this acquisition date.'
  return `${layerId} AOI mean ${fmtNum(mean, 4)} for this scene - compare with prior periods in the time series chart.`
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

export type BuildTimeSeriesMapSnapshotGroupsInput = {
  geometry: GeoJSON.Geometry
  layerIds: string[]
  chartLabels: string[]
  displayLabels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  dailyRows: SentinelHubDailyIndexMeans[]
  periodAnchorDates: Record<string, string>
  areaHa: number
  interpretations: ImageryIndexInterpretation[]
  /** Panel Day/Week/Month/Year - drives which periods become maps. */
  timeAggregation?: ImageryTimeAggregation
  /** Soft Day sample ceiling (even spacing). */
  maxDaySnapshots?: number
  /**
   * When true (Excel/Word), if WMS index raster fails after date retries, still emit a
   * basemap + AOI + legend card with the period mean so Map Snapshots is not empty.
   */
  allowBasemapFallback?: boolean
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}

export async function buildTimeSeriesMapSnapshotGroups(
  input: BuildTimeSeriesMapSnapshotGroupsInput,
): Promise<TimeSeriesMapSnapshotGroup[]> {
  const groups: TimeSeriesMapSnapshotGroup[] = []
  const timeAggregation = input.timeAggregation ?? 'day'
  const allowBasemapFallback = input.allowBasemapFallback !== false
  const layout = resolveTimeSeriesSnapshotLayout(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  const extent = resolveTimeSeriesSnapshotExtent(input.geometry, layout.mapW, layout.mapH)
  // Without a geographic frame every GetMap / composite fails - exit early (caller may retry).
  if (!extent) return []

  const basemapDataUrl = await fetchSatelliteBasemapSnapshot(
    input.geometry,
    input.mapboxToken,
    SNAPSHOT_WIDTH,
    SNAPSHOT_HEIGHT,
    input.signal,
  )

  const jobs: Array<{
    layerId: string
    entries: MapSnapshotPeriodEntry[]
  }> = []

  for (const layerId of input.layerIds) {
    const idKey = layerId.trim().toUpperCase()
    if (!idKey) continue
    const series =
      input.layerSeries.find(s => s.layerId.trim().toUpperCase() === idKey) ?? null

    // Prefer chart series; synthesize from dailyRows when a selected layer (e.g. ISS)
    // is on the chart axis but missing from layerSeries matching.
    let values: Array<number | null | undefined> = series?.values ?? []
    if (!series || !values.some(v => v != null && Number.isFinite(v))) {
      values = input.chartLabels.map(periodKey => {
        const fallbackAnchor = (input.periodAnchorDates[periodKey] ?? periodKey).trim().slice(0, 10)
        const day = ISO_DAY_RE.test(fallbackAnchor)
          ? fallbackAnchor
          : ISO_DAY_RE.test(periodKey.slice(0, 10))
            ? periodKey.slice(0, 10)
            : ''
        if (!day) return null
        const row = input.dailyRows.find(r => r.date?.slice(0, 10) === day)
        if (!row) return null
        const v = evaluateImageryLayerDailyValue(idKey, row)
        return v != null && Number.isFinite(v) ? v : null
      })
    }

    const entries = selectMapSnapshotEntries({
      layerId: idKey,
      chartLabels: input.chartLabels,
      displayLabels: input.displayLabels,
      values,
      periodAnchorDates: input.periodAnchorDates,
      dailyRows: input.dailyRows,
      timeAggregation,
      maxDaySnapshots: input.maxDaySnapshots,
    })
    if (!entries.length) continue
    jobs.push({ layerId: idKey, entries })
  }

  const total = jobs.reduce((n, j) => n + j.entries.length, 0)
  let completed = 0

  for (const job of jobs) {
    if (input.signal?.aborted) break
    const rawSnapshots = await mapPool(job.entries, CONCURRENCY, async entry => {
      if (input.signal?.aborted) {
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: job.layerId.toUpperCase(),
          sceneDate: entry.sceneDate,
          periodLabel: entry.periodLabel,
          imageBase64: null,
          dataSource: DATA_SOURCE,
          mean: entry.periodMean,
          min: entry.periodMean,
          max: entry.periodMean,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Export cancelled.',
        } satisfies TimeSeriesMapSnapshot
      }

      const availableDates = collectLayerSnapshotDates(job.layerId, input.dailyRows)
      const dateCandidates = pickSnapshotSceneDateCandidates(entry.sceneDate, availableDates).filter(d =>
        ISO_DAY_RE.test(d),
      )

      let usedDate = entry.sceneDate
      let indexBase64: string | null = null
      for (const candidate of dateCandidates.length ? dateCandidates : [entry.sceneDate]) {
        if (input.signal?.aborted) break
        if (!ISO_DAY_RE.test(candidate)) continue
        try {
          indexBase64 = await fetchIndexLayerMapSnapshotBase64({
            geometry: input.geometry,
            layerId: job.layerId,
            sceneDate: candidate,
            widthPx: SNAPSHOT_WIDTH,
            heightPx: SNAPSHOT_HEIGHT,
            extent,
            signal: input.signal,
          })
        } catch {
          indexBase64 = null
        }
        if (indexBase64) {
          usedDate = candidate
          break
        }
      }

      const stats = resolveSceneStats(job.layerId, usedDate, entry.periodMean, input.dailyRows)
      // Skip dates with no analyzable index statistics - never emit basemap-only cards without a mean.
      if (stats.mean == null || !Number.isFinite(stats.mean)) {
        completed += 1
        input.onProgress?.(completed, Math.max(total, 1))
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: job.layerId.toUpperCase(),
          sceneDate: usedDate,
          periodLabel: entry.periodLabel,
          imageBase64: null,
          dataSource: DATA_SOURCE,
          mean: null,
          min: null,
          max: null,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Skipped - no index statistics for this acquisition date.',
        } satisfies TimeSeriesMapSnapshot
      }

      let imageBase64: string | null = null
      try {
        imageBase64 = await compositeAoiMapSnapshotBase64({
          geometry: input.geometry,
          basemapDataUrl,
          indexBase64,
          layerId: job.layerId,
          legendSpec: resolveLayerLiveLegendSpec(job.layerId),
          title: job.layerId.toUpperCase(),
          sceneDate: usedDate,
          widthPx: SNAPSHOT_WIDTH,
          heightPx: SNAPSHOT_HEIGHT,
          extent,
        })
      } catch {
        imageBase64 = null
      }
      // Prefer composite; keep raw index raster; last resort basemap+AOI so Excel/Word atlas is not empty.
      imageBase64 = imageBase64 ?? indexBase64
      if (!imageBase64 && allowBasemapFallback) {
        try {
          imageBase64 = await compositeAoiMapSnapshotBase64({
            geometry: input.geometry,
            basemapDataUrl,
            indexBase64: null,
            layerId: job.layerId,
            legendSpec: resolveLayerLiveLegendSpec(job.layerId),
            title: job.layerId.toUpperCase(),
            sceneDate: usedDate,
            widthPx: SNAPSHOT_WIDTH,
            heightPx: SNAPSHOT_HEIGHT,
            extent,
          })
        } catch {
          imageBase64 = null
        }
      }
      // Absolute last resort: gray frame + AOI outline (no basemap/index) so Word still embeds maps.
      if (!imageBase64 && allowBasemapFallback) {
        try {
          imageBase64 = await compositeAoiMapSnapshotBase64({
            geometry: input.geometry,
            basemapDataUrl: null,
            indexBase64: null,
            layerId: job.layerId,
            legendSpec: resolveLayerLiveLegendSpec(job.layerId),
            title: job.layerId.toUpperCase(),
            sceneDate: usedDate,
            widthPx: SNAPSHOT_WIDTH,
            heightPx: SNAPSHOT_HEIGHT,
            extent,
          })
        } catch {
          imageBase64 = null
        }
      }

      if (!imageBase64) {
        completed += 1
        input.onProgress?.(completed, Math.max(total, 1))
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: job.layerId.toUpperCase(),
          sceneDate: usedDate,
          periodLabel: entry.periodLabel,
          imageBase64: null,
          dataSource: DATA_SOURCE,
          mean: stats.mean,
          min: stats.min,
          max: stats.max,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Skipped - map image unavailable for this date.',
        } satisfies TimeSeriesMapSnapshot
      }

      completed += 1
      input.onProgress?.(completed, Math.max(total, 1))

      return {
        layerId: job.layerId.toUpperCase(),
        layerLabel: job.layerId.toUpperCase(),
        sceneDate: usedDate,
        periodLabel: entry.periodLabel,
        imageBase64,
        dataSource: DATA_SOURCE,
        mean: stats.mean,
        min: stats.min,
        max: stats.max,
        areaHa: input.areaHa,
        legendText: formatLegendText(job.layerId),
        notes: indexBase64
          ? buildSnapshotNotes(job.layerId, stats.mean, input.interpretations, entry.kind)
          : `${buildSnapshotNotes(job.layerId, stats.mean, input.interpretations, entry.kind)} Index raster unavailable - AOI basemap shown.`,
      } satisfies TimeSeriesMapSnapshot
    })

    const snapshots = rawSnapshots.filter(
      s => !!s.imageBase64 && s.mean != null && Number.isFinite(s.mean),
    )
    if (!snapshots.length) continue

    groups.push({
      layerId: job.layerId.toUpperCase(),
      title: layerSnapshotTitle(job.layerId, timeAggregation),
      snapshots,
    })
  }

  return groups
}

function styleSection(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 12, color: { argb: BRAND_DARK } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } }
}

export function buildMapSnapshotsSheet(wb: ExcelJS.Workbook, groups: TimeSeriesMapSnapshotGroup[]): void {
  const ws = wb.addWorksheet('Map Snapshots', { views: [{ showGridLines: false }] })
  // Three equal atlas columns - wide enough for square-ish professional map cards.
  const COLS = 3
  const COL_WIDTH = 38
  ws.columns = Array.from({ length: COLS }, () => ({ width: COL_WIDTH }))

  ws.getCell('A1').value = 'Map Snapshots - Visual Time-Series Report'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: INK } }
  ws.mergeCells(1, 1, 1, COLS)

  ws.getCell('A2').value =
    'Atlas layout: up to 12 map cards per page (3x4). Each card keeps native aspect (title - map - legend). One section per selected layer.'
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, COLS)

  let row = 4

  if (!groups.length) {
    ws.getCell(row, 1).value =
      'No map snapshots available - no AOI geometry, empty time-series values, or all WMS map fetches failed. Select an AOI, run Time Series (Day recommended) with the desired layers (e.g. NDVI, ISS), then export again.'
    ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: MUTED } }
    ws.mergeCells(row, 1, row, COLS)
    return
  }

  // Absolute pixel size preserves the composite PNG aspect (title + square map + legend).
  // Do NOT use twoCellAnchor br - Excel stretches into the cell box and produces thin strips.
  const imageWidth = 300
  const imageHeight = Math.round((imageWidth * SNAPSHOT_HEIGHT) / SNAPSHOT_WIDTH)
  /** Rows for image + caption under each card. */
  const cardRowStride = 18
  const pageRowStride = cardRowStride * 4 + 1
  /** Approximate rows covered by the image (points ≈ px * 0.75). */
  const imageRowSpan = 15

  for (const group of groups) {
    ws.getCell(row, 1).value = group.title
    styleSection(ws.getCell(row, 1))
    ws.mergeCells(row, 1, row, COLS)
    row += 2

    const snaps = group.snapshots.filter(s => !!s.imageBase64)
    if (!snaps.length) {
      ws.getCell(row, 1).value = 'No index map images for this layer in the selected period.'
      ws.getCell(row, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
      ws.mergeCells(row, 1, row, COLS)
      row += 2
      continue
    }

    for (let pageStart = 0; pageStart < snaps.length; pageStart += 12) {
      const page = snaps.slice(pageStart, pageStart + 12)
      const pageTop = row

      for (let i = 0; i < page.length; i += 1) {
        const snap = page[i]!
        const col = i % COLS
        const gridRow = Math.floor(i / COLS)
        const imgRow = pageTop + gridRow * cardRowStride
        const captionRow = imgRow + cardRowStride - 2

        for (let r = imgRow; r < imgRow + imageRowSpan; r += 1) {
          ws.getRow(r).height = 15
        }
        ws.getRow(captionRow).height = 32

        try {
          const imageId = wb.addImage({ base64: snap.imageBase64!, extension: 'png' })
          ws.addImage(imageId, {
            tl: { col: col + 0.12, row: imgRow - 1 },
            ext: { width: imageWidth, height: imageHeight },
            editAs: 'oneCell',
          })
        } catch {
          ws.getCell(imgRow, col + 1).value = '(Map unavailable)'
          ws.getCell(imgRow, col + 1).font = { italic: true, size: 8, color: { argb: MUTED } }
        }

        const caption = [
          snap.sceneDate || snap.periodLabel,
          (snap.layerLabel || snap.layerId).toUpperCase(),
          fmtNum(snap.mean, 4),
        ]
          .filter(Boolean)
          .join(' ')
        const capCell = ws.getCell(captionRow, col + 1)
        capCell.value = caption
        capCell.font = { size: 8, bold: true, color: { argb: INK } }
        capCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }

      row = pageTop + Math.ceil(page.length / COLS) * cardRowStride + 1
      if (pageStart + 12 < snaps.length) {
        row = Math.max(row, pageTop + pageRowStride)
      }
    }

    const last = snaps[snaps.length - 1]!
    if (last.legendText) {
      ws.getCell(row, 1).value = `Legend key: ${last.legendText}`
      ws.getCell(row, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
      ws.getCell(row, 1).alignment = { wrapText: true }
      ws.mergeCells(row, 1, row, COLS)
      row += 1
    }
    if (last.notes) {
      ws.getCell(row, 1).value = last.notes
      ws.getCell(row, 1).font = { size: 9, color: { argb: INK } }
      ws.getCell(row, 1).alignment = { wrapText: true }
      ws.mergeCells(row, 1, row, COLS)
      ws.getRow(row).height = Math.min(60, 14 + Math.ceil(last.notes.length / 90) * 12)
      row += 2
    }

    row += 1
  }
}
