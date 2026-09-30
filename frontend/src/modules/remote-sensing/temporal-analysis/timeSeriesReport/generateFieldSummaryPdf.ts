import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  FieldSummaryModel,
  FieldSummaryPortfolioStats,
} from './buildFieldSummaryModel'
import { sanitizeTimeSeriesReportExcelFilename } from './generateTimeSeriesReportExcel'

const ACCENT: [number, number, number] = [4, 120, 87]
const ACCENT_DARK: [number, number, number] = [6, 78, 59]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const PAGE_MARGIN = 14
const DEFAULT_COMBINED_FILENAME = 'Field_Summaries_Executive_Report.pdf'
const DEFAULT_BRAND = 'AgroCloud Satellite Intelligence'

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

/**
 * Build a Windows-safe `.pdf` download name from a plot label / AOI title.
 * Reuses the Excel sanitizer stem, then swaps the extension to `.pdf`.
 */
export function sanitizeFieldSummaryPdfFilename(raw: string): string {
  const withoutExt = String(raw || '')
    .replace(/\.pdf$/i, '')
    .replace(/\.xlsx$/i, '')
    .trim()
  const xlsxName = sanitizeTimeSeriesReportExcelFilename(withoutExt || 'Field_Summary')
  let stem = xlsxName.replace(/\.xlsx$/i, '')
  // Excel fallback is analytics-report oriented; prefer Field_Summary for empty/garbage names.
  if (stem === 'Agricultural_Imagery_Timeseries_Report') stem = 'Field_Summary'
  return `${stem}.pdf`
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number | null | undefined): string {
  if (ha == null || !Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function fmtWithUnit(n: number | null | undefined, digits: number, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)} ${unit}`
}

function drawHeader(doc: jsPDF, pw: number, title: string, subtitle: string, brand = DEFAULT_BRAND): number {
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, PAGE_MARGIN, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(subtitle, PAGE_MARGIN, 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2])
  doc.text(brand, PAGE_MARGIN, 28)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.35)
  doc.line(PAGE_MARGIN, 31, pw - PAGE_MARGIN, 31)
  doc.setTextColor(INK[0], INK[1], INK[2])
  return 36
}

function drawFooter(doc: jsPDF, pw: number, ph: number, pageLabel: string): void {
  const y = ph - 8
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.line(PAGE_MARGIN, y - 3, pw - PAGE_MARGIN, y - 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text('Validate against ground truth before operational decisions.', PAGE_MARGIN, y)
  doc.text(pageLabel, pw - PAGE_MARGIN, y, { align: 'right' })
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
): void {
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD')
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.rect(x, y + 1.2, w, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(label.toUpperCase(), x + 2.5, y + 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  const lines = doc.splitTextToSize(value, w - 5)
  doc.text(lines.slice(0, 2), x + 2.5, y + 12)
}

/** Draw one field summary onto the current page of `doc`. */
export function drawFieldSummaryPage(
  doc: jsPDF,
  summary: FieldSummaryModel,
  options?: { pageLabel?: string; brand?: string },
): void {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const contentW = pw - PAGE_MARGIN * 2

  let y = drawHeader(
    doc,
    pw,
    'Field Summary',
    `${summary.fieldName} · ${summary.fromDate} to ${summary.toDate} · Scene ${summary.sceneDate ?? '—'}`,
    options?.brand,
  )

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Field Name', 'Plot ID', 'Crop Type', 'Area']],
    body: [[summary.fieldName, summary.plotId, summary.cropType, fmtHa(summary.areaHa)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, textColor: INK },
    headStyles: { fillColor: ACCENT_DARK, textColor: 255, fontStyle: 'bold' },
  })
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 14
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Key Performance Indicators', PAGE_MARGIN, y)
  y += 4

  const kpis: Array<[string, string]> = [
    ['Vegetation Health', fmtNum(summary.vegetationHealthScore, 3)],
    ['Moisture Score', fmtNum(summary.moistureScore, 3)],
    ['Water Status', String(summary.waterStatus)],
    ['Yield (t/ha)', fmtNum(summary.yieldTHa, 1)],
    ['Production (tons)', fmtNum(summary.productionTons, 1)],
    ['Harvest Window', summary.harvestWindow],
    ['Irrigation', String(summary.irrigationStatus)],
    ['Overall Health', summary.overallFieldHealth],
  ]

  const cols = 4
  const gap = 3
  const cardW = (contentW - gap * (cols - 1)) / cols
  const cardH = 22
  kpis.forEach(([label, value], i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = PAGE_MARGIN + col * (cardW + gap)
    const cy = y + row * (cardH + gap)
    drawKpiCard(doc, x, cy, cardW, cardH, label, value)
  })
  y += Math.ceil(kpis.length / cols) * (cardH + gap) + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Recommendation', PAGE_MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  const recLines = doc.splitTextToSize(summary.recommendation || '—', contentW)
  doc.text(recLines.slice(0, 4), PAGE_MARGIN, y)

  drawFooter(doc, pw, ph, options?.pageLabel ?? '1 / 1')
}

/** Cover page with portfolio KPIs for the combined executive report. */
export function drawFieldSummaryCoverPage(
  doc: jsPDF,
  portfolio: FieldSummaryPortfolioStats,
  options?: { projectName?: string; fromDate?: string; toDate?: string },
): void {
  const projectName = options?.projectName || DEFAULT_BRAND
  const fromDate = options?.fromDate || ''
  const toDate = options?.toDate || ''
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const contentW = pw - PAGE_MARGIN * 2

  let y = drawHeader(
    doc,
    pw,
    'Executive Field Summaries',
    fromDate && toDate
      ? `Portfolio overview · ${fromDate} to ${toDate}`
      : 'Portfolio overview',
    projectName,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Portfolio KPIs', PAGE_MARGIN, y)
  y += 4

  const coverKpis: Array<[string, string]> = [
    ['Fields', String(portfolio.fieldCount)],
    ['Total Area', fmtHa(portfolio.totalAreaHa)],
    ['Total Production', fmtWithUnit(portfolio.totalProductionTons, 1, 't')],
    ['Avg Yield', fmtWithUnit(portfolio.avgYieldTHa, 1, 't/ha')],
    ['Healthy', String(portfolio.healthyCount)],
    ['Moderate', String(portfolio.moderateCount)],
    ['Stressed', String(portfolio.stressedCount)],
    ['Avg VHS', fmtNum(portfolio.avgHealthScore, 3)],
    ['Avg Moisture', fmtNum(portfolio.avgMoistureScore, 3)],
    ['Portfolio Status', String(portfolio.overallPortfolioStatus)],
  ]

  const cols = 5
  const gap = 3
  const cardW = (contentW - gap * (cols - 1)) / cols
  const cardH = 22
  coverKpis.forEach(([label, value], i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = PAGE_MARGIN + col * (cardW + gap)
    const cy = y + row * (cardH + gap)
    drawKpiCard(doc, x, cy, cardW, cardH, label, value)
  })

  drawFooter(doc, pw, ph, 'Cover')
}

/** Save a one-page Field Summary PDF for a single field. */
export function generateFieldSummaryPdf(
  summary: FieldSummaryModel,
  options?: { filename?: string; brand?: string },
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  drawFieldSummaryPage(doc, summary, { brand: options?.brand })
  const filename = sanitizeFieldSummaryPdfFilename(
    options?.filename || `${summary.fieldName}.pdf`,
  )
  doc.save(filename)
}

/** Save a combined executive PDF: cover page + one summary page per field. */
export function generateCombinedFieldSummariesPdf(
  summaries: FieldSummaryModel[],
  portfolio: FieldSummaryPortfolioStats,
  options?: { filename?: string; projectName?: string; fromDate?: string; toDate?: string },
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const fromDate = options?.fromDate || summaries[0]?.fromDate
  const toDate = options?.toDate || summaries[0]?.toDate
  drawFieldSummaryCoverPage(doc, portfolio, {
    projectName: options?.projectName,
    fromDate,
    toDate,
  })
  const total = summaries.length + 1
  summaries.forEach((summary, i) => {
    doc.addPage()
    drawFieldSummaryPage(doc, summary, {
      pageLabel: `${i + 2} / ${total}`,
      brand: options?.projectName,
    })
  })
  doc.save(
    sanitizeFieldSummaryPdfFilename(options?.filename || DEFAULT_COMBINED_FILENAME),
  )
}

/** @deprecated Prefer {@link generateFieldSummaryPdf}. */
export const saveFieldSummaryPdf = generateFieldSummaryPdf

/** @deprecated Prefer {@link generateCombinedFieldSummariesPdf}. */
export const saveCombinedFieldSummariesPdf = generateCombinedFieldSummariesPdf
