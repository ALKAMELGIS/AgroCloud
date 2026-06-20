import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useSiInstanceScope } from '../siInstanceScope'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import {
  buildCropAlertPopupViewModel,
  ensureChasTrendPointCount,
  CHAS_TREND_POINT_COUNT,
  estimateNdviFieldCoverageForScene,
  formatPopupAreaHa,
  mergePopupSceneDatesWithHistory,
  buildEmbeddedInsightForSceneDate,
  type NdviFieldCoverage,
} from '../../../lib/siCropAlertMapPopupModel'
import { resolveNearestValidSceneDate } from '../../../lib/siAdaptiveTemporalEngine'
import { CDSI_INSIGHT_FA_ICONS } from '../../../lib/siCropAlertDchasBeacon'
import { fetchCropAlertSentinelHistoryExtension } from '../../../lib/siCropAlertSentinelLive'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  mergeDailyIndexSeries,
  type SentinelHubDailyIndexMeans,
} from '../../../lib/sentinelHubStatisticsApi'
import { useOptionalAcpPlatform } from '../../dashboards/agroCloudPlatform/acpPlatformContext'
import './SiCropAlertMapPopup.css'

export type SiCropAlertMapPopupProps = {
  result: CropAlertFieldResult
  onClose: () => void
  /** Optional field coords override when cached result.centroid is missing. */
  coordsOverride?: { lat: number; lng: number } | null
  /** Compact card for map markers — fits without internal scroll. */
  variant?: 'default' | 'mapPin'
}

const POPUP_SIZE_CONFIG = {
  storageKey: 'si-crop-alert-popup-size',
  width: 320,
  height: 360,
  minWidth: 288,
  maxWidth: 400,
  minHeight: 280,
  maxHeight: 540,
} as const

const MAP_PIN_POPUP_SIZE_CONFIG = {
  storageKey: 'si-crop-alert-popup-size-map-pin',
  width: 292,
  height: 0,
  minWidth: 280,
  maxWidth: 304,
  minHeight: 0,
  maxHeight: 0,
} as const

const LAND_DONUT_SIZE = 88
const LAND_DONUT_R = 34
const LAND_DONUT_STROKE = 13

function LandCoverageVectorDonut({
  vegetationPct,
  bareAreaPct,
}: {
  vegetationPct: number
  bareAreaPct: number
}) {
  const cx = LAND_DONUT_SIZE / 2
  const cy = LAND_DONUT_SIZE / 2
  const circumference = 2 * Math.PI * LAND_DONUT_R
  const veg = Math.max(0, Math.min(100, vegetationPct))
  const vegLen = (veg / 100) * circumference

  return (
    <svg
      width={LAND_DONUT_SIZE}
      height={LAND_DONUT_SIZE}
      viewBox={`0 0 ${LAND_DONUT_SIZE} ${LAND_DONUT_SIZE}`}
      className="si-crop-alert-map-popup__land-pie-svg"
      role="img"
      aria-label={`Vegetation ${vegetationPct}%, bare area ${bareAreaPct}%`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={LAND_DONUT_R}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={LAND_DONUT_STROKE}
      />
      {veg > 0 ? (
        <circle
          cx={cx}
          cy={cy}
          r={LAND_DONUT_R}
          fill="none"
          stroke="#15803d"
          strokeWidth={LAND_DONUT_STROKE}
          strokeDasharray={`${vegLen} ${Math.max(0, circumference - vegLen)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="si-crop-alert-map-popup__land-pie-label"
      >
        {vegetationPct}%
      </text>
    </svg>
  )
}

const CHART_ACCENT = '#0f766e'

type PopupSize = { width: number; height: number }

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function loadPopupSize(storageKey: string): PopupSize {
  const cfg = POPUP_SIZE_CONFIG
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { width: cfg.width, height: cfg.height }
    const parsed = JSON.parse(raw) as Partial<PopupSize>
    const width = Number(parsed.width)
    const height = Number(parsed.height)
    return {
      width: Number.isFinite(width) ? clamp(Math.round(width), cfg.minWidth, cfg.maxWidth) : cfg.width,
      height:
        cfg.height > 0 && Number.isFinite(height) && height > 0
          ? clamp(Math.round(height), cfg.minHeight, cfg.maxHeight)
          : cfg.height,
    }
  } catch {
    return { width: cfg.width, height: cfg.height }
  }
}

function shortenCopy(text: string, max = 54): string {
  const s = text.trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 28 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

function formatSceneDateShort(iso: string): string {
  if (!iso || iso === '—') return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}/${m[3]}`
  return iso.length > 10 ? iso.slice(5) : iso
}

function isDateOnlyWarning(w: string | null | undefined): boolean {
  return Boolean(w?.trim().startsWith('Requested Date:'))
}

function ChasTrendLegend({ labels, values }: { labels: string[]; values: number[] }) {
  if (!labels.length) return null
  return (
    <ul
      className="si-crop-alert-map-popup__chart-legend si-crop-alert-map-popup__chart-legend--flow"
      style={{ '--legend-count': labels.length } as CSSProperties}
    >
      {labels.map((lbl, i) => (
        <li key={`${lbl}-${i}`} className="si-crop-alert-map-popup__chart-legend-item">
          <span className="si-crop-alert-map-popup__chart-legend-label">{lbl || `S${i + 1}`}</span>
          <span className="si-crop-alert-map-popup__chart-legend-value">
            {Number.isFinite(values[i]) ? values[i]!.toFixed(3) : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

const INDEX_TONE_CLASS: Record<'NDVI' | 'NDWI' | 'NDMI' | 'SAVI', string> = {
  NDVI: 'si-crop-alert-map-popup__metric-chip--ndvi',
  NDWI: 'si-crop-alert-map-popup__metric-chip--ndwi',
  NDMI: 'si-crop-alert-map-popup__metric-chip--ndmi',
  SAVI: 'si-crop-alert-map-popup__metric-chip--savi',
}

const CHAS_DIRECTION_LABEL = {
  rising: 'Rising',
  declining: 'Declining',
  stable: 'Stable',
} as const

type PopupEmbeddedIndexId = 'NDVI' | 'NDWI' | 'NDMI' | 'SAVI'

type PopupEmbeddedInsightShape = {
  summary: string
  action: string
  alertLevel: string
  chasLabels: string[]
  chasValues: number[]
  indices: Array<{ id: PopupEmbeddedIndexId; label: string; value: number }>
  chasTrend: { direction: 'rising' | 'declining' | 'stable' }
  deltaChas: number | null
}

function PopupIndexGrid({
  indices,
  indexSubLabel,
}: {
  indices: PopupEmbeddedInsightShape['indices']
  indexSubLabel: string
}) {
  return (
    <div className="si-crop-alert-map-popup__metric-grid">
      {indices.map(index => (
        <div
          key={index.id}
          className={`si-crop-alert-map-popup__metric-chip ${INDEX_TONE_CLASS[index.id]}`}
        >
          <span className="si-crop-alert-map-popup__metric-label">{index.label}</span>
          <strong
            className={`si-crop-alert-map-popup__metric-value${
              index.value < 0 ? ' si-crop-alert-map-popup__metric-value--negative' : ''
            }`}
          >
            {index.value.toFixed(2)}
          </strong>
          <span className="si-crop-alert-map-popup__metric-sub">{indexSubLabel}</span>
        </div>
      ))}
    </div>
  )
}

function PopupDeltaChasChip({ deltaChas }: { deltaChas: number }) {
  return (
    <div
      className={`si-crop-alert-map-popup__delta-chip${
        deltaChas < 0 ? ' si-crop-alert-map-popup__delta-chip--down' : ''
      }`}
    >
      <span className="si-crop-alert-map-popup__delta-chip-label">ΔCHAS</span>
      <strong className="si-crop-alert-map-popup__delta-chip-value">
        {deltaChas >= 0 ? '+' : ''}
        {deltaChas.toFixed(3)}
      </strong>
      <span className="si-crop-alert-map-popup__delta-chip-sub">vs previous scene</span>
    </div>
  )
}

function PopupActionBar({ action, mapPin }: { action: string; mapPin?: boolean }) {
  const text = action.trim()
  if (!text) return null
  return (
    <p
      className={[
        'si-crop-alert-map-popup__insight-action-bar',
        mapPin ? 'si-crop-alert-map-popup__insight-action-bar--map-pin' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={text}
    >
      {mapPin ? <em className="si-crop-alert-map-popup__insight-action-tag">Action</em> : null}
      {text}
    </p>
  )
}

function PopupChasTrendPanel({
  insight,
  mapPin,
}: {
  insight: PopupEmbeddedInsightShape
  mapPin: boolean
}) {
  if (insight.chasLabels.length < 2) return null
  return (
    <div className="si-crop-alert-map-popup__chas-panel">
      <div className="si-crop-alert-map-popup__chas-panel-head">
        <span className="si-crop-alert-map-popup__chas-panel-title">CHAS trend</span>
        <span
          className={`si-crop-alert-map-popup__chas-direction si-crop-alert-map-popup__chas-direction--${insight.chasTrend.direction}`}
        >
          {CHAS_DIRECTION_LABEL[insight.chasTrend.direction]}
        </span>
      </div>
      {mapPin ? (
        <ChartsPanel embedded mapPin chasLabels={insight.chasLabels} chasValues={insight.chasValues} />
      ) : (
        <ChasTrendLegend labels={insight.chasLabels} values={insight.chasValues} />
      )}
    </div>
  )
}

function EmbeddedInsightBoard({
  insight,
  dataWarning,
  indexSubLabel = 'current',
  variant = 'default',
}: {
  insight: PopupEmbeddedInsightShape
  dataWarning: string | null
  indexSubLabel?: string
  variant?: 'default' | 'mapPin'
}) {
  const isMapPin = variant === 'mapPin'
  const showWarning = Boolean(dataWarning?.trim()) && !isDateOnlyWarning(dataWarning)

  return (
    <div
      className={[
        'si-crop-alert-map-popup__insight',
        'si-crop-alert-map-popup__insight--embedded',
        isMapPin ? 'si-crop-alert-map-popup__insight--map-pin' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={insight.summary}
    >
      {isMapPin ? (
        <>
          <div className="si-crop-alert-map-popup__priority-block">
            {insight.deltaChas != null ? <PopupDeltaChasChip deltaChas={insight.deltaChas} /> : null}
            <PopupActionBar action={insight.action} mapPin />
          </div>
          <PopupChasTrendPanel insight={insight} mapPin />
          <PopupIndexGrid indices={insight.indices} indexSubLabel={indexSubLabel} />
        </>
      ) : (
        <>
          <PopupIndexGrid indices={insight.indices} indexSubLabel={indexSubLabel} />
          <PopupChasTrendPanel insight={insight} mapPin={false} />
          {insight.deltaChas != null ? <PopupDeltaChasChip deltaChas={insight.deltaChas} /> : null}
          <PopupActionBar action={insight.action} />
        </>
      )}

      {showWarning ? (
        <div className="si-crop-alert-map-popup__insight-warn" title={dataWarning!}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
          <span>{shortenCopy(dataWarning!, 64)}</span>
        </div>
      ) : null}
    </div>
  )
}

type PopupEssentialsCardProps = {
  embeddedInsight: PopupEmbeddedInsightShape
  dataWarning: string | null
  indexSubLabel?: string
  variant?: 'default' | 'mapPin'
}

function PopupEssentialsCard({ embeddedInsight, dataWarning, indexSubLabel, variant }: PopupEssentialsCardProps) {
  return (
    <div className="si-crop-alert-map-popup__essentials">
      <EmbeddedInsightBoard
        insight={embeddedInsight}
        dataWarning={dataWarning}
        indexSubLabel={indexSubLabel}
        variant={variant}
      />
    </div>
  )
}

type LandCoverageSceneDateControlProps = {
  sceneDates: string[]
  sceneDate: string
  onSceneDateChange: (date: string) => void
  sceneHistoryLoading?: boolean
  variant?: 'land' | 'mapPin'
}

function stopPopupPointerEvent(e: React.SyntheticEvent) {
  e.stopPropagation()
}

function snapSceneDateToCatalog(picked: string, sceneDates: string[]): string {
  const want = picked.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) return want
  if (!sceneDates.length || sceneDates.includes(want)) return want
  return resolveNearestValidSceneDate(want, sceneDates, 9999) ?? sceneDates[0] ?? want
}

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return
  input.focus({ preventScroll: true })
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    /* fall through */
  }
  input.click()
}

function LandCoverageSceneDateControl({
  sceneDates,
  sceneDate,
  onSceneDateChange,
  sceneHistoryLoading = false,
  variant = 'land',
}: LandCoverageSceneDateControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const newest = sceneDates[0] ?? sceneDate
  const oldest = sceneDates[sceneDates.length - 1] ?? sceneDate
  const minDate = useMemo(() => {
    if (sceneDates.length >= 2) return oldest
    const anchor = newest || sceneDate
    const end = new Date(`${anchor}T12:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 120)
    return end.toISOString().slice(0, 10)
  }, [newest, oldest, sceneDate, sceneDates.length])
  const maxDate = newest || sceneDate

  const openPicker = useCallback((e: React.SyntheticEvent) => {
    stopPopupPointerEvent(e)
    openNativeDatePicker(inputRef.current)
  }, [])

  const handleDateChange = useCallback(
    (raw: string) => {
      onSceneDateChange(snapSceneDateToCatalog(raw, sceneDates))
    },
    [onSceneDateChange, sceneDates],
  )

  return (
    <div
      className={[
        'si-crop-alert-map-popup__land-date-wrap',
        variant === 'mapPin' ? 'si-crop-alert-map-popup__land-date-wrap--map-pin' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={stopPopupPointerEvent}
    >
      {variant === 'mapPin' ? (
        <button
          type="button"
          className="si-crop-alert-map-popup__scene-date-btn"
          title={`Scene date · ${sceneDate}`}
          aria-label="Select scene date for indices and CHAS"
          aria-busy={sceneHistoryLoading}
          onClick={openPicker}
        >
          <i className="fa-regular fa-calendar-days" aria-hidden />
        </button>
      ) : (
        <span
          className="si-crop-alert-map-popup__land-date-label"
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openPicker(e)
            }
          }}
        >
          Scene
        </span>
      )}
      <input
        ref={inputRef}
        type="date"
        className={[
          'si-crop-alert-map-popup__land-date-select',
          'si-crop-alert-map-popup__land-date-input',
          variant === 'mapPin' ? 'si-crop-alert-map-popup__land-date-input--map-pin' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        value={sceneDate}
        min={minDate}
        max={maxDate}
        onChange={e => handleDateChange(e.target.value)}
        onClick={openPicker}
        onPointerDown={stopPopupPointerEvent}
        aria-label="Pick scene date for field analytics"
        aria-busy={sceneHistoryLoading}
      />
    </div>
  )
}

type LandCoverageStripProps = {
  coverage: NdviFieldCoverage
  sceneDates: string[]
  sceneDate: string
  onSceneDateChange: (date: string) => void
  sceneHistoryLoading?: boolean
  embedded?: boolean
}

function LandCoverageStrip({
  coverage,
  sceneDates,
  sceneDate,
  onSceneDateChange,
  sceneHistoryLoading = false,
  embedded = false,
}: LandCoverageStripProps) {
  const vegetationPct = coverage.vegetationPct
  const bareAreaPct = coverage.bareAreaPct
  const vegetationHa = coverage.vegetationHa
  const bareAreaHa = coverage.bareAreaHa
  const fieldAreaHa = coverage.fieldAreaHa

  return (
    <div
      className={[
        'si-crop-alert-map-popup__land-strip',
        embedded ? 'si-crop-alert-map-popup__land-strip--embedded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="si-crop-alert-map-popup__land-head">
        {embedded ? null : (
          <span className="si-crop-alert-map-popup__land-title" title="NDVI land split">
            <i className="fa-solid fa-chart-pie" aria-hidden />
          </span>
        )}
        <div className="si-crop-alert-map-popup__land-head-meta">
          {sceneDate ? (
            <LandCoverageSceneDateControl
              sceneDates={sceneDates.length ? sceneDates : [sceneDate]}
              sceneDate={sceneDate}
              onSceneDateChange={onSceneDateChange}
              sceneHistoryLoading={sceneHistoryLoading}
            />
          ) : null}
          {fieldAreaHa != null ? (
            <span className="si-crop-alert-map-popup__land-total" title="Field area">
              <i className="fa-solid fa-vector-square" aria-hidden />
              {formatPopupAreaHa(fieldAreaHa)}
            </span>
          ) : null}
        </div>
      </div>

      <LandCoverageVectorDonut vegetationPct={vegetationPct} bareAreaPct={bareAreaPct} />

      <div className="si-crop-alert-map-popup__land-metrics">
        <div className="si-crop-alert-map-popup__land-metric si-crop-alert-map-popup__land-metric--veg" title="Planted cover">
          <span className="si-crop-alert-map-popup__land-metric-icon" aria-hidden>
            <i className="fa-solid fa-leaf" />
          </span>
          <em>{vegetationPct}%</em>
          {vegetationHa != null ? <small>{formatPopupAreaHa(vegetationHa)}</small> : null}
        </div>
        <div className="si-crop-alert-map-popup__land-metric si-crop-alert-map-popup__land-metric--bare" title="Bare area">
          <span className="si-crop-alert-map-popup__land-metric-icon" aria-hidden>
            <i className="fa-solid fa-mountain-sun" />
          </span>
          <em>{bareAreaPct}%</em>
          {bareAreaHa != null ? <small>{formatPopupAreaHa(bareAreaHa)}</small> : null}
        </div>
      </div>
    </div>
  )
}

function SmartCropInsightBadge({
  insight,
}: {
  insight: ReturnType<typeof buildCropAlertPopupViewModel>['smartCropInsight']
}) {
  return (
    <div
      className="si-crop-alert-map-popup__smart-insight"
      style={{ '--insight-tone': insight.color } as CSSProperties}
      title={`CDSI ${insight.cdsi.toFixed(3)} · ${insight.label}`}
      aria-label={`${insight.label} · CDSI ${insight.cdsi.toFixed(3)}`}
    >
      <span className="si-crop-alert-map-popup__smart-insight-icon" aria-hidden>
        <i className={CDSI_INSIGHT_FA_ICONS[insight.tier]} />
      </span>
      <span className="si-crop-alert-map-popup__smart-insight-status">
        <strong>{insight.label}</strong>
        <em>
          CDSI <span>{insight.cdsi.toFixed(3)}</span>
        </em>
      </span>
    </div>
  )
}

function resolvePopupIndexDataDate(vm: ReturnType<typeof buildCropAlertPopupViewModel>): string {
  const raw = vm.usedDate || vm.layerLive.sceneDate || vm.analysisDate || ''
  return raw.trim().slice(0, 10)
}

const CHART_W = 268
const CHART_H = 64
const CHART_W_MAP_PIN = 276
const CHART_H_MAP_PIN = 56
/** CHAS is a 0–1 weighted index — fixed domain keeps sparkline height aligned with legend values. */
const CHAS_SPARKLINE_DOMAIN_MIN = 0
const CHAS_SPARKLINE_DOMAIN_MAX = 1

function resolveChasSparklineDomain(values: number[]): { min: number; max: number } {
  const nums = values.filter(v => Number.isFinite(v))
  if (nums.length < 2) {
    return { min: CHAS_SPARKLINE_DOMAIN_MIN, max: CHAS_SPARKLINE_DOMAIN_MAX }
  }
  const dataMin = Math.min(...nums)
  const dataMax = Math.max(...nums)
  let span = dataMax - dataMin
  if (span <= 0) {
    const mid = (dataMin + dataMax) / 2
    const pad = Math.max(Math.abs(mid) * 0.2, 0.02)
    return { min: mid - pad, max: mid + pad }
  }
  if (span < 0.002) {
    const pad = Math.max(Math.abs(dataMin) * 0.15, 0.015)
    return { min: dataMin - pad, max: dataMax + pad }
  }
  const pad = Math.max(span * 0.28, 0.008)
  return { min: dataMin - pad, max: dataMax + pad }
}

function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  pad = 8,
  domainMin = CHAS_SPARKLINE_DOMAIN_MIN,
  domainMax = CHAS_SPARKLINE_DOMAIN_MAX,
): string {
  if (values.length === 0) return ''
  const finite = computeSparklinePoints(values, width, height, pad, domainMin, domainMax).filter(p =>
    Number.isFinite(p.v),
  )
  if (finite.length === 0) return ''
  return finite
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

function computeSparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 8,
  domainMin = CHAS_SPARKLINE_DOMAIN_MIN,
  domainMax = CHAS_SPARKLINE_DOMAIN_MAX,
) {
  if (values.length === 0) return [] as Array<{ i: number; v: number; x: number; y: number }>
  const min = domainMin
  const max = domainMax
  const span = max - min || 0.001
  const innerW = width - pad * 2
  const innerH = height - pad * 2

  return values.map((v, i) => ({
    i,
    v,
    x: pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW),
    y: pad + innerH - ((v - min) / span) * innerH,
  }))
}

function resolveNearestSparklineIndex(
  clientX: number,
  svg: SVGSVGElement,
  points: Array<{ x: number }>,
  chartWidth: number,
): number {
  if (points.length === 0) return 0
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0) return 0
  const mx = ((clientX - rect.left) / rect.width) * chartWidth
  let nearest = 0
  let minDist = Infinity
  points.forEach((p, idx) => {
    const d = Math.abs(p.x - mx)
    if (d < minDist) {
      minDist = d
      nearest = idx
    }
  })
  return nearest
}

function buildSparklineAreaPath(
  values: number[],
  width: number,
  height: number,
  pad = 8,
  domainMin = CHAS_SPARKLINE_DOMAIN_MIN,
  domainMax = CHAS_SPARKLINE_DOMAIN_MAX,
): string {
  const finite = computeSparklinePoints(values, width, height, pad, domainMin, domainMax).filter(p =>
    Number.isFinite(p.v),
  )
  const line = buildSparklinePath(values, width, height, pad, domainMin, domainMax)
  if (!line || finite.length === 0) return ''
  const innerH = height - pad * 2
  const baseY = pad + innerH
  const firstX = finite[0]!.x
  const lastX = finite[finite.length - 1]!.x
  return `${line} L ${lastX.toFixed(1)},${baseY.toFixed(1)} L ${firstX.toFixed(1)},${baseY.toFixed(1)} Z`
}

function ChartsPanel({
  chasLabels,
  chasValues,
  embedded = false,
  mapPin = false,
}: {
  chasLabels: string[]
  chasValues: number[]
  embedded?: boolean
  mapPin?: boolean
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const pad = mapPin ? 8 : 8
  const chartW = mapPin ? CHART_W_MAP_PIN : CHART_W
  const chartH = mapPin ? CHART_H_MAP_PIN : CHART_H
  const series = useMemo(
    () =>
      mapPin
        ? ensureChasTrendPointCount({ labels: chasLabels, values: chasValues })
        : { labels: chasLabels, values: chasValues },
    [chasLabels, chasValues, mapPin],
  )
  const displayLabels = series.labels
  const displayValues = series.values
  const domain = useMemo(() => resolveChasSparklineDomain(displayValues), [displayValues])
  const points = useMemo(
    () => computeSparklinePoints(displayValues, chartW, chartH, pad, domain.min, domain.max),
    [displayValues, pad, domain.min, domain.max, chartW, chartH],
  )
  const sparkPath = useMemo(
    () => buildSparklinePath(displayValues, chartW, chartH, pad, domain.min, domain.max),
    [displayValues, pad, domain.min, domain.max, chartW, chartH],
  )
  const sparkArea = useMemo(
    () => buildSparklineAreaPath(displayValues, chartW, chartH, pad, domain.min, domain.max),
    [displayValues, pad, domain.min, domain.max, chartW, chartH],
  )
  const activeIndex = hoverIndex
  const activePoint =
    activeIndex != null && Number.isFinite(displayValues[activeIndex])
      ? points[activeIndex]
      : null

  const onChartPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mapPin) return
      const idx = resolveNearestSparklineIndex(e.clientX, e.currentTarget, points, chartW)
      if (!Number.isFinite(displayValues[idx])) return
      setHoverIndex(idx)
    },
    [points, chartW, displayValues, mapPin],
  )

  const onChartPointerLeave = useCallback(() => {
    if (mapPin) return
    setHoverIndex(null)
  }, [mapPin])

  const onLegendEnter = useCallback(
    (index: number) => {
      if (!Number.isFinite(displayValues[index])) return
      setHoverIndex(index)
    },
    [displayValues],
  )

  const legendCount = mapPin ? CHAS_TREND_POINT_COUNT : displayLabels.length

  const chartBody = (
    <>
      {!embedded ? (
        <h4 className="si-crop-alert-map-popup__chart-title">CHAS Trend</h4>
      ) : null}
      <div
        className={[
          'si-crop-alert-map-popup__spark-wrap',
          mapPin ? '' : 'si-crop-alert-map-popup__spark-wrap--interactive',
        ]
          .filter(Boolean)
          .join(' ')}
      >
          {!mapPin && activePoint && activeIndex != null ? (
            <div
              className="si-crop-alert-map-popup__spark-tooltip"
              style={{
                left: `${(activePoint.x / chartW) * 100}%`,
                top: `${(activePoint.y / chartH) * 100}%`,
              }}
              aria-live="polite"
            >
              <span className="si-crop-alert-map-popup__spark-tooltip-date">
                {displayLabels[activeIndex] || `S${activeIndex + 1}`}
              </span>
              <strong className="si-crop-alert-map-popup__spark-tooltip-value">
                {Number.isFinite(displayValues[activeIndex]) ? displayValues[activeIndex]!.toFixed(3) : '—'}
              </strong>
            </div>
          ) : null}
          <svg
            width="100%"
            height={chartH}
            viewBox={`0 0 ${chartW} ${chartH}`}
            preserveAspectRatio="xMidYMid meet"
            className="si-crop-alert-map-popup__spark"
            onPointerMove={mapPin ? undefined : onChartPointerMove}
            onPointerLeave={mapPin ? undefined : onChartPointerLeave}
            role="img"
            aria-label="CHAS trend chart"
          >
            {[0.25, 0.5, 0.75].map(t => {
              const y = pad + (chartH - pad * 2) * (1 - t)
              return (
                <line key={t} x1={pad} y1={y} x2={chartW - pad} y2={y} className="si-crop-alert-map-popup__spark-grid" />
              )
            })}
            {sparkArea ? (
              <path d={sparkArea} className="si-crop-alert-map-popup__spark-area" fill={CHART_ACCENT} />
            ) : null}
            <path
              d={sparkPath}
              fill="none"
              stroke={CHART_ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="si-crop-alert-map-popup__spark-line"
            />
            {activePoint ? (
              <line
                x1={activePoint.x}
                y1={pad}
                x2={activePoint.x}
                y2={chartH - pad}
                className="si-crop-alert-map-popup__spark-crosshair"
              />
            ) : null}
            {points.map(p => {
              if (!Number.isFinite(p.v)) return null
              const isActive = activeIndex === p.i
              return (
                <g key={p.i} className={isActive ? 'si-crop-alert-map-popup__spark-point--active' : undefined}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 8 : 7}
                    className="si-crop-alert-map-popup__spark-hit"
                    onPointerEnter={() => onLegendEnter(p.i)}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 5 : 3.5}
                    fill={CHART_ACCENT}
                    className={[
                      'si-crop-alert-map-popup__spark-dot',
                      isActive ? 'si-crop-alert-map-popup__spark-dot--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                </g>
              )
            })}
          </svg>
        </div>
        <ul
          className={[
            'si-crop-alert-map-popup__chart-legend',
            mapPin ? 'si-crop-alert-map-popup__chart-legend--map-pin' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--legend-count': legendCount } as CSSProperties}
        >
          {displayLabels.map((lbl, i) => {
            const hasValue = Number.isFinite(displayValues[i])
            return (
            <li
              key={`${lbl}-${i}`}
              className={[
                'si-crop-alert-map-popup__chart-legend-item',
                !hasValue ? 'si-crop-alert-map-popup__chart-legend-item--empty' : '',
                activeIndex === i ? 'si-crop-alert-map-popup__chart-legend-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => onLegendEnter(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <span className="si-crop-alert-map-popup__chart-legend-label">{lbl || `S${i + 1}`}</span>
              <span className="si-crop-alert-map-popup__chart-legend-value">
                {hasValue ? displayValues[i]!.toFixed(3) : '—'}
              </span>
            </li>
            )
          })}
        </ul>
    </>
  )

  if (embedded) {
    return (
      <div
        className={[
          'si-crop-alert-map-popup__charts',
          'si-crop-alert-map-popup__charts--embedded',
          mapPin ? 'si-crop-alert-map-popup__charts--map-pin' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--chart-accent': CHART_ACCENT } as CSSProperties}
      >
        {chartBody}
      </div>
    )
  }

  return (
    <div className="si-crop-alert-map-popup__charts" style={{ '--chart-accent': CHART_ACCENT } as CSSProperties}>
      <div className="si-crop-alert-map-popup__chart-card">
        {chartBody}
      </div>
    </div>
  )
}

type FieldAnalyticsTab = 'coverage' | 'chas'

type FieldAnalyticsTabsCardProps = {
  coverage: NdviFieldCoverage
  sceneDates: string[]
  sceneDate: string
  onSceneDateChange: (date: string) => void
  sceneHistoryLoading?: boolean
  chasLabels: string[]
  chasValues: number[]
}

function FieldAnalyticsTabsCard({
  coverage,
  sceneDates,
  sceneDate,
  onSceneDateChange,
  sceneHistoryLoading = false,
  chasLabels,
  chasValues,
}: FieldAnalyticsTabsCardProps) {
  const [tab, setTab] = useState<FieldAnalyticsTab>('coverage')

  return (
    <div className="si-crop-alert-map-popup__analytics-card">
      <header className="si-crop-alert-map-popup__analytics-head">
        <div
          className="si-crop-alert-map-popup__analytics-tabs"
          role="tablist"
          aria-label="Field analytics"
        >
          <button
            type="button"
            role="tab"
            id="si-popup-analytics-tab-coverage"
            aria-selected={tab === 'coverage'}
            aria-controls="si-popup-analytics-panel-coverage"
            className={[
              'si-crop-alert-map-popup__analytics-tab',
              tab === 'coverage' ? 'si-crop-alert-map-popup__analytics-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('coverage')}
          >
            <i className="fa-solid fa-chart-pie" aria-hidden />
            <span>Land split</span>
          </button>
          <button
            type="button"
            role="tab"
            id="si-popup-analytics-tab-chas"
            aria-selected={tab === 'chas'}
            aria-controls="si-popup-analytics-panel-chas"
            className={[
              'si-crop-alert-map-popup__analytics-tab',
              tab === 'chas' ? 'si-crop-alert-map-popup__analytics-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('chas')}
          >
            <i className="fa-solid fa-chart-line" aria-hidden />
            <span>CHAS trend</span>
          </button>
        </div>
      </header>

      <div
        id="si-popup-analytics-panel-coverage"
        role="tabpanel"
        aria-labelledby="si-popup-analytics-tab-coverage"
        hidden={tab !== 'coverage'}
        className="si-crop-alert-map-popup__analytics-panel"
      >
        {tab === 'coverage' ? (
          <LandCoverageStrip
            embedded
            coverage={coverage}
            sceneDates={sceneDates}
            sceneDate={sceneDate}
            onSceneDateChange={onSceneDateChange}
            sceneHistoryLoading={sceneHistoryLoading}
          />
        ) : null}
      </div>

      <div
        id="si-popup-analytics-panel-chas"
        role="tabpanel"
        aria-labelledby="si-popup-analytics-tab-chas"
        hidden={tab !== 'chas'}
        className="si-crop-alert-map-popup__analytics-panel"
      >
        {tab === 'chas' ? (
          <ChartsPanel embedded chasLabels={chasLabels} chasValues={chasValues} />
        ) : null}
      </div>
    </div>
  )
}

export function SiCropAlertMapPopup({
  result,
  onClose,
  variant = 'default',
}: SiCropAlertMapPopupProps) {
  const isMapPin = variant === 'mapPin'
  const acp = useOptionalAcpPlatform()
  const { scopedStorageKey } = useSiInstanceScope()
  const preset = isMapPin ? MAP_PIN_POPUP_SIZE_CONFIG : POPUP_SIZE_CONFIG
  const popupSizeStorageKey = scopedStorageKey(preset.storageKey)
  const popupRef = useRef<HTMLDivElement>(null)
  const [cardSize, setCardSize] = useState<PopupSize>(() => loadPopupSize(popupSizeStorageKey))

  const vm = useMemo(() => buildCropAlertPopupViewModel(result), [result])
  const indexDataDate = useMemo(() => resolvePopupIndexDataDate(vm), [vm])
  const [sceneHistory, setSceneHistory] = useState<SentinelHubDailyIndexMeans[]>([])
  const [sceneHistoryLoading, setSceneHistoryLoading] = useState(false)
  const sceneDates = useMemo(
    () => mergePopupSceneDatesWithHistory(result, sceneHistory),
    [result, sceneHistory],
  )
  const [coverageSceneDate, setCoverageSceneDate] = useState(() => indexDataDate)
  useEffect(() => {
    setCoverageSceneDate(prev => {
      if (sceneDates.includes(prev)) return prev
      return sceneDates[0] ?? indexDataDate
    })
  }, [result.fieldKey, sceneDates, indexDataDate])

  useEffect(() => {
    if (!acp) return
    const want = acp.analysisDate.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) return
    const next = sceneDates.includes(want)
      ? want
      : resolveNearestValidSceneDate(want, sceneDates, 9999) ?? sceneDates[0] ?? want
    setCoverageSceneDate(next)
  }, [acp, acp?.analysisDate, sceneDates])

  useEffect(() => {
    if (!result.geometry) {
      setSceneHistory([])
      return
    }
    let cancelled = false
    const toIso = indexDataDate || new Date().toISOString().slice(0, 10)
    const end = new Date(`${toIso}T12:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 120)
    const fromIso = end.toISOString().slice(0, 10)
    if (!fromIso || fromIso >= toIso) return

    setSceneHistoryLoading(true)
    void fetchCropAlertSentinelHistoryExtension(
      [
        {
          fieldKey: result.fieldKey,
          objectId: result.objectId,
          farmName: result.farmName,
          farmCode: result.farmCode,
          structureType: result.structureType,
          country: '',
          city: '',
          centroid: result.centroid,
          geometry: result.geometry,
        },
      ],
      { fromIso, toIso, concurrency: 1 },
    )
      .then(map => {
        if (cancelled) return
        setSceneHistory(map.get(result.fieldKey) ?? [])
      })
      .catch(() => {
        if (!cancelled) setSceneHistory([])
      })
      .finally(() => {
        if (!cancelled) setSceneHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [result.fieldKey, result.geometry, result.objectId, result.farmName, result.farmCode, result.structureType, result.centroid, indexDataDate])

  const coverageForScene = useMemo(
    () => estimateNdviFieldCoverageForScene(result, coverageSceneDate || indexDataDate, sceneHistory),
    [result, coverageSceneDate, indexDataDate, sceneHistory],
  )

  const handleCoverageSceneDateChange = useCallback(
    (date: string) => {
      const next = date.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return
      setCoverageSceneDate(next)
      if (acp) {
        acp.setAutoFollowDate(false)
        acp.setAnalysisDate(next)
        acp.commitWmsLayer({ startDate: next, endDate: next })
        acp.refreshEngine()
      }
      if (!result.geometry) return
      void fetchSentinelFieldIndexTimeSeriesForRange({
        geometry: result.geometry,
        fromIso: next,
        toIso: next,
      }).then(rows => {
        if (!rows.length) return
        setSceneHistory(prev => {
          if (prev.some(row => String(row.date || '').trim().slice(0, 10) === next)) return prev
          return mergeDailyIndexSeries(prev, rows)
        })
      })
    },
    [acp, result.geometry],
  )

  const popupHeight = isMapPin ? 0 : cardSize.height || preset.height
  const alertTone = vm.accentColor || '#ca8a04'
  const selectedSceneDate = coverageSceneDate || indexDataDate
  const latestSceneDate = sceneDates[0] ?? indexDataDate
  const indexSubLabel =
    selectedSceneDate === latestSceneDate ? 'current' : formatSceneDateShort(selectedSceneDate)
  const displayEmbeddedInsight = useMemo(
    () => buildEmbeddedInsightForSceneDate(result, selectedSceneDate, sceneHistory),
    [result, sceneHistory, selectedSceneDate],
  )
  const displayAlertLevel = displayEmbeddedInsight.alertLevel || vm.alert.level

  useEffect(() => {
    setCardSize(loadPopupSize(popupSizeStorageKey))
  }, [popupSizeStorageKey])

  const persistSize = useCallback(
    (size: PopupSize) => {
      try {
        localStorage.setItem(popupSizeStorageKey, JSON.stringify(size))
      } catch {
        /* ignore */
      }
    },
    [popupSizeStorageKey],
  )

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startY = e.clientY
      const startW = cardSize.width
      const startH = cardSize.height || popupRef.current?.offsetHeight || preset.height

      const onMove = (ev: globalThis.PointerEvent) => {
        setCardSize({
          width: clamp(Math.round(startW + (ev.clientX - startX)), preset.minWidth, preset.maxWidth),
          height: clamp(Math.round(startH + (ev.clientY - startY)), preset.minHeight, preset.maxHeight),
        })
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setCardSize(prev => {
          persistSize(prev)
          return prev
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [cardSize.height, cardSize.width, persistSize, preset],
  )

  return (
    <div
      ref={popupRef}
      className={[
        'si-crop-alert-map-popup',
        'si-crop-alert-map-popup--lux',
        'si-crop-alert-map-popup--compact',
        isMapPin ? 'si-crop-alert-map-popup--map-pin' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--popup-accent': alertTone,
          width: isMapPin ? preset.width : cardSize.width,
          ...(isMapPin ? {} : { height: popupHeight }),
        } as CSSProperties
      }
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      role="dialog"
      aria-label={`${vm.fieldName} — ${vm.alert.level}`}
    >
      <div className="si-crop-alert-map-popup__glow" aria-hidden />

      <header
        className={[
          'si-crop-alert-map-popup__head',
          isMapPin ? 'si-crop-alert-map-popup__head--map-pin' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isMapPin ? (
          <>
            <button
              type="button"
              className="si-crop-alert-map-popup__head-close"
              onClick={onClose}
              aria-label="Close crop alert popup"
            >
              ×
            </button>
            <div className="si-crop-alert-map-popup__head-toolbar">
              <div className="si-crop-alert-map-popup__head-identity">
                <div className="si-crop-alert-map-popup__head-title-stack">
                  <span className="si-crop-alert-map-popup__field-name" title={vm.fieldName}>
                    {vm.fieldName}
                  </span>
                  <div className="si-crop-alert-map-popup__head-meta">
                    {vm.fieldId.trim().toLowerCase() !== vm.fieldName.trim().toLowerCase() ? (
                      <span className="si-crop-alert-map-popup__field-id">{vm.fieldId}</span>
                    ) : null}
                    <span className="si-crop-alert-map-popup__badge">{displayAlertLevel}</span>
                  </div>
                </div>
              </div>
              <LandCoverageSceneDateControl
                variant="mapPin"
                sceneDates={sceneDates}
                sceneDate={selectedSceneDate}
                onSceneDateChange={handleCoverageSceneDateChange}
                sceneHistoryLoading={sceneHistoryLoading}
              />
            </div>
          </>
        ) : (
          <>
        <div className="si-crop-alert-map-popup__head-main">
          <div className="si-crop-alert-map-popup__title-row">
            <span className="si-crop-alert-map-popup__field-id">{vm.fieldId}</span>
            <span className="si-crop-alert-map-popup__badge">{displayAlertLevel}</span>
          </div>
          <p className="si-crop-alert-map-popup__coords">{vm.latLonLine}</p>
          <div className="si-crop-alert-map-popup__head-dates">
            <span title={`Requested ${vm.requestedDate}`}>
              <i className="fa-regular fa-calendar" aria-hidden />
              {formatSceneDateShort(vm.requestedDate)}
            </span>
            <i className="fa-solid fa-chevron-right" aria-hidden />
            <span title={`Scene ${vm.usedDate}`}>
              <i className="fa-solid fa-satellite" aria-hidden />
              {formatSceneDateShort(vm.usedDate)}
            </span>
          </div>
        </div>
        <div className="si-crop-alert-map-popup__head-side">
          <SmartCropInsightBadge insight={vm.smartCropInsight} />
          <div className="si-crop-alert-map-popup__head-actions">
            <button type="button" onClick={onClose} aria-label="Close crop alert popup">
              ×
            </button>
          </div>
        </div>
          </>
        )}
      </header>

      <div className="si-crop-alert-map-popup__body">
        <div className="si-crop-alert-map-popup__scroll" data-agrocloud-map-wheel-scroll>
          <section className="si-crop-alert-map-popup__section si-crop-alert-map-popup__section--essentials">
            <PopupEssentialsCard
              embeddedInsight={displayEmbeddedInsight}
              dataWarning={vm.dataWarning}
              indexSubLabel={isMapPin ? indexSubLabel : 'current'}
              variant={isMapPin ? 'mapPin' : 'default'}
            />
          </section>

          {isMapPin ? null : (
          <section className="si-crop-alert-map-popup__section si-crop-alert-map-popup__section--analytics">
            <FieldAnalyticsTabsCard
              coverage={coverageForScene}
              sceneDates={sceneDates}
              sceneDate={selectedSceneDate}
              onSceneDateChange={handleCoverageSceneDateChange}
              sceneHistoryLoading={sceneHistoryLoading}
              chasLabels={displayEmbeddedInsight.chasLabels}
              chasValues={displayEmbeddedInsight.chasValues}
            />
          </section>
          )}

          {isMapPin ? null : (
          <footer className="si-crop-alert-map-popup__foot">
            {vm.interpretationLines[1] ? (
              <p className="si-crop-alert-map-popup__footnote">
                {shortenCopy(vm.interpretationLines[1], 88)}
              </p>
            ) : null}
            <p className="si-crop-alert-map-popup__footer">
              {vm.analysisDate} · {vm.dataSource}
            </p>
          </footer>
          )}
        </div>
      </div>

      {isMapPin ? null : (
      <div
        className="si-crop-alert-map-popup__resize"
        role="separator"
        aria-label="Resize card"
        title="Drag to resize card"
        onPointerDown={onResizePointerDown}
      >
        <svg viewBox="0 0 10 10" aria-hidden className="si-crop-alert-map-popup__resize-grip">
          <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <path d="M9 5v4H5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </div>
      )}

      <span className="si-crop-alert-map-popup__tail" aria-hidden />
    </div>
  )
}
