import { useMemo } from 'react'
import { buildWindyEmbed2Url, resolveWindyMapView, windyOverlayForMapDisplayView } from '../config/weatherWindyEmbed'
import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'

type Props = {
  lat: number
  lng: number
  farmId: string
  locationLabel?: string
  activeLayerId: WeatherMapLayerId
  agriLocations?: GeoJSON.FeatureCollection | null
}

export function WeatherWindyEmbed({
  lat,
  lng,
  farmId,
  locationLabel,
  activeLayerId,
  agriLocations = null,
}: Props) {
  const mapView = useMemo(
    () => resolveWindyMapView({ farmId, lat, lon: lng, agriLocations }),
    [farmId, lat, lng, agriLocations],
  )
  const src = useMemo(
    () =>
      buildWindyEmbed2Url({
        lat: mapView.lat,
        lon: mapView.lon,
        detailLat: mapView.detailLat,
        detailLon: mapView.detailLon,
        zoom: mapView.zoom,
        overlay: windyOverlayForMapDisplayView('', activeLayerId),
        locationLabel: locationLabel === 'All locations' ? '' : locationLabel,
      }),
    [mapView, activeLayerId, locationLabel],
  )

  const title = locationLabel
    ? `Windy forecast for ${locationLabel}`
    : 'Windy forecast map'

  return (
    <div className="weather-map-stage__windy">
      <iframe
        key={`${farmId}-${mapView.lat.toFixed(4)}-${mapView.lon.toFixed(4)}-${mapView.zoom}-${activeLayerId}`}
        className="weather-map-stage__windy-frame"
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allow="fullscreen"
      />
      <p className="weather-map-stage__windy-credit">
        Forecast visualization ©{' '}
        <a href="https://www.windy.com" target="_blank" rel="noopener noreferrer">Windy.com</a>
      </p>
    </div>
  )
}
