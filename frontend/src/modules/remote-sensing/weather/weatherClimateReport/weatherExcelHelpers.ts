import type ExcelJS from 'exceljs'

export const SHEET = {
  hourly: 'Hourly Raw Data',
  daily: 'Daily Weather Summary',
  monthly: 'Monthly Weather Summary',
  stats: 'Statistical Analysis',
  comparison: 'Comparison Analysis',
  change: 'Change Detection',
  indicators: 'Weather Indicators',
  kpis: 'Executive Dashboard',
  charts: 'Charts Dashboard',
  summary: 'Executive Summary',
} as const

export const TABLE = {
  hourly: 'HourlyRaw',
  daily: 'DailyWeather',
  monthly: 'MonthlyWeather',
  indicators: 'WeatherIndicators',
} as const

export const BRAND_DARK = 'FF064E3B'
export const HEADER_FILL = 'FF065F46'
export const SECTION_FILL = 'FFE2F5EE'
export const ALT_ROW = 'FFF8FAFC'
export const INK = 'FF0F172A'

export function colLetter(col1Based: number): string {
  let n = col1Based
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function sheetRef(sheet: string, col: number, row: number): string {
  return `'${sheet}'!$${colLetter(col)}$${row}`
}

export function sheetRange(sheet: string, col: number, r1: number, r2: number): string {
  return `'${sheet}'!$${colLetter(col)}$${r1}:$${colLetter(col)}$${r2}`
}

export function fmtNum(n: number | null | undefined, digits = 1): string | number {
  if (n == null || !Number.isFinite(n)) return ''
  return Number(n.toFixed(digits))
}

export function thinBorder(color: string): Partial<ExcelJS.Borders> {
  const b = { style: 'thin' as const, color: { argb: color } }
  return { top: b, bottom: b, left: b, right: b }
}

export function styleTitle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 14, color: { argb: INK } }
}

export function styleSection(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } }
}

export function styleTableHeader(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder(BRAND_DARK)
  })
  row.height = 22
}

export function styleDataRow(row: ExcelJS.Row, alt: boolean): void {
  row.eachCell(cell => {
    if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
    cell.border = thinBorder('FFE2E8F0')
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
}

export function autoWidth(ws: ExcelJS.Worksheet, maxCol: number, cap = 40): void {
  for (let c = 1; c <= maxCol; c++) {
    let max = 10
    ws.eachRow(row => {
      const v = row.getCell(c).value
      const len = v == null ? 0 : String(v).length
      if (len > max) max = Math.min(len + 2, cap)
    })
    ws.getColumn(c).width = max
  }
}

export function addExcelTable(
  ws: ExcelJS.Worksheet,
  name: string,
  headerRow: number,
  colCount: number,
  dataRowCount: number,
  columnNames: string[],
): void {
  if (dataRowCount < 1) return
  const lastRow = headerRow + dataRowCount
  const ref = `A${headerRow}:${colLetter(colCount)}${lastRow}`
  ws.addTable({
    name,
    ref,
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columnNames.map(n => ({ name: n, filterButton: true })),
    rows: [],
  })
}

export function setSheetLink(ws: ExcelJS.Worksheet, row: number, col: number, targetSheet: string, label: string): void {
  const cell = ws.getCell(row, col)
  cell.value = {
    text: label,
    hyperlink: `#'${targetSheet}'!A1`,
    tooltip: `Go to ${targetSheet}`,
  }
  cell.font = { color: { argb: 'FF0566C7' }, underline: true }
}

export function formulaDiff(curCol: string, prevCol: string, row: number): ExcelJS.CellValue {
  return { formula: `${curCol}${row}-${prevCol}${row}`, result: undefined }
}

export function formulaPctChange(diffCol: string, prevCol: string, row: number): ExcelJS.CellValue {
  return {
    formula: `IF(${prevCol}${row}=0,"",${diffCol}${row}/${prevCol}${row}*100)`,
    result: undefined,
  }
}

export function formulaTrendArrow(diffCol: string, row: number): ExcelJS.CellValue {
  return {
    formula: `IF(ABS(${diffCol}${row})<0.01,"→",IF(${diffCol}${row}>0,"↑","↓"))`,
    result: undefined,
  }
}

export function applyNumberFormat(ws: ExcelJS.Worksheet, col: number, format: string, fromRow: number, toRow: number): void {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(r, col).numFmt = format
  }
}
