import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { IMAGERY_TIME_AGGREGATION_OPTIONS } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { bboxFromGeometry } from './timeSeriesMapSnapshot'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import type { RiskLevel } from './timeSeriesReportExecutive'
import { computeLayerMedian } from './timeSeriesReportExecutive'
import { drawVectorTimeSeriesChart } from './timeSeriesReportVectorChart'

const BRAND: [number, number, number] = [4, 120, 87]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const ACCENT: [number, number, number] = [88, 28, 135]
const MARGIN = 12
const FOOTER_Y = 287
const ELITE_LOGO_URL =
  'https://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png'

type LogoAsset = { dataUrl: string; w: number; h: number } | null

function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits).replace(/\.?0+$/, '')
}

function fmtDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function aggregationLabel(id: string): string {
  return IMAGERY_TIME_AGGREGATION_OPTIONS.find(o => o.id === id)?.label ?? id
}

async function loadLogo(): Promise<LogoAsset> {
  try {
    const res = await fetch(ELITE_LOGO_URL, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    if (!dataUrl.startsWith('data:')) return null
    return { dataUrl, w: 42, h: 42 * 0.28 }
  } catch {
    return null
  }
}

function mapCoordToBox(
  lng: number,
  lat: number,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number] {
  const dlng = Math.max(bbox.maxLng - bbox.minLng, 1e-9)
  const dlat = Math.max(bbox.maxLat - bbox.minLat, 1e-9)
  return [x + ((lng - bbox.minLng) / dlng) * w, y + h - ((lat - bbox.minLat) / dlat) * h]
}

function drawAoiBoundary(
  doc: jsPDF,
  geometry: GeoJSON.Geometry | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const bbox = bboxFromGeometry(geometry, 0.05)
  if (!bbox || !geometry) return

  const drawRing = (ring: number[][]) => {
    const pts = ring.map(([lng, lat]) => mapCoordToBox(lng, lat, bbox, x, y, w, h))
    if (pts.length < 2) return
    doc.setDrawColor(52, 211, 153)
    doc.setLineWidth(0.7)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!
      const b = pts[(i + 1) % pts.length]!
      doc.line(a[0], a[1], b[0], b[1])
    }
  }

  if (geometry.type === 'Polygon') drawRing(geometry.coordinates[0] as number[][])
  else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) drawRing(poly[0] as number[][])
  }
}

function drawMapDecorations(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(INK[0], INK[1], INK[2])
  doc.setLineWidth(0.35)
  const nx = x + w - 8
  const ny = y + 6
  doc.line(nx, ny + 5, nx, ny)
  doc.line(nx, ny, nx - 2, ny + 2)
  doc.line(nx, ny, nx + 2, ny + 2)
  doc.setFontSize(5.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('N', nx - 1.2, ny - 1)

  const sbY = y + h - 4
  doc.line(x + 4, sbY, x + 24, sbY)
  doc.line(x + 4, sbY - 1, x + 4, sbY + 1)
  doc.line(x + 24, sbY - 1, x + 24, sbY + 1)
  doc.setFontSize(5)
  doc.text('Scale', x + 4, sbY + 3)
}

function riskColor(risk: RiskLevel): [number, number, number] {
  switch (risk) {
    case 'Very Low':
      return [16, 185, 129]
    case 'Low':
      return [52, 211, 153]
    case 'Moderate':
      return [245, 158, 11]
    case 'High':
      return [249, 115, 22]
    case 'Critical':
      return [239, 68, 68]
    default:
      return BRAND
  }
}

function drawPageChrome(
  doc: jsPDF,
  page: number,
  total: number,
  logo: LogoAsset,
  payload: TimeSeriesReportPayload,
): void {
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.rect(0, 0, pageW, 9, 'F')

  if (logo) doc.addImage(logo.dataUrl, 'PNG', MARGIN, 1.5, logo.w, logo.h)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('AgroCloud GeoAI', pageW - MARGIN, 4.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Satellite Intelligence & Spatial Analytics', pageW - MARGIN, 7.5, { align: 'right' })

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, FOOTER_Y - 2, pageW - MARGIN, FOOTER_Y - 2)

  if (logo) doc.addImage(logo.dataUrl, 'PNG', MARGIN, FOOTER_Y, logo.w * 0.55, logo.h * 0.55)

  doc.setFontSize(7)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text('Imagery Time Series Analysis · Confidential', MARGIN + (logo ? logo.w * 0.6 : 0), FOOTER_Y + 4)
  doc.text(fmtDate(payload.generatedAt), pageW / 2, FOOTER_Y + 4, { align: 'center' })
  doc.text(`Page ${page} / ${total}`, pageW - MARGIN, FOOTER_Y + 4, { align: 'right' })
}

function drawMetaGrid(
  doc: jsPDF,
  y: number,
  payload: TimeSeriesReportPayload,
  exec: TimeSeriesReportPayload['executiveSummary'],
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const colW = (pageW - MARGIN * 2) / 4
  const items = [
    { label: 'AOI / Field', value: payload.fieldName },
    { label: 'Indices', value: exec.indices },
    { label: 'Period', value: `${fmtDate(payload.period.start)} – ${fmtDate(payload.period.end)}` },
    { label: 'Generated', value: fmtDate(payload.generatedAt) },
  ]

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 14, 1.5, 1.5, 'F')

  items.forEach((item, i) => {
    const x = MARGIN + i * colW + 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(item.label.toUpperCase(), x, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(doc.splitTextToSize(item.value, colW - 4)[0] ?? item.value, x, y + 9.5)
  })

  return y + 18
}

export async function generateTimeSeriesReportPdf(
  payload: TimeSeriesReportPayload,
  options?: {
    includeMap?: boolean
    includeInterpretation?: boolean
    includeCharts?: { line?: boolean; bar?: boolean; scatter?: boolean }
  },
): Promise<boolean> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const contentW = pageW - MARGIN * 2
  const logo = await loadLogo()
  const exec = payload.executiveSummary
  const colW = (contentW - 6) / 2

  let y = 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('IMAGERY TIME SERIES ANALYSIS REPORT', MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(payload.projectName, MARGIN, y)
  y = drawMetaGrid(doc, y + 3, payload, exec)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
  doc.text('Executive Summary', MARGIN, y)
  y += 2

  doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2])
  doc.setFillColor(240, 253, 244)
  doc.setLineWidth(0.3)
  const execH = 32
  doc.roundedRect(MARGIN, y, contentW, execH, 2, 2, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(INK[0], INK[1], INK[2])
  const narrative = doc.splitTextToSize(exec.narrative, contentW - 8)
  doc.text(narrative.slice(0, 8), MARGIN + 4, y + 5)

  const risk = riskColor(exec.riskLevel)
  doc.setFillColor(risk[0], risk[1], risk[2])
  doc.roundedRect(pageW - MARGIN - 28, y + 3, 26, 7, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text(`Risk: ${exec.riskLevel}`, pageW - MARGIN - 15, y + 7.5, { align: 'center' })

  y += execH + 5

  const leftX = MARGIN
  const rightX = MARGIN + colW + 6
  const mapY = y
  const mapH = 58

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Study Area Location', leftX, mapY)

  const mapBoxY = mapY + 3
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.25)
  doc.rect(leftX, mapBoxY, colW, mapH)

  if (options?.includeMap !== false && payload.charts.mapPng) {
    doc.addImage(payload.charts.mapPng, 'PNG', leftX, mapBoxY, colW, mapH)
    drawAoiBoundary(doc, payload.location.geometry, leftX, mapBoxY, colW, mapH)
    drawMapDecorations(doc, leftX, mapBoxY, colW, mapH)
  } else {
    drawAoiBoundary(doc, payload.location.geometry, leftX, mapBoxY, colW, mapH)
    drawMapDecorations(doc, leftX, mapBoxY, colW, mapH)
    doc.setFontSize(7)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('AOI boundary (satellite basemap unavailable)', leftX + 3, mapBoxY + mapH / 2)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const coordLine =
    payload.location.latitude != null && payload.location.longitude != null
      ? `Centroid: ${payload.location.latitude.toFixed(5)}°N, ${payload.location.longitude.toFixed(5)}°E · WGS84`
      : 'Coordinates: —'
  const areaLine = exec.areaHa != null ? `Area: ${exec.areaHa.toFixed(2)} ha` : 'Area: —'
  doc.text(`${coordLine} · ${areaLine}`, leftX, mapBoxY + mapH + 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Statistical Summary', rightX, mapY)

  autoTable(doc, {
    startY: mapBoxY,
    margin: { left: rightX, right: MARGIN },
    tableWidth: colW,
    head: [['Index', 'Mean', 'Min', 'Max', 'Trend']],
    body: payload.layerStats.map(s => [
      s.layerId,
      fmtNum(s.mean),
      fmtNum(s.min),
      fmtNum(s.max),
      s.trend,
    ]),
    styles: { fontSize: 7, cellPadding: 1.8, textColor: INK, lineColor: [226, 232, 240] },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  const chartY = mapBoxY + 28
  const chartTitle = `${payload.layerIds[0] ?? 'Index'} trend · ${aggregationLabel(payload.period.aggregation)}`
  drawVectorTimeSeriesChart(
    doc,
    rightX,
    chartY,
    colW,
    mapH - 28,
    payload.labels,
    payload.layerSeries,
    chartTitle,
  )

  y = mapBoxY + mapH + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text('AI Interpretation & Recommendations', MARGIN, y)
  y += 4

  doc.setFillColor(250, 245, 255)
  doc.setDrawColor(233, 213, 255)
  doc.roundedRect(MARGIN, y, contentW, 36, 2, 2, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(INK[0], INK[1], INK[2])

  let narrativeText = ''
  if (options?.includeInterpretation !== false) {
    if (payload.interpretations.length) {
      const interp = payload.interpretations[0]!
      narrativeText = [interp.summaryLine, interp.coverageLine].filter(Boolean).join(' ')
    } else {
      narrativeText = payload.interpretationNarrative || exec.vegetationCondition
    }
  } else {
    narrativeText = exec.vegetationCondition
  }

  const interpLines = doc.splitTextToSize(narrativeText, contentW - 8)
  doc.text(interpLines.slice(0, 4), MARGIN + 4, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Recommendations', MARGIN + 4, y + 22)
  doc.setFont('helvetica', 'normal')
  exec.recommendations.slice(0, 3).forEach((rec, i) => {
    doc.text(`• ${rec}`, MARGIN + 6, y + 27 + i * 4)
  })

  const needsPage2 =
    payload.layerStats.length > 4 ||
    payload.labels.length > 12 ||
    payload.scatterAnalysis != null

  if (needsPage2) {
    doc.addPage()
    let y2 = 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text('Appendix — Comparison & Observations', MARGIN, y2)
    y2 += 6

    if (payload.scatterAnalysis) {
      const sa = payload.scatterAnalysis
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.text(
        `Correlation ${sa.xLayerId} vs ${sa.yLayerId}: R² = ${fmtNum(sa.regression.r2, 4)} · ${sa.relationship.label}`,
        MARGIN,
        y2,
      )
      y2 += 5
    }

    autoTable(doc, {
      startY: y2,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Metric', ...payload.layerStats.map(s => s.layerId)]],
      body: [
        ['Median', ...payload.layerStats.map(s => fmtNum(computeLayerMedian(
          payload.layerSeries.find(ls => ls.layerId === s.layerId)?.values ?? [],
        )))],
        ['Std Dev', ...payload.layerStats.map(s => fmtNum(s.stdDev))],
        ['Observations', ...payload.layerStats.map(s => String(s.observationCount))],
      ],
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: ACCENT, textColor: 255 },
    })

    y2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

    autoTable(doc, {
      startY: y2,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Period', ...payload.layerSeries.map(s => s.layerId)]],
      body: payload.labels.slice(0, 18).map((label, i) => [
        label,
        ...payload.layerSeries.map(s => fmtNum(s.values[i] ?? null)),
      ]),
      styles: { fontSize: 7, cellPadding: 1.6 },
      headStyles: { fillColor: BRAND, textColor: 255 },
    })

    doc.setFontSize(6.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(exec.satelliteInfo, MARGIN, FOOTER_Y - 5)
  }

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    drawPageChrome(doc, p, total, logo, payload)
  }

  const slug = payload.fieldName.replace(/[^\w.-]+/g, '_').slice(0, 40)
  doc.save(`agro-intelligence-report-${slug}.pdf`)
  return true
}
