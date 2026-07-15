import ExcelJS from 'exceljs'
import type { MeteoNativeChartSpec } from './meteoNativeExcelCharts'
import { buildEnterpriseWeatherModel, type EnterpriseWeatherModel, type IndicatorClass } from './weatherEnterpriseAnalyticsEngine'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  SHEET,
  TABLE,
  addExcelTable,
  applyNumberFormat,
  autoWidth,
  fmtNum,
  formulaDiff,
  formulaPctChange,
  formulaTrendArrow,
  setSheetLink,
  sheetRange,
  sheetRef,
  styleDataRow,
  styleSection,
  styleTableHeader,
  styleTitle,
} from './weatherExcelHelpers'

const CLASS_FILLS: Record<IndicatorClass, string> = {
  Excellent: 'FFC6EFCE',
  Good: 'FFFFEB9C',
  Moderate: 'FFFFC000',
  'High Risk': 'FFF8CBAD',
  Critical: 'FFFF6B6B',
}

function applyClassCell(cell: ExcelJS.Cell, classification: IndicatorClass): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLASS_FILLS[classification] } }
  cell.font = { bold: true, size: 10 }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function parseNum(s: string): number | '' {
  const m = s.replace(/[^\d.-]/g, '')
  const n = Number(m)
  return Number.isFinite(n) ? n : ''
}

type TableBounds = { headerRow: number; lastRow: number; colCount: number }

const REF_HOURLY_SHEET = 'Weather-Hourly'
const REF_ANALYSIS_SHEET = 'Analysis'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ANALYSIS_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FFB7B7B7' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFB7B7B7' } },
  left: { style: 'thin' as const, color: { argb: 'FFB7B7B7' } },
  right: { style: 'thin' as const, color: { argb: 'FFB7B7B7' } },
}

function formatMdy(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-')
  if (!y || !m || !d) return isoDate
  return `${m}/${d}/${y}`
}

function hourlyParts(date: string, time: string): [number | '', number | '', number | '', number | ''] {
  const [y, m, d] = date.split('-').map(Number)
  const hour = Number(time.slice(0, 2))
  return [
    Number.isFinite(y) ? y : '',
    Number.isFinite(m) ? m : '',
    Number.isFinite(d) ? d : '',
    Number.isFinite(hour) ? hour : '',
  ]
}

function wetBulbC(tempC: number | null, rhPct: number | null): number | null {
  if (tempC == null || rhPct == null) return null
  const rh = Math.max(1, Math.min(100, rhPct))
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  )
}

function specificHumidityGkg(tempC: number | null, rhPct: number | null, pressureHpa: number | null): number | null {
  if (tempC == null || rhPct == null) return null
  const pressure = pressureHpa ?? 1013.25
  const vaporPressure = (rhPct / 100) * 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5))
  return (0.622 * vaporPressure) / (pressure - 0.378 * vaporPressure) * 1000
}

function referenceHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { theme: 1 }, name: 'Aptos Narrow' }
  cell.alignment = { horizontal: 'center' }
}

function analysisTitleStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function analysisSectionStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function analysisHeaderRowStyle(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = ANALYSIS_BORDER
  })
}

function analysisDataRowStyle(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { size: 10, name: 'Arial' }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = ANALYSIS_BORDER
    if (typeof cell.value === 'object' && cell.value && 'formula' in cell.value) cell.numFmt = '0.00'
  })
}

function writeReferenceHourlySheet(
  wb: ExcelJS.Workbook,
  model: EnterpriseWeatherModel,
  payload: WeatherClimateReportPayload,
): TableBounds {
  const ws = wb.addWorksheet(REF_HOURLY_SHEET)
  ws.columns = [
    { width: 7.1 }, { width: 5.7 }, { width: 5.1 }, { width: 5.3 },
    { width: 21.6 }, { width: 28.6 }, { width: 33.9 }, { width: 32.7 },
    { width: 23.6 }, { width: 28.4 }, { width: 31.4 },
  ]

  const metadata = [
    `${payload.dataSource || 'Weather Source'} Native Resolution Hourly Data `,
    `Dates (month/day/year): ${formatMdy(payload.analysisStart)} through ${formatMdy(payload.analysisEnd)} in ${payload.timezone || 'UTC'}`,
    `Location: Latitude  ${payload.lat.toFixed(4)}   Longitude ${payload.lng.toFixed(4)} `,
    `Elevation from source: ${payload.elevationM != null ? `${payload.elevationM} meters` : 'Not available'}`,
  ]
  metadata.forEach((text, i) => {
    const row = i + 1
    ws.mergeCells(row, 5, row, 7)
    const cell = ws.getCell(row, 5)
    cell.value = text
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } }
    referenceHeaderStyle(cell)
  })

  const cols = [
    'YEAR',
    'MO',
    'DY',
    'HR',
    'Temperature at 2 Meters (C) ',
    'Dew/Frost Point at 2 Meters (C) ',
    'Wet Bulb Temperature at 2 Meters (C) ',
    'Specific Humidity at 2 Meters (g/kg) ',
    'Humidity at 2 Meters (%) ',
    'Wind Speed at 10 Meters (m/s) ',
    'Precipitation Corrected (mm/day) ',
  ]
  const header = ws.getRow(6)
  cols.forEach((col, i) => {
    const cell = header.getCell(i + 1)
    cell.value = col
    referenceHeaderStyle(cell)
  })

  model.hourlyRaw.forEach((r, i) => {
    const row = ws.getRow(7 + i)
    const [year, month, day, hour] = hourlyParts(r.date, r.time)
    row.values = [
      year,
      month,
      day,
      hour,
      fmtNum(r.temperatureC, 2),
      fmtNum(r.dewPointC, 2),
      fmtNum(wetBulbC(r.temperatureC, r.humidityPct), 2),
      fmtNum(specificHumidityGkg(r.temperatureC, r.humidityPct, r.pressureHpa), 2),
      fmtNum(r.humidityPct, 2),
      fmtNum(r.windSpeedKmh != null ? r.windSpeedKmh / 3.6 : null, 2),
      fmtNum(r.rainfallMm, 2),
    ]
    row.eachCell(cell => {
      cell.font = { size: 11, color: { theme: 1 }, name: 'Aptos Narrow' }
      cell.alignment = { horizontal: 'center' }
    })
  })

  const lastRow = 6 + model.hourlyRaw.length
  addExcelTable(ws, 'Table1', 6, cols.length, model.hourlyRaw.length, cols)
  return { headerRow: 6, lastRow, colCount: cols.length }
}

function collectReferenceYears(model: EnterpriseWeatherModel): number[] {
  const years = Array.from(
    new Set(model.hourlyRaw.map(r => Number(r.date.slice(0, 4))).filter(Number.isFinite)),
  ) as number[]
  return years.sort((a, b) => a - b)
}

function writeAnalysisPivot(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  sourceColumn: string,
  years: number[],
  hourlyLastRow: number,
): { monthAvgRow: number } {
  ws.mergeCells(startRow, 1, startRow, 14)
  ws.getCell(startRow, 1).value = title
  analysisSectionStyle(ws.getCell(startRow, 1))

  const header = ws.getRow(startRow + 1)
  ;['Year', ...MONTH_NAMES, 'Year Avg'].forEach((label, i) => {
    header.getCell(i + 1).value = label
  })
  analysisHeaderRowStyle(header)

  years.forEach((year, i) => {
    const rowNum = startRow + 2 + i
    const row = ws.getRow(rowNum)
    row.getCell(1).value = year
    for (let m = 1; m <= 12; m++) {
      row.getCell(m + 1).value = {
        formula: `IFERROR(AVERAGEIFS('${REF_HOURLY_SHEET}'!$${sourceColumn}$7:$${sourceColumn}$${hourlyLastRow},'${REF_HOURLY_SHEET}'!$A$7:$A$${hourlyLastRow},$A${rowNum},'${REF_HOURLY_SHEET}'!$B$7:$B$${hourlyLastRow},${m}),"")`,
        result: undefined,
      }
    }
    row.getCell(14).value = { formula: `IFERROR(AVERAGE(B${rowNum}:M${rowNum}),"")`, result: undefined }
    analysisDataRowStyle(row)
  })

  const monthAvgRow = startRow + 2 + years.length
  const row = ws.getRow(monthAvgRow)
  row.getCell(1).value = 'Month Avg'
  for (let c = 2; c <= 14; c++) {
    const col = String.fromCharCode(64 + c)
    row.getCell(c).value = { formula: `IFERROR(AVERAGE(${col}${startRow + 2}:${col}${monthAvgRow - 1}),"")`, result: undefined }
  }
  analysisDataRowStyle(row)
  row.eachCell(cell => { cell.font = { bold: true, size: 10, name: 'Arial' } })
  return { monthAvgRow }
}

function writeReferenceAnalysisSheet(
  wb: ExcelJS.Workbook,
  model: EnterpriseWeatherModel,
  payload: WeatherClimateReportPayload,
  hourlyBounds: TableBounds,
): MeteoNativeChartSpec[] {
  const ws = wb.addWorksheet(REF_ANALYSIS_SHEET, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3, topLeftCell: 'B4', zoomScale: 70, zoomScaleNormal: 70 }],
  })
  ws.columns = [
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 10 },
  ]

  ws.mergeCells(1, 1, 1, 14)
  ws.getCell('A1').value = `Weather Data Analysis — Pivot Tables & Charts (${payload.dataSource || 'Hourly Data'})`
  analysisTitleStyle(ws.getCell('A1'))
  ws.getRow(1).height = 26
  ws.getCell('A2').value = 'Source data sheet:'
  ws.getCell('B2').value = REF_HOURLY_SHEET
  ws.getCell('A3').value = 'Period:'
  ws.getCell('B3').value = `${formatMdy(payload.analysisStart)} – ${formatMdy(payload.analysisEnd)} (${payload.timezone || 'UTC'})`
  ws.getCell('A2').font = ws.getCell('A3').font = { bold: true, name: 'Arial', size: 10 }

  const years = collectReferenceYears(model)
  const safeYears = years.length ? years : [Number(payload.analysisStart.slice(0, 4)) || new Date().getFullYear()]
  let row = 5
  writeAnalysisPivot(ws, row, 'Pivot 1 — Average Temperature (°C) by Year & Month', 'E', safeYears, hourlyBounds.lastRow)
  row += safeYears.length + 5
  writeAnalysisPivot(ws, row, 'Pivot 2 — Average Humidity (%) by Year & Month', 'I', safeYears, hourlyBounds.lastRow)
  row += safeYears.length + 5
  writeAnalysisPivot(ws, row, 'Pivot 3 — Average Wind Speed (m/s) by Year & Month', 'J', safeYears, hourlyBounds.lastRow)
  row += safeYears.length + 5
  writeAnalysisPivot(ws, row, 'Pivot 4 — Average Precipitation (mm/day) by Year & Month', 'K', safeYears, hourlyBounds.lastRow)
  row += safeYears.length + 5

  ws.mergeCells(row, 1, row, 6)
  ws.getCell(row, 1).value = 'Monthly Trend Table (Chronological) — Used for Trend Charts'
  analysisSectionStyle(ws.getCell(row, 1))
  const trendHeader = ws.getRow(row + 1)
  ;['Period', 'Avg Temp (°C)', 'Avg Humidity (%)', 'Avg Wind Speed (m/s)', 'Avg Precip (mm/day)'].forEach((label, i) => {
    trendHeader.getCell(i + 1).value = label
  })
  analysisHeaderRowStyle(trendHeader)

  const periods: Array<{ year: number; month: number; label: string }> = []
  safeYears.forEach(year => {
    for (let month = 1; month <= 12; month++) periods.push({ year, month, label: `${MONTH_NAMES[month - 1]}-${year}` })
  })
  const trendFirst = row + 2
  periods.forEach((p, i) => {
    const rowNum = trendFirst + i
    const tr = ws.getRow(rowNum)
    tr.getCell(1).value = p.label
    ;[
      ['E', 2],
      ['I', 3],
      ['J', 4],
      ['K', 5],
    ].forEach(([sourceCol, targetCol]) => {
      tr.getCell(Number(targetCol)).value = {
        formula: `IFERROR(AVERAGEIFS('${REF_HOURLY_SHEET}'!$${sourceCol}$7:$${sourceCol}$${hourlyBounds.lastRow},'${REF_HOURLY_SHEET}'!$A$7:$A$${hourlyBounds.lastRow},${p.year},'${REF_HOURLY_SHEET}'!$B$7:$B$${hourlyBounds.lastRow},${p.month}),"")`,
        result: undefined,
      }
    })
    analysisDataRowStyle(tr)
  })

  const trendLast = trendFirst + periods.length - 1
  return [
    {
      title: 'Average Temperature by Month',
      kind: 'line',
      anchorRow: 4,
      anchorCol: 7,
      sectionLabel: 'Temperature Chart',
      varyColors: false,
      series: [{ nameRef: `'${REF_ANALYSIS_SHEET}'!$B$${row + 1}`, valuesRef: `'${REF_ANALYSIS_SHEET}'!$B$${trendFirst}:$B$${trendLast}`, catsRef: `'${REF_ANALYSIS_SHEET}'!$A$${trendFirst}:$A$${trendLast}` }],
    },
    {
      title: 'Average Humidity by Month',
      kind: 'line',
      anchorRow: 20,
      anchorCol: 7,
      sectionLabel: 'Humidity Chart',
      varyColors: false,
      series: [{ nameRef: `'${REF_ANALYSIS_SHEET}'!$C$${row + 1}`, valuesRef: `'${REF_ANALYSIS_SHEET}'!$C$${trendFirst}:$C$${trendLast}`, catsRef: `'${REF_ANALYSIS_SHEET}'!$A$${trendFirst}:$A$${trendLast}` }],
    },
    {
      title: 'Average Wind Speed by Month',
      kind: 'line',
      anchorRow: 36,
      anchorCol: 7,
      sectionLabel: 'Wind Chart',
      varyColors: false,
      series: [{ nameRef: `'${REF_ANALYSIS_SHEET}'!$D$${row + 1}`, valuesRef: `'${REF_ANALYSIS_SHEET}'!$D$${trendFirst}:$D$${trendLast}`, catsRef: `'${REF_ANALYSIS_SHEET}'!$A$${trendFirst}:$A$${trendLast}` }],
    },
    {
      title: 'Average Precipitation by Month',
      kind: 'bar',
      anchorRow: 52,
      anchorCol: 7,
      sectionLabel: 'Precipitation Chart',
      legendPos: 'r',
      series: [{ nameRef: `'${REF_ANALYSIS_SHEET}'!$E$${row + 1}`, valuesRef: `'${REF_ANALYSIS_SHEET}'!$E$${trendFirst}:$E$${trendLast}`, catsRef: `'${REF_ANALYSIS_SHEET}'!$A$${trendFirst}:$A$${trendLast}` }],
    },
  ]
}

function writeHourlySheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): TableBounds {
  const ws = wb.addWorksheet(SHEET.hourly, { views: [{ state: 'frozen', ySplit: 1 }] })
  const cols = [
    'Date', 'Time', 'Temperature (°C)', 'Relative Humidity (%)', 'Rainfall (mm)',
    'Wind Speed (km/h)', 'Wind Direction (°)', 'Pressure (hPa)', 'Solar Radiation (W/m²)',
    'Cloud Cover (%)', 'ET₀ (mm)', 'UV Index',
  ]
  const header = ws.addRow(cols)
  styleTableHeader(header)
  model.hourlyRaw.forEach((r, i) => {
    const row = ws.addRow([
      r.date, r.time, fmtNum(r.temperatureC, 1), fmtNum(r.humidityPct, 0), fmtNum(r.rainfallMm, 2),
      fmtNum(r.windSpeedKmh, 1), fmtNum(r.windDirectionDeg, 0), fmtNum(r.pressureHpa, 1),
      fmtNum(r.solarRadiationWm2, 0), fmtNum(r.cloudCoverPct, 0), fmtNum(r.et0Mm, 2), fmtNum(r.uvIndex, 1),
    ])
    styleDataRow(row, i % 2 === 1)
  })
  const lastRow = header.number + model.hourlyRaw.length
  applyNumberFormat(ws, 3, '0.0', header.number + 1, lastRow)
  applyNumberFormat(ws, 5, '0.00', header.number + 1, lastRow)
  addExcelTable(ws, TABLE.hourly, header.number, cols.length, model.hourlyRaw.length, cols)
  autoWidth(ws, cols.length)
  return { headerRow: header.number, lastRow, colCount: cols.length }
}

function writeDailySheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): TableBounds {
  const ws = wb.addWorksheet(SHEET.daily, { views: [{ state: 'frozen', ySplit: 1 }] })
  const cols = [
    'Date', 'Min Temp (°C)', 'Max Temp (°C)', 'Avg Temp (°C)', 'Total Rainfall (mm)',
    'Avg Humidity (%)', 'Avg Wind (km/h)', 'Avg Pressure (hPa)', 'Avg Solar (W/m²)',
    'Avg Cloud Cover (%)', 'Daily ET₀ (mm)', 'Weather Classification', 'Weather Risk Level',
  ]
  const header = ws.addRow(cols)
  styleTableHeader(header)
  model.dailySummary.forEach((r, i) => {
    const row = ws.addRow([
      r.date, fmtNum(r.tempMinC, 1), fmtNum(r.tempMaxC, 1), fmtNum(r.tempAvgC, 1),
      fmtNum(r.totalRainfallMm, 1), fmtNum(r.avgHumidityPct, 0), fmtNum(r.avgWindSpeedKmh, 1),
      fmtNum(r.avgPressureHpa, 1), fmtNum(r.avgSolarRadiationWm2, 0), fmtNum(r.avgCloudCoverPct, 0),
      fmtNum(r.dailyEt0Mm, 2), r.weatherClassification, r.weatherRiskLevel,
    ])
    styleDataRow(row, i % 2 === 1)
    applyClassCell(row.getCell(13), r.weatherRiskLevel)
  })
  const lastRow = header.number + model.dailySummary.length
  addExcelTable(ws, TABLE.daily, header.number, cols.length, model.dailySummary.length, cols)
  autoWidth(ws, cols.length)
  return { headerRow: header.number, lastRow, colCount: cols.length }
}

function writeMonthlySheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): TableBounds {
  const ws = wb.addWorksheet(SHEET.monthly, { views: [{ state: 'frozen', ySplit: 1 }] })
  const cols = [
    'Month', 'Avg Temp (°C)', 'Max Temp (°C)', 'Min Temp (°C)', 'Total Rainfall (mm)',
    'Avg Humidity (%)', 'Avg Wind (km/h)', 'Avg Solar (W/m²)', 'Monthly ET₀ (mm)',
    'Monthly Change (%)', 'Seasonal Comparison', 'Historical Comparison', 'Climate Anomaly',
  ]
  const header = ws.addRow(cols)
  styleTableHeader(header)
  model.monthlySummary.forEach((r, i) => {
    const row = ws.addRow([
      r.monthLabel, fmtNum(r.avgTempC, 2), fmtNum(r.maxTempC, 1), fmtNum(r.minTempC, 1),
      fmtNum(r.totalRainfallMm, 1), fmtNum(r.avgHumidityPct, 1), fmtNum(r.avgWindSpeedKmh, 1),
      fmtNum(r.avgSolarRadiationWm2, 0), fmtNum(r.monthlyEt0Mm, 1), fmtNum(r.monthlyChangePct, 1),
      r.seasonalComparison, r.historicalAvgComparison, r.climateAnomaly,
    ])
    styleDataRow(row, i % 2 === 1)
  })
  const lastRow = header.number + model.monthlySummary.length
  addExcelTable(ws, TABLE.monthly, header.number, cols.length, model.monthlySummary.length, cols)
  autoWidth(ws, cols.length)
  return { headerRow: header.number, lastRow, colCount: cols.length }
}

function writeStatsSheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): void {
  const ws = wb.addWorksheet(SHEET.stats)
  const header = ws.addRow([
    'Parameter', 'Count', 'Mean', 'Median', 'Min', 'Max', 'Range', 'Std Dev', 'Variance', 'P10', 'P50', 'P90', 'Trend',
  ])
  styleTableHeader(header)
  model.statistics.forEach((r, i) => {
    const row = ws.addRow([
      r.parameter, r.count, fmtNum(r.mean, 2), fmtNum(r.median, 2), fmtNum(r.min, 2), fmtNum(r.max, 2),
      fmtNum(r.range, 2), fmtNum(r.stdDev, 2), fmtNum(r.variance, 2), fmtNum(r.p10, 2), fmtNum(r.p50, 2),
      fmtNum(r.p90, 2), r.trend,
    ])
    styleDataRow(row, i % 2 === 1)
  })

  const pivotStart = header.number + model.statistics.length + 3
  const pt = ws.getCell(pivotStart, 1)
  pt.value = 'Pivot-Style Summary (live formulas → edit source tables to refresh)'
  styleSection(pt)
  ws.mergeCells(pivotStart, 1, pivotStart, 4)

  const formulaRows: Array<[string, string]> = [
    ['Hourly record count', `=ROWS(${TABLE.hourly}[Date])`],
    ['Daily record count', `=ROWS(${TABLE.daily}[Date])`],
    ['Mean daily temperature', `=AVERAGE(${TABLE.daily}[Avg Temp (°C)])`],
    ['Total rainfall (daily sum)', `=SUM(${TABLE.daily}[Total Rainfall (mm)])`],
    ['Mean monthly ET₀', `=AVERAGE(${TABLE.monthly}[Monthly ET₀ (mm)])`],
    ['Max daily temperature', `=MAX(${TABLE.daily}[Max Temp (°C)])`],
    ['Min daily temperature', `=MIN(${TABLE.daily}[Min Temp (°C)])`],
  ]
  formulaRows.forEach(([label, formula], i) => {
    const r = pivotStart + 1 + i
    ws.getCell(r, 1).value = label
    ws.getCell(r, 2).value = { formula, result: undefined }
    ws.getCell(r, 1).font = { bold: true }
  })

  ws.addRow([])
  const corrTitle = ws.addRow(['Correlation Matrix'])
  styleSection(corrTitle.getCell(1))
  const corrHeader = ws.addRow(['Variable A', 'Variable B', 'Pearson r'])
  styleTableHeader(corrHeader)
  model.correlations.forEach((c, i) => {
    const row = ws.addRow([c.a, c.b, fmtNum(c.r, 3)])
    styleDataRow(row, i % 2 === 1)
  })
  autoWidth(ws, 13)
}

function writeComparisonSheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): void {
  const ws = wb.addWorksheet(SHEET.comparison)
  const header = ws.addRow([
    'Comparison', 'Metric', 'Current', 'Previous', 'Difference', '% Change', 'Trend', 'Performance Score', 'Classification', 'AI Explanation',
  ])
  styleTableHeader(header)
  model.comparisons.forEach((r, i) => {
    const rowNum = header.number + 1 + i
    const row = ws.getRow(rowNum)
    row.getCell(1).value = r.comparison
    row.getCell(2).value = r.metric
    row.getCell(3).value = fmtNum(r.currentValue, 2)
    row.getCell(4).value = fmtNum(r.previousValue, 2)
    row.getCell(5).value = formulaDiff('C', 'D', rowNum)
    row.getCell(6).value = formulaPctChange('E', 'D', rowNum)
    row.getCell(7).value = formulaTrendArrow('E', rowNum)
    row.getCell(8).value = fmtNum(r.performanceScore, 1)
    row.getCell(9).value = r.classification
    row.getCell(10).value = r.aiExplanation
    styleDataRow(row, i % 2 === 1)
  })
  applyNumberFormat(ws, 6, '0.0', header.number + 1, header.number + model.comparisons.length)
  autoWidth(ws, 10)
}

function writeChangeSheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): void {
  const ws = wb.addWorksheet(SHEET.change)
  const header = ws.addRow([
    'Parameter', 'Event', 'Start', 'End', 'Previous', 'Current', 'Difference', '% Change', 'Severity', 'Status Map',
  ])
  styleTableHeader(header)
  model.changeEvents.forEach((r, i) => {
    const rowNum = header.number + 1 + i
    const row = ws.getRow(rowNum)
    row.getCell(1).value = r.parameter
    row.getCell(2).value = r.eventType
    row.getCell(3).value = r.startDate
    row.getCell(4).value = r.endDate
    row.getCell(5).value = fmtNum(r.previousValue, 1)
    row.getCell(6).value = fmtNum(r.currentValue, 1)
    row.getCell(7).value = formulaDiff('F', 'E', rowNum)
    row.getCell(8).value = formulaPctChange('G', 'E', rowNum)
    row.getCell(9).value = r.severity
    row.getCell(10).value = r.statusMap
    styleDataRow(row, i % 2 === 1)
    row.getCell(10).font = { name: 'Consolas', size: 9 }
  })
  autoWidth(ws, 10)
}

function writeIndicatorsSheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): TableBounds {
  const ws = wb.addWorksheet(SHEET.indicators, { views: [{ state: 'frozen', ySplit: 1 }] })
  const cols = ['Indicator', 'Value', 'Score', 'Classification', 'Status Map', 'Interpretation']
  const header = ws.addRow(cols)
  styleTableHeader(header)
  model.indicators.forEach((r, i) => {
    const row = ws.addRow([r.indicator, r.value, r.numericScore, r.classification, r.statusMap, r.interpretation])
    styleDataRow(row, i % 2 === 1)
    applyClassCell(row.getCell(4), r.classification)
    row.getCell(5).font = { name: 'Consolas', size: 9 }
  })
  addExcelTable(ws, TABLE.indicators, header.number, cols.length, model.indicators.length, cols)
  autoWidth(ws, 6)
  return { headerRow: header.number, lastRow: header.number + model.indicators.length, colCount: 6 }
}

function writeKpiSheet(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): TableBounds {
  const ws = wb.addWorksheet(SHEET.kpis, { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.getCell('A1').value = 'Executive KPI Dashboard'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:I1')
  ws.getCell('A2').value = model.locationLine
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } }

  const header = ws.addRow([
    'KPI', 'Current', 'Previous', 'Difference', '% Change', 'Trend', 'Status', 'Status Map',
  ])
  styleTableHeader(header)
  model.executiveKpis.forEach((k, i) => {
    const rowNum = header.number + 1 + i
    const row = ws.getRow(rowNum)
    row.getCell(1).value = k.label
    const cur = parseNum(k.currentValue)
    const prev = parseNum(k.previousValue)
    if (cur !== '' && prev !== '') {
      row.getCell(2).value = cur
      row.getCell(3).value = prev
      row.getCell(4).value = formulaDiff('B', 'C', rowNum)
      row.getCell(5).value = formulaPctChange('D', 'C', rowNum)
      row.getCell(6).value = formulaTrendArrow('D', rowNum)
    } else {
      row.getCell(2).value = k.currentValue
      row.getCell(3).value = k.previousValue
      row.getCell(4).value = k.difference
      row.getCell(5).value = k.pctChange
      row.getCell(6).value = k.trendArrow
    }
    row.getCell(7).value = k.colorStatus
    row.getCell(8).value = k.statusMap
    styleDataRow(row, i % 2 === 1)
    applyClassCell(row.getCell(7), k.colorStatus)
    row.getCell(8).font = { name: 'Consolas', size: 9 }
  })

  autoWidth(ws, 8)
  return { headerRow: header.number, lastRow: header.number + model.executiveKpis.length, colCount: 8 }
}

function meanFinite(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function heatColor(temp: number | null): string {
  if (temp == null) return 'FFF1F5F9'
  if (temp >= 35) return 'FFEF4444'
  if (temp >= 30) return 'FFF97316'
  if (temp >= 25) return 'FFFBBF24'
  if (temp >= 20) return 'FF86EFAC'
  if (temp >= 15) return 'FF6EE7B7'
  return 'FF93C5FD'
}

function writeChartsDashboard(
  model: EnterpriseWeatherModel,
  hourly: TableBounds,
  daily: TableBounds,
  monthly: TableBounds,
  kpis: TableBounds,
  wb: ExcelJS.Workbook,
): MeteoNativeChartSpec[] {
  const ws = wb.addWorksheet(SHEET.charts)
  ws.getColumn(1).width = 44

  ws.getCell('M1').value = 'Direction'
  ws.getCell('N1').value = 'Frequency %'
  model.windRose.forEach((w, i) => {
    ws.getCell(`M${i + 2}`).value = w.direction
    ws.getCell(`N${i + 2}`).value = w.frequencyPct
  })

  ws.getCell('J1').value = 'Period'
  ws.getCell('K1').value = 'Avg Temp (°C)'
  ws.getCell('L1').value = 'Rainfall (mm)'
  model.climateTimeline.forEach((p, i) => {
    ws.getCell(`J${i + 2}`).value = p.period
    ws.getCell(`K${i + 2}`).value = p.avgTempC != null ? fmtNum(p.avgTempC, 1) : ''
    ws.getCell(`L${i + 2}`).value = p.totalRainMm != null ? fmtNum(p.totalRainMm, 1) : ''
  })

  const histTemp = meanFinite(model.monthlySummary.map(m => m.avgTempC))
  const histRain = meanFinite(model.monthlySummary.map(m => m.totalRainfallMm))
  ws.getCell('Q1').value = 'Month'
  ws.getCell('R1').value = 'Temp Anomaly (°C)'
  ws.getCell('S1').value = 'Rain Anomaly (%)'
  model.monthlySummary.forEach((m, i) => {
    const tempAnom = m.avgTempC != null && histTemp != null ? m.avgTempC - histTemp : null
    const rainAnom =
      m.totalRainfallMm != null && histRain != null && histRain > 0
        ? ((m.totalRainfallMm - histRain) / histRain) * 100
        : null
    ws.getCell(`Q${i + 2}`).value = m.monthLabel
    ws.getCell(`R${i + 2}`).value = tempAnom != null ? fmtNum(tempAnom, 2) : ''
    ws.getCell(`S${i + 2}`).value = rainAnom != null ? fmtNum(rainAnom, 1) : ''
  })

  ws.getCell('P1').value = 'Temperature Heatmap (conditional formatting)'
  styleSection(ws.getCell('P1'))
  model.heatmapMatrix.months.forEach((m, mi) => {
    ws.getCell(2 + mi, 16).value = m
  })
  model.heatmapMatrix.days.forEach((d, di) => {
    if (di < 31) ws.getCell(1, 17 + di).value = d
  })
  let vi = 0
  for (let mi = 0; mi < model.heatmapMatrix.months.length; mi++) {
    for (let di = 0; di < model.heatmapMatrix.days.length; di++) {
      const v = model.heatmapMatrix.values[vi++]
      const cell = ws.getCell(2 + mi, 17 + di)
      cell.value = v != null ? fmtNum(v, 1) : ''
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: heatColor(v) } }
    }
  }

  const specs: MeteoNativeChartSpec[] = []
  const sectionRows: Array<{ row: number; label: string }> = []
  let anchor = 0
  const push = (
    sectionLabel: string,
    title: string,
    kind: MeteoNativeChartSpec['kind'],
    series: MeteoNativeChartSpec['series'],
    opts?: { varyColors?: boolean; legendPos?: 'b' | 'r'; lineSeriesIndexes?: number[] },
  ) => {
    sectionRows.push({ row: anchor + 1, label: sectionLabel })
    specs.push({
      title,
      kind,
      series,
      anchorRow: anchor,
      sectionLabel,
      varyColors: opts?.varyColors ?? kind === 'bar',
      legendPos: opts?.legendPos ?? 'b',
      lineSeriesIndexes: opts?.lineSeriesIndexes,
    })
    anchor += 16
  }

  const hSheet = SHEET.hourly
  const dSheet = SHEET.daily
  const mSheet = SHEET.monthly
  const hFirst = hourly.headerRow + 1
  const hLast = hourly.lastRow
  const dFirst = daily.headerRow + 1
  const dLast = daily.lastRow
  const mFirst = monthly.headerRow + 1
  const mLast = monthly.lastRow

  if (hLast >= hFirst) {
    const catsH = sheetRange(hSheet, 1, hFirst, hLast)
    const timeCats = sheetRange(hSheet, 2, hFirst, hLast)
    push('Hourly Temperature', 'Hourly Temperature Trend', 'line', [
      { nameRef: sheetRef(hSheet, 3, hourly.headerRow), valuesRef: sheetRange(hSheet, 3, hFirst, hLast), catsRef: timeCats },
    ], { varyColors: false })
    push('Hourly Rainfall', 'Hourly Rainfall Trend', 'bar', [
      { nameRef: sheetRef(hSheet, 5, hourly.headerRow), valuesRef: sheetRange(hSheet, 5, hFirst, hLast), catsRef: timeCats },
    ])
    push('Hourly Humidity', 'Hourly Humidity Trend', 'area', [
      { nameRef: sheetRef(hSheet, 4, hourly.headerRow), valuesRef: sheetRange(hSheet, 4, hFirst, hLast), catsRef: timeCats },
    ])
    push('Hourly Solar', 'Hourly Solar Radiation Trend', 'line', [
      { nameRef: sheetRef(hSheet, 9, hourly.headerRow), valuesRef: sheetRange(hSheet, 9, hFirst, hLast), catsRef: timeCats },
    ])
    push('Hourly Pressure', 'Hourly Pressure Trend', 'line', [
      { nameRef: sheetRef(hSheet, 8, hourly.headerRow), valuesRef: sheetRange(hSheet, 8, hFirst, hLast), catsRef: timeCats },
    ])
  }

  if (dLast >= dFirst) {
    const catsD = sheetRange(dSheet, 1, dFirst, dLast)
    push('Daily Temperature', 'Daily Temperature Trend', 'line', [
      { nameRef: sheetRef(dSheet, 2, daily.headerRow), valuesRef: sheetRange(dSheet, 2, dFirst, dLast), catsRef: catsD },
      { nameRef: sheetRef(dSheet, 3, daily.headerRow), valuesRef: sheetRange(dSheet, 3, dFirst, dLast), catsRef: catsD },
      { nameRef: sheetRef(dSheet, 4, daily.headerRow), valuesRef: sheetRange(dSheet, 4, dFirst, dLast), catsRef: catsD },
    ], { varyColors: false })
    push('Rainfall Distribution', 'Rainfall Distribution', 'bar', [
      { nameRef: sheetRef(dSheet, 5, daily.headerRow), valuesRef: sheetRange(dSheet, 5, dFirst, dLast), catsRef: catsD },
    ])
    push('Rainfall Trend', 'Rainfall Trend', 'line', [
      { nameRef: sheetRef(dSheet, 5, daily.headerRow), valuesRef: sheetRange(dSheet, 5, dFirst, dLast), catsRef: catsD },
    ])
    push('Humidity Trend', 'Humidity Trend', 'line', [
      { nameRef: sheetRef(dSheet, 6, daily.headerRow), valuesRef: sheetRange(dSheet, 6, dFirst, dLast), catsRef: catsD },
    ])
    push('Wind Speed', 'Wind Speed Trend', 'line', [
      { nameRef: sheetRef(dSheet, 7, daily.headerRow), valuesRef: sheetRange(dSheet, 7, dFirst, dLast), catsRef: catsD },
    ])
    push('Solar Radiation', 'Solar Radiation Trend', 'line', [
      { nameRef: sheetRef(dSheet, 9, daily.headerRow), valuesRef: sheetRange(dSheet, 9, dFirst, dLast), catsRef: catsD },
    ])
    push('Pressure Trend', 'Atmospheric Pressure Trend', 'line', [
      { nameRef: sheetRef(dSheet, 8, daily.headerRow), valuesRef: sheetRange(dSheet, 8, dFirst, dLast), catsRef: catsD },
    ])
    push('ET₀ Trend', 'ET₀ Trend', 'line', [
      { nameRef: sheetRef(dSheet, 11, daily.headerRow), valuesRef: sheetRange(dSheet, 11, dFirst, dLast), catsRef: catsD },
    ])
    push('Rainfall vs ET₀', 'Rainfall vs ET₀', 'combo', [
      { nameRef: sheetRef(dSheet, 5, daily.headerRow), valuesRef: sheetRange(dSheet, 5, dFirst, dLast), catsRef: catsD },
      { nameRef: sheetRef(dSheet, 11, daily.headerRow), valuesRef: sheetRange(dSheet, 11, dFirst, dLast), catsRef: catsD },
    ], { varyColors: false, lineSeriesIndexes: [1] })
    push('Temperature vs Humidity', 'Temperature vs Humidity', 'scatter', [
      { name: 'Daily points', valuesRef: sheetRange(dSheet, 4, dFirst, dLast), catsRef: sheetRange(dSheet, 6, dFirst, dLast) },
    ])
  }

  if (mLast >= mFirst) {
    const catsM = sheetRange(mSheet, 1, mFirst, mLast)
    push('Monthly Temperature', 'Monthly Temperature Trend', 'line', [
      { nameRef: sheetRef(mSheet, 2, monthly.headerRow), valuesRef: sheetRange(mSheet, 2, mFirst, mLast), catsRef: catsM },
    ])
    push('Monthly Comparison', 'Monthly Weather Comparison', 'bar', [
      { nameRef: sheetRef(mSheet, 2, monthly.headerRow), valuesRef: sheetRange(mSheet, 2, mFirst, mLast), catsRef: catsM },
      { nameRef: sheetRef(mSheet, 5, monthly.headerRow), valuesRef: sheetRange(mSheet, 5, mFirst, mLast), catsRef: catsM },
    ], { varyColors: false, legendPos: 'r' })
    push('Monthly Change', 'Monthly Change (%)', 'bar', [
      { nameRef: sheetRef(mSheet, 10, monthly.headerRow), valuesRef: sheetRange(mSheet, 10, mFirst, mLast), catsRef: catsM },
    ], { legendPos: 'r' })
  }

  const tlLen = model.climateTimeline.length
  if (tlLen > 0) {
    const tlCats = `'${SHEET.charts}'!$J$2:$J$${tlLen + 1}`
    push('Climate Timeline', 'Climate Change Timeline', 'combo', [
      { name: 'Avg Temperature', valuesRef: `'${SHEET.charts}'!$K$2:$K$${tlLen + 1}`, catsRef: tlCats },
      { name: 'Rainfall', valuesRef: `'${SHEET.charts}'!$L$2:$L$${tlLen + 1}`, catsRef: tlCats },
    ], { varyColors: false, lineSeriesIndexes: [1] })
  }

  const anomLen = model.monthlySummary.length
  if (anomLen > 0) {
    const anomCats = `'${SHEET.charts}'!$Q$2:$Q$${anomLen + 1}`
    push('Temperature Anomaly', 'Temperature Anomaly', 'line', [
      { name: 'Temp Anomaly (°C)', valuesRef: `'${SHEET.charts}'!$R$2:$R$${anomLen + 1}`, catsRef: anomCats },
    ], { varyColors: false })
    push('Rainfall Anomaly', 'Rainfall Anomaly', 'bar', [
      { name: 'Rain Anomaly (%)', valuesRef: `'${SHEET.charts}'!$S$2:$S$${anomLen + 1}`, catsRef: anomCats },
    ])
  }

  const windCats = `'${SHEET.charts}'!$M$2:$M$${model.windRose.length + 1}`
  const windVals = `'${SHEET.charts}'!$N$2:$N$${model.windRose.length + 1}`
  push('Wind Rose', 'Wind Rose', 'bar', [
    { name: 'Frequency %', valuesRef: windVals, catsRef: windCats },
  ], { legendPos: 'r' })

  const kFirst = kpis.headerRow + 1
  const kLast = kpis.lastRow
  if (kLast >= kFirst) {
    push('Weather Risk', 'Weather Risk Trend', 'bar', [
      { name: 'KPI Score', valuesRef: sheetRange(SHEET.kpis, 2, kFirst, Math.min(kFirst + 7, kLast)), catsRef: sheetRange(SHEET.kpis, 1, kFirst, Math.min(kFirst + 7, kLast)) },
    ], { legendPos: 'r' })
    push('Heat Stress', 'Heat Stress Trend', 'line', [
      { name: 'Heat Stress', valuesRef: sheetRange(SHEET.kpis, 2, kFirst + 8, kFirst + 8), catsRef: sheetRange(SHEET.kpis, 1, kFirst + 8, kFirst + 8) },
    ])
    push('Drought', 'Drought Trend', 'line', [
      { name: 'Drought', valuesRef: sheetRange(SHEET.kpis, 2, kFirst + 9, kFirst + 9), catsRef: sheetRange(SHEET.kpis, 1, kFirst + 9, kFirst + 9) },
    ])
  }

  const compSheet = SHEET.comparison
  push('Comparison Dashboard', 'Comparison Dashboard', 'bar', [
    { name: 'Current', valuesRef: `'${compSheet}'!$C$2:$C$${Math.min(8, model.comparisons.length + 1)}`, catsRef: `'${compSheet}'!$B$2:$B$${Math.min(8, model.comparisons.length + 1)}` },
    { name: 'Previous', valuesRef: `'${compSheet}'!$D$2:$D$${Math.min(8, model.comparisons.length + 1)}`, catsRef: `'${compSheet}'!$B$2:$B$${Math.min(8, model.comparisons.length + 1)}` },
  ], { varyColors: false, legendPos: 'r' })

  const chSheet = SHEET.change
  if (model.changeEvents.length) {
    push('Change Detection', 'Change Detection Dashboard', 'bar', [
      { name: 'Severity', valuesRef: `'${chSheet}'!$G$2:$G$${Math.min(10, model.changeEvents.length + 1)}`, catsRef: `'${chSheet}'!$B$2:$B$${Math.min(10, model.changeEvents.length + 1)}` },
    ], { legendPos: 'r' })
  }

  for (const { row, label } of sectionRows) {
    const cell = ws.getCell(row, 1)
    cell.value = label
    styleSection(cell)
  }

  return specs
}

function writeExecutiveSummary(wb: ExcelJS.Workbook, model: EnterpriseWeatherModel): void {
  const ws = wb.addWorksheet(SHEET.summary)
  ws.getCell('A1').value = model.title
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:F1')
  ws.getCell('A2').value = model.sourceLine
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } }

  ws.addRow([])
  const nav = ws.addRow(['Workbook Navigation'])
  styleSection(nav.getCell(1))
  const links = [
    SHEET.hourly, SHEET.daily, SHEET.monthly, SHEET.stats, SHEET.comparison,
    SHEET.change, SHEET.indicators, SHEET.charts, SHEET.kpis,
  ]
  links.forEach((name, i) => setSheetLink(ws, 5 + i, 1, name, `→ ${name}`))

  const sections: Array<[string, string[]]> = [
    ['Overall Weather Conditions', [model.executiveSummary.overallConditions]],
    ['Key Trends', model.executiveSummary.keyFindings],
    ['Significant Changes', model.executiveSummary.changeDetection],
    ['Comparison Results', model.executiveSummary.comparisonResults.slice(0, 8)],
    ['Weather Anomalies', model.executiveSummary.keyFindings.slice(-2)],
    ['Agricultural Impacts', model.executiveSummary.agriculturalImpact],
    ['Risk Assessment', [model.executiveSummary.riskAssessment]],
    ['Recommended Actions', model.executiveSummary.aiRecommendations],
  ]
  let row = 5 + links.length + 2
  sections.forEach(([heading, bullets]) => {
    const h = ws.getRow(row++)
    h.getCell(1).value = heading
    styleSection(h.getCell(1))
    bullets.forEach(b => {
      ws.getRow(row).getCell(1).value = `• ${b}`
      ws.getRow(row).getCell(1).alignment = { wrapText: true }
      row++
    })
    row++
  })
  autoWidth(ws, 4)
}

export async function buildEnterpriseWeatherWorkbook(
  payload: WeatherClimateReportPayload,
): Promise<ExcelJS.Workbook & { __meteoChartSpecs?: MeteoNativeChartSpec[]; __chartsSheetName?: string }> {
  const wb = new ExcelJS.Workbook() as ExcelJS.Workbook & {
    __meteoChartSpecs?: MeteoNativeChartSpec[]
    __chartsSheetName?: string
  }
  wb.creator = 'AgroCloud Weather Intelligence'
  wb.created = new Date()
  wb.title = `Weather Intelligence — ${payload.aoiName}`
  wb.company = 'AgroCloud / GeoSyntra'

  const model = buildEnterpriseWeatherModel(payload)
  const hourly = writeReferenceHourlySheet(wb, model, payload)
  const chartSpecs = writeReferenceAnalysisSheet(wb, model, payload, hourly)

  wb.__meteoChartSpecs = chartSpecs
  wb.__chartsSheetName = REF_ANALYSIS_SHEET
  return wb
}

export function enterpriseReportFilename(aoiName: string, aggregation?: string): string {
  const slug = aoiName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'AOI'
  const date = new Date().toISOString().slice(0, 10)
  const agg = aggregation ? `_${aggregation}` : ''
  return `${slug}-WeatherIntelligence${agg}-${date}.xlsx`
}

export async function generateEnterpriseWeatherReportExcel(
  payload: WeatherClimateReportPayload,
): Promise<void> {
  const wb = await buildEnterpriseWeatherWorkbook(payload)
  const specs = wb.__meteoChartSpecs ?? []
  const raw = await wb.xlsx.writeBuffer()
  const { injectNativeMeteoCharts } = await import('./meteoNativeExcelCharts')
  const withCharts = await injectNativeMeteoCharts(raw as ArrayBuffer, specs, wb.__chartsSheetName ?? REF_ANALYSIS_SHEET)
  const blob = new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = enterpriseReportFilename(
    payload.aoiName,
    climateAggregationLabel(payload.timeAggregation ?? 'day'),
  )
  a.click()
  URL.revokeObjectURL(url)
}

export function enterpriseHourlyCsv(model: EnterpriseWeatherModel): string {
  const headers = [
    'Date', 'Time', 'Temperature_C', 'Humidity_pct', 'Rainfall_mm', 'Wind_kmh', 'WindDir_deg',
    'Pressure_hPa', 'Solar_Wm2', 'Cloud_pct', 'ET0_mm', 'UV',
  ]
  const lines = [headers.join(',')]
  model.hourlyRaw.forEach(r => {
    lines.push([
      r.date, r.time, r.temperatureC ?? '', r.humidityPct ?? '', r.rainfallMm ?? '',
      r.windSpeedKmh ?? '', r.windDirectionDeg ?? '', r.pressureHpa ?? '',
      r.solarRadiationWm2 ?? '', r.cloudCoverPct ?? '', r.et0Mm ?? '', r.uvIndex ?? '',
    ].join(','))
  })
  return lines.join('\n')
}

export async function generateEnterpriseWeatherReportCsv(
  payload: WeatherClimateReportPayload,
): Promise<void> {
  const model = buildEnterpriseWeatherModel(payload)
  const csv = enterpriseHourlyCsv(model)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = enterpriseReportFilename(payload.aoiName).replace('.xlsx', '.csv')
  a.click()
  URL.revokeObjectURL(url)
}
