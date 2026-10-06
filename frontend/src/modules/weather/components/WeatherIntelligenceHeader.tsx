import type { WeatherLocationId } from '../config/weatherFarmIds'
import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'
import {
  mapViewSelectLabel,
  mergeWeatherReadings,
  type LocationWeatherReading,
  weatherReadingFromSnapshot,
} from '../config/weatherLocationMapLayer'
import { WEATHER_GFS_RASTER_LAYER_OPTIONS } from '../config/weatherGfsRaster'
import { WEATHER_OPEN_METEO_RASTER_LAYER_IDS } from '../config/weatherOpenMeteoRaster'
import type { WeatherFarmSite } from '../services/weatherFarmService'
import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'
import { DevelopEliteHeaderDigitalClock } from '@/modules/dashboard/develop-elite/DevelopEliteHeaderDigitalClock'

type Props = {
  locationLabel: string
  lat: number
  lng: number
  loading: boolean
  bundle: OpenMeteoDashboardBundle | null
  onRefresh: () => void
  onFullscreen: () => void
  onOpenLayers: () => void
  onOpenExcelExport: () => void
  onOpenSettings: () => void
  variant?: 'default' | 'arcgis'
  sites?: WeatherFarmSite[]
  farmId?: WeatherLocationId
  onSelectFarm?: (id: WeatherLocationId) => void
  activeLayerId?: WeatherMapLayerId
  onLayerChange?: (id: WeatherMapLayerId) => void
  /** Live conditions for the selected location — drives Map View option labels. */
  locationMapReading?: LocationWeatherReading | null
  /** Phone/tablet stacked shell — compact header + full-width map panel. */
  compact?: boolean
}

export function WeatherIntelligenceHeader({
  locationLabel,
  lat,
  lng,
  loading,
  bundle,
  onRefresh,
  onFullscreen,
  onOpenLayers,
  onOpenExcelExport,
  onOpenSettings,
  variant = 'default',
  sites = [],
  farmId,
  onSelectFarm,
  activeLayerId,
  onLayerChange,
  locationMapReading = null,
  compact = false,
}: Props) {
  const lastUpdated = bundle?.fetchedAt
    ? new Date(bundle.fetchedAt).toLocaleTimeString()
    : '—'
  const connected = Boolean(bundle?.snapshot)
  const arcgis = variant === 'arcgis'
  const mapReading = mergeWeatherReadings(
    locationMapReading,
    weatherReadingFromSnapshot(bundle?.snapshot),
  )
  const activeLayerHint = activeLayerId ? mapViewSelectLabel(activeLayerId, mapReading) : ''
  const arcgisMapLayerOptions = WEATHER_GFS_RASTER_LAYER_OPTIONS.filter(o =>
    WEATHER_OPEN_METEO_RASTER_LAYER_IDS.includes(o.id),
  )

  if (arcgis) {
    const toolbar = (
      <div
        className="weather-header__arcgis-toolbar weather-header__arcgis-toolbar--segmented"
        role="toolbar"
        aria-label="Map actions"
      >
        <button
          type="button"
          className="weather-header__icon-btn"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh weather data"
        >
          <i className="fa-solid fa-rotate" aria-hidden />
        </button>
        <button
          type="button"
          className="weather-header__icon-btn"
          onClick={onFullscreen}
          title="Full screen"
          aria-label="Full screen"
        >
          <i className="fa-solid fa-expand" aria-hidden />
        </button>
        <button
          type="button"
          className="weather-header__icon-btn"
          onClick={onOpenExcelExport}
          title="Export Excel report"
          aria-label="Export Excel report"
        >
          <i className="fa-solid fa-file-excel" aria-hidden />
        </button>
        <button
          type="button"
          className="weather-header__icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <i className="fa-solid fa-gear" aria-hidden />
        </button>
      </div>
    )

    if (compact) {
      return (
        <header className="weather-header weather-header--arcgis weather-header--arcgis-compact">
          <div className="weather-header__arcgis-compact-head">
            <h1 className="weather-header__title weather-header__title--arcgis">Weather</h1>
            <div
              className="weather-header__arcgis-clock-center weather-header__arcgis-clock-center--compact"
              aria-label="UAE time"
            >
              <DevelopEliteHeaderDigitalClock />
            </div>
            <div className="weather-header__arcgis-compact-actions">{toolbar}</div>
          </div>
          <div className="weather-header__arcgis-filters">
            {sites.length && onSelectFarm && farmId ? (
              <label className="weather-header__arcgis-field">
                <span className="weather-header__arcgis-field-label">
                  <i className="fa-solid fa-location-dot" aria-hidden /> Location
                </span>
                <select
                  value={farmId}
                  onChange={e => onSelectFarm(e.target.value as WeatherLocationId)}
                  aria-label="Select a location"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="weather-header__location-pill">{locationLabel}</span>
            )}
            {activeLayerId && onLayerChange ? (
              <label className="weather-header__arcgis-field">
                <span className="weather-header__arcgis-field-label">
                  <i className="fa-solid fa-map" aria-hidden /> Map layer
                </span>
                <select
                  value={activeLayerId}
                  onChange={e => onLayerChange(e.target.value as WeatherMapLayerId)}
                  aria-label="Map view layer"
                  title={activeLayerHint}
                >
                  {arcgisMapLayerOptions.map(l => (
                    <option key={l.id} value={l.id}>
                      {mapViewSelectLabel(l.id, mapReading)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </header>
      )
    }

    return (
      <header className="weather-header weather-header--arcgis">
        <div className="weather-header__arcgis-brand">
          <i className="fa-regular fa-snowflake weather-header__arcgis-icon" aria-hidden />
          <div>
            <h1 className="weather-header__title weather-header__title--arcgis">Weather Dashboard</h1>
            <p className="weather-header__arcgis-sub">Live Weather - AgroCloud</p>
          </div>
        </div>
        <div className="weather-header__arcgis-clock-center">
          <DevelopEliteHeaderDigitalClock />
        </div>
        <div className="weather-header__arcgis-controls">
          <div className="weather-header__arcgis-filters">
            {sites.length && onSelectFarm && farmId ? (
              <label className="weather-header__arcgis-field">
                <span className="weather-header__arcgis-field-label">
                  <i className="fa-solid fa-location-dot" aria-hidden /> Select a location
                </span>
                <select
                  value={farmId}
                  onChange={e => onSelectFarm(e.target.value as WeatherLocationId)}
                  aria-label="Select a location"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="weather-header__location-pill">{locationLabel}</span>
            )}
            {activeLayerId && onLayerChange ? (
              <label className="weather-header__arcgis-field">
                <span className="weather-header__arcgis-field-label">
                  <i className="fa-solid fa-map" aria-hidden /> Map View
                </span>
                <select
                  value={activeLayerId}
                  onChange={e => onLayerChange(e.target.value as WeatherMapLayerId)}
                  aria-label="Map view layer"
                  title={activeLayerHint}
                >
                  {arcgisMapLayerOptions.map(l => (
                    <option key={l.id} value={l.id}>
                      {mapViewSelectLabel(l.id, mapReading)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className={`weather-header__humidity-pill${activeLayerId === 'humidity' ? ' is-on' : ''}`}
              onClick={() => onLayerChange?.('humidity')}
              title="Show humidity on map"
            >
              Humidity
            </button>
          </div>
          {toolbar}
        </div>
      </header>
    )
  }

  return (
    <header className="weather-header">
      <div className="weather-header__title-row">
        <h1 className="weather-header__title" title="AgroCloud Weather Intelligence">
          AgroCloud · Weather
        </h1>
        <span className="weather-header__badge weather-header__badge--live" aria-live="polite">
          LIVE
        </span>
        {connected ? (
          <span className="weather-header__badge weather-header__badge--connected">Open-Meteo</span>
        ) : null}
      </div>
      <div className="weather-header__controls">
        <span className="weather-header__location-pill" title={`${locationLabel} · ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`}>
          {locationLabel}
        </span>
        <div className="weather-header__coords" title="Coordinates">
          <span>{lat.toFixed(4)}°, {lng.toFixed(4)}°</span>
        </div>
        <span className="weather-header__updated" title={`Last updated ${lastUpdated}`}>
          {lastUpdated}
        </span>
        <button type="button" className="weather-header__icon-btn" onClick={onRefresh} disabled={loading} title="Refresh">
          <i className="fa-solid fa-rotate" aria-hidden />
        </button>
        <button type="button" className="weather-header__icon-btn" onClick={onFullscreen} title="Full screen">
          <i className="fa-solid fa-expand" aria-hidden />
        </button>
        <button type="button" className="weather-header__icon-btn" onClick={onOpenLayers} title="Layer manager">
          <i className="fa-solid fa-layer-group" aria-hidden />
        </button>
        <button type="button" className="weather-header__icon-btn" onClick={onOpenSettings} title="Settings">
          <i className="fa-solid fa-gear" aria-hidden />
        </button>
        <button type="button" className="weather-header__icon-btn" onClick={onOpenExcelExport} title="Export Excel report">
          <i className="fa-solid fa-file-excel" aria-hidden />
        </button>
      </div>
    </header>
  )
}

