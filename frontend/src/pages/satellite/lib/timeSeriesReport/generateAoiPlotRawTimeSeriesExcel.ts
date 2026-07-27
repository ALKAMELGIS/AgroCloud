import ExcelJS from 'exceljs'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  AOI_EXCEL_NO_DATA,
  cleanAoiPlotDisplayId,
  collectMasterAcquisitionDates,
  excelMissing,
  excelSafeText,
  looksLikeLayerFileId,
} from './aoiExcelExportShared'
import { fetchPlotTimeSeriesDailyByField } from './fetchPlotTimeSeriesAnalytics'

const HEADER = 'FF065F46'
const ALT = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'

export type AoiPlotRawTimeSeriesExportInput = {
  plots: CropAlertFieldInput[]
  layerIds: string[]
  fromDate: string
  toDate: string
  farmName?: string
  aoiName?: string
  /** Layer attribute used for sheet / plot names (e.g. Plot_ID, OBJECTID). */
  plotNameField?: string
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

function slug(s: string): string {
  return String(s || 'Plot')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'Plot'
}

function yyyymmdd(iso: string): string {
  return (iso || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
}

/** Excel sheet names: ≤31 chars, no \ / ? * [ ] */
export function excelSheetNameFromPlotId(plotId: string, used: Set<string>): string {
  let base = String(plotId || 'Plot')
    .replace(/[\\/?*[\]:]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 31)
  if (!base) base = 'Plot'
  if (!/^Plot[_-]/i.test(base) && base.length <= 26) {
    base = `Plot_${base}`.slice(0, 31)
  }
  let name = base
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suffix = `_${n}`
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  used.add(name.toLowerCase())
  return name
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 18): void {
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

export function plotDisplayId(plot: CropAlertFieldInput): string {
  const name = cleanAoiPlotDisplayId(String(plot.farmName || '').trim())
  if (name && !looksLikeLayerFileId(name)) return name
  const oid = cleanAoiPlotDisplayId(String(plot.objectId || '').trim())
  if (oid && !looksLikeLayerFileId(oid)) return oid
  return 'Plot'
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
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function rowHasFiniteIndex(row: SentinelHubDailyIndexMeans, layerIds: string[]): boolean {
  return layerIds.some(id => {
    const v = evaluateImageryLayerDailyValue(id, row)
    return v != null && Number.isFinite(v)
  })
}

function writeMetadataSheet(
  wb: ExcelJS.Workbook,
  input: AoiPlotRawTimeSeriesExportInput,
  layerIds: string[],
  masterDates: number,
): void {
  const ws = wb.addWorksheet('Metadata', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.addRow(['Property', 'Value'])
  styleHeaderRow(ws.getRow(1))
  const rows: Array<[string, string | number]> = [
    ['Export', 'AOI Time Series Raw (one sheet per plot)'],
    ['Farm / AOI', excelSafeText(input.aoiName || input.farmName || '-')],
    ['Plots', input.plots.length],
    ['Layers', layerIds.join(', ')],
    ['Start Date', input.fromDate.slice(0, 10)],
    ['End Date', input.toDate.slice(0, 10)],
    ['Master timeline dates', masterDates],
    ['Missing values', AOI_EXCEL_NO_DATA],
    ['Plot name field', excelSafeText(input.plotNameField?.trim() || 'Auto (Name / ID)')],
    ['Aggregation', 'Day (normalized acquisition dates)'],
    ['Generated At', new Date().toISOString()],
    ['Source', 'AgroCloud - Sentinel Hub zonal statistics'],
  ]
  for (const [k, v] of rows) {
    const r = ws.addRow([k, v])
    r.getCell(1).font = { bold: true, color: { argb: INK }, size: 9 }
    r.getCell(2).font = { color: { argb: MUTED }, size: 9 }
  }
  autoWidth(ws, 14, 48)
}

function writePlotSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  plot: CropAlertFieldInput,
  layerIds: string[],
  daily: SentinelHubDailyIndexMeans[],
  masterDates: string[],
): void {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const headers = ['Date', ...layerIds]
  ws.addRow(headers)
  styleHeaderRow(ws.getRow(1))

  const byDate = new Map(
    dailyRowsInRange(daily, '0000-01-01', '9999-12-31').map(r => [r.date, r] as const),
  )

  let dataRows = 0
  for (const date of masterDates) {
    const row = byDate.get(date)
    const values = layerIds.map(layerId => {
      if (!row) return AOI_EXCEL_NO_DATA
      const v = evaluateImageryLayerDailyValue(layerId, row)
      return excelMissing(v != null && Number.isFinite(v) ? Number(v.toFixed(4)) : null)
    })
    const excelRow = ws.addRow([date, ...values])
    dataRows += 1
    if (dataRows % 2 === 0) {
      excelRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
      })
    }
    for (let c = 2; c <= headers.length; c++) {
      if (typeof excelRow.getCell(c).value === 'number') {
        excelRow.getCell(c).numFmt = '0.0000'
      }
    }
  }

  if (!masterDates.length) {
    const empty = ws.addRow(['(no clear scenes in range)', ...layerIds.map(() => AOI_EXCEL_NO_DATA)])
    empty.getCell(1).font = { italic: true, color: { argb: MUTED }, size: 9 }
  }

  ws.addRow([])
  const foot = ws.addRow([`Plot ID: ${plotDisplayId(plot)}`, `Key: ${plot.fieldKey}`])
  foot.eachCell(cell => {
    cell.font = { size: 8, color: { argb: MUTED }, italic: true }
  })

  autoWidth(ws)
  ws.getColumn(1).width = 12
}

export async function buildAoiPlotRawTimeSeriesWorkbook(
  input: AoiPlotRawTimeSeriesExportInput,
): Promise<ExcelJS.Workbook> {
  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one AOI plot with geometry before exporting raw time series.')
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

  const dailyByFieldKey = await fetchPlotTimeSeriesDailyByField(
    plots,
    layerIds,
    fromDate,
    toDate,
    { signal: input.signal, onProgress: input.onProgress },
  )

  const masterDates = collectMasterAcquisitionDates(
    dailyByFieldKey.values(),
    fromDate,
    toDate,
    row => rowHasFiniteIndex(row as SentinelHubDailyIndexMeans, layerIds),
  )

  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud'
  wb.created = new Date()
  wb.title = 'AOI Time Series Raw Export'

  writeMetadataSheet(wb, { ...input, plots, layerIds, fromDate, toDate }, layerIds, masterDates.length)

  const usedNames = new Set<string>(['metadata'])
  for (const plot of plots) {
    const sheetName = excelSheetNameFromPlotId(plotDisplayId(plot), usedNames)
    const daily = dailyRowsInRange(dailyByFieldKey.get(plot.fieldKey) ?? [], fromDate, toDate)
    writePlotSheet(wb, sheetName, plot, layerIds, daily, masterDates)
  }

  return wb
}

export function buildAoiPlotRawTimeSeriesFilename(input: {
  aoiName?: string
  farmName?: string
  fromDate: string
  toDate: string
}): string {
  const aoi = slug(input.aoiName || input.farmName || 'AOI')
  return `AOI_TimeSeries_Raw_Export_${aoi}_${yyyymmdd(input.fromDate)}_${yyyymmdd(input.toDate)}.xlsx`
}

export async function generateAoiPlotRawTimeSeriesExcel(
  input: AoiPlotRawTimeSeriesExportInput,
): Promise<void> {
  const wb = await buildAoiPlotRawTimeSeriesWorkbook(input)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildAoiPlotRawTimeSeriesFilename(input)
  a.click()
  URL.revokeObjectURL(url)
}
