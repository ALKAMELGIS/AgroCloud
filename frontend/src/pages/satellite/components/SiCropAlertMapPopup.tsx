import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useSiInstanceScope } from '../siInstanceScope'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import {
  fetchOpenMeteoWeather,
  wmoWeatherIconClass,
  wmoWeatherToneClass,
  type OpenMeteoWeatherSnapshot,
} from '../../../lib/openMeteoWeather'
import {
  buildCropAlertPopupViewModel,
  estimateNdviFieldCoverageForScene,
  formatPopupAreaHa,
  listPopupSceneDates,
  type IndexMinMaxMean,
  type IndexTrendDirection,
  type NdviFieldCoverage,
} from '../../../lib/siCropAlertMapPopupModel'
import './SiCropAlertMapPopup.css'

export type SiCropAlertMapPopupProps = {
  result: CropAlertFieldResult
  onClose: () => void
  /** Optional field coords override when cached result.centroid is missing. */
  coordsOverride?: { lat: number; lng: number } | null
  weatherSnapshot?: OpenMeteoWeatherSnapshot | null
  weatherLoading?: boolean
}

const POPUP_SIZE_CONFIG = {
  storageKey: 'si-crop-alert-popup-size',
  width: 312,
  height: 420,
  minWidth: 268,
  maxWidth: 400,
  minHeight: 280,
  maxHeight: 560,
} as const

const INDEX_TONES = {
  NDVI: '#16a34a',
  NDMI: '#0d9488',
  NDWI: '#2563eb',
  SAVI: '#65a30d',
  EVI: '#7c3aed',
  LST: '#ea580c',
  CHAS: '#0f766e',
  DCHAS: '#b45309',
} as const

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

function resolveTrendPresentation(trend: string): { icon: string; label: string; title: string } {
  const t = trend.toLowerCase()
  if (t.includes('increas')) {
    return { icon: 'fa-solid fa-arrow-trend-up', label: 'Rising', title: trend }
  }
  if (t.includes('decreas')) {
    return { icon: 'fa-solid fa-arrow-trend-down', label: 'Falling', title: trend }
  }
  if (t.includes('stable')) {
    return { icon: 'fa-solid fa-grip-lines', label: 'Stable', title: trend }
  }
  if (t.includes('latest') || t.includes('single')) {
    return { icon: 'fa-solid fa-satellite', label: '1 scene', title: trend }
  }
  return { icon: 'fa-solid fa-chart-line', label: shortenCopy(trend, 16), title: trend }
}

function isDateOnlyWarning(w: string | null | undefined): boolean {
  return Boolean(w?.trim().startsWith('Requested Date:'))
}

type AlertInsightPanelProps = {
  trend: string
  action: string
  requestedDate: string
  usedDate: string
  dataWarning: string | null
}

function AlertInsightPanel({ trend, action, dataWarning }: Omit<AlertInsightPanelProps, 'requestedDate' | 'usedDate'>) {
  const trendUi = resolveTrendPresentation(trend)
  const showWarning = Boolean(dataWarning?.trim()) && !isDateOnlyWarning(dataWarning)

  return (
    <div className="si-crop-alert-map-popup__insight">
      <div className="si-crop-alert-map-popup__insight-grid">
        <div className="si-crop-alert-map-popup__insight-chip" title={trendUi.title}>
          <div className="si-crop-alert-map-popup__insight-icon si-crop-alert-map-popup__insight-icon--trend" aria-hidden>
            <i className={trendUi.icon} />
          </div>
          <p className="si-crop-alert-map-popup__insight-text">{trendUi.label}</p>
        </div>
        <div className="si-crop-alert-map-popup__insight-chip" title={action}>
          <div className="si-crop-alert-map-popup__insight-icon si-crop-alert-map-popup__insight-icon--action" aria-hidden>
            <i className="fa-solid fa-seedling" />
          </div>
          <p className="si-crop-alert-map-popup__insight-text">{shortenCopy(action)}</p>
        </div>
      </div>

      {showWarning ? (
        <div className="si-crop-alert-map-popup__insight-warn" title={dataWarning!}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
          <span>{shortenCopy(dataWarning!, 72)}</span>
        </div>
      ) : null}
    </div>
  )
}

type LandCoverageStripProps = {
  coverage: NdviFieldCoverage
  sceneDates: string[]
  sceneDate: string
  onSceneDateChange: (date: string) => void
  embedded?: boolean
}

function LandCoverageStrip({
  coverage,
  sceneDates,
  sceneDate,
  onSceneDateChange,
  embedded = false,
}: LandCoverageStripProps) {
  const vegetationPct = coverage.vegetationPct
  const bareAreaPct = coverage.bareAreaPct
  const vegetationHa = coverage.vegetationHa
  const bareAreaHa = coverage.bareAreaHa
  const fieldAreaHa = coverage.fieldAreaHa
  const vegAngle = (vegetationPct / 100) * 360

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
          {sceneDates.length > 1 ? (
            <label className="si-crop-alert-map-popup__land-date-wrap">
              <span className="si-crop-alert-map-popup__land-date-label">Scene</span>
              <select
                className="si-crop-alert-map-popup__land-date-select"
                value={sceneDate}
                onChange={e => onSceneDateChange(e.target.value)}
                aria-label="Filter land coverage by scene date"
              >
                {sceneDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          ) : sceneDate ? (
            <time className="si-crop-alert-map-popup__land-date" dateTime={sceneDate}>{sceneDate}</time>
          ) : null}
          {fieldAreaHa != null ? (
            <span className="si-crop-alert-map-popup__land-total" title="Field area">
              <i className="fa-solid fa-vector-square" aria-hidden />
              {formatPopupAreaHa(fieldAreaHa)}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="si-crop-alert-map-popup__land-pie"
        style={{
          background: `conic-gradient(from -90deg, #15803d 0deg ${vegAngle}deg, #cbd5e1 ${vegAngle}deg 360deg)`,
        }}
        role="img"
        aria-label={`Vegetation ${vegetationPct}%, bare area ${bareAreaPct}%`}
      >
        <span className="si-crop-alert-map-popup__land-pie-hole" aria-hidden />
      </div>

      <div className="si-crop-alert-map-popup__land-metrics">
        <div className="si-crop-alert-map-popup__land-metric si-crop-alert-map-popup__land-metric--veg" title="Planted cover">
          <i className="fa-solid fa-leaf" aria-hidden />
          <em>{vegetationPct}%</em>
          {vegetationHa != null ? <small>{formatPopupAreaHa(vegetationHa)}</small> : null}
        </div>
        <div className="si-crop-alert-map-popup__land-metric si-crop-alert-map-popup__land-metric--bare" title="Bare area">
          <i className="fa-solid fa-mountain-sun" aria-hidden />
          <em>{bareAreaPct}%</em>
          {bareAreaHa != null ? <small>{formatPopupAreaHa(bareAreaHa)}</small> : null}
        </div>
      </div>
    </div>
  )
}

function resolveIndexTrendUi(trend: IndexTrendDirection): {
  icon: string
  label: string
  mod: string
} {
  if (trend === 'up') {
    return { icon: 'fa-arrow-trend-up', label: 'Rising vs previous scene', mod: '--up' }
  }
  if (trend === 'down') {
    return { icon: 'fa-arrow-trend-down', label: 'Falling vs previous scene', mod: '--down' }
  }
  return { icon: 'fa-minus', label: 'Stable vs previous scene', mod: '--flat' }
}

function IndexTrendArrow({
  trend,
  tone,
  compact,
  inline: inlineMode,
}: {
  trend: IndexTrendDirection
  tone?: string
  compact?: boolean
  inline?: boolean
}) {
  const ui = resolveIndexTrendUi(trend)
  return (
    <span
      className={[
        'si-crop-alert-map-popup__index-trend',
        ui.mod ? `si-crop-alert-map-popup__index-trend${ui.mod}` : '',
        compact ? 'si-crop-alert-map-popup__index-trend--compact' : '',
        inlineMode ? 'si-crop-alert-map-popup__index-trend--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={tone ? ({ '--index-tone': tone } as CSSProperties) : undefined}
      title={ui.label}
      aria-label={ui.label}
    >
      <i className={`fa-solid ${ui.icon}`} aria-hidden />
    </span>
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
      <span className="si-crop-alert-map-popup__smart-insight-emoji" aria-hidden>
        {insight.emoji}
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

function formatIndexStatValue(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function scalarToIndexStats(
  value: number | null | undefined,
  trend: IndexTrendDirection = 'flat',
): IndexMinMaxMean {
  if (value == null || !Number.isFinite(value)) {
    return { min: 0, max: 0, mean: 0, trend: 'flat' }
  }
  const v = Number(value.toFixed(3))
  return { min: v, max: v, mean: v, trend }
}

function chasDeltaIndexStats(current: number, previous: number | null): IndexMinMaxMean {
  if (previous == null || !Number.isFinite(previous)) {
    return { min: 0, max: 0, mean: 0, trend: 'flat' }
  }
  const d = Number((current - previous).toFixed(3))
  const trend: IndexTrendDirection = d > 0.001 ? 'up' : d < -0.001 ? 'down' : 'flat'
  return { min: d, max: d, mean: d, trend }
}

function resolvePopupIndexDataDate(vm: ReturnType<typeof buildCropAlertPopupViewModel>): string {
  const raw = vm.usedDate || vm.layerLive.sceneDate || vm.analysisDate || ''
  return raw.trim().slice(0, 10)
}

function IndexMinMaxMeanStats({
  stats,
  digits = 2,
  compact = false,
}: {
  stats: IndexMinMaxMean
  digits?: number
  compact?: boolean
}) {
  return (
    <div
      className={[
        'si-crop-alert-map-popup__index-triple',
        compact ? 'si-crop-alert-map-popup__index-triple--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="si-crop-alert-map-popup__index-stat">
        <span>Min</span>
        <em>{formatIndexStatValue(stats.min, digits)}</em>
      </div>
      <div className="si-crop-alert-map-popup__index-stat">
        <span>Mean</span>
        <em>{formatIndexStatValue(stats.mean, digits)}</em>
      </div>
      <div className="si-crop-alert-map-popup__index-stat">
        <span>Max</span>
        <em>{formatIndexStatValue(stats.max, digits)}</em>
      </div>
    </div>
  )
}

type IndexStatCardProps = {
  code: keyof typeof INDEX_TONES
  stats: IndexMinMaxMean
  digits?: number
  dataDate?: string
}

function IndexStatCard({ code, stats, digits = 2, dataDate }: IndexStatCardProps) {
  return (
    <div
      className="si-crop-alert-map-popup__index-card"
      style={{ '--index-tone': INDEX_TONES[code] } as CSSProperties}
    >
      <div className="si-crop-alert-map-popup__index-head">
        <span className="si-crop-alert-map-popup__index-code">{code}</span>
        <IndexTrendArrow trend={stats.trend} tone={INDEX_TONES[code]} />
      </div>
      {dataDate ? (
        <time className="si-crop-alert-map-popup__index-date" dateTime={dataDate}>
          {dataDate}
        </time>
      ) : null}
      <IndexMinMaxMeanStats stats={stats} digits={digits} />
    </div>
  )
}

function WeatherPanel({ wx, loading }: { wx: OpenMeteoWeatherSnapshot | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="si-crop-alert-map-popup__weather si-crop-alert-map-popup__weather--loading">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden />
        <span>Loading weather…</span>
      </div>
    )
  }

  const toneClass = wmoWeatherToneClass(wx?.weatherCode)
  const iconClass = wmoWeatherIconClass(wx?.weatherCode)
  const condition = wx?.conditionLabel || '—'

  return (
    <div className="si-crop-alert-map-popup__weather">
      <div className={`si-crop-alert-map-popup__weather-icon ${toneClass}`} aria-hidden>
        <i className={iconClass} />
      </div>
      <div className="si-crop-alert-map-popup__weather-body">
        <p className="si-crop-alert-map-popup__weather-condition">{condition}</p>
        <div className="si-crop-alert-map-popup__weather-metrics">
          <span
            className="si-crop-alert-map-popup__weather-metric si-crop-alert-map-popup__weather-metric--temp"
            title="Temperature"
          >
            <i className="fa-solid fa-temperature-half" aria-hidden />
            {wx?.temperatureC != null ? `${wx.temperatureC.toFixed(1)}°` : '—'}
          </span>
          <span
            className="si-crop-alert-map-popup__weather-metric si-crop-alert-map-popup__weather-metric--humidity"
            title="Humidity"
          >
            <i className="fa-solid fa-droplet" aria-hidden />
            {wx?.humidityPct != null ? `${Math.round(wx.humidityPct)}%` : '—'}
          </span>
          <span
            className="si-crop-alert-map-popup__weather-metric si-crop-alert-map-popup__weather-metric--wind"
            title="Wind"
          >
            <i className="fa-solid fa-wind" aria-hidden />
            {wx?.windSpeedKmh != null ? `${Math.round(wx.windSpeedKmh)} km/h` : '—'}
          </span>
          <span
            className="si-crop-alert-map-popup__weather-metric si-crop-alert-map-popup__weather-metric--rain"
            title="Rain"
          >
            <i className="fa-solid fa-cloud-rain" aria-hidden />
            {wx?.precipMm != null ? `${wx.precipMm.toFixed(1)} mm` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

const CHART_W = 268
const CHART_H = 76
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
  const span = dataMax - dataMin
  if (span < 0.002) {
    const pad = 0.015
    return { min: Math.max(0, dataMin - pad), max: Math.min(1, dataMax + pad) }
  }
  const pad = Math.max(span * 0.28, 0.008)
  return { min: Math.max(0, dataMin - pad), max: Math.min(1, dataMax + pad) }
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
  return computeSparklinePoints(values, width, height, pad, domainMin, domainMax)
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
  const line = buildSparklinePath(values, width, height, pad, domainMin, domainMax)
  if (!line) return ''
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const lastX = pad + (values.length === 1 ? innerW / 2 : innerW)
  const baseY = pad + innerH
  const firstX = pad + (values.length === 1 ? innerW / 2 : 0)
  return `${line} L ${lastX.toFixed(1)},${baseY.toFixed(1)} L ${firstX.toFixed(1)},${baseY.toFixed(1)} Z`
}

function ChartsPanel({
  chasLabels,
  chasValues,
  embedded = false,
}: {
  chasLabels: string[]
  chasValues: number[]
  embedded?: boolean
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const pad = 8
  const domain = useMemo(() => resolveChasSparklineDomain(chasValues), [chasValues])
  const points = useMemo(
    () => computeSparklinePoints(chasValues, CHART_W, CHART_H, pad, domain.min, domain.max),
    [chasValues, pad, domain.min, domain.max],
  )
  const sparkPath = useMemo(
    () => buildSparklinePath(chasValues, CHART_W, CHART_H, pad, domain.min, domain.max),
    [chasValues, pad, domain.min, domain.max],
  )
  const sparkArea = useMemo(
    () => buildSparklineAreaPath(chasValues, CHART_W, CHART_H, pad, domain.min, domain.max),
    [chasValues, pad, domain.min, domain.max],
  )
  const activeIndex = hoverIndex
  const activePoint = activeIndex != null ? points[activeIndex] : null

  const onChartPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      setHoverIndex(resolveNearestSparklineIndex(e.clientX, e.currentTarget, points, CHART_W))
    },
    [points],
  )

  const onChartPointerLeave = useCallback(() => {
    setHoverIndex(null)
  }, [])

  const onLegendEnter = useCallback((index: number) => {
    setHoverIndex(index)
  }, [])

  const chartBody = (
    <>
      {!embedded ? (
        <h4 className="si-crop-alert-map-popup__chart-title">CHAS Trend</h4>
      ) : null}
      <div className="si-crop-alert-map-popup__spark-wrap si-crop-alert-map-popup__spark-wrap--interactive">
          {activePoint && activeIndex != null ? (
            <div
              className="si-crop-alert-map-popup__spark-tooltip"
              style={{
                left: `${(activePoint.x / CHART_W) * 100}%`,
                top: `${(activePoint.y / CHART_H) * 100}%`,
              }}
              aria-live="polite"
            >
              <span className="si-crop-alert-map-popup__spark-tooltip-date">
                {chasLabels[activeIndex] || `S${activeIndex + 1}`}
              </span>
              <strong className="si-crop-alert-map-popup__spark-tooltip-value">
                {Number.isFinite(chasValues[activeIndex]) ? chasValues[activeIndex]!.toFixed(3) : '—'}
              </strong>
            </div>
          ) : null}
          <svg
            width={CHART_W}
            height={CHART_H}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="si-crop-alert-map-popup__spark"
            onPointerMove={onChartPointerMove}
            onPointerLeave={onChartPointerLeave}
            role="img"
            aria-label="CHAS trend chart"
          >
            {[0.25, 0.5, 0.75].map(t => {
              const y = pad + (CHART_H - pad * 2) * (1 - t)
              return (
                <line key={t} x1={pad} y1={y} x2={CHART_W - pad} y2={y} className="si-crop-alert-map-popup__spark-grid" />
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
                y2={CHART_H - pad}
                className="si-crop-alert-map-popup__spark-crosshair"
              />
            ) : null}
            {points.map(p => {
              const isActive = activeIndex === p.i
              return (
                <g key={p.i} className={isActive ? 'si-crop-alert-map-popup__spark-point--active' : undefined}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 8 : 7}
                    className="si-crop-alert-map-popup__spark-hit"
                    onPointerEnter={() => setHoverIndex(p.i)}
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
          className="si-crop-alert-map-popup__chart-legend"
          style={{ '--legend-count': chasLabels.length } as CSSProperties}
        >
          {chasLabels.map((lbl, i) => (
            <li
              key={`${lbl}-${i}`}
              className={[
                'si-crop-alert-map-popup__chart-legend-item',
                activeIndex === i ? 'si-crop-alert-map-popup__chart-legend-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => onLegendEnter(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <span className="si-crop-alert-map-popup__chart-legend-label">{lbl || `S${i + 1}`}</span>
              <span className="si-crop-alert-map-popup__chart-legend-value">
                {Number.isFinite(chasValues[i]) ? chasValues[i]!.toFixed(3) : '—'}
              </span>
            </li>
          ))}
        </ul>
    </>
  )

  if (embedded) {
    return (
      <div
        className="si-crop-alert-map-popup__charts si-crop-alert-map-popup__charts--embedded"
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
  chasLabels: string[]
  chasValues: number[]
}

function FieldAnalyticsTabsCard({
  coverage,
  sceneDates,
  sceneDate,
  onSceneDateChange,
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
  coordsOverride = null,
  weatherSnapshot = null,
  weatherLoading: weatherLoadingOverride,
}: SiCropAlertMapPopupProps) {
  const { scopedStorageKey } = useSiInstanceScope()
  const preset = POPUP_SIZE_CONFIG
  const popupSizeStorageKey = scopedStorageKey(preset.storageKey)
  const popupRef = useRef<HTMLDivElement>(null)
  const [cardSize, setCardSize] = useState<PopupSize>(() => loadPopupSize(popupSizeStorageKey))
  const [weather, setWeather] = useState<OpenMeteoWeatherSnapshot | null>(weatherSnapshot)
  const [weatherLoading, setWeatherLoading] = useState(
    weatherLoadingOverride ?? weatherSnapshot == null,
  )

  const vm = useMemo(() => buildCropAlertPopupViewModel(result), [result])
  const indexDataDate = useMemo(() => resolvePopupIndexDataDate(vm), [vm])
  const sceneDates = useMemo(() => listPopupSceneDates(result), [result])
  const [coverageSceneDate, setCoverageSceneDate] = useState(() => indexDataDate)
  useEffect(() => {
    const next = resolvePopupIndexDataDate(buildCropAlertPopupViewModel(result))
    setCoverageSceneDate(prev => (sceneDates.includes(prev) ? prev : next))
  }, [result.fieldKey, indexDataDate, sceneDates])
  const coverageForScene = useMemo(
    () => estimateNdviFieldCoverageForScene(result, coverageSceneDate || indexDataDate),
    [result, coverageSceneDate, indexDataDate],
  )
  const aoiIndexCards = useMemo(
    () => [
      { code: 'NDVI' as const, stats: vm.cropStatus.ndvi, digits: 2 },
      { code: 'NDMI' as const, stats: vm.cropStatus.ndmi, digits: 2 },
      { code: 'NDWI' as const, stats: vm.cropStatus.ndwi, digits: 2 },
      { code: 'SAVI' as const, stats: vm.cropStatus.savi, digits: 2 },
      { code: 'EVI' as const, stats: vm.cropStatus.evi, digits: 2 },
      { code: 'LST' as const, stats: vm.cropStatus.lst, digits: 1 },
      { code: 'CHAS' as const, stats: scalarToIndexStats(vm.chas.current), digits: 3 },
      {
        code: 'DCHAS' as const,
        stats: chasDeltaIndexStats(vm.chas.current, vm.chas.previous),
        digits: 3,
      },
    ],
    [vm],
  )
  const weatherLat = coordsOverride?.lat ?? vm.lat
  const weatherLng = coordsOverride?.lng ?? vm.lng
  const popupHeight = cardSize.height || preset.height
  const alertTone = vm.accentColor || '#ca8a04'

  useEffect(() => {
    setCardSize(loadPopupSize(popupSizeStorageKey))
  }, [popupSizeStorageKey])

  useEffect(() => {
    if (weatherSnapshot) {
      setWeather(weatherSnapshot)
      setWeatherLoading(false)
      return
    }
    if (weatherLoadingOverride != null) {
      setWeatherLoading(weatherLoadingOverride)
    }
  }, [weatherSnapshot, weatherLoadingOverride])

  useEffect(() => {
    if (weatherSnapshot) return
    if (!Number.isFinite(weatherLat) || !Number.isFinite(weatherLng)) {
      setWeather(null)
      setWeatherLoading(false)
      return
    }
    let cancelled = false
    setWeatherLoading(true)
    void fetchOpenMeteoWeather(weatherLat, weatherLng)
      .then(data => {
        if (!cancelled) setWeather(data)
      })
      .catch(() => {
        if (!cancelled) setWeather(null)
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weatherLat, weatherLng, weatherSnapshot])

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
      className="si-crop-alert-map-popup si-crop-alert-map-popup--lux si-crop-alert-map-popup--compact"
      style={
        {
          '--popup-accent': alertTone,
          width: cardSize.width,
          height: popupHeight,
        } as CSSProperties
      }
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      role="dialog"
      aria-label={`${vm.fieldName} — ${vm.alert.level}`}
    >
      <div className="si-crop-alert-map-popup__glow" aria-hidden />

      <header className="si-crop-alert-map-popup__head">
        <div className="si-crop-alert-map-popup__head-main">
          <div className="si-crop-alert-map-popup__title-row">
            <span className="si-crop-alert-map-popup__field-id">{vm.fieldId}</span>
            <span className="si-crop-alert-map-popup__badge">{vm.alert.level}</span>
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
      </header>

      <div className="si-crop-alert-map-popup__body">
        <div className="si-crop-alert-map-popup__scroll" data-agrocloud-map-wheel-scroll>
          <section className="si-crop-alert-map-popup__section">
            <WeatherPanel wx={weather} loading={weatherLoading} />
          </section>

          <section className="si-crop-alert-map-popup__section si-crop-alert-map-popup__section--indices">
            <div className="si-crop-alert-map-popup__index-grid">
              {aoiIndexCards.map(card => (
                <IndexStatCard
                  key={card.code}
                  code={card.code}
                  stats={card.stats}
                  digits={card.digits}
                  dataDate={indexDataDate}
                />
              ))}
            </div>
          </section>

          <section className="si-crop-alert-map-popup__section">
            <div className="si-crop-alert-map-popup__kpi-row">
              <div className="si-crop-alert-map-popup__kpi">
                <span>CHAS</span>
                <em>{vm.chas.current.toFixed(3)}</em>
              </div>
              <div className="si-crop-alert-map-popup__kpi">
                <span>Δ</span>
                <em>{vm.chas.deltaLabel}</em>
              </div>
              <div className="si-crop-alert-map-popup__kpi">
                <span>Prev</span>
                <em>{vm.chas.previous != null ? vm.chas.previous.toFixed(3) : '—'}</em>
              </div>
            </div>
          </section>

          <section className="si-crop-alert-map-popup__section">
            <AlertInsightPanel
              trend={vm.alert.trend}
              action={vm.alert.action}
              dataWarning={vm.dataWarning}
            />
          </section>

          <section className="si-crop-alert-map-popup__section">
            <FieldAnalyticsTabsCard
              coverage={coverageForScene}
              sceneDates={sceneDates}
              sceneDate={coverageSceneDate || indexDataDate}
              onSceneDateChange={setCoverageSceneDate}
              chasLabels={vm.chasTrend.labels}
              chasValues={vm.chasTrend.values}
            />
          </section>

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
        </div>
      </div>

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

      <span className="si-crop-alert-map-popup__tail" aria-hidden />
    </div>
  )
}
