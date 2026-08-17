/**
 * Publication-style line plot with mouse hover crosshair + value tooltip.
 */

import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export type PlotPoint = { x: number; y: number }

export type PlotSeries = {
  id: string
  label: string
  color: string
  points: PlotPoint[]
  dashed?: boolean
  /** Draw a dot on every sample. Overrides the plot-level `markers` flag. */
  markers?: boolean
  /** Print the y value above every sample. */
  valueLabels?: boolean
}

export type PlotAnnotation = {
  x: number
  y?: number
  label: string
}

export type ValidationLinePlotProps = {
  series: PlotSeries[]
  xLabel: string
  yLabel: string
  ariaLabel: string
  /** Categorical / explicit x ticks; numeric ticks are derived when omitted. */
  xTicks?: Array<{ value: number; label: string }>
  yDomain?: [number, number]
  formatY?: (v: number) => string
  formatX?: (v: number) => string
  /** Dashed horizontal guide, e.g. a target score or the class mean. */
  refLine?: { y: number; label?: string } | null
  /** Dashed vertical guide, e.g. the active threshold or best epoch. */
  markerX?: number | null
  /** Callout at a data point, e.g. "Best performance". */
  annotation?: PlotAnnotation | null
  /** Light grid at tick positions (matplotlib look). Default true. */
  grid?: boolean
  /** Draw markers on every series unless a series sets `markers: false`. */
  markers?: boolean
  height?: number
  /** SVG logical width (default 260). Use ~420+ in the Results dashboard. */
  width?: number
}

/** Matplotlib tab10 defaults shared by training / validation charts. */
export const CHART_PALETTE = {
  train: '#1f77b4',
  val: '#ff7f0e',
  loss: '#2ca02c',
  extra: ['#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'] as const,
} as const

const DEFAULT_W = 260
const PAD_L = 34
const PAD_R = 8
const PAD_T = 10
const PAD_B = 28

type HoverTip = {
  x: number
  xLabel: string
  svgX: number
  rows: Array<{ id: string; label: string; color: string; y: number; svgY: number }>
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    const top = Number.isFinite(max) && max > 0 ? max : 1
    return [0, top]
  }
  const raw = (max - min) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Number((Math.round(v / step) * step).toFixed(6)))
  }
  return ticks
}

function defaultFormat(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1)
}

function seriesWantsMarkers(s: PlotSeries, plotMarkers: boolean): boolean {
  if (s.markers === false) return false
  if (s.markers === true) return true
  return plotMarkers
}

function nearestPoint(points: PlotPoint[], x: number): PlotPoint | null {
  if (!points.length) return null
  let best = points[0]!
  let bestDist = Math.abs(best.x - x)
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!
    const d = Math.abs(p.x - x)
    if (d < bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

export function ValidationLinePlot({
  series,
  xLabel,
  yLabel,
  ariaLabel,
  xTicks,
  yDomain,
  formatY = defaultFormat,
  formatX,
  refLine = null,
  markerX = null,
  annotation = null,
  grid = true,
  markers = false,
  height = 156,
  width = DEFAULT_W,
}: ValidationLinePlotProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<HoverTip | null>(null)

  const W = Math.max(180, width)
  const H = height
  const padT = annotation ? 16 : PAD_T
  const pts = series.flatMap(s => s.points)

  const geometry = useMemo(() => {
    if (!pts.length) return null
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    const rawXMin = xTicks?.length ? Math.min(...xTicks.map(t => t.value)) : Math.min(...xs)
    const rawXMax = xTicks?.length ? Math.max(...xTicks.map(t => t.value)) : Math.max(...xs)
    const xPad =
      xTicks && xTicks.length > 1 ? ((rawXMax - rawXMin) / (xTicks.length - 1)) * 0.35 : 0
    const xMin = rawXMin - xPad
    const xMax = rawXMax + xPad
    const xSpan = xMax - xMin || 1

    const dataMin = Math.min(...ys, refLine ? refLine.y : Infinity)
    const dataMax = Math.max(...ys, refLine ? refLine.y : -Infinity)
    const yTicks = yDomain
      ? niceTicks(yDomain[0], yDomain[1], 4)
      : niceTicks(Math.min(0, dataMin), dataMax, 4)
    const yLo = yDomain ? yDomain[0] : yTicks[0]!
    const yHi = yDomain ? yDomain[1] : yTicks[yTicks.length - 1]!
    const ySpan = yHi - yLo || 1

    const sx = (x: number) => PAD_L + ((x - xMin) / xSpan) * (W - PAD_L - PAD_R)
    const sy = (y: number) => H - PAD_B - ((y - yLo) / ySpan) * (H - padT - PAD_B)
    const xFromSvg = (svgX: number) => xMin + ((svgX - PAD_L) / (W - PAD_L - PAD_R || 1)) * xSpan

    const ticksX = xTicks?.length
      ? xTicks
      : niceTicks(rawXMin, rawXMax, 4)
          .filter(v => v >= xMin - 1e-9 && v <= xMax + 1e-9)
          .map(v => ({ value: v, label: defaultFormat(v) }))

    return { rawXMin, rawXMax, xMin, xMax, dataMax, yTicks, yLo, yHi, sx, sy, xFromSvg, ticksX }
  }, [pts, xTicks, yDomain, refLine, W, H, padT])

  const resolveXLabel = useCallback(
    (x: number) => {
      if (formatX) return formatX(x)
      const tick = xTicks?.find(t => Math.abs(t.value - x) < 1e-9)
      if (tick) return tick.label
      return Number.isInteger(x) ? String(x) : defaultFormat(x)
    },
    [formatX, xTicks],
  )

  const onMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (!geometry) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const svgX = ((e.clientX - rect.left) / rect.width) * W
      const svgY = ((e.clientY - rect.top) / rect.height) * H
      if (svgX < PAD_L || svgX > W - PAD_R || svgY < padT || svgY > H - PAD_B) {
        setHover(null)
        return
      }
      const dataX = geometry.xFromSvg(svgX)
      const rows: HoverTip['rows'] = []
      let anchorX: number | null = null
      let bestDist = Infinity
      for (const s of series) {
        const p = nearestPoint(s.points, dataX)
        if (!p) continue
        const d = Math.abs(p.x - dataX)
        if (d < bestDist) {
          bestDist = d
          anchorX = p.x
        }
      }
      if (anchorX == null) {
        setHover(null)
        return
      }
      for (const s of series) {
        const exact = s.points.find(p => Math.abs(p.x - anchorX!) < 1e-9)
        const p = exact ?? nearestPoint(s.points, anchorX)
        if (!p) continue
        rows.push({
          id: s.id,
          label: s.label,
          color: s.color,
          y: p.y,
          svgY: geometry.sy(p.y),
        })
      }
      if (!rows.length) {
        setHover(null)
        return
      }
      setHover({
        x: anchorX,
        xLabel: resolveXLabel(anchorX),
        svgX: geometry.sx(anchorX),
        rows,
      })
    },
    [geometry, series, W, H, padT, resolveXLabel],
  )

  if (!pts.length || !geometry) {
    return (
      <div className="si-afbv__figure-empty" role="img" aria-label={ariaLabel}>
        No analysis points yet — upload a reference / training GeoJSON to compute validation scores.
      </div>
    )
  }

  const { sx, sy, ticksX, yTicks, dataMax } = geometry
  const legendW = Math.max(...series.map(s => s.label.length * 4.1 + 22), 40)
  const legendH = series.length * 10 + 6
  const legendX = W - PAD_R - legendW
  const legendY = padT

  const annY = annotation
    ? annotation.y != null && Number.isFinite(annotation.y)
      ? annotation.y
      : dataMax
    : null
  const annPx = annotation ? sx(annotation.x) : 0
  const annNearRight = annotation ? annPx > W - PAD_R - 72 : false

  const tipLeftPct = hover ? (hover.svgX / W) * 100 : 0
  const tipFlip = hover ? hover.svgX > W * 0.58 : false

  return (
    <div className="si-afbv__figure-wrap">
      <svg
        ref={svgRef}
        className="si-afbv__figure"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        style={{ height, width: '100%', maxWidth: W }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <rect x="0" y="0" width={W} height={H} className="si-afbv__figure-bg" />

        {grid
          ? yTicks.map(t => (
              <line
                key={`gy-${t}`}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={sy(t)}
                y2={sy(t)}
                className="si-afbv__figure-grid"
              />
            ))
          : null}
        {grid
          ? ticksX.map(t => (
              <line
                key={`gx-${t.value}-${t.label}`}
                x1={sx(t.value)}
                x2={sx(t.value)}
                y1={padT}
                y2={H - PAD_B}
                className="si-afbv__figure-grid"
              />
            ))
          : null}

        {yTicks.map(t => (
          <g key={`y-${t}`}>
            <line x1={PAD_L - 3} x2={PAD_L} y1={sy(t)} y2={sy(t)} className="si-afbv__spine" />
            <text x={PAD_L - 5} y={sy(t) + 2.8} className="si-afbv__figure-tick" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
        {ticksX.map(t => (
          <g key={`x-${t.value}-${t.label}`}>
            <line
              x1={sx(t.value)}
              x2={sx(t.value)}
              y1={H - PAD_B}
              y2={H - PAD_B + 3}
              className="si-afbv__spine"
            />
            <text
              x={sx(t.value)}
              y={H - PAD_B + 10}
              className="si-afbv__figure-tick"
              textAnchor="middle"
            >
              {t.label}
            </text>
          </g>
        ))}

        <line x1={PAD_L} x2={PAD_L} y1={padT} y2={H - PAD_B} className="si-afbv__spine" />
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} className="si-afbv__spine" />

        {refLine ? (
          <>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={sy(refLine.y)}
              y2={sy(refLine.y)}
              className="si-afbv__figure-ref"
            />
            {refLine.label ? (
              <text x={PAD_L + 3} y={sy(refLine.y) - 3} className="si-afbv__figure-note">
                {refLine.label}
              </text>
            ) : null}
          </>
        ) : null}

        {markerX != null ? (
          <line
            x1={sx(markerX)}
            x2={sx(markerX)}
            y1={padT}
            y2={H - PAD_B}
            className="si-afbv__figure-marker"
          />
        ) : null}

        {series.map(s => {
          const drawMarkers = seriesWantsMarkers(s, markers)
          return (
            <g key={s.id}>
              <path
                d={s.points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth="1.3"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '4 2' : undefined}
              />
              {drawMarkers
                ? s.points.map(p => (
                    <circle
                      key={`${s.id}-m-${p.x}`}
                      className="si-afbv__figure-dot"
                      cx={sx(p.x)}
                      cy={sy(p.y)}
                      r="1.7"
                      fill={s.color}
                    />
                  ))
                : null}
              {s.valueLabels
                ? s.points.map(p => (
                    <text
                      key={`${s.id}-v-${p.x}`}
                      x={sx(p.x)}
                      y={sy(p.y) - 4}
                      className="si-afbv__figure-value"
                      textAnchor="middle"
                      fill={s.color}
                    >
                      {formatY(p.y)}
                    </text>
                  ))
                : null}
            </g>
          )
        })}

        {hover ? (
          <g className="si-afbv__figure-hover" pointerEvents="none">
            <line
              x1={hover.svgX}
              x2={hover.svgX}
              y1={padT}
              y2={H - PAD_B}
              className="si-afbv__figure-crosshair"
            />
            {hover.rows.map(r => (
              <circle
                key={`h-${r.id}`}
                cx={hover.svgX}
                cy={r.svgY}
                r="3.2"
                fill={r.color}
                stroke="#fff"
                strokeWidth="1.1"
                className="si-afbv__figure-hover-dot"
              />
            ))}
          </g>
        ) : null}

        {annotation && annY != null ? (
          <text
            x={annPx + (annNearRight ? -4 : 4)}
            y={sy(annY) - 4}
            className="si-afbv__figure-annotation"
            textAnchor={annNearRight ? 'end' : 'start'}
          >
            {annotation.label}
          </text>
        ) : null}

        <g>
          <rect
            x={legendX}
            y={legendY}
            width={legendW}
            height={legendH}
            rx="1.5"
            className="si-afbv__figure-legend"
          />
          {series.map((s, i) => {
            const cy = legendY + 8 + i * 10
            const drawMarkers = seriesWantsMarkers(s, markers)
            return (
              <g key={`lg-${s.id}`}>
                <line
                  x1={legendX + 4}
                  x2={legendX + 16}
                  y1={cy - 2.5}
                  y2={cy - 2.5}
                  stroke={s.color}
                  strokeWidth="1.3"
                  strokeDasharray={s.dashed ? '4 2' : undefined}
                />
                {drawMarkers ? (
                  <circle cx={legendX + 10} cy={cy - 2.5} r="1.5" fill={s.color} />
                ) : null}
                <text x={legendX + 19} y={cy} className="si-afbv__figure-legend-text">
                  {s.label}
                </text>
              </g>
            )
          })}
        </g>

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} className="si-afbv__figure-axis" textAnchor="middle">
          {xLabel}
        </text>
        <text
          x={9}
          y={(padT + H - PAD_B) / 2}
          className="si-afbv__figure-axis"
          textAnchor="middle"
          transform={`rotate(-90 9 ${(padT + H - PAD_B) / 2})`}
        >
          {yLabel}
        </text>

        {/* Transparent hit layer keeps hover active above strokes */}
        <rect
          x={PAD_L}
          y={padT}
          width={W - PAD_L - PAD_R}
          height={H - padT - PAD_B}
          fill="transparent"
          className="si-afbv__figure-hit"
        />
      </svg>

      {hover ? (
        <div
          className={`si-afbv__figure-tip${tipFlip ? ' is-flip' : ''}`}
          style={{ left: `${tipLeftPct}%`, top: `${(padT / H) * 100}%` }}
          role="status"
        >
          <div className="si-afbv__figure-tip__x">
            {xLabel} {hover.xLabel}
          </div>
          <ul className="si-afbv__figure-tip__list">
            {hover.rows.map(r => (
              <li key={r.id}>
                <span className="si-afbv__figure-tip__swatch" style={{ background: r.color }} />
                <span className="si-afbv__figure-tip__label">{r.label}</span>
                <strong>{formatY(r.y)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
