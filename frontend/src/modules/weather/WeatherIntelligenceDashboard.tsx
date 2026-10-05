import './weather-monitoring.css'
import './weather-intelligence.css'
import '@/modules/dashboard/develop-elite/develop-elite-dashboard.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { WeatherLocationId } from './config/weatherFarmIds'
import { WeatherLocationList } from './components/WeatherLocationList'
import { useWeatherLocationRows } from './hooks/useWeatherLocationRows'
import { coalesceLocationRow, rowHasLiveTemp } from './services/openMeteoLocationBatch'
import { peekLocationLiveRow } from './services/locationLiveWeatherCache'
import { WeatherMapStage } from './components/WeatherMapStage'
import { WeatherChartsPanel } from './components/WeatherChartsPanel'
import { formatOperationalIndicatorLine } from './insights/buildOperationalWeatherIndicators'
import { useWeatherIntelligenceState } from './hooks/useWeatherIntelligenceState'
import { wmoWeatherIconClass } from '@/modules/remote-sensing/weather/openMeteoWeather'
import { useAgroViewport } from '@/theme/useAgroViewport'
import {
  WEATHER_PHASE2_LAYERS,
  isWeatherClimateMapModeAvailable,
  isWeatherPhase2LayerConfigured,
} from './config/weatherPhase2Layers'
import { WeatherIntelligenceHeader } from './components/WeatherIntelligenceHeader'
import { WeatherTimeline } from './components/WeatherTimeline'
import { WeatherMapControls } from './components/WeatherMapControls'
import { WeatherAlertsPanel } from './components/WeatherAlertsPanel'
import { WeatherSpatialAnalysisPanel } from './components/WeatherSpatialAnalysisPanel'
import { WeatherFieldPanel } from './components/WeatherFieldPanel'
import { WeatherAdvancedDrawer } from './components/WeatherAdvancedDrawer'
import { WeatherThresholdsDialog } from './components/WeatherThresholdsDialog'
import { WEATHER_MAP_MODES } from './config/weatherMapModes'
import { WeatherArcgisFooterNav, type WeatherArcgisFooterTab } from './components/WeatherArcgisFooterNav'
import {
  WeatherArcgisShellTabs,
  type WeatherArcgisShellView,
} from './components/WeatherArcgisShellTabs'
import { WeatherArcgisChartDateBar } from './components/WeatherArcgisChartDateBar'
import { WeatherArcgisStackedCharts } from './components/WeatherArcgisStackedCharts'
import { WeatherHourlyTable } from './components/WeatherHourlyTable'
import { WeatherArcgisHourlyForecast } from './components/WeatherArcgisHourlyForecast'
import { useWeatherChartDateRange } from './hooks/useWeatherChartDateRange'
import { useWeatherArcgisHourlyRange } from './hooks/useWeatherArcgisHourlyRange'
import { weatherReadingFromRow } from './config/weatherLocationMapLayer'
export default function WeatherIntelligenceDashboard() {
  const vp = useAgroViewport()
  const [searchParams] = useSearchParams()
  const isDesktop = vp === 'desktop'
  const isArcgisLayout = true
  const arcgisTouch = vp !== 'desktop'
  const arcgisMobile = vp === 'mobile'
  const arcgisTablet = vp === 'tablet'
  const data = useWeatherIntelligenceState({ preferOpenMeteoRaster: isArcgisLayout })
  const shellRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [arcgisFooterTab, setArcgisFooterTab] = useState<WeatherArcgisFooterTab>('current')
  const [arcgisShellView, setArcgisShellView] = useState<WeatherArcgisShellView>('map')
  const { range: chartDateRange, setRange: setChartDateRange } = useWeatherChartDateRange()
  const arcgisHourly = useWeatherArcgisHourlyRange(
    data.queryPoint.lat,
    data.queryPoint.lng,
    chartDateRange,
    data.bundle,
  )
  const snap = data.bundle?.snapshot
  const timelineLabels = useMemo(() => {
    if (data.rasterTimelineLabels?.length) {
      return data.rasterTimelineLabels.slice(0, 120)
    }
    return (data.bundle?.hourlyForecast ?? []).map(h => h.time.replace('T', ' ').slice(0, 16))
  }, [data.rasterTimelineLabels, data.bundle?.hourlyForecast])

  const gfsRasterActive =
    !data.preferOpenMeteoRaster && Boolean(data.gfsRasterMeta?.validTimes?.length)
  const gfsCycleLabel = useMemo(() => {
    const ref = data.gfsRasterMeta?.referenceTime
    if (!ref) return gfsRasterActive ? 'NOAA GFS · live' : null
    const d = new Date(ref.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return 'NOAA GFS · live'
    return `NOAA GFS · ${d.toISOString().slice(0, 16).replace('T', ' ')}Z`
  }, [data.gfsRasterMeta?.referenceTime, gfsRasterActive])

  const mapModes = useMemo(
    () =>
      WEATHER_MAP_MODES.filter(m => m.id !== 'climate' || isWeatherClimateMapModeAvailable()),
    [],
  )

  useEffect(() => {
    const latRaw = searchParams.get('lat')
    const lngRaw = searchParams.get('lng')
    if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') return
    const lat = Number(latRaw)
    const lng = Number(lngRaw)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (lat === 0 && lng === 0) return
    data.setCustomLocation({
      lat,
      lng,
      label: `Map pick ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
    })
  }, [searchParams, data.setCustomLocation])

  const locationSites = useMemo(() => data.catalog?.sites ?? [], [data.catalog?.sites])
  const showLocationsPanel = isArcgisLayout
    ? locationSites.length > 0
    : (vp === 'desktop' || data.mobileTab === 'insights') && locationSites.length > 0
  const { rows: locationRows, loading: locationRowsLoading, reload: reloadLocationRows } =
    useWeatherLocationRows(locationSites, data.catalog?.loadedAt)

  const displayLocationRows = useMemo(() => {
    const byId = new Map(locationRows.map(r => [r.id, r]))
    const snap = data.bundle?.snapshot
    return locationSites.map(s => {
      const row =
        byId.get(s.id) ?? {
          id: s.id,
          label: s.label,
          temperatureC: null,
          humidityPct: null,
          windSpeedKmh: null,
          windDirectionDeg: null,
          precipMm: null,
          weatherCode: null,
        }
      const live = peekLocationLiveRow(s.lat, s.lng)
      const mergedRow =
        live && rowHasLiveTemp(live)
          ? coalesceLocationRow(row, { ...live, id: s.id, label: s.label })
          : row
      const withMeta = {
        ...mergedRow,
        label: s.label,
        countryLabel: s.countryLabel ?? '',
        dailyMinC: mergedRow.dailyMinC ?? null,
        dailyMaxC: mergedRow.dailyMaxC ?? null,
      }
      const dayKey = new Date().toISOString().slice(0, 10)
      const d0 =
        data.bundle?.daily7?.find(d => d.date.slice(0, 10) === dayKey) ?? data.bundle?.daily7?.[0]
      if (s.id === data.farmId && snap) {
        return {
          ...withMeta,
          temperatureC: snap.temperatureC ?? row.temperatureC,
          humidityPct: snap.humidityPct ?? row.humidityPct,
          windSpeedKmh: snap.windSpeedKmh ?? row.windSpeedKmh,
          windDirectionDeg: snap.windDirectionDeg ?? row.windDirectionDeg,
          precipMm: snap.precipMm ?? row.precipMm,
          weatherCode: snap.weatherCode ?? row.weatherCode,
          dailyMinC: d0?.tempMinC ?? row.dailyMinC ?? withMeta.dailyMinC,
          dailyMaxC: d0?.tempMaxC ?? row.dailyMaxC ?? withMeta.dailyMaxC,
        }
      }
      return withMeta
    })
  }, [locationSites, locationRows, data.farmId, data.bundle?.snapshot, data.bundle?.fetchedAt, data.bundle?.daily7])

  const selectedLocationMapReading = useMemo(() => {
    const row = displayLocationRows.find(r => r.id === data.farmId)
    return weatherReadingFromRow(row ?? null)
  }, [displayLocationRows, data.farmId])

  useEffect(() => {
    const row = displayLocationRows.find(r => r.id === data.farmId)
    data.setLocationWeatherPatch(
      row
        ? {
            temperatureC: row.temperatureC,
            humidityPct: row.humidityPct,
            windSpeedKmh: row.windSpeedKmh,
            precipMm: row.precipMm,
            weatherCode: row.weatherCode,
          }
        : null,
    )
  }, [data.farmId, data.setLocationWeatherPatch, displayLocationRows])

  const onToggleCompare = useCallback(
    (id: WeatherLocationId) => {
      const cur = data.compareFarmIds
      if (cur.includes(id)) {
        data.setCompareFarmIds(cur.filter(x => x !== id))
        return
      }
      const next = [...cur.filter(x => x !== 'all'), id]
      if (next.length > 12) return
      data.setCompareFarmIds(next)
    },
    [data],
  )

  const arcgisPanelHidden = (panel: WeatherArcgisShellView) =>
    arcgisMobile && arcgisShellView !== panel ? 'weather-arcgis-shell-panel--hidden' : ''

  const shellClass = [
    'weather-shell',
    isArcgisLayout ? 'weather-shell--arcgis' : '',
    arcgisTouch ? 'weather-shell--arcgis-touch' : '',
    arcgisMobile ? `weather-shell--arcgis-view-${arcgisShellView}` : '',
    arcgisTablet ? 'weather-shell--arcgis-tablet' : '',
    locationSites.length ? 'weather-shell--with-locations' : '',
    !isArcgisLayout && vp !== 'desktop' ? 'weather-shell--compact' : '',
    !isArcgisLayout ? `weather-shell--tab-${data.mobileTab}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const onFullscreen = useCallback(() => {
    const el = shellRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  const advancedLocation = useMemo(
    () => ({
      lat: data.queryPoint.lat,
      lng: data.queryPoint.lng,
      label: data.queryPoint.label,
    }),
    [data.queryPoint],
  )

  const showSide = !isArcgisLayout && !isDesktop && data.mobileTab === 'insights'
  const showMap = isArcgisLayout || isDesktop || data.mobileTab === 'map'
  const showForecast = !isArcgisLayout && !isDesktop && data.mobileTab === 'forecast'

  return (
    <div className={shellClass} ref={shellRef}>
      <WeatherIntelligenceHeader
        variant={isArcgisLayout ? 'arcgis' : 'default'}
        locationLabel={data.queryPoint.label}
        lat={data.queryPoint.lat}
        lng={data.queryPoint.lng}
        loading={data.loadingWeather}
        bundle={data.bundle}
        sites={locationSites}
        farmId={data.farmId}
        onSelectFarm={id => data.setFarmId(id)}
        activeLayerId={data.activeLayerId}
        onLayerChange={data.setActiveLayerId}
        locationMapReading={selectedLocationMapReading}
        onRefresh={() => {
          void data.refreshWeather()
          void reloadLocationRows()
        }}
        onFullscreen={onFullscreen}
        onOpenLayers={() => data.setLayerManagerOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdvanced={() => data.setAdvancedOpen(true)}
      />

      {arcgisMobile ? (
        <WeatherArcgisShellTabs value={arcgisShellView} onChange={setArcgisShellView} />
      ) : null}

      {!isArcgisLayout && vp !== 'desktop' ? (
        <nav className="weather-mobile-tabs" aria-label="Dashboard sections">
          {(['map', 'insights', 'forecast'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`weather-mobile-tabs__btn${data.mobileTab === tab ? ' is-active' : ''}`}
              onClick={() => data.setMobileTab(tab)}
            >
              {tab === 'map' ? 'Map' : tab === 'insights' ? 'Insights' : 'Forecast'}
            </button>
          ))}
          <button
            type="button"
            className={`weather-mobile-tabs__btn${data.mapMode === 'analysis' ? ' is-active' : ''}`}
            onClick={() => data.setMobileTab('analysis')}
          >
            Analysis
          </button>
        </nav>
      ) : null}

      {!isArcgisLayout ? (
        <div className="weather-mode-bar">
          {mapModes.map(m => (
            <button
              key={m.id}
              type="button"
              className={`weather-mode-bar__btn${data.mapMode === m.id ? ' is-active' : ''}`}
              onClick={() => data.setMapMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      {showLocationsPanel ? (
        <WeatherLocationList
          variant={isArcgisLayout ? 'arcgis' : 'default'}
          rows={displayLocationRows}
          loading={locationRowsLoading}
          selectedId={data.farmId}
          onSelect={id => data.setFarmId(id)}
          compareIds={data.compareFarmIds}
          onToggleCompare={isArcgisLayout ? undefined : onToggleCompare}
          className={arcgisMobile ? arcgisPanelHidden('locations') : undefined}
        />
      ) : null}

      {isArcgisLayout ? (
        <div
          className={`weather-charts-column${
            arcgisFooterTab === 'tabled'
              ? ' weather-charts-column--tabled'
              : arcgisFooterTab === 'hourly'
                ? ' weather-charts-column--hourly'
                : ''
          }${arcgisPanelHidden('charts')}`}
        >
          <WeatherArcgisChartDateBar
            range={chartDateRange}
            onChange={setChartDateRange}
            loading={arcgisHourly.hourlyRangeLoading}
          />
          <div
            className={`weather-charts-column__tab-panel${
              arcgisFooterTab !== 'current' ? ' weather-arcgis-tab-panel--hidden' : ''
            }`}
            aria-hidden={arcgisFooterTab !== 'current'}
          >
            <WeatherArcgisStackedCharts
              bundle={data.bundle}
              locationLabel={data.queryPoint.label}
              mapTimeIso={data.mapTimeIso}
              dateRange={chartDateRange}
              hourlyRange={arcgisHourly.hourlyRange}
            />
          </div>
          <div
            className={`weather-charts-column__tab-panel${
              arcgisFooterTab !== 'hourly' ? ' weather-arcgis-tab-panel--hidden' : ''
            }`}
            aria-hidden={arcgisFooterTab !== 'hourly'}
          >
            <WeatherArcgisHourlyForecast
              bundle={data.bundle}
              locationLabel={data.queryPoint.label}
              hourlyRange={arcgisHourly.hourlyRange}
            />
          </div>
          <div
            className={`weather-charts-column__tab-panel${
              arcgisFooterTab !== 'tabled' ? ' weather-arcgis-tab-panel--hidden' : ''
            }`}
            aria-hidden={arcgisFooterTab !== 'tabled'}
          >
            <WeatherHourlyTable
              locationLabel={data.queryPoint.label}
              hourlyRange={arcgisHourly.hourlyRange}
            />
          </div>
        </div>
      ) : null}

      {showMap ? (
        <>
          <main
            className={`weather-main${isArcgisLayout ? ' weather-main--arcgis-map' : ''}${isArcgisLayout ? arcgisPanelHidden('map') : ''}`}
          >
            {!isArcgisLayout ? (
              <WeatherTimeline
                compact
                labels={timelineLabels}
                hourIndex={data.timelineHourIndex}
                onChange={data.setTimelineHourIndex}
                playing={data.windAnimPlaying}
                onTogglePlay={() => {
                  const next = !data.windAnimPlaying
                  data.setWindAnimPlaying(next)
                  if (next && data.vizMode === 'points') data.setVizMode('animated')
                }}
              />
            ) : null}
            <WeatherMapStage
              openMeteoInterpolatedRaster={data.preferOpenMeteoRaster}
              site={data.site}
              farmId={data.farmId}
              portfolio={data.catalog?.portfolio ?? null}
              agriLocations={data.catalog?.agriLocations ?? null}
              agriLocationDrawingInfo={data.catalog?.agriLocationDrawingInfo ?? null}
              showLayerStrip={!isArcgisLayout}
              activeLayerId={data.activeLayerId}
              onLayerChange={data.setActiveLayerId}
              mapTimeIso={data.mapTimeIso}
              mapTimeIsoNext={data.mapTimeIsoNext}
              rasterBlend={data.rasterBlend}
              gfsRasterActive={gfsRasterActive}
              gfsCycleLabel={gfsCycleLabel}
              mapMode={data.mapMode}
              vizMode={data.vizMode}
              onFieldSelect={f => data.setSelectedField(f)}
              locationRows={displayLocationRows}
              onLocationSelect={id => data.setFarmId(id)}
              onApplyMapPick={loc => data.setCustomLocation(loc)}
              mapForecastTimeline={
                isArcgisLayout && timelineLabels.length > 0 ? (
                  <WeatherTimeline
                    compact
                    dock="bottom"
                    labels={timelineLabels}
                    hourIndex={data.timelineHourIndex}
                    onChange={data.setTimelineHourIndex}
                    playing={data.windAnimPlaying}
                    onTogglePlay={() => {
                      const next = !data.windAnimPlaying
                      data.setWindAnimPlaying(next)
                      if (next && data.vizMode === 'points') data.setVizMode('animated')
                    }}
                  />
                ) : null
              }
            />
            <WeatherFieldPanel feature={data.selectedField} onClose={() => data.setSelectedField(null)} />
          </main>
        </>
      ) : null}

      {showSide ? (
        <aside className="weather-side">
          <section className="weather-side__card">
            <h2>Current weather</h2>
            {snap ? (
              <>
                <div className="weather-side__condition">
                  <i className={wmoWeatherIconClass(snap.weatherCode)} aria-hidden />
                  <span>{snap.conditionLabel}</span>
                </div>
                <dl className="weather-side__dl">
                  <div>
                    <dt>Temperature</dt>
                    <dd>{snap.temperatureC != null ? `${snap.temperatureC.toFixed(1)} °C` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Humidity</dt>
                    <dd>{snap.humidityPct != null ? `${Math.round(snap.humidityPct)} %` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Wind</dt>
                    <dd>
                      {snap.windSpeedKmh != null
                        ? `${Math.round(snap.windSpeedKmh)} km/h ${snap.windDirectionLabel}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Precipitation</dt>
                    <dd>{snap.precipMm != null ? `${snap.precipMm.toFixed(1)} mm` : '—'}</dd>
                  </div>
                  <div><dt>Elevation</dt><dd>{snap.elevationM != null ? `${snap.elevationM} m` : '—'}</dd></div>
                  <div><dt>Observed</dt><dd>{snap.observedAt.replace('T', ' ').slice(0, 16)}</dd></div>
                </dl>
              </>
            ) : (
              <p>
                {data.loadingWeather ? 'Loading…' : data.weatherError ?? 'No data — '}
                {!data.loadingWeather && !snap ? (
                  <button
                    type="button"
                    className="weather-side__inline-link"
                    onClick={() => void data.refreshWeather()}
                  >
                    Refresh weather
                  </button>
                ) : null}
              </p>
            )}
          </section>
          <section className="weather-side__card">
            <h2>Agricultural weather insights</h2>
            <p className="weather-side__disclaimer">Operational indicators only — not agronomic advice.</p>
            <ul className="weather-side__insights">
              {data.indicators.map(ind => (
                <li key={ind.id}>{formatOperationalIndicatorLine(ind)}</li>
              ))}
            </ul>
          </section>
          <WeatherAlertsPanel
            alerts={data.alerts}
            loading={data.loadingWeather}
            hasWeatherData={data.weatherDataReady}
            locationLabel={data.queryPoint.label}
            onRefresh={() => void data.refreshWeather()}
          />
          <WeatherSpatialAnalysisPanel
            stats={data.farmStats}
            locationLabel={data.queryPoint.label}
            forecastHours={data.bundle?.hourlyForecast?.length ?? data.bundle?.hourly?.length ?? 0}
            loading={data.loadingWeather}
            onRefresh={() => void data.refreshWeather()}
            onRunExtent={() => {
              data.setMapMode('analysis')
              data.setVizMode('heatmap')
            }}
          />
          <section className="weather-side__card weather-side__card--phase2">
            <h2>Historical &amp; satellite</h2>
            <ul className="weather-side__phase2">
              {WEATHER_PHASE2_LAYERS.map(l => (
                <li key={l.id}>
                  <strong>{l.label}</strong>
                  <span className={`weather-side__phase2-tag is-${l.dataClass}`}>{l.dataClass}</span>
                  <p>
                    {l.sourceLabel} · {l.resolutionLabel}
                    {l.periodLabel ? ` · ${l.periodLabel}` : ''}
                  </p>
                  <p className="weather-side__phase2-status">
                    {l.id === 'satellite_viirs_truecolor'
                      ? isWeatherPhase2LayerConfigured(l)
                        ? 'Custom VIIRS / imagery URL'
                        : 'Live · Esri World Imagery (default)'
                      : isWeatherPhase2LayerConfigured(l)
                        ? 'Configured'
                        : 'Not configured'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      ) : null}

      {isArcgisLayout ? (
        <WeatherArcgisFooterNav value={arcgisFooterTab} onChange={setArcgisFooterTab} />
      ) : null}

      {showForecast ? (
        <footer className="weather-bottom">
          <WeatherChartsPanel
            bundle={data.bundle}
            catalog={data.catalog}
            activeLayerId={data.activeLayerId}
            locationLabel={data.queryPoint.label}
            queryLat={data.queryPoint.lat}
            queryLng={data.queryPoint.lng}
            mapTimeIso={data.mapTimeIso}
            compareFarmIds={data.compareFarmIds}
            onCompareFarmIdsChange={data.setCompareFarmIds}
          />
        </footer>
      ) : null}

      <WeatherMapControls
        open={data.layerManagerOpen}
        onClose={() => data.setLayerManagerOpen(false)}
        mapMode={data.mapMode}
        onMapModeChange={data.setMapMode}
        vizMode={data.vizMode}
        onVizModeChange={data.setVizMode}
        activeLayerId={data.activeLayerId}
        onLayerChange={data.setActiveLayerId}
        precipWindow={data.precipWindow}
        onPrecipWindowChange={data.setPrecipWindow}
      />

      <WeatherThresholdsDialog
        open={settingsOpen}
        thresholds={data.thresholds}
        onClose={() => setSettingsOpen(false)}
        onSave={data.setThresholds}
      />

      <WeatherAdvancedDrawer
        open={data.advancedOpen}
        onClose={() => data.setAdvancedOpen(false)}
        location={advancedLocation}
        onLocationChange={loc => data.setCustomLocation(loc)}
      />
    </div>
  )
}
