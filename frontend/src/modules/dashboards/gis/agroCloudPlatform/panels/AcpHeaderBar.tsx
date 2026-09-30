import { useMemo } from 'react'
import { useAcpPlatform } from '../acpPlatformContext'
import type { AcpKpiCardConfig } from '../acpPlatformConfig'
import { useBreakpoint, isAcpCompactLayout } from '../hooks/useBreakpoint'

const ELITE_AGRO_LOGO_SRC = `${import.meta.env.BASE_URL}elite-agro-projects-logo.png`

function resolveKpiDisplay(
  card: AcpKpiCardConfig,
  totals: ReturnType<typeof useAcpPlatform>['kpiTotals'],
): { value: string; sub?: string; compact?: boolean } {
  if (card.id === 'total-fields') {
    return { value: String(totals.totalCount) }
  }
  if (card.id === 'total-area') {
    return { value: `${totals.totalAreaHa.toFixed(2)} ha`, compact: true }
  }
  if (card.id === 'total-countries') {
    return { value: String(totals.countryCount) }
  }
  if (card.source === 'structure-type' && card.structureTypeCode != null) {
    const hit = totals.byType.find(t => t.code === card.structureTypeCode)
    return {
      value: String(hit?.count ?? 0),
      sub: `${(hit?.areaHa ?? 0).toFixed(2)} ha`,
    }
  }
  return { value: '—' }
}

function KpiCard({
  card,
  totals,
}: {
  card: AcpKpiCardConfig
  totals: ReturnType<typeof useAcpPlatform>['kpiTotals']
}) {
  const display = resolveKpiDisplay(card, totals)
  return (
    <article
      className={`acp-kpi-card${display.compact ? ' acp-kpi-card--compact' : ''}`}
      title={card.label}
    >
      <span className="acp-kpi-card__icon-wrap" aria-hidden>
        <i className={`fa-solid ${card.icon}`} />
      </span>
      <div className="acp-kpi-card__body">
        <span className="acp-kpi-card__label">{card.label}</span>
        <strong className="acp-kpi-card__value">{display.value}</strong>
        {display.sub ? <span className="acp-kpi-card__sub">{display.sub}</span> : null}
      </div>
    </article>
  )
}

export function AcpHeaderBar({ kpiTotals }: { kpiTotals?: ReturnType<typeof useAcpPlatform>['kpiTotals'] }) {
  const acp = useAcpPlatform()
  const bp = useBreakpoint()
  const compact = isAcpCompactLayout(bp)
  const totals = kpiTotals ?? acp.kpiTotals
  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })

  const cards = useMemo(
    () => [...acp.config.kpiCards].filter(c => c.visible).sort((a, b) => a.order - b.order),
    [acp.config.kpiCards],
  )

  return (
    <header className={`acp-header${compact ? ' acp-header--compact' : ''}`}>
      <div className="acp-header__bar">
        <div className="acp-header__brand">
          <span className="acp-header__elite" role="img" aria-label="Elite Agro Projects">
            <img
              className="acp-header__elite-logo"
              src={ELITE_AGRO_LOGO_SRC}
              alt=""
              width={272}
              height={42}
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </span>
          <h1 className="acp-header__title">{acp.config.title}</h1>
        </div>
        <div className="acp-header__actions">
          <span className="acp-header__date">{dateStr}</span>
          <input
            type="date"
            className="acp-header__date-input"
            value={acp.analysisDate}
            disabled={acp.autoFollowDate}
            onChange={e => {
              acp.setAutoFollowDate(false)
              const next = e.target.value
              acp.setAnalysisDate(next)
              acp.commitWmsLayer({ startDate: next, endDate: next })
              acp.refreshEngine()
            }}
          />
          <label className="acp-header__auto">
            <input type="checkbox" checked={acp.autoFollowDate} onChange={e => acp.setAutoFollowDate(e.target.checked)} />
            Auto
          </label>
          <button
            type="button"
            className="acp-icon-btn"
            title="Refresh"
            onClick={() => {
              acp.refreshWmsLayer()
              acp.refreshEngine()
            }}
          >
            <i className="fa-solid fa-rotate" aria-hidden />
          </button>
          <button type="button" className="acp-icon-btn" title="Settings" onClick={() => acp.setSettingsOpen(true)}>
            <i className="fa-solid fa-gear" aria-hidden />
          </button>
        </div>
      </div>

      <div className="acp-header__kpis" role="region" aria-label="Structure KPIs">
        {cards.map(card => (
          <KpiCard key={card.id} card={card} totals={totals} />
        ))}
      </div>
    </header>
  )
}
