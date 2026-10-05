import type { Chart, Plugin } from 'chart.js'
import type { DevelopEliteChartsConfig } from './developEliteChartsConfig'
import { DEVELOP_ELITE_CHART_SLICE_FLASH_MS } from './developEliteChartFlash'
import {
  DEVELOP_ELITE_CHART_VALUE_UNIT,
  formatDevelopEliteChartValueWithUnit,
  formatDevelopElitePieCalloutMetricLine,
} from './developEliteChartFormat'
import {
  DEVELOP_ELITE_PIE_CALLOUT_LINE_COLOR,
} from './developEliteCropChartColors'

type PieArcLike = {
  getProps: (props: string[], useFinal?: boolean) => Record<string, number>
}

type BarLike = {
  getProps: (props: string[], useFinal?: boolean) => Record<string, number>
}

type PiePadding = { left: number; right: number; top: number; bottom: number }

export type PieCalloutSlice = {
  label: string
  value: number
  /** Mid-arc angle in radians. */
  midAngle: number
  /** Preferred vertical center, usually the point just outside the slice. */
  preferredY: number
}

export type PieCalloutBox = {
  label: string
  pct: string
  side: 'left' | 'right'
  /** Vertical center of the label block. */
  y: number
  textWidth: number
  midAngle: number
  /** 2 = name above percent. 1 = both on one line when the column is short. */
  lines: 1 | 2
}

const CALLOUT_GAP = 4

function pieFontSize(charts: DevelopEliteChartsConfig): number {
  return Math.max(8, charts.legendFontPx)
}

/** Stack labels on one side so their boxes do not overlap, keeping angular order. */
export function layoutPieCalloutSide(
  preferred: number[],
  top: number,
  bottom: number,
  boxHeight: number,
): number[] | null {
  const order = preferred
    .map((y, index) => ({ y, index }))
    .sort((a, b) => a.y - b.y)
  const n = order.length
  if (n === 0) return []
  const span = bottom - top
  const needed = n * boxHeight + (n - 1) * CALLOUT_GAP
  if (needed > span + 0.5) return null
  const centers = new Array<number>(n)
  let cursor = top
  for (const item of order) {
    const y = Math.max(item.y, cursor + boxHeight / 2)
    centers[item.index] = y
    cursor = y + boxHeight / 2 + CALLOUT_GAP
  }
  const overflow = cursor - CALLOUT_GAP - bottom
  if (overflow > 0) {
    for (let i = 0; i < n; i += 1) centers[order[i]!.index]! -= overflow
  }
  const first = centers[order[0]!.index]!
  if (first - boxHeight / 2 < top - 0.5) return null
  for (let i = 1; i < order.length; i += 1) {
    const prev = centers[order[i - 1]!.index]!
    const next = centers[order[i]!.index]!
    if (next - prev < boxHeight - 0.5) return null
  }
  return centers
}

export function layoutPieCallouts(
  slices: PieCalloutSlice[],
  total: number,
  bounds: { top: number; bottom: number; boxHeight: number },
  textWidth: (text: string) => number,
  valueUnit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): PieCalloutBox[] {
  const draft: Array<PieCalloutBox & { preferredY: number }> = []
  for (const slice of slices) {
    if (slice.value <= 0 || !slice.label) continue
    const side: 'left' | 'right' = Math.cos(slice.midAngle) >= 0 ? 'right' : 'left'
    const pct = formatDevelopElitePieCalloutMetricLine(slice.value, total, valueUnit)
    draft.push({
      label: slice.label,
      pct,
      side,
      y: 0,
      textWidth: Math.max(textWidth(slice.label), textWidth(pct)),
      midAngle: slice.midAngle,
      preferredY: slice.preferredY,
      lines: 2,
    })
  }
  for (const side of ['left', 'right'] as const) {
    const group = draft.filter(item => item.side === side)
    const preferred = group.map(item => item.preferredY)
    const twoLine = layoutPieCalloutSide(preferred, bounds.top, bounds.bottom, bounds.boxHeight)
    const oneLineHeight = Math.max(10, Math.round(bounds.boxHeight * 0.46))
    const centers =
      twoLine ??
      layoutPieCalloutSide(preferred, bounds.top, bounds.bottom, oneLineHeight) ??
      group.map((_, index) => {
        const span = Math.max(oneLineHeight, bounds.bottom - bounds.top)
        const step = group.length === 1 ? 0 : (span - oneLineHeight) / (group.length - 1)
        return bounds.top + oneLineHeight / 2 + index * step
      })
    const lines: 1 | 2 = twoLine ? 2 : 1
    group.forEach((item, index) => {
      item.y = centers[index] ?? item.preferredY
      item.lines = lines
    })
  }
  return draft.map(({ preferredY: _preferred, ...box }) => box)
}

function paddingRecord(value: unknown): PiePadding | null {
  if (!value || typeof value !== 'object') return null
  const pad = value as Partial<PiePadding>
  if (
    typeof pad.left !== 'number' ||
    typeof pad.right !== 'number' ||
    typeof pad.top !== 'number' ||
    typeof pad.bottom !== 'number'
  ) {
    return null
  }
  return { left: pad.left, right: pad.right, top: pad.top, bottom: pad.bottom }
}

/**
 * Tall canvases keep a large circle and leave a top and bottom band tall enough
 * for one full name per line. Wide canvases keep side gutters instead.
 */
export function pieCalloutPaddingForSize(
  width: number,
  height: number,
  sliceCount = 6,
  fontSize = 8,
): PiePadding {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const tall = h > w
  if (!tall) {
    const pie = Math.round(Math.min(w, h) * 0.74)
    return {
      left: Math.max(8, Math.floor((w - pie) / 2)),
      right: Math.max(8, Math.floor((w - pie) / 2)),
      top: Math.max(10, Math.floor((h - pie) / 2)),
      bottom: Math.max(10, Math.floor((h - pie) / 2)),
    }
  }
  const line = fontSize + 2
  const perColumn = Math.max(1, Math.ceil(Math.max(1, sliceCount) / 2))
  const needed = perColumn * line + Math.max(0, perColumn - 1) * CALLOUT_GAP
  const band = needed + 12
  const pie = Math.max(48, Math.min(w - 12, h - band * 2))
  const side = Math.max(6, Math.floor((w - pie) / 2))
  const vertical = Math.max(band, Math.floor((h - pie) / 2))
  return { left: side, right: side, top: vertical, bottom: vertical }
}

function pieCalloutPadding(chart: Chart<'pie'>, charts: DevelopEliteChartsConfig): PiePadding {
  const values = (chart.data.datasets[0]?.data ?? []) as number[]
  const labels = chart.data.labels ?? []
  const sliceCount = values.filter((value, index) => Number(value) > 0 && labels[index]).length
  return pieCalloutPaddingForSize(
    chart.width || 240,
    chart.height || 240,
    sliceCount || 1,
    pieFontSize(charts),
  )
}

type PieAnchor = { x: number; y: number; r: number; cx: number; cy: number }

function drawPieBandCallouts(
  ctx: CanvasRenderingContext2D,
  charts: DevelopEliteChartsConfig,
  slices: PieCalloutSlice[],
  anchors: PieAnchor[],
  total: number,
  fontSize: number,
  canvasWidth: number,
  canvasHeight: number,
  pieTop: number,
  pieBottom: number,
  measure: (text: string) => number,
  valueUnit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): void {
  const boxHeight = fontSize + 2
  const edge = 4
  const items = slices.map((slice, index) => ({
    index,
    band: (Math.sin(slice.midAngle) >= 0 ? 'bottom' : 'top') as 'top' | 'bottom',
    col: (Math.cos(slice.midAngle) >= 0 ? 'right' : 'left') as 'left' | 'right',
    line: `${slice.label}  ${formatDevelopElitePieCalloutMetricLine(slice.value, total, valueUnit)}`,
    midAngle: slice.midAngle,
  }))

  ctx.save()
  ctx.fillStyle = charts.tickColor
  ctx.strokeStyle = DEVELOP_ELITE_PIE_CALLOUT_LINE_COLOR
  ctx.lineWidth = 1
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${fontSize}px ${charts.fontFamily}`

  for (const band of ['top', 'bottom'] as const) {
    for (const col of ['left', 'right'] as const) {
      const group = items.filter(item => item.band === band && item.col === col)
      if (!group.length) continue
      const bandTop = band === 'top' ? edge : pieBottom + 8
      const bandBottom = band === 'top' ? pieTop - 8 : canvasHeight - edge
      const preferred = group.map((_, index) => {
        const span = Math.max(boxHeight, bandBottom - bandTop)
        const step = group.length === 1 ? 0 : (span - boxHeight) / (group.length - 1)
        return bandTop + boxHeight / 2 + index * step
      })
      const fitted = layoutPieCalloutSide(preferred, bandTop, bandBottom, boxHeight)
      const centers = fitted ?? preferred
      group.forEach((item, index) => {
        const anchor = anchors[item.index]
        const y = centers[index] ?? (bandTop + bandBottom) / 2
        if (!anchor) return
        const width = measure(item.line)
        const textX = col === 'right' ? canvasWidth - edge : edge
        const textLeft = col === 'right' ? textX - width : textX
        const textRight = textLeft + width
        const sx = anchor.cx + Math.cos(item.midAngle) * (anchor.r + 6)
        const sy = anchor.cy + Math.sin(item.midAngle) * (anchor.r + 6)
        const elbowY = band === 'top'
          ? Math.min(bandBottom, y + boxHeight / 2 + 3)
          : Math.max(bandTop, y - boxHeight / 2 - 3)
        const stubX = col === 'right' ? textLeft - 6 : textRight + 6
        ctx.beginPath()
        ctx.moveTo(anchor.x, anchor.y)
        ctx.lineTo(sx, sy)
        ctx.lineTo(sx, elbowY)
        ctx.lineTo(stubX, elbowY)
        ctx.stroke()
        ctx.textAlign = col === 'right' ? 'right' : 'left'
        ctx.fillText(item.line, textX, y)
      })
    }
  }
  ctx.restore()
}

export function createDevelopElitePieCalloutPlugin(
  charts: DevelopEliteChartsConfig,
  valueUnit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): Plugin<'pie'> {
  return {
    id: 'developElitePieCallouts',
    beforeLayout(chart) {
      const next = pieCalloutPadding(chart, charts)
      const layout = chart.options.layout ?? {}
      const prev = paddingRecord(layout.padding)
      if (
        prev &&
        prev.left === next.left &&
        prev.right === next.right &&
        prev.top === next.top &&
        prev.bottom === next.bottom
      ) {
        return
      }
      chart.options.layout = { ...layout, padding: next }
    },
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return

      const values = (data.datasets[0]?.data ?? []) as number[]
      const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0)
      if (total <= 0) return

      const fontSize = pieFontSize(charts)
      const lineGap = fontSize + 3
      const boxHeight = lineGap * 2 + 2
      const canvasHeight = chart.height
      const canvasWidth = chart.width

      const slices: PieCalloutSlice[] = []
      const anchors: Array<{ x: number; y: number; r: number; cx: number; cy: number }> = []
      meta.data.forEach((arc, index) => {
        const value = Number(values[index]) || 0
        const label = String(data.labels?.[index] ?? '')
        if (value <= 0 || !label) return
        const props = (arc as PieArcLike).getProps(
          ['startAngle', 'endAngle', 'outerRadius', 'x', 'y'],
          true,
        )
        const midAngle = (props.startAngle + props.endAngle) / 2
        slices.push({
          label,
          value,
          midAngle,
          preferredY: props.y + Math.sin(midAngle) * (props.outerRadius + 14),
        })
        anchors.push({
          x: props.x + Math.cos(midAngle) * props.outerRadius,
          y: props.y + Math.sin(midAngle) * props.outerRadius,
          r: props.outerRadius,
          cx: props.x,
          cy: props.y,
        })
      })
      if (!slices.length) return

      const measure = (text: string) => {
        ctx.font = `600 ${fontSize}px ${charts.fontFamily}`
        return ctx.measureText(text).width
      }
      const pieTop = Math.min(...anchors.map(anchor => anchor.cy - anchor.r))
      const pieBottom = Math.max(...anchors.map(anchor => anchor.cy + anchor.r))
      const bandRoom = Math.min(pieTop, canvasHeight - pieBottom)
      if (canvasHeight > canvasWidth && bandRoom >= 28) {
        drawPieBandCallouts(
          ctx,
          charts,
          slices,
          anchors,
          total,
          fontSize,
          canvasWidth,
          canvasHeight,
          pieTop,
          pieBottom,
          measure,
          valueUnit,
        )
        return
      }
      const boxes = layoutPieCallouts(
        slices,
        total,
        { top: 4, bottom: canvasHeight - 4, boxHeight },
        measure,
        valueUnit,
      )

      const edge = 4
      const boxWidth = (box: (typeof boxes)[number]) =>
        box.lines === 1 ? measure(`${box.label}  ${box.pct}`) : box.textWidth
      const leftCol = boxes.reduce(
        (max, box) => (box.side === 'left' ? Math.max(max, boxWidth(box)) : max),
        0,
      )
      const rightCol = boxes.reduce(
        (max, box) => (box.side === 'right' ? Math.max(max, boxWidth(box)) : max),
        0,
      )
      const leftRail = edge + leftCol + 8
      const rightRail = canvasWidth - edge - rightCol - 8

      ctx.save()
      ctx.fillStyle = charts.tickColor
      ctx.strokeStyle = DEVELOP_ELITE_PIE_CALLOUT_LINE_COLOR
      ctx.lineWidth = 1
      ctx.textBaseline = 'middle'

      boxes.forEach((box, index) => {
        const anchor = anchors[index]
        if (!anchor) return
        const width = boxWidth(box)
        const textX = box.side === 'right' ? canvasWidth - edge : edge
        const textInner = box.side === 'right' ? textX - width : textX + width
        const railX = box.side === 'right' ? rightRail : leftRail
        const stubX = box.side === 'right' ? textInner - 3 : textInner + 3
        const sx = anchor.cx + Math.cos(box.midAngle) * (anchor.r + 6)
        const sy = anchor.cy + Math.sin(box.midAngle) * (anchor.r + 6)
        const elbowX = box.side === 'right' ? Math.min(railX, stubX) : Math.max(railX, stubX)

        ctx.beginPath()
        ctx.moveTo(anchor.x, anchor.y)
        ctx.lineTo(sx, sy)
        ctx.lineTo(elbowX, sy)
        ctx.lineTo(elbowX, box.y)
        ctx.lineTo(stubX, box.y)
        ctx.stroke()

        ctx.textAlign = box.side === 'right' ? 'right' : 'left'
        if (box.lines === 1) {
          ctx.font = `500 ${fontSize}px ${charts.fontFamily}`
          ctx.fillText(`${box.label}  ${box.pct}`, textX, box.y)
          return
        }
        ctx.font = `500 ${fontSize}px ${charts.fontFamily}`
        ctx.fillText(box.label, textX, box.y - lineGap / 2)
        ctx.font = `600 ${fontSize}px ${charts.fontFamily}`
        ctx.fillText(box.pct, textX, box.y + lineGap / 2)
      })

      ctx.restore()
    },
  }
}

/** Fills Chart.js canvas (transparent by default) with dashboard dark green. */
export function createDevelopEliteChartCanvasBgPlugin(fillColor: string): Plugin {
  return {
    id: 'developEliteChartCanvasBg',
    beforeDraw(chart) {
      const { ctx } = chart
      const w = chart.width
      const h = chart.height
      if (w <= 0 || h <= 0) return
      ctx.save()
      ctx.fillStyle = fillColor
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    },
  }
}

export function createDevelopEliteBarValuePlugin(
  charts: DevelopEliteChartsConfig,
  valueUnit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): Plugin<'bar'> {
  return {
    id: 'developEliteBarValues',
    afterDatasetsDraw(chart: Chart<'bar'>) {
      const { ctx, data } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return

      const dataset = data.datasets[0]
      const values = (dataset?.data ?? []) as number[]
      const fontSize = Math.max(8, charts.axisFontPx)
      ctx.save()
      ctx.font = `600 ${fontSize}px ${charts.fontFamily}`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = charts.labelColor || '#ffffff'

      meta.data.forEach((bar, index) => {
        const value = Number(values[index]) || 0
        if (value <= 0) return
        const props = (bar as BarLike).getProps(['x', 'y', 'base', 'width', 'height'], true)
        const endX = props.x
        const y = props.y
        const label = formatDevelopEliteChartValueWithUnit(value, valueUnit)
        const labelX = endX + 8
        ctx.textAlign = 'left'
        ctx.fillText(label, labelX, y)
      })

      ctx.restore()
    },
  }
}

function findChartLabelIndex(chart: Chart, label: string): number {
  const labels = chart.data.labels ?? []
  return labels.findIndex(entry => String(entry) === label)
}

/** Pulsing yellow outline + light fill on the pie slice / bar that matches the flashed crop. */
export function createDevelopEliteChartSliceFlashPlugin(
  highlightLabel: string | null,
  flashStartedAt: number,
): Plugin {
  return {
    id: 'developEliteChartSliceFlash',
    afterDatasetsDraw(chart) {
      if (!highlightLabel || flashStartedAt <= 0) return
      const elapsed = performance.now() - flashStartedAt
      if (elapsed > DEVELOP_ELITE_CHART_SLICE_FLASH_MS) return

      const index = findChartLabelIndex(chart, highlightLabel)
      if (index < 0) return
      const meta = chart.getDatasetMeta(0)
      const element = meta.data[index]
      if (!element) return

      const phase = (elapsed % 450) / 450
      const pulse = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2))
      const { ctx } = chart
      ctx.save()
      ctx.shadowColor = `rgba(253, 224, 71, ${0.28 + 0.35 * pulse})`
      ctx.shadowBlur = 6 + 12 * pulse

      if (chart.config.type === 'pie') {
        const props = (element as PieArcLike).getProps(
          ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
          true,
        )
        const innerR = props.innerRadius ?? 0
        ctx.fillStyle = `rgba(253, 224, 71, ${0.1 + 0.14 * pulse})`
        ctx.beginPath()
        ctx.arc(props.x, props.y, props.outerRadius, props.startAngle, props.endAngle)
        ctx.arc(props.x, props.y, innerR, props.endAngle, props.startAngle, true)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = `rgba(250, 204, 21, ${0.72 + 0.28 * pulse})`
        ctx.lineWidth = 2.5 + 2 * pulse
        ctx.beginPath()
        ctx.arc(
          props.x,
          props.y,
          props.outerRadius + 3 + 5 * pulse,
          props.startAngle,
          props.endAngle,
        )
        ctx.stroke()
      } else if (chart.config.type === 'bar') {
        const props = (element as BarLike).getProps(['x', 'y', 'base', 'width', 'height'], true)
        const left = Math.min(props.base, props.x)
        const right = Math.max(props.base, props.x)
        const top = props.y - props.height / 2 - 3 - 2 * pulse
        const bottom = props.y + props.height / 2 + 3 + 2 * pulse
        const w = right - left + 4
        const h = bottom - top

        ctx.fillStyle = `rgba(253, 224, 71, ${0.08 + 0.12 * pulse})`
        ctx.fillRect(left - 2, top, w, h)

        ctx.strokeStyle = `rgba(250, 204, 21, ${0.75 + 0.25 * pulse})`
        ctx.lineWidth = 2 + 1.5 * pulse
        ctx.strokeRect(left - 2, top, w, h)
      }

      ctx.restore()
      if (elapsed < DEVELOP_ELITE_CHART_SLICE_FLASH_MS) {
        requestAnimationFrame(() => chart.draw())
      }
    },
  }
}
