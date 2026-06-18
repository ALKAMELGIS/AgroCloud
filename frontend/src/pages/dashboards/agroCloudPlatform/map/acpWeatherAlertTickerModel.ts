import {
  buildAgroStructuresCountryDescriptionMapFromFeatures,
  resolveAgroStructuresCountryLabel,
  resolveAgroStructuresFieldDisplayName,
} from '../../../../lib/agroStructuresPrimaryAoi'
import { wmoWeatherIconClass, type OpenMeteoWeatherSnapshot } from '../../../../lib/openMeteoWeather'
import {
  extractCropAlertFieldsFromMask,
  type CropAlertFieldInput,
} from '../../../../lib/siCropAlertEngine'
import type { AcpMapScopeMode } from '../acpPlatformContext'
import { resolveAcpScopeGeoFeatures, type AcpMapViewSlice } from '../acpViewportScope'
import type { AcpWeatherAlertLevel } from './acpWeatherAlertLayerModel'
import { resolveWeatherAlertLevel } from './acpWeatherAlertLayerModel'

export const ACP_WEATHER_TICKER_MAX_FIELDS = 32
export const ACP_WEATHER_TICKER_GRID_PRECISION = 2
/** Visual separator between field blocks in the scrolling ticker. */
export const ACP_WEATHER_TICKER_FIELD_SEPARATOR = '◆'
/** ~20 seconds per field block — slow airport-style crawl. */
export const ACP_WEATHER_TICKER_SECONDS_PER_FIELD = 20
export const ACP_WEATHER_TICKER_MIN_DURATION_S = 200

export type AcpWeatherTickerField = {
  fieldKey: string
  objectId: string
  displayName: string
  country: string
  lat: number
  lng: number
  geometry?: GeoJSON.Geometry
}

export type AcpFieldWeatherTickerEntry = {
  fieldKey: string
  objectId: string
  displayName: string
  country: string
  lat: number
  lng: number
  snapshot: OpenMeteoWeatherSnapshot
  severity: number
  level: AcpWeatherAlertLevel
  weatherIconClass: string
  segment: string
}

export function weatherGridKey(lat: number, lng: number, precision = ACP_WEATHER_TICKER_GRID_PRECISION): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`
}

export function resolveAcpWeatherTickerCountryLabel(
  countryCode: string,
  descriptionMap?: Map<string, string> | null,
): string {
  const code = String(countryCode || '').trim()
  if (!code || code === '—') return '—'
  const label = resolveAgroStructuresCountryLabel(code, descriptionMap)
  return label && label !== 'Unknown' ? label : code
}

export function resolveAcpWeatherTickerFields(
  mask: GeoJSON.FeatureCollection | null | undefined,
  options: {
    mapView: AcpMapViewSlice
    scopeMode: AcpMapScopeMode
    countryFilter: string
    selectedFieldKey: string | null
    maxFields?: number
    countryDescriptionMap?: Map<string, string> | null
  },
): AcpWeatherTickerField[] {
  if (!mask?.features?.length) return []

  const countryDescriptionMap =
    options.countryDescriptionMap ??
    buildAgroStructuresCountryDescriptionMapFromFeatures(mask.features)

  const scopeFeatures = resolveAcpScopeGeoFeatures(
    mask,
    options.mapView,
    options.scopeMode,
    options.countryFilter,
  )
  if (!scopeFeatures.length) return []

  let fields = extractCropAlertFieldsFromMask({ features: scopeFeatures })
  if (options.scopeMode === 'selection' && options.selectedFieldKey) {
    fields = fields.filter(f => f.fieldKey === options.selectedFieldKey)
  }

  const maxFields = options.maxFields ?? ACP_WEATHER_TICKER_MAX_FIELDS
  const capped = fields.slice(0, maxFields)

  return capped.map(f => cropAlertFieldToTickerField(f, countryDescriptionMap))
}

function cropAlertFieldToTickerField(
  field: CropAlertFieldInput,
  countryDescriptionMap?: Map<string, string> | null,
): AcpWeatherTickerField {
  const [lng, lat] = field.centroid
  return {
    fieldKey: field.fieldKey,
    objectId: field.objectId,
    displayName: resolveAgroStructuresFieldDisplayName({
      farmName: field.farmName,
      farmCode: field.farmCode,
      objectId: field.objectId,
      structureType: field.structureType,
    }),
    country: resolveAcpWeatherTickerCountryLabel(field.country, countryDescriptionMap),
    lat,
    lng,
    geometry: field.geometry,
  }
}

/** Higher score = more urgent — shown first in the ticker. */
export function scoreWeatherAlertSeverity(snapshot: OpenMeteoWeatherSnapshot): number {
  let score = 0
  const code = snapshot.weatherCode ?? 0

  if (code >= 95) score += 1000
  else if (code >= 80) score += 500
  else if (code >= 61) score += 300

  const precip = snapshot.precipMm
  if (precip != null && precip >= 8) score += 400
  else if (precip != null && precip >= 1) score += 150

  const wind = snapshot.windSpeedKmh
  if (wind != null && wind >= 40) score += 350
  else if (wind != null && wind >= 25) score += 100

  const temp = snapshot.temperatureC
  if (temp != null && temp >= 42) score += 250
  if (temp != null && temp <= 2) score += 250

  if (code === 45 || code === 48) score += 80

  const rh = snapshot.humidityPct
  if (rh != null && rh <= 20) score += 50

  return score
}

export function formatAcpFieldWeatherTickerSegment(
  field: Pick<AcpWeatherTickerField, 'displayName' | 'country'>,
  snapshot: OpenMeteoWeatherSnapshot,
): string {
  const temp =
    snapshot.temperatureC != null && Number.isFinite(snapshot.temperatureC)
      ? `${Math.round(snapshot.temperatureC)}°C`
      : '—'
  const rain =
    snapshot.precipMm != null && Number.isFinite(snapshot.precipMm)
      ? `${snapshot.precipMm.toFixed(1)} mm`
      : '—'
  const rh =
    snapshot.humidityPct != null && Number.isFinite(snapshot.humidityPct)
      ? `${Math.round(snapshot.humidityPct)}%`
      : '—'
  const wind =
    snapshot.windSpeedKmh != null && Number.isFinite(snapshot.windSpeedKmh)
      ? `${Math.round(snapshot.windSpeedKmh)} km/h ${snapshot.windDirectionLabel}`
      : '—'

  return `${field.displayName} · ${field.country} · ${temp} · Rain ${rain} · RH ${rh} · Wind ${wind}`
}

export function resolveAcpWeatherTickerScrollDurationS(fieldCount: number): number {
  const n = Math.max(1, fieldCount)
  return Math.max(ACP_WEATHER_TICKER_MIN_DURATION_S, n * ACP_WEATHER_TICKER_SECONDS_PER_FIELD)
}

export function buildAcpFieldWeatherTickerEntries(
  fields: AcpWeatherTickerField[],
  weatherByFieldKey: Map<string, OpenMeteoWeatherSnapshot>,
): AcpFieldWeatherTickerEntry[] {
  const entries: AcpFieldWeatherTickerEntry[] = []

  for (const field of fields) {
    const snapshot = weatherByFieldKey.get(field.fieldKey)
    if (!snapshot) continue
    const severity = scoreWeatherAlertSeverity(snapshot)
    const level = resolveWeatherAlertLevel(severity)
    entries.push({
      ...field,
      snapshot,
      severity,
      level,
      weatherIconClass: wmoWeatherIconClass(snapshot.weatherCode),
      segment: formatAcpFieldWeatherTickerSegment(field, snapshot),
    })
  }

  entries.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  })

  return entries
}

export function joinAcpWeatherAlertTickerText(items: string[]): string {
  return items.filter(Boolean).join(`   ${ACP_WEATHER_TICKER_FIELD_SEPARATOR}   `)
}

export function groupWeatherTickerFieldsByGrid(
  fields: AcpWeatherTickerField[],
): Map<string, AcpWeatherTickerField[]> {
  const groups = new Map<string, AcpWeatherTickerField[]>()
  for (const field of fields) {
    const key = weatherGridKey(field.lat, field.lng)
    const list = groups.get(key) ?? []
    list.push(field)
    groups.set(key, list)
  }
  return groups
}
