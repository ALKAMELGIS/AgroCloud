import { pickDefaultBasemapId, resolveBasemapId } from '@/modules/gis/map/basemapCatalog'

/** Default basemap for Weather Intelligence (Esri Dark Gray Canvas). */
export const WEATHER_DEFAULT_BASEMAP_ID = 'esri-dark-gray'

const LS_KEY = 'agrocloud_weather_intelligence_basemap_v1'

export function readWeatherBasemapId(): string {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return pickDefaultBasemapId(raw)
  } catch {
    /* private mode / blocked storage */
  }
  return WEATHER_DEFAULT_BASEMAP_ID
}

export function writeWeatherBasemapId(id: string): void {
  try {
    localStorage.setItem(LS_KEY, resolveBasemapId(id))
  } catch {
    /* ignore */
  }
}
