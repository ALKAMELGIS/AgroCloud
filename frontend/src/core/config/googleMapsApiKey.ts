/** Google Maps Platform key (satellite basemap tiles, Develop Dashboard geocoding). */

export function getGoogleMapsApiKeyFromEnv(): string {
  const a = import.meta.env.VITE_GOOGLE_MAPS_SERVER_API_KEY
  const b = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (typeof a === 'string' && a.trim()) return a.trim()
  if (typeof b === 'string' && b.trim()) return b.trim()
  return ''
}
