/** ArcGIS World_Countries FeatureServer/51 — portfolio country boundaries. */
export const WORLD_COUNTRIES_FS51_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/World_Countries/FeatureServer/51'

export function isWorldCountriesLayerUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const normalized = url.trim().replace(/\/+$/, '').toLowerCase()
  if (normalized === WORLD_COUNTRIES_FS51_URL.toLowerCase()) return true
  return /\/world_countries\/featureserver\/51$/i.test(normalized)
}
