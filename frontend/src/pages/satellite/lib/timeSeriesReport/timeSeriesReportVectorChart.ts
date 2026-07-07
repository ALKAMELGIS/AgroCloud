import type jsPDF from 'jspdf'

const CHART_COLORS: [number, number, number][] = [
  [16, 185, 129],
  [59, 130, 246],
  [245, 158, 11],
  [167, 139, 250],
]

type Series = { layerId: string; values: number[] }

export function drawVectorTimeSeriesChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  series: Series[],
  title: string,
): void {
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(title, x + 3, y + 5)

  const padL = 14
  const padR = 4
  const padT = 10
  const padB = 12
  const plotX = x + padL
  const plotY = y + padT
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  if (!labels.length || !series.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text('No chart data', plotX, plotY + plotH / 2)
    return
  }

  const finiteVals = series.flatMap(s => s.values.filter(v => Number.isFinite(v)))
  let yMin = finiteVals.length ? Math.min(...finiteVals) : 0
  let yMax = finiteVals.length ? Math.max(...finiteVals) : 1
  if (yMax - yMin < 0.02) {
    yMin -= 0.05
    yMax += 0.05
  } else {
    const pad = (yMax - yMin) * 0.08
    yMin -= pad
    yMax += pad
  }

  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.15)
  for (let i = 0; i <= 4; i++) {
    const gy = plotY + (plotH * i) / 4
    doc.line(plotX, gy, plotX + plotW, gy)
    const val = yMax - ((yMax - yMin) * i) / 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(100, 116, 139)
    doc.text(val.toFixed(2), x + 2, gy + 1)
  }

  doc.setDrawColor(148, 163, 184)
  doc.line(plotX, plotY, plotX, plotY + plotH)
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH)

  const n = labels.length
  series.slice(0, 4).forEach((entry, seriesIndex) => {
    const color = CHART_COLORS[seriesIndex % CHART_COLORS.length]!
    doc.setDrawColor(color[0], color[1], color[2])
    doc.setLineWidth(0.55)

    let started = false
    let prevX = 0
    let prevY = 0

    for (let i = 0; i < n; i++) {
      const v = entry.values[i]
      if (v == null || !Number.isFinite(v)) {
        started = false
        continue
      }
      const px = plotX + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1))
      const py = plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH
      if (started) doc.line(prevX, prevY, px, py)
      doc.setFillColor(color[0], color[1], color[2])
      doc.circle(px, py, 0.7, 'F')
      prevX = px
      prevY = py
      started = true
    }
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  if (labels.length >= 2) {
    doc.text(labels[0]!.slice(0, 10), plotX, y + h - 2)
    doc.text(labels[labels.length - 1]!.slice(0, 10), plotX + plotW, y + h - 2, { align: 'right' })
  }

  let lx = x + 3
  const ly = y + 7.5
  series.slice(0, 4).forEach((entry, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length]!
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(lx, ly - 2, 3, 1.2, 'F')
    doc.setTextColor(71, 85, 105)
    doc.text(entry.layerId, lx + 4, ly)
    lx += doc.getTextWidth(entry.layerId) + 10
  })
}
