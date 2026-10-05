import type { PathOptions } from 'leaflet'

/** Matches ArcGIS World_Countries /51 unique-value renderer (Status). */
export function developEliteWorldCountriesPathStyle(feature?: GeoJSON.Feature): PathOptions {
  const props = (feature?.properties ?? {}) as Record<string, unknown>
  const status = Number(props.Status ?? props.status ?? props.STATUS ?? 0)
  switch (status) {
    case 1:
      return { color: '#4ce600', weight: 3, fillOpacity: 0, opacity: 1, lineJoin: 'round' as const }
    case 2:
      return { color: '#e60000', weight: 2.5, fillOpacity: 0, opacity: 1, lineJoin: 'round' as const }
    case 3:
      return { color: '#e64c00', weight: 2.5, fillOpacity: 0, opacity: 1, lineJoin: 'round' as const }
    default:
      return { color: '#94a3b8', weight: 1, fillOpacity: 0, opacity: 0.4 }
  }
}
