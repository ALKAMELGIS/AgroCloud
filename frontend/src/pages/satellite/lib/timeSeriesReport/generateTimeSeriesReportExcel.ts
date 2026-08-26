import ExcelJS from 'exceljs'
import { resolveIndexThresholdProfile } from '../../../../lib/imageryIndexInterpretationEngine'
import { DEFAULT_POTATO_MAX_YIELD_T_HA } from '../../../../lib/imageryYieldEstimation'
import type { MeteoNativeChartSpec } from '../weatherClimateReport/meteoNativeExcelCharts'
import { cleanAoiPlotDisplayId } from './aoiExcelExportShared'
import { buildMapSnapshotsSheet } from './timeSeriesExcelMapSnapshots'
import {
  buildSummarySheet,
  reorderWorksheets,
  SERBIA_ANALYTICS_LAYER_IDS,
  SERBIA_ANALYTICS_SHEET_ORDER,
} from './timeSeriesExcelSummarySheet'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import {
  latestEstimatedWaterLossSummary,
  type EstimatedWaterLossPoint,
  WATER_LOSS_INDEX_ET_REF_MM,
} from './estimatedWaterLossTimeline'
import {
  latestEstimatedYieldSummary,
  type EstimatedYieldPoint,
} from './estimatedYieldTimeline'
import {
  latestVegetationCoverageSummary,
  type VegetationCoveragePoint,
} from './vegetationCoverageTimeline'

type WorkbookLayout = 'serbia-analytics' | 'full'

const DEFAULT_ANALYTICS_REPORT_XLSX = 'Agricultural_Imagery_Timeseries_Report.xlsx'

/** Windows-illegal path characters + C0 controls (keeps spaces / hyphens for plot ids). */
const WINDOWS_UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g

export type GenerateTimeSeriesReportExcelOptions = {
  /** Download basename; sanitized via {@link sanitizeTimeSeriesReportExcelFilename}. */
  filename?: string
}

/**
 * Build a Windows-safe `.xlsx` download name from a plot label / AOI title.
 * Uses {@link cleanAoiPlotDisplayId} then strips illegal path characters (spaces kept).
 */
export function sanitizeTimeSeriesReportExcelFilename(raw: string): string {
  const withoutExt = String(raw || '')
    .replace(/\.xlsx$/i, '')
    .trim()
  let safe = cleanAoiPlotDisplayId(withoutExt)
    .replace(WINDOWS_UNSAFE_FILENAME_CHARS, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!safe) safe = 'Agricultural_Imagery_Timeseries_Report'
  if (safe.length > 120) safe = safe.slice(0, 120).replace(/[_.\s]+$/g, '').trimEnd()
  return /\.xlsx$/i.test(safe) ? safe : `${safe}.xlsx`
}

const BRAND_DARK = 'FF064E3B'
const BRAND = 'FF047857'
const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFE2F5EE'
const ALT_ROW = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'

type LayerRow = { layerId: string; values: Array<number | null> }

function fmtNum(n: number | null | undefined, digits = 4): string | number {
  if (n == null || !Number.isFinite(n)) return '-'
  return Number(n.toFixed(digits))
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '-'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function fmtHaNum(ha: number): number | string {
  if (!Number.isFinite(ha) || ha <= 0) return '-'
  return Number(ha.toFixed(ha >= 100 ? 1 : 2))
}

function fmtSqMNum(m2: number): number | string {
  if (!Number.isFinite(m2) || m2 <= 0) return '-'
  return Math.round(m2)
}

type VegClassTier = 'healthy' | 'moderate' | 'stress' | 'critical'

function classForTier(
  classes: VegetationCoveragePoint['classes'],
  tier: VegClassTier,
): VegetationCoveragePoint['classes'][number] | undefined {
  return classes.find(c => c.tier === tier)
}

function formatClassDistributionPct(classes: VegetationCoveragePoint['classes']): string {
  const text = classes
    .filter(c => c.pct > 0.5)
    .map(c => `${c.label} ${c.pct.toFixed(0)}%`)
    .join(' - ')
  return text || '-'
}

function vegClassAreaColumns(classes: VegetationCoveragePoint['classes']): Array<number | string> {
  const tiers: VegClassTier[] = ['healthy', 'moderate', 'stress', 'critical']
  return tiers.flatMap(tier => {
    const c = classForTier(classes, tier)
    return [fmtHaNum(c?.areaHa ?? 0), fmtSqMNum(c?.areaM2 ?? 0)]
  })
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const v = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
  const sd = Math.sqrt(v)
  return Number.isFinite(sd) ? sd : null
}

function linearSlope(values: Array<number | null>): number | null {
  const pts: Array<{ x: number; y: number }> = []
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) pts.push({ x: i, y: v })
  })
  if (pts.length < 2) return null
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.x, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return null
  return (n * sumXY - sumX * sumY) / denom
}

function vigorClassFromNdvi(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-'
  const profile = resolveIndexThresholdProfile('NDVI')
  for (const band of profile.tiers) {
    if (v >= band.min && v < band.max) {
      if (band.tier === 'healthy') return 'Healthy'
      if (band.tier === 'moderate') return 'Moderate'
      if (band.tier === 'stress') return 'Stress'
      return 'Critical'
    }
  }
  return 'Moderate'
}

function latestValue(series: LayerRow): number | null {
  for (let i = series.values.length - 1; i >= 0; i--) {
    const v = series.values[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

function meanValue(series: LayerRow): number | null {
  const nums = series.values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function vegetationCoverage(payload: TimeSeriesReportPayload) {
  const timeline = payload.vegetationCoverageTimeline ?? []
  const latest = latestVegetationCoverageSummary(timeline)
  if (latest) {
    return {
      plantedPct: latest.vegetationCoveragePct,
      unplantedPct: latest.bareCoveragePct,
      plantedHa: latest.vegetationAreaHa,
      unplantedHa: latest.bareAreaHa,
      acquisitionDate: latest.date,
      dominantClass: latest.dominantClass,
      fromTimeline: true as const,
    }
  }
  const cov = payload.primaryInterpretation?.coverage ?? []
  const totalHa = payload.location.areaHa
  const plantedTiers = new Set(['healthy', 'moderate', 'stress'])
  const plantedPct = cov.filter(c => plantedTiers.has(c.tier)).reduce((s, c) => s + c.pct, 0)
  const unplantedPct = cov.filter(c => c.tier === 'critical').reduce((s, c) => s + c.pct, 0)
  const remainder = Math.max(0, 100 - plantedPct - unplantedPct)
  const adjustedUnplanted = unplantedPct > 0 ? unplantedPct : remainder
  return {
    plantedPct,
    unplantedPct: adjustedUnplanted,
    plantedHa: totalHa > 0 ? (totalHa * plantedPct) / 100 : 0,
    unplantedHa: totalHa > 0 ? (totalHa * adjustedUnplanted) / 100 : 0,
    acquisitionDate: payload.period.acquisitionDate,
    dominantClass: payload.primaryInterpretation?.meanLabel ?? '-',
    fromTimeline: false as const,
  }
}

function styleTitle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 14, color: { argb: INK } }
}

function styleSection(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } }
}

function styleTableHeader(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: BRAND_DARK } },
      bottom: { style: 'thin', color: { argb: BRAND_DARK } },
      left: { style: 'thin', color: { argb: BRAND_DARK } },
      right: { style: 'thin', color: { argb: BRAND_DARK } },
    }
  })
  row.height = 20
}

function styleDataRow(row: ExcelJS.Row, alt: boolean): void {
  row.eachCell(cell => {
    if (alt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
    cell.alignment = { vertical: 'top', wrapText: true }
  })
}

function observationCount(payload: TimeSeriesReportPayload): number {
  return payload.charts.labels.filter((_, i) =>
    payload.charts.series.some(s => {
      const v = s.values[i]
      return v != null && Number.isFinite(v)
    }),
  ).length
}

function lastFourWeekTrend(values: Array<number | null>): string {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length < 2) return 'Stable'
  const tail = values.slice(-4).filter((v): v is number => v != null && Number.isFinite(v))
  if (tail.length < 2) return 'Stable'
  const slope = linearSlope(tail)
  if (slope == null) return 'Stable'
  if (slope > 0.01) return 'Increasing'
  if (slope < -0.01) return 'Decreasing'
  return 'Stable'
}

/**
 * Same period dates the on-screen / Word trend chart uses (anchor → display → key).
 */
function chartTimelineDates(payload: TimeSeriesReportPayload): string[] {
  const { labels, displayLabels, periodAnchorDates } = payload.charts
  return labels.map((key, i) => {
    const anchor = periodAnchorDates?.[key]
    if (anchor && /^\d{4}-\d{2}-\d{2}/.test(anchor)) return anchor.slice(0, 10)
    const disp = displayLabels[i]?.trim()
    if (disp && /^\d{4}-\d{2}-\d{2}/.test(disp)) return disp.slice(0, 10)
    return disp || key
  })
}

/** Selected layers that have at least one finite chart value (matches UI multi-select). */
function resolveSelectedChartSeries(payload: TimeSeriesReportPayload): LayerRow[] {
  const selected = new Set(
    (payload.layerIds.length ? payload.layerIds : payload.charts.series.map(s => s.layerId)).map(id =>
      id.trim().toUpperCase(),
    ),
  )
  return payload.charts.series
    .filter(s => selected.has(s.layerId.trim().toUpperCase()))
    .filter(s => s.values.some(v => v != null && Number.isFinite(v)))
    .map(s => ({
      layerId: s.layerId.trim().toUpperCase(),
      values: s.values.map(v => (v != null && Number.isFinite(v) ? Number(v) : null)),
    }))
}

/** Fixed Serbia analytics column order (501a KL-0231 reference). */
function resolveSerbiaChartSeries(payload: TimeSeriesReportPayload): LayerRow[] {
  const byId = new Map(
    payload.charts.series.map(s => [s.layerId.trim().toUpperCase(), s] as const),
  )
  return SERBIA_ANALYTICS_LAYER_IDS.map(layerId => {
    const s = byId.get(layerId)
    return {
      layerId,
      values: (s?.values ?? []).map(v => (v != null && Number.isFinite(v) ? Number(v) : null)),
    }
  })
}

function resolveChartSeriesForLayout(payload: TimeSeriesReportPayload, layout: WorkbookLayout): LayerRow[] {
  return layout === 'serbia-analytics' ? resolveSerbiaChartSeries(payload) : resolveSelectedChartSeries(payload)
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = String(name || 'Sheet')
    .replace(/[\\/?*[\]:]/g, '_')
    .slice(0, 31)
  if (!base) base = 'Sheet'
  let out = base
  let n = 2
  while (used.has(out.toLowerCase())) {
    const suffix = `_${n}`
    out = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  used.add(out.toLowerCase())
  return out
}

function buildDashboardSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload): void {
  const ws = wb.addWorksheet('Analytics Summary', { views: [{ showGridLines: true }] })
  ws.columns = [
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ]

  const exec = payload.executive
  const layers = payload.charts.series
  const obs = observationCount(payload)
  const periodLabel = `${payload.period.from} to ${payload.period.to}`

  ws.getCell('A1').value = 'Agricultural Satellite Intelligence - Imagery Time Series Report'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:F1')

  ws.getCell('A2').value = `Source: AgroCloud Satellite Intelligence - Period ${periodLabel} - ${obs} observations`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells('A2:F2')

  let row = 4
  ws.getCell(row, 1).value = 'Field Summary'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 3)
  row++

  const ndviSeries = layers.find(s => s.layerId.toUpperCase() === 'NDVI')
  const ndviNums = ndviSeries?.values.filter((v): v is number => v != null && Number.isFinite(v)) ?? []
  const ndviMin = ndviNums.length ? Math.min(...ndviNums) : null
  const ndviMax = ndviNums.length ? Math.max(...ndviNums) : null

  const summaryRows: Array<[string, string]> = [
    ['AOI / Field Name', payload.location.fieldName],
    ['Total Field Area', fmtHa(payload.location.areaHa)],
    ['Analysis Period', periodLabel],
    ['Time Aggregation', String(payload.period.timeAggregation || 'day')],
    ['Satellite Source', 'Sentinel-2 (Sentinel Hub)'],
    ['Acquisition Date(s)', payload.period.acquisitionDate],
    ['Vegetation Indices', payload.layerIds.join(', ')],
    ['Mean Index Value (NDVI)', exec.ndviMean != null ? String(fmtNum(exec.ndviMean, 4)) : '-'],
    ['Minimum Index Value (NDVI)', ndviMin != null ? String(fmtNum(ndviMin, 4)) : '-'],
    ['Maximum Index Value (NDVI)', ndviMax != null ? String(fmtNum(ndviMax, 4)) : '-'],
    ['Vegetation Trend Analysis', exec.vegetationTrend],
    ['Vegetation Health Summary', exec.indexKpis.find(k => k.label === 'MEAN NDVI')?.sublabel ?? exec.cropHealth],
  ]
  for (const [label, value] of summaryRows) {
    ws.getCell(row, 1).value = label
    ws.getCell(row, 1).font = { bold: true, size: 9 }
    ws.getCell(row, 2).value = value
    ws.getCell(row, 2).font = { size: 9 }
    ws.mergeCells(row, 2, row, 4)
    row++
  }

  row++
  ws.getCell(row, 1).value = 'Vegetation Coverage'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 3)
  row++

  const veg = vegetationCoverage(payload)
  ws.getCell(row, 1).value = 'Acquisition date (snapshot)'
  ws.getCell(row, 1).font = { bold: true, size: 9 }
  ws.getCell(row, 2).value = veg.acquisitionDate || payload.period.acquisitionDate
  ws.mergeCells(row, 2, row, 4)
  row++
  ws.getCell(row, 1).value = 'Dominant class'
  ws.getCell(row, 1).font = { bold: true, size: 9 }
  ws.getCell(row, 2).value = veg.dominantClass
  ws.mergeCells(row, 2, row, 4)
  row++
  ws.getCell(row, 1).value =
    'Coverage is calculated independently for each acquisition date (see Vegetation Coverage Timeline sheet). Summary below = latest scene.'
  ws.getCell(row, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
  ws.mergeCells(row, 1, row, 5)
  row++

  const covHeader = ws.getRow(row)
  covHeader.values = ['Class', 'Coverage (%)', 'Area (ha)']
  styleTableHeader(covHeader)
  row++

  const covRows = [
    ['Planted Area (Vegetation)', veg.plantedPct, fmtHaNum(veg.plantedHa)],
    ['Unplanted Area (Bare / critical)', veg.unplantedPct, fmtHaNum(veg.unplantedHa)],
  ]
  covRows.forEach((vals, i) => {
    const r = ws.getRow(row)
    r.values = vals
    styleDataRow(r, i % 2 === 1)
    r.getCell(2).numFmt = '0.0"%"'
    row++
  })

  row++
  const waterLatest = latestEstimatedWaterLossSummary(payload.estimatedWaterLossTimeline ?? [])
  ws.getCell(row, 1).value = 'Estimated Water Loss'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 5)
  row++
  ws.getCell(row, 1).value =
    'Per-date water loss: Water Loss Index (%) = (1 − ETa/ETc) × 100 · Loss (m³/ha/day) = max(0, ETc − ETa) × 10. ETc = Kc × ET0 (Open-Meteo) when available.'
  ws.getCell(row, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
  ws.mergeCells(row, 1, row, 5)
  row++
  if (waterLatest) {
    const waterHdr = ws.getRow(row)
    waterHdr.values = [
      'Acquisition Date',
      'Water Loss Index %',
      'Loss (m3/day)',
      'Loss (m3/ha/day)',
      'Stress Level',
      'Source',
    ]
    styleTableHeader(waterHdr)
    row++
    const waterRow = ws.getRow(row)
    waterRow.values = [
      waterLatest.date,
      Number(waterLatest.waterLossIndexPct.toFixed(1)),
      Number(waterLatest.waterLossM3Day.toFixed(1)),
      Number(waterLatest.waterLossM3HaDay.toFixed(2)),
      waterLatest.waterStressLevel,
      waterLatest.source === 'et' ? 'Evapotranspiration (ET)' : 'Satellite index estimate',
    ]
    styleDataRow(waterRow, false)
    if (waterLatest.highWaterLoss) {
      waterRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }
        cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: 'FF9A3412' } }
      })
    }
    waterRow.getCell(2).numFmt = '0.0"%"'
    row++
  } else {
    ws.getCell(row, 1).value =
      'No estimated water loss rows - ensure AOI is selected and NDMI/NDWI (or ET) are available for acquisition dates.'
    ws.getCell(row, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
    ws.mergeCells(row, 1, row, 5)
    row++
  }

  row++
  const layerIds = layers.map(s => s.layerId.toUpperCase())
  const latestHdr = ws.getRow(row)
  latestHdr.values = layerIds.map(id => `LATEST ${id}`)
  latestHdr.eachCell(c => {
    c.font = { bold: true, size: 9, color: { argb: BRAND_DARK } }
  })
  row++
  const latestVal = ws.getRow(row)
  latestVal.values = layers.map(s => fmtNum(latestValue(s), 4))
  row++
  const avgVal = ws.getRow(row)
  avgVal.values = layers.map(s => {
    const m = meanValue(s)
    return m != null ? `Period avg ${fmtNum(m, 2)}` : 'Period avg -'
  })
  avgVal.eachCell(c => {
    c.font = { size: 9, color: { argb: MUTED } }
  })
  row += 2

  ws.getCell(row, 1).value = 'Period Statistics'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 5)
  row++

  const statHeader = ws.getRow(row)
  statHeader.values = ['Metric', ...layerIds]
  styleTableHeader(statHeader)
  row++

  const statRows: Array<[string, (s: LayerRow) => number | null]> = [
    ['Mean', s => meanValue(s)],
    ['Min', s => {
      const nums = s.values.filter((v): v is number => v != null && Number.isFinite(v))
      return nums.length ? Math.min(...nums) : null
    }],
    ['Max', s => {
      const nums = s.values.filter((v): v is number => v != null && Number.isFinite(v))
      return nums.length ? Math.max(...nums) : null
    }],
    ['Std Dev', s => stdDev(s.values.filter((v): v is number => v != null && Number.isFinite(v)))],
    ['Latest (last obs.)', s => latestValue(s)],
    ['Trend (slope/period)', s => linearSlope(s.values)],
  ]

  statRows.forEach(([label, fn], i) => {
    const r = ws.getRow(row)
    r.values = [label, ...layers.map(fn).map(v => (v == null ? '-' : fmtNum(v, 4)))]
    styleDataRow(r, i % 2 === 1)
    row++
  })

  row++
  const ndviStat = payload.statistics.find(s => s.layerId.toUpperCase() === 'NDVI')
  const ndmiLatest = layers.find(s => s.layerId.toUpperCase() === 'NDMI')
  const vigorFlag =
    ndviStat?.mean != null && ndviStat.mean < 0.35
      ? 'Stress Alert'
      : ndviStat?.mean != null && ndviStat.mean >= 0.55
        ? 'Healthy'
        : 'Moderate'
  const moistureFlag =
    ndmiLatest && latestValue(ndmiLatest) != null && latestValue(ndmiLatest)! < 0.15
      ? 'Water-Limited'
      : 'Adequate'

  ws.getCell(row, 1).value = 'Vigor Flag'
  ws.getCell(row, 2).value = vigorFlag
  ws.getCell(row, 4).value = 'Moisture Flag'
  ws.getCell(row, 5).value = moistureFlag
  ;[1, 4].forEach(c => {
    ws.getCell(row, c).font = { bold: true, size: 9 }
  })
  row++
  ws.getCell(row, 1).value = 'NDVI Trend (last 4 wks)'
  ws.getCell(row, 2).value = ndviSeries ? lastFourWeekTrend(ndviSeries.values) : (ndviStat?.trend ?? 'Stable')
  ws.getCell(row, 4).value = 'Data Completeness'
  ws.getCell(row, 5).value = `${obs} of ${payload.charts.labels.length} periods`
  row += 2

  ws.getCell(row, 1).value = 'Imagery Timeline - Vegetation & Moisture Trend'
  ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  ws.mergeCells(row, 1, row, 5)
  row++
  ws.getCell(row, 1).value =
    'See the Charts sheet for editable native Excel trend charts (one per selected layer - not images).'
  ws.getCell(row, 1).font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(row, 1, row, 5)
}

function buildDataSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload, layout: WorkbookLayout = 'full'): void {
  const ws = wb.addWorksheet('Time Series Data')
  const layers = resolveChartSeriesForLayout(payload, layout)
  const dates = chartTimelineDates(payload)
  const ndviSeries = layers.find(s => s.layerId === 'NDVI')
  const serbia = layout === 'serbia-analytics'
  const headers = serbia
    ? ['Date', ...layers.map(s => s.layerId), ...(ndviSeries ? ['Vigor Class'] : [])]
    : ['Date', 'Period key', ...layers.map(s => s.layerId), ...(ndviSeries ? ['Vigor Class'] : [])]
  ws.columns = headers.map((h, i) => ({ width: i === 0 ? 14 : i === 1 && !serbia ? 14 : 12 }))

  const headerRow = ws.getRow(1)
  headerRow.values = headers
  styleTableHeader(headerRow)

  const n = Math.max(dates.length, payload.charts.labels.length)
  for (let rowIndex = 0; rowIndex < n; rowIndex++) {
    const periodKey = payload.charts.labels[rowIndex] ?? ''
    const date = dates[rowIndex] ?? periodKey
    const ndviVal = ndviSeries?.values[rowIndex] ?? null
    const layerValues = layers.map(s => {
      const v = s.values[rowIndex]
      return v != null && Number.isFinite(v) ? Number(Number(v).toFixed(4)) : null
    })
    const values: Array<string | number | null> = serbia
      ? [date, ...layerValues]
      : [date, periodKey && periodKey !== date ? periodKey : '', ...layerValues]
    if (ndviSeries) values.push(vigorClassFromNdvi(ndviVal))
    const r = ws.getRow(rowIndex + 2)
    r.values = values
    styleDataRow(r, rowIndex % 2 === 1)
    const firstNumCol = serbia ? 2 : 3
    for (let c = firstNumCol; c <= firstNumCol + layers.length - 1; c++) {
      if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = '0.0000'
    }
  }

  const noteRow = n + 4
  ws.getCell(noteRow, 1).value =
    'Raw AOI mean values for each selected index, aligned with the on-screen Imagery Time Series chart (same dates and means). Empty cells = no observation for that period.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, Math.max(headers.length, 1))
}

function buildAnalysisSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload): void {
  const ws = wb.addWorksheet('Analysis & Recommendations')
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 92

  const exec = payload.executive
  const obs = observationCount(payload)
  const periodLabel = `${payload.period.from} to ${payload.period.to}`

  let row = 2
  ws.getCell(row, 2).value = 'Analysis & Recommendations'
  ws.getCell(row, 2).font = { bold: true, size: 13, color: { argb: BRAND_DARK } }
  row += 2

  const sections: Array<{ title: string; body: string }> = [
    {
      title: 'Executive Summary',
      body: `The dataset covers ${obs} satellite observations from ${periodLabel}. ${exec.narrative}`,
    },
    { title: 'Vegetation Vigor (NDVI / SAVI)', body: `${exec.cropHealth} ${exec.vegetationTrend}` },
    { title: 'Moisture Status (NDMI / NDWI)', body: exec.moistureStatus },
    {
      title: 'Vegetation Health Summary',
      body: `${exec.stressAssessment} Risk level: ${exec.riskLevel}. ${exec.multiIndexNotes}`,
    },
    {
      title: 'Data Quality Notes',
      body: `Analysis uses ${payload.layerIds.join(', ')} indices from Sentinel Hub statistics. ${
        exec.ndwiEstimated || exec.saviEstimated
          ? 'NDWI and/or SAVI values marked with * are estimated from available NDVI/NDMI where raw band reflectance was not exported.'
          : 'All index values are derived from source imagery statistics.'
      }`,
    },
  ]

  for (const sec of sections) {
    ws.getCell(row, 2).value = sec.title
    styleSection(ws.getCell(row, 2))
    row += 2
    ws.getCell(row, 2).value = sec.body
    ws.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' }
    ws.getCell(row, 2).font = { size: 10, color: { argb: INK } }
    ws.getRow(row).height = Math.min(120, 15 + Math.ceil(sec.body.length / 90) * 12)
    row += 2
  }

  ws.getCell(row, 2).value = 'Recommendations'
  styleSection(ws.getCell(row, 2))
  row += 2
  for (const rec of exec.recommendations) {
    ws.getCell(row, 2).value = `- ${rec}`
    ws.getCell(row, 2).alignment = { wrapText: true }
    ws.getCell(row, 2).font = { size: 10 }
    row++
  }

  row++
  ws.getCell(row, 2).value = `Generated ${payload.generatedAt.replace('T', ' ').slice(0, 19)} UTC by ${payload.projectName}. Analytics Summary and Time Series Data summarize AOI statistics; Map Snapshots shows per-index timeline maps aligned with the chart.`
  ws.getCell(row, 2).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.getCell(row, 2).alignment = { wrapText: true }
}

/**
 * Charts sheet: catalogue + native Excel line charts linked to Time Series Data / per-index sheets.
 * No PNG images - charts are editable OOXML objects (same pattern as Weather Excel / Chart Timeline).
 */
function buildChartsSheetNative(
  wb: ExcelJS.Workbook,
  payload: TimeSeriesReportPayload,
  layerDataSheets: Array<{ layerId: string; sheetName: string; lastDataRow: number }>,
  layout: WorkbookLayout = 'full',
): MeteoNativeChartSpec[] {
  const ws = wb.addWorksheet('Charts', { views: [{ showGridLines: false }] })
  ws.columns = Array.from({ length: 10 }, () => ({ width: 14 }))

  const periodLabel = `${payload.period.from} to ${payload.period.to}`
  const series = resolveChartSeriesForLayout(payload, layout)
  const serbia = layout === 'serbia-analytics'

  ws.getCell('A1').value = 'IMAGERY TIME SERIES - Native Excel Charts'
  ws.getCell('A1').font = { bold: true, size: 12, color: { argb: BRAND_DARK } }
  ws.mergeCells('A1:J1')

  ws.getCell('A2').value = serbia
    ? 'Editable Office charts (not images) - linked to Period / index value columns'
    : 'Editable Office charts (line · bar · pie · scatter) — linked to data sheets'
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  ws.mergeCells('A2:J2')

  ws.getCell('A3').value =
    `${payload.location.fieldName} - ${periodLabel} - ${series.map(s => s.layerId).join(', ') || 'no layers'}`
  ws.getCell('A3').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells('A3:J3')

  if (!layerDataSheets.length) {
    ws.getCell('A5').value = 'No chart data available for the selected period and layers.'
    ws.getCell('A5').font = { italic: true, size: 10, color: { argb: MUTED } }
    return []
  }

  ws.getCell('A5').value = 'Chart catalogue'
  ws.getCell('A5').font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  layerDataSheets.forEach((entry, i) => {
    ws.getCell(6 + i, 1).value = serbia
      ? `${i + 1}. ${entry.layerId} Trend <- '${entry.sheetName}'`
      : `${i + 1}. ${entry.layerId} — Line + Bar + Pie on '${entry.sheetName}'`
    ws.getCell(6 + i, 1).font = { size: 9, color: { argb: MUTED } }
  })

  const specs: MeteoNativeChartSpec[] = []
  const catalogEnd = 6 + layerDataSheets.length
  const rowStride = 20

  layerDataSheets.forEach((entry, i) => {
    const anchorRow = catalogEnd + 2 + i * rowStride
    ws.getCell(anchorRow, 1).value = `${entry.layerId} Trend`
    ws.getCell(anchorRow, 1).font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
    ws.mergeCells(anchorRow, 1, anchorRow, 6)
    ws.getCell(anchorRow + 1, 1).value =
      'Native Excel line chart (markers on). Edit source data on the linked sheet to refresh.'
    ws.getCell(anchorRow + 1, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
    ws.mergeCells(anchorRow + 1, 1, anchorRow + 1, 6)

    specs.push({
      title: `${entry.layerId} Trend`,
      kind: 'line',
      sectionLabel: entry.layerId,
      anchorRow: anchorRow + 2,
      anchorCol: 0,
      legendPos: 'r',
      varyColors: false,
      smooth: true,
      targetSheet: 'Charts',
      series: [
        {
          name: entry.layerId,
          valuesRef: `'${entry.sheetName}'!$B$3:$B$${entry.lastDataRow}`,
          catsRef: `'${entry.sheetName}'!$A$3:$A$${entry.lastDataRow}`,
        },
      ],
    })
  })

  const noteRow = catalogEnd + 2 + layerDataSheets.length * rowStride + 1
  ws.getCell(noteRow, 1).value =
    'All Charts sheet figures are real Excel chart objects (OOXML). Double-click in Excel to edit series, axes, and style.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, 10)

  return specs
}

function countLayerValueBands(
  layerId: string,
  values: Array<number | null>,
): Array<[string, number]> {
  const isNdvi = layerId.trim().toUpperCase() === 'NDVI'
  if (isNdvi) {
    const bands = new Map<string, number>([
      ['Healthy (>0.60)', 0],
      ['Moderate (0.40–0.60)', 0],
      ['Stressed (0.20–0.40)', 0],
      ['Non-Vegetated (<0.20)', 0],
      ['No observation', 0],
    ])
    for (const v of values) {
      if (v == null || !Number.isFinite(v)) {
        bands.set('No observation', (bands.get('No observation') ?? 0) + 1)
        continue
      }
      if (v > 0.6) bands.set('Healthy (>0.60)', (bands.get('Healthy (>0.60)') ?? 0) + 1)
      else if (v >= 0.4) bands.set('Moderate (0.40–0.60)', (bands.get('Moderate (0.40–0.60)') ?? 0) + 1)
      else if (v >= 0.2) bands.set('Stressed (0.20–0.40)', (bands.get('Stressed (0.20–0.40)') ?? 0) + 1)
      else bands.set('Non-Vegetated (<0.20)', (bands.get('Non-Vegetated (<0.20)') ?? 0) + 1)
    }
    return [...bands.entries()].filter(([, n]) => n > 0)
  }

  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return [['No observation', values.length]]
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const span = Math.max(hi - lo, 1e-9)
  const labels = ['Low', 'Medium-Low', 'Medium-High', 'High']
  const counts = [0, 0, 0, 0]
  let missing = 0
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) {
      missing += 1
      continue
    }
    const bucket = Math.min(3, Math.floor(((v - lo) / span) * 4))
    counts[bucket]! += 1
  }
  const out = labels.map((label, i): [string, number] => [label, counts[i]!]).filter(([, n]) => n > 0)
  if (missing > 0) out.push(['No observation', missing])
  return out
}

/** Build per-layer data sheets and return metadata needed for native chart refs. */
function buildPerLayerChartDataSheetsWithMeta(
  wb: ExcelJS.Workbook,
  payload: TimeSeriesReportPayload,
  layout: WorkbookLayout = 'full',
): { specs: MeteoNativeChartSpec[]; sheets: Array<{ layerId: string; sheetName: string; lastDataRow: number }> } {
  const layers = resolveChartSeriesForLayout(payload, layout)
  const dates = chartTimelineDates(payload)
  if (!layers.length || !dates.length) return { specs: [], sheets: [] }

  const serbia = layout === 'serbia-analytics'
  const plotId =
    String(payload.location.fieldName || payload.location.fieldKey || 'AOI')
      .replace(/^AOI\s*:\s*/i, '')
      .replace(/^[^:]{1,40}:\s*/, '')
      .trim() || 'AOI'
  const used = new Set(wb.worksheets.map(w => w.name.toLowerCase()))
  const specs: MeteoNativeChartSpec[] = []
  const sheets: Array<{ layerId: string; sheetName: string; lastDataRow: number }> = []

  for (const series of layers) {
    const sheetName = safeSheetName(`${series.layerId} Data`, used)
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 }] })
    ws.getCell('A1').value = `${plotId} - ${series.layerId} chart data (native Excel charts below)`
    ws.getCell('A1').font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
    ws.mergeCells('A1:E1')

    const h = ws.getRow(2)
    h.values = ['Period', series.layerId, '', 'Band', 'Count']
    styleTableHeader(h)

    dates.forEach((date, i) => {
      const v = series.values[i]
      const row = ws.getRow(3 + i)
      row.values = [
        date,
        v != null && Number.isFinite(v) ? Number(Number(v).toFixed(4)) : null,
        '',
        '',
        '',
      ]
      styleDataRow(row, i % 2 === 1)
      if (typeof row.getCell(2).value === 'number') row.getCell(2).numFmt = '0.0000'
    })

    const last = 2 + dates.length
    const bands = countLayerValueBands(series.layerId, series.values)
    const bandStart = last + 3
    ws.getCell(bandStart - 1, 4).value = 'Value distribution (pie source)'
    ws.getCell(bandStart - 1, 4).font = { bold: true, size: 9, color: { argb: BRAND_DARK } }
    bands.forEach(([label, count], i) => {
      const row = ws.getRow(bandStart + i)
      row.values = ['', '', '', label, count]
      styleDataRow(row, i % 2 === 1)
    })
    const bandLast = bandStart + Math.max(0, bands.length - 1)

    ws.getColumn(1).width = 14
    ws.getColumn(2).width = 14
    ws.getColumn(4).width = 22
    ws.getColumn(5).width = 10

    const noteRow = bandLast + 2
    ws.getCell(noteRow, 1).value = serbia
      ? `${series.layerId} chart data — native Excel line charts on the Charts sheet.`
      : `Native Excel charts for ${series.layerId}: line + bar trends and value-band pie (editable OOXML — not images).`
    ws.getCell(noteRow, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
    ws.mergeCells(noteRow, 1, noteRow, 5)

    if (!serbia) {
      const chartBaseRow = noteRow + 1
      const q = (col: string, r1: number, r2: number) => `'${sheetName}'!$${col}$${r1}:$${col}$${r2}`

      specs.push({
        title: `${series.layerId} Trend (Line)`,
        kind: 'line',
        sectionLabel: series.layerId,
        anchorRow: chartBaseRow,
        anchorCol: 0,
        legendPos: 'r',
        varyColors: false,
        smooth: true,
        targetSheet: sheetName,
        series: [
          {
            name: series.layerId,
            valuesRef: q('B', 3, last),
            catsRef: q('A', 3, last),
          },
        ],
      })

      specs.push({
        title: `${series.layerId} Trend (Bar)`,
        kind: 'bar',
        barDir: 'col',
        sectionLabel: series.layerId,
        anchorRow: chartBaseRow,
        anchorCol: 8,
        legendPos: 'b',
        varyColors: false,
        targetSheet: sheetName,
        series: [
          {
            name: series.layerId,
            valuesRef: q('B', 3, last),
            catsRef: q('A', 3, last),
          },
        ],
      })

      if (bands.length) {
        specs.push({
          title: `${series.layerId} Value Distribution`,
          kind: 'pie',
          sectionLabel: series.layerId,
          anchorRow: chartBaseRow + 18,
          anchorCol: 0,
          legendPos: 'r',
          varyColors: true,
          targetSheet: sheetName,
          series: [
            {
              name: 'Periods',
              valuesRef: q('E', bandStart, bandLast),
              catsRef: q('D', bandStart, bandLast),
            },
          ],
        })
      }
    }

    sheets.push({ layerId: series.layerId, sheetName, lastDataRow: last })
  }

  return { specs, sheets }
}

function buildCorrelationChartSpecs(
  wb: ExcelJS.Workbook,
  payload: TimeSeriesReportPayload,
): MeteoNativeChartSpec[] {
  const blocks = payload.correlationBlocks ?? []
  if (!blocks.length) return []

  const used = new Set(wb.worksheets.map(w => w.name.toLowerCase()))
  const sheetName = safeSheetName('Correlation Data', used)
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.getCell('A1').value = 'Index correlation scatter data (native Excel charts on Charts sheet)'
  ws.getCell('A1').font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  ws.mergeCells('A1:E1')

  const specs: MeteoNativeChartSpec[] = []
  let row = 3

  blocks.forEach((block, blockIdx) => {
    if (!block.points.length) return
    const title = `${block.xLayerId} vs ${block.yLayerId}`
    ws.getCell(row, 1).value = title
    ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
    ws.mergeCells(row, 1, row, 5)
    row += 1

    const headerRow = row
    ws.getRow(headerRow).values = ['Period', block.xLayerId, block.yLayerId, 'R²', 'N']
    styleTableHeader(ws.getRow(headerRow))
    row += 1

    const dataStart = row
    block.points.forEach((pt, i) => {
      const r = ws.getRow(dataStart + i)
      r.values = [pt.date, pt.x, pt.y, i === 0 ? block.r2 : '', i === 0 ? block.n : '']
      styleDataRow(r, i % 2 === 1)
      if (typeof r.getCell(2).value === 'number') r.getCell(2).numFmt = '0.0000'
      if (typeof r.getCell(3).value === 'number') r.getCell(3).numFmt = '0.0000'
    })
    const dataEnd = dataStart + block.points.length - 1
    row = dataEnd + 3

    const q = (col: string, r1: number, r2: number) => `'${sheetName}'!$${col}$${r1}:$${col}$${r2}`
    specs.push({
      title: `${title} (Scatter)`,
      kind: 'scatter',
      sectionLabel: 'Correlation',
      anchorRow: dataEnd + 3,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: false,
      targetSheet: sheetName,
      series: [
        {
          name: title,
          xValuesRef: q('B', dataStart, dataEnd),
          valuesRef: q('C', dataStart, dataEnd),
          catsRef: q('A', dataStart, dataEnd),
        },
      ],
    })
  })

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 12
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 8
  ws.getColumn(5).width = 6

  return specs
}

function buildVegetationCoverageTimelineSheet(
  wb: ExcelJS.Workbook,
  timeline: VegetationCoveragePoint[],
  payload: TimeSeriesReportPayload,
): void {
  const ws = wb.addWorksheet('Vegetation Coverage Timeline', {
    views: [{ showGridLines: true }],
  })
  const lastCol = 16
  ws.columns = [
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 28 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
  ]

  ws.getCell('A1').value = 'Vegetation Coverage Timeline - Per Acquisition Date'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells(1, 1, 1, lastCol)

  ws.getCell('A2').value =
    `${payload.location.fieldName} - AOI ${fmtHa(payload.location.areaHa)} - NDVI classification (Healthy / Moderate / Stress = Vegetation; Critical = Bare)`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, lastCol)

  const header = ws.getRow(4)
  header.values = [
    'Date',
    'NDVI Mean',
    'Vegetation Coverage %',
    'Vegetation Area (ha)',
    'AOI Area (ha)',
    'Dominant Class',
    'Trend',
    'Class distribution (%)',
    'Healthy (ha)',
    'Healthy (m2)',
    'Moderate (ha)',
    'Moderate (m2)',
    'Stressed (ha)',
    'Stressed (m2)',
    'Bare (ha)',
    'Bare (m2)',
  ]
  styleTableHeader(header)

  if (!timeline.length) {
    ws.getCell(5, 1).value =
      'No per-date coverage rows - ensure an AOI is selected and NDVI observations exist in the analysis period.'
    ws.getCell(5, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
    ws.mergeCells(5, 1, 5, lastCol)
    return
  }

  timeline.forEach((p, i) => {
    const r = ws.getRow(5 + i)
    r.values = [
      p.date,
      p.ndviMean != null ? fmtNum(p.ndviMean, 4) : '-',
      Number(p.vegetationCoveragePct.toFixed(1)),
      Number(p.vegetationAreaHa.toFixed(p.vegetationAreaHa >= 100 ? 1 : 2)),
      Number(p.aoiAreaHa.toFixed(p.aoiAreaHa >= 100 ? 1 : 2)),
      p.dominantClass,
      p.trend,
      formatClassDistributionPct(p.classes),
      ...vegClassAreaColumns(p.classes),
    ]
    styleDataRow(r, i % 2 === 1)
    r.getCell(3).numFmt = '0.0"%"'
  })

  const noteRow = 5 + timeline.length + 2
  ws.getCell(noteRow, 1).value =
    'Each row is computed independently for that satellite acquisition date on the active AOI (not a static field average). Class distribution area columns report per-tier totals in hectares and square metres. Histogram-enriched scenes use Sentinel Hub NDVI class areas when available; other dates use NDVI zonal/mean classification estimates.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, lastCol)
}

function buildEstimatedWaterLossTimelineSheet(
  wb: ExcelJS.Workbook,
  timeline: EstimatedWaterLossPoint[],
  payload: TimeSeriesReportPayload,
): MeteoNativeChartSpec[] {
  const sheetName = 'Estimated Water Loss Timeline'
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  })
  const lastCol = 14
  ws.columns = [
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ]

  ws.getCell('A1').value = 'Estimated Water Loss Timeline - Per Acquisition Date'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells(1, 1, 1, lastCol)

  ws.getCell('A2').value =
    `${payload.location.fieldName} - AOI ${fmtHa(payload.location.areaHa)} - Moisture Score = 0.6xNDMI + 0.4xNDWI - Index ET proxy ${WATER_LOSS_INDEX_ET_REF_MM} mm/day - Volume = ET x Area(ha) x 10`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, lastCol)

  const header = ws.getRow(4)
  header.values = [
    'Acquisition Date',
    'Estimated Water Loss Index (%)',
    'Estimated Water Loss (m3/day)',
    'Estimated Water Loss (m3/ha/day)',
    'NDMI',
    'NDWI',
    'Vegetation Coverage (%)',
    'Vegetation Area (ha)',
    'Water Stress Level',
    'Trend',
    'Source',
    'Water Loss Index %',
    'Loss (m3/day)',
    'Loss (m3/ha/day)',
  ]
  styleTableHeader(header)

  if (!timeline.length) {
    ws.getCell(5, 1).value =
      'No per-date water loss rows - ensure an AOI is selected and NDMI/NDWI observations (or ET) exist for the analysis period.'
    ws.getCell(5, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
    ws.mergeCells(5, 1, 5, lastCol)
    return []
  }

  timeline.forEach((p, i) => {
    const r = ws.getRow(5 + i)
    const indexPct = Number(p.waterLossIndexPct.toFixed(1))
    const lossM3Day = Number(p.waterLossM3Day.toFixed(1))
    const lossM3HaDay = Number(p.waterLossM3HaDay.toFixed(2))
    r.values = [
      p.date,
      indexPct,
      lossM3Day,
      lossM3HaDay,
      p.ndmi != null ? fmtNum(p.ndmi, 4) : '-',
      p.ndwi != null ? `${fmtNum(p.ndwi, 4)}${p.ndwiEstimated ? ' (est.)' : ''}` : '-',
      Number(p.vegetationCoveragePct.toFixed(1)),
      Number(p.vegetationAreaHa.toFixed(p.vegetationAreaHa >= 100 ? 1 : 2)),
      p.waterStressLevel,
      p.trend,
      p.source === 'et' ? 'ET' : 'Satellite index',
      indexPct,
      lossM3Day,
      lossM3HaDay,
    ]
    styleDataRow(r, i % 2 === 1)
    if (p.highWaterLoss) {
      r.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: p.waterStressLevel === 'Critical' ? 'FFFECACA' : 'FFFFEDD5' },
        }
        if (cell.col === 9) {
          cell.font = { bold: true, color: { argb: p.waterStressLevel === 'Critical' ? 'FF991B1B' : 'FF9A3412' } }
        }
      })
    }
    r.getCell(2).numFmt = '0.0"%"'
    r.getCell(7).numFmt = '0.0"%"'
    r.getCell(12).numFmt = '0.0"%"'
    if (typeof r.getCell(13).value === 'number') r.getCell(13).numFmt = '0.0'
    if (typeof r.getCell(14).value === 'number') r.getCell(14).numFmt = '0.00'
  })

  const noteRow = 5 + timeline.length + 2
  ws.getCell(noteRow, 1).value =
    'Each row uses Water Loss (%) = (1 − ETa/ETc) × 100. ETc = Kc × ET0 (mm/day). ETa = WaPOR/satellite AET when available, else ETc × moisture consumption ratio from NDMI/NDWI. Loss (m³/day) = max(0, ETc − ETa) × Area(ha) × 10.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, lastCol)

  const dataStart = 5
  const dataEnd = dataStart + timeline.length - 1
  const q = (col: string) => `'${sheetName}'!$${col}$${dataStart}:$${col}$${dataEnd}`
  const chartAnchorRow = noteRow + 2

  ws.getCell(chartAnchorRow, 1).value = 'Estimated Water Loss Timeline (native Excel chart)'
  ws.getCell(chartAnchorRow, 1).font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  ws.mergeCells(chartAnchorRow, 1, chartAnchorRow, 8)

  return [
    {
      title: 'Estimated Water Loss Timeline',
      kind: 'line',
      sectionLabel: 'Water Loss',
      anchorRow: chartAnchorRow + 1,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: true,
      smooth: true,
      targetSheet: sheetName,
      series: [
        {
          name: 'Water Loss Index %',
          valuesRef: q('L'),
          catsRef: q('A'),
        },
        {
          name: 'Loss (m3/day)',
          valuesRef: q('M'),
          catsRef: q('A'),
        },
        {
          name: 'Loss (m3/ha/day)',
          valuesRef: q('N'),
          catsRef: q('A'),
        },
      ],
    },
  ]
}

function buildEstimatedYieldTimelineSheet(
  wb: ExcelJS.Workbook,
  timeline: EstimatedYieldPoint[],
  payload: TimeSeriesReportPayload,
): void {
  const ws = wb.addWorksheet('Estimated Yield (t-ha)', {
    views: [{ showGridLines: true }],
  })
  const lastCol = 12
  ws.columns = [
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 48 },
    { width: 40 },
  ]

  ws.getCell('A1').value = 'Estimated Yield (t/ha) - Composite NDVI / NDMI / NDRE'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells(1, 1, 1, lastCol)

  ws.getCell('A2').value =
    `${payload.location.fieldName} - AOI ${fmtHa(payload.location.areaHa)} - Yield Factor = 0.5xNDVI + 0.3xNDMI + 0.2xNDRE - Estimated Yield = MaxYield x Factor - Total Production = Yield (t/ha) x Area (ha) - Max potato yield ${DEFAULT_POTATO_MAX_YIELD_T_HA} t/ha`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, lastCol)

  const latest = latestEstimatedYieldSummary(timeline)
  const primary = payload.primaryInterpretation
  let row = 4
  if (latest) {
    ws.getCell(row, 1).value = 'Latest scene summary'
    styleSection(ws.getCell(row, 1))
    ws.mergeCells(row, 1, row, 4)
    row++
    const summaryRows: Array<[string, string | number]> = [
      ['Acquisition Date', latest.date],
      ['NDVI / NDMI / NDRE', `${latest.ndvi.toFixed(3)} / ${latest.ndmi.toFixed(3)} / ${latest.ndre.toFixed(3)}`],
      ['Yield Factor', Number(latest.yieldFactor.toFixed(3))],
      ['Estimated Yield (t/ha)', Number(latest.estimatedYieldTHa.toFixed(1))],
      ['Total Production (tons)', Number(latest.totalProductionTons.toFixed(0))],
      ['Yield class', latest.yieldClass],
      ['Max yield / crop', `${latest.maxYieldTHa} t/ha (${latest.cropLabel})`],
    ]
    if (primary?.meanLabel) {
      summaryRows.push(['Index interpretation', `${primary.layerId}: ${primary.meanLabel}`])
    }
    for (const [label, value] of summaryRows) {
      ws.getCell(row, 1).value = label
      ws.getCell(row, 1).font = { size: 9, color: { argb: MUTED } }
      ws.getCell(row, 2).value = value
      ws.getCell(row, 2).font = { size: 10, color: { argb: INK }, bold: true }
      ws.mergeCells(row, 2, row, 6)
      row++
    }
    if (latest.interpretation) {
      ws.getCell(row, 1).value = 'Interpretation'
      ws.getCell(row, 1).font = { size: 9, color: { argb: MUTED } }
      ws.getCell(row, 2).value = latest.interpretation
      ws.getCell(row, 2).alignment = { wrapText: true }
      ws.getCell(row, 2).font = { size: 9, color: { argb: INK } }
      ws.mergeCells(row, 2, row, lastCol)
      ws.getRow(row).height = 36
      row++
    }
    if (latest.recommendations) {
      ws.getCell(row, 1).value = 'Recommendations'
      ws.getCell(row, 1).font = { size: 9, color: { argb: MUTED } }
      ws.getCell(row, 2).value = latest.recommendations
      ws.getCell(row, 2).alignment = { wrapText: true }
      ws.getCell(row, 2).font = { size: 9, color: { argb: INK } }
      ws.mergeCells(row, 2, row, lastCol)
      ws.getRow(row).height = 28
      row++
    }
    row++
  }

  ws.getCell(row, 1).value = 'Per-acquisition yield timeline'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 4)
  row++

  const header = ws.getRow(row)
  header.values = [
    'Acquisition Date',
    'NDVI',
    'NDMI',
    'NDRE',
    'Yield Factor',
    'Estimated Yield (t/ha)',
    'Total Production (tons)',
    'Area (ha)',
    'Max Yield (t/ha)',
    'Yield Class',
    'Interpretation',
    'Recommendations',
  ]
  styleTableHeader(header)
  const dataStart = row + 1

  if (!timeline.length) {
    ws.getCell(dataStart, 1).value =
      'No estimated yield rows - ensure an AOI is selected and NDVI, NDMI, and NDRE means exist for acquisition dates.'
    ws.getCell(dataStart, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
    ws.mergeCells(dataStart, 1, dataStart, lastCol)
    return
  }

  timeline.forEach((p, i) => {
    const r = ws.getRow(dataStart + i)
    r.values = [
      p.date,
      Number(p.ndvi.toFixed(4)),
      Number(p.ndmi.toFixed(4)),
      Number(p.ndre.toFixed(4)),
      Number(p.yieldFactor.toFixed(4)),
      Number(p.estimatedYieldTHa.toFixed(2)),
      Number(p.totalProductionTons.toFixed(1)),
      Number(p.areaHa.toFixed(p.areaHa >= 100 ? 1 : 2)),
      p.maxYieldTHa,
      p.yieldClass,
      p.interpretation,
      p.recommendations,
    ]
    styleDataRow(r, i % 2 === 1)
    r.getCell(11).alignment = { wrapText: true, vertical: 'top' }
    r.getCell(12).alignment = { wrapText: true, vertical: 'top' }
    r.height = Math.min(72, 18 + Math.ceil(p.interpretation.length / 70) * 12)
    if (p.yieldClass === 'Low') {
      r.getCell(10).font = { bold: true, color: { argb: 'FF991B1B' } }
      r.getCell(10).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFECACA' },
      }
    } else if (p.yieldClass === 'High') {
      r.getCell(10).font = { bold: true, color: { argb: 'FF065F46' } }
      r.getCell(10).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD1FAE5' },
      }
    }
  })

  const noteRow = dataStart + timeline.length + 2
  ws.getCell(noteRow, 1).value =
    'Yield Factor = 0.5xNDVI + 0.3xNDMI + 0.2xNDRE. Estimated Yield (t/ha) = MaxYield x Yield Factor. Total Production (tons) = Estimated Yield (t/ha) x Area (ha). Interpretation blends the composite yield result with index interpretation (vigor / coverage / recommended actions) for the analysis AOI.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 8, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, lastCol)
}

export async function buildTimeSeriesReportWorkbook(
  payload: TimeSeriesReportPayload,
  layout: WorkbookLayout = 'serbia-analytics',
): Promise<{ wb: ExcelJS.Workbook; chartSpecs: MeteoNativeChartSpec[] }> {
  const wb = new ExcelJS.Workbook()
  wb.creator = payload.projectName
  wb.created = new Date()
  const serbia = layout === 'serbia-analytics'

  buildDashboardSheet(wb, payload)
  buildDataSheet(wb, payload, layout)
  const { specs: layerSheetSpecs, sheets: layerDataSheets } = buildPerLayerChartDataSheetsWithMeta(
    wb,
    payload,
    layout,
  )
  const correlationSpecs = serbia ? [] : buildCorrelationChartSpecs(wb, payload)
  if (!serbia) {
    buildVegetationCoverageTimelineSheet(wb, payload.vegetationCoverageTimeline ?? [], payload)
  }
  const waterLossTimeline = payload.estimatedWaterLossTimeline ?? []
  const waterLossChartSpecs = buildEstimatedWaterLossTimelineSheet(wb, waterLossTimeline, payload)
  buildEstimatedYieldTimelineSheet(wb, payload.estimatedYieldTimeline ?? [], payload)
  buildAnalysisSheet(wb, payload)
  buildMapSnapshotsSheet(wb, payload.mapSnapshotGroups, {
    sheetName: serbia ? 'Map Snapshot' : 'Map Snapshots',
  })

  const chartsSpecs = buildChartsSheetNative(wb, payload, layerDataSheets, layout)
  const obs = observationCount(payload)
  const tsRows = Math.max(
    obs,
    payload.charts.labels.filter((_, i) =>
      payload.charts.series.some(s => {
        const v = s.values[i]
        return v != null && Number.isFinite(v)
      }),
    ).length,
  )
  buildSummarySheet(wb, payload, {
    observationCount: obs,
    timeSeriesDataRows: tsRows,
    waterLossDataRows: Math.max(waterLossTimeline.length, 1),
  })

  if (serbia) {
    reorderWorksheets(wb, SERBIA_ANALYTICS_SHEET_ORDER)
  }

  const chartSpecs = serbia
    ? chartsSpecs
    : [...layerSheetSpecs, ...correlationSpecs, ...waterLossChartSpecs]

  return { wb, chartSpecs }
}

export function buildTimeSeriesReportWorkbookSync(
  payload: TimeSeriesReportPayload,
  layout: WorkbookLayout = 'serbia-analytics',
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = payload.projectName
  wb.created = new Date()
  const serbia = layout === 'serbia-analytics'

  buildDashboardSheet(wb, payload)
  buildDataSheet(wb, payload, layout)
  const { sheets: layerDataSheets } = buildPerLayerChartDataSheetsWithMeta(wb, payload, layout)
  if (!serbia) {
    buildVegetationCoverageTimelineSheet(wb, payload.vegetationCoverageTimeline ?? [], payload)
  }
  buildEstimatedWaterLossTimelineSheet(wb, payload.estimatedWaterLossTimeline ?? [], payload)
  buildEstimatedYieldTimelineSheet(wb, payload.estimatedYieldTimeline ?? [], payload)
  buildAnalysisSheet(wb, payload)
  buildMapSnapshotsSheet(wb, payload.mapSnapshotGroups, {
    sheetName: serbia ? 'Map Snapshot' : 'Map Snapshots',
  })
  if (serbia) {
    buildChartsSheetNative(wb, payload, layerDataSheets, layout)
  }
  buildSummarySheet(wb, payload, {
    observationCount: observationCount(payload),
    timeSeriesDataRows: Math.max(1, payload.charts.labels.length),
    waterLossDataRows: Math.max((payload.estimatedWaterLossTimeline ?? []).length, 1),
  })
  if (serbia) {
    reorderWorksheets(wb, SERBIA_ANALYTICS_SHEET_ORDER)
  }
  return wb
}

/** Build the Analytics Report workbook blob (no browser download). */
export async function buildTimeSeriesReportExcelBlob(
  payload: TimeSeriesReportPayload,
): Promise<Blob> {
  const { injectNativeMeteoCharts } = await import('../weatherClimateReport/meteoNativeExcelCharts')
  const { wb, chartSpecs } = await buildTimeSeriesReportWorkbook(payload)

  const raw = await wb.xlsx.writeBuffer()
  const withCharts =
    chartSpecs.length > 0
      ? await injectNativeMeteoCharts(raw as ArrayBuffer, chartSpecs, 'Charts')
      : raw
  return new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function generateTimeSeriesReportExcel(
  payload: TimeSeriesReportPayload,
  options?: GenerateTimeSeriesReportExcelOptions,
): Promise<void> {
  const blob = await buildTimeSeriesReportExcelBlob(payload)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = options?.filename
    ? sanitizeTimeSeriesReportExcelFilename(options.filename)
    : DEFAULT_ANALYTICS_REPORT_XLSX
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Excel workbook with chart-timeline data from the Word Intelligence Report.
 * One sheet per index only (Date + NDVI, Date + NDMI, ...) - no combined multi-index table.
 */
export async function exportTimeSeriesChartTimelineExcel(
  payload: TimeSeriesReportPayload,
): Promise<void> {
  const { injectNativeMeteoCharts } = await import('../weatherClimateReport/meteoNativeExcelCharts')
  type ChartSpec = import('../weatherClimateReport/meteoNativeExcelCharts').MeteoNativeChartSpec

  const layers = resolveSelectedChartSeries(payload)
  const dates = chartTimelineDates(payload)
  const plotId =
    String(payload.location.fieldName || payload.location.fieldKey || 'AOI')
      .replace(/^AOI\s*:\s*/i, '')
      .replace(/^[^:]{1,40}:\s*/, '')
      .trim() || 'AOI'

  const wb = new ExcelJS.Workbook()
  wb.creator = payload.projectName || 'AgroCloud'
  wb.created = new Date()
  wb.title = 'Chart Timeline Data'

  const used = new Set<string>()
  const chartSpecs: ChartSpec[] = []
  const layerIds = layers.map(s => s.layerId)
  let firstTrendSheet = ''

  // One sheet per index: Date | NDVI  (or NDMI / NDWI / SAVI ...)
  for (const series of layers) {
    const id = series.layerId
    const sheetName = safeSheetName(id, used)
    if (!firstTrendSheet) firstTrendSheet = sheetName
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 }] })
    ws.getCell('A1').value = plotId
    ws.getCell('A1').font = { bold: true, size: 12, color: { argb: BRAND_DARK } }
    const h = ws.getRow(2)
    h.values = ['Date', id]
    styleTableHeader(h)
    dates.forEach((date, i) => {
      const v = series.values[i]
      const row = ws.getRow(3 + i)
      row.values = [
        date,
        v != null && Number.isFinite(v) ? Number(Number(v).toFixed(4)) : null,
      ]
      styleDataRow(row, i % 2 === 1)
      if (typeof row.getCell(2).value === 'number') row.getCell(2).numFmt = '0.0000'
    })
    ws.getColumn(1).width = 14
    ws.getColumn(2).width = 12

    const last = 2 + dates.length
    if (dates.length) {
      chartSpecs.push({
        title: `${id} Trend`,
        kind: 'line',
        sectionLabel: id,
        anchorRow: Math.max(dates.length + 4, 6),
        anchorCol: 0,
        legendPos: 'r',
        varyColors: false,
        smooth: true,
        targetSheet: sheetName,
        series: [
          {
            name: id,
            valuesRef: `'${sheetName}'!$B$3:$B$${last}`,
            catsRef: `'${sheetName}'!$A$3:$A$${last}`,
          },
        ],
      })
    }
  }

  const metaName = safeSheetName('Summary', used)
  const meta = wb.addWorksheet(metaName)
  meta.addRow(['Property', 'Value'])
  styleTableHeader(meta.getRow(1))
  const metaRows: Array<[string, string | number]> = [
    ['Export', 'Chart Timeline Data - one sheet per index'],
    ['Field / Plot', plotId],
    ['Field Key', payload.location.fieldKey],
    ['Date Range', `${payload.period.from} -> ${payload.period.to}`],
    ['Indices', layerIds.join(', ') || '-'],
    ['Observations', dates.length],
    ['Generated At', payload.generatedAt],
  ]
  metaRows.forEach(([k, v]) => {
    const r = meta.addRow([k, v])
    r.getCell(1).font = { bold: true, size: 9 }
  })
  meta.getColumn(1).width = 22
  meta.getColumn(2).width = 48

  const raw = await wb.xlsx.writeBuffer()
  const withCharts = await injectNativeMeteoCharts(
    raw as ArrayBuffer,
    chartSpecs,
    firstTrendSheet || metaName,
  )
  const blob = new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = plotId.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'AOI'
  a.download = `Chart_Timeline_${slug}_${payload.period.from}_${payload.period.to}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** @deprecated Use exportTimeSeriesChartTimelineExcel - kept as alias for Summary Table menu item. */
export async function exportTimeSeriesCsvReport(payload: TimeSeriesReportPayload): Promise<void> {
  await exportTimeSeriesChartTimelineExcel(payload)
}
