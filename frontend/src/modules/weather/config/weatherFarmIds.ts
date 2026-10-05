/** Selected location in Weather Intelligence (Agri_Location OBJECTID or portfolio). */
export type WeatherLocationId = 'all' | `loc-${number}`

/** @deprecated Use {@link WeatherLocationId}. */
export type WeatherFarmPresetId = WeatherLocationId

export function weatherLocationIdFromObjectId(objectId: number | string): WeatherLocationId {
  return `loc-${Number(objectId)}`
}

export function weatherLocationIdFromFeature(feature: GeoJSON.Feature): WeatherLocationId | null {
  if (!feature.properties || typeof feature.properties !== 'object') return null
  const p = feature.properties as Record<string, unknown>
  const oid = p.OBJECTID ?? p.objectid ?? p.ObjectId
  if (oid == null || oid === '') return null
  const n = Number(oid)
  if (!Number.isFinite(n)) return null
  return weatherLocationIdFromObjectId(n)
}

export function readAgriLocationDisplayName(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return ''
  const p = props as Record<string, unknown>
  return String(p.Name ?? p.name ?? p.Project ?? p.Project_Code ?? '').trim()
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function readZoneKey(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return ''
  const p = props as Record<string, unknown>
  return normalizeKey(String(p.ZONEID ?? p.ZONE_ID ?? p.ZoneId ?? ''))
}

export function structureBelongsToAgriLocation(
  structure: GeoJSON.Feature,
  location: GeoJSON.Feature,
): boolean {
  const locName = normalizeKey(readAgriLocationDisplayName(location.properties))
  if (!locName) return false
  const sProps = structure.properties
  if (!sProps || typeof sProps !== 'object') return false
  const sp = sProps as Record<string, unknown>
  const farmName = normalizeKey(String(sp.Farm_Name ?? sp.FARM_NAME ?? sp.farm_name ?? ''))
  if (farmName && (farmName === locName || farmName.includes(locName) || locName.includes(farmName))) {
    return true
  }
  const zLoc = readZoneKey(location.properties)
  const zStruct = readZoneKey(structure.properties)
  return Boolean(zLoc && zStruct && zLoc === zStruct)
}
