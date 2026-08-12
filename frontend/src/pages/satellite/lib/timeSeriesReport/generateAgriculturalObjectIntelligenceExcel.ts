/**
 * ExcelJS workbook — Agricultural Object Intelligence Report
 * Sheet 1: results only (clean values from Layer index analysis)
 * Sheet 2: Equations & Methods (all formulas / rules)
 */

import ExcelJS from 'exceljs'
import {
  AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS,
  NOT_AVAILABLE,
  REQUIRES_CROP_MODEL,
  REQUIRES_ET_DATASET,
} from './agriculturalObjectIntelligenceSchema'
import type { AgriculturalObjectIntelligenceModel } from './buildAgriculturalObjectIntelligenceModel'
import { sanitizeTimeSeriesReportExcelFilename } from './generateTimeSeriesReportExcel'

const BRAND = 'FF1F4E37'
const HEADER_FILL = 'FF1F4E37'
const SUBTITLE = 'FF595959'
const NOTE_RED = 'FF9C0006'
const HEALTHY_FILL = 'FFD9EAD3'
const STRESS_FILL = 'FFFCE5CD'
const ALT_ROW = 'FFF5F5F5'
const INK = 'FF0F172A'

/** Approximate column widths aligned with EXAMPLE workbook (A–AT). */
const COLUMN_WIDTHS: number[] = [
  12, 16, 16, 14, 11, 11, 10, 12, 11, 14, 11, 22, 10, 16, 16, 7, 7, 7, 11, 12, 26, 24, 24, 24, 24,
  26, 28, 26, 22, 24, 24, 22, 22, 18, 18, 28, 28, 36, 36, 36, 32, 32, 28, 36, 36, 36,
]

function isUnavailableCell(value: string | number): boolean {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s) return true
  if (s === NOT_AVAILABLE || s === REQUIRES_ET_DATASET || s === REQUIRES_CROP_MODEL) return true
  if (/^Not Available/i.test(s)) return true
  if (s === '--') return true
  return false
}

function cropHealthFill(value: string | number): string | null {
  const s = String(value).trim().toLowerCase()
  if (!s || isUnavailableCell(value)) return null
  if (s.includes('high stress') || s.includes('stress')) return STRESS_FILL
  if (s.includes('moderate')) return STRESS_FILL
  if (s.includes('healthy')) return HEALTHY_FILL
  return null
}

export function sanitizeAgriculturalObjectIntelFilename(layerName: string): string {
  const stem = sanitizeTimeSeriesReportExcelFilename(
    `Agricultural_Object_Intelligence_Report_${layerName || 'Export'}`,
  ).replace(/\.xlsx$/i, '')
  return `${stem}.xlsx`
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function addEquationsSheet(wb: ExcelJS.Workbook, model: AgriculturalObjectIntelligenceModel) {
  const sheet = wb.addWorksheet('Equations & Methods', {
    properties: { defaultRowHeight: 18 },
  })

  sheet.mergeCells(1, 1, 1, 5)
  const title = sheet.getCell(1, 1)
  title.value = 'Equations & Methods — Layer Index Analysis'
  title.font = { bold: true, size: 14, color: { argb: BRAND } }

  sheet.mergeCells(2, 1, 2, 5)
  const sub = sheet.getCell(2, 1)
  sub.value = `Object layer: ${model.meta.layerName}  ·  Layer index: ${model.meta.layerIndexLabel || model.meta.analysisLayers.join(', ')}  ·  Period: ${model.meta.fromDate} → ${model.meta.toDate}`
  sub.font = { size: 9, color: { argb: SUBTITLE } }
  sub.alignment = { wrapText: true }
  sheet.getRow(2).height = 28

  sheet.mergeCells(3, 1, 3, 5)
  const note = sheet.getCell(3, 1)
  note.value =
    'This sheet documents every equation / decision rule used to fill the Agricultural Object Report. Sheet 1 contains clean results only (no long methodology text in cells).'
  note.font = { size: 8, italic: true, color: { argb: NOTE_RED } }
  note.alignment = { wrapText: true }
  sheet.getRow(3).height = 32

  const headers = ['Field', 'Equation / Rule', 'Inputs', 'Layer index', 'Example result']
  const headerRow = sheet.getRow(5)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  headerRow.height = 22

  const rows =
    model.equations?.length > 0
      ? model.equations
      : [
          {
            field: '(none recorded)',
            equation: 'No derived metrics — widen date range or ensure Layer index zonal stats returned values',
            inputs: '—',
            layerIndex: model.meta.layerIndexLabel || '—',
            resultExample: '—',
          },
        ]

  rows.forEach((eq, i) => {
    const r = sheet.getRow(6 + i)
    const vals = [eq.field, eq.equation, eq.inputs, eq.layerIndex, eq.resultExample]
    vals.forEach((v, c) => {
      const cell = r.getCell(c + 1)
      cell.value = v
      cell.font = { size: 9, color: { argb: INK } }
      cell.alignment = { vertical: 'top', wrapText: true }
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
      }
    })
    r.height = 36
  })

  const catalogStart = 6 + rows.length + 2
  sheet.getCell(catalogStart, 1).value = 'Core formula catalog (Layer index)'
  sheet.getCell(catalogStart, 1).font = { bold: true, color: { argb: BRAND }, size: 11 }

  const catalog: Array<[string, string]> = [
    ['NDVI (mean)', 'Late-window mean of daily zonal NDVI for the selected Layer index'],
    ['Kc(NDVI)', 'Kc = clamp(0.12 + NDVI×1.35, 0.15, 1.20)'],
    ['Actual ET (mm)', 'ETa = ET₀(Open-Meteo) × Kc(NDVI)  — fallback: max(0.5, NDVI×5.5)×days×(Kc/0.8)'],
    ['Crop water req. (mm)', 'CWR ≈ ETc ≈ ETa (period total)'],
    ['Water use (m³)', 'Volume = ETa_mm × Area_ha × 10'],
    ['Water productivity', 'WP (kg/m³) = 100 × Yield_t/ha / ETa_mm'],
    ['Yield (t/ha)', 'Y = clamp(8.5/(1+e^(−10×(NDVI−0.42)))−0.4, 0.1, 9.5) cereal-equivalent'],
    ['Production (t)', 'Production = Yield_t/ha × Area_ha'],
    ['Water stress', 'NDMI < −0.1 High; < 0.1 Moderate; else Low'],
    ['Irrigation', 'NDMI < −0.05 Under-irrigated; < 0.12 Adequately irrigated; else Well supplied'],
    ['Crop health', 'NDVI < 0.35 High Stress; < 0.5 Moderate; else Healthy'],
    ['Suitability', 'NDVI thresholds 0.5 / 0.35 / 0.2 → Highly / Moderately / Marginally suitable'],
    ['Phenology dates', 'Green-up NDVI cross 0.28→0.32; harvest after peak ΔNDVI ≤ −0.08'],
  ]
  catalog.forEach(([name, eq], i) => {
    sheet.getCell(catalogStart + 1 + i, 1).value = name
    sheet.getCell(catalogStart + 1 + i, 1).font = { bold: true, size: 9 }
    sheet.mergeCells(catalogStart + 1 + i, 2, catalogStart + 1 + i, 5)
    sheet.getCell(catalogStart + 1 + i, 2).value = eq
    sheet.getCell(catalogStart + 1 + i, 2).font = { size: 9 }
    sheet.getCell(catalogStart + 1 + i, 2).alignment = { wrapText: true }
  })

  sheet.getColumn(1).width = 28
  sheet.getColumn(2).width = 72
  sheet.getColumn(3).width = 36
  sheet.getColumn(4).width = 14
  sheet.getColumn(5).width = 16
  sheet.views = [{ state: 'frozen', ySplit: 5 }]
}

export async function buildAgriculturalObjectIntelligenceWorkbook(
  model: AgriculturalObjectIntelligenceModel,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud'
  wb.created = new Date(model.meta.exportedAt)
  wb.title = model.meta.title

  const sheet = wb.addWorksheet('Agricultural Object Report', {
    properties: { defaultRowHeight: 16 },
  })

  const colCount = AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS.length
  const indexLabel = model.meta.layerIndexLabel || model.meta.analysisLayers.join(', ') || 'NDVI'

  // Row 1 — title
  sheet.mergeCells(1, 1, 1, Math.min(12, colCount))
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = model.meta.title || 'Agricultural Object Intelligence Report'
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND } }
  titleCell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 24

  // Row 2 — subtitle meta
  sheet.mergeCells(2, 1, 2, Math.min(12, colCount))
  const sub = sheet.getCell(2, 1)
  sub.value = `Objects: ${model.meta.layerName}  ·  Layer index: ${indexLabel}  ·  Count: ${model.meta.objectCount}  ·  Period: ${model.meta.fromDate} → ${model.meta.toDate}  ·  ${model.meta.exportedAt}`
  sub.font = { size: 9, color: { argb: SUBTITLE } }
  sub.alignment = { wrapText: true, vertical: 'middle' }
  sheet.getRow(2).height = 28

  // Row 3 — note pointing to Equations sheet
  sheet.mergeCells(3, 1, 3, Math.min(12, colCount))
  const note = sheet.getCell(3, 1)
  note.value =
    'Smart report: cells hold analysis results only (from selected Layer index + object geometry). All equations and rules are on sheet “Equations & Methods”.'
  note.font = { size: 8, color: { argb: SUBTITLE } }
  note.alignment = { wrapText: true, vertical: 'middle' }
  sheet.getRow(3).height = 28

  // Row 4 blank
  sheet.getRow(4).height = 8

  // Row 5 — headers
  const headerRowIdx = 5
  const headerRow = sheet.getRow(headerRowIdx)
  AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col.label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' }
  })
  headerRow.height = 28

  // Data rows
  const healthColIdx = AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS.findIndex(c => c.key === 'cropHealthStatus') + 1
  for (let i = 0; i < model.objects.length; i++) {
    const obj = model.objects[i]!
    const r = sheet.getRow(headerRowIdx + 1 + i)
    const alt = i % 2 === 1
    AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS.forEach((col, cIdx) => {
      const cell = r.getCell(cIdx + 1)
      const raw = obj[col.key]
      cell.value = raw == null || raw === '' ? NOT_AVAILABLE : raw
      cell.font = { size: 9, color: { argb: INK } }
      cell.alignment = { vertical: 'middle', wrapText: true }

      if (isUnavailableCell(cell.value as string | number)) {
        cell.font = { size: 9, italic: true, color: { argb: NOTE_RED } }
      } else if (cIdx + 1 === healthColIdx) {
        const fill = cropHealthFill(cell.value as string | number)
        if (fill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
          cell.font = { size: 9, bold: true, color: { argb: INK } }
        }
      } else if (alt && cIdx + 1 !== healthColIdx) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
      }

      if (col.key === 'objectId' && !isUnavailableCell(cell.value as string | number)) {
        cell.font = {
          size: 9,
          bold: true,
          italic: false,
          color: { argb: INK },
        }
      }
    })
  }

  const lastDataRow = headerRowIdx + model.objects.length

  // Legend
  const legendStart = lastDataRow + 2
  sheet.getCell(legendStart, 1).value = 'Legend:'
  sheet.getCell(legendStart, 1).font = { bold: true, color: { argb: BRAND }, size: 10 }

  sheet.getCell(legendStart + 1, 2).value = 'Crop Health: Healthy'
  sheet.getCell(legendStart + 1, 2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEALTHY_FILL },
  }
  sheet.mergeCells(legendStart + 1, 2, legendStart + 1, 6)

  sheet.getCell(legendStart + 2, 2).value = 'Crop Health: Moderate / High Stress'
  sheet.getCell(legendStart + 2, 2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: STRESS_FILL },
  }
  sheet.mergeCells(legendStart + 2, 2, legendStart + 2, 6)

  sheet.getCell(legendStart + 3, 1).value = 'Equations'
  sheet.getCell(legendStart + 3, 1).font = { bold: true, size: 9, color: { argb: BRAND } }
  sheet.getCell(legendStart + 3, 2).value = '→ See sheet “Equations & Methods” (Layer index formulas)'
  sheet.mergeCells(legendStart + 3, 2, legendStart + 3, 6)

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }]
  sheet.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: colCount },
  }

  for (let i = 0; i < colCount; i++) {
    sheet.getColumn(i + 1).width = COLUMN_WIDTHS[i] ?? 14
  }

  addEquationsSheet(wb, model)

  return wb
}

export async function generateAgriculturalObjectIntelligenceExcel(
  model: AgriculturalObjectIntelligenceModel,
): Promise<void> {
  const wb = await buildAgriculturalObjectIntelligenceWorkbook(model)
  const filename = sanitizeAgriculturalObjectIntelFilename(model.meta.layerName)
  await downloadWorkbook(wb, filename)
}
