/**
 * Professional Weather – Temperature XLSX: multi-scale data + Analysis + native Excel charts.
 */
import ExcelJS from 'exceljs'
import type { MeteoNativeChartSpec } from './meteoNativeExcelCharts'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  addExcelTable,
  applyNumberFormat,
  autoWidth,
  fmtNum,
  setSheetLink,
  sheetRange,
  sheetRef,
  styleDataRow,
  styleSection,
  styleTableHeader,
  styleTitle,
} from './weatherExcelHelpers'
import {
  TEMP_CHART_HOURLY_CAP,
  buildTemperatureReportModel,
  type TempHourlyRow,
  type TempPeriodRow,
  type TemperatureReportModel,
} from './weatherTemperatureReportModel'

export const TEMP_SHEET = {
  cover: 'Cover',
  hourly: 'Data Hourly',
  daily: 'Data Daily',
  weekly: 'Data Weekly',
  monthly: 'Data Monthly',
  yearly: 'Data Yearly',
  analysis: 'Analysis',
  chartsHourly: 'Charts Hourly',
  chartsDaily: 'Charts Daily',
  chartsMonthly: 'Charts Monthly',
} as const

type SheetBounds = { name: string; headerRow: number; firstRow: number; lastRow: number; colCount: number }

type WorkbookWithCharts = ExcelJS.Workbook & {
  __meteoChartSpecs?: MeteoNativeChartSpec[]
  __chartsSheetName?: string
}

type AnalysisExtras = {
  __normals?: { header: number; first: number; last: number }
  __diurnal?: { first: number; last: number }
  __indicators?: { header: number; first: number; last: number }
}

const PERIOD_COLS = [
  'Period',
  'Tmax °C',
  'Tmin °C',
  'Tavg °C',
  'Diurnal Range °C',
  'Precipitation mm',
  'Humidity %',
  'Wind Speed km/h',
  'ET0 mm',
] as const

const TITLE_FILL = 'FF1F4E78'
const HEADER_SPAN = 10

function writeReportHeader(ws: ExcelJS.Worksheet, model: TemperatureReportModel, sectionTitle: string): number {
  ws.mergeCells(1, 1, 1, HEADER_SPAN)
  const t = ws.getCell(1, 1)
  t.value = model.title
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  t.alignment = { vertical: 'middle', wrapText: true }
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, HEADER_SPAN)
  ws.getCell(2, 1).value = model.locationLine
  ws.getCell(2, 1).font = { size: 10, italic: true }

  ws.mergeCells(3, 1, 3, HEADER_SPAN)
  ws.getCell(3, 1).value = model.sourceLine
  ws.getCell(3, 1).font = { size: 9, color: { argb: 'FF64748B' } }

  ws.mergeCells(4, 1, 4, HEADER_SPAN)
  ws.getCell(4, 1).value =
    `${sectionTitle} · ${model.analysisStart} → ${model.analysisEnd} (${model.timezone}) · Primary Aggregate: ${model.aggregationLabel}`
  ws.getCell(4, 1).font = { size: 10, bold: true, color: { argb: 'FF065F46' } }

  return 6
}

function writePeriodSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  model: TemperatureReportModel,
  sectionTitle: string,
  rows: TempPeriodRow[],
  tableName: string,
  includeAnomaly = false,
): SheetBounds {
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 6 }] })
  const headerRow = writeReportHeader(ws, model, sectionTitle)
  const cols = includeAnomaly ? [...PERIOD_COLS, 'Anomaly °C'] : [...PERIOD_COLS]
  const header = ws.getRow(headerRow)
  cols.forEach((c, i) => {
    header.getCell(i + 1).value = c
  })
  styleTableHeader(header)

  rows.forEach((r, i) => {
    const values: Array<string | number> = [
      r.periodLabel,
      fmtNum(r.tmaxC, 1),
      fmtNum(r.tminC, 1),
      fmtNum(r.tavgC, 1),
      fmtNum(r.diurnalRangeC, 1),
      fmtNum(r.rainfallMm, 2),
      fmtNum(r.humidityPct, 0),
      fmtNum(r.windSpeedKmh, 1),
      fmtNum(r.et0Mm, 2),
    ]
    if (includeAnomaly) values.push(fmtNum(r.anomalyC ?? null, 2))
    const row = ws.addRow(values)
    styleDataRow(row, i % 2 === 1)
  })

  const lastRow = headerRow + rows.length
  const firstRow = headerRow + 1
  if (rows.length) {
    addExcelTable(ws, tableName, headerRow, cols.length, rows.length, [...cols])
    applyNumberFormat(ws, 2, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 3, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 4, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 5, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 6, '0.00', firstRow, lastRow)
    applyNumberFormat(ws, 8, '0.0', firstRow, lastRow)
  }
  autoWidth(ws, cols.length)
  return { name: sheetName, headerRow, firstRow, lastRow: Math.max(lastRow, headerRow), colCount: cols.length }
}

function writeHourlySheet(wb: ExcelJS.Workbook, model: TemperatureReportModel): SheetBounds {
  const ws = wb.addWorksheet(TEMP_SHEET.hourly, { views: [{ state: 'frozen', ySplit: 6 }] })
  const headerRow = writeReportHeader(ws, model, 'Hourly Climate Series')
  const cols = [
    'Period',
    'Date',
    'Time',
    'Tmax °C',
    'Tmin °C',
    'Tavg °C',
    'Precipitation mm/h',
    'Humidity %',
    'Wind Speed km/h',
  ]
  const header = ws.getRow(headerRow)
  cols.forEach((c, i) => {
    header.getCell(i + 1).value = c
  })
  styleTableHeader(header)

  model.hourly.forEach((r: TempHourlyRow, i) => {
    const row = ws.addRow([
      `${r.date} ${r.time}`,
      r.date,
      r.time,
      fmtNum(r.tmaxC, 1),
      fmtNum(r.tminC, 1),
      fmtNum(r.tavgC, 1),
      fmtNum(r.rainfallMm, 2),
      fmtNum(r.humidityPct, 0),
      fmtNum(r.windSpeedKmh, 1),
    ])
    styleDataRow(row, i % 2 === 1)
  })

  const lastRow = headerRow + model.hourly.length
  const firstRow = headerRow + 1
  if (model.hourly.length) {
    addExcelTable(ws, 'TempHourly', headerRow, cols.length, model.hourly.length, cols)
    applyNumberFormat(ws, 4, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 5, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 6, '0.0', firstRow, lastRow)
    applyNumberFormat(ws, 7, '0.00', firstRow, lastRow)
    applyNumberFormat(ws, 9, '0.0', firstRow, lastRow)
  }
  autoWidth(ws, cols.length)
  return {
    name: TEMP_SHEET.hourly,
    headerRow,
    firstRow,
    lastRow: Math.max(lastRow, headerRow),
    colCount: cols.length,
  }
}

type CumBlock = {
  labelCol: number
  rainCol: number
  cumCol: number
  first: number
  last: number
}

function writePeriodCumulativeBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  rows: TempPeriodRow[],
  blockTitle: string,
): CumBlock | null {
  if (rows.length < 2) return null
  const labelCol = startCol
  const rainCol = startCol + 1
  const cumCol = startCol + 2
  ws.getCell(startRow, labelCol).value = `${blockTitle} Period`
  ws.getCell(startRow, rainCol).value = 'Precipitation mm'
  ws.getCell(startRow, cumCol).value = 'Cumulative Precipitation mm'
  styleSection(ws.getCell(startRow, labelCol))
  styleSection(ws.getCell(startRow, rainCol))
  styleSection(ws.getCell(startRow, cumCol))
  let cum = 0
  rows.forEach((r, i) => {
    const row = startRow + 1 + i
    const rain = r.rainfallMm
    if (rain != null && Number.isFinite(rain)) cum += rain
    ws.getCell(row, labelCol).value = r.periodLabel
    ws.getCell(row, rainCol).value = rain ?? ''
    ws.getCell(row, cumCol).value = Number(cum.toFixed(2))
  })
  return {
    labelCol,
    rainCol,
    cumCol,
    first: startRow + 1,
    last: startRow + rows.length,
  }
}

function writeCover(wb: ExcelJS.Workbook, model: TemperatureReportModel, sheetNames: string[]): void {
  const ws = wb.addWorksheet(TEMP_SHEET.cover)
  ws.getCell(1, 1).value = model.title
  styleTitle(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, 3)
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }

  const meta: Array<[string, string]> = [
    ['Location', model.locationLine],
    ['AOI', model.aoiName],
    ['Period', `${model.analysisStart} → ${model.analysisEnd}`],
    ['Timezone', model.timezone],
    ['Primary Aggregate', model.aggregationLabel],
    ['Source', model.sourceLine],
    ['Generated', `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`],
  ]
  meta.forEach(([k, v], i) => {
    const row = 3 + i
    ws.getCell(row, 1).value = k
    ws.getCell(row, 1).font = { bold: true }
    ws.getCell(row, 2).value = v
    ws.mergeCells(row, 2, row, 3)
  })

  const indexRow = 3 + meta.length + 2
  ws.getCell(indexRow, 1).value = 'Workbook contents'
  styleSection(ws.getCell(indexRow, 1))
  ws.mergeCells(indexRow, 1, indexRow, 3)

  sheetNames.forEach((name, i) => {
    setSheetLink(ws, indexRow + 1 + i, 1, name, name)
    ws.getCell(indexRow + 1 + i, 2).value =
      name === TEMP_SHEET.chartsHourly ||
      name === TEMP_SHEET.chartsDaily ||
      name === TEMP_SHEET.chartsMonthly
        ? 'Native Excel charts (editable)'
        : name === TEMP_SHEET.analysis
          ? 'Statistics, comparisons, heat indicators'
          : 'Climate data table'
  })

  const kpiRow = indexRow + sheetNames.length + 3
  ws.getCell(kpiRow, 1).value = 'Temperature snapshot'
  styleSection(ws.getCell(kpiRow, 1))
  ws.mergeCells(kpiRow, 1, kpiRow, 3)
  const kpis: Array<[string, number | string]> = [
    ['Heat days ≥35°C', model.heatDays35],
    ['Heat days ≥40°C', model.heatDays40],
    ['Cool nights ≤15°C', model.coolNights15],
    ['Cold nights ≤10°C', model.coldNights10],
    ['Mean diurnal range °C', model.meanDiurnalRangeC ?? '—'],
    ['Hourly records', model.hourly.length],
    ['Daily records', model.daily.length],
  ]
  kpis.forEach(([k, v], i) => {
    ws.getCell(kpiRow + 1 + i, 1).value = k
    ws.getCell(kpiRow + 1 + i, 2).value = v
  })
  autoWidth(ws, 3, 60)
}

function writeAnalysisSheet(wb: ExcelJS.Workbook, model: TemperatureReportModel): void {
  const ws = wb.addWorksheet(TEMP_SHEET.analysis, { views: [{ state: 'frozen', ySplit: 2 }] }) as ExcelJS.Worksheet &
    AnalysisExtras
  ws.getCell(1, 1).value = 'Temperature Analysis & Comparisons'
  styleTitle(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, 10)
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }

  ws.getCell(2, 1).value =
    `Primary Aggregate: ${model.aggregationLabel} · ${model.analysisStart} → ${model.analysisEnd}`
  ws.getCell(2, 1).font = { italic: true, size: 10 }

  let row = 4
  ws.getCell(row, 1).value = 'Descriptive statistics (daily)'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 9)
  row++
  const statHeader = ws.getRow(row)
  ;['Parameter', 'Count', 'Mean', 'Min', 'Max', 'Range', 'Std Dev', 'P10', 'P90'].forEach((c, i) => {
    statHeader.getCell(i + 1).value = c
  })
  styleTableHeader(statHeader)
  row++
  model.stats.forEach((s, i) => {
    const r = ws.addRow([
      s.parameter,
      s.count,
      fmtNum(s.mean, 2),
      fmtNum(s.min, 1),
      fmtNum(s.max, 1),
      fmtNum(s.range, 1),
      fmtNum(s.stdDev, 2),
      fmtNum(s.p10, 1),
      fmtNum(s.p90, 1),
    ])
    styleDataRow(r, i % 2 === 1)
    row++
  })

  row += 1
  ws.getCell(row, 1).value = 'Year-over-year temperature'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 5)
  row++
  const yoyHeader = ws.getRow(row)
  ;['Year', 'Avg °C', 'Tmax °C', 'Tmin °C', 'Δ vs previous °C'].forEach((c, i) => {
    yoyHeader.getCell(i + 1).value = c
  })
  styleTableHeader(yoyHeader)
  row++
  model.yoy.forEach((y, i) => {
    const r = ws.addRow([
      y.year,
      fmtNum(y.avgTempC, 1),
      fmtNum(y.tmaxC, 1),
      fmtNum(y.tminC, 1),
      fmtNum(y.deltaVsPrevC, 2),
    ])
    styleDataRow(r, i % 2 === 1)
    row++
  })

  row += 1
  ws.getCell(row, 1).value = 'Monthly climate normals (pooled)'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 9)
  row++
  const normHeaderRow = row
  const normHeader = ws.getRow(row)
  ;[
    'Month',
    'Tmax °C',
    'Tmin °C',
    'Tavg °C',
    'Diurnal Range °C',
    'Precipitation mm',
    'Humidity %',
    'Wind Speed km/h',
    'ET0 mm',
  ].forEach((c, i) => {
    normHeader.getCell(i + 1).value = c
  })
  styleTableHeader(normHeader)
  row++
  const normalsFirst = row
  model.monthlyNormals.forEach((m, i) => {
    const r = ws.addRow([
      m.monthLabel,
      fmtNum(m.tmaxC, 1),
      fmtNum(m.tminC, 1),
      fmtNum(m.tavgC, 1),
      fmtNum(m.diurnalRangeC, 1),
      fmtNum(m.precipMm, 2),
      fmtNum(m.humidityPct, 0),
      fmtNum(m.windSpeedKmh, 1),
      fmtNum(m.et0Mm, 1),
    ])
    styleDataRow(r, i % 2 === 1)
    row++
  })
  const normalsLast = row - 1

  row += 1
  ws.getCell(row, 1).value = 'Heat & cold indicators'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 2)
  row++
  const indHeaderRow = row
  const indHeader = ws.getRow(row)
  indHeader.getCell(1).value = 'Indicator'
  indHeader.getCell(2).value = 'Count / Value'
  styleTableHeader(indHeader)
  row++
  const indicatorsFirst = row
  const indicators: Array<[string, number | string]> = [
    ['Days with Tmax ≥ 35°C', model.heatDays35],
    ['Days with Tmax ≥ 40°C', model.heatDays40],
    ['Nights with Tmin ≤ 15°C', model.coolNights15],
    ['Nights with Tmin ≤ 10°C', model.coldNights10],
    ['Mean diurnal range (°C)', model.meanDiurnalRangeC ?? '—'],
  ]
  indicators.forEach(([k, v], i) => {
    const r = ws.addRow([k, v])
    styleDataRow(r, i % 2 === 1)
    row++
  })
  const indicatorsLast = row - 1

  const diurnalStart = 4
  ;['Hour', 'Mean Temp °C', 'Precip mm/h', 'Humidity %', 'Wind km/h'].forEach((h, i) => {
    ws.getCell(diurnalStart, 11 + i).value = h
    styleSection(ws.getCell(diurnalStart, 11 + i))
  })
  model.diurnalProfile.forEach((d, i) => {
    const r = diurnalStart + 1 + i
    ws.getCell(r, 11).value = d.label
    ws.getCell(r, 12).value = d.avgTempC ?? ''
    ws.getCell(r, 13).value = d.precipMmH ?? ''
    ws.getCell(r, 14).value = d.humidityPct ?? ''
    ws.getCell(r, 15).value = d.windSpeedKmh ?? ''
  })

  ws.__normals = {
    header: normHeaderRow,
    first: normalsFirst,
    last: Math.max(normalsLast, normalsFirst),
  }
  ws.__diurnal = {
    first: diurnalStart + 1,
    last: diurnalStart + model.diurnalProfile.length,
  }
  ws.__indicators = {
    header: indHeaderRow,
    first: indicatorsFirst,
    last: Math.max(indicatorsLast, indicatorsFirst),
  }

  autoWidth(ws, 15)
}

/** AgroCloud Meteo report spacing between chart sections (~18 rows). */
const CHART_SECTION_STEP = 18

function initChartSheet(ws: ExcelJS.Worksheet, title: string, subtitle: string): number {
  ws.getCell(1, 1).value = title
  styleSection(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, 4)
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  ws.mergeCells(2, 1, 2, 4)
  return 4
}

function pushChartLabel(ws: ExcelJS.Worksheet, row: number, label: string): number {
  ws.getCell(row, 1).value = label
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 4)
  return row
}

/**
 * AgroCloud Meteo Data Report layout: Charts Hourly + Charts Daily + Charts Monthly.
 * Paired Data/Charts sheets mirror the professional meteo workbook pattern.
 */
function writeChartsSheets(
  wb: ExcelJS.Workbook,
  model: TemperatureReportModel,
  bounds: Record<string, SheetBounds>,
): MeteoNativeChartSpec[] {
  const specs: MeteoNativeChartSpec[] = []
  const hourlyB = bounds[TEMP_SHEET.hourly]
  const dailyB = bounds[TEMP_SHEET.daily]
  const yearlyB = bounds[TEMP_SHEET.yearly]
  const analysisWs = wb.getWorksheet(TEMP_SHEET.analysis) as (ExcelJS.Worksheet & AnalysisExtras) | undefined
  const normals = analysisWs?.__normals
  const diurnal = analysisWs?.__diurnal

  type Section = { label: string; build: (anchorRow: number) => MeteoNativeChartSpec | null }

  // ——— Charts Hourly ———
  const wsHourly = wb.addWorksheet(TEMP_SHEET.chartsHourly)
  let hRow = initChartSheet(
    wsHourly,
    'Charts Hourly',
    'Hourly climate charts — Temperature · Precipitation · Humidity · Wind · Diurnal profile',
  )
  const hourlySections: Section[] = []

  if (hourlyB && hourlyB.lastRow >= hourlyB.firstRow) {
    const hLast = hourlyB.lastRow
    const hFirst = Math.max(hourlyB.firstRow, hLast - TEMP_CHART_HOURLY_CAP + 1)
    const catsH = sheetRange(hourlyB.name, 1, hFirst, hLast)
    hourlySections.push({
      label: 'Temperature (Hourly)',
      build: anchorRow => ({
        title: 'Temperature (Hourly)',
        kind: 'line',
        sectionLabel: 'Temperature (Hourly)',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsHourly,
        legendPos: 'b',
        series: [4, 5, 6].map(col => ({
          nameRef: sheetRef(hourlyB.name, col, hourlyB.headerRow),
          valuesRef: sheetRange(hourlyB.name, col, hFirst, hLast),
          catsRef: catsH,
        })),
      }),
    })
    hourlySections.push({
      label: 'Precipitation (Hourly)',
      build: anchorRow => ({
        title: 'Precipitation (Hourly)',
        kind: 'bar',
        sectionLabel: 'Precipitation (Hourly)',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsHourly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(hourlyB.name, 7, hourlyB.headerRow),
            valuesRef: sheetRange(hourlyB.name, 7, hFirst, hLast),
            catsRef: catsH,
          },
        ],
      }),
    })
    hourlySections.push({
      label: 'Humidity % (Hourly)',
      build: anchorRow => ({
        title: 'Humidity % (Hourly)',
        kind: 'line',
        sectionLabel: 'Humidity % (Hourly)',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsHourly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(hourlyB.name, 8, hourlyB.headerRow),
            valuesRef: sheetRange(hourlyB.name, 8, hFirst, hLast),
            catsRef: catsH,
          },
        ],
      }),
    })
    hourlySections.push({
      label: 'Wind Speed (Hourly)',
      build: anchorRow => ({
        title: 'Wind Speed (Hourly)',
        kind: 'line',
        sectionLabel: 'Wind Speed (Hourly)',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsHourly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(hourlyB.name, 9, hourlyB.headerRow),
            valuesRef: sheetRange(hourlyB.name, 9, hFirst, hLast),
            catsRef: catsH,
          },
        ],
      }),
    })
  }

  if (diurnal && diurnal.last >= diurnal.first) {
    hourlySections.push({
      label: 'Diurnal Temperature Profile',
      build: anchorRow => ({
        title: 'Diurnal Temperature Profile',
        kind: 'line',
        sectionLabel: 'Diurnal Temperature Profile',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsHourly,
        legendPos: 'b',
        series: [
          {
            name: 'Avg Temp °C',
            valuesRef: sheetRange(TEMP_SHEET.analysis, 12, diurnal.first, diurnal.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 11, diurnal.first, diurnal.last),
          },
        ],
      }),
    })
  }

  for (const sec of hourlySections) {
    const labelRow = pushChartLabel(wsHourly, hRow, sec.label)
    const spec = sec.build(labelRow)
    if (spec) specs.push(spec)
    hRow = labelRow + CHART_SECTION_STEP
  }
  autoWidth(wsHourly, 4)

  // ——— Charts Daily ———
  const wsDaily = wb.addWorksheet(TEMP_SHEET.chartsDaily)
  let dRow = initChartSheet(
    wsDaily,
    'Charts Daily',
    'Essential daily climate charts — Temperature · Precipitation · Humidity · Wind · Water balance',
  )
  const cumDaily = writePeriodCumulativeBlock(wsDaily, 200, 20, model.daily, 'Daily')

  const dailySections: Section[] = []

  if (dailyB && dailyB.lastRow >= dailyB.firstRow) {
    dailySections.push({
      label: 'Temperature',
      build: anchorRow => ({
        title: 'Temperature',
        kind: 'line',
        sectionLabel: 'Temperature',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        legendPos: 'b',
        series: [2, 3, 4].map(col => ({
          nameRef: sheetRef(dailyB.name, col, dailyB.headerRow),
          valuesRef: sheetRange(dailyB.name, col, dailyB.firstRow, dailyB.lastRow),
          catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
        })),
      }),
    })
    dailySections.push({
      label: 'Precipitation',
      build: anchorRow => ({
        title: 'Precipitation',
        kind: 'bar',
        sectionLabel: 'Precipitation',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(dailyB.name, 6, dailyB.headerRow),
            valuesRef: sheetRange(dailyB.name, 6, dailyB.firstRow, dailyB.lastRow),
            catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
          },
        ],
      }),
    })
    dailySections.push({
      label: 'Precipitation vs ET0',
      build: anchorRow => ({
        title: 'Precipitation vs ET0',
        kind: 'combo',
        sectionLabel: 'Precipitation vs ET0',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        lineSeriesIndexes: [1],
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(dailyB.name, 6, dailyB.headerRow),
            valuesRef: sheetRange(dailyB.name, 6, dailyB.firstRow, dailyB.lastRow),
            catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
          },
          {
            nameRef: sheetRef(dailyB.name, 9, dailyB.headerRow),
            valuesRef: sheetRange(dailyB.name, 9, dailyB.firstRow, dailyB.lastRow),
            catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
          },
        ],
      }),
    })
    dailySections.push({
      label: 'Humidity %',
      build: anchorRow => ({
        title: 'Humidity %',
        kind: 'line',
        sectionLabel: 'Humidity %',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(dailyB.name, 7, dailyB.headerRow),
            valuesRef: sheetRange(dailyB.name, 7, dailyB.firstRow, dailyB.lastRow),
            catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
          },
        ],
      }),
    })
    dailySections.push({
      label: 'Wind Speed',
      build: anchorRow => ({
        title: 'Wind Speed',
        kind: 'line',
        sectionLabel: 'Wind Speed',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(dailyB.name, 8, dailyB.headerRow),
            valuesRef: sheetRange(dailyB.name, 8, dailyB.firstRow, dailyB.lastRow),
            catsRef: sheetRange(dailyB.name, 1, dailyB.firstRow, dailyB.lastRow),
          },
        ],
      }),
    })
  }

  if (cumDaily) {
    dailySections.push({
      label: 'Cumulative Precipitation',
      build: anchorRow => ({
        title: 'Cumulative Precipitation',
        kind: 'area',
        sectionLabel: 'Cumulative Precipitation',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsDaily,
        legendPos: 'b',
        series: [
          {
            name: 'Cumulative Precipitation mm',
            valuesRef: sheetRange(TEMP_SHEET.chartsDaily, cumDaily.cumCol, cumDaily.first, cumDaily.last),
            catsRef: sheetRange(TEMP_SHEET.chartsDaily, cumDaily.labelCol, cumDaily.first, cumDaily.last),
          },
        ],
      }),
    })
  }

  for (const sec of dailySections) {
    const labelRow = pushChartLabel(wsDaily, dRow, sec.label)
    const spec = sec.build(labelRow)
    if (spec) specs.push(spec)
    dRow = labelRow + CHART_SECTION_STEP
  }
  autoWidth(wsDaily, 4)

  // ——— Charts Monthly ———
  const wsMonthly = wb.addWorksheet(TEMP_SHEET.chartsMonthly)
  let mRow = initChartSheet(
    wsMonthly,
    'Charts Monthly',
    'Essential monthly climate charts — Normals · Water balance · Annual summary',
  )

  const monthlySections: Section[] = []

  if (normals && normals.last >= normals.first) {
    monthlySections.push({
      label: 'Temperature',
      build: anchorRow => ({
        title: 'Temperature',
        kind: 'line',
        sectionLabel: 'Temperature',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        legendPos: 'b',
        series: [2, 3, 4].map(col => ({
          nameRef: sheetRef(TEMP_SHEET.analysis, col, normals.header),
          valuesRef: sheetRange(TEMP_SHEET.analysis, col, normals.first, normals.last),
          catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
        })),
      }),
    })
    monthlySections.push({
      label: 'Precipitation',
      build: anchorRow => ({
        title: 'Precipitation',
        kind: 'bar',
        sectionLabel: 'Precipitation',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(TEMP_SHEET.analysis, 6, normals.header),
            valuesRef: sheetRange(TEMP_SHEET.analysis, 6, normals.first, normals.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
          },
        ],
      }),
    })
    monthlySections.push({
      label: 'Precipitation vs ET0',
      build: anchorRow => ({
        title: 'Precipitation vs ET0',
        kind: 'combo',
        sectionLabel: 'Precipitation vs ET0',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        lineSeriesIndexes: [1],
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(TEMP_SHEET.analysis, 6, normals.header),
            valuesRef: sheetRange(TEMP_SHEET.analysis, 6, normals.first, normals.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
          },
          {
            nameRef: sheetRef(TEMP_SHEET.analysis, 9, normals.header),
            valuesRef: sheetRange(TEMP_SHEET.analysis, 9, normals.first, normals.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
          },
        ],
      }),
    })
    monthlySections.push({
      label: 'Humidity %',
      build: anchorRow => ({
        title: 'Humidity %',
        kind: 'line',
        sectionLabel: 'Humidity %',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(TEMP_SHEET.analysis, 7, normals.header),
            valuesRef: sheetRange(TEMP_SHEET.analysis, 7, normals.first, normals.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
          },
        ],
      }),
    })
    monthlySections.push({
      label: 'Wind Speed',
      build: anchorRow => ({
        title: 'Wind Speed',
        kind: 'line',
        sectionLabel: 'Wind Speed',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(TEMP_SHEET.analysis, 8, normals.header),
            valuesRef: sheetRange(TEMP_SHEET.analysis, 8, normals.first, normals.last),
            catsRef: sheetRange(TEMP_SHEET.analysis, 1, normals.first, normals.last),
          },
        ],
      }),
    })
  }

  if (yearlyB && yearlyB.lastRow >= yearlyB.firstRow) {
    if (yearlyB.colCount >= 10 && yearlyB.lastRow - yearlyB.firstRow >= 1) {
      monthlySections.push({
        label: 'Yearly Tavg & Anomaly',
        build: anchorRow => ({
          title: 'Yearly Tavg & Anomaly',
          kind: 'combo',
          sectionLabel: 'Yearly Tavg & Anomaly',
          anchorRow,
          targetSheet: TEMP_SHEET.chartsMonthly,
          lineSeriesIndexes: [0],
          legendPos: 'b',
          series: [
            {
              nameRef: sheetRef(yearlyB.name, 4, yearlyB.headerRow),
              valuesRef: sheetRange(yearlyB.name, 4, yearlyB.firstRow, yearlyB.lastRow),
              catsRef: sheetRange(yearlyB.name, 1, yearlyB.firstRow, yearlyB.lastRow),
            },
            {
              nameRef: sheetRef(yearlyB.name, 10, yearlyB.headerRow),
              valuesRef: sheetRange(yearlyB.name, 10, yearlyB.firstRow, yearlyB.lastRow),
              catsRef: sheetRange(yearlyB.name, 1, yearlyB.firstRow, yearlyB.lastRow),
            },
          ],
        }),
      })
    }
    monthlySections.push({
      label: 'Yearly Precipitation',
      build: anchorRow => ({
        title: 'Yearly Precipitation',
        kind: 'bar',
        sectionLabel: 'Yearly Precipitation',
        anchorRow,
        targetSheet: TEMP_SHEET.chartsMonthly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(yearlyB.name, 6, yearlyB.headerRow),
            valuesRef: sheetRange(yearlyB.name, 6, yearlyB.firstRow, yearlyB.lastRow),
            catsRef: sheetRange(yearlyB.name, 1, yearlyB.firstRow, yearlyB.lastRow),
          },
        ],
      }),
    })
  }

  for (const sec of monthlySections) {
    const labelRow = pushChartLabel(wsMonthly, mRow, sec.label)
    const spec = sec.build(labelRow)
    if (spec) specs.push(spec)
    mRow = labelRow + CHART_SECTION_STEP
  }
  autoWidth(wsMonthly, 4)

  return specs
}


export async function buildTemperatureWeatherReportWorkbook(
  payload: WeatherClimateReportPayload,
): Promise<WorkbookWithCharts> {
  const model = buildTemperatureReportModel(payload)
  const wb = new ExcelJS.Workbook() as WorkbookWithCharts
  wb.creator = 'AgroCloud Weather – Temperature'
  wb.created = new Date()
  wb.title = model.title
  wb.company = 'AgroCloud'

  const bounds: Record<string, SheetBounds> = {}
  const indexNames: string[] = []

  for (const scale of model.dataSheetOrder) {
    if (scale === 'hour' && model.hourly.length) indexNames.push(TEMP_SHEET.hourly)
    else if (scale === 'day' && model.daily.length) indexNames.push(TEMP_SHEET.daily)
    else if (scale === 'week' && model.weekly.length) indexNames.push(TEMP_SHEET.weekly)
    else if (scale === 'month' && model.monthly.length) indexNames.push(TEMP_SHEET.monthly)
    else if (scale === 'year' && model.yearly.length) indexNames.push(TEMP_SHEET.yearly)
  }
  indexNames.push(
    TEMP_SHEET.analysis,
    TEMP_SHEET.chartsHourly,
    TEMP_SHEET.chartsDaily,
    TEMP_SHEET.chartsMonthly,
  )

  writeCover(wb, model, indexNames)

  for (const scale of model.dataSheetOrder) {
    if (scale === 'hour' && model.hourly.length) {
      bounds[TEMP_SHEET.hourly] = writeHourlySheet(wb, model)
    } else if (scale === 'day' && model.daily.length) {
      bounds[TEMP_SHEET.daily] = writePeriodSheet(
        wb,
        TEMP_SHEET.daily,
        model,
        'Daily Temperature',
        model.daily,
        'TempDaily',
      )
    } else if (scale === 'week' && model.weekly.length) {
      bounds[TEMP_SHEET.weekly] = writePeriodSheet(
        wb,
        TEMP_SHEET.weekly,
        model,
        'Weekly Temperature',
        model.weekly,
        'TempWeekly',
      )
    } else if (scale === 'month' && model.monthly.length) {
      bounds[TEMP_SHEET.monthly] = writePeriodSheet(
        wb,
        TEMP_SHEET.monthly,
        model,
        'Monthly Temperature',
        model.monthly,
        'TempMonthly',
      )
    } else if (scale === 'year' && model.yearly.length) {
      bounds[TEMP_SHEET.yearly] = writePeriodSheet(
        wb,
        TEMP_SHEET.yearly,
        model,
        'Yearly Temperature',
        model.yearly,
        'TempYearly',
        true,
      )
    }
  }

  writeAnalysisSheet(wb, model)
  const chartSpecs = writeChartsSheets(wb, model, bounds)

  wb.__meteoChartSpecs = chartSpecs
  wb.__chartsSheetName = TEMP_SHEET.chartsDaily
  return wb
}

export function temperatureReportFilename(aoiName: string, aggregation?: string): string {
  const slug = aoiName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'AOI'
  const date = new Date().toISOString().slice(0, 10)
  const agg = aggregation ? `_${aggregation}` : ''
  return `${slug}-MeteoDataReport${agg}-${date}-Hourly+Daily+Monthly.xlsx`
}

export async function generateTemperatureWeatherReportExcel(
  payload: WeatherClimateReportPayload,
): Promise<void> {
  const wb = await buildTemperatureWeatherReportWorkbook(payload)
  const specs = wb.__meteoChartSpecs ?? []
  const raw = await wb.xlsx.writeBuffer()
  const { injectNativeMeteoCharts } = await import('./meteoNativeExcelCharts')
  const withCharts = await injectNativeMeteoCharts(raw as ArrayBuffer, specs, TEMP_SHEET.chartsDaily)
  const blob = new Blob([withCharts as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = temperatureReportFilename(
    payload.aoiName,
    climateAggregationLabel(payload.timeAggregation ?? 'day'),
  )
  a.click()
  URL.revokeObjectURL(url)
}
