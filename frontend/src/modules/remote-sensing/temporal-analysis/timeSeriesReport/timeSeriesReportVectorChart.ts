import type jsPDF from 'jspdf'

const CHART_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ef4444', '#a855f7']

export function drawVectorTimeSeriesChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  series: Array<{ label: string; values: Array<number | null>; color?: string }>,
  title: string,
): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)
  doc.text(title, x, y - 2)

  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  const plotX = x + 8
  const plotY = y + 6
  const plotW = w - 16
  const plotH = h - 24

  const values: number[] = []
  for (const s of series) {
    for (const v of s.values) {
      if (v != null && Number.isFinite(v)) values.push(v)
    }
  }
  if (!values.length || !labels.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text('No chart data', plotX + plotW / 2 - 10, plotY + plotH / 2)
    return
  }

  let yMin = Math.min(...values)
  let yMax = Math.max(...values)
  if (yMin === yMax) {
    yMin -= 0.05
    yMax += 0.05
  }
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad

  const gridLines = 4
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.15)
  for (let g = 0; g <= gridLines; g++) {
    const gy = plotY + (plotH * g) / gridLines
    doc.line(plotX, gy, plotX + plotW, gy)
  }

  const n = labels.length
  const stepX = n <= 1 ? plotW : plotW / (n - 1)

  series.forEach((s, si) => {
    const color = hexToRgb(s.color ?? CHART_COLORS[si % CHART_COLORS.length]!)
    doc.setDrawColor(color.r, color.g, color.b)
    doc.setLineWidth(0.45)

    let prev: [number, number] | null = null
    for (let i = 0; i < n; i++) {
      const v = s.values[i]
      if (v == null || !Number.isFinite(v)) {
        prev = null
        continue
      }
      const px = plotX + (n <= 1 ? plotW / 2 : i * stepX)
      const py = plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH
      if (prev) doc.line(prev[0], prev[1], px, py)
      doc.setFillColor(color.r, color.g, color.b)
      doc.circle(px, py, 0.6, 'F')
      prev = [px, py]
    }
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  doc.text(yMax.toFixed(2), plotX - 1, plotY + 3, { align: 'right' })
  doc.text(yMin.toFixed(2), plotX - 1, plotY + plotH, { align: 'right' })

  const maxTicks = Math.min(10, n)
  const tickIndices: number[] = []
  if (n <= maxTicks) {
    for (let i = 0; i < n; i++) tickIndices.push(i)
  } else {
    tickIndices.push(0)
    const step = (n - 1) / (maxTicks - 1)
    for (let t = 1; t < maxTicks - 1; t++) tickIndices.push(Math.round(t * step))
    tickIndices.push(n - 1)
  }
  doc.setFontSize(5.5)
  for (const i of tickIndices) {
    const px = plotX + (n <= 1 ? plotW / 2 : i * stepX)
    const label = String(labels[i] ?? '')
    const short = label.length > 14 ? `${label.slice(0, 12)}…` : label
    doc.text(short, px, plotY + plotH + 5, { align: 'center' })
  }

  let lx = plotX
  series.forEach((s, si) => {
    const color = hexToRgb(s.color ?? CHART_COLORS[si % CHART_COLORS.length]!)
    doc.setFillColor(color.r, color.g, color.b)
    doc.rect(lx, y + h - 5, 3, 1.5, 'F')
    doc.text(s.label, lx + 4, y + h - 3.5)
    lx += doc.getTextWidth(s.label) + 12
  })
}

export function drawVectorPieChart(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  slices: Array<{ label: string; pct: number; color: string }>,
): number {
  const total = slices.reduce((s, sl) => s + Math.max(0, sl.pct), 0)
  if (total <= 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text('No classification data', cx - 18, cy)
    return cy + 6
  }

  let start = -Math.PI / 2
  for (const sl of slices) {
    if (sl.pct <= 0) continue
    const angle = (sl.pct / total) * Math.PI * 2
    const end = start + angle
    const rgb = hexToRgb(sl.color)
    doc.setFillColor(rgb.r, rgb.g, rgb.b)
    pieSlice(doc, cx, cy, radius, start, end)
    start = end
  }

  const legendX = cx + radius + 10
  let ly = cy - radius + 6
  const legendMaxW = 110
  for (const sl of slices) {
    if (sl.pct <= 0) continue
    const rgb = hexToRgb(sl.color)
    doc.setFillColor(rgb.r, rgb.g, rgb.b)
    doc.rect(legendX, ly - 2.5, 3, 3, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(51, 65, 85)
    const label = `${sl.label} — ${sl.pct.toFixed(1)}%`
    const lines = doc.splitTextToSize(label, legendMaxW)
    doc.text(lines, legendX + 5, ly)
    ly += Math.max(5, lines.length * 3.6)
  }

  return Math.max(cy + radius + 6, ly + 4)
}

function pieSlice(doc: jsPDF, cx: number, cy: number, r: number, a0: number, a1: number): void {
  const steps = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 48))
  const pts: [number, number][] = [[cx, cy]]
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0]!
    const b = pts[i]!
    const c = pts[i + 1]!
    doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F')
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function drawMapChrome(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null,
): void {
  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.35)
  doc.rect(x, y, w, h)

  const nx = x + w - 10
  const ny = y + 10
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.5)
  doc.line(nx, ny + 8, nx, ny)
  doc.line(nx, ny, nx - 3, ny + 3)
  doc.line(nx, ny, nx + 3, ny + 3)
  doc.setFontSize(6)
  doc.setTextColor(30, 41, 59)
  doc.text('N', nx - 1.5, ny - 1)

  if (bbox) {
    const latMid = (bbox.minLat + bbox.maxLat) / 2
    const mPerDegLat = 111_320
    const mPerDegLng = mPerDegLat * Math.cos((latMid * Math.PI) / 180)
    const widthM = (bbox.maxLng - bbox.minLng) * mPerDegLng
    const barM = niceScaleBarMeters(widthM)
    const barMm = (barM / widthM) * w * 0.25
    const bx = x + 8
    const by = y + h - 8
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.6)
    doc.line(bx, by, bx + barMm, by)
    doc.line(bx, by - 1.5, bx, by + 1.5)
    doc.line(bx + barMm, by - 1.5, bx + barMm, by + 1.5)
    doc.setFontSize(6)
    doc.text(barM >= 1000 ? `${(barM / 1000).toFixed(1)} km` : `${Math.round(barM)} m`, bx, by + 4)
  }
}

function niceScaleBarMeters(spanM: number): number {
  const target = spanM * 0.2
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
  for (const s of steps) if (s <= target * 1.2) return s
  return steps[steps.length - 1]!
}
