import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DchasRiskTier } from '../../../../lib/siCropAlertDchasBeacon'
import { DCHAS_HEALTHY_COLOR, DCHAS_ISOLATED_COLOR, resolveAcpFieldHvdColor } from '../../../../lib/siCropAlertDchasBeacon'
import { resolveFarmerFieldAction, resolveFarmerFieldActionTone } from '../../../../lib/farmerAlertAction'
import {
  decideIrrigationAlert,
  IRRIGATION_ALERT_LEVEL_COLORS,
  IRRIGATION_ALERT_LEVEL_LABELS,
  IRRIGATION_ALERT_LEVEL_ORDER,
  type IrrigationAlertDecision,
  type IrrigationAlertLevel,
} from '../../../../lib/irrigationDroughtAlert'
import type { AcpFieldTableRow } from '../acpMapSpatial'
import { resolveAcpDecisionSupportLabel, resolveAcpDecisionSupportTone, resolveAcpFieldSceneComparisonDates } from '../acpDecisionSupport'
import { buildAcpIndicatorIndexCards } from '../acpIndicatorIndexModel'
import { useAcpPlatform } from '../acpPlatformContext'
import { CropAlertTierIcon } from '../../../satellite/components/SiCropAlertHvdIcon'
import { AcpIndicatorIndexGrid } from './AcpIndicatorIndexGrid'
import '../../../satellite/components/SiCropAlertHvdIcon.css'

type Props = {
  rows: AcpFieldTableRow[]
  indicatorScopeRows: AcpFieldTableRow[]
  viewportScopeActive?: boolean
}

type MainTab = 'alerts' | 'irrigation' | 'indicators'
type SubFilter = 'warning' | 'stable' | 'watch' | 'healthy' | null

const FILTER_CYCLE: SubFilter[] = [null, 'warning', 'watch', 'stable', 'healthy']

const SUB_FILTERS: {
  id: SubFilter
  tier: DchasRiskTier
  title: string
  tone?: string
  color?: string
}[] = [
  { id: 'warning', tier: 'stress', title: 'Warning', tone: 'warn' },
  { id: 'stable', tier: 'stable', title: 'Stable', tone: 'muted', color: DCHAS_ISOLATED_COLOR },
  { id: 'watch', tier: 'watch', title: 'Watch', tone: 'muted' },
  { id: 'healthy', tier: 'stable', title: 'Healthy', tone: 'ok', color: DCHAS_HEALTHY_COLOR },
]

const ALERT_RANK: Record<string, number> = {
  critical: 0,
  stress: 1,
  warning: 2,
  watch: 3,
  stable: 4,
  healthy: 5,
}

const IRRIGATION_TOOL_CHIPS: Array<{ id: IrrigationAlertLevel | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  ...IRRIGATION_ALERT_LEVEL_ORDER.map(id => ({
    id,
    label: IRRIGATION_ALERT_LEVEL_LABELS[id],
  })),
]

type IrrigationRow = {
  fieldKey: string
  displayName: string
  country: string
  areaHa: number
  imageDate: string | null
  decision: IrrigationAlertDecision
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type ChasTrendKind = 'up' | 'down' | 'flat' | 'unknown'

function resolveChasTrendKind(deltaChas: number | null | undefined): ChasTrendKind {
  if (deltaChas == null || !Number.isFinite(deltaChas)) return 'unknown'
  if (Math.abs(deltaChas) < 0.001) return 'flat'
  return deltaChas > 0 ? 'up' : 'down'
}

function resolveChasTrendTitle(row: AcpFieldTableRow): string {
  const delta = row.deltaChas
  if (delta == null || !Number.isFinite(delta)) return 'No CHAS comparison available'
  const { latestSceneDate, previousSceneDate } = resolveAcpFieldSceneComparisonDates(row)
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`
  if (previousSceneDate && latestSceneDate) {
    return `ΔCHAS ${deltaLabel} · ${formatShortDate(previousSceneDate)} → ${formatShortDate(latestSceneDate)}`
  }
  return `ΔCHAS ${deltaLabel} vs previous scene`
}

function ChasTrendArrow({ row }: { row: AcpFieldTableRow }) {
  const kind = resolveChasTrendKind(row.deltaChas)
  const decisionTone = resolveAcpDecisionSupportTone(row)
  const decisionLabel = resolveAcpDecisionSupportLabel(decisionTone)
  const trendTitle = resolveChasTrendTitle(row)
  const title = `${decisionLabel} · ${trendTitle}`

  const trendIcon =
    kind === 'up'
      ? 'fa-arrow-trend-up'
      : kind === 'down'
        ? 'fa-arrow-trend-down'
        : kind === 'flat'
          ? 'fa-minus'
          : null

  return (
    <span className="acp-live-alerts__col acp-live-alerts__col--trend-cell" title={title} aria-label={title}>
      {trendIcon ? (
        <span
          className={`acp-live-alerts__trend-badge acp-live-alerts__trend-badge--${decisionTone} acp-live-alerts__trend-badge--${kind}`}
        >
          <i className={`fa-solid ${trendIcon}`} aria-hidden />
        </span>
      ) : (
        <span className="acp-live-alerts__trend-badge acp-live-alerts__trend-badge--unknown">—</span>
      )}
    </span>
  )
}

function matchesSubFilter(row: AcpFieldTableRow, filter: SubFilter): boolean {
  if (!filter) return true
  if (filter === 'warning') {
    return row.alertTier === 'warning' || row.alertTier === 'stress' || row.alertTier === 'critical'
  }
  if (filter === 'watch') return row.alertTier === 'watch'
  if (filter === 'healthy') return row.alertTier === 'healthy' || row.severity === 'normal'
  return row.alertTier === 'stable'
}

function statusBadge(row: AcpFieldTableRow) {
  return (
    <CropAlertTierIcon
      tier={row.alertTier}
      size="sm"
      className="acp-live-alerts__row-icon"
      title={row.status}
      color={resolveAcpFieldHvdColor(row)}
    />
  )
}

type AlertRowProps = {
  row: AcpFieldTableRow
  selected: boolean
  onSelect: (fieldKey: string) => void
}

function LiveAlertRow({ row, selected, onSelect }: AlertRowProps) {
  const { latestSceneDate, previousSceneDate } = resolveAcpFieldSceneComparisonDates(row)
  const action = resolveFarmerFieldAction(row.result, row.alertTier)
  const actionTone = resolveFarmerFieldActionTone(row.result, row.alertTier)
  return (
    <li>
      <button
        type="button"
        className={`acp-live-alerts__card${selected ? ' is-selected' : ''}`}
        onClick={() => onSelect(row.fieldKey)}
      >
        <div className="acp-live-alerts__card-top">
          {statusBadge(row)}
          <strong className="acp-live-alerts__name">{row.displayName}</strong>
        </div>
        <div className="acp-live-alerts__cols" aria-hidden>
          <span className="acp-live-alerts__col">
            <em>CHAS</em>
            {row.chas?.toFixed(2) ?? '—'}
          </span>
          <ChasTrendArrow row={row} />
          <span className="acp-live-alerts__col">
            <em>Area</em>
            {row.areaHa > 0 ? row.areaHa.toFixed(1) : '—'}
          </span>
          <span className="acp-live-alerts__col acp-live-alerts__col--country">
            <em>Country</em>
            {row.country}
          </span>
        </div>
        <p
          className={`acp-live-alerts__action acp-live-alerts__action--${actionTone}`}
          title={action}
        >
          <em>Action</em> {action}
        </p>
        <small className="acp-live-alerts__meta">
          Sentinel scene · {formatShortDate(latestSceneDate)}
          {previousSceneDate ? ` · prev · ${formatShortDate(previousSceneDate)}` : ''}
        </small>
      </button>
    </li>
  )
}

function IrrigationAlertRow({
  row,
  selected,
  onSelect,
}: {
  row: IrrigationRow
  selected: boolean
  onSelect: (fieldKey: string) => void
}) {
  const d = row.decision
  return (
    <li>
      <button
        type="button"
        className={`acp-live-alerts__card${selected ? ' is-selected' : ''}`}
        onClick={() => onSelect(row.fieldKey)}
      >
        <div className="acp-live-alerts__card-top">
          <span
            className="acp-live-alerts__row-icon acp-irrigation__level-dot"
            style={{ background: d.color }}
            title={d.label}
            aria-label={d.label}
          />
          <strong className="acp-live-alerts__name">{row.displayName}</strong>
        </div>
        <div className="acp-live-alerts__cols" aria-hidden>
          <span className="acp-live-alerts__col">
            <em>ISS</em>
            {d.iss.toFixed(2)}
          </span>
          <span className="acp-live-alerts__col">
            <em>Alert</em>
            <span style={{ color: d.color, fontWeight: 700 }}>{d.label}</span>
          </span>
          <span className="acp-live-alerts__col">
            <em>Area</em>
            {row.areaHa > 0 ? row.areaHa.toFixed(1) : '—'}
          </span>
          <span className="acp-live-alerts__col acp-live-alerts__col--country">
            <em>Country</em>
            {row.country}
          </span>
        </div>
        <p className="acp-live-alerts__action" style={{ color: d.color }} title={d.message}>
          <em>Action</em> {d.action}
          {d.escalated ? ' · escalated' : ''}
        </p>
        <small className="acp-live-alerts__meta">
          {d.status} · scene · {formatShortDate(row.imageDate)}
          {d.deltaIss != null ? ` · ΔISS ${d.deltaIss >= 0 ? '+' : ''}${d.deltaIss.toFixed(2)}` : ''}
        </small>
      </button>
    </li>
  )
}

function LiveAlertsBoard({
  alerts,
  selectedFieldKey,
  onSelect,
  scrollEnabled,
}: {
  alerts: AcpFieldTableRow[]
  selectedFieldKey: string | null
  onSelect: (fieldKey: string) => void
  scrollEnabled: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const segmentRef = useRef<HTMLUListElement>(null)
  const [autoScroll, setAutoScroll] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => setReducedMotion(mq.matches)
    syncMotion()
    mq.addEventListener('change', syncMotion)
    return () => mq.removeEventListener('change', syncMotion)
  }, [])

  useEffect(() => {
    if (!scrollEnabled || alerts.length < 2 || reducedMotion) {
      setAutoScroll(false)
      return
    }
    const viewport = viewportRef.current
    const segment = segmentRef.current
    if (!viewport || !segment) return

    const sync = () => {
      setAutoScroll(segment.offsetHeight > viewport.clientHeight + 2)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(viewport)
    ro.observe(segment)
    return () => ro.disconnect()
  }, [alerts, scrollEnabled, reducedMotion])

  const boardDurationSec = Math.min(2800, Math.max(1040, alerts.length * 110))
  const segments = autoScroll ? [0, 1] : [0]

  return (
    <div
      ref={viewportRef}
      className={`acp-live-alerts__board${autoScroll ? ' acp-live-alerts__board--scroll' : ''}`}
    >
      <div
        className={`acp-live-alerts__board-track${autoScroll ? ' is-scrolling' : ''}`}
        style={
          autoScroll
            ? ({ ['--acp-alerts-board-duration' as string]: `${boardDurationSec}s` } as CSSProperties)
            : undefined
        }
      >
        {segments.map(segment => (
          <ul
            key={segment}
            ref={segment === 0 ? segmentRef : undefined}
            className="acp-live-alerts__list acp-live-alerts__list-segment"
            aria-hidden={autoScroll && segment === 1 ? true : undefined}
          >
            {alerts.map(row => (
              <LiveAlertRow
                key={`${segment}-${row.fieldKey}`}
                row={row}
                selected={selectedFieldKey === row.fieldKey}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}

export function AcpLiveAlertsPanel({
  rows,
  indicatorScopeRows,
  viewportScopeActive = false,
}: Props) {
  const acp = useAcpPlatform()
  const [tab, setTab] = useState<MainTab>('alerts')
  const [subFilter, setSubFilter] = useState<SubFilter>(null)
  const [irrigationFilter, setIrrigationFilter] = useState<IrrigationAlertLevel | 'all'>('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const layer = acp.selectedWmsLayer
  const zoomLabel = acp.mapView.zoom != null ? `z${acp.mapView.zoom.toFixed(1)}` : 'z—'

  const { cards: indexCards } = useMemo(
    () => buildAcpIndicatorIndexCards(indicatorScopeRows),
    [indicatorScopeRows],
  )

  const alerts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const prioritized = [...rows].sort((a, b) => {
      const ra = ALERT_RANK[a.alertTier] ?? 9
      const rb = ALERT_RANK[b.alertTier] ?? 9
      return ra - rb
    })
    const alertish = prioritized.filter(r => r.alertTier !== 'stable' || r.severity !== 'normal')
    const pool = alertish.length ? alertish : prioritized

    return pool
      .filter(r => matchesSubFilter(r, subFilter))
      .filter(r => !q || r.displayName.toLowerCase().includes(q) || r.country.toLowerCase().includes(q))
  }, [rows, subFilter, query])

  const irrigationRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const scored: IrrigationRow[] = []
    for (const row of rows) {
      const cur = row.result?.current
      if (!cur) continue
      const decision = decideIrrigationAlert({
        zoneName: row.displayName,
        current: {
          ndvi: cur.ndvi,
          ndmi: cur.ndmi,
          ndwi: cur.ndwi,
        },
        previous: row.result?.previous7
          ? {
              ndvi: row.result.previous7.ndvi,
              ndmi: row.result.previous7.ndmi,
              ndwi: row.result.previous7.ndwi,
            }
          : null,
      })
      scored.push({
        fieldKey: row.fieldKey,
        displayName: row.displayName,
        country: row.country,
        areaHa: row.areaHa,
        imageDate: row.imageDate,
        decision,
      })
    }
    return scored
      .filter(r => irrigationFilter === 'all' || r.decision.alertLevel === irrigationFilter)
      .filter(
        r =>
          !q ||
          r.displayName.toLowerCase().includes(q) ||
          r.country.toLowerCase().includes(q) ||
          r.decision.label.toLowerCase().includes(q) ||
          r.decision.action.toLowerCase().includes(q),
      )
      .sort((a, b) => a.decision.priorityRank - b.decision.priorityRank || a.decision.iss - b.decision.iss)
  }, [rows, irrigationFilter, query])

  const selectField = (fieldKey: string) => {
    acp.bindMapFieldSelection(fieldKey)
  }

  return (
    <div className="acp-live-alerts">
      <div className="acp-pill-tabs acp-pill-tabs--main" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'indicators' ? 'is-on' : ''}
          aria-selected={tab === 'indicators'}
          onClick={() => setTab('indicators')}
        >
          Indicators
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'alerts' ? 'is-on' : ''}
          aria-selected={tab === 'alerts'}
          onClick={() => setTab('alerts')}
        >
          Live Alerts
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'irrigation' ? 'is-on' : ''}
          aria-selected={tab === 'irrigation'}
          title="ISS irrigation alerts — Critical → Overwatering with mm guidance"
          onClick={() => setTab('irrigation')}
        >
          Irrigation
        </button>
      </div>

      {tab === 'alerts' ? (
        <>
          <div className="acp-live-alerts__bar">
            <span className="acp-live-alerts__bar-title">
              Live Alerts
              {viewportScopeActive ? (
                <span className="acp-live-alerts__bar-scope"> · {rows.length} in map view</span>
              ) : null}
            </span>
            <div className="acp-live-alerts__bar-tools">
              <button
                type="button"
                className={`acp-live-alerts__bar-btn${searchOpen ? ' is-on' : ''}`}
                title="Search"
                onClick={() => setSearchOpen(v => !v)}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
              </button>
              <button
                type="button"
                className={`acp-live-alerts__bar-btn${subFilter ? ' is-on' : ''}`}
                title={
                  subFilter
                    ? `Filter: ${SUB_FILTERS.find(f => f.id === subFilter)?.title ?? subFilter} (click to cycle)`
                    : 'Cycle alert filter'
                }
                aria-pressed={Boolean(subFilter)}
                onClick={() =>
                  setSubFilter(prev => {
                    const idx = FILTER_CYCLE.indexOf(prev)
                    return FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length] ?? null
                  })
                }
              >
                <i className="fa-solid fa-filter" aria-hidden />
              </button>
              <span className="acp-live-alerts__live">
                <i className="acp-live-alerts__live-dot" aria-hidden /> Live
              </span>
            </div>
          </div>

          {searchOpen ? (
            <input
              type="search"
              className="acp-live-alerts__search-inline"
              placeholder="Filter alerts…"
              aria-label="Filter alerts"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          ) : null}

          {alerts.length ? (
            <LiveAlertsBoard
              alerts={alerts}
              selectedFieldKey={acp.selectedFieldKey}
              onSelect={selectField}
              scrollEnabled={!searchOpen && !query.trim()}
            />
          ) : (
            <p className="acp-empty acp-empty--inline">No active alerts in scope.</p>
          )}
        </>
      ) : tab === 'irrigation' ? (
        <>
          <div className="acp-live-alerts__bar">
            <span className="acp-live-alerts__bar-title">
              Irrigation Alerts
              <span className="acp-live-alerts__bar-scope"> · ISS · 10 m</span>
            </span>
            <div className="acp-live-alerts__bar-tools">
              <button
                type="button"
                className={`acp-live-alerts__bar-btn${searchOpen ? ' is-on' : ''}`}
                title="Search"
                onClick={() => setSearchOpen(v => !v)}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
              </button>
              <span className="acp-live-alerts__live">
                <i className="acp-live-alerts__live-dot" aria-hidden /> Live
              </span>
            </div>
          </div>

          <div className="acp-irrigation__tools" role="toolbar" aria-label="Irrigation alert tools">
            {IRRIGATION_TOOL_CHIPS.map(chip => {
              const color =
                chip.id === 'all' ? undefined : IRRIGATION_ALERT_LEVEL_COLORS[chip.id as IrrigationAlertLevel]
              const on = irrigationFilter === chip.id
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`acp-irrigation__tool${on ? ' is-on' : ''}`}
                  title={
                    chip.id === 'all'
                      ? 'Show all irrigation alert levels'
                      : `${chip.label} — ${chip.id === 'critical' ? 'Irrigate NOW' : IRRIGATION_ALERT_LEVEL_LABELS[chip.id as IrrigationAlertLevel]}`
                  }
                  aria-pressed={on}
                  style={
                    color
                      ? {
                          borderColor: on ? color : `${color}66`,
                          background: on ? `${color}33` : 'transparent',
                          color: color,
                        }
                      : undefined
                  }
                  onClick={() => setIrrigationFilter(chip.id)}
                >
                  {chip.id !== 'all' ? (
                    <i className="fa-solid fa-circle" style={{ fontSize: 7, color }} aria-hidden />
                  ) : (
                    <i className="fa-solid fa-faucet-drip" aria-hidden />
                  )}
                  {chip.label}
                </button>
              )
            })}
          </div>

          {searchOpen ? (
            <input
              type="search"
              className="acp-live-alerts__search-inline"
              placeholder="Filter irrigation zones…"
              aria-label="Filter irrigation zones"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          ) : null}

          {irrigationRows.length ? (
            <div className="acp-live-alerts__board">
              <ul className="acp-live-alerts__list">
                {irrigationRows.map(row => (
                  <IrrigationAlertRow
                    key={row.fieldKey}
                    row={row}
                    selected={acp.selectedFieldKey === row.fieldKey}
                    onSelect={selectField}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <p className="acp-empty acp-empty--inline">
              No irrigation alerts in scope — waiting for Layer Live NDVI/NDMI/NDWI…
            </p>
          )}
        </>
      ) : (
        <div className="acp-indicators">
          <div className="acp-indicators__live">
            <span className="acp-indicators__layer">
              {layer} · Layer Live · {indicatorScopeRows.length} in view · {zoomLabel}
            </span>
            <span className="acp-indicators__live-dot" aria-hidden />
          </div>
          {indexCards.length ? (
            <AcpIndicatorIndexGrid cards={indexCards} />
          ) : (
            <p className="acp-empty acp-empty--inline">
              Waiting for Layer Live statistics in map view…
            </p>
          )}
        </div>
      )}
    </div>
  )
}
