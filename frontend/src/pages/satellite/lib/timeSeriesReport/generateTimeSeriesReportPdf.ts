import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ImageryChartType } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { imageryLayerChartColor } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { drawVectorPieChart, drawVectorTimeSeriesChart } from './timeSeriesReportVectorChart'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

const ACCENT: [number, number, number] = [4, 120, 87]
const ACCENT_DARK: [number, number, number] = [6, 78, 59]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const PAGE_MARGIN = 14
const TOTAL_PAGES = 3
const FOOTER_RESERVE = 22

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function approxHa(totalHa: number, pct: number): string {
  if (!Number.isFinite(totalHa) || totalHa <= 0 || !Number.isFinite(pct)) return '—'
  const ha = (totalHa * pct) / 100
  return ha >= 100 ? `~${ha.toFixed(0)} ha` : `~${ha.toFixed(1)} ha`
}

function reportSubtitle(payload: TimeSeriesReportPayload): string {
  return `${payload.location.fieldName} · Multi-Index Vegetation & Water Status · Scene ${payload.period.acquisitionDate}`
}

function generatedStamp(payload: TimeSeriesReportPayload): string {
  return payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC'
}

function footerTop(ph: number): number {
  return ph - FOOTER_RESERVE
}

function drawReportHeader(doc: jsPDF, pw: number, payload: TimeSeriesReportPayload, page: number): number {
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(payload.executive.headline, PAGE_MARGIN, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(reportSubtitle(payload), PAGE_MARGIN, 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2])
  doc.text(payload.projectName, PAGE_MARGIN, 28)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(`Page ${page}`, pw - PAGE_MARGIN, 16, { align: 'right' })
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.35)
  doc.line(PAGE_MARGIN, 31, pw - PAGE_MARGIN, 31)
  doc.setTextColor(INK[0], INK[1], INK[2])
  return 36
}

function drawReportFooter(doc: jsPDF, pw: number, ph: number, payload: TimeSeriesReportPayload, page: number): void {
  const y = ph - 8
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.line(PAGE_MARGIN, y - 3, pw - PAGE_MARGIN, y - 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const left = `Generated ${generatedStamp(payload)} · ${payload.projectName}`
  const right = page < TOTAL_PAGES ? `${page} of ${TOTAL_PAGES}` : ''
  doc.text(left, PAGE_MARGIN, y)
  doc.text('Validate against ground truth before operational decisions.', PAGE_MARGIN, y + 3.2)
  if (right) doc.text(right, pw - PAGE_MARGIN, y, { align: 'right' })
  doc.setTextColor(INK[0], INK[1], INK[2])
}

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sublabel: string,
  estimated?: boolean,
): void {
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD')
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.rect(x, y + 1.2, w, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.2)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(label + (estimated ? '*' : ''), x + 2.5, y + 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(value, x + 2.5, y + 12.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const subLines = doc.splitTextToSize(sublabel, w - 5).slice(0, 2)
  doc.text(subLines, x + 2.5, y + 17)
}

function drawInsightCard(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, body: string): void {
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2])
  doc.text(title, x + 3, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  const lineHeight = 3.2
  const maxLines = Math.max(2, Math.floor((h - 11) / lineHeight))
  const lines = doc.splitTextToSize(body, w - 6).slice(0, maxLines)
  doc.text(lines, x + 3, y + 11)
}

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineHeight: number,
  maxY: number,
): number {
  const lines = doc.splitTextToSize(text, maxW)
  let cy = y
  for (const line of lines) {
    if (cy > maxY) break
    doc.text(line, x, cy)
    cy += lineHeight
  }
  return cy
}

function buildTimelineChartTitle(layerIds: string[]): string {
  const ids = layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  if (!ids.length) return 'Imagery Timeline'
  if (ids.length === 1) return `Imagery Timeline — ${ids[0]} Trend`
  if (ids.length === 2) return `Imagery Timeline — ${ids[0]} & ${ids[1]} Trend`
  return `Imagery Timeline — ${ids.slice(0, -1).join(', ')} & ${ids[ids.length - 1]} Trend`
}

function captureChartImage(
  chart: { toBase64Image: (type?: string, quality?: number) => string; update?: (mode?: 'none') => void } | null,
): string | null {
  if (!chart) return null
  try {
    chart.update?.('none')
    const dataUrl = chart.toBase64Image('image/png', 1)
    return dataUrl?.startsWith('data:') ? dataUrl : null
  } catch {
    return null
  }
}

function drawChartImage(
  doc: jsPDF,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  title: string,
  imageDataUrl: string,
): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(title, x, y)
  y += 4

  const props = doc.getImageProperties(imageDataUrl)
  const aspect = props.width / Math.max(props.height, 1)
  let imgW = maxW
  let imgH = imgW / aspect
  if (imgH > maxH) {
    imgH = maxH
    imgW = imgH * aspect
  }

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.25)
  doc.roundedRect(x - 0.5, y - 0.5, imgW + 1, imgH + 1, 2, 2, 'S')
  doc.addImage(imageDataUrl, 'PNG', x, y, imgW, imgH)
  return y + imgH
}

function buildChartSeriesForPdf(payload: TimeSeriesReportPayload) {
  const selected = new Set(payload.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))
  const source = payload.charts.series.filter(s => selected.has(s.layerId.toUpperCase()))
  const series = (source.length ? source : payload.charts.series).map((s, i) => ({
    label: s.layerId,
    values: s.values,
    color: imageryLayerChartColor(i),
  }))
  return series
}

export type TimeSeriesPdfChartOptions = {
  chart?: { toBase64Image: (type?: string, quality?: number) => string; update?: (mode?: 'none') => void } | null
  chartType?: ImageryChartType
}

function drawClassificationSection(
  doc: jsPDF,
  y: number,
  payload: TimeSeriesReportPayload,
): number {
  const areaHa = payload.location.areaHa
  const cov = payload.primaryInterpretation?.coverage.filter(c => c.pct > 0) ?? []
  const pieSlices = cov.map(c => ({ label: c.label, pct: c.pct, color: c.color }))
  const pieRadius = 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Classification Distribution', PAGE_MARGIN, y)
  y += 7

  if (!cov.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('No classification data available for this scene.', PAGE_MARGIN, y)
    return y + 8
  }

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Class', 'Area %', 'Approx. Area', 'Tier']],
    body: cov.map(c => [
      c.label,
      `${c.pct.toFixed(1)}%`,
      approxHa(areaHa, c.pct),
      c.tier.charAt(0).toUpperCase() + c.tier.slice(1),
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.4, textColor: INK },
    headStyles: { fillColor: ACCENT_DARK, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 24
  y += 8

  const pieCx = PAGE_MARGIN + pieRadius + 2
  const pieCy = y + pieRadius + 2
  y = drawVectorPieChart(doc, pieCx, pieCy, pieRadius, pieSlices) + 10
  return y
}

function estimateClassificationHeight(payload: TimeSeriesReportPayload): number {
  const cov = payload.primaryInterpretation?.coverage.filter(c => c.pct > 0) ?? []
  if (!cov.length) return 20
  return 7 + 12 + cov.length * 7 + 8 + 24 * 2 + 24
}

export async function generateTimeSeriesReportPdf(
  payload: TimeSeriesReportPayload,
  chartOptions: TimeSeriesPdfChartOptions = {},
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const contentW = pw - PAGE_MARGIN * 2
  const exec = payload.executive
  const areaHa = payload.location.areaHa

  exec.indexKpis[0] = {
    label: 'AREA MONITORED',
    value: fmtHa(areaHa),
    sublabel: 'AOI footprint',
  }

  let y = drawReportHeader(doc, pw, payload, 1)

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Field', 'Area', 'Monitoring Period', 'Acquisition']],
    body: [[payload.location.fieldName, fmtHa(areaHa), `${payload.period.from} to ${payload.period.to}`, payload.period.acquisitionDate]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, textColor: INK },
    headStyles: { fillColor: ACCENT_DARK, textColor: 255, fontStyle: 'bold' },
  })
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 14
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Key Performance Indicators', PAGE_MARGIN, y)
  y += 5

  const kpiW = (contentW - 8) / 5
  const kpiH = 20
  exec.indexKpis.forEach((kpi, i) => {
    drawKpiCard(doc, PAGE_MARGIN + i * (kpiW + 2), y, kpiW, kpiH, kpi.label, kpi.value, kpi.sublabel, kpi.estimated)
  })
  y += kpiH + 4

  if (exec.ndwiEstimated || exec.saviEstimated) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    const note = doc.splitTextToSize(
      '*NDWI and SAVI are not part of the original scene export and are estimated from the available NDVI/NDMI values for indicative comparison. Recompute from raw band reflectance for precision.',
      contentW,
    )
    doc.text(note, PAGE_MARGIN, y)
    y += note.length * 2.8 + 3
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Vegetation & Water Index Overview', PAGE_MARGIN, y)
  y += 2
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Index', 'What it measures', 'Value', 'Reading']],
    body: exec.indexOverview.map(row => [row.indexId, row.measures, row.value, row.reading]),
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: INK },
    headStyles: { fillColor: ACCENT_DARK, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 18 } },
  })
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Executive Interpretation', PAGE_MARGIN, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  y = drawWrappedText(doc, exec.narrative, PAGE_MARGIN, y, contentW, 4, footerTop(ph) - 2)

  drawReportFooter(doc, pw, ph, payload, 1)

  doc.addPage()
  y = drawReportHeader(doc, pw, payload, 2)

  const cardW = (contentW - 4) / 2
  const cardH = 22
  const insights = [
    { title: 'Crop Health', body: exec.cropHealth },
    { title: 'Vegetation Trend', body: exec.vegetationTrend },
    { title: 'Stress Detection', body: exec.stressAssessment },
    { title: 'Water / Moisture Status', body: exec.moistureStatus },
  ]
  insights.forEach((item, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    drawInsightCard(doc, PAGE_MARGIN + col * (cardW + 4), y + row * (cardH + 4), cardW, cardH, item.title, item.body)
  })
  y += cardH * 2 + 10

  const chartTitle = buildTimelineChartTitle(payload.layerIds)
  const chartImage = captureChartImage(chartOptions.chart ?? null)
  const classBlockH = estimateClassificationHeight(payload)
  const chartMaxH = Math.max(32, Math.min(72, footerTop(ph) - y - classBlockH - 56))

  if (chartImage) {
    y = drawChartImage(doc, PAGE_MARGIN, y, contentW, chartMaxH, chartTitle, chartImage)
    y += 5
  } else {
    const chartSeries = buildChartSeriesForPdf(payload)
    const tsH = 50
    drawVectorTimeSeriesChart(
      doc,
      PAGE_MARGIN,
      y,
      contentW,
      tsH,
      payload.charts.displayLabels,
      chartSeries,
      chartTitle,
    )
    y += tsH + 5
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const layerLabel = payload.layerIds.map(id => id.toUpperCase()).join(', ') || 'selected indices'
  const trendNote = doc.splitTextToSize(
    chartImage
      ? `Chart exported from the active Satellite Intelligence time-series view (${layerLabel}) with observation dates on the x-axis. Values reflect the same layers, aggregation, and period shown in the analysis panel (${payload.period.from} to ${payload.period.to}).`
      : `Time-series trend for ${layerLabel} across ${payload.charts.displayLabels.length} observation period(s) from ${payload.period.from} to ${payload.period.to}. Values are taken from the Sentinel Hub statistics used in the analysis panel.`,
    contentW,
  )
  doc.text(trendNote, PAGE_MARGIN, y)
  y += trendNote.length * 2.6 + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Recommended Actions', PAGE_MARGIN, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  const maxRecY = footerTop(ph) - classBlockH - 8
  for (const rec of exec.recommendations) {
    const lines = doc.splitTextToSize(`• ${rec}`, contentW - 2)
    const blockH = lines.length * 3.6
    if (y + blockH > maxRecY) break
    doc.text(lines, PAGE_MARGIN + 1, y)
    y += blockH
  }
  y += 2

  y = drawClassificationSection(doc, y, payload)

  drawReportFooter(doc, pw, ph, payload, 2)

  doc.addPage()
  y = drawReportHeader(doc, pw, payload, 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Multi-Index Analysis Notes', PAGE_MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  y = drawWrappedText(doc, exec.multiIndexNotes, PAGE_MARGIN, y, contentW, 3.6, footerTop(ph) - 14)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  drawWrappedText(
    doc,
    'Charts are vector/raster-rendered for print quality. NDWI and SAVI values marked with * are estimated from NDVI/NDMI in the absence of raw band reflectance data and should be replaced with computed values from source imagery where precision is required. Validate all findings against ground truth before operational decisions.',
    PAGE_MARGIN,
    y + 4,
    contentW,
    3.2,
    footerTop(ph) - 2,
  )

  drawReportFooter(doc, pw, ph, payload, 3)

  doc.save('Agricultural_Satellite_Intelligence_Report.pdf')
}
