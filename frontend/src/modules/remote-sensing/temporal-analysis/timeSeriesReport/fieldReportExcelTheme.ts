import type ExcelJS from 'exceljs'

/** Reference palette — Copy of Serbia_Field_Report__2026-08-05.xlsx */
export const FR = {
  BANNER: 'FF1A4E26',
  LABEL: 'FFF2F2F2',
  METRIC: 'FFE8EEF7',
  BORDER: 'FFBFBFBF',
  SECTION: 'FFE2F5EE',
  HEADER: 'FF065F46',
  INK: 'FF0F172A',
  MUTED: 'FF64748B',
  WHITE: 'FFFFFFFF',
  BRAND: 'FF064E3B',
} as const

export const FR_NUM = {
  ONE_DEC: '0.0',
  PCT: '0.0%',
  TONS: '#,##0.0',
} as const

/** Stacked bar + pie chart colors from the reference workbook. */
export const FR_CHART = {
  PLANNED: '2E7D32',
  UNPLANNED: 'E07B00',
  PIE_SLICES: ['2E7D32', 'F2C511', 'E07B00', 'C00000', '4F81BD'],
} as const

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: FR.BORDER } },
  left: { style: 'thin', color: { argb: FR.BORDER } },
  bottom: { style: 'thin', color: { argb: FR.BORDER } },
  right: { style: 'thin', color: { argb: FR.BORDER } },
}

export function applySheetTitleBanner(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  mergeToCol: number,
): void {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', bold: true, size: 16, color: { argb: FR.WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FR.BANNER } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.mergeCells(row, 1, row, mergeToCol)
  ws.getRow(row).height = 22
}

export function applySheetSubtitle(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  mergeToCol: number,
): void {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size: 10, color: { argb: FR.MUTED } }
  ws.mergeCells(row, 1, row, mergeToCol)
}

export function applySectionBanner(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  mergeToCol: number,
): void {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', bold: true, size: 12, color: { argb: FR.WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FR.BANNER } }
  cell.alignment = { vertical: 'middle' }
  ws.mergeCells(row, 1, row, mergeToCol)
  ws.getRow(row).height = 18
}

export function applyKvLabel(cell: ExcelJS.Cell, label: string): void {
  cell.value = label
  cell.font = { name: 'Arial', bold: true, size: 10 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FR.LABEL } }
  cell.border = THIN_BORDER
  cell.alignment = { vertical: 'middle', wrapText: true }
}

export function applyKvPlainValue(cell: ExcelJS.Cell, value: string | number): void {
  cell.value = value
  cell.font = { name: 'Arial', size: 10 }
  cell.border = THIN_BORDER
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
}

export function applyKvMetricBlock(
  ws: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: string | number,
  numFmt?: string,
): void {
  for (let c = startCol; c <= endCol; c++) {
    const cell = ws.getCell(row, c)
    cell.border = THIN_BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FR.METRIC } }
    cell.font = { name: 'Arial', bold: true, size: 11 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    if (numFmt) cell.numFmt = numFmt
  }
  ws.getCell(row, startCol).value = value
  if (endCol > startCol) ws.mergeCells(row, startCol, row, endCol)
}

export function applyKvProductionValue(
  ws: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: string | number,
  numFmt?: string,
): void {
  for (let c = startCol; c <= endCol; c++) {
    const cell = ws.getCell(row, c)
    cell.border = THIN_BORDER
    cell.font = { name: 'Arial', bold: true, size: 11 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    if (numFmt) cell.numFmt = numFmt
  }
  ws.getCell(row, startCol).value = value
  if (endCol > startCol) ws.mergeCells(row, startCol, row, endCol)
}

export function applyTableHeader(cell: ExcelJS.Cell, text: string): void {
  cell.value = text
  cell.font = { name: 'Arial', bold: true, size: 10 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FR.LABEL } }
  cell.border = THIN_BORDER
  cell.alignment = { vertical: 'middle', wrapText: true }
}

export function applyTableText(cell: ExcelJS.Cell, value: string | number): void {
  cell.value = value
  cell.font = { name: 'Arial', size: 10 }
  cell.border = THIN_BORDER
  cell.alignment = { vertical: 'middle', wrapText: true }
}

export function applyTableNumber(
  cell: ExcelJS.Cell,
  value: number | string,
  numFmt: string,
): void {
  cell.value = value
  cell.font = { name: 'Arial', size: 11 }
  cell.border = THIN_BORDER
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.numFmt = numFmt
}

export function applyNoteRow(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  mergeToCol: number,
): void {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: FR.MUTED } }
  cell.alignment = { vertical: 'top', wrapText: true }
  ws.mergeCells(row, 1, row, mergeToCol)
  ws.getRow(row).height = 36
}

export function applyFindingBullet(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  mergeToCol: number,
): void {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size: 10 }
  cell.alignment = { vertical: 'top', wrapText: true }
  ws.mergeCells(row, 1, row, mergeToCol)
  ws.getRow(row).height = 28
}

export function mergeKvValueRow(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number): void {
  if (endCol > startCol) ws.mergeCells(row, startCol, row, endCol)
}

/** Overview key-value block (label col A + merged value cols B–D) — matches Area & Coverage / Executive sheets. */
export const KV_VALUE_END = 4

export function writeKvOverviewRow(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string | number,
  numFmt?: string,
): void {
  applyKvLabel(ws.getCell(row, 1), label)
  for (let c = 2; c <= KV_VALUE_END; c++) {
    applyKvPlainValue(ws.getCell(row, c), '')
  }
  const valueCell = ws.getCell(row, 2)
  valueCell.value = value
  valueCell.font = { name: 'Arial', size: 10 }
  if (numFmt) valueCell.numFmt = numFmt
  mergeKvValueRow(ws, row, 2, KV_VALUE_END)
}

export function writeKvMetricRow(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string | number,
  numFmt?: string,
): void {
  applyKvLabel(ws.getCell(row, 1), label)
  applyKvMetricBlock(ws, row, 2, KV_VALUE_END, value, numFmt)
}

export function setKvSummaryColumnWidths(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 35.33
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 4
  ws.getColumn(4).width = 30
}

export function setExecutiveSummaryColumnWidths(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 35.33
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 4
  ws.getColumn(4).width = 30
  ws.getColumn(5).width = 18
  ws.getColumn(6).width = 4
  ws.getColumn(7).width = 55
}

export function setAreaCoverageColumnWidths(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 20
  ws.getColumn(3).width = 16
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 16
  ws.getColumn(6).width = 14
  ws.getColumn(7).width = 12
  ws.getColumn(8).width = 18
  ws.getColumn(9).width = 26
  ws.getColumn(10).width = 12
}

/** NDVI stress band colors for Production Estimation Stress Level column. */
export function applyNdviStressLevelCell(
  cell: ExcelJS.Cell,
  level: import('./productionEstimationSheet').NdviStressLevel | '—',
): void {
  const styles: Record<
    import('./productionEstimationSheet').NdviStressLevel,
    { fill: string; text: string }
  > = {
    'Healthy Crop': { fill: 'FFD1FAE5', text: 'FF065F46' },
    'Moderate Crop': { fill: 'FFFEF3C7', text: 'FF92400E' },
    'Stressed Crop': { fill: 'FFFFEDD5', text: 'FF9A3412' },
    'Non-Vegetated / Unplanned': { fill: 'FFFECACA', text: 'FF991B1B' },
  }
  const style = level !== '—' ? styles[level] : null
  cell.font = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: style ? { argb: style.text } : { argb: FR.INK },
  }
  cell.border = THIN_BORDER
  cell.alignment = { vertical: 'middle', wrapText: true }
  if (style) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
  }
}

/** Area sheet column layout (layer attributes + chart source). */
export const AREA_SHEET_COL = {
  FIELD_ID: 1,
  FIELD_NAME: 2,
  CROP: 3,
  IRRIGATION: 4,
  PLANNED: 5,
  UNPLANNED: 6,
  TOTAL: 7,
  WATER_LOSS_INDEX: 8,
  STRESS_CATEGORY: 9,
  STRESS_AREA: 10,
  MERGE_END: 10,
} as const
