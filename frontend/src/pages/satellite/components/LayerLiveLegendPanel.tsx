import { useMemo } from 'react'
import { applyEtLegendClassEdges, buildLayerLiveLegendList, type LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import { resolveRemoteSensingLayerScientificName, type RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import {
  isAnalyticalResolutionLayer,
  resolveAnalyticalResolutionMeta,
  SENTINEL2_NATIVE_GSD_M,
} from '../../../lib/siAnalyticalResolutionEngine'
import {
  formatAreaHa,
  formatAreaKm2,
  formatAreaM2,
  geodesicAreaM2,
  type LayerClassAreaRow,
} from '../../../lib/siLayerClassAreaEngine'
import { useLayerClassAreas } from './useLayerClassAreas'
import './LayerLiveLegendPanel.css'

type LayerOption = { id: string; label?: string }

type LayerLiveLegendPanelProps = {
  layerOptions: LayerOption[]
  layerGroups?: RemoteSensingLayerSelectGroup[]
  activeLayerId?: string
  /** When true, only render the active layer card (for map float). */
  activeOnly?: boolean
  /** AOI geometry used to compute per-class Total Area in the active card. */
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
  /** Scene date (ISO) the active classification map is rendered for. */
  sceneDate?: string
  /** Optional multi-temporal series window shown in the metadata grid. */
  seriesStart?: string
  seriesEnd?: string
}

/** Parse "Low → High" style endpoints out of a subtitle ("· Low → High ·"). */
function parseScaleEnds(subtitle?: string): { low: string; high: string } {
  if (subtitle && subtitle.includes('→')) {
    const idx = subtitle.indexOf('→')
    const low = subtitle.slice(0, idx).split('·').pop()?.trim()
    const high = subtitle.slice(idx + 1).split('·')[0]?.trim()
    if (low && high && low.length <= 24 && high.length <= 24) return { low, high }
  }
  return { low: 'Low', high: 'High' }
}

/** Continuous vertical ramp aligned with the class rows (top = first class). */
function buildVerticalGradient(spec: LayerLiveLegendSpec): string | null {
  if (spec.classes?.length) {
    const colors = spec.classes.map(c => c.color)
    if (colors.length === 1) return colors[0]!
    return `linear-gradient(to bottom, ${colors.join(', ')})`
  }
  return spec.gradientCss ?? null
}

function formatScaleValue(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(2).replace(/\.?0+$/, '')
}

export function LayerLiveLegendBody({
  spec,
  classAreas,
}: {
  spec: LayerLiveLegendSpec
  classAreas?: LayerClassAreaRow[]
}) {
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

  const hasScale = spec.valueMin != null && spec.valueMax != null
  const parsedEnds = parseScaleEnds(spec.subtitle)
  const ends = {
    low: spec.scaleLabels?.low ?? parsedEnds.low,
    mid: spec.scaleLabels?.mid ?? '',
    high: spec.scaleLabels?.high ?? parsedEnds.high,
  }
  const verticalGradient = buildVerticalGradient(spec)
  const hasArea = !!classAreas?.length

  if (!spec.classes?.length) {
    return (
      <>
        {spec.gradientCss ? (
          <div className="si-layer-live-legend__bar" style={{ background: spec.gradientCss }} role="img" aria-label={`${spec.title} color ramp`} />
        ) : null}
        {hasScale ? (
          <div className="si-layer-live-legend__scale" aria-hidden>
            <span>{spec.valueMin}</span>
            <span>{spec.valueMax}</span>
          </div>
        ) : null}
        {spec.note ? <p className="si-layer-live-legend__note">{spec.note}</p> : null}
      </>
    )
  }

  return (
    <div className="si-lll-scale">
      {hasScale ? (
        <div className="si-lll-scale-head" aria-hidden>
          <div className="si-lll-scale-end is-low">
            <span className="si-lll-scale-end-k">{ends.low}</span>
            <span className="si-lll-scale-end-v">{formatScaleValue(spec.valueMin!)}</span>
          </div>
          <div className="si-lll-scale-end is-mid">
            {ends.mid ? <span className="si-lll-scale-end-k">{ends.mid}</span> : null}
            {ends.mid ? null : (
              <span className="si-lll-scale-end-v">{formatScaleValue((spec.valueMin! + spec.valueMax!) / 2)}</span>
            )}
          </div>
          <div className="si-lll-scale-end is-high">
            <span className="si-lll-scale-end-k">{ends.high}</span>
            <span className="si-lll-scale-end-v">{formatScaleValue(spec.valueMax!)}</span>
          </div>
        </div>
      ) : null}

      <div className={`si-lll-scale-body${hasArea ? ' has-area' : ''}`}>
        {verticalGradient ? (
          <span
            className="si-lll-vbar"
            style={{ background: verticalGradient }}
            role="img"
            aria-label={`${spec.title} color ramp`}
          />
        ) : null}
        <ul className="si-lll-rows">
          {spec.classes.map((row, i) => {
            const area = classAreas?.[i]
            const hasName = !!row.label && row.label.trim() !== row.rangeLabel.trim()
            return (
              <li key={`${row.label}-${row.rangeLabel}-${i}`} className="si-lll-row">
                <span className="si-lll-row-swatch" style={{ background: row.color }} aria-hidden />
                <div className="si-lll-row-main">
                  {hasName ? <span className="si-lll-row-name">{row.label}</span> : null}
                  <span className={`si-lll-row-range${hasName ? '' : ' is-primary'}`}>{row.rangeLabel}</span>
                </div>
                {area ? (
                  <div
                    className="si-lll-row-area"
                    title={`${area.count.toLocaleString('en-US')} px · ${formatAreaHa(area.areaHa)} ha · ${formatAreaM2(area.areaM2)} m² · ${formatAreaKm2(area.areaKm2)} km² · ${area.pctOfAoi.toFixed(1)}% of AOI`}
                  >
                    <span className="si-lll-area-line">
                      <i className="si-lll-area-u">ha</i>
                      <b>{formatAreaHa(area.areaHa)}</b>
                    </span>
                    <span className="si-lll-area-line is-m2">
                      <i className="si-lll-area-u">m²</i>
                      <b>{formatAreaM2(area.areaM2)}</b>
                    </span>
                    <span className="si-lll-area-pct">{area.pctOfAoi.toFixed(1)}%</span>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
      {spec.note ? <p className="si-layer-live-legend__note">{spec.note}</p> : null}
    </div>
  )
}

export function LayerLiveLegendActiveCard({
  spec,
  activeLayerId,
  variant = 'inline',
  aoiGeometry,
  sceneDate,
  seriesStart,
  seriesEnd,
}: {
  spec: LayerLiveLegendSpec
  activeLayerId?: string
  variant?: 'inline' | 'float'
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
  sceneDate?: string
  seriesStart?: string
  seriesEnd?: string
}) {
  const scientificName = activeLayerId ? resolveRemoteSensingLayerScientificName(activeLayerId) : undefined
  const areMeta = resolveAnalyticalResolutionMeta()
  const showAre = activeLayerId ? isAnalyticalResolutionLayer(activeLayerId) : false

  const { result: areaResult, loading: areaLoading, error: areaError, supported: areaSupported } =
    useLayerClassAreas({
      geometry: aoiGeometry,
      layerId: activeLayerId,
      sceneDate,
      enabled: !!aoiGeometry,
    })

  const hasAoi = !!aoiGeometry
  const instantAoiHa = useMemo(() => {
    if (!aoiGeometry) return 0
    return geodesicAreaM2(aoiGeometry) / 10_000
  }, [aoiGeometry])
  const totalHa = areaResult ? areaResult.aoiAreaM2 / 10_000 : instantAoiHa
  const imageryDate = areaResult?.sceneDate || sceneDate || '—'
  const providerLabel = `Sentinel Hub · ${SENTINEL2_NATIVE_GSD_M} m`
  const seriesLabel = seriesStart && seriesEnd ? `${seriesStart} → ${seriesEnd}` : null
  const classAreaRows = areaResult?.rows
  const displaySpec = useMemo(() => {
    if (String(activeLayerId || '').toUpperCase() !== 'ET') return spec
    return applyEtLegendClassEdges(spec, areaResult?.classEdges, areaResult?.classificationMode)
  }, [spec, activeLayerId, areaResult?.classEdges, areaResult?.classificationMode])

  return (
    <section
      className={`si-layer-live-legend__section is-active si-lll-scientific${variant === 'float' ? ' si-layer-live-legend__section--float' : ''}`}
      aria-label={`Active layer: ${displaySpec.title}`}
    >
      <header className="si-layer-live-legend__header">
        <div className="si-lll-titlebar">
          <h3 className="si-layer-live-legend__title">{displaySpec.title}</h3>
          <div className="si-lll-badges">
            <span className="si-layer-live-legend__badge">Active</span>
            {showAre ? (
              <span className="si-layer-live-legend__are-badge" title={areMeta.disclaimer}>
                {areMeta.badgeShort}
              </span>
            ) : null}
            {areaResult?.classificationMode === 'percentile' ? (
              <span className="si-layer-live-legend__badge" title="Classes are AOI percentiles for this scene">
                Deciles
              </span>
            ) : null}
          </div>
        </div>
        {scientificName ? <p className="si-layer-live-legend__scientific">{scientificName}</p> : null}

        <dl className="si-lll-meta-grid">
          <div className="si-lll-meta">
            <dt>Imagery</dt>
            <dd>{imageryDate}</dd>
          </div>
          <div className="si-lll-meta">
            <dt>Provider</dt>
            <dd>{providerLabel}</dd>
          </div>
          {seriesLabel ? (
            <div className="si-lll-meta">
              <dt>Series</dt>
              <dd>{seriesLabel}</dd>
            </div>
          ) : null}
          <div className="si-lll-meta">
            <dt>End date</dt>
            <dd>{imageryDate}</dd>
          </div>
        </dl>

        {displaySpec.subtitle ? <p className="si-layer-live-legend__subtitle">{displaySpec.subtitle}</p> : null}
        {showAre ? <p className="si-layer-live-legend__are-disclaimer">{areMeta.badgeLong}</p> : null}
        {hasAoi && areaSupported ? (
          <div className="si-layer-live-legend__area-summary" aria-live="polite">
            {areaError && !/abort/i.test(areaError) ? (
              <span className="si-layer-live-legend__area-status is-error" title={areaError}>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden /> Area unavailable
              </span>
            ) : (
              <span className="si-layer-live-legend__area-status">
                <i className="fa-solid fa-ruler-combined" aria-hidden /> Total AOI {formatAreaHa(totalHa)} ha
                {areaResult?.sceneDate ? (
                  <span className="si-layer-live-legend__area-status-sub"> · {areaResult.sceneDate}</span>
                ) : sceneDate ? (
                  <span className="si-layer-live-legend__area-status-sub"> · {sceneDate.slice(0, 10)}</span>
                ) : null}
                {areaLoading && !classAreaRows?.length ? (
                  <span className="si-layer-live-legend__area-status-sub"> · classifying…</span>
                ) : null}
              </span>
            )}
          </div>
        ) : null}
      </header>
      <LayerLiveLegendBody spec={displaySpec} classAreas={classAreaRows} />
    </section>
  )
}

export function LayerLiveLegendPanel({ layerOptions, layerGroups, activeLayerId, activeOnly = false, aoiGeometry, sceneDate, seriesStart, seriesEnd }: LayerLiveLegendPanelProps) {
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
        <LayerLiveLegendActiveCard
          spec={activeSpec}
          activeLayerId={activeLayerId}
          variant="float"
          aoiGeometry={aoiGeometry}
          sceneDate={sceneDate}
          seriesStart={seriesStart}
          seriesEnd={seriesEnd}
        />
      </div>
    )
  }

  return (
    <div className="si-layer-live-legend" dir="ltr">
      {activeSpec ? (
        <LayerLiveLegendActiveCard
          spec={activeSpec}
          activeLayerId={activeLayerId}
          aoiGeometry={aoiGeometry}
          sceneDate={sceneDate}
          seriesStart={seriesStart}
          seriesEnd={seriesEnd}
        />
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
