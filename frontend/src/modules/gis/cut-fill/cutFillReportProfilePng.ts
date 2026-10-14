import { buildCutFillProfileChart, type CutFillProfile } from './cutFillProfile'

function drawPath(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  close: boolean,
): void {
  if (!points.length) return
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (close) ctx.closePath()
}

/** Wide profile strip for Word — matches in-app Cut & Fill profile chart. */
export function renderCutFillProfilePngBase64(
  profile: CutFillProfile,
  width = 780,
  height = 276,
): string | null {
  const chart = buildCutFillProfileChart(profile, width, height)
  if (!chart) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  for (const band of chart.bands) {
    ctx.fillStyle = band.kind === 'cut' ? 'rgba(220, 38, 38, 0.42)' : 'rgba(22, 163, 74, 0.42)'
    drawPath(ctx, band.points, true)
    ctx.fill()
  }
  ctx.strokeStyle = '#44403c'
  ctx.lineWidth = 2
  drawPath(ctx, chart.existing, false)
  ctx.stroke()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 2
  drawPath(ctx, chart.design, false)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '11px Segoe UI, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(chart.yMaxLabel, 4, 12)
  ctx.fillText(chart.yMinLabel, 4, height - 18)
  ctx.fillText('0', 4, height - 4)
  ctx.textAlign = 'right'
  ctx.fillText(chart.xEndLabel, width - 4, height - 4)

  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : null
}
