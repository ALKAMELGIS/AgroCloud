import { useEffect, useState } from 'react'
import { fetchOpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'

function readFieldId(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return 'Field'
  const p = props as Record<string, unknown>
  return String(p.ZONE_ID ?? p.Farm_Code ?? p.Farm_Name ?? p.OBJECTID ?? 'Field')
}

type Props = {
  feature: GeoJSON.Feature | null
  onClose: () => void
}

export function WeatherFieldPanel({ feature, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  useEffect(() => {
    if (!feature?.geometry) {
      setSummary(null)
      return
    }
    const g = feature.geometry
    let lat = 0
    let lng = 0
    if (g.type === 'Point') {
      lng = g.coordinates[0]
      lat = g.coordinates[1]
    } else {
      setSummary('Centroid weather for polygon — loading…')
      const layer = L_geoBounds(feature)
      if (!layer) return
      lat = (layer.south + layer.north) / 2
      lng = (layer.west + layer.east) / 2
    }
    setLoading(true)
    void fetchOpenMeteoDashboardBundle(lat, lng)
      .then(b => {
        const s = b.snapshot
        setSummary(
          `Temperature: ${s.temperatureC?.toFixed(1) ?? '—'}°C · Humidity: ${s.humidityPct != null ? Math.round(s.humidityPct) : '—'}% · Wind: ${s.windSpeedKmh != null ? Math.round(s.windSpeedKmh) : '—'} km/h ${s.windDirectionLabel ?? ''}`,
        )
      })
      .catch(() => setSummary('Failed to load field weather'))
      .finally(() => setLoading(false))
  }, [feature])

  if (!feature) return null

  return (
    <section className="weather-field-panel">
      <header>
        <h3>Field weather</h3>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>
      <p><strong>Field:</strong> {readFieldId(feature.properties)}</p>
      <p>{loading ? 'Loading…' : summary ?? '—'}</p>
    </section>
  )
}

function L_geoBounds(feature: GeoJSON.Feature): { north: number; south: number; east: number; west: number } | null {
  const g = feature.geometry
  if (!g) return null
  const pts: number[][] = []
  const push = (lng: number, lat: number) => pts.push([lng, lat])
  if (g.type === 'Polygon') {
    for (const ring of g.coordinates) for (const c of ring) push(c[0], c[1])
  } else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) for (const ring of poly) for (const c of ring) push(c[0], c[1])
  } else return null
  if (!pts.length) return null
  const lngs = pts.map(p => p[0])
  const lats = pts.map(p => p[1])
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  }
}
