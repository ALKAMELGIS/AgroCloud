import type { DevelopEliteFilters } from './developEliteKpiEngine'
import { readWorldCountryCode } from './developEliteWorldCountries'

export type DevelopEliteMapOverlayLayer = {
  id: 'world-countries' | 'zones' | 'agri-location'
  geojson: GeoJSON.FeatureCollection
  drawingInfo: Record<string, unknown> | null
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function readZoneId(props: Record<string, unknown>): string {
  const raw = props.ZONE_ID ?? props.ZONEID ?? props.Zone_ID ?? props.zone_id
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

/** Country filter is used for map fly-to extent, not for hiding World_Countries on the map. */
export function filterDevelopEliteMapOverlayGeoJson(
  geojson: GeoJSON.FeatureCollection | null | undefined,
  filters: DevelopEliteFilters,
  layerId?: DevelopEliteMapOverlayLayer['id'],
  countryDomain?: Map<string, string>,
): GeoJSON.FeatureCollection {
  if (!geojson?.features?.length) return EMPTY
  let features = geojson.features
  if (filters.country && filters.country !== 'all') {
    const want = filters.country
    features = features.filter(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      const code = readWorldCountryCode(props, countryDomain)
      return code === want || code === String(Number(want))
    })
  }
  // World_Countries polygons are not tagged with farm ZONE_ID — do not apply zone filter.
  if (layerId !== 'world-countries' && filters.zoneId && filters.zoneId !== 'all') {
    const want = filters.zoneId
    features = features.filter(f => {
      const zone = readZoneId((f.properties ?? {}) as Record<string, unknown>)
      return zone === want
    })
  }
  return { type: 'FeatureCollection', features }
}
