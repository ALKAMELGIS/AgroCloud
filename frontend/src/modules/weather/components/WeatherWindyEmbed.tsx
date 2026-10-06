import { useMemo } from 'react'
import { buildWindyEmbedUrl, windyOverlayFromLayer } from '../utils/buildWindyEmbedUrl'
import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'

type Props = {
  lat: number
  lng: number
  farmId: string
  locationLabel?: string
  activeLayerId: WeatherMapLayerId
}

export function WeatherWindyEmbed({ lat, lng, farmId, locationLabel, activeLayerId }: Props) {
  const zoom = farmId === 'all' ? 7 : 11
  const src = useMemo(
    () =>
      buildWindyEmbedUrl({
        lat,
        lng,
        detailLat: lat,
        detailLon: lng,
        zoom,
        overlay: windyOverlayFromLayer(activeLayerId),
      }),
    [lat, lng, zoom, activeLayerId],
  )

  const title = locationLabel
    ? `Windy forecast for ${locationLabel}`
    : 'Windy forecast map'

  return (
    <div className="weather-map-stage__windy">
      <iframe
        key={`${farmId}-${lat.toFixed(4)}-${lng.toFixed(4)}-${activeLayerId}`}
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
