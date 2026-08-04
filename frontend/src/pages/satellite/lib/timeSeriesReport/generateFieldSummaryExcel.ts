import ExcelJS from 'exceljs'
import { DEFAULT_POTATO_MAX_YIELD_T_HA } from '../../../../lib/imageryYieldEstimation'
import type { MeteoNativeChartSpec } from '../weatherClimateReport/meteoNativeExcelCharts'
import { sanitizeTimeSeriesReportExcelFilename } from './generateTimeSeriesReportExcel'
import type {
  FieldSummaryModel,
  FieldSummaryPortfolioStats,
} from './buildFieldSummaryModel'
import {
  PRODUCTION_ESTIMATION_HEADERS,
  buildProductionEstimationRows,
  sumProductionEstimationTotals,
  NDVI_VEGETATION_THRESHOLD,
  NDVI_FULL_CANOPY,
} from './productionEstimationSheet'

const BRAND_DARK = 'FF064E3B'
const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFE2F5EE'
const ALT_ROW = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'

const ANALYSIS_SHEET = 'Analysis'

/** AgroCloud composite yield formulas (shown on Formulas sheet + header note). */
export const FIELD_SUMMARY_YIELD_FORMULAS = [
  'YieldFactor = 0.5×NDVI + 0.3×NDMI + 0.2×NDRE',
  'Estimated Yield (t/ha) = MaxYield × YieldFactor',
  'Estimated Total Production (tons) = Estimated Yield × Area (ha)',
  `Default MaxYield (Potato) = ${DEFAULT_POTATO_MAX_YIELD_T_HA} t/ha`,
  'Vegetation Health Score (VHS) = (NDVI + SAVI) / 2',
  'Moisture Score = 0.6×NDMI + 0.4×NDWI',
] as const

const TABLE_HEADERS = [
  'Field Name',
  'Plot ID',
  'Crop Type',
  'Area (ha)',
  'NDVI',
  'NDMI',
  'NDRE',
  'Yield Factor',
  'Max Yield (t/ha)',
  'Estimated Yield (t/ha)',
  'Estimated Total Production (tons)',
  'Vegetation Health Score',
  'Moisture Score',
  'Water Status',
  'Estimated Harvest Window',
  'Irrigation Status',
  'Overall Field Health',
  'Recommendation',
  'Scene Date',
] as const

export function sanitizeFieldSummaryExcelFilename(raw: string): string {
  const withoutExt = String(raw || '')
    .replace(/\.xlsx$/i, '')
    .replace(/\.pdf$/i, '')
    .trim()
  const xlsxName = sanitizeTimeSeriesReportExcelFilename(
    withoutExt || 'Field_Summaries_Table',
  )
  let stem = xlsxName.replace(/\.xlsx$/i, '')
  if (stem === 'Agricultural_Imagery_Timeseries_Report') stem = 'Field_Summaries_Table'
  return `${stem}.xlsx`
}

function fmtNum(n: number | null | undefined, digits = 2): number | string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n.toFixed(digits))
}

function numOrBlank(n: number | null | undefined, digits = 3): number | '' {
  if (n == null || !Number.isFinite(n)) return ''
  return Number(n.toFixed(digits))
}

function styleTitle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 13, color: { argb: BRAND_DARK } }
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  row.alignment = { vertical: 'middle', wrapText: true }
  row.height = 32
}

function styleDataRow(row: ExcelJS.Row, alt: boolean): void {
  row.font = { size: 9, color: { argb: INK } }
  if (alt) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
  }
  row.alignment = { vertical: 'middle', wrapText: true }
}

function rowValues(summary: FieldSummaryModel): Array<string | number> {
  return [
    summary.fieldName,
    summary.plotId,
    summary.cropType,
    fmtNum(summary.areaHa, summary.areaHa != null && summary.areaHa >= 100 ? 1 : 2),
    fmtNum(summary.ndvi, 3),
    fmtNum(summary.ndmi, 3),
    fmtNum(summary.ndre, 3),
    fmtNum(summary.yieldFactor, 3),
    fmtNum(summary.maxYieldTHa, 0),
    fmtNum(summary.yieldTHa, 1),
    fmtNum(summary.productionTons, 0),
    fmtNum(summary.vegetationHealthScore, 3),
    fmtNum(summary.moistureScore, 3),
    String(summary.waterStatus),
    summary.harvestWindow,
    String(summary.irrigationStatus),
    summary.overallFieldHealth,
    summary.recommendation || '—',
    summary.sceneDate || '—',
  ]
}

/** Map VHS → Excellent / Good / Moderate / Poor for health distribution chart. */
export function classifyVhsHealthBand(
  vhs: number | null | undefined,
): 'Excellent' | 'Good' | 'Moderate' | 'Poor' {
  if (vhs == null || !Number.isFinite(vhs)) return 'Poor'
  if (vhs >= 0.7) return 'Excellent'
  if (vhs >= 0.55) return 'Good'
  if (vhs >= 0.4) return 'Moderate'
  return 'Poor'
}

function mapWaterStatusLabel(status: FieldSummaryModel['waterStatus']): string {
  switch (status) {
    case 'Low':
      return 'Optimal'
    case 'Moderate':
      return 'Normal'
    case 'High':
      return 'Stress'
    case 'Critical':
      return 'Critical'
    default:
      return 'Unknown'
  }
}

function mapHarvestLabel(window: FieldSummaryModel['harvestWindow']): string {
  switch (window) {
    case 'Harvest detected':
    case 'Harvest completed':
      return 'Harvest Detected'
    case 'Approaching harvest':
      return 'Approaching Harvest'
    case 'Pre-peak':
      return 'Pre-Peak'
    default:
      return 'Insufficient Data'
  }
}

function countBy<T extends string>(items: T[], keys: readonly T[]): Array<[T, number]> {
  const map = new Map<T, number>(keys.map(k => [k, 0]))
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1)
  }
  return keys.map(k => [k, map.get(k) ?? 0])
}

function writeFormulasSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('Formulas')
  ws.getCell('A1').value = 'AgroCloud Field Summary — Mathematical Model'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:B1')

  ws.getCell('A3').value = 'Yield model (preferred over NDVI-only)'
  ws.getCell('A3').font = { bold: true, size: 10, color: { argb: BRAND_DARK } }

  const rows: Array<[string, string]> = [
    ['YieldFactor', '0.5×NDVI + 0.3×NDMI + 0.2×NDRE'],
    ['Estimated Yield (t/ha)', 'MaxYield × YieldFactor'],
    ['Estimated Total Production (tons)', 'Estimated Yield × Area (ha)'],
    ['MaxYield (default)', `${DEFAULT_POTATO_MAX_YIELD_T_HA} t/ha (Potato)`],
    ['Vegetation Health Score (VHS)', '(NDVI + SAVI) / 2'],
    ['Moisture Score', '0.6×NDMI + 0.4×NDWI'],
  ]
  ws.getRow(4).values = ['Metric', 'Formula']
  styleHeaderRow(ws.getRow(4))
  rows.forEach(([metric, formula], i) => {
    const row = ws.getRow(5 + i)
    row.values = [metric, formula]
    styleDataRow(row, i % 2 === 1)
  })

  ws.getCell('A12').value = 'Worked example (T-100 SC0175)'
  ws.getCell('A12').font = { bold: true, size: 10, color: { argb: BRAND_DARK } }

  const example: Array<[string, string]> = [
    ['Area', '39.26 ha'],
    ['NDVI / NDMI / NDRE', '0.82 / 0.45 / 0.60'],
    ['MaxYield', '55 t/ha'],
    ['YieldFactor', '(0.5×0.82)+(0.3×0.45)+(0.2×0.60) = 0.665'],
    ['Estimated Yield', '55 × 0.665 = 36.6 t/ha'],
    ['Estimated Total Production', '36.6 × 39.26 ≈ 1,436 tons'],
  ]
  example.forEach(([k, v], i) => {
    const row = ws.getRow(13 + i)
    row.values = [k, v]
    styleDataRow(row, i % 2 === 1)
  })

  ws.getCell('A20').value = 'Production Estimation Sheet'
  ws.getCell('A20').font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  const prodRows: Array<[string, string]> = [
    [
      'Planned Crop Coverage (ha)',
      `Area with NDVI ≥ ${NDVI_VEGETATION_THRESHOLD.toFixed(2)} (vegetated / planted)`,
    ],
    [
      'Unplanned Area (ha)',
      'Total Area from Layer − NDVI Vegetated Area',
    ],
    [
      'Vegetation Coverage (%)',
      `Soft estimate from AOI-mean NDVI (full canopy ≈ ${NDVI_FULL_CANOPY}); or zonal min/max span above threshold`,
    ],
    ['NDVI Stress · Healthy', 'NDVI > 0.60'],
    ['NDVI Stress · Moderate', '0.40 – 0.60'],
    ['NDVI Stress · Stressed', '0.20 – 0.40'],
    ['NDVI Stress · Non-Vegetated', `NDVI < ${NDVI_VEGETATION_THRESHOLD.toFixed(2)}`],
    ['NDVI Health Factor', 'Healthy 1.00 · Moderate 0.85 · Stressed 0.65 · Non-Vegetated 0'],
    [
      'Estimated Harvest Production (Ton)',
      'NDVI Vegetated Area (ha) × Expected Yield (Ton/ha) × NDVI Health Factor',
    ],
  ]
  ws.getRow(21).values = ['Metric', 'Formula']
  styleHeaderRow(ws.getRow(21))
  prodRows.forEach(([metric, formula], i) => {
    const row = ws.getRow(22 + i)
    row.values = [metric, formula]
    styleDataRow(row, i % 2 === 1)
  })

  ws.getColumn(1).width = 36
  ws.getColumn(2).width = 88
}

type DistBlock = { firstRow: number; lastRow: number; headerRow: number }

function writeDistBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  pairs: Array<[string, number]>,
): DistBlock {
  ws.getCell(startRow, 1).value = title
  ws.getCell(startRow, 1).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  const headerRow = startRow + 1
  ws.getRow(headerRow).values = ['Category', 'Count']
  styleHeaderRow(ws.getRow(headerRow))
  pairs.forEach(([label, count], i) => {
    const row = ws.getRow(headerRow + 1 + i)
    row.values = [label, count]
    styleDataRow(row, i % 2 === 1)
  })
  return {
    headerRow,
    firstRow: headerRow + 1,
    lastRow: headerRow + pairs.length,
  }
}

/**
 * Build Analysis sheet chart data + native chart specs for the executive dashboard.
 */
export function writeFieldSummaryAnalysisSheet(
  wb: ExcelJS.Workbook,
  summaries: FieldSummaryModel[],
): MeteoNativeChartSpec[] {
  const ws = wb.addWorksheet(ANALYSIS_SHEET, {
    views: [{ state: 'frozen', ySplit: 2, zoomScale: 80 }],
  })
  ws.getCell('A1').value = 'Field Analysis — Executive Dashboard'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells('A1:L1')
  ws.getCell('A2').value =
    'Charts: Production · VHS & Moisture · Water/Irrigation · Harvest · Field Ranking · Time-Series · Area vs Production'
  ws.getCell('A2').font = { size: 8, italic: true, color: { argb: MUTED } }
  ws.mergeCells('A2:L2')

  const sheet = ANALYSIS_SHEET
  const specs: MeteoNativeChartSpec[] = []

  // --- Distribution blocks (left columns) ---
  const healthKeys = ['Excellent', 'Good', 'Moderate', 'Poor'] as const
  const healthCounts = countBy(
    summaries.map(s => classifyVhsHealthBand(s.vegetationHealthScore)),
    healthKeys,
  )
  const health = writeDistBlock(ws, 4, 'Field Health Distribution (VHS bands)', [...healthCounts])

  const waterKeys = ['Optimal', 'Normal', 'Stress', 'Critical', 'Unknown'] as const
  const waterCounts = countBy(
    summaries.map(s => mapWaterStatusLabel(s.waterStatus) as (typeof waterKeys)[number]),
    waterKeys,
  )
  const water = writeDistBlock(ws, health.lastRow + 3, 'Water Status Distribution', [...waterCounts])

  const irrigKeys = [
    'Adequate',
    'Monitor',
    'Irrigation advised',
    'Urgent irrigation',
    '—',
  ] as const
  const irrigCounts = countBy(
    summaries.map(s => String(s.irrigationStatus) as (typeof irrigKeys)[number]),
    irrigKeys,
  )
  const irrig = writeDistBlock(ws, water.lastRow + 3, 'Irrigation Status', [...irrigCounts])

  const harvestKeys = [
    'Harvest Detected',
    'Approaching Harvest',
    'Pre-Peak',
    'Insufficient Data',
  ] as const
  const harvestCounts = countBy(
    summaries.map(s => mapHarvestLabel(s.harvestWindow) as (typeof harvestKeys)[number]),
    harvestKeys,
  )
  const harvest = writeDistBlock(ws, irrig.lastRow + 3, 'Harvest Window Distribution', [
    ...harvestCounts,
  ])

  // --- Per-field series (for production / VHS / yield / scatter) ---
  const fieldHeaderRow = 4
  const fieldStartCol = 4 // D
  ws.getCell(fieldHeaderRow - 1, fieldStartCol).value = 'Per-field metrics'
  ws.getCell(fieldHeaderRow - 1, fieldStartCol).font = {
    bold: true,
    size: 10,
    color: { argb: BRAND_DARK },
  }
  ;['Field Name', 'VHS', 'Moisture', 'Yield (t/ha)', 'Production (tons)', 'Area (ha)'].forEach(
    (h, i) => {
      const cell = ws.getCell(fieldHeaderRow, fieldStartCol + i)
      cell.value = h
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    },
  )
  const sortedByName = [...summaries].sort((a, b) => a.fieldName.localeCompare(b.fieldName))
  sortedByName.forEach((s, i) => {
    const r = fieldHeaderRow + 1 + i
    ws.getCell(r, fieldStartCol).value = s.fieldName
    ws.getCell(r, fieldStartCol + 1).value = numOrBlank(s.vegetationHealthScore, 3)
    ws.getCell(r, fieldStartCol + 2).value = numOrBlank(s.moistureScore, 3)
    ws.getCell(r, fieldStartCol + 3).value = numOrBlank(s.yieldTHa, 1)
    ws.getCell(r, fieldStartCol + 4).value = numOrBlank(s.productionTons, 0)
    ws.getCell(r, fieldStartCol + 5).value = numOrBlank(s.areaHa, 2)
  })
  const fieldFirst = fieldHeaderRow + 1
  const fieldLast = fieldHeaderRow + sortedByName.length
  const hasFields = sortedByName.length > 0

  // --- Top / Bottom rankings ---
  const byVhs = [...summaries]
    .filter(s => s.vegetationHealthScore != null)
    .sort((a, b) => (b.vegetationHealthScore ?? 0) - (a.vegetationHealthScore ?? 0))
  const topHealthy = byVhs.slice(0, 10)
  const topRisk = [...byVhs].reverse().slice(0, 10)

  const rankCol = 11 // K
  ws.getCell(3, rankCol).value = 'Top 10 Healthy (VHS)'
  ws.getCell(3, rankCol).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  ws.getCell(4, rankCol).value = 'Field'
  ws.getCell(4, rankCol + 1).value = 'VHS'
  ;[rankCol, rankCol + 1].forEach(c => {
    const cell = ws.getCell(4, c)
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
  topHealthy.forEach((s, i) => {
    ws.getCell(5 + i, rankCol).value = s.fieldName
    ws.getCell(5 + i, rankCol + 1).value = numOrBlank(s.vegetationHealthScore, 3)
  })
  const healthyFirst = 5
  const healthyLast = 4 + Math.max(1, topHealthy.length)

  ws.getCell(3, rankCol + 3).value = 'Top 10 Risk (lowest VHS)'
  ws.getCell(3, rankCol + 3).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  ws.getCell(4, rankCol + 3).value = 'Field'
  ws.getCell(4, rankCol + 4).value = 'VHS'
  ;[rankCol + 3, rankCol + 4].forEach(c => {
    const cell = ws.getCell(4, c)
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
  topRisk.forEach((s, i) => {
    ws.getCell(5 + i, rankCol + 3).value = s.fieldName
    ws.getCell(5 + i, rankCol + 4).value = numOrBlank(s.vegetationHealthScore, 3)
  })
  const riskFirst = 5
  const riskLast = 4 + Math.max(1, topRisk.length)

  // --- Time series by scene date (portfolio means) ---
  const byDate = new Map<
    string,
    { vhs: number[]; moist: number[]; ndvi: number[]; ndmi: number[] }
  >()
  for (const s of summaries) {
    const d = s.sceneDate
    if (!d) continue
    const bucket = byDate.get(d) ?? { vhs: [], moist: [], ndvi: [], ndmi: [] }
    if (s.vegetationHealthScore != null) bucket.vhs.push(s.vegetationHealthScore)
    if (s.moistureScore != null) bucket.moist.push(s.moistureScore)
    if (s.ndvi != null) bucket.ndvi.push(s.ndvi)
    if (s.ndmi != null) bucket.ndmi.push(s.ndmi)
    byDate.set(d, bucket)
  }
  const dates = [...byDate.keys()].sort()
  const tsCol = 17 // Q
  ws.getCell(3, tsCol).value = 'Time Series (portfolio mean by scene date)'
  ws.getCell(3, tsCol).font = { bold: true, size: 10, color: { argb: BRAND_DARK } }
  ;['Scene Date', 'VHS', 'Moisture', 'NDVI', 'NDMI'].forEach((h, i) => {
    const cell = ws.getCell(4, tsCol + i)
    cell.value = h
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
  dates.forEach((d, i) => {
    const b = byDate.get(d)!
    const mean = (arr: number[]) =>
      arr.length ? Number((arr.reduce((a, c) => a + c, 0) / arr.length).toFixed(3)) : ''
    const r = 5 + i
    ws.getCell(r, tsCol).value = d
    ws.getCell(r, tsCol + 1).value = mean(b.vhs)
    ws.getCell(r, tsCol + 2).value = mean(b.moist)
    ws.getCell(r, tsCol + 3).value = mean(b.ndvi)
    ws.getCell(r, tsCol + 4).value = mean(b.ndmi)
  })
  const tsFirst = 5
  const tsLast = 4 + Math.max(1, dates.length)

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 10
  ws.getColumn(4).width = 16
  ws.getColumn(5).width = 9
  ws.getColumn(6).width = 10
  ws.getColumn(7).width = 11
  ws.getColumn(8).width = 12
  ws.getColumn(9).width = 10

  const q = (col: string, r1: number, r2: number) => `'${sheet}'!$${col}$${r1}:$${col}$${r2}`
  const cell = (col: string, r: number) => `'${sheet}'!$${col}$${r}`

  // Executive dashboard charts (left column layout, 2-wide grid via anchorCol)
  if (health.lastRow >= health.firstRow) {
    specs.push({
      title: 'Field Health Distribution',
      kind: 'bar',
      barDir: 'col',
      varyColors: true,
      anchorRow: 2,
      anchorCol: 0,
      sectionLabel: 'Health',
      targetSheet: sheet,
      series: [
        {
          name: 'Fields',
          catsRef: q('A', health.firstRow, health.lastRow),
          valuesRef: q('B', health.firstRow, health.lastRow),
        },
      ],
    })
  }

  if (hasFields) {
    specs.push({
      title: 'VHS & Moisture Comparison',
      kind: 'bar',
      barDir: 'col',
      grouping: 'clustered',
      varyColors: false,
      legendPos: 'b',
      anchorRow: 2,
      anchorCol: 8,
      sectionLabel: 'VHS Moisture',
      targetSheet: sheet,
      series: [
        {
          name: 'VHS',
          nameRef: cell('E', fieldHeaderRow),
          catsRef: q('D', fieldFirst, fieldLast),
          valuesRef: q('E', fieldFirst, fieldLast),
        },
        {
          name: 'Moisture',
          nameRef: cell('F', fieldHeaderRow),
          catsRef: q('D', fieldFirst, fieldLast),
          valuesRef: q('F', fieldFirst, fieldLast),
        },
      ],
    })

    specs.push({
      title: 'Estimated Production by Field',
      kind: 'bar',
      barDir: 'col',
      varyColors: true,
      anchorRow: 18,
      anchorCol: 0,
      sectionLabel: 'Production',
      targetSheet: sheet,
      series: [
        {
          name: 'Production (tons)',
          nameRef: cell('H', fieldHeaderRow),
          catsRef: q('D', fieldFirst, fieldLast),
          valuesRef: q('H', fieldFirst, fieldLast),
        },
      ],
    })

    specs.push({
      title: 'Yield Performance (t/ha)',
      kind: 'bar',
      barDir: 'col',
      varyColors: true,
      anchorRow: 18,
      anchorCol: 8,
      sectionLabel: 'Yield',
      targetSheet: sheet,
      series: [
        {
          name: 'Yield (t/ha)',
          nameRef: cell('G', fieldHeaderRow),
          catsRef: q('D', fieldFirst, fieldLast),
          valuesRef: q('G', fieldFirst, fieldLast),
        },
      ],
    })

    specs.push({
      title: 'Area vs Production',
      kind: 'scatter',
      varyColors: false,
      legendPos: 'b',
      anchorRow: 34,
      anchorCol: 8,
      sectionLabel: 'Scatter',
      targetSheet: sheet,
      series: [
        {
          name: 'Fields',
          catsRef: q('D', fieldFirst, fieldLast),
          xValuesRef: q('I', fieldFirst, fieldLast),
          valuesRef: q('H', fieldFirst, fieldLast),
        },
      ],
    })
  }

  if (water.lastRow >= water.firstRow) {
    specs.push({
      title: 'Water Status Distribution',
      kind: 'doughnut',
      holeSize: 50,
      varyColors: true,
      legendPos: 'r',
      anchorRow: 34,
      anchorCol: 0,
      sectionLabel: 'Water',
      targetSheet: sheet,
      series: [
        {
          name: 'Fields',
          catsRef: q('A', water.firstRow, water.lastRow),
          valuesRef: q('B', water.firstRow, water.lastRow),
        },
      ],
    })
  }

  if (irrig.lastRow >= irrig.firstRow) {
    specs.push({
      title: 'Irrigation Status',
      kind: 'bar',
      barDir: 'col',
      varyColors: true,
      anchorRow: 50,
      anchorCol: 0,
      sectionLabel: 'Irrigation',
      targetSheet: sheet,
      series: [
        {
          name: 'Fields',
          catsRef: q('A', irrig.firstRow, irrig.lastRow),
          valuesRef: q('B', irrig.firstRow, irrig.lastRow),
        },
      ],
    })
  }

  if (harvest.lastRow >= harvest.firstRow) {
    specs.push({
      title: 'Harvest Window Distribution',
      kind: 'doughnut',
      holeSize: 55,
      varyColors: true,
      legendPos: 'r',
      anchorRow: 50,
      anchorCol: 8,
      sectionLabel: 'Harvest',
      targetSheet: sheet,
      series: [
        {
          name: 'Fields',
          catsRef: q('A', harvest.firstRow, harvest.lastRow),
          valuesRef: q('B', harvest.firstRow, harvest.lastRow),
        },
      ],
    })
  }

  if (topHealthy.length) {
    specs.push({
      title: 'Top 10 Healthy Fields',
      kind: 'bar',
      barDir: 'bar',
      varyColors: true,
      anchorRow: 66,
      anchorCol: 0,
      sectionLabel: 'Ranking Healthy',
      targetSheet: sheet,
      series: [
        {
          name: 'VHS',
          catsRef: q('K', healthyFirst, healthyLast),
          valuesRef: q('L', healthyFirst, healthyLast),
        },
      ],
    })
  }

  if (topRisk.length) {
    specs.push({
      title: 'Top 10 Risk Fields',
      kind: 'bar',
      barDir: 'bar',
      varyColors: true,
      anchorRow: 66,
      anchorCol: 8,
      sectionLabel: 'Ranking Risk',
      targetSheet: sheet,
      series: [
        {
          name: 'VHS',
          catsRef: q('N', riskFirst, riskLast),
          valuesRef: q('O', riskFirst, riskLast),
        },
      ],
    })
  }

  if (dates.length) {
    specs.push({
      title: 'Time Series Trend (Portfolio Mean)',
      kind: 'line',
      smooth: true,
      varyColors: false,
      legendPos: 'b',
      anchorRow: 82,
      anchorCol: 0,
      sectionLabel: 'Time Series',
      targetSheet: sheet,
      series: [
        {
          name: 'VHS',
          nameRef: cell('R', 4),
          catsRef: q('Q', tsFirst, tsLast),
          valuesRef: q('R', tsFirst, tsLast),
        },
        {
          name: 'Moisture',
          nameRef: cell('S', 4),
          catsRef: q('Q', tsFirst, tsLast),
          valuesRef: q('S', tsFirst, tsLast),
        },
        {
          name: 'NDVI',
          nameRef: cell('T', 4),
          catsRef: q('Q', tsFirst, tsLast),
          valuesRef: q('T', tsFirst, tsLast),
        },
        {
          name: 'NDMI',
          nameRef: cell('U', 4),
          catsRef: q('Q', tsFirst, tsLast),
          valuesRef: q('U', tsFirst, tsLast),
        },
      ],
    })
  }

  return specs
}

function fmtPct(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Number(n.toFixed(1))}%`
}

function writeProductionEstimationSheet(
  wb: ExcelJS.Workbook,
  input: {
    summaries: FieldSummaryModel[]
    fromDate: string
    toDate: string
    projectName?: string
  },
): void {
  const ws = wb.addWorksheet('Production Estimation', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })
  const colCount = PRODUCTION_ESTIMATION_HEADERS.length
  const rows = buildProductionEstimationRows(input.summaries)
  const totals = sumProductionEstimationTotals(rows)

  ws.getCell('A1').value = 'Production Estimation Sheet'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells(1, 1, 1, colCount)

  ws.getCell('A2').value =
    `${input.projectName || 'AgroCloud Satellite Intelligence'} · Period ${input.fromDate} to ${input.toDate} · ${rows.length} field(s)`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, colCount)

  ws.getCell('A3').value =
    `NDVI vegetation threshold ≥ ${NDVI_VEGETATION_THRESHOLD.toFixed(2)} · ` +
    'Estimated Harvest Production = Vegetated Area × Expected Yield × NDVI Health Factor (see Calculation Method below)'
  ws.getCell('A3').font = { size: 8, italic: true, color: { argb: MUTED } }
  ws.mergeCells(3, 1, 3, colCount)

  const header = ws.getRow(5)
  header.values = [...PRODUCTION_ESTIMATION_HEADERS]
  styleHeaderRow(header)

  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i)
    row.values = [
      r.fieldId,
      r.farmName,
      r.cropClassification,
      fmtNum(r.totalAreaHa, r.totalAreaHa != null && r.totalAreaHa >= 100 ? 1 : 2),
      fmtNum(r.plannedCropCoverageHa, 2),
      fmtNum(r.unplannedAreaHa, 2),
      fmtPct(r.vegetationCoveragePct),
      fmtNum(r.averageNdvi, 3),
      r.stressLevel,
      fmtNum(r.expectedYieldTHa, 1),
      fmtNum(r.estimatedHarvestProductionTons, 1),
    ]
    styleDataRow(row, i % 2 === 1)
    row.height = 26
  })

  const totalRowIdx = 6 + rows.length
  const totalRow = ws.getRow(totalRowIdx)
  totalRow.values = [
    'TOTAL',
    '',
    '',
    fmtNum(totals.totalAreaHa, 2),
    fmtNum(totals.plannedCropCoverageHa, 2),
    fmtNum(totals.unplannedAreaHa, 2),
    '',
    '',
    '',
    '',
    fmtNum(totals.estimatedHarvestProductionTons, 1),
  ]
  totalRow.font = { bold: true, size: 9, color: { argb: BRAND_DARK } }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } }
  totalRow.alignment = { vertical: 'middle', wrapText: true }

  const widths = [12, 18, 14, 14, 18, 16, 14, 12, 18, 14, 16]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  let methodRow = totalRowIdx + 2
  ws.getCell(methodRow, 1).value = 'Calculation Method'
  ws.getCell(methodRow, 1).font = { bold: true, size: 11, color: { argb: BRAND_DARK } }
  ws.mergeCells(methodRow, 1, methodRow, 4)

  const methodBlocks: Array<[string, string]> = [
    [
      '1. Total Area from Layer (ha)',
      'Area of field polygon from GIS layer.',
    ],
    [
      '2. Planned Crop Coverage (ha)',
      `Area classified as vegetation based on NDVI analysis. NDVI ≥ ${NDVI_VEGETATION_THRESHOLD.toFixed(2)} → Vegetated / Planted Area.`,
    ],
    [
      '3. Unplanned Area (ha)',
      'Unplanned Area = Total Area from Layer − NDVI Vegetated Area (or area of NDVI non-vegetated pixels within the field boundary).',
    ],
    [
      '4. NDVI Stress Classification',
      'Healthy Crop: NDVI > 0.60 · Moderate Crop: 0.40–0.60 · Stressed Crop: 0.20–0.40 · Non-Vegetated / Unplanned: NDVI < 0.20',
    ],
    [
      '5. Harvest Production Estimation',
      'Estimated Harvest Production (Ton) = NDVI Vegetated Area (ha) × Expected Yield (Ton/ha) × NDVI Health Factor',
    ],
    [
      '6. NDVI Health Factor',
      'Healthy 1.00 · Moderate 0.85 · Stressed 0.65 · Non-Vegetated 0.00',
    ],
  ]
  methodBlocks.forEach(([title, body], i) => {
    const r = methodRow + 1 + i * 2
    ws.getCell(r, 1).value = title
    ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: INK } }
    ws.mergeCells(r, 1, r, colCount)
    ws.getCell(r + 1, 1).value = body
    ws.getCell(r + 1, 1).font = { size: 8, color: { argb: MUTED } }
    ws.mergeCells(r + 1, 1, r + 1, colCount)
  })
}

export function buildFieldSummaryWorkbook(input: {
  summaries: FieldSummaryModel[]
  portfolio?: FieldSummaryPortfolioStats | null
  fromDate: string
  toDate: string
  projectName?: string
}): { wb: ExcelJS.Workbook; chartSpecs: MeteoNativeChartSpec[] } {
  const wb = new ExcelJS.Workbook()
  wb.creator = input.projectName || 'AgroCloud'
  wb.created = new Date()
  wb.title = 'Field Summaries'

  const ws = wb.addWorksheet('Field Summaries', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  ws.getCell('A1').value = 'Batch Field Summaries'
  styleTitle(ws.getCell('A1'))
  ws.mergeCells(1, 1, 1, TABLE_HEADERS.length)

  const period = `${input.fromDate} to ${input.toDate}`
  ws.getCell('A2').value =
    `${input.projectName || 'AgroCloud Satellite Intelligence'} · Period ${period} · ${input.summaries.length} field(s)`
  ws.getCell('A2').font = { size: 9, color: { argb: MUTED } }
  ws.mergeCells(2, 1, 2, TABLE_HEADERS.length)

  ws.getCell('A3').value =
    `Yield model: ${FIELD_SUMMARY_YIELD_FORMULAS[0]} → ${FIELD_SUMMARY_YIELD_FORMULAS[1]} → ${FIELD_SUMMARY_YIELD_FORMULAS[2]} (see Formulas sheet)`
  ws.getCell('A3').font = { size: 8, italic: true, color: { argb: MUTED } }
  ws.mergeCells(3, 1, 3, TABLE_HEADERS.length)

  if (input.portfolio) {
    const p = input.portfolio
    ws.getCell('A4').value =
      `Portfolio: ${p.fieldCount} fields · ${fmtNum(p.totalAreaHa, 2)} ha · ` +
      `${fmtNum(p.totalProductionTons, 0)} t · avg yield ${fmtNum(p.avgYieldTHa, 1)} t/ha · ` +
      `Healthy ${p.healthyCount} / Moderate ${p.moderateCount} / Stressed ${p.stressedCount} · ` +
      `Status ${p.overallPortfolioStatus}`
    ws.getCell('A4').font = { size: 8, italic: true, color: { argb: MUTED } }
    ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } }
    ws.mergeCells(4, 1, 4, TABLE_HEADERS.length)
  }

  const header = ws.getRow(5)
  header.values = [...TABLE_HEADERS]
  styleHeaderRow(header)

  input.summaries.forEach((summary, i) => {
    const row = ws.getRow(6 + i)
    row.values = rowValues(summary)
    styleDataRow(row, i % 2 === 1)
    row.height = 28
  })

  const widths = [
    18, 10, 12, 10, 8, 8, 8, 11, 12, 14, 16, 12, 11, 12, 16, 14, 12, 36, 12,
  ]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  writeFormulasSheet(wb)
  writeProductionEstimationSheet(wb, {
    summaries: input.summaries,
    fromDate: input.fromDate,
    toDate: input.toDate,
    projectName: input.projectName,
  })
  const chartSpecs = writeFieldSummaryAnalysisSheet(wb, input.summaries)
  return { wb, chartSpecs }
}

export async function generateFieldSummaryExcel(input: {
  summaries: FieldSummaryModel[]
  portfolio?: FieldSummaryPortfolioStats | null
  fromDate: string
  toDate: string
  projectName?: string
  filename?: string
}): Promise<void> {
  const { wb, chartSpecs } = buildFieldSummaryWorkbook(input)
  const raw = await wb.xlsx.writeBuffer()
  const { injectNativeMeteoCharts } = await import('../weatherClimateReport/meteoNativeExcelCharts')
  const withCharts =
    chartSpecs.length > 0
      ? await injectNativeMeteoCharts(raw as ArrayBuffer, chartSpecs, ANALYSIS_SHEET)
      : raw
  const blob = new Blob([withCharts], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFieldSummaryExcelFilename(
    input.filename || 'Field_Summaries_Table.xlsx',
  )
  a.click()
  URL.revokeObjectURL(url)
}
