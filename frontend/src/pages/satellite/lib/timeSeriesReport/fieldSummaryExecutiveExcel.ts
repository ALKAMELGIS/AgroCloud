import type ExcelJS from 'exceljs'
import { DEFAULT_POTATO_MAX_YIELD_T_HA } from '../../../../lib/imageryYieldEstimation'
import type { MeteoNativeChartSpec } from '../weatherClimateReport/meteoNativeExcelCharts'
import type { FieldSummaryModel } from './buildFieldSummaryModel'
import {
  FR,
  FR_CHART,
  FR_NUM,
  applyFindingBullet,
  applyKvLabel,
  applyKvMetricBlock,
  applyKvPlainValue,
  applyKvProductionValue,
  applyNoteRow,
  applySectionBanner,
  applySheetSubtitle,
  applySheetTitleBanner,
  applyTableHeader,
  applyTableNumber,
  applyTableText,
  mergeKvValueRow,
  setAreaCoverageColumnWidths,
  setExecutiveSummaryColumnWidths,
  AREA_SHEET_COL,
} from './fieldReportExcelTheme'
import {
  NDVI_VEGETATION_THRESHOLD,
  type ProductionEstimationRow,
  type WaterLossPortfolioTotals,
  buildProductionEstimationRows,
  sumProductionEstimationTotals,
  sumWaterLossTotals,
} from './productionEstimationSheet'

export const EXECUTIVE_SUMMARY_SHEET = 'Executive Summary'
export const AREA_COVERAGE_SHEET = 'Area & Coverage Analysis'

const MERGE_COL = 7
const KV_VALUE_END = 4

export type ExecutiveStressBand =
  | 'Healthy Crop'
  | 'Moderate Crop'
  | 'Stressed Crop'
  | 'Harvested / Post-Harvest'
  | 'Non-Vegetated / Unplanned'

export type ExecutiveStressRow = {
  status: ExecutiveStressBand
  fieldCount: number
  areaHa: number
  shareOfAoi: number
}

export type ExecutiveReportData = {
  aoiLabel: string
  fieldCount: number
  primaryCrop: string
  maxYieldBasis: number
  totals: ReturnType<typeof sumProductionEstimationTotals>
  plannedCoveragePct: number | null
  unplannedAreaPct: number | null
  avgExpectedYieldTHa: number | null
  harvestedAreaHa: number
  activeCropAreaHa: number
  stressRows: ExecutiveStressRow[]
  productionByStress: Record<ExecutiveStressBand, number>
  topProducingField: { name: string; tons: number } | null
  harvestedFieldNames: string[]
  findings: string[]
  productionRows: ProductionEstimationRow[]
  waterLossTotals: WaterLossPortfolioTotals
}

function fmtNum(n: number | null | undefined, digits = 2): number | string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n.toFixed(digits))
}

function writeKvOverviewRow(
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
  if (numFmt) valueCell.numFmt = numFmt
  mergeKvValueRow(ws, row, 2, KV_VALUE_END)
}

function writeKvMetricRow(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string | number,
  numFmt?: string,
): void {
  applyKvLabel(ws.getCell(row, 1), label)
  applyKvMetricBlock(ws, row, 2, KV_VALUE_END, value, numFmt)
}

function writeKvProductionRow(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string | number,
  numFmt?: string,
): void {
  applyKvLabel(ws.getCell(row, 1), label)
  applyKvProductionValue(ws, row, 2, KV_VALUE_END, value, numFmt)
}

function subtitle(
  projectName: string | undefined,
  fromDate: string,
  toDate: string,
  fieldCount: number,
): string {
  return `${projectName || 'AgroCloud Satellite Intelligence'} · Period ${fromDate} to ${toDate} · ${fieldCount} field(s)`
}

export function resolveExecutiveStressBand(
  row: ProductionEstimationRow,
  summary: FieldSummaryModel,
): ExecutiveStressBand {
  if (row.stressLevel === 'Non-Vegetated / Unplanned') {
    if (
      summary.harvestWindow === 'Harvest detected' ||
      summary.harvestWindow === 'Harvest completed'
    ) {
      return 'Harvested / Post-Harvest'
    }
  }
  if (row.stressLevel === 'Healthy Crop') return 'Healthy Crop'
  if (row.stressLevel === 'Moderate Crop') return 'Moderate Crop'
  if (row.stressLevel === 'Stressed Crop') return 'Stressed Crop'
  if (row.stressLevel === 'Non-Vegetated / Unplanned') return 'Non-Vegetated / Unplanned'
  return 'Stressed Crop'
}

function primaryCropLabel(summaries: FieldSummaryModel[]): string {
  const counts = new Map<string, number>()
  for (const s of summaries) {
    const crop = String(s.cropType || '').trim()
    if (!crop || crop === '—') continue
    counts.set(crop, (counts.get(crop) ?? 0) + 1)
  }
  let best = 'Potato'
  let bestN = 0
  for (const [crop, n] of counts) {
    if (n > bestN) {
      best = crop
      bestN = n
    }
  }
  return best
}

function buildFindings(data: ExecutiveReportData): string[] {
  const bullets: string[] = []
  const total = data.totals.totalAreaHa
  const planned = data.totals.plannedCropCoverageHa
  const unplanned = data.totals.unplannedAreaHa
  if (total != null && planned != null && unplanned != null && total > 0) {
    const plannedPct = ((planned / total) * 100).toFixed(1)
    const unplannedPct = ((unplanned / total) * 100).toFixed(1)
    bullets.push(
      `•  ${plannedPct}% of the ${fmtNum(total, 2)} ha AOI (${fmtNum(planned, 2)} ha) carries planted/vegetated cover; ${fmtNum(unplanned, 2)} ha (${unplannedPct}%) shows no vegetation signal at the pixel level (NDVI < ${NDVI_VEGETATION_THRESHOLD.toFixed(2)}).`,
    )
  }

  const healthy = data.stressRows.find(r => r.status === 'Healthy Crop')
  if (healthy && data.fieldCount > 0) {
    const prodShare =
      data.totals.estimatedHarvestProductionTons && data.totals.estimatedHarvestProductionTons > 0
        ? (
            ((data.productionByStress['Healthy Crop'] ?? 0) /
              data.totals.estimatedHarvestProductionTons) *
            100
          ).toFixed(0)
        : null
    bullets.push(
      `•  ${healthy.fieldCount} of ${data.fieldCount} fields (${Math.round((healthy.fieldCount / data.fieldCount) * 100)}%) are Healthy (NDVI > 0.60)${prodShare ? ` and generate ${prodShare}% of estimated production` : ''}.`,
    )
  }

  if (data.harvestedFieldNames.length) {
    bullets.push(
      `•  Approximately ${fmtNum(data.harvestedAreaHa, 2)} ha (${data.harvestedFieldNames.slice(0, 4).join(', ')}${data.harvestedFieldNames.length > 4 ? ', …' : ''}) are classified as harvested / post-harvest. Evaluate production from harvest records rather than current NDVI alone.`,
    )
  }

  const stressed = data.stressRows.find(r => r.status === 'Stressed Crop')
  if (stressed && stressed.fieldCount > 0) {
    bullets.push(
      `•  ${stressed.fieldCount} Stressed field(s) (${fmtNum(stressed.areaHa, 2)} ha) — review irrigation, sowing gaps, or land-use change before the next scene date.`,
    )
  }

  if (data.totals.estimatedHarvestProductionTons != null && planned != null && planned > 0) {
    const yieldOnPlanted = data.totals.estimatedHarvestProductionTons / planned
    bullets.push(
      `•  Estimated total harvest is ${fmtNum(data.totals.estimatedHarvestProductionTons, 1)} t across ${fmtNum(planned, 2)} ha planted (~${fmtNum(yieldOnPlanted, 1)} t/ha on planted area) — reconcile against agronomic records ahead of final reporting.`,
    )
  }

  if (data.topProducingField) {
    bullets.push(
      `•  Top producing field: ${data.topProducingField.name} (${fmtNum(data.topProducingField.tons, 1)} t).`,
    )
  }

  return bullets
}

export function aggregateExecutiveReportData(input: {
  summaries: FieldSummaryModel[]
  fromDate: string
  toDate: string
  aoiName?: string
  et0ByFieldKey?: Map<string, number>
  aetByFieldKey?: Map<string, number>
  fieldKeys?: string[]
}): ExecutiveReportData {
  const productionRows = buildProductionEstimationRows(input.summaries, {
    et0ByFieldKey: input.et0ByFieldKey,
    aetByFieldKey: input.aetByFieldKey,
    fieldKeys: input.fieldKeys,
  })
  const totals = sumProductionEstimationTotals(productionRows)
  const waterLossTotals = sumWaterLossTotals(productionRows)
  const summaryByKey = new Map(
    input.summaries.map(s => [s.plotId || s.fieldName, s]),
  )

  const bandOrder: ExecutiveStressBand[] = [
    'Healthy Crop',
    'Moderate Crop',
    'Stressed Crop',
    'Harvested / Post-Harvest',
    'Non-Vegetated / Unplanned',
  ]
  const bandMap = new Map<
    ExecutiveStressBand,
    { fieldCount: number; areaHa: number; productionTons: number; names: string[] }
  >(bandOrder.map(b => [b, { fieldCount: 0, areaHa: 0, productionTons: 0, names: [] }]))

  for (const row of productionRows) {
    const summary =
      summaryByKey.get(row.fieldId) ??
      input.summaries.find(s => s.fieldName === row.farmName) ??
      input.summaries[0]!
    const band = resolveExecutiveStressBand(row, summary)
    const bucket = bandMap.get(band)!
    bucket.fieldCount += 1
    bucket.areaHa += row.totalAreaHa ?? 0
    bucket.productionTons += row.estimatedHarvestProductionTons ?? 0
    bucket.names.push(row.fieldId || row.farmName)
  }

  const totalArea = totals.totalAreaHa ?? 0
  const stressRows: ExecutiveStressRow[] = bandOrder
    .map(status => {
      const b = bandMap.get(status)!
      if (!b.fieldCount) return null
      return {
        status,
        fieldCount: b.fieldCount,
        areaHa: Number(b.areaHa.toFixed(3)),
        shareOfAoi: totalArea > 0 ? Number((b.areaHa / totalArea).toFixed(6)) : 0,
      }
    })
    .filter((r): r is ExecutiveStressRow => r != null)

  const productionByStress = Object.fromEntries(
    bandOrder.map(b => [b, Number((bandMap.get(b)?.productionTons ?? 0).toFixed(2))]),
  ) as Record<ExecutiveStressBand, number>

  const harvested = bandMap.get('Harvested / Post-Harvest')!
  const harvestedAreaHa = Number(harvested.areaHa.toFixed(3))
  const planned = totals.plannedCropCoverageHa ?? 0
  const activeCropAreaHa = Number(Math.max(0, planned - harvestedAreaHa).toFixed(3))

  let topProducingField: { name: string; tons: number } | null = null
  for (const row of productionRows) {
    const tons = row.estimatedHarvestProductionTons
    if (tons == null || !Number.isFinite(tons)) continue
    if (!topProducingField || tons > topProducingField.tons) {
      topProducingField = { name: row.fieldId || row.farmName, tons }
    }
  }

  const avgExpectedYieldTHa =
    planned > 0 && totals.estimatedHarvestProductionTons != null
      ? Number((totals.estimatedHarvestProductionTons / planned).toFixed(3))
      : null

  const plannedCoveragePct =
    totalArea > 0 && totals.plannedCropCoverageHa != null
      ? Number((totals.plannedCropCoverageHa / totalArea).toFixed(6))
      : null
  const unplannedAreaPct =
    totalArea > 0 && totals.unplannedAreaHa != null
      ? Number((totals.unplannedAreaHa / totalArea).toFixed(6))
      : null

  const crop = primaryCropLabel(input.summaries)
  const maxYield =
    input.summaries.find(s => s.maxYieldTHa != null)?.maxYieldTHa ?? DEFAULT_POTATO_MAX_YIELD_T_HA

  const data: ExecutiveReportData = {
    aoiLabel: input.aoiName?.trim() || 'Batch Field Summaries',
    fieldCount: input.summaries.length,
    primaryCrop: crop,
    maxYieldBasis: maxYield,
    totals,
    plannedCoveragePct,
    unplannedAreaPct,
    avgExpectedYieldTHa,
    harvestedAreaHa,
    activeCropAreaHa,
    stressRows,
    productionByStress,
    topProducingField,
    harvestedFieldNames: harvested.names,
    findings: [],
    productionRows,
    waterLossTotals,
  }
  data.findings = buildFindings(data)
  return data
}

export function defaultFieldReportFilename(aoiName: string | undefined, toDate: string): string {
  const safeAoi = String(aoiName || 'Field_Report')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64)
  const date = toDate.trim().slice(0, 10) || new Date().toISOString().slice(0, 10)
  return `${safeAoi}_Field_Report__${date}.xlsx`
}

export function writeExecutiveSummarySheet(
  wb: ExcelJS.Workbook,
  input: {
    data: ExecutiveReportData
    fromDate: string
    toDate: string
    projectName?: string
  },
): void {
  const ws = wb.addWorksheet(EXECUTIVE_SUMMARY_SHEET, {
    views: [{ showGridLines: true }],
  })
  const d = input.data
  const period = `${input.fromDate} to ${input.toDate}`

  applySheetTitleBanner(ws, 1, `${d.aoiLabel} Field Summaries — Executive Summary`, MERGE_COL)
  applySheetSubtitle(
    ws,
    2,
    subtitle(input.projectName, input.fromDate, input.toDate, d.fieldCount),
    MERGE_COL,
  )

  applySectionBanner(ws, 4, 'AOI Overview', MERGE_COL)
  writeKvOverviewRow(ws, 5, 'Area of Interest (AOI)', `${d.aoiLabel} — Batch Field Summaries`)
  writeKvOverviewRow(ws, 6, 'Reporting Period', period)
  writeKvOverviewRow(ws, 7, 'Number of Fields', d.fieldCount)
  writeKvOverviewRow(
    ws,
    8,
    'Primary Crop / MaxYield Basis',
    `${d.primaryCrop} (MaxYield ${d.maxYieldBasis} t/ha default)`,
  )

  applySectionBanner(ws, 10, 'Key Metrics', MERGE_COL)
  writeKvMetricRow(ws, 11, 'Total Area (ha)', fmtNum(d.totals.totalAreaHa, 1), FR_NUM.ONE_DEC)
  writeKvMetricRow(
    ws,
    12,
    'Planned Crop Coverage (ha)',
    fmtNum(d.totals.plannedCropCoverageHa, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    13,
    `Unplanned Area (ha) — NDVI < ${NDVI_VEGETATION_THRESHOLD.toFixed(2)}`,
    fmtNum(d.totals.unplannedAreaHa, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    14,
    'Planned Coverage (%)',
    d.plannedCoveragePct ?? '—',
    typeof d.plannedCoveragePct === 'number' ? FR_NUM.PCT : undefined,
  )
  writeKvMetricRow(
    ws,
    15,
    'Unplanned Area (%)',
    d.unplannedAreaPct ?? '—',
    typeof d.unplannedAreaPct === 'number' ? FR_NUM.PCT : undefined,
  )
  writeKvMetricRow(
    ws,
    16,
    'Total Estimated Production (t)',
    fmtNum(d.totals.estimatedHarvestProductionTons, 1),
    FR_NUM.TONS,
  )
  writeKvMetricRow(
    ws,
    17,
    'Average Expected Yield (t/ha)',
    fmtNum(d.avgExpectedYieldTHa, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    18,
    'Harvested / Post-Harvest Area (ha)',
    fmtNum(d.harvestedAreaHa, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    19,
    'Active Crop Area, excl. Harvested (ha)',
    fmtNum(d.activeCropAreaHa, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    20,
    'Total Water Loss Index %',
    fmtNum(d.waterLossTotals.totalWaterLossIndexPct, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    21,
    'Total Loss (m3/day)',
    fmtNum(d.waterLossTotals.totalWaterLossM3Day, 1),
    FR_NUM.ONE_DEC,
  )
  writeKvMetricRow(
    ws,
    22,
    'Total Loss (m3/ha/day)',
    fmtNum(d.waterLossTotals.totalWaterLossM3HaDay, 2),
    FR_NUM.ONE_DEC,
  )

  applySectionBanner(ws, 24, 'Crop Health Status  (NDVI Stress Classification)', MERGE_COL)
  applyTableHeader(ws.getCell(25, 1), 'Status')
  applyTableHeader(ws.getCell(25, 2), 'Field Count')
  applyTableHeader(ws.getCell(25, 4), 'Area (ha)')
  applyTableHeader(ws.getCell(25, 5), 'Share of AOI')

  d.stressRows.forEach((row, i) => {
    const r = 26 + i
    const label =
      row.status === 'Harvested / Post-Harvest' ? `${row.status}*` : row.status
    applyTableText(ws.getCell(r, 1), label)
    applyTableNumber(ws.getCell(r, 2), row.fieldCount, '0')
    applyTableNumber(ws.getCell(r, 4), fmtNum(row.areaHa, 1), FR_NUM.ONE_DEC)
    applyTableNumber(ws.getCell(r, 5), row.shareOfAoi, FR_NUM.PCT)
  })

  let nextRow = 26 + d.stressRows.length
  if (d.harvestedFieldNames.length) {
    applyNoteRow(
      ws,
      nextRow,
      '*  Note: Fields flagged "Non-Vegetated / Unplanned" by the NDVI model and reclassified as Harvested / Post-Harvest when harvest signals are present. Zero-vegetation may indicate post-harvest bare soil rather than crop failure.',
      MERGE_COL,
    )
    nextRow += 1
  }

  applyKvLabel(ws.getCell(nextRow, 1), 'Portfolio Status')
  const portfolioCell = ws.getCell(nextRow, 2)
  portfolioCell.value =
    d.stressRows.find(s => s.status === 'Healthy Crop')
      ? 'Healthy — majority of active crop area sits in the Healthy NDVI band'
      : 'Review stress distribution and field-level recommendations'
  portfolioCell.font = { name: 'Arial', bold: true, size: 10 }
  mergeKvValueRow(ws, nextRow, 2, 5)

  applySectionBanner(ws, nextRow + 2, 'Production Estimation', MERGE_COL)
  const prodStart = nextRow + 3
  const prodLines: Array<[string, string | number, string | undefined]> = [
    [
      'Total Estimated Harvest Production (t)',
      fmtNum(d.totals.estimatedHarvestProductionTons, 1),
      FR_NUM.TONS,
    ],
    ['Production from Healthy fields (t)', fmtNum(d.productionByStress['Healthy Crop'], 1), FR_NUM.TONS],
    ['Production from Moderate fields (t)', fmtNum(d.productionByStress['Moderate Crop'], 1), FR_NUM.TONS],
    ['Production from Stressed fields (t)', fmtNum(d.productionByStress['Stressed Crop'], 1), FR_NUM.TONS],
  ]
  if (d.topProducingField) {
    prodLines.push(['Top producing field', d.topProducingField.name, undefined])
    prodLines.push(['Top field production (t)', fmtNum(d.topProducingField.tons, 1), FR_NUM.TONS])
  }
  prodLines.forEach(([label, value, numFmt], i) => {
    writeKvProductionRow(ws, prodStart + i, label, value, numFmt)
  })

  const findingsStart = prodStart + prodLines.length + 2
  applySectionBanner(ws, findingsStart, 'Key Findings & Recommendations', MERGE_COL)
  d.findings.forEach((text, i) => {
    applyFindingBullet(ws, findingsStart + 1 + i, text, MERGE_COL)
  })

  setExecutiveSummaryColumnWidths(ws)
}

export function writeAreaCoverageAnalysisSheet(
  wb: ExcelJS.Workbook,
  input: {
    data: ExecutiveReportData
    fromDate: string
    toDate: string
    projectName?: string
  },
): {
  sheet: string
  stressFirstRow: number
  stressLastRow: number
  fieldFirstRow: number
  fieldLastRow: number
  headerRow: number
} {
  const ws = wb.addWorksheet(AREA_COVERAGE_SHEET, {
    views: [{ showGridLines: true }],
  })
  const d = input.data
  const {
    FIELD_ID,
    FIELD_NAME,
    CROP,
    IRRIGATION,
    PLANNED,
    UNPLANNED,
    TOTAL,
    WATER_LOSS_INDEX,
    STRESS_CATEGORY,
    STRESS_AREA,
    MERGE_END,
  } = AREA_SHEET_COL

  applySheetTitleBanner(ws, 1, 'Area & Coverage Analysis', MERGE_END)
  applySheetSubtitle(
    ws,
    2,
    subtitle(input.projectName, input.fromDate, input.toDate, d.fieldCount),
    MERGE_END,
  )

  applySectionBanner(ws, 4, 'AOI Coverage Summary', MERGE_END)
  writeKvOverviewRow(ws, 5, 'Total AOI Area (ha)', fmtNum(d.totals.totalAreaHa, 1))
  writeKvOverviewRow(ws, 6, 'Vegetated Area (ha)', fmtNum(d.totals.plannedCropCoverageHa, 1))
  writeKvOverviewRow(
    ws,
    7,
    'Planned Crop Coverage (%)',
    d.plannedCoveragePct ?? '—',
    typeof d.plannedCoveragePct === 'number' ? FR_NUM.PCT : undefined,
  )
  writeKvOverviewRow(
    ws,
    8,
    'Unplanned/Bare Area (%)',
    d.unplannedAreaPct ?? '—',
    typeof d.unplannedAreaPct === 'number' ? FR_NUM.PCT : undefined,
  )

  ws.getCell(11, 1).value = 'Per-Field Area Breakdown (chart source)'
  ws.getCell(11, 1).font = { name: 'Arial', bold: true, size: 12, color: { argb: FR.WHITE } }
  ws.getCell(11, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: FR.BANNER },
  }
  ws.getCell(11, STRESS_CATEGORY).value = 'Vegetation Coverage Distribution (chart source)'
  ws.getCell(11, STRESS_CATEGORY).font = {
    name: 'Arial',
    bold: true,
    size: 12,
    color: { argb: FR.WHITE },
  }
  ws.getCell(11, STRESS_CATEGORY).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: FR.BANNER },
  }

  const headerRow = 12
  applyTableHeader(ws.getCell(headerRow, FIELD_ID), 'Field ID')
  applyTableHeader(ws.getCell(headerRow, FIELD_NAME), 'Field Name')
  applyTableHeader(ws.getCell(headerRow, CROP), 'Crop Classification')
  applyTableHeader(ws.getCell(headerRow, IRRIGATION), 'Irrigation Type')
  applyTableHeader(ws.getCell(headerRow, PLANNED), 'Planned Crop Coverage (ha)')
  applyTableHeader(ws.getCell(headerRow, UNPLANNED), 'Unplanned Area (ha)')
  applyTableHeader(ws.getCell(headerRow, TOTAL), 'Total Area (ha)')
  applyTableHeader(ws.getCell(headerRow, WATER_LOSS_INDEX), 'Water Loss Index %')
  applyTableHeader(ws.getCell(headerRow, STRESS_CATEGORY), 'Category')
  applyTableHeader(ws.getCell(headerRow, STRESS_AREA), 'Area (ha)')

  const sortedRows = [...d.productionRows].sort((a, b) =>
    (a.fieldId || a.farmName).localeCompare(b.fieldId || b.farmName),
  )
  const fieldFirstRow = headerRow + 1
  sortedRows.forEach((row, i) => {
    const r = fieldFirstRow + i
    applyTableText(ws.getCell(r, FIELD_ID), row.fieldId || row.farmName)
    applyTableText(ws.getCell(r, FIELD_NAME), row.farmName || row.fieldId)
    applyTableText(ws.getCell(r, CROP), row.cropClassification || '—')
    applyTableText(ws.getCell(r, IRRIGATION), row.irrigationType || '—')
    applyTableNumber(
      ws.getCell(r, PLANNED),
      fmtNum(row.plannedCropCoverageHa, 1),
      FR_NUM.ONE_DEC,
    )
    applyTableNumber(
      ws.getCell(r, UNPLANNED),
      fmtNum(row.unplannedAreaHa, 1),
      FR_NUM.ONE_DEC,
    )
    applyTableNumber(ws.getCell(r, TOTAL), fmtNum(row.totalAreaHa, 1), FR_NUM.ONE_DEC)
    applyTableNumber(
      ws.getCell(r, WATER_LOSS_INDEX),
      fmtNum(row.waterLossIndexPct, 1),
      FR_NUM.ONE_DEC,
    )
  })
  const fieldLastRow = fieldFirstRow + Math.max(0, sortedRows.length - 1)

  const stressFirstRow = fieldFirstRow
  d.stressRows.forEach((row, i) => {
    const r = stressFirstRow + i
    applyTableText(
      ws.getCell(r, STRESS_CATEGORY),
      row.status === 'Harvested / Post-Harvest' ? `${row.status}*` : row.status,
    )
    applyTableNumber(
      ws.getCell(r, STRESS_AREA),
      fmtNum(row.areaHa, 1),
      FR_NUM.ONE_DEC,
    )
  })
  const stressLastRow = stressFirstRow + Math.max(0, d.stressRows.length - 1)

  if (d.harvestedFieldNames.length) {
    const noteRow = fieldLastRow + 2
    ws.getCell(noteRow, STRESS_CATEGORY).value =
      '*  Note: Non-Vegetated fields with harvest signals are reclassified as Harvested / Post-Harvest for portfolio reporting.'
    ws.getCell(noteRow, STRESS_CATEGORY).font = {
      name: 'Arial',
      size: 9,
      italic: true,
      color: { argb: FR.MUTED },
    }
    ws.mergeCells(noteRow, STRESS_CATEGORY, noteRow, STRESS_AREA + 2)
  }

  setAreaCoverageColumnWidths(ws)

  return {
    sheet: AREA_COVERAGE_SHEET,
    stressFirstRow,
    stressLastRow,
    fieldFirstRow,
    fieldLastRow,
    headerRow,
  }
}

export function buildAreaCoverageChartSpecs(
  layout: {
    sheet: string
    stressFirstRow: number
    stressLastRow: number
    fieldFirstRow: number
    fieldLastRow: number
    headerRow: number
  },
  data: ExecutiveReportData,
): MeteoNativeChartSpec[] {
  if (!data.stressRows.length && !data.productionRows.length) return []

  const sheet = layout.sheet
  const cell = (col: string, row: number) => `'${sheet}'!$${col}$${row}`
  const q = (col: string, r1: number, r2: number) => `'${sheet}'!$${col}$${r1}:$${col}$${r2}`
  const specs: MeteoNativeChartSpec[] = []

  if (layout.stressLastRow >= layout.stressFirstRow) {
    specs.push({
      title: 'Area (ha)',
      kind: 'pie',
      varyColors: true,
      legendPos: 'b',
      anchorRow: layout.fieldLastRow,
      anchorCol: 8,
      sectionLabel: 'Coverage',
      targetSheet: sheet,
      sliceColors: FR_CHART.PIE_SLICES,
      series: [
        {
          name: 'Area (ha)',
          nameRef: cell('J', layout.headerRow),
          catsRef: q('I', layout.stressFirstRow, layout.stressLastRow),
          valuesRef: q('J', layout.stressFirstRow, layout.stressLastRow),
        },
      ],
    })
  }

  if (layout.fieldLastRow >= layout.fieldFirstRow) {
    specs.push({
      title: 'Planned vs Unplanned Area by Field (ha)',
      kind: 'bar',
      barDir: 'col',
      grouping: 'stacked',
      varyColors: false,
      legendPos: 'b',
      anchorRow: layout.fieldLastRow,
      anchorCol: 0,
      sectionLabel: 'Per-Field',
      targetSheet: sheet,
      series: [
        {
          name: 'Planned Crop Coverage (ha)',
          nameRef: cell('E', layout.headerRow),
          catsRef: q('B', layout.fieldFirstRow, layout.fieldLastRow),
          valuesRef: q('E', layout.fieldFirstRow, layout.fieldLastRow),
          color: FR_CHART.PLANNED,
        },
        {
          name: 'Unplanned Area (ha)',
          nameRef: cell('F', layout.headerRow),
          catsRef: q('B', layout.fieldFirstRow, layout.fieldLastRow),
          valuesRef: q('F', layout.fieldFirstRow, layout.fieldLastRow),
          color: FR_CHART.UNPLANNED,
        },
      ],
    })
  }

  return specs
}
