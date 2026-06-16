import { useMemo } from 'react'
import { buildLayerLiveLegendList, type LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import { resolveRemoteSensingLayerScientificName, type RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import { isAnalyticalResolutionLayer, resolveAnalyticalResolutionMeta } from '../../../lib/siAnalyticalResolutionEngine'
import './LayerLiveLegendPanel.css'

type LayerOption = { id: string; label?: string }

type LayerLiveLegendPanelProps = {
  layerOptions: LayerOption[]
  layerGroups?: RemoteSensingLayerSelectGroup[]
  activeLayerId?: string
  /** When true, only render the active layer card (for map float). */
  activeOnly?: boolean
}

export function LayerLiveLegendBody({ spec }: { spec: LayerLiveLegendSpec }) {
  if (spec.kind === 'composite' && spec.compositeBands?.length) {
    return (
      <div className="si-layer-live-legend__composite">
        {spec.compositeBands.map(row => (
          <div key={row.band} className="si-layer-live-legend__composite-row">
            <span className="si-layer-live-legend__swatch" style={{ background: row.color }} aria-hidden />
            <span>{row.band}</span>
          </div>
        ))}
        {spec.note ? <p className="si-layer-live-legend__note">{spec.note}</p> : null}
      </div>
    )
  }

  if (spec.kind === 'note') {
    return spec.note ? <p className="si-layer-live-legend__note">{spec.note}</p> : null
  }

  return (
    <>
      {spec.gradientCss ? (
        <div
          className="si-layer-live-legend__bar"
          style={{ background: spec.gradientCss }}
          role="img"
          aria-label={`${spec.title} color ramp`}
        />
      ) : null}
      {spec.valueMin != null && spec.valueMax != null ? (
        <div className="si-layer-live-legend__scale" aria-hidden>
          <span>{spec.valueMin}</span>
          <span>{spec.valueMax}</span>
        </div>
      ) : null}
      {spec.classes?.length ? (
        <ul className="si-layer-live-legend__classes">
          {spec.classes.map(row => (
            <li key={`${row.label}-${row.rangeLabel}`} className="si-layer-live-legend__class">
              <span className="si-layer-live-legend__swatch" style={{ background: row.color }} aria-hidden />
              <span className="si-layer-live-legend__class-label">{row.label}</span>
              <span className="si-layer-live-legend__class-range">{row.rangeLabel}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {spec.note ? <p className="si-layer-live-legend__note">{spec.note}</p> : null}
    </>
  )
}

export function LayerLiveLegendActiveCard({
  spec,
  activeLayerId,
  variant = 'inline',
}: {
  spec: LayerLiveLegendSpec
  activeLayerId?: string
  variant?: 'inline' | 'float'
}) {
  const scientificName = activeLayerId ? resolveRemoteSensingLayerScientificName(activeLayerId) : undefined
  const areMeta = resolveAnalyticalResolutionMeta()
  const showAre = activeLayerId ? isAnalyticalResolutionLayer(activeLayerId) : false
  return (
    <section
      className={`si-layer-live-legend__section is-active${variant === 'float' ? ' si-layer-live-legend__section--float' : ''}`}
      aria-label={`Active layer: ${spec.title}`}
    >
      <header className="si-layer-live-legend__header">
        <span className="si-layer-live-legend__badge">Active</span>
        {showAre ? (
          <span className="si-layer-live-legend__are-badge" title={areMeta.disclaimer}>
            {areMeta.badgeShort}
          </span>
        ) : null}
        <h3 className="si-layer-live-legend__title">{spec.title}</h3>
        {scientificName ? <p className="si-layer-live-legend__scientific">{scientificName}</p> : null}
        {spec.subtitle ? <p className="si-layer-live-legend__subtitle">{spec.subtitle}</p> : null}
        {showAre ? <p className="si-layer-live-legend__are-disclaimer">{areMeta.badgeLong}</p> : null}
      </header>
      <LayerLiveLegendBody spec={spec} />
    </section>
  )
}

export function LayerLiveLegendPanel({ layerOptions, layerGroups, activeLayerId, activeOnly = false }: LayerLiveLegendPanelProps) {
  const legendById = useMemo(() => {
    const map = new Map<string, LayerLiveLegendSpec>()
    for (const opt of layerOptions) {
      const spec = buildLayerLiveLegendList([opt])[0]
      if (spec) map.set(opt.id.toUpperCase(), spec)
    }
    return map
  }, [layerOptions])

  const catalogGroups = layerGroups?.length ? layerGroups : [{ id: 'all', label: 'All layers', options: layerOptions.map(o => ({ id: o.id, label: o.label || o.id })) }]

  const activeSpec = useMemo(() => {
    if (!activeLayerId) return null
    const hit = layerOptions.find(o => o.id === activeLayerId)
    if (!hit) return null
    return buildLayerLiveLegendList([hit])[0] ?? null
  }, [activeLayerId, layerOptions])

  if (!layerOptions.length) {
    return (
      <div className="si-layer-live-legend" dir="ltr">
        <p className="si-layer-live-legend__empty">Load Sentinel Hub layers to see color keys.</p>
      </div>
    )
  }

  if (activeOnly) {
    if (!activeSpec) {
      return (
        <div className="si-layer-live-legend" dir="ltr">
          <p className="si-layer-live-legend__empty">Select a Sentinel Live layer to view its color key.</p>
        </div>
      )
    }
    return (
      <div className="si-layer-live-legend si-layer-live-legend--active-only" dir="ltr">
        <LayerLiveLegendActiveCard spec={activeSpec} activeLayerId={activeLayerId} variant="float" />
      </div>
    )
  }

  return (
    <div className="si-layer-live-legend" dir="ltr">
      {activeSpec ? (
        <LayerLiveLegendActiveCard spec={activeSpec} activeLayerId={activeLayerId} />
      ) : null}

      <section className="si-layer-live-legend__catalog" aria-label="All Layer Live keys">
        <h3 className="si-layer-live-legend__catalog-title">All layers</h3>
        <div className="si-layer-live-legend__catalog-list">
          {catalogGroups.map(group => (
            <div key={group.id} className="si-layer-live-legend__catalog-group">
              <h4 className="si-layer-live-legend__catalog-group-title">{group.label}</h4>
              {group.options.map(opt => {
                const spec = legendById.get(opt.id.toUpperCase())
                if (!spec) return null
                const isActive =
                  activeSpec != null &&
                  spec.title === activeSpec.title &&
                  spec.subtitle === activeSpec.subtitle
                if (isActive) return null
                return (
                  <details key={`${group.id}-${spec.id}-${spec.title}`} className="si-layer-live-legend__details">
                    <summary className="si-layer-live-legend__summary">
                      <span className="si-layer-live-legend__summary-title">{opt.label}</span>
                      {spec.subtitle ? (
                        <span className="si-layer-live-legend__summary-sub">{spec.subtitle}</span>
                      ) : null}
                    </summary>
                    <div className="si-layer-live-legend__details-body">
                      <LayerLiveLegendBody spec={spec} />
                    </div>
                  </details>
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
