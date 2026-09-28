import { useState } from 'react'
import {
  formatProfileDistance,
  formatProfileElevation,
  formatProfileSlope,
  type ElevationProfile,
  type ElevationProfileSample,
} from '../../../lib/elevationProfile/elevationProfile'
import type { ElevationProfileColors, ElevationProfileStatKey } from './useElevationProfile'

type Props = {
  profile: ElevationProfile
  colors: ElevationProfileColors
  statsOn: Record<ElevationProfileStatKey, boolean>
  onHover: (index: number | null) => void
  onReverse: () => void
  onExport: () => void
  onClose: () => void
}

const VB_W = 720
const VB_H = 210

function nearestIndex(samples: ElevationProfileSample[], x: number, xOf: (d: number) => number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < samples.length; i += 1) {
    const dx = Math.abs(xOf(samples[i]!.distanceM) - x)
    if (dx < bestDist) {
      best = i
      bestDist = dx
    }
  }
  return best
}

export function ElevationProfileChart({ profile, colors, statsOn, onHover, onReverse, onExport, onClose }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const { samples, stats } = profile
  const padL = 48
  const padR = 12
  const padT = 14
  const padB = 28
  const plotW = VB_W - padL - padR
  const plotH = VB_H - padT - padB
  const zPad = Math.max(2, (stats.maxM - stats.minM) * 0.08)
  const z0 = stats.minM - zPad
  const z1 = stats.maxM + zPad
  const dMax = Math.max(stats.distanceM, 1)
  const xOf = (d: number) => padL + (d / dMax) * plotW
  const yOf = (z: number) => padT + ((z1 - z) / (z1 - z0)) * plotH
  const line = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${xOf(s.distanceM).toFixed(1)} ${yOf(s.elevationM).toFixed(1)}`).join(' ')
  const area = `${line} L${xOf(samples[samples.length - 1]!.distanceM).toFixed(1)} ${(padT + plotH).toFixed(1)} L${xOf(samples[0]!.distanceM).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
  const yTicks = [stats.minM, (stats.minM + stats.maxM) / 2, stats.maxM]
  const xTicks = [0, dMax / 3, (dMax * 2) / 3, dMax]
  const active = hover != null ? samples[hover] : null

  return (
    <section
      className="si-elev-chart"
      data-map-overlay-isolate=""
      style={{ ['--ep-line' as string]: colors.line, ['--ep-graph' as string]: colors.graph, ['--ep-hi' as string]: colors.highlight }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      <header className="si-elev-chart__bar">
        <strong>Elevation Profile</strong>
        <span className="si-elev-chart__actions">
          <button type="button" title="Reverse direction" onClick={onReverse}>
            <i className="fa-solid fa-right-left" aria-hidden />
          </button>
          <button type="button" title="Export" onClick={onExport}>
            <i className="fa-solid fa-file-export" aria-hidden />
          </button>
          <button type="button" title="Close profile" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </span>
      </header>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Elevation profile"
        onMouseLeave={() => {
          setHover(null)
          onHover(null)
        }}
        onMouseMove={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * VB_W
          const index = nearestIndex(samples, x, xOf)
          setHover(index)
          onHover(index)
        }}
      >
        <defs>
          <linearGradient id="si-elev-profile-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.graph} stopOpacity="0.95" />
            <stop offset="100%" stopColor={colors.line} stopOpacity="0.72" />
          </linearGradient>
        </defs>
        {yTicks.map(z => (
          <g key={z}>
            <line className="si-elev-chart__grid" x1={padL} x2={VB_W - padR} y1={yOf(z)} y2={yOf(z)} />
            <text className="si-elev-chart__tick" x={padL - 6} y={yOf(z) + 3} textAnchor="end">
              {Math.round(z)}
            </text>
          </g>
        ))}
        <text className="si-elev-chart__axis" x={14} y={padT + plotH / 2} transform={`rotate(-90 14 ${padT + plotH / 2})`}>
          Elevation (m)
        </text>
        <path d={area} fill="url(#si-elev-profile-fill)" />
        <path d={line} className="si-elev-chart__line" />
        {active ? (
          <g>
            <rect
              className="si-elev-chart__hi-band"
              x={xOf(active.distanceM) - 10}
              y={padT}
              width={20}
              height={plotH}
            />
            <text className="si-elev-chart__dist-tag" x={xOf(active.distanceM)} y={padT - 2} textAnchor="middle">
              {formatProfileDistance(active.distanceM)}
            </text>
            <line className="si-elev-chart__cursor" x1={xOf(active.distanceM)} x2={xOf(active.distanceM)} y1={padT} y2={padT + plotH} />
            <circle className="si-elev-chart__dot" cx={xOf(active.distanceM)} cy={yOf(active.elevationM)} r="4" />
            <g className="si-elev-chart__readout" transform={`translate(${Math.min(xOf(active.distanceM) + 10, VB_W - 112)} ${Math.max(padT + 8, yOf(active.elevationM) - 28)})`}>
              <rect width="102" height="34" rx="3" />
              <text x="6" y="14">{formatProfileElevation(active.elevationM)}</text>
              <text x="6" y="28">{formatProfileSlope(active.slopePct)}</text>
            </g>
          </g>
        ) : null}
        {xTicks.map(d => (
          <text key={d} className="si-elev-chart__tick" x={xOf(d)} y={VB_H - 8} textAnchor="middle">
            {Math.round(d).toLocaleString('en-US')}
          </text>
        ))}
        <text className="si-elev-chart__axis" x={VB_W / 2} y={VB_H - 1} textAnchor="middle">
          {`Distance (${formatProfileDistance(dMax)})`}
        </text>
      </svg>
      <footer className="si-elev-chart__stats">
        <span>Elevation</span>
        {statsOn.min ? <span>Min: {formatProfileElevation(stats.minM)}</span> : null}
        {statsOn.avg ? <span>Avg: {formatProfileElevation(stats.avgM)}</span> : null}
        {statsOn.max ? <span>Max: {formatProfileElevation(stats.maxM)}</span> : null}
        {statsOn.change ? (
          <>
            <span>Gain: {formatProfileElevation(stats.gainM)}</span>
            <span>Loss: {formatProfileElevation(stats.lossM)}</span>
          </>
        ) : null}
        <span className="si-elev-chart__stats-gap">Slope</span>
        {statsOn.slopeMax ? (
          <span>
            Max: {formatProfileSlope(stats.slopeMaxPct)} {formatProfileSlope(stats.slopeMinPct)}
          </span>
        ) : null}
        {statsOn.slopeAvg ? <span>Avg: {formatProfileSlope(stats.slopeAvgPct)}</span> : null}
      </footer>
    </section>
  )
}
