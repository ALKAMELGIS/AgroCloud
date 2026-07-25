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
/** Soft ceiling only for extreme Day ranges — never sample Week/Month/Year. */
const SOFT_MAX_DAY_SNAPSHOTS = 120
const SNAPSHOT_WIDTH = 720
const SNAPSHOT_HEIGHT = 580
const CONCURRENCY = 3

function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
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

/**
 * Pick a scene whose daily mean is closest to the period mean — better visual
 * for Week/Month/Year “average” maps than always using the last observation.
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
  if (input.timeAggregation === 'day') return fallback || input.periodKey.slice(0, 10)

  const candidates: Array<{ date: string; mean: number }> = []
  for (const row of input.dailyRows) {
    const date = row.date?.slice(0, 10)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (imageryTimePeriodKey(date, input.timeAggregation) !== input.periodKey) continue
    const mean = evaluateImageryLayerDailyValue(input.layerId, row)
    if (mean == null || !Number.isFinite(mean)) continue
    candidates.push({ date, mean })
  }
  if (!candidates.length) return fallback || input.periodKey.slice(0, 10)
  if (input.periodMean == null || !Number.isFinite(input.periodMean)) {
    return candidates[Math.floor((candidates.length - 1) / 2)]!.date
  }
  return candidates.reduce((best, cur) =>
    Math.abs(cur.mean - input.periodMean!) < Math.abs(best.mean - input.periodMean!) ? cur : best,
  ).date
}

/**
 * Include every finite chart period for the selected aggregation.
 * Day used to be evenly sampled to 12 — that dropped most daily maps from Word.
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

  // Soft sample only for very long Day exports (keeps Word usable).
  let selected = periodEntries
  if (aggregation === 'day' && periodEntries.length > SOFT_MAX_DAY_SNAPSHOTS) {
    const out: MapSnapshotPeriodEntry[] = []
    for (let i = 0; i < SOFT_MAX_DAY_SNAPSHOTS; i += 1) {
      out.push(
        periodEntries[
          Math.round((i * (periodEntries.length - 1)) / (SOFT_MAX_DAY_SNAPSHOTS - 1))
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
      ? `Series average (${fromYear}–${toYear})`
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
      .join(' · ')
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
  const row = dailyRows.find(d => d.date?.slice(0, 10) === sceneDate.slice(0, 10))
  const zKey = zonalKeyForLayer(layerId)
  const zonal = zKey && row?.zonal?.[zKey]
  if (zonal) {
    return {
      mean: zonal.mean ?? periodMean,
      min: zonal.min ?? periodMean,
      max: zonal.max ?? periodMean,
    }
  }
  const dailyMean = row ? evaluateImageryLayerDailyValue(layerId, row) : null
  const mean = dailyMean ?? periodMean
  return { mean, min: mean, max: mean }
}

function buildSnapshotNotes(
  layerId: string,
  mean: number | null,
  interpretations: ImageryIndexInterpretation[],
  kind: MapSnapshotPeriodEntry['kind'] = 'period',
): string {
  if (kind === 'series-average') {
    return `${layerId} series-average overview — representative scene closest to the multi-year mean (${fmtNum(mean, 4)}). Year-by-year average maps follow.`
  }
  const interp = interpretations.find(i => i.layerId.toUpperCase() === layerId.trim().toUpperCase())
  if (interp) {
    return [interp.summaryLine, interp.coverageLine, interp.actionsLine].filter(Boolean).join(' ')
  }
  if (mean == null) return 'No index statistics for this acquisition date.'
  return `${layerId} AOI mean ${fmtNum(mean, 4)} for this scene — compare with prior periods in the time series chart.`
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
  /** Panel Day/Week/Month/Year — drives which periods become maps. */
  timeAggregation?: ImageryTimeAggregation
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}

export async function buildTimeSeriesMapSnapshotGroups(
  input: BuildTimeSeriesMapSnapshotGroupsInput,
): Promise<TimeSeriesMapSnapshotGroup[]> {
  const groups: TimeSeriesMapSnapshotGroup[] = []
  const timeAggregation = input.timeAggregation ?? 'day'
  const layout = resolveTimeSeriesSnapshotLayout(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  const extent = resolveTimeSeriesSnapshotExtent(input.geometry, layout.mapW, layout.mapH)
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
    const series = input.layerSeries.find(s => s.layerId.toUpperCase() === layerId.toUpperCase())
    if (!series) continue

    const entries = selectMapSnapshotEntries({
      layerId,
      chartLabels: input.chartLabels,
      displayLabels: input.displayLabels,
      values: series.values,
      periodAnchorDates: input.periodAnchorDates,
      dailyRows: input.dailyRows,
      timeAggregation,
    })
    if (!entries.length) continue
    jobs.push({ layerId, entries })
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

      const stats = resolveSceneStats(job.layerId, entry.sceneDate, entry.periodMean, input.dailyRows)
      // Skip dates with no analyzable index statistics — never emit basemap-only cards.
      if (stats.mean == null || !Number.isFinite(stats.mean)) {
        completed += 1
        input.onProgress?.(completed, Math.max(total, 1))
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: job.layerId.toUpperCase(),
          sceneDate: entry.sceneDate,
          periodLabel: entry.periodLabel,
          imageBase64: null,
          dataSource: DATA_SOURCE,
          mean: null,
          min: null,
          max: null,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Skipped — no index statistics for this acquisition date.',
        } satisfies TimeSeriesMapSnapshot
      }

      let indexBase64: string | null = null
      try {
        indexBase64 = await fetchIndexLayerMapSnapshotBase64({
          geometry: input.geometry,
          layerId: job.layerId,
          sceneDate: entry.sceneDate,
          widthPx: SNAPSHOT_WIDTH,
          heightPx: SNAPSHOT_HEIGHT,
          extent,
          signal: input.signal,
        })
      } catch {
        indexBase64 = null
      }

      // Require a successful index analysis raster — do not fall back to basemap alone.
      if (!indexBase64) {
        completed += 1
        input.onProgress?.(completed, Math.max(total, 1))
        return {
          layerId: job.layerId.toUpperCase(),
          layerLabel: job.layerId.toUpperCase(),
          sceneDate: entry.sceneDate,
          periodLabel: entry.periodLabel,
          imageBase64: null,
          dataSource: DATA_SOURCE,
          mean: stats.mean,
          min: stats.min,
          max: stats.max,
          areaHa: input.areaHa,
          legendText: formatLegendText(job.layerId),
          notes: 'Skipped — index analysis raster unavailable for this date.',
        } satisfies TimeSeriesMapSnapshot
      }

      let imageBase64: string | null = null
      try {
        imageBase64 = await compositeAoiMapSnapshotBase64({
          geometry: input.geometry,
          basemapDataUrl,
          indexBase64,
          layerId: job.layerId,
          title: `${job.layerId.toUpperCase()} · ${entry.periodLabel}`,
          sceneDate: entry.sceneDate,
          widthPx: SNAPSHOT_WIDTH,
          heightPx: SNAPSHOT_HEIGHT,
          extent,
        })
      } catch {
        imageBase64 = indexBase64
      }

      completed += 1
      input.onProgress?.(completed, Math.max(total, 1))

      return {
        layerId: job.layerId.toUpperCase(),
        layerLabel: job.layerId.toUpperCase(),
        sceneDate: entry.sceneDate,
        periodLabel: entry.periodLabel,
        imageBase64,
        dataSource: DATA_SOURCE,
        mean: stats.mean,
        min: stats.min,
        max: stats.max,
        areaHa: input.areaHa,
        legendText: formatLegendText(job.layerId),
        notes: buildSnapshotNotes(job.layerId, stats.mean, input.interpretations, entry.kind),
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
  ws.columns = [
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 36 },
  ]

  ws.getCell('A1').value = 'Map Snapshots — Visual Time-Series Report'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: INK } }
  ws.mergeCells('A1:G1')

  ws.getCell('A2').value =
    'AOI index maps follow the panel Time aggregation (Day / Week / Month / Year) for each selected layer.'
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells('A2:G2')

  let row = 4

  if (!groups.length) {
    ws.getCell(row, 1).value = 'No map snapshots available — draw an AOI and run time series analysis first.'
    ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: MUTED } }
    ws.mergeCells(row, 1, row, 7)
    return
  }

  const imageWidth = 360
  const imageHeight = 240
  const rowStride = 16

  for (const group of groups) {
    ws.getCell(row, 1).value = group.title
    styleSection(ws.getCell(row, 1))
    ws.mergeCells(row, 1, row, 7)
    row += 2

    for (const snap of group.snapshots) {
      ws.getCell(row, 1).value = 'Analysis / Index'
      ws.getCell(row, 2).value = snap.layerLabel
      ws.getCell(row, 3).value = 'Scene date'
      ws.getCell(row, 4).value = snap.sceneDate
      ws.getCell(row, 5).value = 'Period'
      ws.getCell(row, 6).value = snap.periodLabel
      ws.getRow(row).font = { size: 9, bold: true }
      row++

      ws.getCell(row, 1).value = 'Mean'
      ws.getCell(row, 2).value = fmtNum(snap.mean, 4)
      ws.getCell(row, 3).value = 'Min'
      ws.getCell(row, 4).value = fmtNum(snap.min, 4)
      ws.getCell(row, 5).value = 'Max'
      ws.getCell(row, 6).value = fmtNum(snap.max, 4)
      ws.getCell(row, 7).value = `AOI ${fmtHa(snap.areaHa)}`
      ws.getRow(row).font = { size: 9 }
      row++

      ws.getCell(row, 1).value = 'Data source'
      ws.getCell(row, 2).value = snap.dataSource
      ws.mergeCells(row, 2, row, 7)
      ws.getRow(row).font = { size: 9 }
      row++

      ws.getCell(row, 1).value = 'Legend'
      ws.getCell(row, 2).value = snap.legendText
      ws.mergeCells(row, 2, row, 7)
      ws.getRow(row).font = { size: 8, color: { argb: MUTED } }
      ws.getRow(row).alignment = { wrapText: true }
      row++

      ws.getCell(row, 1).value = 'Analysis notes'
      ws.getCell(row, 2).value = snap.notes
      ws.mergeCells(row, 2, row, 7)
      ws.getRow(row).font = { size: 9 }
      ws.getRow(row).alignment = { wrapText: true }
      row++

      if (snap.imageBase64) {
        try {
          const imageId = wb.addImage({ base64: snap.imageBase64, extension: 'png' })
          ws.addImage(imageId, {
            tl: { col: 0.15, row: row - 0.1 },
            ext: { width: imageWidth, height: imageHeight },
          })
          row += rowStride
        } catch {
          ws.getCell(row, 1).value = '(Map image unavailable for this date)'
          ws.mergeCells(row, 1, row, 7)
          row += 2
        }
      } else {
        ws.getCell(row, 1).value = '(Map image unavailable for this date)'
        ws.mergeCells(row, 1, row, 7)
        row += 2
      }

      row += 1
    }

    row += 1
  }
}
