import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl'
import { reversePlaceLabel } from '../../../../lib/openMeteoWeather'
import { getMapboxAccessToken } from '../../../../lib/mapboxAccessToken'
import {
  WeatherIntelligencePanel,
  type WeatherLocation,
} from '../../../satellite/components/WeatherIntelligencePanel'
import '../../../satellite/components/WeatherIntelligencePanel.css'
import { useAcpPlatform } from '../acpPlatformContext'
import { ACP_FIELD_LOCATE_MIN_ZOOM } from '../acpMapSpatial'

type AcpWeatherIntelligenceChromeProps = {
  map: MaplibreMap | null
  mapShellRef: RefObject<HTMLDivElement | null>
}

function createWeatherPinElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'si-weather-map-pin'
  const dot = document.createElement('span')
  dot.className = 'si-weather-map-pin__dot'
  dot.setAttribute('aria-hidden', 'true')
  el.appendChild(dot)
  return el
}

export function AcpWeatherIntelligenceChrome({ map, mapShellRef }: AcpWeatherIntelligenceChromeProps) {
  const acp = useAcpPlatform()
  const enabled = acp.config.mapToolbar.weather

  const [weatherPickOnMap, setWeatherPickOnMap] = useState(false)
  const [isWeatherIntelOpen, setIsWeatherIntelOpen] = useState(false)
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(null)
  const weatherPickRef = useRef(false)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  const mapboxToken = getMapboxAccessToken()

  useEffect(() => {
    weatherPickRef.current = weatherPickOnMap
  }, [weatherPickOnMap])

  const handleWeatherMapPick = useCallback(
    async (lng: number, lat: number) => {
      const label = await reversePlaceLabel(lat, lng, mapboxToken)
      setWeatherLocation({ lat, lng, label })
      setIsWeatherIntelOpen(true)
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), ACP_FIELD_LOCATE_MIN_ZOOM),
          duration: 600,
        })
      }
    },
    [map, mapboxToken],
  )

  useEffect(() => {
    if (!map) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!weatherPickRef.current) return
      weatherPickRef.current = false
      setWeatherPickOnMap(false)
      void handleWeatherMapPick(e.lngLat.lng, e.lngLat.lat)
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, handleWeatherMapPick])

  useEffect(() => {
    if (!map) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!isWeatherIntelOpen || !weatherLocation) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const lngLat: [number, number] = [weatherLocation.lng, weatherLocation.lat]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        element: createWeatherPinElement(),
        anchor: 'bottom',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      markerRef.current.setLngLat(lngLat)
    }
  }, [map, isWeatherIntelOpen, weatherLocation])

  useEffect(() => {
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [map])

  useEffect(() => {
    const shell = mapShellRef.current
    if (!shell) return
    shell.classList.toggle('acp-map--weather-pick', weatherPickOnMap)
    return () => {
      shell.classList.remove('acp-map--weather-pick')
    }
  }, [weatherPickOnMap, mapShellRef])

  if (!enabled) return null

  const engaged = weatherPickOnMap || (isWeatherIntelOpen && weatherLocation)

  return (
    <>
      <div className="acp-map-weather-toggle si-weather-toggle">
        <button
          type="button"
          className={`si-weather-button${engaged ? ' active' : ''}`}
          title="Open-Meteo · Weather Intelligence"
          aria-label="Open-Meteo Weather Intelligence"
          aria-pressed={Boolean(engaged)}
          onClick={() => {
            if (engaged) {
              setWeatherPickOnMap(false)
              setIsWeatherIntelOpen(false)
            } else {
              setWeatherPickOnMap(true)
              setIsWeatherIntelOpen(false)
            }
          }}
        >
          <i className="fa-solid fa-temperature-half" aria-hidden />
        </button>
      </div>

      {isWeatherIntelOpen && weatherLocation ? (
        <WeatherIntelligencePanel
          open
          onClose={() => {
            setIsWeatherIntelOpen(false)
            setWeatherPickOnMap(false)
          }}
          onBeginMapPick={() => {
            setWeatherPickOnMap(true)
            setIsWeatherIntelOpen(false)
          }}
          location={weatherLocation}
          onLocationChange={loc => {
            setWeatherLocation(loc)
            map?.flyTo({
              center: [loc.lng, loc.lat],
              zoom: Math.max(map?.getZoom() ?? ACP_FIELD_LOCATE_MIN_ZOOM, ACP_FIELD_LOCATE_MIN_ZOOM),
              duration: 600,
            })
          }}
          mapPickActive={weatherPickOnMap}
          onMapPickToggle={setWeatherPickOnMap}
          mapboxToken={mapboxToken}
          layout="acp-compact"
        />
      ) : null}
    </>
  )
}
