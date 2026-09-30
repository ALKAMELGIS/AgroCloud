/**
 * ISS Irrigation Alert Excel export — matches irrigation comparison workbook layout.
 * Sheets: Summary · ISS Irrigation · DataRaw (with ISS per scene).
 */

import ExcelJS from 'exceljs'
import {
  WAPI_ALERT_LEVEL_LABELS,
  WAPI_HARVEST_STAGE_LABELS,
  compareIssAlertPriority,
  type WapiAlertDataRawRow,
  type WapiAlertFieldResult,
  type WapiAlertLevel,
} from './siWapiAlertEngine'

const HEADER = 'FF0D47A1'
const ALT = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'
const BRAND = 'FF1565C0'

function hexToArgb(hex: string): string {
  const h = String(hex || '').replace('#', '').trim()
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `FF${h.toUpperCase()}`
  if (/^[0-9a-fA-F]{8}$/.test(h)) return h.toUpperCase()
  return 'FF43A047'
}

/** Public for unit tests — ExcelJS Status-cell fill argb. */
export function wapiAlertLevelFillArgb(level: WapiAlertLevel, color?: string): string {
  if (color) return hexToArgb(color)
  const fallback: Record<WapiAlertLevel, string> = {
    critical: '#e91e63',
    severe: '#ef6c00',
    warning: '#fbc02d',
    watch: '#26a69a',
    safe: '#43a047',
    overwatering: '#5c6bc0',
  }
  return hexToArgb(fallback[level])
}

function slug(s: string): string {
  return (
    String(s || 'AOI')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'AOI'
  )
}

function yyyymmdd(iso?: string | null): string {
  return (iso || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
}

function fmt(n: number | null | undefined, digits = 4): number | string {
  if (n == null || !Number.isFinite(n)) return '-'
  return Number(n.toFixed(digits))
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  row.height = 22
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 40): void {
  const colCount = ws.columnCount || 14
  for (let c = 1; c <= colCount; c++) {
    let width = min
    ws.eachRow({ includeEmpty: false }, row => {
      const text = String(row.getCell(c).value ?? '')
      width = Math.min(max, Math.max(width, text.length + 2))
    })
    ws.getColumn(c).width = width
  }
}

export type GenerateWapiAlertExcelOptions = {
  aoiName?: string
  referenceDate?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  rawRows?: WapiAlertDataRawRow[]
}

export async function generateWapiAlertExcel(
  results: WapiAlertFieldResult[],
  options?: GenerateWapiAlertExcelOptions,
): Promise<{ blob: Blob; filename: string }> {
  const sorted = [...results].sort(compareIssAlertPriority)
  const periodStart =
    String(options?.periodStart || sorted[0]?.periodStart || '').slice(0, 10) ||
    String(options?.referenceDate || sorted[0]?.sceneDate || '').slice(0, 10)
  const periodEnd =
    String(options?.periodEnd || sorted[0]?.periodEnd || options?.referenceDate || sorted[0]?.sceneDate || '')
      .slice(0, 10)
  const rawRows = options?.rawRows ?? []

  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud ISS Alert'
  wb.created = new Date()

  const meta = wb.addWorksheet('Summary')
  meta.getCell('A1').value = 'ISS Irrigation Alert'
  meta.getCell('A1').font = { bold: true, size: 14, color: { argb: BRAND } }
  meta.getCell('A3').value = 'AOI'
  meta.getCell('B3').value = options?.aoiName || 'Active AOI layer'
  meta.getCell('A4').value = 'Period start'
  meta.getCell('B4').value = periodStart
  meta.getCell('A5').value = 'Period end'
  meta.getCell('B5').value = periodEnd
  meta.getCell('A6').value = 'Fields'
  meta.getCell('B6').value = sorted.length
  meta.getCell('A7').value = 'DataRaw rows'
  meta.getCell('B7').value = rawRows.length
  meta.getCell('A8').value = 'Generated'
  meta.getCell('B8').value = new Date().toISOString()
  ;[3, 4, 5, 6, 7, 8].forEach(r => {
    meta.getCell(r, 1).font = { bold: true, color: { argb: MUTED }, size: 9 }
  })

  const ws = wb.addWorksheet('ISS Irrigation', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.mergeCells('F1:H1')
  ws.getCell('F1').value = 'ISS Irrigation Stress Index Report'
  ws.getCell('F1').font = { bold: true, size: 12, color: { argb: BRAND } }
  ws.getCell('F1').alignment = { horizontal: 'center' }

  const headers = [
    'Field ID',
    'Field Name',
    'ISS',
    'ΔISS',
    'Alert Level',
    'Water Stress',
    'Harvest Stage',
    'Priority Rank',
    'Recommended Action',
    'Period Start',
    'Period End',
    'Scene Date',
    'NDMI',
    'NDWI',
    'NDVI',
    'ETstress',
  ]
  headers.forEach((h, i) => {
    ws.getCell(4, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(4))

  sorted.forEach((row, idx) => {
    const r = idx + 5
    const values: Array<string | number> = [
      row.fieldId,
      row.fieldName,
      fmt(row.iss),
      fmt(row.deltaIss),
      WAPI_ALERT_LEVEL_LABELS[row.alertLevel],
      row.waterStressStatus,
      WAPI_HARVEST_STAGE_LABELS[row.harvestStage],
      row.priorityRank,
      row.recommendedAction,
      row.periodStart || periodStart || '-',
      row.periodEnd || periodEnd || '-',
      row.sceneDate ?? '-',
      fmt(row.ndmi),
      fmt(row.ndwi),
      fmt(row.ndvi),
      fmt(row.etStress),
    ]
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = v
      cell.font = { size: 9, color: { argb: INK } }
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
      }
    })

    const fillArgb = wapiAlertLevelFillArgb(row.alertLevel, row.color)
    const alertCell = ws.getCell(r, 5)
    alertCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
    alertCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }

    const rankCell = ws.getCell(r, 8)
    rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
    rankCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
  })

  if (sorted.length) {
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + sorted.length, column: headers.length },
    }
  }

  const raw = wb.addWorksheet('DataRaw', { views: [{ state: 'frozen', ySplit: 1 }] })
  const rawHeaders = ['PLO', 'Date', 'NDVI', 'NDMI', 'NDWI', 'SAVI', 'ISS']
  rawHeaders.forEach((h, i) => {
    raw.getCell(1, i + 1).value = h
  })
  styleHeaderRow(raw.getRow(1))
  rawRows.forEach((row, idx) => {
    const r = idx + 2
    const values: Array<string | number> = [
      row.plot,
      row.date,
      fmt(row.ndvi),
      fmt(row.ndmi),
      fmt(row.ndwi),
      fmt(row.savi),
      fmt(row.iss),
    ]
    values.forEach((v, i) => {
      const cell = raw.getCell(r, i + 1)
      cell.value = v
      cell.font = { size: 9, color: { argb: INK } }
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
      }
    })
  })
  if (rawRows.length) {
    raw.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1 + rawRows.length, column: rawHeaders.length },
    }
  }

  autoWidth(ws)
  autoWidth(raw, 10, 28)
  autoWidth(meta, 12, 48)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const filename = `ISS_Irrigation_${slug(options?.aoiName || 'AOI')}_${yyyymmdd(periodEnd || options?.referenceDate)}.xlsx`
  return { blob, filename }
}

export function downloadWapiAlertExcelBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
