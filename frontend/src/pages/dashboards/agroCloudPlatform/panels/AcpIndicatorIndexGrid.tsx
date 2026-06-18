import type { CSSProperties } from 'react'
import type { AcpIndicatorIndexCard } from '../acpIndicatorIndexModel'

const INDEX_TONES: Record<AcpIndicatorIndexCard['code'], string> = {
  NDVI: '#16a34a',
  NDMI: '#0d9488',
  NDWI: '#2563eb',
  SAVI: '#65a30d',
  EVI: '#7c3aed',
  LST: '#ea580c',
  CHAS: '#15803d',
  DCHAS: '#b45309',
}

function formatValue(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function IndexTrendBadge({ card, tone }: { card: AcpIndicatorIndexCard; tone: string }) {
  const { icon, label, title } = card.trend
  const mod =
    card.stats.trend === 'up' ? '--up' : card.stats.trend === 'down' ? '--down' : '--flat'

  return (
    <span
      className={`acp-indicators__index-trend acp-indicators__index-trend${mod}`}
      style={{ '--index-tone': tone } as CSSProperties}
      title={title}
      aria-label={title}
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
      <span className="acp-indicators__index-trend-label">{label}</span>
    </span>
  )
}

function IndexTriple({ stats, digits }: { stats: AcpIndicatorIndexCard['stats']; digits: number }) {
  return (
    <div className="acp-indicators__index-triple">
      <div className="acp-indicators__index-stat">
        <span>Min</span>
        <em>{formatValue(stats.min, digits)}</em>
      </div>
      <div className="acp-indicators__index-stat">
        <span>Mean</span>
        <em>{formatValue(stats.mean, digits)}</em>
      </div>
      <div className="acp-indicators__index-stat">
        <span>Max</span>
        <em>{formatValue(stats.max, digits)}</em>
      </div>
    </div>
  )
}

type Props = {
  cards: AcpIndicatorIndexCard[]
}

export function AcpIndicatorIndexGrid({ cards }: Props) {
  if (!cards.length) return null

  return (
    <div className="acp-indicators__index-grid">
      {cards.map(card => (
        <article
          key={card.code}
          className="acp-indicators__index-card"
          style={{ '--index-tone': INDEX_TONES[card.code] } as CSSProperties}
        >
          <div className="acp-indicators__index-head">
            <span className="acp-indicators__index-code">{card.code}</span>
            <IndexTrendBadge card={card} tone={INDEX_TONES[card.code]} />
          </div>
          {card.trend.compareLine ? (
            <p className="acp-indicators__index-compare" title={card.trend.title}>
              {card.trend.compareLine}
            </p>
          ) : null}
          <IndexTriple stats={card.stats} digits={card.digits} />
        </article>
      ))}
    </div>
  )
}
