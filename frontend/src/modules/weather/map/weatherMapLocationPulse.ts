import L from 'leaflet'

const FLASH_MS = 2400

/** Bright expanding ring at a map point (location focus). */
export function pulseWeatherMapLocation(map: L.Map, lat: number, lng: number): void {
  const html = `<div class="weather-loc-focus-flash" aria-hidden="true">
    <span class="weather-loc-focus-flash__ring"></span>
    <span class="weather-loc-focus-flash__ring weather-loc-focus-flash__ring--delay"></span>
  </div>`

  const icon = L.divIcon({
    className: 'weather-loc-focus-flash-leaflet',
    html,
    iconSize: [160, 160],
    iconAnchor: [80, 80],
  })

  const marker = L.marker([lat, lng], {
    icon,
    interactive: false,
    keyboard: false,
    zIndexOffset: 2500,
  })

  marker.addTo(map)
  window.setTimeout(() => {
    try {
      map.removeLayer(marker)
    } catch {
      /* torn down */
    }
  }, FLASH_MS)
}
