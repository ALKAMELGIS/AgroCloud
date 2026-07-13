import ExcelJS from 'exceljs'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  compositeAoiMapSnapshotBase64,
  dataUrlToPngBase64,
  fetchSatelliteBasemapSnapshot,
  fetchIndexLayerMapSnapshotBase64,
  resolveTimeSeriesSnapshotExtent,
  resolveTimeSeriesSnapshotLayout,
} from './timeSeriesMapSnapshot'
import type { TimeSeriesMapSnapshot, TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'

const BRAND_DARK = 'FF064E3B'
const SECTION_FILL = 'FFE2F5EE'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'
const DATA_SOURCE = 'Sentinel-2 L2A (Sentinel Hub WMS)'
/** Canvas includes map + bottom legend strip (no legend overlap). */
const SNAPSHOT_WIDTH = 520
const SNAPSHOT_HEIGHT = 390
const SNAPSHOT_CONCURRENCY = 2

function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function layerSnapshotTitle(layerId: string): string {
  const u = layerId.trim().toUpperCase()
  if (u === 'STRESS_ZONES') return 'Stress Zones Snapshots'
  if (u === 'CHAS') return 'CHAS Snapshots'
  return `${u} Snapshots`
}

function formatLegendText(layerId: string): string {
  const spec = resolveLayerLiveLegendSpec(layerId)
  if (!spec) return layerId
  if (spec.classes?.length) {
    return spec.classes
      .slice(0, 8)
      .map(c => {
        const range = c.rangeLabel ? ` (${c.rangeLabel})` : ''
        return `${c.label}${range}`
      })
      .join(' · ')
  }
  if (spec.gradientCss && spec.valueMin != null && spec.valueMax != null) {
    return `${spec.title}: ${spec.valueMin} → ${spec.valueMax}`
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
): string {
  const interp = interpretations.find(i => i.layerId.toUpperCase() === layerId.trim().toUpperCase())
  if (interp) {
    return [interp.summaryLine, interp.coverageLine, interp.actionsLine].filter(Boolean).join(' ')
  }
  if (mean == null) return 'No index statistics for this acquisition date.'
  return `${layerId} AOI mean ${fmtNum(mean, 4)} for this scene — compare with prior periods in the time series chart.`
}

export type TimeSeriesSnapshotPeriod = {
  periodIndex: number
  sceneDate: string
  periodLabel: string
  periodKey: string
}

/** Collect every chart period in chronological order (deduped by scene date). */
export function collectTimeSeriesSnapshotPeriods(input: {
  chartLabels: string[]
  displayLabels: string[]
  periodAnchorDates: Record<string, string>
}): TimeSeriesSnapshotPeriod[] {
  const seen = new Set<string>()
  const out: TimeSeriesSnapshotPeriod[] = []

  for (let i = 0; i < input.chartLabels.length; i += 1) {
    const periodKey = input.chartLabels[i]!
    const sceneDate = (input.periodAnchorDates[periodKey] ?? periodKey).trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sceneDate)) continue
    if (seen.has(sceneDate)) continue
    seen.add(sceneDate)
    out.push({
      periodIndex: i,
      sceneDate,
      periodLabel: input.displayLabels[i] ?? periodKey,
      periodKey,
    })
  }

  out.sort((a, b) => a.sceneDate.localeCompare(b.sceneDate) || a.periodIndex - b.periodIndex)
  return out
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

async function fetchSnapshotImageBase64(input: {
  geometry: GeoJSON.Geometry
  layerId: string
  sceneDate: string
  basemapDataUrl: string | null
  basemapBase64: string | null
  extent: ReturnType<typeof resolveTimeSeriesSnapshotExtent>
  signal?: AbortSignal
}): Promise<string | null> {
  let indexBase64: string | null = null
  try {
    indexBase64 = await fetchIndexLayerMapSnapshotBase64({
      geometry: input.geometry,
      layerId: input.layerId,
      sceneDate: input.sceneDate,
      widthPx: SNAPSHOT_WIDTH,
      heightPx: SNAPSHOT_HEIGHT,
      extent: input.extent,
      signal: input.signal,
    })
  } catch {
    indexBase64 = null
  }

  if (!indexBase64 && !input.basemapDataUrl) {
    return input.basemapBase64
  }

  try {
    return await compositeAoiMapSnapshotBase64({
      geometry: input.geometry,
      basemapDataUrl: input.basemapDataUrl,
      indexBase64,
      layerId: input.layerId,
      widthPx: SNAPSHOT_WIDTH,
      heightPx: SNAPSHOT_HEIGHT,
      extent: input.extent,
    })
  } catch {
    return indexBase64 ?? input.basemapBase64
  }
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
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}

export async function buildTimeSeriesMapSnapshotGroups(
  input: BuildTimeSeriesMapSnapshotGroupsInput,
): Promise<TimeSeriesMapSnapshotGroup[]> {
  const groups: TimeSeriesMapSnapshotGroup[] = []
  const periods = collectTimeSeriesSnapshotPeriods({
    chartLabels: input.chartLabels,
    displayLabels: input.displayLabels,
    periodAnchorDates: input.periodAnchorDates,
  })

  if (!periods.length) return groups

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

  const totalJobs = input.layerIds.length * periods.length
  let completed = 0

  for (const layerId of input.layerIds) {
    if (input.signal?.aborted) break
    const series = input.layerSeries.find(s => s.layerId.toUpperCase() === layerId.toUpperCase())
    if (!series) continue

    const snapshots = await mapPool(periods, SNAPSHOT_CONCURRENCY, async entry => {
      if (input.signal?.aborted) {
        return {
          layerId: layerId.toUpperCase(),
          layerLabel: layerId.toUpperCase(),
          sceneDate: entry.sceneDate,
          periodLabel: entry.periodLabel,
          imageBase64: basemapBase64,
          dataSource: DATA_SOURCE,
          mean: null,
          min: null,
          max: null,
          areaHa: input.areaHa,
          legendText: formatLegendText(layerId),
          notes: 'Export cancelled.',
        } satisfies TimeSeriesMapSnapshot
      }

      const periodMean = series.values[entry.periodIndex] ?? null
      const stats = resolveSceneStats(layerId, entry.sceneDate, periodMean, input.dailyRows)
      const imageBase64 = await fetchSnapshotImageBase64({
        geometry: input.geometry,
        layerId,
        sceneDate: entry.sceneDate,
        basemapDataUrl,
        basemapBase64,
        extent,
        signal: input.signal,
      })

      completed += 1
      input.onProgress?.(completed, totalJobs)

      return {
        layerId: layerId.toUpperCase(),
        layerLabel: layerId.toUpperCase(),
        sceneDate: entry.sceneDate,
        periodLabel: entry.periodLabel,
        imageBase64,
        dataSource: DATA_SOURCE,
        mean: stats.mean,
        min: stats.min,
        max: stats.max,
        areaHa: input.areaHa,
        legendText: formatLegendText(layerId),
        notes: buildSnapshotNotes(layerId, stats.mean, input.interpretations),
      } satisfies TimeSeriesMapSnapshot
    })

    groups.push({
      layerId: layerId.toUpperCase(),
      title: layerSnapshotTitle(layerId),
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
    'AOI index maps for every period in the Imagery Time Series chart (start/end date and aggregation), organized by analysis layer.'
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
