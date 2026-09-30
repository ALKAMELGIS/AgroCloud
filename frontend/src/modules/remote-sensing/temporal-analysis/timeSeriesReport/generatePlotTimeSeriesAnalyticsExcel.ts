import ExcelJS from 'exceljs'
import { renderTrendChartPair } from './timeSeriesExcelChartRenderer'
import type {
  PlotTimeSeriesAnalyticsModel,
  PlotTimeSeriesAnalyticsOptions,
} from './plotTimeSeriesAnalyticsTypes'
import { DEFAULT_PLOT_TS_ANALYTICS_OPTIONS } from './plotTimeSeriesAnalyticsTypes'

const BRAND = 'FF047857'
const HEADER = 'FF065F46'
const ALT = 'FFF8FAFC'
const INK = 'FF0F172A'
const MUTED = 'FF64748B'
const SECTION = 'FFE2F5EE'

function fmt(n: number | null | undefined, digits = 4): number | string {
  if (n == null || !Number.isFinite(n)) return '-'
  return Number(n.toFixed(digits))
}

function slug(s: string): string {
  return String(s || 'Farm')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'Farm'
}

function yyyymmdd(iso: string): string {
  return (iso || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF064E3B' } },
    }
  })
  row.height = 22
}

function styleAltRows(ws: ExcelJS.Worksheet, fromRow: number, toRow: number): void {
  for (let r = fromRow; r <= toRow; r++) {
    if ((r - fromRow) % 2 === 1) {
      ws.getRow(r).eachCell(cell => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
        }
      })
    }
  }
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 36): void {
  const colCount = ws.columnCount || 12
  for (let c = 1; c <= colCount; c++) {
    let width = min
    ws.eachRow({ includeEmpty: false }, row => {
      const cell = row.getCell(c)
      const text = String(cell.value ?? '')
      width = Math.min(max, Math.max(width, text.length + 2))
    })
    ws.getColumn(c).width = width
  }
}

function addSheetIndex(wb: ExcelJS.Workbook): void {
  const exec = wb.getWorksheet('Executive Summary')
  if (!exec) return
  const names = wb.worksheets.map(s => s.name)
  exec.getCell('A1').value = `Sheets: ${names.join(' Â· ')}`
  exec.getCell('A1').font = { size: 8, color: { argb: MUTED }, italic: true }
}

function applyValueColorScale(
  ws: ExcelJS.Worksheet,
  col: number,
  fromRow: number,
  toRow: number,
  enabled: boolean,
): void {
  if (!enabled || toRow < fromRow) return
  try {
    ws.addConditionalFormatting({
      ref: `${colLetter(col)}${fromRow}:${colLetter(col)}${toRow}`,
      rules: [
        {
          type: 'colorScale',
          cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
          color: [{ argb: 'FFEF4444' }, { argb: 'FFFACC15' }, { argb: 'FF22C55E' }],
        } as ExcelJS.ConditionalFormattingRule,
      ],
    })
  } catch {
    /* exceljs CF shape varies by version */
  }
}

function colLetter(n: number): string {
  let s = ''
  let x = n
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function writeExecutiveSummary(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): void {
  const ws = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', ySplit: 12 }],
  })
  const { meta, rows, kpis } = model
  const title = `${meta.layerLabel} Priority Report`
  ws.mergeCells('A2', 'I2')
  ws.getCell('A2').value = title
  ws.getCell('A2').font = { bold: true, size: 18, color: { argb: BRAND } }

  const info: Array<[string, string | number]> = [
    ['Farm Name', meta.farmName],
    ['AOI Name', meta.aoiName],
    ['Analysis Layer', meta.layerLabel],
    ['Date Range', `${meta.fromDate} â†’ ${meta.toDate}`],
    ['Aggregation', meta.timeAggregation],
    ['Generated', meta.generatedAt.slice(0, 19).replace('T', ' ')],
    ['Plots', meta.plotCount],
    ['Average Value', fmt(kpis.averageValue)],
    ['Lowest Value', fmt(kpis.lowestValue)],
    ['Highest Value', fmt(kpis.highestValue)],
    ['Healthy', kpis.healthyCount],
    ['Moderate', kpis.moderateCount],
    ['Stress', kpis.stressCount],
    ['Critical', kpis.criticalCount],
  ]
  let r = 4
  for (const [k, v] of info) {
    ws.getCell(r, 1).value = k
    ws.getCell(r, 1).font = { bold: true, color: { argb: MUTED }, size: 9 }
    ws.getCell(r, 2).value = v
    ws.getCell(r, 2).font = { color: { argb: INK }, size: 10 }
    r++
  }

  const tableStart = r + 1
  ws.getCell(tableStart, 1).value = 'Priority Table'
  ws.getCell(tableStart, 1).font = { bold: true, size: 12, color: { argb: BRAND } }
  ws.getCell(tableStart, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION } }

  const headerRow = tableStart + 1
  const headers = [
    'Priority',
    'Plot ID',
    'Crop',
    'Area (ha)',
    'Current Value',
    'Previous Value',
    'Difference',
    'Trend',
    'Status',
    'Priority Score',
    'Recommended Action',
  ]
  headers.forEach((h, i) => {
    ws.getCell(headerRow, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(headerRow))
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + rows.length, column: headers.length },
  }

  rows.forEach((row, idx) => {
    const rr = headerRow + 1 + idx
    const values = [
      idx + 1,
      row.plotId,
      row.cropType,
      fmt(row.areaHa, 2),
      fmt(row.latestValue),
      fmt(row.previousValue),
      fmt(row.difference),
      row.trend,
      row.status,
      fmt(row.priorityScore, 2),
      row.recommendedAction,
    ]
    values.forEach((v, i) => {
      ws.getCell(rr, i + 1).value = v
      ws.getCell(rr, i + 1).font = { size: 9, color: { argb: INK } }
    })
    if (row.statusColor) {
      ws.getCell(rr, 9).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + row.statusColor.replace('#', '') },
      }
    }
  })
  styleAltRows(ws, headerRow + 1, headerRow + rows.length)
  applyValueColorScale(ws, 5, headerRow + 1, headerRow + rows.length, opts.includeConditionalFormatting)
  autoWidth(ws)
}

function writePlotStatistics(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): void {
  if (!opts.includeStatistics) return
  const ws = wb.addWorksheet('Plot Statistics', { views: [{ state: 'frozen', ySplit: 1 }] })
  const headers = [
    'Plot ID',
    'Area (ha)',
    'Crop Type',
    'Observation Count',
    'Mean',
    'Median',
    'Minimum',
    'Maximum',
    'Std Dev',
    'Latest',
    'Previous',
    'Difference',
    'Trend',
    'Status',
  ]
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(1))
  model.rows.forEach((row, idx) => {
    const r = idx + 2
    ;[
      row.plotId,
      fmt(row.areaHa, 2),
      row.cropType,
      row.observationCount,
      fmt(row.mean),
      fmt(row.median),
      fmt(row.min),
      fmt(row.max),
      fmt(row.stdDev),
      fmt(row.latestValue),
      fmt(row.previousValue),
      fmt(row.difference),
      row.trend,
      row.status,
    ].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
  })
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1 + model.rows.length, column: headers.length },
  }
  styleAltRows(ws, 2, 1 + model.rows.length)
  applyValueColorScale(ws, 10, 2, 1 + model.rows.length, opts.includeConditionalFormatting)
  autoWidth(ws)
}

function writeCompleteTimeSeries(wb: ExcelJS.Workbook, model: PlotTimeSeriesAnalyticsModel): void {
  const ws = wb.addWorksheet('Complete Time Series', { views: [{ state: 'frozen', ySplit: 1 }] })
  const headers = ['Date', 'Plot ID', 'Layer Name', 'Value', 'Observation Source', 'Quality Flag']
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(1))
  let r = 2
  const sorted = model.rows
    .flatMap(row =>
      row.observations.map(obs => ({
        date: obs.date,
        plotId: row.plotId,
        layer: model.meta.layerLabel,
        value: obs.value,
        source: obs.source ?? 'Sentinel Hub',
        quality: obs.qualityFlag ?? '-',
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.plotId.localeCompare(b.plotId))

  for (const row of sorted) {
    ;[row.date, row.plotId, row.layer, fmt(row.value), row.source, row.quality].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    r++
  }
  if (r > 2) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r - 1, column: headers.length } }
    styleAltRows(ws, 2, r - 1)
  }
  autoWidth(ws)
}

function writePivotSheets(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): void {
  if (!opts.includePivotTables) return
  const ws = wb.addWorksheet('Pivot Summaries', { views: [{ state: 'frozen', ySplit: 1 }] })
  let r = 1
  ws.getCell(r, 1).value = 'Average value by Plot'
  ws.getCell(r, 1).font = { bold: true, color: { argb: BRAND } }
  r++
  ;['Plot ID', 'Average Value', 'Latest Value', 'Area (ha)'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(r))
  const pivotStart = r
  r++
  for (const row of model.rows) {
    ;[row.plotId, fmt(row.mean), fmt(row.latestValue), fmt(row.areaHa, 2)].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    r++
  }
  styleAltRows(ws, pivotStart + 1, r - 1)

  r += 2
  ws.getCell(r, 1).value = 'Monthly Average'
  ws.getCell(r, 1).font = { bold: true, color: { argb: BRAND } }
  r++
  ;['Month', 'Average Value', 'Observation Count'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(r))
  r++
  for (const m of model.monthlyAverages) {
    ;[m.month, fmt(m.average), m.count].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    r++
  }

  r += 2
  ws.getCell(r, 1).value = 'Crop Summary'
  ws.getCell(r, 1).font = { bold: true, color: { argb: BRAND } }
  r++
  ;['Crop Type', 'Average Value', 'Plot Count'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(r))
  r++
  for (const c of model.cropSummary) {
    ;[c.cropType, fmt(c.average), c.plotCount].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    r++
  }

  r += 2
  ws.getCell(r, 1).value = 'Status Counts'
  ws.getCell(r, 1).font = { bold: true, color: { argb: BRAND } }
  r++
  ;['Status', 'Count'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(r))
  r++
  for (const s of model.statusCounts) {
    ;[s.status, s.count].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    r++
  }
  autoWidth(ws)
}

async function writeChartsSheet(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): Promise<void> {
  if (!opts.includeCharts) return
  const ws = wb.addWorksheet('Charts')
  ws.getCell('A1').value = `${model.meta.layerLabel} Charts`
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: BRAND } }

  let rowCursor = 3
  const addChartImage = (base64: string | null, title: string) => {
    if (!base64) return
    ws.getCell(rowCursor, 1).value = title
    ws.getCell(rowCursor, 1).font = { bold: true, size: 11 }
    rowCursor += 1
    const imgId = wb.addImage({ base64, extension: 'png' })
    ws.addImage(imgId, {
      tl: { col: 0, row: rowCursor - 1 },
      ext: { width: 720, height: 340 },
    })
    rowCursor += 20
  }

  const colors = ['#047857', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']
  addChartImage(
    renderTrendChartPair(model.chartDates, {
      title: `Overall Farm Average - ${model.meta.layerLabel}`,
      yAxisLabel: model.meta.layerLabel,
      layers: [
        {
          layerId: 'Farm Average',
          values: model.farmAverageSeries,
          color: colors[0]!,
        },
      ],
    }),
    'Overall Farm Average Trend',
  )

  const byLatest = [...model.rows]
    .filter(r => r.latestValue != null)
    .sort((a, b) => (a.latestValue ?? 0) - (b.latestValue ?? 0))
  const lowest = byLatest.slice(0, 10)
  const highest = [...byLatest].reverse().slice(0, 10)

  if (lowest.length) {
    addChartImage(
      renderTrendChartPair(model.chartDates, {
        title: `Top ${lowest.length} Lowest - ${model.meta.layerLabel}`,
        yAxisLabel: model.meta.layerLabel,
        layers: lowest.map((row, i) => ({
          layerId: row.plotId,
          values: model.chartDates.map(d => row.observations.find(o => o.date === d)?.value ?? null),
          color: colors[i % colors.length]!,
        })),
      }),
      'Top 10 Lowest Values',
    )
  }
  if (highest.length) {
    addChartImage(
      renderTrendChartPair(model.chartDates, {
        title: `Top ${highest.length} Highest - ${model.meta.layerLabel}`,
        yAxisLabel: model.meta.layerLabel,
        layers: highest.map((row, i) => ({
          layerId: row.plotId,
          values: model.chartDates.map(d => row.observations.find(o => o.date === d)?.value ?? null),
          color: colors[i % colors.length]!,
        })),
      }),
      'Top 10 Highest Values',
    )
  }

  if (model.monthlyAverages.length) {
    addChartImage(
      renderTrendChartPair(
        model.monthlyAverages.map(m => m.month),
        {
          title: `Monthly Trend - ${model.meta.layerLabel}`,
          yAxisLabel: model.meta.layerLabel,
          layers: [
            {
              layerId: 'Monthly Avg',
              values: model.monthlyAverages.map(m => m.average),
              color: colors[1]!,
            },
          ],
        },
      ),
      'Monthly Trend',
    )
  }

  const perPlot = model.rows.slice(0, Math.max(0, opts.maxPerPlotCharts))
  for (const row of perPlot) {
    addChartImage(
      renderTrendChartPair(model.chartDates, {
        title: `${row.plotId} - ${model.meta.layerLabel}`,
        yAxisLabel: model.meta.layerLabel,
        layers: [
          {
            layerId: row.plotId,
            values: model.chartDates.map(d => row.observations.find(o => o.date === d)?.value ?? null),
            color: colors[0]!,
          },
        ],
      }),
      `Plot ${row.plotId}`,
    )
  }

  if (model.rows.length > opts.maxPerPlotCharts) {
    ws.getCell(rowCursor, 1).value =
      `Per-plot charts limited to ${opts.maxPerPlotCharts} of ${model.rows.length} plots for performance.`
    ws.getCell(rowCursor, 1).font = { italic: true, color: { argb: MUTED }, size: 9 }
  }
}

function writeAlertsSheet(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): void {
  if (!opts.includeAlerts) return
  const ws = wb.addWorksheet('Alerts', { views: [{ state: 'frozen', ySplit: 1 }] })
  const headers = [
    'Plot ID',
    'Alert Type',
    'Severity',
    'Current Value',
    'Previous Value',
    'Difference',
    'Trend',
    'Recommendation',
  ]
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h
  })
  styleHeaderRow(ws.getRow(1))
  model.alerts.forEach((a, idx) => {
    const r = idx + 2
    ;[
      a.plotId,
      a.alertType,
      a.severity,
      fmt(a.currentValue),
      fmt(a.previousValue),
      fmt(a.difference),
      a.trend,
      a.recommendation,
    ].forEach((v, i) => {
      ws.getCell(r, i + 1).value = v
    })
    const sevColor =
      a.severity === 'Critical'
        ? 'FFFECACA'
        : a.severity === 'High'
          ? 'FFFED7AA'
          : a.severity === 'Medium'
            ? 'FFFEF08A'
            : a.severity === 'Info'
              ? 'FFD1FAE5'
              : 'FFE2E8F0'
    ws.getCell(r, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevColor } }
  })
  if (model.alerts.length) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1 + model.alerts.length, column: headers.length },
    }
  }
  autoWidth(ws)
}

function writeMetadataSheet(
  wb: ExcelJS.Workbook,
  model: PlotTimeSeriesAnalyticsModel,
  opts: PlotTimeSeriesAnalyticsOptions,
): void {
  if (!opts.includeMetadata) return
  const ws = wb.addWorksheet('Metadata')
  ws.getCell('A1').value = 'Export Metadata'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: BRAND } }
  const rows: Array<[string, string | number]> = [
    ['Farm Name', model.meta.farmName],
    ['AOI Name', model.meta.aoiName],
    ['Analysis Layer', model.meta.layerLabel],
    ['Layer ID', model.meta.layerId],
    ['Coordinate System', model.meta.coordinateSystem],
    ['Time Range', `${model.meta.fromDate} â†’ ${model.meta.toDate}`],
    ['Aggregation', model.meta.timeAggregation],
    ['Processing Date', model.meta.generatedAt],
    ['Data Source', model.meta.dataSource],
    ['Platform Version', model.meta.platformVersion],
    ['Export Version', model.meta.exportVersion],
    ['Plot Count', model.meta.plotCount],
  ]
  rows.forEach(([k, v], i) => {
    ws.getCell(i + 3, 1).value = k
    ws.getCell(i + 3, 1).font = { bold: true, color: { argb: MUTED } }
    ws.getCell(i + 3, 2).value = v
  })
  autoWidth(ws)
}

export async function buildPlotTimeSeriesAnalyticsWorkbook(
  model: PlotTimeSeriesAnalyticsModel,
  options: Partial<PlotTimeSeriesAnalyticsOptions> = {},
): Promise<ExcelJS.Workbook> {
  const opts = { ...DEFAULT_PLOT_TS_ANALYTICS_OPTIONS, ...options }
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud'
  wb.created = new Date()
  wb.title = `${model.meta.layerLabel} Plot Time Series Analytics`

  writeExecutiveSummary(wb, model, opts)
  writePlotStatistics(wb, model, opts)
  writeCompleteTimeSeries(wb, model)
  writePivotSheets(wb, model, opts)
  await writeChartsSheet(wb, model, opts)
  writeAlertsSheet(wb, model, opts)
  writeMetadataSheet(wb, model, opts)
  addSheetIndex(wb)
  return wb
}

export function buildPlotTimeSeriesAnalyticsFilename(model: PlotTimeSeriesAnalyticsModel): string {
  const farm = slug(model.meta.farmName)
  const layer = slug(model.meta.layerId)
  return `${farm}_${layer}_Priority_Report_${yyyymmdd(model.meta.generatedAt)}.xlsx`
}

export async function generatePlotTimeSeriesAnalyticsExcel(
  model: PlotTimeSeriesAnalyticsModel,
  options: Partial<PlotTimeSeriesAnalyticsOptions> = {},
): Promise<void> {
  const wb = await buildPlotTimeSeriesAnalyticsWorkbook(model, options)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildPlotTimeSeriesAnalyticsFilename(model)
  a.click()
  URL.revokeObjectURL(url)
}
