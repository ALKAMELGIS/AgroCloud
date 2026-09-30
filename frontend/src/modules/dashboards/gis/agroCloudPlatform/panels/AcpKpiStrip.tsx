import { useMemo } from 'react'
import { useAcpPlatform } from '../acpPlatformContext'

export function AcpKpiStrip() {
  const acp = useAcpPlatform()
  const cards = useMemo(
    () => [...acp.config.kpiCards].filter(c => c.visible).sort((a, b) => a.order - b.order),
    [acp.config.kpiCards],
  )

  return (
    <div className="acp-kpi-strip">
      {cards.map(card => {
        let value = '—'
        let sub = ''
        if (card.id === 'total-fields') {
          value = String(acp.kpiTotals.totalCount)
          sub = `${acp.kpiTotals.totalAreaHa} ha`
        } else if (card.id === 'total-area') {
          value = acp.kpiTotals.totalAreaHa.toFixed(2)
          sub = 'ha'
        } else if (card.id === 'total-countries') {
          value = String(acp.kpiTotals.countryCount)
        } else if (card.source === 'structure-type' && card.structureTypeCode != null) {
          const hit = acp.kpiTotals.byType.find(t => t.code === card.structureTypeCode)
          value = String(hit?.count ?? 0)
          sub = `${(hit?.areaHa ?? 0).toFixed(2)} ha`
        }
        return (
          <article key={card.id} className="acp-kpi-card">
            <i className={`fa-solid ${card.icon} acp-kpi-card__icon`} aria-hidden />
            <div className="acp-kpi-card__body">
              <span className="acp-kpi-card__label">{card.label}</span>
              <strong className="acp-kpi-card__value">{value}</strong>
              {sub ? <span className="acp-kpi-card__sub">{sub}</span> : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}
