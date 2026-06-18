import {
  wmoWeatherIconClass,
  wmoWeatherLabel,
  type OpenMeteoWeatherSnapshot,
} from '../../../../lib/openMeteoWeather'
import {
  expandLngLatBBox,
  pointInLngLatBBox,
  type LngLatBBox,
} from '../../../../lib/siMapViewport'
import {
  buildAcpFieldWeatherTickerEntries,
  scoreWeatherAlertSeverity,
  type AcpFieldWeatherTickerEntry,
  type AcpWeatherTickerField,
} from './acpWeatherAlertTickerModel'

export type AcpWeatherAlertLevel = 'none' | 'yellow' | 'orange' | 'red'

export type AcpWeatherAlertType = {
  type: string
  iconClass: string
  label: string
}

export type AcpFieldWeatherLayerEntry = AcpFieldWeatherTickerEntry & {
  level: AcpWeatherAlertLevel
  levelLabel: string
  alertTypes: AcpWeatherAlertType[]
}

export const ACP_WEATHER_LEVEL_COLORS: Record<AcpWeatherAlertLevel, string> = {
  none: '#39ff14',
  yellow: '#facc15',
  orange: '#f97316',
  red: '#ef4444',
}

export const ACP_WEATHER_LEVEL_LABELS: Record<Exclude<AcpWeatherAlertLevel, 'none'>, string> = {
  yellow: 'Yellow warning',
  orange: 'Orange warning',
  red: 'Red warning',
}

export function resolveWeatherAlertLevel(score: number): AcpWeatherAlertLevel {
  if (score >= 800) return 'red'
  if (score >= 400) return 'orange'
  if (score >= 100) return 'yellow'
  return 'none'
}

export function buildWeatherAlertTypes(snapshot: OpenMeteoWeatherSnapshot): AcpWeatherAlertType[] {
  const alerts: AcpWeatherAlertType[] = []
  const code = snapshot.weatherCode ?? 0

  if (code >= 95) {
    alerts.push({ type: 'thunderstorm', iconClass: 'fa-solid fa-bolt', label: 'Thunderstorms' })
  } else if (code >= 61 && code <= 67) {
    alerts.push({
      type: 'rain',
      iconClass: 'fa-solid fa-cloud-showers-heavy',
      label: wmoWeatherLabel(code),
    })
  } else if (code >= 80 && code <= 82) {
    alerts.push({ type: 'rain', iconClass: 'fa-solid fa-cloud-rain', label: 'Rain showers' })
  }

  if (snapshot.windSpeedKmh != null && snapshot.windSpeedKmh >= 25) {
    alerts.push({
      type: 'wind',
      iconClass: 'fa-solid fa-wind',
      label:
        snapshot.windSpeedKmh >= 40
          ? `Strong winds — ${Math.round(snapshot.windSpeedKmh)} km/h`
          : `Wind — ${Math.round(snapshot.windSpeedKmh)} km/h ${snapshot.windDirectionLabel}`,
    })
  }

  if (snapshot.precipMm != null && snapshot.precipMm >= 1 && !alerts.some(a => a.type === 'rain')) {
    alerts.push({
      type: 'precip',
      iconClass: 'fa-solid fa-droplet',
      label: `Precipitation — ${snapshot.precipMm.toFixed(1)} mm`,
    })
  }

  if (snapshot.temperatureC != null && snapshot.temperatureC >= 42) {
    alerts.push({
      type: 'heat',
      iconClass: 'fa-solid fa-temperature-high',
      label: `Extreme heat — ${Math.round(snapshot.temperatureC)}°C`,
    })
  }

  if (snapshot.temperatureC != null && snapshot.temperatureC <= 2) {
    alerts.push({
      type: 'frost',
      iconClass: 'fa-solid fa-snowflake',
      label: `Frost risk — ${Math.round(snapshot.temperatureC)}°C`,
    })
  }

  if (code === 45 || code === 48) {
    alerts.push({ type: 'fog', iconClass: 'fa-solid fa-smog', label: 'Fog advisory' })
  }

  if (!alerts.length) {
    alerts.push({
      type: 'conditions',
      iconClass: wmoWeatherIconClass(code),
      label: snapshot.conditionLabel || 'Current conditions',
    })
  }

  return alerts
}

export function buildAcpFieldWeatherLayerEntries(
  fields: AcpWeatherTickerField[],
  weatherByFieldKey: Map<string, OpenMeteoWeatherSnapshot>,
): AcpFieldWeatherLayerEntry[] {
  return buildAcpFieldWeatherTickerEntries(fields, weatherByFieldKey).map(entry => {
    const level = resolveWeatherAlertLevel(entry.severity)
    return {
      ...entry,
      level,
      levelLabel: level === 'none' ? 'No active warning' : ACP_WEATHER_LEVEL_LABELS[level],
      alertTypes: buildWeatherAlertTypes(entry.snapshot),
    }
  })
}

const MARKER_VIEWPORT_EXPAND = 0.18
const LOW_ZOOM_MARKER_CAP = 96
const FIELD_ZOOM_MARKER_CAP = 48
const LOW_ZOOM_THRESHOLD = 6

export function filterWeatherMarkersForViewport(
  entries: AcpFieldWeatherLayerEntry[],
  viewportBbox: LngLatBBox | null,
  mapZoom: number | null,
  alwaysVisibleKeys: ReadonlySet<string>,
): AcpFieldWeatherLayerEntry[] {
  if (!entries.length) return entries
  if (!viewportBbox) return entries

  const bbox = expandLngLatBBox(viewportBbox, MARKER_VIEWPORT_EXPAND)
  const pinned = new Set(alwaysVisibleKeys)
  const visible: AcpFieldWeatherLayerEntry[] = []

  for (const entry of entries) {
    if (pinned.has(entry.fieldKey) || pointInLngLatBBox(entry.lng, entry.lat, bbox)) {
      visible.push(entry)
    }
  }

  const cap =
    mapZoom != null && mapZoom >= LOW_ZOOM_THRESHOLD ? FIELD_ZOOM_MARKER_CAP : LOW_ZOOM_MARKER_CAP

  if (visible.length <= cap) return visible

  const pinnedResults = visible.filter(r => pinned.has(r.fieldKey))
  const rest = visible
    .filter(r => !pinned.has(r.fieldKey))
    .sort((a, b) => b.severity - a.severity)
  const slots = Math.max(cap - pinnedResults.length, 0)
  return [...pinnedResults, ...rest.slice(0, slots)]
}
