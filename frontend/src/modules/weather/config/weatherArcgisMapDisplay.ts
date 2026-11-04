/**
 * Weather map "display view" selector: one value that picks either a live Open-Meteo
 * layer or a single ArcGIS Online / Living Atlas data layer.
 *
 * Encoded as `<source>:<layerId>` so it can be stored in a <select> value / URL / prefs.
 */
import { WEATHER_MAP_LAYERS, type WeatherMapLayerId } from './weatherLayerCatalog'
import { WEATHER_ARCGIS_DATA_LAYERS, type WeatherArcgisDataLayerId } from './weatherArcgisDataLayers'
import type { WeatherArcgisDataLayerPrefs } from './weatherArcgisDataLayerPrefs'

export type WeatherMapDisplayView =
  | { source: 'open-meteo'; layerId: WeatherMapLayerId }
  | { source: 'arcgis-data'; layerId: WeatherArcgisDataLayerId }

export type WeatherMapDisplayOption = {
  value: string
  label: string
  group: 'live' | 'arcgis'
}

const SEP = ':'

export function encodeWeatherMapDisplayView(view: WeatherMapDisplayView): string {
  return `${view.source}${SEP}${view.layerId}`
}

export function decodeWeatherMapDisplayView(value: string | null | undefined): WeatherMapDisplayView | null {
  if (!value) return null
  const idx = value.indexOf(SEP)
  if (idx <= 0) return null
  const source = value.slice(0, idx)
  const layerId = value.slice(idx + 1)
  if (source === 'open-meteo') {
    const hit = WEATHER_MAP_LAYERS.find(l => l.id === layerId)
    return hit ? { source: 'open-meteo', layerId: hit.id } : null
  }
  if (source === 'arcgis-data') {
    const hit = WEATHER_ARCGIS_DATA_LAYERS.find(l => l.id === layerId)
    return hit ? { source: 'arcgis-data', layerId: hit.id } : null
  }
  return null
}

export function weatherArcgisMapDisplayOptions(): WeatherMapDisplayOption[] {
  const live: WeatherMapDisplayOption[] = WEATHER_MAP_LAYERS.map(l => ({
    value: encodeWeatherMapDisplayView({ source: 'open-meteo', layerId: l.id }),
    label: l.label,
    group: 'live',
  }))
  const arcgis: WeatherMapDisplayOption[] = WEATHER_ARCGIS_DATA_LAYERS.map(l => ({
    value: encodeWeatherMapDisplayView({ source: 'arcgis-data', layerId: l.id }),
    label: l.label,
    group: 'arcgis',
  }))
  return [...live, ...arcgis]
}

/** When an ArcGIS data view is selected, show only that layer (opacity prefs preserved). */
export function arcgisDataLayerPrefsForDisplayView(
  view: WeatherMapDisplayView | null,
  prefs: WeatherArcgisDataLayerPrefs,
): WeatherArcgisDataLayerPrefs {
  if (!view || view.source !== 'arcgis-data') return prefs
  const next = { ...prefs }
  for (const layer of WEATHER_ARCGIS_DATA_LAYERS) {
    next[layer.id] = { ...prefs[layer.id], visible: layer.id === view.layerId }
  }
  return next
}
