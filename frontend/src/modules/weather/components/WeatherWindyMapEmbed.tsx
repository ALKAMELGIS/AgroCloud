import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'
import {
  buildWindyEmbed2Url,
  resolveWindyMapView,
  windyOverlayForMapDisplayView,
} from '../config/weatherWindyEmbed'
import { decodeWeatherMapDisplayView } from '../config/weatherArcgisMapDisplay'
import { WeatherWindyLocationOverlay } from './WeatherWindyLocationOverlay'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import type { WeatherLocationId } from '../config/weatherFarmIds'

type Props = {
  lat: number
  lon: number
  locationLabel: string
  farmId: string
  activeLayerId: WeatherMapLayerId
  mapDisplayView: string
  agriLocations?: GeoJSON.FeatureCollection | null
  locationRows?: WeatherLocationRow[]
  onLocationSelect?: (id: WeatherLocationId) => void
  footer?: ReactNode
}

export function WeatherWindyMapEmbed({
  lat,
  lon,
  locationLabel,
  farmId,
  activeLayerId,
  mapDisplayView,
  agriLocations = null,
  locationRows = [],
  onLocationSelect,
  footer,
}: Props) {
  const overlay = windyOverlayForMapDisplayView(mapDisplayView, activeLayerId)
  const displayView = decodeWeatherMapDisplayView(mapDisplayView)
  const stackRef = useRef<HTMLDivElement>(null)
  const [fitSize, setFitSize] = useState({ width: 1280, height: 720 })
  const [windyLoadEpoch, setWindyLoadEpoch] = useState(0)

  useLayoutEffect(() => {
    const el = stackRef.current
    if (!el) return
    const sync = () => {
      setFitSize({
        width: Math.max(240, el.clientWidth),
        height: Math.max(180, el.clientHeight),
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mapView = useMemo(
    () =>
      resolveWindyMapView({
        farmId,
        lat,
        lon,
        agriLocations,
        displayView,
        fitSize,
      }),
    [farmId, lat, lon, agriLocations, displayView, fitSize],
  )

  const src = useMemo(
    () =>
      buildWindyEmbed2Url({
        lat: mapView.lat,
        lon: mapView.lon,
        overlay,
        zoom: mapView.zoom,
        locationLabel: locationLabel === 'All locations' ? '' : locationLabel,
      }),
    [mapView.lat, mapView.lon, mapView.zoom, overlay, locationLabel],
  )

  return (
    <div className="weather-map-stage">
      <div className="weather-map-stage__map weather-map-stage__map--windy">
        <div className="weather-windy-embed-stack" ref={stackRef}>
          <iframe
            key={src}
            className="weather-windy-embed"
            title={`Windy weather — ${locationLabel}`}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            onLoad={() => setWindyLoadEpoch(n => n + 1)}
          />
          <WeatherWindyLocationOverlay
            lat={mapView.lat}
            lng={mapView.lon}
            zoom={mapView.zoom}
            farmId={farmId}
            agriLocations={agriLocations}
            locationRows={locationRows}
            onLocationSelect={onLocationSelect}
            windyLoadEpoch={windyLoadEpoch}
          />
        </div>
        <div className="weather-windy-embed__caption" aria-live="polite">
          <span>ECMWF · next 24h · {locationLabel}</span>
          <span className="weather-windy-embed__coords">
            {mapView.lat.toFixed(4)}°, {mapView.lon.toFixed(4)}°
          </span>
        </div>
        {footer}
      </div>
    </div>
  )
}
