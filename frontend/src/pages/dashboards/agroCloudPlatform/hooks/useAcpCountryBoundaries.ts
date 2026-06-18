import { useEffect, useMemo, useState } from 'react'
import { fetchArcGisFeatureLayerGeoJson } from '../../../../lib/arcgisFeatureLayerGeoJson'
import { getArcgisPortalToken } from '../../../../lib/arcgisPortalToken'
import { WORLD_COUNTRIES_FS51_URL } from '../../../../lib/worldCountriesLayer'
import type { AcpCountryOption } from '../acpMapSpatial'
import {
  filterWorldCountriesToPortfolio,
  resolveActivePortfolioCountryLabels,
} from '../map/acpCountryBoundaries'

export function useAcpCountryBoundaries(
  countries: AcpCountryOption[],
  countryFilter: string,
): GeoJSON.FeatureCollection | null {
  const [worldGeojson, setWorldGeojson] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = getArcgisPortalToken() || undefined
        const fc = await fetchArcGisFeatureLayerGeoJson(WORLD_COUNTRIES_FS51_URL, { token })
        if (!cancelled) setWorldGeojson(fc as GeoJSON.FeatureCollection)
      } catch {
        if (!cancelled) setWorldGeojson(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => {
    if (!worldGeojson?.features?.length) return null
    const labels = resolveActivePortfolioCountryLabels(countries, countryFilter)
    const filtered = filterWorldCountriesToPortfolio(worldGeojson, labels)
    return filtered.features.length ? filtered : null
  }, [worldGeojson, countries, countryFilter])
}
