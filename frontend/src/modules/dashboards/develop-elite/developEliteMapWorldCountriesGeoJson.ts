import { filterWorldCountriesForMap } from './developEliteWorldCountries'

/** GeoJSON for the map — prefer filtered portfolio rows; fall back to any geometry from the layer query. */
export function resolveDevelopEliteMapWorldCountriesGeoJson(
  worldCountries: GeoJSON.FeatureCollection | null | undefined,
  worldCountryDomain?: Map<string, string>,
): GeoJSON.FeatureCollection | null {
  if (!worldCountries?.features?.length) return null

  const visible = filterWorldCountriesForMap(worldCountries.features, worldCountryDomain)
  if (visible.length) {
    return { type: 'FeatureCollection', features: visible }
  }

  const withGeometry = worldCountries.features.filter(f => {
    const g = f.geometry
    return g && g.type && g.type !== 'GeometryCollection'
  })
  if (!withGeometry.length) return null

  return { type: 'FeatureCollection', features: withGeometry }
}
