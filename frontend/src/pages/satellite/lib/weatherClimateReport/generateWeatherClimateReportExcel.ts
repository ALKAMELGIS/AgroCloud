import ExcelJS from 'exceljs'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { renderWeatherClimateCharts, type WeatherClimateChartSet } from './weatherClimateExcelChartRenderer'

const BRAND_DARK = 'FF064E3B'
const BRAND = 'FF047857'
const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFE2F5EE'
const ALT_ROW = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'

function fmtNum(n: number | null | undefined, digits = 2): string | number {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n.toFixed(digits))
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
    if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
    cell.alignment = { vertical: 'top', wrapText: true }
  })
}

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(`${start}T12:00:00`)
    const e = new Date(`${end}T12:00:00`)
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return `${fmt(s)} – ${fmt(e)}`
  } catch {
    return `${start} – ${end}`
  }
}

function autoWidth(ws: ExcelJS.Worksheet, maxCol: number): void {
  for (let c = 1; c <= maxCol; c++) {
    let max = 12
    ws.eachRow(row => {
      const v = row.getCell(c).value
      const len = v == null ? 0 : String(v).length
      if (len > max) max = Math.min(len + 2, 48)
    })
    ws.getColumn(c).width = max
  }
}

function buildExecutiveSummarySheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })
  ws.mergeCells('A1:D1')
  ws.getCell('A1').value = 'Weather Historical Climate Analysis Report'
  styleTitle(ws.getCell('A1'))

  const rows: Array<[string, string]> = [
    ['AOI Name', p.aoiName],
    ['AOI Location', p.aoiLocation],
    ['Coordinates', `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`],
    ['Analysis Period', formatPeriod(p.analysisStart, p.analysisEnd)],
    ['Historical Coverage', `${p.historicalCoverageYears.toFixed(1)}+ years`],
    ['Forecast', p.executiveSummary.forecastHorizon],
    ['Data Sources', p.dataSource],
    ['Climate Classification', p.climateClassification],
    ['Timezone', p.timezone],
    ['Main Climate Findings', p.executiveSummary.mainFindings.join('\n')],
    ['Environmental Risk Summary', p.executiveSummary.environmentalRiskSummary],
  ]

  let r = 3
  rows.forEach(([label, value]) => {
    ws.getCell(r, 1).value = label
    styleSection(ws.getCell(r, 1))
    ws.mergeCells(r, 2, r, 4)
    ws.getCell(r, 2).value = value
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' }
    r += 1
  })
  autoWidth(ws, 4)
}

function buildHistoricalDataSheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Historical Dataset', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  ws.getCell(1, 1).value = 'Daily Historical Weather (complete temporal record)'
  styleTitle(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, 10)

  const headers = [
    'Date',
    'Maximum Temperature (°C)',
    'Minimum Temperature (°C)',
    'Average Temperature (°C)',
    'Rainfall (mm)',
    'Humidity (%)',
    'Wind Speed (km/h)',
    'Solar Radiation (W/m²)',
    'ET0 (mm)',
    'Pressure (hPa)',
  ]
  const hr = ws.addRow(headers)
  styleTableHeader(hr)
  hr.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 10 } }

  p.dailyRecords.forEach((d, i) => {
    const row = ws.addRow([
      d.date,
      fmtNum(d.tempMaxC, 1),
      fmtNum(d.tempMinC, 1),
      fmtNum(d.tempAvgC, 2),
      fmtNum(d.rainfallMm, 2),
      fmtNum(d.humidityPct, 1),
      fmtNum(d.windSpeedKmh, 1),
      fmtNum(d.solarRadiationWm2, 1),
      fmtNum(d.et0Mm, 2),
      fmtNum(d.pressureHpa, 1),
    ])
    styleDataRow(row, i % 2 === 1)
    row.getCell(1).numFmt = 'yyyy-mm-dd'
  })

  const hourlyStart = p.dailyRecords.length + 4
  ws.getCell(hourlyStart, 1).value = 'Hourly Raw Records (complete, unfiltered)'
  styleSection(ws.getCell(hourlyStart, 1))
  ws.mergeCells(hourlyStart, 1, hourlyStart, 10)

  const hHeaders = [
    'DateTime',
    'Temperature (°C)',
    'Rainfall (mm)',
    'Humidity (%)',
    'Wind Speed (km/h)',
    'Wind Direction (°)',
    'Solar Radiation (W/m²)',
    'ET0 (mm)',
    'Pressure (hPa)',
    'Weather Code',
  ]
  const hhr = ws.addRow(hHeaders)
  styleTableHeader(hhr)

  p.hourlyRecords.forEach((h, i) => {
    const row = ws.addRow([
      h.time,
      fmtNum(h.temperatureC, 2),
      fmtNum(h.precipitationMm, 2),
      fmtNum(h.humidityPct, 1),
      fmtNum(h.windSpeedKmh, 1),
      h.windDirectionDeg ?? '—',
      fmtNum(h.shortwaveRadiationWm2, 1),
      fmtNum(h.et0Mm, 2),
      fmtNum(h.pressureHpa, 1),
      h.weatherCode ?? '—',
    ])
    styleDataRow(row, i % 2 === 1)
  })
  autoWidth(ws, 10)
}

function buildStatisticalAnalysisSheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Statistical Analysis')
  ws.getCell(1, 1).value = 'Climate Statistical Analysis'
  styleTitle(ws.getCell(1, 1))

  let r = 3
  ws.getCell(r, 1).value = 'Temperature Analysis'
  styleSection(ws.getCell(r, 1))
  r += 1
  const tempRows: Array<[string, string | number]> = [
    ['Mean temperature (°C)', fmtNum(p.temperatureStats.meanC as number, 2)],
    ['Maximum temperature (°C)', fmtNum(p.temperatureStats.maxC as number, 1)],
    ['Minimum temperature (°C)', fmtNum(p.temperatureStats.minC as number, 1)],
    ['Seasonal temperature variation (°C)', fmtNum(p.temperatureStats.seasonalVariationC as number, 2)],
    ['Annual temperature trend (°C/decade)', fmtNum(p.temperatureStats.annualTrendCPerDecade as number, 3)],
  ]
  tempRows.forEach(([k, v]) => {
    ws.getCell(r, 1).value = k
    ws.getCell(r, 2).value = v
    r += 1
  })

  r += 1
  ws.getCell(r, 1).value = 'Rainfall Analysis'
  styleSection(ws.getCell(r, 1))
  r += 1
  const rainRows: Array<[string, string | number]> = [
    ['Total precipitation (mm)', fmtNum(p.rainfallStats.annualPrecipMm as number, 1)],
    ['Wet season', p.rainfallStats.wetSeason ?? '—'],
    ['Dry season', p.rainfallStats.drySeason ?? '—'],
    ['Rainfall variability (%)', fmtNum(p.rainfallStats.variabilityPct as number, 1)],
    ['Annual rainfall trend (%)', fmtNum(p.rainfallStats.annualTrendPct as number, 1)],
  ]
  rainRows.forEach(([k, v]) => {
    ws.getCell(r, 1).value = k
    ws.getCell(r, 2).value = v
    r += 1
  })

  r += 2
  ws.getCell(r, 1).value = 'Extreme Climate Events'
  styleSection(ws.getCell(r, 1))
  r += 1
  const eh = ws.addRow(['Type', 'Start', 'End', 'Duration (days)', 'Description'])
  styleTableHeader(eh)
  p.extremeEvents.forEach((e, i) => {
    const row = ws.addRow([e.type, e.startDate, e.endDate, e.durationDays, e.description])
    styleDataRow(row, i % 2 === 1)
  })
  autoWidth(ws, 5)
}

function buildTrendAnalysisSheet(
  wb: ExcelJS.Workbook,
  p: WeatherClimateReportPayload,
  charts: WeatherClimateChartSet,
): void {
  const ws = wb.addWorksheet('Trend Analysis')
  ws.getCell(1, 1).value = 'Climate Trend Analysis'
  styleTitle(ws.getCell(1, 1))

  const rows: Array<[string, string]> = [
    ['Temperature trend', p.temperatureTrend.narrative],
    ['Temperature increase (°C/decade)', String(p.temperatureTrend.slopePerDecadeC ?? '—')],
    ['Temperature regression R²', String(p.temperatureTrend.regressionR2 ?? '—')],
    ['Rainfall trend', p.rainfallTrend.narrative],
    ['Annual rainfall change (%)', String(p.rainfallTrend.annualChangePct ?? '—')],
    ['Rainfall regression R²', String(p.rainfallTrend.regressionR2 ?? '—')],
  ]
  let r = 3
  rows.forEach(([k, v]) => {
    ws.getCell(r, 1).value = k
    ws.getCell(r, 2).value = v
    ws.getCell(r, 2).alignment = { wrapText: true }
    r += 1
  })

  const ah = ws.addRow(['Year', 'Mean Temp (°C)', 'Total Rain (mm)', 'Temp Anomaly (°C)', 'Rain Anomaly (%)'])
  styleTableHeader(ah)
  p.annualSeries.forEach((a, i) => {
    const row = ws.addRow([
      a.year,
      fmtNum(a.avgTempC, 2),
      fmtNum(a.totalRainfallMm, 1),
      fmtNum(a.tempAnomalyC, 2),
      fmtNum(a.rainfallAnomalyPct, 1),
    ])
    styleDataRow(row, i % 2 === 1)
  })

  let chartRow = r + p.annualSeries.length + 3
  const addChart = (base64: string | undefined, title: string) => {
    if (!base64) return
    ws.getCell(chartRow, 1).value = title
    styleSection(ws.getCell(chartRow, 1))
    const imgId = wb.addImage({ base64, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0, row: chartRow }, ext: { width: 640, height: 280 } })
    chartRow += 18
  }
  addChart(charts.temperatureTrend, 'Temperature Historical Trend')
  addChart(charts.rainfallTrend, 'Rainfall Historical Trend')
  addChart(charts.climateAnomaly, 'Climate Anomaly')
  autoWidth(ws, 5)
}

function buildRiskSheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Risk Assessment')
  ws.getCell(1, 1).value = 'Climate Risk Assessment'
  styleTitle(ws.getCell(1, 1))
  const h = ws.addRow(['Risk Type', 'Level', 'Description'])
  styleTableHeader(h)
  p.climateRisks.forEach((r, i) => {
    const row = ws.addRow([r.riskType, r.level, r.description])
    styleDataRow(row, i % 2 === 1)
    const levelCell = row.getCell(2)
    if (r.level === 'Extreme' || r.level === 'High') {
      levelCell.font = { bold: true, color: { argb: 'FF991B1B' } }
      levelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }
    }
  })
  autoWidth(ws, 3)
}

function buildSeasonalCalendarSheet(
  wb: ExcelJS.Workbook,
  p: WeatherClimateReportPayload,
  charts: WeatherClimateChartSet,
): void {
  const ws = wb.addWorksheet('Seasonal Calendar', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  ws.getCell(1, 1).value = 'Seasonal Climate Calendar'
  styleTitle(ws.getCell(1, 1))
  const h = ws.addRow([
    'Month',
    'Average Temperature (°C)',
    'Rainfall (mm)',
    'Humidity (%)',
    'Climate Risk',
    'Season',
  ])
  styleTableHeader(h)
  h.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 6 } }
  p.monthlyCalendar.forEach((m, i) => {
    const row = ws.addRow([
      m.monthLabel,
      fmtNum(m.avgTempC, 2),
      fmtNum(m.rainfallMm, 1),
      fmtNum(m.humidityPct, 1),
      m.climateRisk,
      m.seasonLabel,
    ])
    styleDataRow(row, i % 2 === 1)
  })
  if (charts.monthlyDistribution) {
    const imgId = wb.addImage({ base64: charts.monthlyDistribution, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0, row: 16 }, ext: { width: 640, height: 280 } })
  }
  autoWidth(ws, 6)
}

function buildForecastSheet(
  wb: ExcelJS.Workbook,
  p: WeatherClimateReportPayload,
  charts: WeatherClimateChartSet,
): void {
  const ws = wb.addWorksheet('Forecast 2026-2050', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  ws.getCell(1, 1).value = 'Climate Forecast Model (2026 – 2050)'
  styleTitle(ws.getCell(1, 1))
  ws.getCell(2, 1).value =
    'Trend-based linear regression projection from historical annual climate series. Confidence reflects regression fit and record length.'
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, 6)

  const h = ws.addRow([
    'Year',
    'Predicted Temperature (°C)',
    'Temperature Change (°C)',
    'Predicted Rainfall (mm)',
    'Rainfall Change (%)',
    'Confidence',
  ])
  styleTableHeader(h)
  h.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 6 } }
  p.forecastRows.forEach((f, i) => {
    const row = ws.addRow([
      f.year,
      fmtNum(f.predictedTempC, 2),
      fmtNum(f.tempChangeC, 2),
      fmtNum(f.predictedRainfallMm, 1),
      fmtNum(f.rainfallChangePct, 1),
      f.confidence,
    ])
    styleDataRow(row, i % 2 === 1)
  })

  let chartRow = p.forecastRows.length + 6
  if (charts.temperatureForecast) {
    const imgId = wb.addImage({ base64: charts.temperatureForecast, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0, row: chartRow }, ext: { width: 640, height: 280 } })
    chartRow += 18
  }
  if (charts.rainfallForecast) {
    const imgId = wb.addImage({ base64: charts.rainfallForecast, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0, row: chartRow }, ext: { width: 640, height: 280 } })
  }
  autoWidth(ws, 6)
}

function buildImpactSheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Climate Change Impact')
  ws.getCell(1, 1).value = 'Climate Change Impact Assessment (2050)'
  styleTitle(ws.getCell(1, 1))
  const rows: Array<[string, string | number]> = [
    ['Expected Climate Change Impact', p.impactAssessment.overallImpact],
    ['Temperature increase to 2050 (°C)', fmtNum(p.impactAssessment.temperatureIncreaseC, 2)],
    ['Rainfall change to 2050 (%)', fmtNum(p.impactAssessment.rainfallChangePct, 1)],
    ['Drought probability (%)', fmtNum(p.impactAssessment.droughtProbabilityPct, 0)],
    ['Water stress level', p.impactAssessment.waterStressLevel],
    ['Agricultural impact', p.impactAssessment.agriculturalImpact],
  ]
  let r = 3
  rows.forEach(([k, v]) => {
    ws.getCell(r, 1).value = k
    styleSection(ws.getCell(r, 1))
    ws.mergeCells(r, 2, r, 4)
    ws.getCell(r, 2).value = v
    ws.getCell(r, 2).alignment = { wrapText: true }
    r += 1
  })
  r += 1
  ws.getCell(r, 1).value = 'Key impacts'
  styleSection(ws.getCell(r, 1))
  r += 1
  p.impactAssessment.bullets.forEach(b => {
    ws.getCell(r, 1).value = `• ${b}`
    ws.mergeCells(r, 1, r, 4)
    r += 1
  })
  autoWidth(ws, 4)
}

function buildMetadataSheet(wb: ExcelJS.Workbook, p: WeatherClimateReportPayload): void {
  const ws = wb.addWorksheet('Metadata')
  ws.getCell(1, 1).value = 'Metadata & Data Sources'
  styleTitle(ws.getCell(1, 1))
  const rows: Array<[string, string]> = [
    ['Weather API', 'Open-Meteo (https://open-meteo.com)'],
    ['Dataset provider', 'ERA5 Reanalysis (Copernicus / ECMWF)'],
    ['Extraction date', new Date(p.extractionDate).toLocaleString()],
    ['AOI coordinates', `${p.lat}, ${p.lng}`],
    ['Elevation (m)', p.elevationM != null ? String(p.elevationM) : '—'],
    ['Loaded data window', `${p.loadedStart} – ${p.loadedEnd}`],
    ['Analysis window', `${p.analysisStart} – ${p.analysisEnd}`],
    ['Timezone', p.timezone],
    ['Hourly records', String(p.hourlyRecords.length)],
    ['Daily records', String(p.dailyRecords.length)],
    [
      'Methodology',
      'Daily aggregation from hourly ERA5 archive; linear regression trends; percentile-based extreme event detection; trend extrapolation forecast to 2050.',
    ],
  ]
  let r = 3
  rows.forEach(([k, v]) => {
    ws.getCell(r, 1).value = k
    styleSection(ws.getCell(r, 1))
    ws.mergeCells(r, 2, r, 4)
    ws.getCell(r, 2).value = v
    ws.getCell(r, 2).alignment = { wrapText: true }
    r += 1
  })
  autoWidth(ws, 4)
}

export async function buildWeatherClimateReportWorkbook(
  payload: WeatherClimateReportPayload,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud Weather Intelligence'
  wb.created = new Date()

  const charts = renderWeatherClimateCharts(payload)

  buildExecutiveSummarySheet(wb, payload)
  buildHistoricalDataSheet(wb, payload)
  buildStatisticalAnalysisSheet(wb, payload)
  buildTrendAnalysisSheet(wb, payload, charts)
  buildRiskSheet(wb, payload)
  buildSeasonalCalendarSheet(wb, payload, charts)
  buildForecastSheet(wb, payload, charts)
  buildImpactSheet(wb, payload)
  buildMetadataSheet(wb, payload)

  return wb
}

export function weatherClimateReportFilename(aoiName: string): string {
  const slug = aoiName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'AOI'
  const year = new Date().getFullYear()
  return `${slug}_Weather_Climate_Analysis_Report_${year}.xlsx`
}

export async function generateWeatherClimateReportExcel(payload: WeatherClimateReportPayload): Promise<void> {
  const wb = await buildWeatherClimateReportWorkbook(payload)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = weatherClimateReportFilename(payload.aoiName)
  a.click()
  URL.revokeObjectURL(url)
}
