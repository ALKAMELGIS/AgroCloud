import {
  WEATHER_ARCGIS_DATA_LAYERS,
  type WeatherArcgisDataLayerId,
} from './weatherArcgisDataLayers'

const STORAGE_KEY = 'agrocloud.weather.arcgisDataLayers.v1'

export type WeatherArcgisDataLayerPref = {
  visible: boolean
  opacity: number
}

export type WeatherArcgisDataLayerPrefs = Record<WeatherArcgisDataLayerId, WeatherArcgisDataLayerPref>

function defaultPrefs(): WeatherArcgisDataLayerPrefs {
  const prefs = {} as WeatherArcgisDataLayerPrefs
  for (const layer of WEATHER_ARCGIS_DATA_LAYERS) {
    prefs[layer.id] = {
      visible: false,
      opacity: layer.kind === 'image' ? 0.72 : 0.85,
    }
  }
  return prefs
}

export function loadWeatherArcgisDataLayerPrefs(): WeatherArcgisDataLayerPrefs {
  const base = defaultPrefs()
  if (typeof window === 'undefined') return base
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<WeatherArcgisDataLayerPrefs>
    for (const layer of WEATHER_ARCGIS_DATA_LAYERS) {
      const entry = parsed[layer.id]
      if (!entry || typeof entry !== 'object') continue
      base[layer.id] = {
        visible: Boolean(entry.visible),
        opacity:
          typeof entry.opacity === 'number' && Number.isFinite(entry.opacity)
            ? Math.min(1, Math.max(0.05, entry.opacity))
            : base[layer.id].opacity,
      }
    }
    return base
  } catch {
    return base
  }
}

export function saveWeatherArcgisDataLayerPrefs(prefs: WeatherArcgisDataLayerPrefs): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function patchWeatherArcgisDataLayerPref(
  prefs: WeatherArcgisDataLayerPrefs,
  id: WeatherArcgisDataLayerId,
  patch: Partial<WeatherArcgisDataLayerPref>,
): WeatherArcgisDataLayerPrefs {
  return {
    ...prefs,
    [id]: { ...prefs[id], ...patch },
  }
}
