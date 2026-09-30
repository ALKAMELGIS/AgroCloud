import type { CutFillProfileChart as ChartModel } from './cutFillProfile'

type Props = {
  chart: ChartModel
}

function pathOf(points: Array<[number, number]>, close = false): string {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return close ? `${d} Z` : d
}

export function CutFillProfileChart({ chart }: Props) {
  const { width, height } = chart
  return (
    <figure className="si-cutfill-profile">
      <figcaption className="si-cutfill-profile__title">
        <span>Profile</span>
        <span className="si-cutfill-profile__key">
          <i className="is-existing" /> Existing
          <i className="is-design" /> Design
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cut and fill profile">
        {chart.bands.map((band, i) => (
          <path
            key={i}
            d={pathOf(band.points, true)}
            className={band.kind === 'cut' ? 'si-cutfill-profile__cut' : 'si-cutfill-profile__fill'}
          />
        ))}
        <path d={pathOf(chart.existing)} className="si-cutfill-profile__existing" />
        <path d={pathOf(chart.design)} className="si-cutfill-profile__design" />
        <text x="2" y="12" className="si-cutfill-profile__tick">
          {chart.yMaxLabel}
        </text>
        <text x="2" y={height - 16} className="si-cutfill-profile__tick">
          {chart.yMinLabel}
        </text>
        <text x="4" y={height - 2} className="si-cutfill-profile__tick">
          0
        </text>
        <text x={width - 4} y={height - 2} textAnchor="end" className="si-cutfill-profile__tick">
          {chart.xEndLabel}
        </text>
      </svg>
    </figure>
  )
}
