import ExcelJS from 'exceljs'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { buildMeteoDataReportModel, type MeteoDataReportModel } from './meteoDataReportModel'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  injectNativeMeteoCharts,
  type MeteoNativeChartSpec,
} from './meteoNativeExcelCharts'

const BRAND_DARK = 'FF064E3B'
const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFE2F5EE'
const ALT_ROW = 'FFF8FAFC'
const INK = 'FF0F172A'

type TableRange = {
  headerRow: number
  firstDataRow: number
  lastDataRow: number
  /** Number of year columns for year-matrix tables (B..) */
  yearCols?: number
}

type DataLayout = {
  normals: TableRange
  yearMatrices: TableRange[]
  annual: TableRange | null
  risk: TableRange | null
  cumulative: TableRange | null
  cumulativeByYear: TableRange | null
}

function fmtNum(n: number | null | undefined, digits = 1): string | number {
  if (n == null || !Number.isFinite(n)) return null as unknown as number
  return Number(n.toFixed(digits))
}

function colLetter(col1Based: number): string {
  let n = col1Based
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function dataRef(col: number, row: number): string {
  return `Data!$${colLetter(col)}$${row}`
}

function dataRange(col: number, r1: number, r2: number): string {
  return `Data!$${colLetter(col)}$${r1}:$${colLetter(col)}$${r2}`
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
  row.height = 22
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
  })
}

function autoWidth(ws: ExcelJS.Worksheet, maxCol: number): void {
  for (let c = 1; c <= maxCol; c++) {
    let max = 10
    ws.eachRow(row => {
      const v = row.getCell(c).value
      const len = v == null ? 0 : String(v).length
      if (len > max) max = Math.min(len + 2, 36)
    })
    ws.getColumn(c).width = max
  }
}

function writeDataSheet(wb: ExcelJS.Workbook, model: MeteoDataReportModel): DataLayout {
  const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 4 }] })

  ws.getCell('A1').value = model.title
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:L1')

  ws.getCell('A2').value = model.locationLine
  ws.getCell('A2').font = { size: 11, color: { argb: INK } }
  ws.mergeCells('A2:L2')

  ws.getCell('A3').value = model.sourceLine
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF64748B' } }
  ws.mergeCells('A3:L3')

  // --- Primary climate series (same column order as GeoSyntra) ---
  ws.addRow([])
  const normalsTitleRow = ws.addRow([model.normalsTitle])
  styleSection(normalsTitleRow.getCell(1))
  ws.mergeCells(normalsTitleRow.number, 1, normalsTitleRow.number, 12)

  const periodHeader = model.aggregation === 'month' ? 'Month' : 'Period'
  const normalsHeader = ws.addRow([
    periodHeader,
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
  ])
  styleTableHeader(normalsHeader)
  const normalsHeaderRow = normalsHeader.number

  model.normals.forEach((r, i) => {
    const row = ws.addRow([
      r.periodLabel,
      fmtNum(r.tmaxC, 1),
      fmtNum(r.tminC, 1),
      fmtNum(r.tavgC, 1),
      fmtNum(r.rainfallMm, model.aggregation === 'hour' ? 2 : 1),
      fmtNum(r.et0Mm, model.aggregation === 'hour' ? 2 : 1),
      fmtNum(r.waterDeficitM3Ha, 0),
      fmtNum(r.sunshineHPerDay, 1),
      fmtNum(r.daylightHPerDay, 1),
      fmtNum(r.windMaxKmh, 1),
      fmtNum(r.maxGustKmh, 1),
      fmtNum(r.rhPct, 0),
    ])
    styleDataRow(row, i % 2 === 1)
  })
  const normalsFirst = normalsHeaderRow + 1
  const normalsLast = normalsHeaderRow + Math.max(model.normals.length, 1)

  const yearMatrices: TableRange[] = []
  model.yearMatrices.forEach(matrix => {
    ws.addRow([])
    const titleRow = ws.addRow([matrix.title])
    styleSection(titleRow.getCell(1))
    ws.mergeCells(titleRow.number, 1, titleRow.number, Math.max(2, matrix.years.length + 1))

    const hr = ws.addRow(['Month', ...matrix.years.map(String)])
    styleTableHeader(hr)
    matrix.rows.forEach((row, i) => {
      const excelRow = ws.addRow([row.monthLabel, ...row.values.map(v => fmtNum(v, 1))])
      styleDataRow(excelRow, i % 2 === 1)
    })
    yearMatrices.push({
      headerRow: hr.number,
      firstDataRow: hr.number + 1,
      lastDataRow: hr.number + matrix.rows.length,
      yearCols: matrix.years.length,
    })
  })

  let annual: TableRange | null = null
  if (model.annualSummary.length) {
    ws.addRow([])
    const t = ws.addRow(['Annual Summary'])
    styleSection(t.getCell(1))
    ws.mergeCells(t.number, 1, t.number, 4)
    const hr = ws.addRow(['Year', 'Rainfall mm', 'ET0 mm', 'Water deficit mm'])
    styleTableHeader(hr)
    model.annualSummary.forEach((r, i) => {
      const row = ws.addRow([
        r.year,
        fmtNum(r.rainfallMm, 1),
        fmtNum(r.et0Mm, 2),
        fmtNum(r.waterDeficitMm, 1),
      ])
      styleDataRow(row, i % 2 === 1)
    })
    annual = {
      headerRow: hr.number,
      firstDataRow: hr.number + 1,
      lastDataRow: hr.number + model.annualSummary.length,
    }
  }

  let risk: TableRange | null = null
  if (model.riskRows.length) {
    ws.addRow([])
    const t = ws.addRow(['Threshold and Risk-Day Counts'])
    styleSection(t.getCell(1))
    ws.mergeCells(t.number, 1, t.number, 10)
    const hr = ws.addRow([
      model.aggregation === 'month' || model.aggregation === 'year' ? 'Month' : 'Period',
      'Heat days Tmax>35C',
      'Extreme heat days Tmax>40C',
      'Cool nights Tmin<15C',
      'Cold nights Tmin<10C',
      'High gust days >50 km/h',
      'Extreme gust days >60 km/h',
      'RH>80% hours',
      'RH<30% hours',
      'Irrigation demand m3/ha',
    ])
    styleTableHeader(hr)
    model.riskRows.forEach((r, i) => {
      const row = ws.addRow([
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
      ])
      styleDataRow(row, i % 2 === 1)
    })
    risk = {
      headerRow: hr.number,
      firstDataRow: hr.number + 1,
      lastDataRow: hr.number + model.riskRows.length,
    }
  }

  let cumulative: TableRange | null = null
  if (model.cumulativeDeficit.length) {
    ws.addRow([])
    const t = ws.addRow(['Cumulative Water Deficit'])
    styleSection(t.getCell(1))
    ws.mergeCells(t.number, 1, t.number, 2)
    const hr = ws.addRow(['Month', 'Cumulative deficit'])
    styleTableHeader(hr)
    model.cumulativeDeficit.forEach((r, i) => {
      const row = ws.addRow([r.periodLabel, fmtNum(r.cumulativeMm, 1)])
      styleDataRow(row, i % 2 === 1)
    })
    cumulative = {
      headerRow: hr.number,
      firstDataRow: hr.number + 1,
      lastDataRow: hr.number + model.cumulativeDeficit.length,
    }
  }

  let cumulativeByYear: TableRange | null = null
  if (model.cumulativeByYear?.years.length) {
    const matrix = model.cumulativeByYear
    ws.addRow([])
    const titleRow = ws.addRow([matrix.title])
    styleSection(titleRow.getCell(1))
    ws.mergeCells(titleRow.number, 1, titleRow.number, Math.max(2, matrix.years.length + 1))
    const hr = ws.addRow(['Month', ...matrix.years.map(String)])
    styleTableHeader(hr)
    matrix.rows.forEach((row, i) => {
      const excelRow = ws.addRow([row.monthLabel, ...row.values.map(v => fmtNum(v, 1))])
      styleDataRow(excelRow, i % 2 === 1)
    })
    cumulativeByYear = {
      headerRow: hr.number,
      firstDataRow: hr.number + 1,
      lastDataRow: hr.number + matrix.rows.length,
      yearCols: matrix.years.length,
    }
  }

  autoWidth(ws, 12)

  return {
    normals: {
      headerRow: normalsHeaderRow,
      firstDataRow: normalsFirst,
      lastDataRow: normalsLast,
    },
    yearMatrices,
    annual,
    risk,
    cumulative,
    cumulativeByYear,
  }
}

function buildChartSpecs(
  model: MeteoDataReportModel,
  layout: DataLayout,
): { specs: MeteoNativeChartSpec[]; sectionRows: Array<{ row: number; label: string }> } {
  const agg = model.aggregationLabel
  const n = layout.normals
  const cats = dataRange(1, n.firstDataRow, n.lastDataRow)
  const specs: MeteoNativeChartSpec[] = []
  const sectionRows: Array<{ row: number; label: string }> = []
  let anchor = 0

  const push = (
    sectionLabel: string,
    title: string,
    kind: 'line' | 'bar',
    series: MeteoNativeChartSpec['series'],
    opts?: { varyColors?: boolean; legendPos?: 'b' | 'r' | 't' | 'l' },
  ) => {
    sectionRows.push({ row: anchor + 1, label: sectionLabel })
    specs.push({
      title,
      kind,
      series,
      anchorRow: anchor,
      sectionLabel,
      varyColors: opts?.varyColors ?? true,
      legendPos: opts?.legendPos,
    })
    anchor += 18
  }

  // Chart order mirrors GeoSyntra Charts sheet (varyColors matches reference styling).
  push('Temperature', `Temperature (${agg})`, 'line', [
    { nameRef: dataRef(2, n.headerRow), valuesRef: dataRange(2, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(3, n.headerRow), valuesRef: dataRange(3, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(4, n.headerRow), valuesRef: dataRange(4, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Rainfall', `Rainfall (${agg})`, 'bar', [
    { nameRef: dataRef(5, n.headerRow), valuesRef: dataRange(5, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Rainfall vs ET0', `Rainfall vs ET0 (${agg})`, 'line', [
    { nameRef: dataRef(5, n.headerRow), valuesRef: dataRange(5, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(6, n.headerRow), valuesRef: dataRange(6, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Water Deficit', `Water Deficit (${agg})`, 'bar', [
    { nameRef: dataRef(7, n.headerRow), valuesRef: dataRange(7, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Sunshine and Daylight', `Sunshine and Daylight (${agg})`, 'line', [
    { nameRef: dataRef(8, n.headerRow), valuesRef: dataRange(8, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(9, n.headerRow), valuesRef: dataRange(9, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Wind Speed and Gust', `Wind Speed and Gust (${agg})`, 'line', [
    { nameRef: dataRef(10, n.headerRow), valuesRef: dataRange(10, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(11, n.headerRow), valuesRef: dataRange(11, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Relative Humidity', `Relative Humidity (${agg})`, 'line', [
    { nameRef: dataRef(12, n.headerRow), valuesRef: dataRange(12, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])
  push('Climate Diagram', `Climate Diagram: Rainfall and Mean Temperature (${agg})`, 'bar', [
    { nameRef: dataRef(5, n.headerRow), valuesRef: dataRange(5, n.firstDataRow, n.lastDataRow), catsRef: cats },
    { nameRef: dataRef(4, n.headerRow), valuesRef: dataRange(4, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ])

  // Colored single-metric monthly bars (attachment style: each period a distinct color).
  push('Min Temp (Celsius)', `Min Temp (Celsius) (${agg})`, 'bar', [
    { nameRef: dataRef(3, n.headerRow), valuesRef: dataRange(3, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ], { legendPos: 'r' })
  push('Avg Temp (Celsius)', `Avg Temp (Celsius) (${agg})`, 'bar', [
    { nameRef: dataRef(4, n.headerRow), valuesRef: dataRange(4, n.firstDataRow, n.lastDataRow), catsRef: cats },
  ], { legendPos: 'r' })

  const matrixTitles = [
    'Monthly Tmax by Year',
    'Monthly Tmin by Year',
    'Monthly Rainfall by Year',
    'Monthly ET0 by Year',
    'Monthly Water Deficit by Year',
    'Monthly RH by Year',
  ]
  layout.yearMatrices.forEach((m, idx) => {
    const yearCount = m.yearCols ?? 0
    if (yearCount < 1) return
    const matrixCats = dataRange(1, m.firstDataRow, m.lastDataRow)
    const series = Array.from({ length: yearCount }, (_, yi) => ({
      nameRef: dataRef(2 + yi, m.headerRow),
      valuesRef: dataRange(2 + yi, m.firstDataRow, m.lastDataRow),
      catsRef: matrixCats,
    }))
    const kind = idx === 2 ? 'bar' : 'line'
    push(matrixTitles[idx] ?? `Year matrix ${idx + 1}`, matrixTitles[idx] ?? `Year matrix ${idx + 1}`, kind, series, {
      // Multi-series year comparison: keep series colors distinct, not point colors.
      varyColors: false,
      legendPos: 'r',
    })
  })

  if (layout.annual) {
    const a = layout.annual
    const catsA = dataRange(1, a.firstDataRow, a.lastDataRow)
    push('Annual Rainfall Comparison', 'Annual Rainfall Comparison', 'bar', [
      { nameRef: dataRef(2, a.headerRow), valuesRef: dataRange(2, a.firstDataRow, a.lastDataRow), catsRef: catsA },
    ], { legendPos: 'r' })
    push('Annual Rainfall vs ET0 vs Deficit', 'Annual Rainfall vs ET0 vs Deficit', 'bar', [
      { nameRef: dataRef(2, a.headerRow), valuesRef: dataRange(2, a.firstDataRow, a.lastDataRow), catsRef: catsA },
      { nameRef: dataRef(3, a.headerRow), valuesRef: dataRange(3, a.firstDataRow, a.lastDataRow), catsRef: catsA },
      { nameRef: dataRef(4, a.headerRow), valuesRef: dataRange(4, a.firstDataRow, a.lastDataRow), catsRef: catsA },
    ], { varyColors: false, legendPos: 'r' })
  }

  if (layout.risk) {
    const r = layout.risk
    const catsR = dataRange(1, r.firstDataRow, r.lastDataRow)
    push('Heat Stress Days', 'Heat Stress Days', 'bar', [
      { nameRef: dataRef(2, r.headerRow), valuesRef: dataRange(2, r.firstDataRow, r.lastDataRow), catsRef: catsR },
      { nameRef: dataRef(3, r.headerRow), valuesRef: dataRange(3, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { varyColors: false, legendPos: 'r' })
    push('Cool-Night / Cold-Risk Days', 'Cool-Night / Cold-Risk Days', 'bar', [
      { nameRef: dataRef(4, r.headerRow), valuesRef: dataRange(4, r.firstDataRow, r.lastDataRow), catsRef: catsR },
      { nameRef: dataRef(5, r.headerRow), valuesRef: dataRange(5, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { varyColors: false, legendPos: 'r' })
    push('High Wind Gust Risk Days', 'High Wind Gust Risk Days', 'bar', [
      { nameRef: dataRef(6, r.headerRow), valuesRef: dataRange(6, r.firstDataRow, r.lastDataRow), catsRef: catsR },
      { nameRef: dataRef(7, r.headerRow), valuesRef: dataRange(7, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { varyColors: false, legendPos: 'r' })
    push('High RH Disease-Risk Hours', 'High RH Disease-Risk Hours', 'bar', [
      { nameRef: dataRef(8, r.headerRow), valuesRef: dataRange(8, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { legendPos: 'r' })
    push('Low RH Dry-Air Stress Hours', 'Low RH Dry-Air Stress Hours', 'bar', [
      { nameRef: dataRef(9, r.headerRow), valuesRef: dataRange(9, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { legendPos: 'r' })
    push('Monthly Irrigation Demand from Climate Deficit', 'Monthly Irrigation Demand from Climate Deficit', 'bar', [
      { nameRef: dataRef(10, r.headerRow), valuesRef: dataRange(10, r.firstDataRow, r.lastDataRow), catsRef: catsR },
    ], { legendPos: 'r' })
  }

  // GeoSyntra chart23: single cumulative series with varyColors → multi-color segments.
  if (layout.cumulative) {
    const c = layout.cumulative
    push(
      'Cumulative Annual',
      'Cumulative Annual',
      'line',
      [
        {
          nameRef: dataRef(2, c.headerRow),
          valuesRef: dataRange(2, c.firstDataRow, c.lastDataRow),
          catsRef: dataRange(1, c.firstDataRow, c.lastDataRow),
        },
      ],
      { varyColors: true, legendPos: 'r' },
    )
  }

  // Multi-year cumulative lines (attachment: year-colored difference comparison).
  if (layout.cumulativeByYear && (layout.cumulativeByYear.yearCols ?? 0) > 0) {
    const m = layout.cumulativeByYear
    const yearCount = m.yearCols ?? 0
    const matrixCats = dataRange(1, m.firstDataRow, m.lastDataRow)
    const series = Array.from({ length: yearCount }, (_, yi) => ({
      nameRef: dataRef(2 + yi, m.headerRow),
      valuesRef: dataRange(2 + yi, m.firstDataRow, m.lastDataRow),
      catsRef: matrixCats,
    }))
    push('Cumulative Annual by Year', 'Cumulative Annual by Year', 'line', series, {
      varyColors: false,
      legendPos: 'r',
    })
  }

  return { specs, sectionRows }
}

function writeChartsSheet(
  wb: ExcelJS.Workbook,
  _model: MeteoDataReportModel,
  sectionRows: Array<{ row: number; label: string }>,
): void {
  const ws = wb.addWorksheet('Charts')
  ws.getColumn(1).width = 42
  for (const { row, label } of sectionRows) {
    const cell = ws.getCell(row, 1)
    cell.value = label
    styleSection(cell)
  }
  const last = sectionRows.length ? sectionRows[sectionRows.length - 1].row + 20 : 20
  if (ws.rowCount < last) {
    ws.getCell(last, 1).value = ''
  }
}

export async function buildWeatherClimateReportWorkbook(
  payload: WeatherClimateReportPayload,
): Promise<ExcelJS.Workbook & { __meteoChartSpecs?: MeteoNativeChartSpec[] }> {
  const wb = new ExcelJS.Workbook() as ExcelJS.Workbook & { __meteoChartSpecs?: MeteoNativeChartSpec[] }
  wb.creator = 'AgroCloud Weather Intelligence'
  wb.created = new Date()
  wb.title = `Meteo Data Report — ${payload.aoiName}`

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

  const layout = writeDataSheet(wb, model)
  const { specs, sectionRows } = buildChartSpecs(model, layout)
  writeChartsSheet(wb, model, sectionRows)
  wb.__meteoChartSpecs = specs
  return wb
}

export function weatherClimateReportFilename(aoiName: string, aggregation?: string): string {
  const slug = aoiName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'AOI'
  const date = new Date().toISOString().slice(0, 10)
  const agg = aggregation ? `_${aggregation}` : ''
  return `${slug}-MeteoDataReport${agg}-${date}.xlsx`
}

export async function generateWeatherClimateReportExcel(payload: WeatherClimateReportPayload): Promise<void> {
  const wb = await buildWeatherClimateReportWorkbook(payload)
  const specs = wb.__meteoChartSpecs ?? []
  const raw = await wb.xlsx.writeBuffer()
  const withCharts = await injectNativeMeteoCharts(raw as ArrayBuffer, specs)
  const blob = new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = weatherClimateReportFilename(
    payload.aoiName,
    climateAggregationLabel(payload.timeAggregation ?? 'day'),
  )
  a.click()
  URL.revokeObjectURL(url)
}
