import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DchasRiskTier } from '../../../../lib/siCropAlertDchasBeacon'
import { DCHAS_HEALTHY_COLOR, DCHAS_ISOLATED_COLOR, resolveAcpFieldHvdColor } from '../../../../lib/siCropAlertDchasBeacon'
import { resolveFarmerFieldAction, resolveFarmerFieldActionTone } from '../../../../lib/farmerAlertAction'
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
  const [tab, setTab] = useState<'alerts' | 'indicators'>('alerts')
  const [subFilter, setSubFilter] = useState<SubFilter>(null)
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

  const selectField = (fieldKey: string) => {
    acp.requestFieldLocate(fieldKey)
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
