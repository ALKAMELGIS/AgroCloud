import ExcelJS from 'exceljs'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  injectNativeMeteoCharts,
  type MeteoNativeChartSpec,
} from '../weatherClimateReport/meteoNativeExcelCharts'
import {
  AOI_EXCEL_NO_DATA,
  cleanAoiPlotDisplayId,
  collectMasterAcquisitionDates,
  excelMissing,
  excelSafeText,
  looksLikeLayerFileId,
} from './aoiExcelExportShared'
import { fetchPlotTimeSeriesDailyByField } from './fetchPlotTimeSeriesAnalytics'
import { excelSheetNameFromPlotId } from './generateAoiPlotRawTimeSeriesExcel'

const HEADER = 'FF065F46'
const ALT = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'
const KPI = 'FFECFDF5'
const WARN = 'FFFEF3C7'
const BAD = 'FFFEE2E2'
const GOOD = 'FFD1FAE5'

const RESERVED_SHEETS = new Set(
  [
    'summary_dashboard',
    'all_plots_raw',
    'pivot_ndvi_trend',
    'pivot_index_summary',
    'pivot_date_statistics',
    'pivot_stress_analysis',
    'pivot_ranking',
    'charts_dashboard',
  ].map(s => s.toLowerCase()),
)

export type AoiRawDataByLayerExportInput = {
  plots: CropAlertFieldInput[]
  layerIds: string[]
  fromDate: string
  toDate: string
  farmName?: string
  aoiName?: string
  plotNameField?: string
  dataSource?: string
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export type AoiVegetationStatus = 'Healthy' | 'Moderate' | 'Stress' | 'Unknown'

export type AoiPlotObservation = {
  date: string
  plotId: string
  fieldKey: string
  areaHa: number | null
  values: Record<string, number | null>
}

export type AoiPlotAggregate = {
  plotId: string
  fieldKey: string
  areaHa: number | null
  means: Record<string, number | null>
  firstNdvi: number | null
  lastNdvi: number | null
  firstNdmi: number | null
  lastNdmi: number | null
  status: AoiVegetationStatus
  healthScore: number
  alert: 'GREEN' | 'AMBER' | 'RED' | '-'
  priority: 'Low' | 'Medium' | 'Inspection Required'
  ndviChange: number | null
  ndmiChange: number | null
}

function slug(s: string): string {
  return (
    String(s || 'AOI')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'AOI'
  )
}

function yyyymmdd(iso: string): string {
  return (iso || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
}

function num(v: number | null | undefined, digits = 4): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Number(v.toFixed(digits))
}

function meanOf(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function minOf(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!xs.length) return null
  return Math.min(...xs)
}

function maxOf(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!xs.length) return null
  return Math.max(...xs)
}

/** Strip common AOI layer prefixes for cleaner Plot_T-32 sheet / column names. */
export { cleanAoiPlotDisplayId } from './aoiExcelExportShared'

export function plotDisplayIdForExport(plot: CropAlertFieldInput): string {
  const name = cleanAoiPlotDisplayId(String(plot.farmName || '').trim())
  if (name && !looksLikeLayerFileId(name) && name !== 'Plot') return name
  const oid = cleanAoiPlotDisplayId(String(plot.objectId || '').trim())
  if (oid && !looksLikeLayerFileId(oid) && oid !== 'Plot') return oid
  return 'Plot'
}

export function classifyAoiVegetationStatus(
  ndvi: number | null,
  ndmi: number | null,
): AoiVegetationStatus {
  if (ndvi == null || !Number.isFinite(ndvi)) return 'Unknown'
  if (ndvi > 0.6 && (ndmi == null || ndmi > 0)) return 'Healthy'
  if (ndvi < 0.4 && (ndmi == null || ndmi < -0.2)) return 'Stress'
  if (ndvi >= 0.4 && ndvi <= 0.6) return 'Moderate'
  if (ndvi > 0.6) return 'Healthy'
  if (ndvi < 0.4) return 'Stress'
  return 'Moderate'
}

export function aoiHealthScore(input: {
  ndvi?: number | null
  ndmi?: number | null
  savi?: number | null
  ndwi?: number | null
}): number {
  const ndvi =
    input.ndvi != null && Number.isFinite(input.ndvi) ? Math.max(0, Math.min(1, input.ndvi)) : 0.35
  const ndmi =
    input.ndmi != null && Number.isFinite(input.ndmi)
      ? Math.max(0, Math.min(1, (input.ndmi + 0.4) / 0.8))
      : 0.45
  const savi =
    input.savi != null && Number.isFinite(input.savi) ? Math.max(0, Math.min(1, input.savi)) : ndvi
  const ndwi =
    input.ndwi != null && Number.isFinite(input.ndwi)
      ? Math.max(0, Math.min(1, (input.ndwi + 0.3) / 0.8))
      : 0.4
  // Health Score = 0.4·NDVI + 0.25·NDMI + 0.20·SAVI + 0.15·NDWI
  return Number((0.4 * ndvi + 0.25 * ndmi + 0.2 * savi + 0.15 * ndwi).toFixed(3))
}

function statusAlert(status: AoiVegetationStatus): AoiPlotAggregate['alert'] {
  if (status === 'Healthy') return 'GREEN'
  if (status === 'Moderate') return 'AMBER'
  if (status === 'Stress') return 'RED'
  return '-'
}

function statusPriority(status: AoiVegetationStatus): AoiPlotAggregate['priority'] {
  if (status === 'Stress') return 'Inspection Required'
  if (status === 'Moderate') return 'Medium'
  if (status === 'Healthy') return 'Low'
  return 'Medium'
}

function plotAreaHa(plot: CropAlertFieldInput): number | null {
  if (!plot.geometry) return null
  const m2 = geodesicAreaM2(plot.geometry)
  if (!Number.isFinite(m2) || m2 <= 0) return null
  return Number((m2 / 10_000).toFixed(3))
}

function dailyRowsInRange(
  rows: SentinelHubDailyIndexMeans[],
  fromDate: string,
  toDate: string,
): SentinelHubDailyIndexMeans[] {
  const from = fromDate.slice(0, 10)
  const to = toDate.slice(0, 10)
  const byDate = new Map<string, SentinelHubDailyIndexMeans>()
  for (const row of rows) {
    const d = String(row.date || '').trim().slice(0, 10)
    if (!d || d < from || d > to) continue
    const prev = byDate.get(d)
    if (!prev) {
      byDate.set(d, { ...row, date: d })
      continue
    }
    byDate.set(d, {
      date: d,
      ndvi: prev.ndvi ?? row.ndvi,
      ndwi: prev.ndwi ?? row.ndwi,
      ndmi: prev.ndmi ?? row.ndmi,
      evi: prev.evi ?? row.evi,
      savi: prev.savi ?? row.savi,
      ciRe: prev.ciRe ?? row.ciRe,
      ndsi: prev.ndsi ?? row.ndsi,
      si: prev.si ?? row.si,
      ssi: prev.ssi ?? row.ssi,
      ndre: prev.ndre ?? row.ndre,
      zonal: prev.zonal ?? row.zonal,
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 22): void {
  const colCount = ws.columnCount || 4
  for (let c = 1; c <= colCount; c++) {
    let width = min
    ws.eachRow({ includeEmpty: false }, row => {
      const text = String(row.getCell(c).value ?? '')
      width = Math.min(max, Math.max(width, text.length + 2))
    })
    ws.getColumn(c).width = width
  }
}

function fillAlt(row: ExcelJS.Row, even: boolean): void {
  if (!even) return
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
  })
}

function statusFill(status: AoiVegetationStatus): string {
  if (status === 'Healthy') return GOOD
  if (status === 'Moderate') return WARN
  if (status === 'Stress') return BAD
  return ALT
}

export function buildAoiRawObservations(
  plots: CropAlertFieldInput[],
  layerIds: string[],
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>,
  fromDate: string,
  toDate: string,
): { observations: AoiPlotObservation[]; aggregates: AoiPlotAggregate[]; dates: string[] } {
  const masterDates = collectMasterAcquisitionDates(
    dailyByFieldKey.values(),
    fromDate,
    toDate,
    row =>
      layerIds.some(id => {
        const v = evaluateImageryLayerDailyValue(id, row as SentinelHubDailyIndexMeans)
        return v != null && Number.isFinite(v)
      }),
  )

  const observations: AoiPlotObservation[] = []
  const aggregates: AoiPlotAggregate[] = []

  for (const plot of plots) {
    const plotId = plotDisplayIdForExport(plot)
    const areaHa = plotAreaHa(plot)
    const daily = dailyRowsInRange(dailyByFieldKey.get(plot.fieldKey) ?? [], fromDate, toDate)
    const byDate = new Map(daily.map(r => [r.date, r] as const))
    const seriesByLayer: Record<string, Array<number | null>> = {}
    for (const id of layerIds) seriesByLayer[id] = []

    let firstNdvi: number | null = null
    let lastNdvi: number | null = null
    let firstNdmi: number | null = null
    let lastNdmi: number | null = null

    for (const date of masterDates) {
      const row = byDate.get(date)
      const values: Record<string, number | null> = {}
      for (const layerId of layerIds) {
        const v = row ? num(evaluateImageryLayerDailyValue(layerId, row)) : null
        values[layerId] = v
        seriesByLayer[layerId]!.push(v)
      }
      observations.push({
        date,
        plotId,
        fieldKey: plot.fieldKey,
        areaHa,
        values,
      })
      const ndvi = values.NDVI ?? null
      const ndmi = values.NDMI ?? null
      if (ndvi != null) {
        if (firstNdvi == null) firstNdvi = ndvi
        lastNdvi = ndvi
      }
      if (ndmi != null) {
        if (firstNdmi == null) firstNdmi = ndmi
        lastNdmi = ndmi
      }
    }

    const means: Record<string, number | null> = {}
    for (const layerId of layerIds) {
      means[layerId] = num(meanOf(seriesByLayer[layerId] ?? []))
    }
    const status = classifyAoiVegetationStatus(means.NDVI ?? lastNdvi, means.NDMI ?? lastNdmi)
    const healthScore = aoiHealthScore({
      ndvi: means.NDVI ?? lastNdvi,
      ndmi: means.NDMI ?? lastNdmi,
      savi: means.SAVI ?? null,
      ndwi: means.NDWI ?? null,
    })
    aggregates.push({
      plotId,
      fieldKey: plot.fieldKey,
      areaHa,
      means,
      firstNdvi,
      lastNdvi,
      firstNdmi,
      lastNdmi,
      status,
      healthScore,
      alert: statusAlert(status),
      priority: statusPriority(status),
      ndviChange:
        firstNdvi != null && lastNdvi != null ? num(lastNdvi - firstNdvi) : null,
      ndmiChange:
        firstNdmi != null && lastNdmi != null ? num(lastNdmi - firstNdmi) : null,
    })
  }

  return {
    observations,
    aggregates,
    dates: masterDates,
  }
}

function writeSummaryDashboard(
  wb: ExcelJS.Workbook,
  input: AoiRawDataByLayerExportInput,
  layerIds: string[],
  aggregates: AoiPlotAggregate[],
  observationCount: number,
): void {
  const ws = wb.addWorksheet('Summary_Dashboard', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(['Summary Dashboard', 'Value'])
  styleHeaderRow(ws.getRow(1))

  const totalArea = aggregates.reduce((s, a) => s + (a.areaHa ?? 0), 0)
  const avgNdvi = meanOf(aggregates.map(a => a.means.NDVI ?? null))
  const avgNdmi = meanOf(aggregates.map(a => a.means.NDMI ?? null))
  const avgNdwi = meanOf(aggregates.map(a => a.means.NDWI ?? null))
  const healthy = aggregates.filter(a => a.status === 'Healthy').length
  const stressed = aggregates.filter(a => a.status === 'Stress').length
  const overall = classifyAoiVegetationStatus(avgNdvi, avgNdmi)

  const rows: Array<[string, string | number]> = [
    ['AOI Name', excelSafeText(input.aoiName || input.farmName || '-')],
    ['Export Date', new Date().toISOString()],
    ['Total Layers / Plots', aggregates.length],
    ['Total Area (ha)', totalArea ? Number(totalArea.toFixed(2)) : AOI_EXCEL_NO_DATA],
    ['Selected Indices', layerIds.join(', ')],
    ['Date Range', `${input.fromDate.slice(0, 10)} -> ${input.toDate.slice(0, 10)}`],
    ['Satellite Observations (rows)', observationCount],
    ['Data Source', input.dataSource || 'Sentinel-2 (Sentinel Hub zonal statistics)'],
    ['Plot name field', excelSafeText(input.plotNameField?.trim() || 'Auto (Name / ID)')],
    ['Missing values', AOI_EXCEL_NO_DATA],
    ['Average NDVI', avgNdvi != null ? Number(avgNdvi.toFixed(4)) : AOI_EXCEL_NO_DATA],
    ['Average NDMI', avgNdmi != null ? Number(avgNdmi.toFixed(4)) : AOI_EXCEL_NO_DATA],
    ['Average NDWI', avgNdwi != null ? Number(avgNdwi.toFixed(4)) : AOI_EXCEL_NO_DATA],
    ['Vegetation Health Status', overall],
    ['Number of Healthy Plots', healthy],
    ['Number of Stressed Plots', stressed],
    ['Number of Moderate Plots', aggregates.filter(a => a.status === 'Moderate').length],
  ]

  rows.forEach(([k, v], i) => {
    const r = ws.addRow([k, v])
    r.getCell(1).font = { bold: true, color: { argb: INK }, size: 9 }
    r.getCell(2).font = { color: { argb: MUTED }, size: 9 }
    if (k.startsWith('Average') || k.includes('Healthy') || k.includes('Stressed') || k === 'Vegetation Health Status') {
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI } }
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI } }
    }
    if (i % 2 === 1 && !k.startsWith('Average') && !k.includes('Plots') && k !== 'Vegetation Health Status') {
      fillAlt(r, true)
    }
  })

  autoWidth(ws, 16, 56)
}

function writeWideObservationSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  layerIds: string[],
  rows: AoiPlotObservation[],
  used: Set<string>,
): string {
  const name = sheetName.slice(0, 31)
  used.add(name.toLowerCase())
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  const headers = ['Date', 'Plot ID', ...layerIds, 'Area (ha)']
  ws.addRow(headers)
  styleHeaderRow(ws.getRow(1))

  let n = 0
  for (const obs of rows) {
    const excelRow = ws.addRow([
      obs.date,
      obs.plotId,
      ...layerIds.map(id => excelMissing(obs.values[id] ?? null)),
      obs.areaHa ?? AOI_EXCEL_NO_DATA,
    ])
    n += 1
    fillAlt(excelRow, n % 2 === 0)
    for (let c = 3; c <= 2 + layerIds.length; c++) {
      if (typeof excelRow.getCell(c).value === 'number') {
        excelRow.getCell(c).numFmt = '0.0000'
      }
    }
    if (typeof excelRow.getCell(headers.length).value === 'number') {
      excelRow.getCell(headers.length).numFmt = '0.000'
    }
  }

  if (!n) {
    const empty = ws.addRow([
      '(no clear scenes in range)',
      AOI_EXCEL_NO_DATA,
      ...layerIds.map(() => AOI_EXCEL_NO_DATA),
      AOI_EXCEL_NO_DATA,
    ])
    empty.getCell(1).font = { italic: true, color: { argb: MUTED }, size: 9 }
  }

  autoWidth(ws)
  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 16
  return name
}

function colLetter(col: number): string {
  let n = col
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function writePivotNdviTrend(
  wb: ExcelJS.Workbook,
  dates: string[],
  aggregates: AoiPlotAggregate[],
  observations: AoiPlotObservation[],
): { plotCount: number; dateCount: number } {
  const ws = wb.addWorksheet('Pivot_NDVI_Trend', { views: [{ state: 'frozen', ySplit: 1 }] })
  const plotIds = aggregates.map(a => a.plotId)
  ws.addRow(['Date', ...plotIds.map(id => `Plot_${id}`.slice(0, 28)), 'Healthy (>0.60)', 'Stress (<0.40)'])
  styleHeaderRow(ws.getRow(1))

  const byDatePlot = new Map<string, number | null>()
  for (const obs of observations) {
    byDatePlot.set(`${obs.date}||${obs.plotId}`, obs.values.NDVI ?? null)
  }

  dates.forEach((date, ri) => {
    const vals = plotIds.map(pid => byDatePlot.get(`${date}||${pid}`) ?? null)
    const row = ws.addRow([date, ...vals, 0.6, 0.4])
    fillAlt(row, ri % 2 === 1)
    for (let c = 2; c <= plotIds.length + 3; c++) row.getCell(c).numFmt = '0.0000'
  })

  autoWidth(ws, 10, 16)
  return { plotCount: plotIds.length, dateCount: dates.length }
}

function writePivotIndexSummary(
  wb: ExcelJS.Workbook,
  layerIds: string[],
  aggregates: AoiPlotAggregate[],
): { plotCount: number; indexCount: number } {
  const ws = wb.addWorksheet('Pivot_Index_Summary', { views: [{ state: 'frozen', ySplit: 1 }] })
  const meanCols = layerIds.map(id => `Mean ${id}`)
  ws.addRow(['Plot ID', ...meanCols, 'Status'])
  styleHeaderRow(ws.getRow(1))

  aggregates.forEach((agg, i) => {
    const row = ws.addRow([
      agg.plotId,
      ...layerIds.map(id => agg.means[id] ?? null),
      agg.status,
    ])
    fillAlt(row, i % 2 === 1)
    for (let c = 2; c <= 1 + layerIds.length; c++) row.getCell(c).numFmt = '0.0000'
    row.getCell(2 + layerIds.length).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusFill(agg.status) },
    }
  })
  autoWidth(ws, 12, 18)
  return { plotCount: aggregates.length, indexCount: layerIds.length }
}

function writePivotDateStatistics(
  wb: ExcelJS.Workbook,
  dates: string[],
  observations: AoiPlotObservation[],
): { dateCount: number } {
  const ws = wb.addWorksheet('Pivot_Date_Statistics', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow([
    'Date',
    'Mean NDVI',
    'Min NDVI',
    'Max NDVI',
    'Mean NDMI',
    'Mean NDWI',
    'NDVI Change %',
  ])
  styleHeaderRow(ws.getRow(1))

  let prevMean: number | null = null
  dates.forEach((date, i) => {
    const day = observations.filter(o => o.date === date)
    const ndvi = day.map(o => o.values.NDVI ?? null)
    const meanNdvi = num(meanOf(ndvi))
    let changePct: number | null = null
    if (meanNdvi != null && prevMean != null && prevMean !== 0) {
      changePct = Number((((meanNdvi - prevMean) / Math.abs(prevMean)) * 100).toFixed(2))
    }
    if (meanNdvi != null) prevMean = meanNdvi
    const row = ws.addRow([
      date,
      meanNdvi,
      num(minOf(ndvi)),
      num(maxOf(ndvi)),
      num(meanOf(day.map(o => o.values.NDMI ?? null))),
      num(meanOf(day.map(o => o.values.NDWI ?? null))),
      changePct,
    ])
    fillAlt(row, i % 2 === 1)
    for (let c = 2; c <= 6; c++) row.getCell(c).numFmt = '0.0000'
    row.getCell(7).numFmt = '0.00'
  })
  autoWidth(ws, 12, 14)
  return { dateCount: dates.length }
}

function writePivotStressAnalysis(wb: ExcelJS.Workbook, aggregates: AoiPlotAggregate[]): void {
  const ws = wb.addWorksheet('Pivot_Stress_Analysis', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(['Plot ID', 'Current Status', 'NDVI Change', 'NDMI Change', 'Alert'])
  styleHeaderRow(ws.getRow(1))
  aggregates.forEach((agg, i) => {
    const row = ws.addRow([
      agg.plotId,
      agg.status,
      agg.ndviChange,
      agg.ndmiChange,
      agg.alert,
    ])
    fillAlt(row, i % 2 === 1)
    row.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusFill(agg.status) },
    }
    row.getCell(3).numFmt = '+0.0000;-0.0000;0'
    row.getCell(4).numFmt = '+0.0000;-0.0000;0'
  })
  autoWidth(ws, 12, 18)
}

function writePivotRanking(wb: ExcelJS.Workbook, aggregates: AoiPlotAggregate[]): { plotCount: number } {
  const ws = wb.addWorksheet('Pivot_Ranking', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(['Rank', 'Plot ID', 'Health Score', 'Priority'])
  styleHeaderRow(ws.getRow(1))
  const ranked = [...aggregates].sort((a, b) => b.healthScore - a.healthScore)
  ranked.forEach((agg, i) => {
    const row = ws.addRow([i + 1, agg.plotId, agg.healthScore, agg.priority])
    fillAlt(row, i % 2 === 1)
    row.getCell(3).numFmt = '0.000'
    row.getCell(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusFill(agg.status) },
    }
  })
  autoWidth(ws, 10, 22)
  return { plotCount: ranked.length }
}

function ndviClassLabel(v: number): string {
  if (v < 0.2) return 'Bare Soil'
  if (v < 0.4) return 'Low Vegetation'
  if (v < 0.6) return 'Moderate'
  if (v < 0.8) return 'Healthy'
  return 'High Vegetation'
}

/**
 * Charts_Dashboard holds analyzed series tables + native Excel chart anchors (no PNG images).
 */
function writeChartsDashboard(
  wb: ExcelJS.Workbook,
  layerIds: string[],
  dates: string[],
  aggregates: AoiPlotAggregate[],
  observations: AoiPlotObservation[],
  sizes: {
    ndviPlots: number
    ndviDates: number
    indexPlots: number
    indexCount: number
    dateStats: number
    rankingPlots: number
  },
): MeteoNativeChartSpec[] {
  const CHARTS = 'Charts_Dashboard'
  const ws = wb.addWorksheet(CHARTS)
  ws.getCell('A1').value = 'Charts Dashboard - native Excel charts (linked to analyzed AOI data)'
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF064E3B' } }
  ws.getCell('A2').value =
    'All charts are editable OOXML objects bound to worksheet ranges - not images. Edit source tables to refresh.'
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: MUTED } }

  // --- Histogram classes (observations count per NDVI class) ---
  const classOrder = ['Bare Soil', 'Low Vegetation', 'Moderate', 'Healthy', 'High Vegetation'] as const
  const classCounts = Object.fromEntries(classOrder.map(c => [c, 0])) as Record<string, number>
  for (const obs of observations) {
    const v = obs.values.NDVI
    if (v == null || !Number.isFinite(v)) continue
    classCounts[ndviClassLabel(v)] += 1
  }
  ws.getCell('A4').value = 'NDVI Distribution (observation counts)'
  ws.getCell('A4').font = { bold: true, size: 10 }
  ws.getCell('A5').value = 'Class'
  ws.getCell('B5').value = 'Count'
  styleHeaderRow(ws.getRow(5))
  classOrder.forEach((label, i) => {
    ws.getCell(6 + i, 1).value = label
    ws.getCell(6 + i, 2).value = classCounts[label]
  })

  // --- Stress status counts ---
  const stressRows: Array<[string, number]> = [
    ['Healthy', aggregates.filter(a => a.status === 'Healthy').length],
    ['Moderate', aggregates.filter(a => a.status === 'Moderate').length],
    ['Critical', aggregates.filter(a => a.status === 'Stress').length],
  ]
  ws.getCell('A12').value = 'Stress Detection (plot counts)'
  ws.getCell('A12').font = { bold: true, size: 10 }
  ws.getCell('A13').value = 'Status'
  ws.getCell('B13').value = 'Number of Plots'
  styleHeaderRow(ws.getRow(13))
  stressRows.forEach(([label, count], i) => {
    ws.getCell(14 + i, 1).value = label
    ws.getCell(14 + i, 2).value = count
  })

  // --- Correlation points (latest mean per plot) ---
  ws.getCell('A18').value = 'Index Correlation points (per plot means)'
  ws.getCell('A18').font = { bold: true, size: 10 }
  ws.getCell('A19').value = 'Plot ID'
  ws.getCell('B19').value = 'NDMI'
  ws.getCell('C19').value = 'NDVI'
  ws.getCell('D19').value = 'NDWI'
  styleHeaderRow(ws.getRow(19))
  aggregates.forEach((agg, i) => {
    ws.getCell(20 + i, 1).value = agg.plotId
    ws.getCell(20 + i, 2).value = agg.means.NDMI ?? null
    ws.getCell(20 + i, 3).value = agg.means.NDVI ?? null
    ws.getCell(20 + i, 4).value = agg.means.NDWI ?? null
    ws.getCell(20 + i, 2).numFmt = '0.0000'
    ws.getCell(20 + i, 3).numFmt = '0.0000'
    ws.getCell(20 + i, 4).numFmt = '0.0000'
  })
  const corrEnd = 19 + Math.max(1, aggregates.length)

  // Legend / index of charts
  ws.getCell('F4').value = 'Chart catalogue'
  ws.getCell('F4').font = { bold: true }
  ;[
    '1. NDVI Time Series (line) ← Pivot_NDVI_Trend',
    '2. Multi-Index Comparison (columns) ← Pivot_Index_Summary',
    '3. NDVI Distribution (histogram)',
    '4. Stress Detection (columns)',
    '5. NDVI vs NDMI / NDWI (scatter)',
    '6. Growth Performance (area) ← Pivot_Date_Statistics',
    '7. Irrigation / Water Stress (dual axis)',
    '8. Plot Ranking (horizontal bars) ← Pivot_Ranking',
  ].forEach((t, i) => {
    ws.getCell(5 + i, 6).value = t
    ws.getCell(5 + i, 6).font = { size: 9, color: { argb: MUTED } }
  })

  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 14
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 12
  ws.getColumn(6).width = 52

  const ndviLastRow = 1 + Math.max(1, sizes.ndviDates)
  const indexLastRow = 1 + Math.max(1, sizes.indexPlots)
  const dateLastRow = 1 + Math.max(1, sizes.dateStats)
  const rankLastRow = 1 + Math.max(1, sizes.rankingPlots)
  const plotSeriesCount = Math.min(sizes.ndviPlots, 20)
  const indexSeriesCount = Math.min(sizes.indexCount, 8)

  const specs: MeteoNativeChartSpec[] = []

  // 1. NDVI trend line
  if (sizes.ndviDates > 0 && plotSeriesCount > 0) {
    specs.push({
      title: 'NDVI Time Series by Plot',
      kind: 'line',
      sectionLabel: 'NDVI Trend',
      anchorRow: 22,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: true,
      targetSheet: CHARTS,
      series: Array.from({ length: plotSeriesCount }, (_, i) => {
        const col = colLetter(i + 2)
        return {
          nameRef: `'Pivot_NDVI_Trend'!$${col}$1`,
          valuesRef: `'Pivot_NDVI_Trend'!$${col}$2:$${col}$${ndviLastRow}`,
          catsRef: `'Pivot_NDVI_Trend'!$A$2:$A$${ndviLastRow}`,
        }
      }),
    })
  }

  // 2. Multi-index comparison
  if (sizes.indexPlots > 0 && indexSeriesCount > 0) {
    specs.push({
      title: 'Multi-Index Comparison (plot means)',
      kind: 'bar',
      sectionLabel: 'Multi Index',
      anchorRow: 40,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: true,
      targetSheet: CHARTS,
      series: Array.from({ length: indexSeriesCount }, (_, i) => {
        const col = colLetter(i + 2)
        return {
          nameRef: `'Pivot_Index_Summary'!$${col}$1`,
          valuesRef: `'Pivot_Index_Summary'!$${col}$2:$${col}$${indexLastRow}`,
          catsRef: `'Pivot_Index_Summary'!$A$2:$A$${indexLastRow}`,
        }
      }),
    })
  }

  // 3. Histogram
  specs.push({
    title: 'NDVI Distribution by Class',
    kind: 'bar',
    sectionLabel: 'NDVI Histogram',
    anchorRow: 58,
    anchorCol: 0,
    legendPos: 'b',
    varyColors: true,
    targetSheet: CHARTS,
    series: [
      {
        name: 'Observations',
        valuesRef: `'${CHARTS}'!$B$6:$B$10`,
        catsRef: `'${CHARTS}'!$A$6:$A$10`,
      },
    ],
  })

  // 4. Stress detection
  specs.push({
    title: 'Stress Detection - Healthy / Moderate / Critical',
    kind: 'bar',
    sectionLabel: 'Stress',
    anchorRow: 76,
    anchorCol: 0,
    legendPos: 'b',
    varyColors: true,
    targetSheet: CHARTS,
    series: [
      {
        name: 'Number of Plots',
        valuesRef: `'${CHARTS}'!$B$14:$B$16`,
        catsRef: `'${CHARTS}'!$A$14:$A$16`,
      },
    ],
  })

  // 5. Correlation scatters
  if (aggregates.length > 0) {
    specs.push({
      title: 'NDVI vs NDMI (water stress)',
      kind: 'scatter',
      sectionLabel: 'Correlation NDMI',
      anchorRow: 94,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: false,
      targetSheet: CHARTS,
      series: [
        {
          name: 'Plots',
          valuesRef: `'${CHARTS}'!$C$20:$C$${corrEnd}`,
          catsRef: `'${CHARTS}'!$A$20:$A$${corrEnd}`,
          xValuesRef: `'${CHARTS}'!$B$20:$B$${corrEnd}`,
        },
      ],
    })
    specs.push({
      title: 'NDVI vs NDWI',
      kind: 'scatter',
      sectionLabel: 'Correlation NDWI',
      anchorRow: 94,
      anchorCol: 10,
      legendPos: 'b',
      varyColors: false,
      targetSheet: CHARTS,
      series: [
        {
          name: 'Plots',
          valuesRef: `'${CHARTS}'!$C$20:$C$${corrEnd}`,
          catsRef: `'${CHARTS}'!$A$20:$A$${corrEnd}`,
          xValuesRef: `'${CHARTS}'!$D$20:$D$${corrEnd}`,
        },
      ],
    })
  }

  // 6. Growth area (min/max/mean NDVI)
  if (sizes.dateStats > 0) {
    specs.push({
      title: 'Growth Performance - Min / Mean / Max NDVI',
      kind: 'area',
      sectionLabel: 'Growth',
      anchorRow: 112,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: true,
      targetSheet: CHARTS,
      series: [
        {
          nameRef: `'Pivot_Date_Statistics'!$C$1`,
          valuesRef: `'Pivot_Date_Statistics'!$C$2:$C$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
        {
          nameRef: `'Pivot_Date_Statistics'!$B$1`,
          valuesRef: `'Pivot_Date_Statistics'!$B$2:$B$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
        {
          nameRef: `'Pivot_Date_Statistics'!$D$1`,
          valuesRef: `'Pivot_Date_Statistics'!$D$2:$D$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
      ],
    })
  }

  // 7. Dual axis water stress
  if (sizes.dateStats > 0) {
    specs.push({
      title: 'Irrigation / Water Stress - NDVI vs NDMI / NDWI',
      kind: 'combo',
      sectionLabel: 'Water Stress',
      anchorRow: 130,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: false,
      targetSheet: CHARTS,
      lineSeriesIndexes: [1, 2],
      series: [
        {
          nameRef: `'Pivot_Date_Statistics'!$B$1`,
          valuesRef: `'Pivot_Date_Statistics'!$B$2:$B$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
        {
          nameRef: `'Pivot_Date_Statistics'!$E$1`,
          valuesRef: `'Pivot_Date_Statistics'!$E$2:$E$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
        {
          nameRef: `'Pivot_Date_Statistics'!$F$1`,
          valuesRef: `'Pivot_Date_Statistics'!$F$2:$F$${dateLastRow}`,
          catsRef: `'Pivot_Date_Statistics'!$A$2:$A$${dateLastRow}`,
        },
      ],
    })
  }

  // 8. Horizontal ranking
  if (sizes.rankingPlots > 0) {
    specs.push({
      title: 'Plot Ranking by Health Score',
      kind: 'bar',
      barDir: 'bar',
      sectionLabel: 'Ranking',
      anchorRow: 148,
      anchorCol: 0,
      legendPos: 'b',
      varyColors: true,
      targetSheet: CHARTS,
      series: [
        {
          nameRef: `'Pivot_Ranking'!$C$1`,
          valuesRef: `'Pivot_Ranking'!$C$2:$C$${rankLastRow}`,
          catsRef: `'Pivot_Ranking'!$B$2:$B$${rankLastRow}`,
        },
      ],
    })
  }

  // Silence unused layerIds (kept for future LST etc.)
  void layerIds
  void dates

  return specs
}

export type AoiRawDataByLayerWorkbookResult = {
  workbook: ExcelJS.Workbook
  chartSpecs: MeteoNativeChartSpec[]
}

export async function buildAoiRawDataByLayerWorkbook(
  input: AoiRawDataByLayerExportInput,
): Promise<AoiRawDataByLayerWorkbookResult> {
  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one AOI plot with geometry before exporting.')
  }
  const layerIds = [...new Set(input.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))]
  if (!layerIds.length) {
    throw new Error('Select at least one index layer (NDVI, NDMI, …) before exporting.')
  }
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  if (!fromDate || !toDate || fromDate > toDate) {
    throw new Error('Set a valid Start → End date range before exporting.')
  }

  const { dailyByFieldKey } = await fetchPlotTimeSeriesDailyByField(
    plots,
    layerIds,
    fromDate,
    toDate,
    { signal: input.signal, onProgress: input.onProgress },
  )

  const { observations, aggregates, dates } = buildAoiRawObservations(
    plots,
    layerIds,
    dailyByFieldKey,
    fromDate,
    toDate,
  )

  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud'
  wb.created = new Date()
  wb.title = 'AOI Time Series Analysis'

  writeSummaryDashboard(
    wb,
    { ...input, fromDate, toDate, plots },
    layerIds,
    aggregates,
    observations.length,
  )
  const used = new Set(RESERVED_SHEETS)

  writeWideObservationSheet(wb, 'All_Plots_Raw', layerIds, observations, used)

  for (const plot of plots) {
    const plotId = plotDisplayIdForExport(plot)
    const sheetName = excelSheetNameFromPlotId(plotId, used)
    const plotRows = observations.filter(o => o.fieldKey === plot.fieldKey)
    writeWideObservationSheet(wb, sheetName, layerIds, plotRows, used)
  }

  const ndviSize = writePivotNdviTrend(wb, dates, aggregates, observations)
  const indexSize = writePivotIndexSummary(wb, layerIds, aggregates)
  const dateSize = writePivotDateStatistics(wb, dates, observations)
  writePivotStressAnalysis(wb, aggregates)
  const rankSize = writePivotRanking(wb, aggregates)

  const chartSpecs = writeChartsDashboard(wb, layerIds, dates, aggregates, observations, {
    ndviPlots: ndviSize.plotCount,
    ndviDates: ndviSize.dateCount,
    indexPlots: indexSize.plotCount,
    indexCount: indexSize.indexCount,
    dateStats: dateSize.dateCount,
    rankingPlots: rankSize.plotCount,
  })

  return { workbook: wb, chartSpecs }
}

export function buildAoiRawDataByLayerFilename(input: {
  aoiName?: string
  farmName?: string
  fromDate: string
  toDate: string
}): string {
  const aoi = slug(input.aoiName || input.farmName || 'AOI')
  return `AOI_TimeSeries_Analysis_${aoi}_${yyyymmdd(input.fromDate)}_${yyyymmdd(input.toDate)}.xlsx`
}

export async function generateAoiRawDataByLayerExcel(
  input: AoiRawDataByLayerExportInput,
): Promise<void> {
  const { workbook, chartSpecs } = await buildAoiRawDataByLayerWorkbook(input)
  const raw = await workbook.xlsx.writeBuffer()
  const withCharts = await injectNativeMeteoCharts(
    raw as ArrayBuffer,
    chartSpecs,
    'Charts_Dashboard',
  )
  const blob = new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildAoiRawDataByLayerFilename(input)
  a.click()
  URL.revokeObjectURL(url)
}
