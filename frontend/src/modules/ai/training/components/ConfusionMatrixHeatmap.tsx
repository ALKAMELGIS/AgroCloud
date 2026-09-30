/**
 * Confusion matrix drawn as a viridis heatmap: predicted labels across the top,
 * true labels down the side, counts written in every cell and a colour bar for
 * scale. Colour makes the off-diagonal confusions obvious at a glance, which a
 * plain grid of numbers does not.
 */

export type ConfusionMatrixHeatmapProps = {
  /** counts[trueIndex][predictedIndex]. */
  counts: number[][]
  /** Row (true label) names; index order matches `counts`. */
  labels: string[]
  /** Column names when they differ from the row names, e.g. Detected / Missed. */
  columnLabels?: string[]
  title?: string
  ariaLabel?: string
  /** Shade each row against its own total — use when class sizes differ wildly. */
  normalizeRows?: boolean
  height?: number
}

const W = 260
const PAD_T = 26
const PAD_B = 20
const PAD_L = 54
const BAR_W = 8
const BAR_GAP = 12
const PAD_R = BAR_W + BAR_GAP + 20
const MAX_CELL_H = 30

/** Viridis control points — the matplotlib default, sampled evenly. */
const VIRIDIS: Array<[number, number, number]> = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
]

export function viridis(t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  const pos = clamped * (VIRIDIS.length - 1)
  const i = Math.min(VIRIDIS.length - 2, Math.floor(pos))
  const f = pos - i
  const a = VIRIDIS[i]!
  const b = VIRIDIS[i + 1]!
  const mix = (x: number, y: number) => Math.round(x + (y - x) * f)
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`
}

/** Viridis turns light around 55%, so the label has to flip with it. */
function textOn(t: number): string {
  return t > 0.55 ? '#111' : '#f8fafc'
}

function short(label: string, max: number): string {
  const s = String(label ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function compact(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e4) return `${Math.round(value / 1e3)}k`
  return String(Math.round(value))
}

export function ConfusionMatrixHeatmap({
  counts,
  labels,
  columnLabels,
  title,
  ariaLabel = 'Confusion matrix heatmap',
  normalizeRows = false,
  height,
}: ConfusionMatrixHeatmapProps) {
  const rows = counts.length
  const cols = counts[0]?.length ?? 0
  if (!rows || !cols) return null

  const colNames = columnLabels?.length ? columnLabels : labels
  const cellW = (W - PAD_L - PAD_R) / cols
  const cellH = Math.min(cellW, MAX_CELL_H)
  const gridW = cellW * cols
  const gridH = cellH * rows
  const H = height ?? PAD_T + gridH + PAD_B

  const globalMax = Math.max(...counts.flat().map(v => (Number.isFinite(v) ? v : 0)), 1)
  const rowMax = counts.map(row => Math.max(...row.map(v => (Number.isFinite(v) ? v : 0)), 1))
  const shade = (value: number, r: number) => value / (normalizeRows ? rowMax[r]! : globalMax)

  const barX = PAD_L + gridW + BAR_GAP
  const gradientId = `si-cm-scale-${rows}x${cols}`

  return (
    <svg
      className="si-afbv__figure"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      style={{ height: H }}
    >
      <rect x="0" y="0" width={W} height={H} className="si-afbv__figure-bg" />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          {VIRIDIS.map((_, i) => (
            <stop
              key={i}
              offset={`${(i / (VIRIDIS.length - 1)) * 100}%`}
              stopColor={viridis(i / (VIRIDIS.length - 1))}
            />
          ))}
        </linearGradient>
      </defs>

      {title ? (
        <text x={PAD_L} y={8} className="si-afbv__figure-note">
          {title}
        </text>
      ) : null}
      <text
        x={PAD_L + gridW / 2}
        y={PAD_T - 12}
        className="si-afbv__figure-axis"
        textAnchor="middle"
      >
        Predicted labels
      </text>

      {colNames.slice(0, cols).map((label, c) => (
        <text
          key={`col-${c}`}
          x={PAD_L + cellW * (c + 0.5)}
          y={PAD_T - 3}
          className="si-cm__tick"
          textAnchor="middle"
        >
          {short(label, cols > 6 ? 4 : 8)}
        </text>
      ))}

      {counts.map((row, r) =>
        row.map((value, c) => {
          const t = shade(Number(value) || 0, r)
          return (
            <g key={`cell-${r}-${c}`}>
              <rect
                x={PAD_L + cellW * c}
                y={PAD_T + cellH * r}
                width={cellW}
                height={cellH}
                fill={viridis(t)}
              >
                <title>{`${labels[r] ?? r} → ${colNames[c] ?? c}: ${value}`}</title>
              </rect>
              <text
                x={PAD_L + cellW * (c + 0.5)}
                y={PAD_T + cellH * (r + 0.5) + 2.6}
                className="si-cm__value"
                textAnchor="middle"
                fill={textOn(t)}
              >
                {compact(Number(value) || 0)}
              </text>
            </g>
          )
        }),
      )}

      {labels.slice(0, rows).map((label, r) => (
        <text
          key={`row-${r}`}
          x={PAD_L - 4}
          y={PAD_T + cellH * (r + 0.5) + 2.6}
          className="si-cm__tick"
          textAnchor="end"
        >
          {short(label, 12)}
        </text>
      ))}

      <text
        x={10}
        y={PAD_T + gridH / 2}
        className="si-afbv__figure-axis"
        textAnchor="middle"
        transform={`rotate(-90 10 ${PAD_T + gridH / 2})`}
      >
        True labels
      </text>

      <rect x={PAD_L} y={PAD_T} width={gridW} height={gridH} fill="none" className="si-afbv__spine" />

      <rect x={barX} y={PAD_T} width={BAR_W} height={gridH} fill={`url(#${gradientId})`} />
      <rect x={barX} y={PAD_T} width={BAR_W} height={gridH} fill="none" className="si-afbv__spine" />
      <text x={barX + BAR_W + 2} y={PAD_T + 3} className="si-cm__tick" textAnchor="start">
        {normalizeRows ? 'max' : compact(globalMax)}
      </text>
      <text x={barX + BAR_W + 2} y={PAD_T + gridH} className="si-cm__tick" textAnchor="start">
        0
      </text>

      <text x={PAD_L} y={H - 5} className="si-afbv__figure-note">
        Diagonal = correct · off-diagonal = confusion
      </text>
    </svg>
  )
}
