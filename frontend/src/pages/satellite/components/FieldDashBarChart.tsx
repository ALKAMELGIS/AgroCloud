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
  formatValue?: (v: number) => string
  expanded?: boolean
  fluid?: boolean
  height?: number
  width?: number
}

const PAD_L = 30
const PAD_R = 6
const PAD_T = 8
const PAD_B = 34

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

type HoverTip = { label: string; value: string; x: number; y: number }

export function FieldDashBarChart({
  rows,
  ariaLabel,
  yLabel = '',
  color = '#1976d2',
  formatValue = defaultFormat,
  expanded = false,
  fluid = true,
  height,
  width,
}: FieldDashBarChartProps) {
  const [hover, setHover] = useState<HoverTip | null>(null)

  const H = height ?? (expanded ? 168 : 132)
  const slotW = expanded ? 30 : 24
  const baseW = width ?? (expanded ? 320 : 260)
  const W = Math.max(baseW, PAD_L + PAD_R + rows.length * slotW)

  const geometry = useMemo(() => {
    if (!rows.length) return null
    const maxVal = Math.max(1, ...rows.map(r => r.value))
    const yTicks = niceTicks(maxVal, 4)
    const yHi = yTicks[yTicks.length - 1]!
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const slot = plotW / rows.length
    const barW = Math.max(6, Math.min(22, slot * 0.62))

    const sy = (v: number) => PAD_T + plotH - (v / yHi) * plotH

    const bars = rows.map((row, i) => {
      const cx = PAD_L + slot * i + slot / 2
      const yTop = sy(row.value)
      const yBase = sy(0)
      return {
        ...row,
        cx,
        x: cx - barW / 2,
        y: yTop,
        w: barW,
        h: Math.max(0, yBase - yTop),
        tickLabel: abbrevBarLabel(row.label),
      }
    })

    return { yTicks, yHi, plotH, bars, slot }
  }, [rows, W, H])

  if (!rows.length || !geometry) {
    return <p className="si-field-dash__empty">No data</p>
  }

  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const svgY = ((e.clientY - rect.top) / rect.height) * H
    const hit = geometry.bars.find(
      b => svgX >= b.x && svgX <= b.x + b.w && svgY >= b.y && svgY <= PAD_T + geometry.plotH,
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
    })
  }

  const scrollable = rows.length > (expanded ? 10 : 7)

  return (
    <div
      className={`si-field-dash__vbar${scrollable ? ' si-field-dash__vbar--scroll' : ''}`}
    >
      <svg
        className="si-field-dash__vbar-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        style={fluid ? { height: H, width: scrollable ? W : '100%' } : { height: H, width: W }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <rect
          className="si-field-dash__vbar-bg"
          x={PAD_L}
          y={PAD_T}
          width={W - PAD_L - PAD_R}
          height={H - PAD_T - PAD_B}
          rx={4}
        />
        {geometry.yTicks.map(tick => {
          const y = PAD_T + geometry.plotH - (tick / geometry.yHi) * geometry.plotH
          return (
            <g key={tick}>
              <line
                className="si-field-dash__vbar-grid"
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
              />
              <text className="si-field-dash__vbar-ytick" x={PAD_L - 4} y={y + 3} textAnchor="end">
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
              fill={color}
              opacity={hover?.label === bar.label ? 1 : 0.88}
            />
            <title>
              {bar.label}: {formatValue(bar.value)}
            </title>
            <text
              className="si-field-dash__vbar-tick"
              x={bar.cx}
              y={H - 8}
              textAnchor="end"
              transform={`rotate(-38 ${bar.cx} ${H - 8})`}
            >
              {bar.tickLabel}
            </text>
          </g>
        ))}
        <line
          className="si-field-dash__vbar-axis"
          x1={PAD_L}
          y1={PAD_T + geometry.plotH}
          x2={W - PAD_R}
          y2={PAD_T + geometry.plotH}
        />
        {yLabel ? (
          <text className="si-field-dash__vbar-ylabel" x={8} y={PAD_T + 10}>
            {yLabel}
          </text>
        ) : null}
      </svg>
      {hover ? (
        <div
          className="si-field-dash__vbar-tip"
          style={{ left: `${hover.x}%`, top: `${hover.y}%` }}
        >
          <strong>{hover.label}</strong>
          <span>{hover.value}</span>
        </div>
      ) : null}
    </div>
  )
}
