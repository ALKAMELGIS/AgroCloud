import type ExcelJS from 'exceljs'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

/** Sheet tab order for Serbia / Batch Analytics reference workbooks. */
export const SERBIA_ANALYTICS_SHEET_ORDER = [
  'Summary',
  'Charts',
  'Map Snapshot',
  'Analytics Summary',
  'Time Series Data',
  'NDVI Data',
  'NDMI Data',
  'NDWI Data',
  'SAVI Data',
  'ET Data',
  'Estimated Water Loss Timeline',
  'Estimated Yield (t-ha)',
  'Analysis & Recommendations',
] as const

export const SERBIA_ANALYTICS_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET'] as const

const SUMMARY_DARK = 'FF0B3D2E'
const SUMMARY_BAND = 'FF1E7A46'
const KPI_GREEN = 'FF2E7D32'
const KPI_RED = 'FFC62828'
const KPI_ORANGE = 'FFF5A623'
const KPI_VALUE = 'FFEAF4EC'
const INK = 'FF0F172A'
const WHITE = 'FFFFFFFF'

export type SummarySheetMeta = {
  observationCount: number
  timeSeriesDataRows: number
  waterLossDataRows: number
}

function fillRange(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  fillArgb: string,
): void {
  for (let c = colStart; c <= colEnd; c++) {
    ws.getRow(row).getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fillArgb },
    }
  }
}

function mergeRow(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  value: string | { formula: string },
  fillArgb: string,
  font: Partial<ExcelJS.Font>,
  height?: number,
): void {
  ws.mergeCells(row, colStart, row, colEnd)
  const cell = ws.getRow(row).getCell(colStart)
  cell.value = value
  cell.font = font
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  fillRange(ws, row, colStart, colEnd, fillArgb)
  if (height != null) ws.getRow(row).height = height
}

function mergeKpiHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  label: string,
  fillArgb: string,
): void {
  mergeRow(
    ws,
    row,
    colStart,
    colEnd,
    label,
    fillArgb,
    { bold: true, size: 9, color: { argb: WHITE } },
    15.75,
  )
}

function mergeKpiValue(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  value: string | { formula: string },
  font: Partial<ExcelJS.Font>,
  height?: number,
): void {
  mergeRow(ws, row, colStart, colEnd, value, KPI_VALUE, font, height)
}

/** Move worksheets to match {@link SERBIA_ANALYTICS_SHEET_ORDER} (unknown sheets stay at end). */
export function reorderWorksheets(wb: ExcelJS.Workbook, order: readonly string[]): void {
  const internal = wb as ExcelJS.Workbook & { _worksheets?: Array<ExcelJS.Worksheet | undefined> }
  const sheets = (internal._worksheets ?? []).filter((w): w is ExcelJS.Worksheet => Boolean(w))
  const byName = new Map(sheets.map(ws => [ws.name, ws]))
  const reordered: Array<ExcelJS.Worksheet | undefined> = [undefined]

  for (const name of order) {
    const ws = byName.get(name)
    if (ws) {
      reordered.push(ws)
      byName.delete(name)
    }
  }
  for (const ws of byName.values()) reordered.push(ws)

  reordered.forEach((ws, index) => {
    if (ws) {
      ws.id = index
      ws.orderNo = index
    }
  })
  internal._worksheets = reordered
}

/**
 * Dashboard cover sheet (KPI cards + linked tables) — matches 501a KL-0231 reference layout.
 */
export function buildSummarySheet(
  wb: ExcelJS.Workbook,
  payload: TimeSeriesReportPayload,
  meta: SummarySheetMeta,
): void {
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws.columns = Array.from({ length: 11 }, () => ({ width: 14 }))

  const periodLabel = `${payload.period.from} to ${payload.period.to}`
  const obs = Math.max(1, meta.observationCount)
  const tsRows = Math.max(1, meta.timeSeriesDataRows)
  const wlRows = Math.max(1, meta.waterLossDataRows)
  const wlLatestRow = 4 + wlRows

  mergeRow(
    ws,
    1,
    1,
    11,
    'AGRICULTURAL SATELLITE INTELLIGENCE — FIELD REPORT',
    SUMMARY_DARK,
    { bold: true, size: 16, color: { argb: WHITE } },
    33.75,
  )

  mergeRow(
    ws,
    2,
    1,
    11,
    {
      formula: `"Field "&'Analytics Summary'!B5&"   |   Period: "&'Analytics Summary'!B7&"   |   Source: "&'Analytics Summary'!B8`,
    },
    SUMMARY_BAND,
    { size: 10, color: { argb: WHITE } },
    19.5,
  )

  mergeKpiHeader(ws, 4, 1, 2, 'LATEST NDVI (Vigor)', KPI_GREEN)
  mergeKpiHeader(ws, 4, 3, 4, 'WATER LOSS INDEX', KPI_RED)
  mergeKpiHeader(ws, 4, 5, 6, 'LOSS RATE (m3/ha/day)', KPI_RED)
  mergeKpiHeader(ws, 4, 7, 8, 'EST. YIELD (t/ha)', KPI_GREEN)
  mergeKpiHeader(ws, 4, 9, 11, 'MOISTURE STATUS (NDMI)', KPI_ORANGE)

  mergeKpiValue(ws, 5, 1, 2, { formula: "'Analytics Summary'!A31" }, { bold: true, size: 18, color: { argb: INK } }, 25.5)
  mergeKpiValue(ws, 5, 3, 4, { formula: `'Estimated Water Loss Timeline'!B${wlLatestRow}` }, { bold: true, size: 18, color: { argb: INK } })
  mergeKpiValue(ws, 5, 5, 6, { formula: `'Estimated Water Loss Timeline'!D${wlLatestRow}` }, { bold: true, size: 18, color: { argb: INK } })
  mergeKpiValue(ws, 5, 7, 8, { formula: "'Estimated Yield (t-ha)'!B8" }, { bold: true, size: 18, color: { argb: INK } })
  mergeKpiValue(ws, 5, 9, 11, { formula: "'Analytics Summary'!B31" }, { bold: true, size: 18, color: { argb: INK } })

  mergeKpiValue(ws, 6, 1, 2, { formula: "'Analytics Summary'!B15" }, { size: 9, color: { argb: INK } }, 13.5)
  mergeKpiValue(ws, 6, 3, 4, { formula: `'Estimated Water Loss Timeline'!I${wlLatestRow}` }, { size: 9, color: { argb: INK } })
  mergeKpiValue(ws, 6, 5, 6, 'Critical priority', { size: 9, color: { argb: INK } })
  mergeKpiValue(ws, 6, 7, 8, { formula: `'Estimated Yield (t-ha)'!B10&" class"` }, { size: 9, color: { argb: INK } })
  mergeKpiValue(ws, 6, 9, 11, { formula: `'Analytics Summary'!E43&" flag"` }, { size: 9, color: { argb: INK } })

  mergeRow(ws, 8, 1, 11, 'EXECUTIVE SUMMARY', SUMMARY_BAND, { bold: true, size: 11, color: { argb: WHITE } }, 18)
  ws.mergeCells(9, 1, 12, 11)
  ws.getCell('A9').value = { formula: "'Analysis & Recommendations'!B6" }
  ws.getCell('A9').alignment = { wrapText: true, vertical: 'top' }
  ws.getCell('A9').font = { size: 10, color: { argb: INK } }
  ws.getRow(9).height = 60

  mergeRow(ws, 13, 1, 11, 'KEY RECOMMENDATIONS', SUMMARY_BAND, { bold: true, size: 11, color: { argb: WHITE } }, 18)
  ws.mergeCells(14, 1, 15, 11)
  ws.getCell('A14').value = {
    formula: `"• "&SUBSTITUTE('Analysis & Recommendations'!B26,"- ","")&"    • "&SUBSTITUTE('Analysis & Recommendations'!B27,"- ","")&"    • "&SUBSTITUTE('Analysis & Recommendations'!B28,"- ","")`,
  }
  ws.getCell('A14').alignment = { wrapText: true, vertical: 'top' }
  ws.getCell('A14').font = { size: 10, color: { argb: INK } }
  ws.getRow(14).height = 36

  mergeRow(
    ws,
    16,
    1,
    11,
    `SATELLITE INDEX TIME SERIES  (${obs} observations, ${periodLabel})`,
    SUMMARY_BAND,
    { bold: true, size: 10, color: { argb: WHITE } },
    15,
  )

  const tsHeader = ws.getRow(17)
  tsHeader.values = ['Date', 'NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET (mm/day)', 'Vigor Class']
  tsHeader.eachCell((cell, col) => {
    if (col <= 7) {
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_DARK } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  })
  ws.getRow(17).height = 18

  const tsStart = 18
  for (let i = 0; i < tsRows; i++) {
    const r = tsStart + i
    const src = 2 + i
    for (let c = 1; c <= 7; c++) {
      const col = String.fromCharCode(64 + c)
      ws.getRow(r).getCell(c).value = { formula: `'Time Series Data'!${col}${src}` }
    }
    ws.getRow(r).height = 15
  }

  const wlHeaderRow = tsStart + tsRows + 2
  mergeRow(
    ws,
    wlHeaderRow,
    1,
    11,
    'ESTIMATED WATER LOSS TIMELINE  (irrigation priority, per acquisition date)',
    SUMMARY_BAND,
    { bold: true, size: 10, color: { argb: WHITE } },
    15,
  )

  const wlColHeader = ws.getRow(wlHeaderRow + 1)
  wlColHeader.values = [
    'Date',
    'Water Loss Index (%)',
    'Loss (m3/day)',
    'Loss (m3/ha/day)',
    'Coverage (%)',
    'Stress Level',
    'Trend',
  ]
  wlColHeader.eachCell((cell, col) => {
    if (col <= 7) {
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_DARK } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }
  })

  const wlDataStart = wlHeaderRow + 2
  const wlSourceCols = ['A', 'B', 'C', 'D', 'G', 'I', 'J'] as const
  for (let i = 0; i < wlRows; i++) {
    const r = wlDataStart + i
    const src = 5 + i
    wlSourceCols.forEach((col, ci) => {
      ws.getRow(r).getCell(ci + 1).value = {
        formula: `'Estimated Water Loss Timeline'!${col}${src}`,
      }
    })
  }
}
