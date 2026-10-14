/**
 * Compact vertical bar chart for the field attributes dashboard.
 */

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

export type FieldDashBarRow = { label: string; value: number }

export type FieldDashBarChartProps = {
  rows: FieldDashBarRow[]
  ariaLabel: string
  yLabel?: string
  color?: string
  /** Per-bar fill; falls back to `color` when omitted or shorter than `rows`. */
  barColors?: string[]
  formatValue?: (v: number) => string
  /** Match ValidationLinePlot chrome (AOI training cards). */
  skin?: 'field-dash' | 'afbv'
  expanded?: boolean
  fluid?: boolean
  height?: number
  width?: number
  /** Category tick layout; `auto` prefers horizontal when bars have enough slot width or chart is expanded. */
  xTickLayout?: 'auto' | 'horizontal' | 'rotated'
  /** Extra width + horizontal scroll so each category label fits (e.g. many fields). */
  categoryScroll?: boolean
}

const PAD_R_FIELD = 6
const PAD_T_FIELD = 8
const PAD_B_FIELD_ROTATED = 34
const PAD_B_FIELD_HORIZONTAL = 28
const PAD_L_FIELD = 30

const PAD_R_AFBV = 8
const PAD_T_AFBV = 10
const PAD_B_AFBV = 28
const PAD_L_AFBV_MIN = 34

function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const raw = max / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const ticks: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) {
    ticks.push(Number(v.toFixed(6)))
  }
  return ticks.length ? ticks : [0, max]
}

function defaultFormat(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function abbrevBarLabel(label: string): string {
  const fieldMatch = /^Field\s+(\d+)$/i.exec(label.trim())
  if (fieldMatch) return `F${fieldMatch[1]}`
  if (label.length <= 10) return label
  return `${label.slice(0, 9)}…`
}

function padLeftForYTicks(yTicks: number[], formatValue: (v: number) => string): number {
  const maxChars = Math.max(0, ...yTicks.map(t => formatValue(t).length))
  return Math.max(PAD_L_AFBV_MIN, 22 + maxChars * 4.8)
}

/** Rough width for horizontal SVG tick text (~9px). */
function estimateHorizontalTickWidth(label: string): number {
  return label.length * 5.15
}

function horizontalLabelsFit(labels: string[], slot: number): boolean {
  if (!labels.length || slot <= 0) return true
  const maxW = Math.max(...labels.map(estimateHorizontalTickWidth))
  return maxW <= slot * 0.9
}

function minHorizontalCategorySlot(labels: string[]): number {
  const display = labels.map(abbrevBarLabel)
  const maxW = Math.max(0, ...display.map(estimateHorizontalTickWidth))
  return Math.max(38, Math.ceil(maxW / 0.88))
}

function resolveXTickLayout(
  mode: 'auto' | 'horizontal' | 'rotated',
  expanded: boolean,
  slot: number,
  labels: string[],
): 'horizontal' | 'rotated' {
  if (mode === 'rotated') return 'rotated'
  const display = labels.map(abbrevBarLabel)
  const fits = horizontalLabelsFit(display, slot)
  if (mode === 'horizontal') return fits ? 'horizontal' : 'rotated'
  if (fits && (expanded || slot >= 22)) return 'horizontal'
  return 'rotated'
}

function categoryTickLabel(label: string, layout: 'horizontal' | 'rotated'): string {
  if (layout === 'horizontal') return abbrevBarLabel(label)
  if (label.length <= 20) return label
  return `${label.slice(0, 18)}…`
}

function bottomPadForXLabels(
  layout: 'horizontal' | 'rotated',
  maxTickChars: number,
): number {
  if (layout === 'horizontal') return PAD_B_FIELD_HORIZONTAL
  return Math.max(PAD_B_FIELD_ROTATED, 22 + maxTickChars * 4.2)
}

function shouldShowHorizontalXTick(index: number, total: number, slot: number): boolean {
  if (slot >= 22) return true
  if (slot >= 16) return index % 2 === 0 || index === total - 1
  if (slot >= 12) return index % 3 === 0 || index === total - 1
  return index === 0 || index === total - 1
}

type HoverTip = { label: string; value: string; x: number; y: number; flip: boolean }

export function FieldDashBarChart({
  rows,
  ariaLabel,
  yLabel = '',
  color = '#1976d2',
  barColors,
  formatValue = defaultFormat,
  skin = 'field-dash',
  expanded = false,
  fluid = true,
  height,
  width,
  xTickLayout = 'auto',
  categoryScroll = false,
}: FieldDashBarChartProps) {
  const [hover, setHover] = useState<HoverTip | null>(null)
  const isAfbv = skin === 'afbv'

  const H = height ?? (expanded ? (isAfbv ? 172 : 168) : isAfbv ? 156 : 132)
  const baseW = width ?? (expanded ? 320 : 260)

  const layout = useMemo(() => {
    if (!rows.length) return null

    const maxVal = Math.max(1, ...rows.map(r => r.value))
    const yTicks = niceTicks(maxVal, 4)
    const yHi = yTicks[yTicks.length - 1]!
    const padL = isAfbv ? padLeftForYTicks(yTicks, formatValue) : PAD_L_FIELD
    const padR = isAfbv ? PAD_R_AFBV : PAD_R_FIELD
    const padT = isAfbv ? PAD_T_AFBV : PAD_T_FIELD
    const labels = rows.map(r => r.label)
    const defaultSlot = expanded ? 30 : 24

    let xLayout: 'horizontal' | 'rotated'
    let W: number
    let scrollable: boolean

    if (categoryScroll && !isAfbv) {
      xLayout = 'horizontal'
      const minSlot = minHorizontalCategorySlot(labels)
      const contentW = padL + padR + rows.length * minSlot
      W = Math.max(baseW, contentW)
      scrollable = contentW > baseW - 1 || rows.length > 4
    } else {
      scrollable = false
      W = Math.max(baseW, padL + padR + rows.length * defaultSlot)
      let slot0 = (W - padL - padR) / rows.length
      xLayout = isAfbv
        ? 'horizontal'
        : resolveXTickLayout(xTickLayout, expanded, slot0, labels)

      if (xLayout === 'horizontal' && !isAfbv) {
        const minSlot = minHorizontalCategorySlot(labels)
        const contentW = padL + padR + rows.length * minSlot
        if (contentW > W - 0.5) {
          W = contentW
          slot0 = minSlot
          scrollable = true
        }
      }

      if (!scrollable) {
        scrollable = rows.length > (expanded ? 10 : 7) || W > baseW + 4
      }
    }

    const maxTickChars = Math.max(
      1,
      ...rows.map(r =>
        xLayout === 'horizontal' ? abbrevBarLabel(r.label).length : categoryTickLabel(r.label, xLayout).length,
      ),
    )
    const padB = isAfbv ? PAD_B_AFBV : bottomPadForXLabels(xLayout, maxTickChars)
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const slot = plotW / rows.length
    const barW = Math.max(6, Math.min(isAfbv ? 26 : 22, slot * 0.52))

    const sy = (v: number) => padT + plotH - (v / yHi) * plotH
    const yBase = sy(0)

    const bars = rows.map((row, i) => {
      const cx = padL + slot * i + slot / 2
      const yTop = sy(row.value)
      return {
        ...row,
        cx,
        x: cx - barW / 2,
        y: yTop,
        w: barW,
        h: Math.max(0, yBase - yTop),
        tickLabel: categoryTickLabel(row.label, xLayout),
        showXTick:
          xLayout === 'rotated' ||
          scrollable ||
          shouldShowHorizontalXTick(i, rows.length, slot),
        fill: barColors?.[i] ?? color,
      }
    })

    return {
      geometry: { yTicks, yHi, plotH, bars, slot, padL, padR, padT, padB, yBase, xLayout },
      W,
      scrollable,
    }
  }, [rows, H, isAfbv, formatValue, color, barColors, xTickLayout, expanded, baseW, categoryScroll])

  if (!layout) {
    return <p className="si-field-dash__empty">No data</p>
  }

  const { geometry, W, scrollable } = layout
  const { padL, padR, padT, padB, plotH, yBase, xLayout } = geometry

  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const svgY = ((e.clientY - rect.top) / rect.height) * H
    const hit = geometry.bars.find(
      b => svgX >= b.x && svgX <= b.x + b.w && svgY >= b.y && svgY <= padT + plotH,
    )
    if (!hit) {
      setHover(null)
      return
    }
    setHover({
      label: hit.label,
      value: formatValue(hit.value),
      x: (hit.cx / W) * 100,
      y: (hit.y / H) * 100,
      flip: hit.cx > W * 0.58,
    })
  }

  const svgStyle = fluid
    ? { height: H, width: scrollable ? W : '100%', minWidth: scrollable ? W : undefined }
    : { height: H, width: W }

  const tip = hover ? (
    isAfbv ? (
      <div
        className={`si-afbv__figure-tip${hover.flip ? ' is-flip' : ''}`}
        style={{ left: `${hover.x}%`, top: `${hover.y}%` }}
      >
        <div className="si-afbv__figure-tip__x">{hover.label}</div>
        <ul className="si-afbv__figure-tip__list">
          <li>
            <span className="si-afbv__figure-tip__swatch" style={{ background: geometry.bars.find(b => b.label === hover.label)?.fill }} />
            <span className="si-afbv__figure-tip__label">Samples</span>
            <strong>{hover.value}</strong>
          </li>
        </ul>
      </div>
    ) : (
      <div
        className="si-field-dash__vbar-tip"
        style={{ left: `${hover.x}%`, top: `${hover.y}%` }}
      >
        <strong>{hover.label}</strong>
        <span>{hover.value}</span>
      </div>
    )
  ) : null

  if (isAfbv) {
    return (
      <div className="si-afbv__figure-wrap">
        <svg
          className="si-afbv__figure si-afbv__figure--vbar"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          style={svgStyle}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <rect x="0" y="0" width={W} height={H} className="si-afbv__figure-bg" />

          {geometry.yTicks.map(tick => {
            const y = padT + plotH - (tick / geometry.yHi) * plotH
            return (
              <line
                key={`gy-${tick}`}
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                className="si-afbv__figure-grid"
              />
            )
          })}

          {geometry.yTicks.map(tick => {
            const y = padT + plotH - (tick / geometry.yHi) * plotH
            return (
              <g key={`yt-${tick}`}>
                <line x1={padL - 3} x2={padL} y1={y} y2={y} className="si-afbv__spine" />
                <text x={padL - 5} y={y + 2.8} className="si-afbv__figure-tick" textAnchor="end">
                  {formatValue(tick)}
                </text>
              </g>
            )
          })}

          <line x1={padL} x2={padL} y1={padT} y2={H - padB} className="si-afbv__spine" />
          <line x1={padL} x2={W - padR} y1={yBase} y2={yBase} className="si-afbv__spine" />

          {geometry.bars.map(bar => (
            <g key={bar.label}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={2}
                fill={bar.fill}
                opacity={hover?.label === bar.label ? 1 : 0.92}
              />
              <title>
                {bar.label}: {formatValue(bar.value)}
              </title>
              <line
                x1={bar.cx}
                x2={bar.cx}
                y1={yBase}
                y2={yBase + 3}
                className="si-afbv__spine"
              />
              <text
                x={bar.cx}
                y={H - padB + 11}
                className="si-afbv__figure-tick"
                textAnchor="middle"
              >
                {bar.tickLabel}
              </text>
            </g>
          ))}
        </svg>
        {tip}
      </div>
    )
  }

  return (
    <div
      className={`si-field-dash__vbar${scrollable ? ' si-field-dash__vbar--scroll' : ''}${xLayout === 'horizontal' ? ' si-field-dash__vbar--x-horizontal' : ''}`}
    >
      <svg
        className="si-field-dash__vbar-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        style={svgStyle}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <rect
          className="si-field-dash__vbar-bg"
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={plotH}
          rx={4}
        />
        {geometry.yTicks.map(tick => {
          const y = padT + plotH - (tick / geometry.yHi) * plotH
          return (
            <g key={tick}>
              <line
                className="si-field-dash__vbar-grid"
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
              />
              <text className="si-field-dash__vbar-ytick" x={padL - 4} y={y + 3} textAnchor="end">
                {formatValue(tick)}
              </text>
            </g>
          )
        })}
        {geometry.bars.map(bar => (
          <g key={bar.label}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx={2}
              fill={bar.fill}
              opacity={hover?.label === bar.label ? 1 : 0.88}
            />
            <title>
              {bar.label}: {formatValue(bar.value)}
            </title>
            {bar.showXTick ? (
              xLayout === 'horizontal' ? (
                <text
                  className="si-field-dash__vbar-tick si-field-dash__vbar-tick--horizontal"
                  x={bar.cx}
                  y={H - padB + 14}
                  textAnchor="middle"
                >
                  {bar.tickLabel}
                </text>
              ) : (
                <text
                  className="si-field-dash__vbar-tick"
                  x={bar.cx}
                  y={yBase + 6}
                  textAnchor="end"
                  transform={`rotate(-42 ${bar.cx} ${yBase + 6})`}
                >
                  {bar.tickLabel}
                </text>
              )
            ) : null}
          </g>
        ))}
        <line
          className="si-field-dash__vbar-axis"
          x1={padL}
          y1={yBase}
          x2={W - padR}
          y2={yBase}
        />
        {yLabel ? (
          <text className="si-field-dash__vbar-ylabel" x={8} y={padT + 10}>
            {yLabel}
          </text>
        ) : null}
      </svg>
      {tip}
    </div>
  )
}
