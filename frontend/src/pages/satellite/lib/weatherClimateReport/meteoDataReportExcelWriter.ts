/**
 * AgroCloud Meteo Data Report XLSX — Daily+Monthly (+ Hourly) workbook with native charts.
 * Sheet layout mirrors the professional meteo reference: Data/Chart Monthly, Data/Charts Daily,
 * plus Data Hourly / Charts Hourly.
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
  sheetRange,
  sheetRef,
  styleDataRow,
  styleSection,
  styleTableHeader,
} from './weatherExcelHelpers'
import {
  METEO_HOURLY_CHART_CAP,
  buildMeteoDataReportModel,
  type MeteoClimateRow,
  type MeteoDataReportModel,
  type MeteoYearMatrix,
} from './meteoDataReportModel'

export const METEO_SHEET = {
  dataMonthly: 'Data Monthly',
  chartMonthly: 'Chart Monthly',
  dataDaily: 'Data Daily',
  chartsDaily: 'Charts Daily',
  dataHourly: 'Data Hourly',
  chartsHourly: 'Charts Hourly',
} as const

const TITLE_FILL = 'FF1F4E78'
const CHART_SECTION_STEP = 18

const CLIMATE_COLS = [
  'Period',
  'Tmax C',
  'Tmin C',
  'Tavg C',
  'Rainfall mm',
  'ET0 mm',
  'Water Deficit m3/ha',
  'Sunshine h/day',
  'Daylight h/day',
  'Wind Max km/h',
  'Max Gust km/h',
  'RH %',
] as const

type SheetBounds = { name: string; headerRow: number; firstRow: number; lastRow: number; colCount: number }

type HourlyLayout = SheetBounds & {
  diurnal: BlockBounds | null
}

type BlockBounds = { headerRow: number; firstRow: number; lastRow: number; colCount: number }

type MonthlyLayout = {
  normals: BlockBounds
  matrices: Array<{ title: string; block: BlockBounds; years: number[] }>
  annual: BlockBounds
  risk: BlockBounds
  cumulative: BlockBounds
  cumulativeByYear: BlockBounds | null
}

type WorkbookWithCharts = ExcelJS.Workbook & {
  __meteoChartSpecs?: MeteoNativeChartSpec[]
  __chartsSheetName?: string
}

function writeReportHeader(ws: ExcelJS.Worksheet, model: MeteoDataReportModel, colSpan = 12): void {
  ws.mergeCells(1, 1, 1, colSpan)
  const t = ws.getCell(1, 1)
  t.value = model.title
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  t.alignment = { vertical: 'middle', wrapText: true }
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, colSpan)
  ws.getCell(2, 1).value = model.locationLine
  ws.getCell(2, 1).font = { size: 10, italic: true }

  ws.mergeCells(3, 1, 3, colSpan)
  ws.getCell(3, 1).value = model.sourceLine
  ws.getCell(3, 1).font = { size: 9, color: { argb: 'FF64748B' } }
}

function climateRowValues(r: MeteoClimateRow): Array<string | number> {
  return [
    r.periodLabel,
    fmtNum(r.tmaxC, 1),
    fmtNum(r.tminC, 1),
    fmtNum(r.tavgC, 1),
    fmtNum(r.rainfallMm, 1),
    fmtNum(r.et0Mm, 1),
    fmtNum(r.waterDeficitM3Ha, 0),
    fmtNum(r.sunshineHPerDay, 1),
    fmtNum(r.daylightHPerDay, 1),
    fmtNum(r.windMaxKmh, 1),
    fmtNum(r.maxGustKmh, 1),
    fmtNum(r.rhPct, 0),
  ]
}

function writeClimateTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  sectionTitle: string,
  rows: MeteoClimateRow[],
  tableName: string,
): BlockBounds {
  ws.getCell(startRow, 1).value = sectionTitle
  styleSection(ws.getCell(startRow, 1))
  ws.mergeCells(startRow, 1, startRow, CLIMATE_COLS.length)

  const headerRow = startRow + 1
  const header = ws.getRow(headerRow)
  CLIMATE_COLS.forEach((c, i) => {
    header.getCell(i + 1).value = c
  })
  styleTableHeader(header)

  rows.forEach((r, i) => {
    const row = ws.getRow(headerRow + 1 + i)
    climateRowValues(r).forEach((v, ci) => {
      row.getCell(ci + 1).value = v
    })
    styleDataRow(row, i % 2 === 1)
  })

  const firstRow = headerRow + 1
  const lastRow = Math.max(headerRow, headerRow + rows.length)
  if (rows.length) {
    addExcelTable(ws, tableName, headerRow, CLIMATE_COLS.length, rows.length, [...CLIMATE_COLS])
    for (const col of [2, 3, 4, 5, 6, 8, 9, 10, 11]) {
      applyNumberFormat(ws, col, col === 5 || col === 6 ? '0.0' : '0.0', firstRow, lastRow)
    }
    applyNumberFormat(ws, 7, '0', firstRow, lastRow)
    applyNumberFormat(ws, 12, '0', firstRow, lastRow)
  }
  return { headerRow, firstRow, lastRow, colCount: CLIMATE_COLS.length }
}

function writeYearMatrix(
  ws: ExcelJS.Worksheet,
  startRow: number,
  matrix: MeteoYearMatrix,
  tableName: string,
): BlockBounds {
  ws.getCell(startRow, 1).value = matrix.title
  styleSection(ws.getCell(startRow, 1))
  const colCount = 1 + matrix.years.length
  ws.mergeCells(startRow, 1, startRow, Math.max(2, colCount))

  const headerRow = startRow + 1
  const header = ws.getRow(headerRow)
  header.getCell(1).value = 'Month'
  matrix.years.forEach((y, i) => {
    header.getCell(i + 2).value = y
  })
  styleTableHeader(header)

  matrix.rows.forEach((r, i) => {
    const row = ws.getRow(headerRow + 1 + i)
    row.getCell(1).value = r.monthLabel
    r.values.forEach((v, ci) => {
      row.getCell(ci + 2).value = v == null ? '' : v
    })
    styleDataRow(row, i % 2 === 1)
  })

  const firstRow = headerRow + 1
  const lastRow = Math.max(headerRow, headerRow + matrix.rows.length)
  const cols = ['Month', ...matrix.years.map(String)]
  if (matrix.rows.length) {
    addExcelTable(ws, tableName, headerRow, cols.length, matrix.rows.length, cols)
  }
  return { headerRow, firstRow, lastRow, colCount }
}

function writeDataMonthly(wb: ExcelJS.Workbook, model: MeteoDataReportModel): MonthlyLayout {
  const ws = wb.addWorksheet(METEO_SHEET.dataMonthly, { views: [{ state: 'frozen', ySplit: 4 }] })
  writeReportHeader(ws, model)
  let row = 5

  const normals = writeClimateTable(ws, row, 'Monthly Climate Normals', model.monthlyNormals, 'MeteoMonthlyNormals')
  row = normals.lastRow + 3

  const matrices: MonthlyLayout['matrices'] = []
  model.yearMatrices.forEach((m, i) => {
    const block = writeYearMatrix(ws, row, m, `MeteoMatrix${i + 1}`)
    matrices.push({ title: m.title, block, years: m.years })
    row = block.lastRow + 3
  })

  // Annual Summary
  ws.getCell(row, 1).value = 'Annual Summary'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 4)
  row += 1
  const annualHeaderRow = row
  ;['Year', 'Rainfall mm', 'ET0 mm', 'Water deficit mm'].forEach((c, i) => {
    ws.getRow(annualHeaderRow).getCell(i + 1).value = c
  })
  styleTableHeader(ws.getRow(annualHeaderRow))
  model.annualSummary.forEach((a, i) => {
    const r = ws.getRow(annualHeaderRow + 1 + i)
    r.getCell(1).value = a.year
    r.getCell(2).value = fmtNum(a.rainfallMm, 1)
    r.getCell(3).value = fmtNum(a.et0Mm, 1)
    r.getCell(4).value = fmtNum(a.waterDeficitMm, 1)
    styleDataRow(r, i % 2 === 1)
  })
  const annual: BlockBounds = {
    headerRow: annualHeaderRow,
    firstRow: annualHeaderRow + 1,
    lastRow: Math.max(annualHeaderRow, annualHeaderRow + model.annualSummary.length),
    colCount: 4,
  }
  if (model.annualSummary.length) {
    addExcelTable(ws, 'MeteoAnnual', annualHeaderRow, 4, model.annualSummary.length, [
      'Year',
      'Rainfall mm',
      'ET0 mm',
      'Water deficit mm',
    ])
  }
  row = annual.lastRow + 3

  // Threshold and Risk-Day Counts
  ws.getCell(row, 1).value = 'Threshold and Risk-Day Counts'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 10)
  row += 1
  const riskHeaderRow = row
  const riskCols = [
    'Period',
    'Heat days Tmax>35C',
    'Extreme heat days Tmax>40C',
    'Cool nights Tmin<15C',
    'Cold nights Tmin<10C',
    'High gust days >50 km/h',
    'Extreme gust days >60 km/h',
    'RH>80% hours',
    'RH<30% hours',
    'Irrigation demand m3/ha',
  ]
  riskCols.forEach((c, i) => {
    ws.getRow(riskHeaderRow).getCell(i + 1).value = c
  })
  styleTableHeader(ws.getRow(riskHeaderRow))
  model.riskRows.forEach((r, i) => {
    const rowObj = ws.getRow(riskHeaderRow + 1 + i)
    ;[
      r.periodLabel,
      r.heatDays35,
      r.heatDays40,
      r.coolNights15,
      r.coldNights10,
      r.highGustDays50,
      r.extremeGustDays60,
      r.rhHighHours,
      r.rhLowHours,
      fmtNum(r.irrigationDemandM3Ha, 0),
    ].forEach((v, ci) => {
      rowObj.getCell(ci + 1).value = v
    })
    styleDataRow(rowObj, i % 2 === 1)
  })
  const risk: BlockBounds = {
    headerRow: riskHeaderRow,
    firstRow: riskHeaderRow + 1,
    lastRow: Math.max(riskHeaderRow, riskHeaderRow + model.riskRows.length),
    colCount: riskCols.length,
  }
  if (model.riskRows.length) {
    addExcelTable(ws, 'MeteoRisk', riskHeaderRow, riskCols.length, model.riskRows.length, riskCols)
  }
  row = risk.lastRow + 3

  // Cumulative Water Deficit
  ws.getCell(row, 1).value = 'Cumulative Water Deficit'
  styleSection(ws.getCell(row, 1))
  ws.mergeCells(row, 1, row, 2)
  row += 1
  const cumHeaderRow = row
  ws.getRow(cumHeaderRow).getCell(1).value = 'Period'
  ws.getRow(cumHeaderRow).getCell(2).value = 'Cumulative deficit'
  styleTableHeader(ws.getRow(cumHeaderRow))
  model.cumulativeDeficit.forEach((c, i) => {
    const r = ws.getRow(cumHeaderRow + 1 + i)
    r.getCell(1).value = c.periodLabel
    r.getCell(2).value = c.cumulativeMm
    styleDataRow(r, i % 2 === 1)
  })
  const cumulative: BlockBounds = {
    headerRow: cumHeaderRow,
    firstRow: cumHeaderRow + 1,
    lastRow: Math.max(cumHeaderRow, cumHeaderRow + model.cumulativeDeficit.length),
    colCount: 2,
  }
  if (model.cumulativeDeficit.length) {
    addExcelTable(ws, 'MeteoCumDeficit', cumHeaderRow, 2, model.cumulativeDeficit.length, [
      'Period',
      'Cumulative deficit',
    ])
  }
  row = cumulative.lastRow + 3

  let cumulativeByYear: BlockBounds | null = null
  if (model.cumulativeByYear) {
    cumulativeByYear = writeYearMatrix(ws, row, model.cumulativeByYear, 'MeteoCumByYear')
  }

  autoWidth(ws, 12)
  return { normals, matrices, annual, risk, cumulative, cumulativeByYear }
}

function writeDataDaily(wb: ExcelJS.Workbook, model: MeteoDataReportModel): SheetBounds {
  const ws = wb.addWorksheet(METEO_SHEET.dataDaily, { views: [{ state: 'frozen', ySplit: 5 }] })
  writeReportHeader(ws, model)
  const block = writeClimateTable(ws, 5, 'Daily Climate Series', model.dailySeries, 'MeteoDaily')
  autoWidth(ws, CLIMATE_COLS.length)
  return { name: METEO_SHEET.dataDaily, ...block }
}

function writeDataHourly(wb: ExcelJS.Workbook, model: MeteoDataReportModel): HourlyLayout {
  const ws = wb.addWorksheet(METEO_SHEET.dataHourly, { views: [{ state: 'frozen', ySplit: 5 }] })
  writeReportHeader(ws, model)
  const block = writeClimateTable(ws, 5, 'Hourly Climate Series', model.hourlySeries, 'MeteoHourly')

  let diurnal: BlockBounds | null = null
  if (model.diurnalProfile.some(d => d.meanTempC != null)) {
    const startRow = block.lastRow + 3
    ws.getCell(startRow, 1).value = 'Diurnal Temperature Profile'
    styleSection(ws.getCell(startRow, 1))
    ws.mergeCells(startRow, 1, startRow, 2)
    const headerRow = startRow + 1
    ws.getRow(headerRow).getCell(1).value = 'Hour'
    ws.getRow(headerRow).getCell(2).value = 'Mean Temp C'
    styleTableHeader(ws.getRow(headerRow))
    model.diurnalProfile.forEach((d, i) => {
      const r = ws.getRow(headerRow + 1 + i)
      r.getCell(1).value = d.hour
      r.getCell(2).value = d.meanTempC == null ? '' : d.meanTempC
      styleDataRow(r, i % 2 === 1)
    })
    diurnal = {
      headerRow,
      firstRow: headerRow + 1,
      lastRow: headerRow + model.diurnalProfile.length,
      colCount: 2,
    }
    addExcelTable(ws, 'MeteoDiurnal', headerRow, 2, model.diurnalProfile.length, ['Hour', 'Mean Temp C'])
  }

  autoWidth(ws, CLIMATE_COLS.length)
  return { name: METEO_SHEET.dataHourly, ...block, diurnal }
}

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

function matrixByTitle(layout: MonthlyLayout, titlePart: string): MonthlyLayout['matrices'][0] | undefined {
  return layout.matrices.find(m => m.title.toLowerCase().includes(titlePart.toLowerCase()))
}

type ChartSec = {
  label: string
  target: string
  build: (anchor: number) => MeteoNativeChartSpec | null
}

function buildChartSectionDefs(
  monthly: MonthlyLayout,
  daily: SheetBounds,
  hourly: HourlyLayout,
): { monthlySecs: ChartSec[]; dailySecs: ChartSec[]; hourlySecs: ChartSec[] } {
  const monthlySecs: ChartSec[] = []
  const dailySecs: ChartSec[] = []
  const hourlySecs: ChartSec[] = []
  const n = monthly.normals
  const sheetM = METEO_SHEET.dataMonthly
  const sheetD = daily.name
  const sheetH = hourly.name

  if (n.lastRow >= n.firstRow) {
    const cats = sheetRange(sheetM, 1, n.firstRow, n.lastRow)
    monthlySecs.push({
      label: 'Temperature',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Monthly Temperature',
        kind: 'line',
        sectionLabel: 'Temperature',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: [2, 3, 4].map(col => ({
          nameRef: sheetRef(sheetM, col, n.headerRow),
          valuesRef: sheetRange(sheetM, col, n.firstRow, n.lastRow),
          catsRef: cats,
        })),
      }),
    })
    monthlySecs.push({
      label: 'Rainfall',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Monthly Rainfall',
        kind: 'bar',
        sectionLabel: 'Rainfall',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 5, n.headerRow),
            valuesRef: sheetRange(sheetM, 5, n.firstRow, n.lastRow),
            catsRef: cats,
          },
        ],
      }),
    })
    monthlySecs.push({
      label: 'Rainfall vs ET0',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Rainfall vs ET0',
        kind: 'combo',
        sectionLabel: 'Rainfall vs ET0',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        lineSeriesIndexes: [1],
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 5, n.headerRow),
            valuesRef: sheetRange(sheetM, 5, n.firstRow, n.lastRow),
            catsRef: cats,
          },
          {
            nameRef: sheetRef(sheetM, 6, n.headerRow),
            valuesRef: sheetRange(sheetM, 6, n.firstRow, n.lastRow),
            catsRef: cats,
          },
        ],
      }),
    })
    monthlySecs.push({
      label: 'Water Deficit',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Monthly Water Deficit',
        kind: 'bar',
        sectionLabel: 'Water Deficit',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 7, n.headerRow),
            valuesRef: sheetRange(sheetM, 7, n.firstRow, n.lastRow),
            catsRef: cats,
          },
        ],
      }),
    })
    monthlySecs.push({
      label: 'Sunshine and Daylight',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Sunshine and Daylight',
        kind: 'line',
        sectionLabel: 'Sunshine and Daylight',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: [8, 9].map(col => ({
          nameRef: sheetRef(sheetM, col, n.headerRow),
          valuesRef: sheetRange(sheetM, col, n.firstRow, n.lastRow),
          catsRef: cats,
        })),
      }),
    })
    monthlySecs.push({
      label: 'Wind Speed and Gust',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Wind Speed and Gust',
        kind: 'line',
        sectionLabel: 'Wind Speed and Gust',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: [10, 11].map(col => ({
          nameRef: sheetRef(sheetM, col, n.headerRow),
          valuesRef: sheetRange(sheetM, col, n.firstRow, n.lastRow),
          catsRef: cats,
        })),
      }),
    })
    monthlySecs.push({
      label: 'Relative Humidity',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Average Monthly Relative Humidity',
        kind: 'line',
        sectionLabel: 'Relative Humidity',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 12, n.headerRow),
            valuesRef: sheetRange(sheetM, 12, n.firstRow, n.lastRow),
            catsRef: cats,
          },
        ],
      }),
    })
    monthlySecs.push({
      label: 'Climate Diagram',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Climate Diagram: Rainfall and Mean Temperature',
        kind: 'combo',
        sectionLabel: 'Climate Diagram',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        lineSeriesIndexes: [1],
        legendPos: 'b',
        series: [
          {
            name: 'Rainfall mm',
            valuesRef: sheetRange(sheetM, 5, n.firstRow, n.lastRow),
            catsRef: cats,
          },
          {
            name: 'Mean Tavg C',
            valuesRef: sheetRange(sheetM, 4, n.firstRow, n.lastRow),
            catsRef: cats,
          },
        ],
      }),
    })
  }

  const byYearSpecs: Array<{ title: string; match: string }> = [
    { title: 'Monthly Tmax by Year', match: 'T-max' },
    { title: 'Monthly Tmin by Year', match: 'T-min' },
    { title: 'Monthly Rainfall by Year', match: 'Rainfall by' },
    { title: 'Monthly ET0 by Year', match: 'ET0 by' },
    { title: 'Monthly Water Deficit by Year', match: 'Water Deficit by' },
    { title: 'Monthly RH by Year', match: 'RH by' },
  ]
  for (const s of byYearSpecs) {
    const m = matrixByTitle(monthly, s.match)
    if (!m || m.block.lastRow < m.block.firstRow) continue
    monthlySecs.push({
      label: s.title,
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: s.title,
        kind: 'line',
        sectionLabel: s.title,
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: m.years.map((_, yi) => ({
          nameRef: sheetRef(sheetM, yi + 2, m.block.headerRow),
          valuesRef: sheetRange(sheetM, yi + 2, m.block.firstRow, m.block.lastRow),
          catsRef: sheetRange(sheetM, 1, m.block.firstRow, m.block.lastRow),
        })),
      }),
    })
  }

  if (monthly.annual.lastRow >= monthly.annual.firstRow) {
    const catsA = sheetRange(sheetM, 1, monthly.annual.firstRow, monthly.annual.lastRow)
    monthlySecs.push({
      label: 'Annual Rainfall Comparison',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Annual Rainfall Comparison',
        kind: 'bar',
        sectionLabel: 'Annual Rainfall Comparison',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        varyColors: true,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 2, monthly.annual.headerRow),
            valuesRef: sheetRange(sheetM, 2, monthly.annual.firstRow, monthly.annual.lastRow),
            catsRef: catsA,
          },
        ],
      }),
    })
    monthlySecs.push({
      label: 'Annual Rainfall vs ET0 vs Deficit',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Annual Rainfall vs ET0 vs Deficit',
        kind: 'combo',
        sectionLabel: 'Annual Rainfall vs ET0 vs Deficit',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        lineSeriesIndexes: [1, 2],
        legendPos: 'b',
        series: [2, 3, 4].map(col => ({
          nameRef: sheetRef(sheetM, col, monthly.annual.headerRow),
          valuesRef: sheetRange(sheetM, col, monthly.annual.firstRow, monthly.annual.lastRow),
          catsRef: catsA,
        })),
      }),
    })
  }

  if (monthly.risk.lastRow >= monthly.risk.firstRow) {
    const catsR = sheetRange(sheetM, 1, monthly.risk.firstRow, monthly.risk.lastRow)
    const riskCharts: Array<{ title: string; cols: number[] }> = [
      { title: 'Heat Stress Days', cols: [2, 3] },
      { title: 'Cool-Night / Cold-Risk Days', cols: [4, 5] },
      { title: 'High Wind Gust Risk Days', cols: [6, 7] },
      { title: 'High RH Disease-Risk Hours', cols: [8] },
      { title: 'Low RH Dry-Air Stress Hours', cols: [9] },
      { title: 'Monthly Irrigation Demand from Climate Deficit', cols: [10] },
    ]
    for (const rc of riskCharts) {
      monthlySecs.push({
        label: rc.title,
        target: METEO_SHEET.chartMonthly,
        build: anchorRow => ({
          title: rc.title,
          kind: 'bar',
          sectionLabel: rc.title,
          anchorRow,
          targetSheet: METEO_SHEET.chartMonthly,
          varyColors: true,
          legendPos: 'b',
          series: rc.cols.map(col => ({
            nameRef: sheetRef(sheetM, col, monthly.risk.headerRow),
            valuesRef: sheetRange(sheetM, col, monthly.risk.firstRow, monthly.risk.lastRow),
            catsRef: catsR,
          })),
        }),
      })
    }
  }

  if (monthly.cumulative.lastRow >= monthly.cumulative.firstRow) {
    monthlySecs.push({
      label: 'Cumulative Annual Water Deficit',
      target: METEO_SHEET.chartMonthly,
      build: anchorRow => ({
        title: 'Cumulative Annual Water Deficit',
        kind: 'area',
        sectionLabel: 'Cumulative Annual Water Deficit',
        anchorRow,
        targetSheet: METEO_SHEET.chartMonthly,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 2, monthly.cumulative.headerRow),
            valuesRef: sheetRange(sheetM, 2, monthly.cumulative.firstRow, monthly.cumulative.lastRow),
            catsRef: sheetRange(sheetM, 1, monthly.cumulative.firstRow, monthly.cumulative.lastRow),
          },
        ],
      }),
    })
  }

  if (daily.lastRow >= daily.firstRow) {
    const catsD = sheetRange(sheetD, 1, daily.firstRow, daily.lastRow)
    const dailyCharts: Array<{
      title: string
      kind: MeteoNativeChartSpec['kind']
      cols: number[]
      lineIdx?: number[]
    }> = [
      { title: 'Temperature (Daily)', kind: 'line', cols: [2, 3, 4] },
      { title: 'Rainfall (Daily)', kind: 'bar', cols: [5] },
      { title: 'Rainfall vs ET0 (Daily)', kind: 'combo', cols: [5, 6], lineIdx: [1] },
      { title: 'Water Deficit (Daily)', kind: 'bar', cols: [7] },
      { title: 'Sunshine and Daylight (Daily)', kind: 'line', cols: [8, 9] },
      { title: 'Wind Speed and Gust (Daily)', kind: 'line', cols: [10, 11] },
      { title: 'Relative Humidity (Daily)', kind: 'line', cols: [12] },
      {
        title: 'Climate Diagram: Rainfall and Mean Temperature (Daily)',
        kind: 'combo',
        cols: [5, 4],
        lineIdx: [1],
      },
    ]
    for (const dc of dailyCharts) {
      dailySecs.push({
        label: dc.title,
        target: METEO_SHEET.chartsDaily,
        build: anchorRow => ({
          title: dc.title,
          kind: dc.kind,
          sectionLabel: dc.title,
          anchorRow,
          targetSheet: METEO_SHEET.chartsDaily,
          lineSeriesIndexes: dc.lineIdx,
          varyColors: dc.kind === 'bar',
          legendPos: 'b',
          series: dc.cols.map(col => ({
            nameRef: sheetRef(sheetD, col, daily.headerRow),
            valuesRef: sheetRange(sheetD, col, daily.firstRow, daily.lastRow),
            catsRef: catsD,
          })),
        }),
      })
    }
  }

  for (const s of byYearSpecs) {
    const m = matrixByTitle(monthly, s.match)
    if (!m || m.block.lastRow < m.block.firstRow) continue
    dailySecs.push({
      label: s.title,
      target: METEO_SHEET.chartsDaily,
      build: anchorRow => ({
        title: s.title,
        kind: 'line',
        sectionLabel: s.title,
        anchorRow,
        targetSheet: METEO_SHEET.chartsDaily,
        legendPos: 'b',
        series: m.years.map((_, yi) => ({
          nameRef: sheetRef(sheetM, yi + 2, m.block.headerRow),
          valuesRef: sheetRange(sheetM, yi + 2, m.block.firstRow, m.block.lastRow),
          catsRef: sheetRange(sheetM, 1, m.block.firstRow, m.block.lastRow),
        })),
      }),
    })
  }
  if (monthly.cumulative.lastRow >= monthly.cumulative.firstRow) {
    dailySecs.push({
      label: 'Cumulative Water Deficit (monthly)',
      target: METEO_SHEET.chartsDaily,
      build: anchorRow => ({
        title: 'Cumulative Water Deficit (monthly)',
        kind: 'area',
        sectionLabel: 'Cumulative Water Deficit (monthly)',
        anchorRow,
        targetSheet: METEO_SHEET.chartsDaily,
        legendPos: 'b',
        series: [
          {
            nameRef: sheetRef(sheetM, 2, monthly.cumulative.headerRow),
            valuesRef: sheetRange(sheetM, 2, monthly.cumulative.firstRow, monthly.cumulative.lastRow),
            catsRef: sheetRange(sheetM, 1, monthly.cumulative.firstRow, monthly.cumulative.lastRow),
          },
        ],
      }),
    })
  }

  if (hourly.lastRow >= hourly.firstRow) {
    const hLast = hourly.lastRow
    const hFirst = Math.max(hourly.firstRow, hLast - METEO_HOURLY_CHART_CAP + 1)
    const catsH = sheetRange(sheetH, 1, hFirst, hLast)
    const hourlyCharts: Array<{ title: string; kind: MeteoNativeChartSpec['kind']; cols: number[] }> = [
      { title: 'Temperature (Hourly)', kind: 'line', cols: [2, 3, 4] },
      { title: 'Precipitation (Hourly)', kind: 'bar', cols: [5] },
      { title: 'Humidity % (Hourly)', kind: 'line', cols: [12] },
      { title: 'Wind Speed (Hourly)', kind: 'line', cols: [10, 11] },
    ]
    for (const hc of hourlyCharts) {
      hourlySecs.push({
        label: hc.title,
        target: METEO_SHEET.chartsHourly,
        build: anchorRow => ({
          title: hc.title,
          kind: hc.kind,
          sectionLabel: hc.title,
          anchorRow,
          targetSheet: METEO_SHEET.chartsHourly,
          varyColors: hc.kind === 'bar',
          legendPos: 'b',
          series: hc.cols.map(col => ({
            nameRef: sheetRef(sheetH, col, hourly.headerRow),
            valuesRef: sheetRange(sheetH, col, hFirst, hLast),
            catsRef: catsH,
          })),
        }),
      })
    }
    if (hourly.diurnal && hourly.diurnal.lastRow >= hourly.diurnal.firstRow) {
      hourlySecs.push({
        label: 'Diurnal Temperature Profile',
        target: METEO_SHEET.chartsHourly,
        build: anchorRow => ({
          title: 'Diurnal Temperature Profile',
          kind: 'line',
          sectionLabel: 'Diurnal Temperature Profile',
          anchorRow,
          targetSheet: METEO_SHEET.chartsHourly,
          legendPos: 'b',
          series: [
            {
              nameRef: sheetRef(sheetH, 2, hourly.diurnal!.headerRow),
              valuesRef: sheetRange(sheetH, 2, hourly.diurnal!.firstRow, hourly.diurnal!.lastRow),
              catsRef: sheetRange(sheetH, 1, hourly.diurnal!.firstRow, hourly.diurnal!.lastRow),
            },
          ],
        }),
      })
    }
  }

  return { monthlySecs, dailySecs, hourlySecs }
}

/** Write chart sheets and return native chart specs with anchors. */
function writeChartSheets(
  wb: ExcelJS.Workbook,
  monthly: MonthlyLayout,
  daily: SheetBounds,
  hourly: HourlyLayout,
): MeteoNativeChartSpec[] {
  const packed = buildChartSectionDefs(monthly, daily, hourly)
  const specs: MeteoNativeChartSpec[] = []

  const writeGroup = (sheetName: string, title: string, subtitle: string, secs: ChartSec[]) => {
    const ws = wb.getWorksheet(sheetName) ?? wb.addWorksheet(sheetName)
    let row = initChartSheet(ws, title, subtitle)
    for (const sec of secs) {
      const labelRow = pushChartLabel(ws, row, sec.label)
      const spec = sec.build(labelRow)
      if (spec) specs.push(spec)
      row = labelRow + CHART_SECTION_STEP
    }
    autoWidth(ws, 4)
  }

  writeGroup(
    METEO_SHEET.chartMonthly,
    'Chart Monthly',
    'Monthly climate charts — normals · water balance · risk · annual summary',
    packed.monthlySecs,
  )
  writeGroup(
    METEO_SHEET.chartsDaily,
    'Charts Daily',
    'Daily climate charts — series · climate diagram · monthly analysis mirrors',
    packed.dailySecs,
  )
  writeGroup(
    METEO_SHEET.chartsHourly,
    'Charts Hourly',
    'Hourly climate charts — temperature · precipitation · humidity · wind · diurnal profile',
    packed.hourlySecs,
  )

  return specs
}

export async function buildMeteoDataReportWorkbook(
  payload: WeatherClimateReportPayload,
): Promise<WorkbookWithCharts> {
  const model = buildMeteoDataReportModel({
    aoiName: payload.aoiName,
    aoiLocation: payload.aoiLocation,
    lat: payload.lat,
    lng: payload.lng,
    analysisStart: payload.analysisStart,
    analysisEnd: payload.analysisEnd,
    hourlyRecords: payload.hourlyRecords,
    timeAggregation: payload.timeAggregation ?? 'day',
  })

  const wb = new ExcelJS.Workbook() as WorkbookWithCharts
  wb.creator = 'AgroCloud'
  wb.company = 'AgroCloud'
  wb.created = new Date()
  wb.title = model.title

  // Add sheets in final order (ExcelJS preserves add order; splice on .worksheets is a filtered copy).
  const monthlyLayout = writeDataMonthly(wb, model)
  wb.addWorksheet(METEO_SHEET.chartMonthly)
  const dailyBounds = writeDataDaily(wb, model)
  wb.addWorksheet(METEO_SHEET.chartsDaily)
  const hourlyBounds = writeDataHourly(wb, model)
  wb.addWorksheet(METEO_SHEET.chartsHourly)
  const chartSpecs = writeChartSheets(wb, monthlyLayout, dailyBounds, hourlyBounds)

  wb.__meteoChartSpecs = chartSpecs
  wb.__chartsSheetName = METEO_SHEET.chartMonthly
  return wb
}

export function meteoDataReportFilename(aoiName: string, aggregation?: string): string {
  const slug = aoiName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'AOI'
  const date = new Date().toISOString().slice(0, 10)
  const agg = aggregation ? `_${aggregation}` : ''
  return `${slug}-MeteoDataReport${agg}-${date}-Hourly+Daily+Monthly.xlsx`
}

export async function generateMeteoDataReportExcel(payload: WeatherClimateReportPayload): Promise<void> {
  const wb = await buildMeteoDataReportWorkbook(payload)
  const specs = wb.__meteoChartSpecs ?? []
  const raw = await wb.xlsx.writeBuffer()
  const { injectNativeMeteoCharts } = await import('./meteoNativeExcelCharts')
  const withCharts = await injectNativeMeteoCharts(
    raw as ArrayBuffer,
    specs,
    wb.__chartsSheetName ?? METEO_SHEET.chartMonthly,
  )
  const blob = new Blob([withCharts as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = meteoDataReportFilename(
    payload.aoiName,
    climateAggregationLabel(payload.timeAggregation ?? 'day'),
  )
  a.click()
  URL.revokeObjectURL(url)
}
