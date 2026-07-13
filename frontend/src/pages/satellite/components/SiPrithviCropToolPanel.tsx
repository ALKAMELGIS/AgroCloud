import { useMemo, useState } from 'react'
import {
  PIPELINE_STAGES,
  PRITHVI_CROP_CLASSES,
  type CropClassificationJob,
} from '../../../lib/siPrithviCropPipeline'
import './SiPrithviCropToolPanel.css'

type CropStat = { id?: string; name: string; pct: number; areaHa?: number }
type CropLegendItem = { id: string | number; name: string; color: string }

const EARTH_R = 6378137 // WGS84 equatorial radius (m)
const D2R = Math.PI / 180

/** Spherical ring area (m²) — same formula as the Measurement tool. */
function ringAreaM2(ring: number[][]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i += 1) {
    const [lng1, lat1] = ring[i]!
    const [lng2, lat2] = ring[(i + 1) % n]!
    total += (lng2 - lng1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R))
  }
  return Math.abs((total * EARTH_R * EARTH_R) / 2)
}

function polygonAreaM2(rings: number[][][]): number {
  if (!rings || !rings.length) return 0
  let a = ringAreaM2(rings[0]!)
  for (let i = 1; i < rings.length; i += 1) a -= ringAreaM2(rings[i]!)
  return Math.max(a, 0)
}

/** Total geodesic area of an AOI polygon/multipolygon, in hectares. */
function geometryAreaHa(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): number | undefined {
  if (!geom) return undefined
  let m2 = 0
  if (geom.type === 'Polygon') m2 = polygonAreaM2(geom.coordinates as unknown as number[][][])
  else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates as unknown as number[][][][]) m2 += polygonAreaM2(poly)
  }
  if (!Number.isFinite(m2) || m2 <= 0) return undefined
  return m2 / 10000
}

/** Area in hectares with adaptive precision (the panel reports area by hectare). */
function formatCropArea(ha?: number): string {
  if (ha == null || !Number.isFinite(ha)) return '—'
  if (ha <= 0) return '0 ha'
  if (ha < 0.01) return '<0.01 ha'
  const decimals = ha >= 100 ? 0 : ha >= 10 ? 1 : 2
  return `${ha.toLocaleString(undefined, { maximumFractionDigits: decimals })} ha`
}

/**
 * Tabbed crop-composition view: a statistical Table, a Pie (share %) with a key,
 * and a Bar chart (area per crop). Colors are matched from the prediction legend.
 */
function CropCompositionStats({
  stats,
  legendItems,
  aoiAreaHa,
}: {
  stats: CropStat[]
  legendItems: CropLegendItem[]
  aoiAreaHa?: number
}) {
  const [tab, setTab] = useState<'table' | 'pie' | 'bar'>('table')

  const colorByName = useMemo(() => {
    const m = new Map<string, string>()
    legendItems.forEach(l => m.set(l.name.toLowerCase(), l.color))
    return m
  }, [legendItems])

  const enriched = useMemo(
    () =>
      stats.map(s => {
        // Prefer a backend-provided area; otherwise derive hectares from the AOI
        // total area distributed by this class's share (pct).
        const areaHa = Number.isFinite(s.areaHa)
          ? s.areaHa
          : aoiAreaHa != null
            ? (aoiAreaHa * (s.pct || 0)) / 100
            : undefined
        return { ...s, areaHa, color: colorByName.get(s.name.toLowerCase()) ?? '#94a3b8' }
      }),
    [stats, colorByName, aoiAreaHa],
  )

  const pctSum = useMemo(() => enriched.reduce((a, s) => a + (s.pct || 0), 0) || 1, [enriched])
  const totalHa = useMemo(() => enriched.reduce((a, s) => a + (s.areaHa ?? 0), 0), [enriched])
  const hasArea = useMemo(() => enriched.some(s => Number.isFinite(s.areaHa)), [enriched])

  const pieWedges = useMemo(() => {
    const R = 46
    const cx = 50
    const cy = 50
    let angle = -Math.PI / 2
    return enriched.map(s => {
      const frac = (s.pct || 0) / pctSum
      const a0 = angle
      const a1 = angle + frac * Math.PI * 2
      angle = a1
      const x0 = cx + R * Math.cos(a0)
      const y0 = cy + R * Math.sin(a0)
      const x1 = cx + R * Math.cos(a1)
      const y1 = cy + R * Math.sin(a1)
      const large = a1 - a0 > Math.PI ? 1 : 0
      const d =
        frac >= 0.999
          ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`
          : `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
      return { d, color: s.color, key: s.id ?? s.name }
    })
  }, [enriched, pctSum])

  const bars = useMemo(() => {
    const copy = [...enriched]
    copy.sort((p, q) => (hasArea ? (q.areaHa ?? 0) - (p.areaHa ?? 0) : q.pct - p.pct))
    const max = hasArea
      ? Math.max(...copy.map(s => s.areaHa ?? 0), 0.0001)
      : Math.max(...copy.map(s => s.pct), 0.0001)
    return copy.map(s => ({ ...s, w: ((hasArea ? s.areaHa ?? 0 : s.pct) / max) * 100 }))
  }, [enriched, hasArea])

  return (
    <div className="prithvi-tool__stats">
      <div className="prithvi-tool__stats-head">
        <div className="prithvi-tool__stats-title">Crop composition</div>
        <div className="prithvi-comp-tabs" role="tablist" aria-label="Crop composition view">
          {(['table', 'pie', 'bar'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={'prithvi-comp-tab' + (tab === t ? ' is-active' : '')}
              onClick={() => setTab(t)}
            >
              <i
                className={
                  t === 'table'
                    ? 'fa-solid fa-table-list'
                    : t === 'pie'
                      ? 'fa-solid fa-chart-pie'
                      : 'fa-solid fa-chart-column'
                }
                aria-hidden
              />
              <span>{t === 'table' ? 'Table' : t === 'pie' ? 'Pie' : 'Bar'}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'table' ? (
        <div className="prithvi-comp-table" role="table">
          <div className="prithvi-comp-table__head" role="row">
            <span role="columnheader">Class</span>
            <span className="num" role="columnheader">%</span>
            <span className="num" role="columnheader">Area (ha)</span>
          </div>
          {enriched.map(s => (
            <div className="prithvi-comp-table__row" role="row" key={s.id ?? s.name}>
              <span className="prithvi-comp-table__name" role="cell">
                <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="num prithvi-tool__stats-pct" role="cell">
                {s.pct}%
              </span>
              <span className="num prithvi-comp-table__area" role="cell">
                {formatCropArea(s.areaHa)}
              </span>
            </div>
          ))}
          {hasArea ? (
            <div className="prithvi-comp-table__foot" role="row">
              <span role="cell">Total</span>
              <span className="num" role="cell">
                100%
              </span>
              <span className="num" role="cell">
                {formatCropArea(totalHa)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'pie' ? (
        <div className="prithvi-comp-pie">
          <svg
            viewBox="0 0 100 100"
            className="prithvi-comp-pie__svg"
            role="img"
            aria-label="Crop composition pie chart"
          >
            {pieWedges.map(w => (
              <path key={w.key} d={w.d} fill={w.color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.4} />
            ))}
          </svg>
          <ul className="prithvi-comp-pie__legend">
            {enriched.map(s => (
              <li key={s.id ?? s.name}>
                <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                <span className="prithvi-comp-pie__legend-name">{s.name}</span>
                <span className="prithvi-comp-pie__legend-pct">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === 'bar' ? (
        <div className="prithvi-comp-bars">
          {bars.map(s => (
            <div className="prithvi-comp-bar" key={s.id ?? s.name}>
              <div className="prithvi-comp-bar__top">
                <span className="prithvi-comp-bar__name">
                  <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="prithvi-comp-bar__val">
                  {hasArea ? formatCropArea(s.areaHa) : `${s.pct}%`}
                </span>
              </div>
              <div className="prithvi-comp-bar__track">
                <div
                  className="prithvi-comp-bar__fill"
                  style={{ width: `${Math.max(s.w, 1.5)}%`, background: s.color }}
                />
              </div>
            </div>
          ))}
          <div className="prithvi-comp-bars__cap">
            {hasArea ? `Total area · ${formatCropArea(totalHa)}` : 'Share of classified area'}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export type SiPrithviCropToolPanelProps = {
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  hasSelfInference: boolean
  season: { start: string; end: string }
  onSeasonChange: (season: { start: string; end: string }) => void
  job: CropClassificationJob | null
  isRunning: boolean
  onPickAoi: () => void
  onRunAoi: () => void
  onRunChip: (imageUrl: string) => void
  onCancel: () => void
  onAddToMap?: () => void
}

function stageState(
  job: CropClassificationJob | null,
  stageStatus: string,
): 'idle' | 'active' | 'done' {
  if (!job) return 'idle'
  const order = ['fetching', 'preprocessing', 'inferring', 'done']
  const cur = order.indexOf(job.status)
  const me = order.indexOf(stageStatus)
  if (job.status === 'error') return cur >= me ? 'idle' : 'idle'
  if (cur < 0) return 'idle'
  if (me < cur) return 'done'
  if (me === cur) return job.status === 'done' ? 'done' : 'active'
  return 'idle'
}

export function SiPrithviCropToolPanel(props: SiPrithviCropToolPanelProps) {
  const {
    aoiGeometry,
    season,
    onSeasonChange,
    job,
    isRunning,
    onRunAoi,
    onCancel,
  } = props

  const hasAoi = Boolean(aoiGeometry)
  const aoiAreaHa = useMemo(() => geometryAreaHa(aoiGeometry), [aoiGeometry])
  const result = job?.status === 'done' ? job.result : null
  const scenes = result?.scenes
  const prediction = result?.prediction
  const country = result?.country ?? null
  const classStats = result?.classStats ?? null
  const progressPct = Math.round((job?.progress ?? 0) * 100)

  const sceneTiles = useMemo(
    () => [
      { key: 'T1', src: scenes?.t1 ?? null },
      { key: 'T2', src: scenes?.t2 ?? null },
      { key: 'T3', src: scenes?.t3 ?? null },
      { key: 'Crop Type', src: prediction?.url ?? null },
    ],
    [scenes, prediction],
  )

  const legendItems = useMemo(() => {
    if (result?.legend && result.legend.length) {
      return result.legend.map(c => ({ id: c.id, name: c.name, color: c.color }))
    }
    return PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color }))
  }, [result])

  // Dynamic legend: after a classification run, only show the crop classes that
  // are actually present in the prediction (derived from classStats), instead of
  // the full model class list. Before any run, the full reference legend is kept.
  const displayLegendItems = useMemo(() => {
    if (result && classStats && classStats.length) {
      const present = new Set(
        classStats.map(s => String(s.name ?? '').toLowerCase()).filter(Boolean),
      )
      const filtered = legendItems.filter(l => present.has(l.name.toLowerCase()))
      return filtered.length ? filtered : legendItems
    }
    return legendItems
  }, [result, classStats, legendItems])

  return (
    <div className="prithvi-tool" dir="auto">
      <header className="prithvi-tool__head">
        <div className="prithvi-tool__title">Crop Classification</div>
      </header>

      <div className="prithvi-tool__section">
        <div className="prithvi-tool__dates">
          <label>
            <span>Season start</span>
            <input
              type="date"
              value={season.start}
              max={season.end}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, start: e.target.value })}
            />
          </label>
          <label>
            <span>Season end</span>
            <input
              type="date"
              value={season.end}
              min={season.start}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, end: e.target.value })}
            />
          </label>
        </div>

        <div className="prithvi-tool__row">
          {isRunning ? (
            <button type="button" className="prithvi-tool__btn is-danger" onClick={onCancel}>
              <i className="fa-solid fa-stop" aria-hidden /> Cancel
            </button>
          ) : (
            <button
              type="button"
              className="prithvi-tool__btn is-primary"
              onClick={onRunAoi}
              disabled={!hasAoi}
            >
              <i className="fa-solid fa-play" aria-hidden /> Run classification
            </button>
          )}
        </div>
      </div>

      {/* Pipeline stepper */}
      {job ? (
        <div className="prithvi-tool__pipeline">
          <div className="prithvi-tool__progress">
            <div className="prithvi-tool__progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <ol className="prithvi-tool__steps">
            {PIPELINE_STAGES.map(stage => {
              const st = stageState(job, stage.status)
              return (
                <li key={stage.status} className={`prithvi-tool__step is-${st}`}>
                  <span className="prithvi-tool__step-dot">
                    {st === 'done' ? <i className="fa-solid fa-check" aria-hidden /> : null}
                    {st === 'active' ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
                  </span>
                  <span className="prithvi-tool__step-label">{stage.label}</span>
                </li>
              )
            })}
          </ol>
          <div className={`prithvi-tool__status is-${job.status}`}>{job.message}</div>
          {job.status === 'error' && job.error ? (
            <div className="prithvi-tool__error">{job.error}</div>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div className="prithvi-tool__results">
          {country ? (
            <div className="prithvi-tool__country">
              <i className="fa-solid fa-location-dot" aria-hidden />{' '}
              Detected country: <strong>{country.name}</strong>
              {country.code ? ` (${country.code})` : ''}
              <span className="prithvi-tool__country-src"> · {country.source}</span>
            </div>
          ) : null}
          <div className="prithvi-tool__grid">
            {sceneTiles.map(tile => (
              <figure key={tile.key} className="prithvi-tool__tile">
                {tile.src ? (
                  <img src={tile.src} alt={tile.key} loading="lazy" />
                ) : (
                  <div className="prithvi-tool__tile-empty">
                    <i className="fa-regular fa-image" aria-hidden />
                  </div>
                )}
                <figcaption>{tile.key}</figcaption>
              </figure>
            ))}
          </div>
          {classStats && classStats.length ? (
            <CropCompositionStats stats={classStats} legendItems={legendItems} aoiAreaHa={aoiAreaHa} />
          ) : null}
        </div>
      ) : null}

      {/* Legend — dynamic after a run (only detected crops), reference before. */}
      <div className="prithvi-tool__legend">
        <div className="prithvi-tool__legend-title">
          {result ? 'Detected crop types' : 'Model prediction legend'}
        </div>
        <ul className="prithvi-tool__legend-list">
          {displayLegendItems.map(c => (
            <li key={c.id}>
              <span className="prithvi-tool__swatch" style={{ background: c.color }} />
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default SiPrithviCropToolPanel
