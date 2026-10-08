import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CircleMarker, useMap } from 'react-leaflet'
import {
  fetchOpenMeteoWeatherMapPick,
  wmoWeatherIconClass,
  type OpenMeteoWeatherSnapshot,
} from '@/modules/remote-sensing/weather/openMeteoWeather'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapLayerLiveOptional } from './developEliteMapLayerLiveContext'
import { developEliteLayerLiveHasDrawnAoiClip } from './developEliteMapLayerLiveCore'
import { SI_IMAGERY_COMMITTED_AOI_KEY } from '@/modules/remote-sensing/temporal-analysis/siImageryTimeSeriesFields'
import { prefetchDevelopEliteImageryTimeSeriesPanel } from './developElitePrefetchImageryTimeSeries'
import { Link } from 'react-router-dom'
import { registerDevelopEliteMapIntelPick } from './developEliteMapIntelPick'

type ToolId = 'intel' | 'swipe'

type InsightContextValue = {
  tool: ToolId | null
  toggleTool: (id: ToolId) => void
  imageryTimeSeriesOpen: boolean
  toggleImageryTimeSeries: () => void
  setImageryTimeSeriesOpen: (open: boolean) => void
  basemapId: string
  onBasemapChange: (id: string) => void
  point: { lat: number; lng: number } | null
  setPoint: (lat: number, lng: number) => void
  snapshot: OpenMeteoWeatherSnapshot | null
  weatherStatus: 'idle' | 'loading' | 'ready' | 'error'
  weatherError: string
}

const InsightContext = createContext<InsightContextValue | null>(null)

function useInsight(): InsightContextValue | null {
  return useContext(InsightContext)
}

export function useDevelopEliteMapInsight(): InsightContextValue | null {
  return useInsight()
}

export function DevelopEliteMapInsightProvider({
  basemapId,
  onBasemapChange,
  children,
}: {
  basemapId: string
  onBasemapChange: (id: string) => void
  children: ReactNode
}) {
  const [tool, setTool] = useState<ToolId | null>(null)
  const [point, setPointState] = useState<{ lat: number; lng: number } | null>(null)
  const [snapshot, setSnapshot] = useState<OpenMeteoWeatherSnapshot | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<InsightContextValue['weatherStatus']>('idle')
  const [weatherError, setWeatherError] = useState('')
  const [imageryTimeSeriesOpen, setImageryTimeSeriesOpen] = useState(false)

  const toggleTool = useCallback((id: ToolId) => {
    setTool(current => {
      const next = current === id ? null : id
      if (current === 'intel' && next !== 'intel') {
        setPointState(null)
        setSnapshot(null)
        setWeatherStatus('idle')
        setWeatherError('')
      }
      return next
    })
  }, [])

  const toggleImageryTimeSeries = useCallback(() => {
    setImageryTimeSeriesOpen(open => !open)
  }, [])

  const setPoint = useCallback((lat: number, lng: number) => {
    setPointState({ lat, lng })
  }, [])

  const value = useMemo<InsightContextValue>(
    () => ({
      tool,
      toggleTool,
      imageryTimeSeriesOpen,
      toggleImageryTimeSeries,
      setImageryTimeSeriesOpen,
      basemapId,
      onBasemapChange,
      point,
      setPoint,
      snapshot,
      weatherStatus,
      weatherError,
    }),
    [
      basemapId,
      imageryTimeSeriesOpen,
      onBasemapChange,
      point,
      setPoint,
      snapshot,
      tool,
      toggleImageryTimeSeries,
      toggleTool,
      weatherError,
      weatherStatus,
    ],
  )

  return (
    <InsightContext.Provider value={value}>
      <DevelopEliteWeatherLoader
        active={tool === 'intel'}
        point={point}
        onStatus={setWeatherStatus}
        onSnapshot={setSnapshot}
        onError={setWeatherError}
      />
      {children}
    </InsightContext.Provider>
  )
}

function DevelopEliteWeatherLoader({
  active,
  point,
  onStatus,
  onSnapshot,
  onError,
}: {
  active: boolean
  point: { lat: number; lng: number } | null
  onStatus: (status: InsightContextValue['weatherStatus']) => void
  onSnapshot: (snapshot: OpenMeteoWeatherSnapshot | null) => void
  onError: (message: string) => void
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active || !point) {
      if (!active) {
        onStatus('idle')
        onSnapshot(null)
        onError('')
      }
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const ac = new AbortController()
    const { lat, lng } = point

    debounceRef.current = setTimeout(() => {
      onStatus('loading')
      onError('')
      fetchOpenMeteoWeatherMapPick(lat, lng, ac.signal)
        .then(next => {
          if (ac.signal.aborted) return
          onSnapshot(next)
          onStatus('ready')
        })
        .catch(err => {
          if (ac.signal.aborted) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          onSnapshot(null)
          onError('Open-Meteo did not respond')
          onStatus('error')
        })
    }, 220)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      ac.abort()
    }
  }, [active, onError, onSnapshot, onStatus, point])

  return null
}

function DevelopEliteMapInsightPickMarker({ point }: { point: { lat: number; lng: number } | null }) {
  if (!point) return null
  return (
    <CircleMarker
      center={[point.lat, point.lng]}
      radius={9}
      pathOptions={{
        color: '#fef08a',
        fillColor: '#facc15',
        fillOpacity: 0.92,
        weight: 2,
      }}
    />
  )
}

/** Map-side behaviour: weather pick and Open-Meteo panel. MapSwipe uses {@link DevelopEliteMapSwipeEngine}. */
export function DevelopEliteMapInsightEngine() {
  const map = useMap()
  const insight = useInsight()
  const host = map.getContainer()
  const tool = insight?.tool ?? null
  const setPoint = insight?.setPoint

  useEffect(() => {
    if (tool !== 'intel' || !setPoint) return
    return registerDevelopEliteMapIntelPick(map, setPoint)
  }, [map, setPoint, tool])

  if (!insight || !host) return null

  const stopMapEvent = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  return (
    <>
      {insight.tool === 'intel' ? (
        <DevelopEliteMapInsightPickMarker point={insight.point} />
      ) : null}
      {insight.tool === 'intel'
        ? createPortal(
        <aside
          className="develop-elite-map__insight-panel"
          aria-label="Open-Meteo weather"
          onPointerDown={stopMapEvent}
          onClick={stopMapEvent}
          onDoubleClick={stopMapEvent}
        >
          <p className="develop-elite-map__insight-panel-title">Open-Meteo</p>
          {!insight.point ? <p>Click the map to read weather at that point.</p> : null}
          {insight.weatherStatus === 'loading' ? <p>Loading forecast…</p> : null}
          {insight.weatherStatus === 'error' ? <p>{insight.weatherError}</p> : null}
          {insight.snapshot ? (
            <div className="develop-elite-map__insight-wx">
              <i className={wmoWeatherIconClass(insight.snapshot.weatherCode)} aria-hidden />
              <strong>
                {insight.snapshot.temperatureC != null ? `${Math.round(insight.snapshot.temperatureC)}°C` : '—'}
              </strong>
              <span>{insight.snapshot.conditionLabel}</span>
              <span>
                {insight.point
                  ? `${insight.point.lat.toFixed(3)}, ${insight.point.lng.toFixed(3)}`
                  : ''}
              </span>
              <span>
                Humidity {insight.snapshot.humidityPct != null ? `${Math.round(insight.snapshot.humidityPct)}%` : '—'}
                {' · '}
                Wind{' '}
                {insight.snapshot.windSpeedKmh != null
                  ? `${Math.round(insight.snapshot.windSpeedKmh)} km/h ${insight.snapshot.windDirectionLabel}`
                  : '—'}
              </span>
              <span>
                Rain {insight.snapshot.precipMm != null ? `${insight.snapshot.precipMm.toFixed(1)} mm` : '—'}
              </span>
              {insight.point ? (
                <Link
                  className="develop-elite-map__insight-wi-link"
                  to={`/weather/intelligence?lat=${insight.point.lat}&lng=${insight.point.lng}`}
                >
                  Open Weather Intelligence
                </Link>
              ) : null}
            </div>
          ) : null}
        </aside>,
        host,
      )
        : null}
    </>
  )
}

export function DevelopEliteMapInsightToolbar({
  onSelectFieldKey,
}: {
  onSelectFieldKey?: (key: string | null) => void
} = {}) {
  const insight = useInsight()
  const draw = useDevelopEliteMapDraw()
  const layerLive = useDevelopEliteMapLayerLiveOptional()
  useEffect(() => {
    prefetchDevelopEliteImageryTimeSeriesPanel()
  }, [])

  if (!insight) return null

  const hasSwipeAoi = developEliteLayerLiveHasDrawnAoiClip(draw?.clipGeoJson)
  const hasDrawnAoi = hasSwipeAoi
  const swipeOpen = insight.tool === 'swipe'
  const swipeLabel = hasSwipeAoi
    ? swipeOpen
      ? 'Close MapSwipe compare'
      : 'MapSwipe compare — compare Sentinel layers and dates (before / after).'
    : 'MapSwipe needs a drawn AOI — use Edit (DRAW), then finish the sketch.'

  const items: Array<{ id: ToolId; icon: string; label: string; disabled?: boolean }> = [
    { id: 'intel', icon: 'fa-temperature-half', label: 'Open-Meteo | Weather Intelligence' },
    { id: 'swipe', icon: 'fa-left-right', label: swipeLabel, disabled: !hasSwipeAoi },
  ]

  const onEditDrawing = () => {
    if (!draw) return
    if (insight.imageryTimeSeriesOpen) insight.setImageryTimeSeriesOpen(false)
    if (!draw.drawingActive && insight.tool) insight.toggleTool(insight.tool)
    draw.toggleDrawing()
  }

  const onInsightTool = (id: ToolId) => {
    if (id === 'swipe' && !hasSwipeAoi) return
    if (insight.imageryTimeSeriesOpen) insight.setImageryTimeSeriesOpen(false)
    if (draw?.drawingActive) draw.setDrawingActive(false)
    insight.toggleTool(id)
  }

  const onImageryTimeSeries = () => {
    if (!hasDrawnAoi) return
    if (draw?.drawingActive) draw.setDrawingActive(false)
    if (insight.tool) insight.toggleTool(insight.tool)
    const opening = !insight.imageryTimeSeriesOpen
    insight.toggleImageryTimeSeries()
    if (!opening) return
    onSelectFieldKey?.(SI_IMAGERY_COMMITTED_AOI_KEY)
    requestAnimationFrame(() => layerLive?.activateLayerLive())
  }

  const timeSeriesLabel = hasDrawnAoi
    ? 'Imagery Time Series — charts for your drawn AOI (synced with Layer Live on the map).'
    : 'Imagery Time Series — draw an AOI with Edit (DRAW), then finish the sketch.'

  return (
    <div className="develop-elite-map__insight-tools" role="toolbar" aria-label="Map insight tools">
      <button
        type="button"
        className={`develop-elite-map__insight-btn${insight.imageryTimeSeriesOpen ? ' is-active' : ''}`}
        title={timeSeriesLabel}
        aria-label={timeSeriesLabel}
        aria-pressed={insight.imageryTimeSeriesOpen}
        disabled={!hasDrawnAoi}
        onClick={onImageryTimeSeries}
      >
        <i className="fa-solid fa-chart-line" aria-hidden />
      </button>
      {items.map(item => {
        const pressed = insight.tool === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`develop-elite-map__insight-btn${pressed ? ' is-active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={pressed}
            disabled={item.disabled}
            onClick={() => onInsightTool(item.id)}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden />
          </button>
        )
      })}
      {draw ? (
        <button
          type="button"
          className={`develop-elite-map__insight-btn develop-elite-map__insight-btn--edit${draw.drawingActive ? ' is-active' : ''}`}
          title={
            draw.drawingActive ? 'Drawing tool on — click to turn off' : 'Edit — activate drawing tool'
          }
          aria-label={
            draw.drawingActive ? 'Drawing tool on' : 'Edit — activate drawing tool'
          }
          aria-pressed={draw.drawingActive}
          onClick={onEditDrawing}
        >
          <i className="fa-solid fa-pen-to-square" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
