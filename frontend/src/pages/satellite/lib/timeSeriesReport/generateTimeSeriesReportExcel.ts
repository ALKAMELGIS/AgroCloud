import ExcelJS from 'exceljs'
import { resolveIndexThresholdProfile } from '../../../../lib/imageryIndexInterpretationEngine'
import { renderExcelTrendCharts } from './timeSeriesExcelChartRenderer'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

const BRAND_DARK = 'FF064E3B'
const BRAND = 'FF047857'
const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFE2F5EE'
const ALT_ROW = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'

type LayerRow = { layerId: string; values: Array<number | null> }

function fmtNum(n: number | null | undefined, digits = 4): string | number {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n.toFixed(digits))
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function fmtHaNum(ha: number): number | string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return Number(ha.toFixed(ha >= 100 ? 1 : 2))
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

function parseIsoWeek(period: string): number | null {
  const m = period.match(/(\d{4})-W(\d{1,2})/i)
  if (!m) return null
  return Number(m[2])
}

function vigorClassFromNdvi(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
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

function buildDashboardSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload): void {
  const ws = wb.addWorksheet('Dashboard', { views: [{ showGridLines: true }] })
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

  ws.getCell('A1').value = 'Agricultural Satellite Intelligence — Imagery Time Series Report'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:F1')

  ws.getCell('A2').value = `Source: AgroCloud Satellite Intelligence · Period ${periodLabel} · ${obs} observations`
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
    ['Satellite Source', 'Sentinel-2 (Sentinel Hub)'],
    ['Acquisition Date(s)', payload.period.acquisitionDate],
    ['Vegetation Indices', payload.layerIds.join(', ')],
    ['Mean Index Value (NDVI)', exec.ndviMean != null ? String(fmtNum(exec.ndviMean, 4)) : '—'],
    ['Minimum Index Value (NDVI)', ndviMin != null ? String(fmtNum(ndviMin, 4)) : '—'],
    ['Maximum Index Value (NDVI)', ndviMax != null ? String(fmtNum(ndviMax, 4)) : '—'],
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
  const covHeader = ws.getRow(row)
  covHeader.values = ['Class', 'Coverage (%)', 'Area (ha)']
  styleTableHeader(covHeader)
  row++

  const covRows = [
    ['Planted Area', veg.plantedPct, fmtHaNum(veg.plantedHa)],
    ['Unplanted Area', veg.unplantedPct, fmtHaNum(veg.unplantedHa)],
  ]
  covRows.forEach((vals, i) => {
    const r = ws.getRow(row)
    r.values = vals
    styleDataRow(r, i % 2 === 1)
    r.getCell(2).numFmt = '0.0"%"'
    row++
  })

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
    return m != null ? `Period avg ${fmtNum(m, 2)}` : 'Period avg —'
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
    r.values = [label, ...layers.map(fn).map(v => (v == null ? '—' : fmtNum(v, 4)))]
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

  ws.getCell(row, 1).value = 'Imagery Timeline — Vegetation & Moisture Trend'
  ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  ws.mergeCells(row, 1, row, 5)
  row++
  ws.getCell(row, 1).value = 'See the Charts sheet for NDVI/SAVI and NDMI/NDWI trend line charts.'
  ws.getCell(row, 1).font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(row, 1, row, 5)
}

function buildDataSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload): void {
  const ws = wb.addWorksheet('Data')
  const layers = payload.charts.series
  const headers = ['Period', 'Week #', ...layers.map(s => s.layerId.toUpperCase()), 'Vigor Class']
  ws.columns = headers.map((h, i) => ({ width: i === 0 ? 14 : i === 1 ? 8 : 12 }))

  const headerRow = ws.getRow(1)
  headerRow.values = headers
  styleTableHeader(headerRow)

  payload.charts.labels.forEach((period, rowIndex) => {
    const ndviSeries = layers.find(s => s.layerId.toUpperCase() === 'NDVI')
    const ndviVal = ndviSeries?.values[rowIndex] ?? null
    const values = [
      period,
      parseIsoWeek(period) ?? '',
      ...layers.map(s => {
        const v = s.values[rowIndex]
        return v != null && Number.isFinite(v) ? fmtNum(v, 4) : ''
      }),
      vigorClassFromNdvi(ndviVal),
    ]
    const r = ws.getRow(rowIndex + 2)
    r.values = values
    styleDataRow(r, rowIndex % 2 === 1)
  })

  const noteRow = payload.charts.labels.length + 4
  ws.getCell(noteRow, 1).value =
    'Note: Week numbers are ISO week labels parsed from the period column; gaps indicate weeks with no available scene/observation.'
  ws.getCell(noteRow, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, headers.length)
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
    ws.getCell(row, 2).value = `• ${rec}`
    ws.getCell(row, 2).alignment = { wrapText: true }
    ws.getCell(row, 2).font = { size: 10 }
    row++
  }

  row++
  ws.getCell(row, 2).value = `Generated ${payload.generatedAt.replace('T', ' ').slice(0, 19)} UTC by ${payload.projectName}. Dashboard and Data sheets summarize AOI statistics, vegetation coverage, and time-series observations for operational monitoring and stakeholder reporting.`
  ws.getCell(row, 2).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.getCell(row, 2).alignment = { wrapText: true }
}

async function buildChartsSheet(wb: ExcelJS.Workbook, payload: TimeSeriesReportPayload): Promise<void> {
  const ws = wb.addWorksheet('Charts', { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ]

  const periodLabel = `${payload.period.from} to ${payload.period.to}`
  const labels = payload.charts.displayLabels.length ? payload.charts.displayLabels : payload.charts.labels
  const series = payload.charts.series.map(s => ({
    layerId: s.layerId,
    values: s.values as Array<number | null>,
  }))

  ws.getCell('A1').value = 'IMAGERY TIME SERIES'
  ws.getCell('A1').font = { bold: true, size: 12, color: { argb: BRAND_DARK } }
  ws.mergeCells('A1:J1')

  ws.getCell('A2').value = 'Imagery Timeline — Vegetation & Moisture Trend'
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  ws.mergeCells('A2:J2')

  ws.getCell('A3').value = `${payload.location.fieldName} · ${periodLabel}`
  ws.getCell('A3').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells('A3:J3')

  const chartImages = await renderExcelTrendCharts(labels, series)
  if (!chartImages.length) {
    ws.getCell('A5').value = 'No chart data available for the selected period and layers.'
    ws.getCell('A5').font = { italic: true, size: 10, color: { argb: MUTED } }
    return
  }

  const tabTitles = chartImages.map(img => img.title)
  let tabCol = 1
  for (const title of tabTitles) {
    const cell = ws.getCell(5, tabCol)
    cell.value = title
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: BRAND_DARK } },
      bottom: { style: 'thin', color: { argb: BRAND_DARK } },
      left: { style: 'thin', color: { argb: BRAND_DARK } },
      right: { style: 'thin', color: { argb: BRAND_DARK } },
    }
    ws.mergeCells(5, tabCol, 5, tabCol + 3)
    tabCol += 4
  }
  ws.getRow(5).height = 20

  let anchorRow = 6
  const imageWidth = 760
  const imageHeight = 360
  const rowStride = 22

  for (const { base64 } of chartImages) {
    const imageId = wb.addImage({ base64, extension: 'png' })
    ws.addImage(imageId, {
      tl: { col: 0.2, row: anchorRow },
      ext: { width: imageWidth, height: imageHeight },
    })
    anchorRow += rowStride + 1
  }

  const noteRow = anchorRow + 1
  ws.getCell(noteRow, 1).value =
    `Charts generated from AgroCloud Imagery Time Series (${payload.layerIds.join(', ')}). Solid lines = primary index; dashed lines = companion index. Period labels match the Data sheet.`
  ws.getCell(noteRow, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.mergeCells(noteRow, 1, noteRow, 10)
}

export async function buildTimeSeriesReportWorkbook(payload: TimeSeriesReportPayload): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = payload.projectName
  wb.created = new Date()

  buildDashboardSheet(wb, payload)
  buildDataSheet(wb, payload)
  await buildChartsSheet(wb, payload)
  buildAnalysisSheet(wb, payload)

  return wb
}

export function buildTimeSeriesReportWorkbookSync(payload: TimeSeriesReportPayload): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = payload.projectName
  wb.created = new Date()
  buildDashboardSheet(wb, payload)
  buildDataSheet(wb, payload)
  buildAnalysisSheet(wb, payload)
  return wb
}

export async function generateTimeSeriesReportExcel(payload: TimeSeriesReportPayload): Promise<void> {
  const wb = await buildTimeSeriesReportWorkbook(payload)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Agricultural_Imagery_Timeseries_Report.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTimeSeriesCsvReport(payload: TimeSeriesReportPayload): void {
  const lines: string[] = []
  const esc = (v: unknown) => {
    const t = v == null ? '' : String(v)
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const exec = payload.executive
  const veg = vegetationCoverage(payload)
  const layers = payload.charts.series

  const ndviSeries = layers.find(s => s.layerId.toUpperCase() === 'NDVI')
  const ndviNums = ndviSeries?.values.filter((v): v is number => v != null && Number.isFinite(v)) ?? []
  const ndviMin = ndviNums.length ? Math.min(...ndviNums) : null
  const ndviMax = ndviNums.length ? Math.max(...ndviNums) : null

  lines.push('Agricultural Satellite Intelligence — Imagery Time Series Report')
  lines.push(`Field,${esc(payload.location.fieldName)}`)
  lines.push(`Total Field Area,${esc(fmtHa(payload.location.areaHa))}`)
  lines.push(`Analysis Period,${esc(`${payload.period.from} to ${payload.period.to}`)}`)
  lines.push(`Satellite Source,Sentinel-2 (Sentinel Hub)`)
  lines.push(`Acquisition Date,${esc(payload.period.acquisitionDate)}`)
  lines.push(`Vegetation Indices,${esc(payload.layerIds.join(', '))}`)
  lines.push(`Mean Index Value (NDVI),${exec.ndviMean != null ? fmtNum(exec.ndviMean, 4) : ''}`)
  lines.push(`Minimum Index Value (NDVI),${ndviMin != null ? fmtNum(ndviMin, 4) : ''}`)
  lines.push(`Maximum Index Value (NDVI),${ndviMax != null ? fmtNum(ndviMax, 4) : ''}`)
  lines.push(`Vegetation Trend Analysis,${esc(exec.vegetationTrend)}`)
  lines.push(`Vegetation Health Summary,${esc(exec.indexKpis.find(k => k.label === 'MEAN NDVI')?.sublabel ?? exec.cropHealth)}`)
  lines.push('')
  lines.push('Vegetation Coverage')
  lines.push('Class,Coverage (%),Area (ha)')
  lines.push(`Planted Area,${veg.plantedPct.toFixed(1)},${fmtHaNum(veg.plantedHa)}`)
  lines.push(`Unplanted Area,${veg.unplantedPct.toFixed(1)},${fmtHaNum(veg.unplantedHa)}`)
  lines.push('')
  lines.push('Executive Summary')
  lines.push(esc(exec.narrative))
  lines.push('')
  lines.push(['Period', 'Week #', ...layers.map(s => s.layerId), 'Vigor Class'].join(','))

  payload.charts.labels.forEach((period, rowIndex) => {
    const ndviSeries = layers.find(s => s.layerId.toUpperCase() === 'NDVI')
    const ndviVal = ndviSeries?.values[rowIndex] ?? null
    lines.push(
      [
        esc(period),
        parseIsoWeek(period) ?? '',
        ...layers.map(s => {
          const v = s.values[rowIndex]
          return v != null && Number.isFinite(v) ? v : ''
        }),
        vigorClassFromNdvi(ndviVal),
      ].join(','),
    )
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Agricultural_Imagery_Timeseries_Report.csv'
  a.click()
  URL.revokeObjectURL(url)
}
