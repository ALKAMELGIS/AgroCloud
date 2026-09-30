import type { Map as MaplibreMap } from 'maplibre-gl'
import type { AcpCountryOption } from '../acpMapSpatial'

export const ACP_SOURCE_COUNTRIES = 'acp-countries'
export const ACP_LAYER_COUNTRIES_GLOW = 'acp-countries-glow'
export const ACP_LAYER_COUNTRIES_LINE = 'acp-countries-line'

/** Bright green outline — matches Agro field AOI accent. */
export const ACP_COUNTRY_BOUNDARY_COLOR = '#39ff14'

const WORLD_COUNTRY_NAME_ALIASES: Record<string, string[]> = {
  uae: ['United Arab Emirates', 'U.A.E.'],
  'united arab emirates': ['United Arab Emirates'],
}

function normalizeCountryToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveWorldCountryNamesForPortfolioLabel(label: string): string[] {
  const key = normalizeCountryToken(label)
  if (!key) return []
  const aliases = WORLD_COUNTRY_NAME_ALIASES[key]
  if (aliases?.length) return aliases
  return [label.trim()]
}

export function worldCountryFeatureMatchesPortfolioLabel(
  props: Record<string, unknown>,
  portfolioLabel: string,
): boolean {
  const countryName = String(props.COUNTRY ?? props.country ?? '').trim()
  if (!countryName) return false
  const countryKey = normalizeCountryToken(countryName)
  const portfolioKey = normalizeCountryToken(portfolioLabel)
  if (countryKey === portfolioKey) return true
  return resolveWorldCountryNamesForPortfolioLabel(portfolioLabel).some(
    candidate => normalizeCountryToken(candidate) === countryKey,
  )
}

export function resolveActivePortfolioCountryLabels(
  countries: AcpCountryOption[],
  countryFilter: string,
): string[] {
  if (countryFilter && countryFilter !== 'all') {
    const hit = countries.find(c => c.value === countryFilter)
    if (hit && hit.value !== 'all') return [hit.label]
    return []
  }
  return countries.filter(c => c.value !== 'all').map(c => c.label)
}

export function filterWorldCountriesToPortfolio(
  geojson: GeoJSON.FeatureCollection,
  portfolioLabels: string[],
): GeoJSON.FeatureCollection {
  if (!portfolioLabels.length) return { type: 'FeatureCollection', features: [] }
  const features = (geojson.features ?? []).filter(raw => {
    const props = (raw as GeoJSON.Feature).properties ?? {}
    return portfolioLabels.some(label => worldCountryFeatureMatchesPortfolioLabel(props, label))
  })
  return { type: 'FeatureCollection', features }
}

export function syncAcpCountryBoundaryLayers(
  map: MaplibreMap,
  geojson: GeoJSON.FeatureCollection | null,
  options?: { beforeLayerId?: string },
) {
  const hasData = Boolean(geojson?.features?.length)
  const beforeId =
    options?.beforeLayerId ??
    (map.getLayer(ACP_LAYER_COUNTRIES_LINE) ? undefined : map.getLayer('acp-aoi-fill') ? 'acp-aoi-fill' : undefined)

  if (!hasData) {
    if (map.getLayer(ACP_LAYER_COUNTRIES_GLOW)) {
      map.setLayoutProperty(ACP_LAYER_COUNTRIES_GLOW, 'visibility', 'none')
    }
    if (map.getLayer(ACP_LAYER_COUNTRIES_LINE)) {
      map.setLayoutProperty(ACP_LAYER_COUNTRIES_LINE, 'visibility', 'none')
    }
    return
  }

  const data = geojson as GeoJSON.FeatureCollection
  const existing = map.getSource(ACP_SOURCE_COUNTRIES) as maplibregl.GeoJSONSource | undefined
  if (existing?.setData) {
    existing.setData(data)
  } else {
    map.addSource(ACP_SOURCE_COUNTRIES, {
      type: 'geojson',
      data,
      tolerance: 0.6,
      buffer: 128,
      maxzoom: 12,
    })

    map.addLayer(
      {
        id: ACP_LAYER_COUNTRIES_GLOW,
        type: 'line',
        source: ACP_SOURCE_COUNTRIES,
        paint: {
          'line-color': ACP_COUNTRY_BOUNDARY_COLOR,
          'line-width': 5,
          'line-opacity': 0.42,
          'line-blur': 2.5,
        },
      },
      beforeId,
    )

    map.addLayer(
      {
        id: ACP_LAYER_COUNTRIES_LINE,
        type: 'line',
        source: ACP_SOURCE_COUNTRIES,
        paint: {
          'line-color': ACP_COUNTRY_BOUNDARY_COLOR,
          'line-width': 2,
          'line-opacity': 0.98,
        },
      },
      beforeId,
    )
  }

  map.setLayoutProperty(ACP_LAYER_COUNTRIES_GLOW, 'visibility', 'visible')
  map.setLayoutProperty(ACP_LAYER_COUNTRIES_LINE, 'visibility', 'visible')
}
