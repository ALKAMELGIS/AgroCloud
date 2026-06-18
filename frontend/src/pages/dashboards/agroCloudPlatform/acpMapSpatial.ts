import {
  buildAgroStructuresLayerKpiTotals,
  resolveAgroStructuresCountry,
  resolveAgroStructuresCountryCode,
  resolveAgroStructuresCountryDisplayName,
  resolveAgroStructuresFeatureAreaHa,
  resolveAgroStructuresFieldDisplayName,
  resolveAgroStructuresStructureTypeLabel,
} from '../../../lib/agroStructuresPrimaryAoi'
import { computeChas, chasInputsFromDaily } from '../../../lib/chasIndex'
import { bboxesIntersect, geometryBBox } from '../../../lib/geoAiGeoJsonSpatial'
import { computeStableGisFeatureKey } from '../../../lib/gisFeatureStableKey'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import {
  extractCropAlertFieldsFromMask,
  type CropAlertFieldInput,
  type CropAlertFieldResult,
} from '../../../lib/siCropAlertEngine'
import { resolveDchasOrbPresentation } from '../../../lib/siCropAlertDchasBeacon'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'

export type AcpGeoFeature = {
  type: 'Feature'
  geometry: GeoJSON.Geometry
  properties: Record<string, unknown>
}

export function filterGeoJsonFeaturesInBBox(
  geojson: { features?: unknown[] } | null | undefined,
  bbox: LngLatBBox | null,
): AcpGeoFeature[] {
  const features = Array.isArray(geojson?.features) ? geojson!.features! : []
  if (!bbox) {
    return features.filter(f => (f as AcpGeoFeature).geometry) as AcpGeoFeature[]
  }
  return features.filter(raw => {
    const f = raw as AcpGeoFeature
    if (!f?.geometry) return false
    const fb = geometryBBox(f.geometry)
    return Boolean(fb && bboxesIntersect(fb, bbox))
  }) as AcpGeoFeature[]
}

export function buildKpiTotalsFromFeatures(features: AcpGeoFeature[]) {
  return buildAgroStructuresLayerKpiTotals({ features })
}

export type AcpStructureFieldOption = {
  fieldKey: string
  displayName: string
  objectId: string
}

/** All Agro_Structures fields for WMS / time-series pickers (sorted by Field Name). */
export function buildAgroStructureFieldOptions(
  mask: GeoJSON.FeatureCollection | null | undefined,
): AcpStructureFieldOption[] {
  const fields = extractCropAlertFieldsFromMask(mask as { features?: unknown[] })
  return fields
    .map(f => ({
      fieldKey: f.fieldKey,
      displayName: resolveAgroStructuresFieldDisplayName({
        farmName: f.farmName,
        farmCode: f.farmCode,
        objectId: f.objectId,
        structureType: f.structureType,
      }),
      objectId: f.objectId,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
}

export function resolveAgroStructureFieldByKey(
  mask: GeoJSON.FeatureCollection | null | undefined,
  fieldKey: string,
): CropAlertFieldInput | null {
  const fields = extractCropAlertFieldsFromMask(mask as { features?: unknown[] })
  return fields.find(f => f.fieldKey === fieldKey) ?? null
}

export type AcpFieldLocateWeatherPoint = {
  fieldKey: string
  lng: number
  lat: number
}

/** Map fly-to center — CHAS results, weather ticker, or AOI geometry fallback. */
export function resolveAcpFieldLocateCenter(
  fieldKey: string,
  options: {
    aoiMask: GeoJSON.FeatureCollection | null | undefined
    allResults: CropAlertFieldResult[]
    weatherPoints?: AcpFieldLocateWeatherPoint[] | null
  },
): [number, number] | null {
  const key = String(fieldKey || '').trim()
  if (!key) return null

  const chasHit = options.allResults.find(r => r.fieldKey === key)
  if (chasHit?.centroid?.length === 2 && chasHit.centroid.every(Number.isFinite)) {
    return chasHit.centroid
  }

  const weatherHit = options.weatherPoints?.find(p => p.fieldKey === key)
  if (weatherHit && Number.isFinite(weatherHit.lng) && Number.isFinite(weatherHit.lat)) {
    return [weatherHit.lng, weatherHit.lat]
  }

  const aoiField = resolveAgroStructureFieldByKey(options.aoiMask, key)
  if (aoiField?.centroid?.length === 2 && aoiField.centroid.every(Number.isFinite)) {
    return aoiField.centroid
  }

  return null
}

export const ACP_FIELD_LOCATE_MIN_ZOOM = 12

export type AcpCountryOption = {
  value: string
  label: string
}

export type AcpFieldTableRow = {
  fieldKey: string
  objectId: string
  displayName: string
  structureType: string
  /** ArcGIS Country coded value — used for filters. */
  countryCode: string
  /** Human-readable country name for UI. */
  country: string
  areaHa: number
  chas: number | null
  deltaChas: number | null
  coveragePct: number | null
  alertTier: string
  alertColor: string
  status: string
  severity: string
  imageDate: string | null
  result: CropAlertFieldResult | null
}

export function buildFieldTableRows(
  features: AcpGeoFeature[],
  resultsByKey: Map<string, CropAlertFieldResult>,
  countryDescriptionMap?: Map<string, string> | null,
): AcpFieldTableRow[] {
  return features.map((f, i) => {
    const props = f.properties ?? {}
    const fieldKey = computeStableGisFeatureKey(f, i)
    const result = resultsByKey.get(fieldKey) ?? null
    const orb = result ? resolveDchasOrbPresentation(result) : null
    const areaHa = resolveAgroStructuresFeatureAreaHa(props, f.geometry)
    const coverage = result?.layerLiveZonal?.ndvi?.mean
      ? Math.min(100, Math.max(0, result.layerLiveZonal.ndvi.mean * 100))
      : result?.current?.ndvi != null
        ? Math.min(100, Math.max(0, result.current.ndvi * 100))
        : null
    return {
      fieldKey,
      objectId: String(props.OBJECTID ?? props.objectid ?? i),
      displayName: resolveAgroStructuresFieldDisplayName({
        farmName: String(props.Farm_Name ?? props.farm_name ?? ''),
        farmCode: String(props.Farm_Code ?? props.farm_code ?? ''),
        objectId: String(props.OBJECTID ?? i),
        structureType: resolveAgroStructuresStructureTypeLabel(props),
      }),
      structureType: resolveAgroStructuresStructureTypeLabel(props),
      countryCode: resolveAgroStructuresCountryCode(props) || '—',
      country:
        resolveAgroStructuresCountryDisplayName(props, countryDescriptionMap) || '—',
      areaHa: Number.isFinite(areaHa) && areaHa > 0 ? Number(areaHa.toFixed(2)) : 0,
      chas: result?.chasCurrent ?? orb?.chasCurrent ?? null,
      deltaChas: result?.deltaChas ?? orb?.deltaChas ?? null,
      coveragePct: coverage != null ? Number(coverage.toFixed(1)) : null,
      alertTier: orb?.tier ?? 'stable',
      alertColor: orb?.color ?? '#9e9e9e',
      status: result?.title ?? '—',
      severity: result?.severity ?? 'normal',
      imageDate: result?.imageDate ?? null,
      result,
    }
  })
}

export function aggregateDailySeriesForFeatures(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
): { labels: string[]; ndvi: number[]; chas: number[]; ndmi: number[] } {
  const dateSet = new Set<string>()
  for (const key of fieldKeys) {
    for (const row of dailyMaps.get(key) ?? []) dateSet.add(row.date)
  }
  const labels = [...dateSet].sort()
  const ndvi: number[] = []
  const chas: number[] = []
  const ndmi: number[] = []
  for (const date of labels) {
    const ndviVals: number[] = []
    const ndmiVals: number[] = []
    const chasVals: number[] = []
    for (const key of fieldKeys) {
      const row = dailyMaps.get(key)?.find(d => d.date === date)
      if (!row) continue
      if (row.ndvi != null && Number.isFinite(row.ndvi)) ndviVals.push(row.ndvi)
      if (row.ndmi != null && Number.isFinite(row.ndmi)) ndmiVals.push(row.ndmi)
      const chasVal = computeChas(chasInputsFromDaily(row))
      if (Number.isFinite(chasVal)) chasVals.push(chasVal)
    }
    ndvi.push(ndviVals.length ? ndviVals.reduce((a, b) => a + b, 0) / ndviVals.length : NaN)
    ndmi.push(ndmiVals.length ? ndmiVals.reduce((a, b) => a + b, 0) / ndmiVals.length : NaN)
    chas.push(chasVals.length ? chasVals.reduce((a, b) => a + b, 0) / chasVals.length : NaN)
  }
  return { labels, ndvi, chas, ndmi }
}

export function resolveFieldNdviMean(row: AcpFieldTableRow): number | null {
  const layerMean = row.result?.layerLiveZonal?.ndvi?.mean
  if (layerMean != null && Number.isFinite(layerMean)) {
    return Math.max(0, Math.min(1, layerMean))
  }
  const current = row.result?.current?.ndvi
  if (current != null && Number.isFinite(current)) {
    return Math.max(0, Math.min(1, current))
  }
  return null
}

export type AcpVegetationDonutStats = {
  vegetationHa: number
  bareHa: number
  unanalyzedHa: number
  vegetationPct: number
  barePct: number
  unanalyzedPct: number
  /** Planted share within NDVI-analyzed area (sums to 100% with unplantedSharePct). */
  plantedSharePct: number
  unplantedSharePct: number
  totalAreaHa: number
  analyzedAreaHa: number
  analyzedFieldCount: number
  totalFieldCount: number
}

export type AcpVegetationDonutTrend = {
  /** Change in planted portfolio share vs previous NDVI scene (percentage points). */
  plantedShareDelta: number | null
  direction: 'up' | 'down' | 'flat' | null
}

export function resolveFieldNdviMeanPrevious(row: AcpFieldTableRow): number | null {
  const prev7 = row.result?.previous7?.ndvi
  if (prev7 != null && Number.isFinite(prev7)) {
    return Math.max(0, Math.min(1, prev7))
  }
  const scenes = row.result?.ndviSceneValues
  if (scenes && scenes.length >= 2 && Number.isFinite(scenes[1]!)) {
    return Math.max(0, Math.min(1, scenes[1]!))
  }
  return null
}

/** Portfolio share (0–100) with one decimal — keeps % aligned with displayed hectares. */
export function portfolioAreaPct(ha: number, totalAreaHa: number): number {
  if (totalAreaHa <= 0 || !Number.isFinite(ha)) return 0
  return Math.round((ha / totalAreaHa) * 1000) / 10
}

export function vegetationDonutFromRows(
  rows: AcpFieldTableRow[],
  totalAreaHaOverride?: number,
  ndviResolver: (row: AcpFieldTableRow) => number | null = resolveFieldNdviMean,
): AcpVegetationDonutStats {
  let vegetationHa = 0
  let bareHa = 0
  let rowAreaSum = 0
  let analyzedAreaHa = 0
  let analyzedFieldCount = 0

  for (const row of rows) {
    if (row.areaHa <= 0) continue
    rowAreaSum += row.areaHa
    const ndvi = ndviResolver(row)
    if (ndvi == null) continue
    analyzedFieldCount += 1
    analyzedAreaHa += row.areaHa
    vegetationHa += row.areaHa * ndvi
    bareHa += row.areaHa * (1 - ndvi)
  }

  const totalAreaHa =
    totalAreaHaOverride != null && totalAreaHaOverride > 0 && totalAreaHaOverride >= rowAreaSum
      ? totalAreaHaOverride
      : rowAreaSum
  const unanalyzedHa = Math.max(0, totalAreaHa - analyzedAreaHa)

  const vegetationHaOut = Number(vegetationHa.toFixed(2))
  const bareHaOut = Number(bareHa.toFixed(2))
  const unanalyzedHaOut = Number(unanalyzedHa.toFixed(2))
  const totalAreaHaOut = Number(totalAreaHa.toFixed(2))
  const analyzedSplitTotal = vegetationHaOut + bareHaOut
  const plantedSharePct = portfolioAreaPct(vegetationHaOut, analyzedSplitTotal)
  const unplantedSharePct = portfolioAreaPct(bareHaOut, analyzedSplitTotal)

  return {
    vegetationHa: vegetationHaOut,
    bareHa: bareHaOut,
    unanalyzedHa: unanalyzedHaOut,
    vegetationPct: portfolioAreaPct(vegetationHaOut, totalAreaHaOut),
    barePct: portfolioAreaPct(bareHaOut, totalAreaHaOut),
    unanalyzedPct: portfolioAreaPct(unanalyzedHaOut, totalAreaHaOut),
    plantedSharePct,
    unplantedSharePct,
    totalAreaHa: totalAreaHaOut,
    analyzedAreaHa: Number(analyzedAreaHa.toFixed(2)),
    analyzedFieldCount,
    totalFieldCount: rows.length,
  }
}

export function vegetationDonutTrendFromRows(
  rows: AcpFieldTableRow[],
  totalAreaHaOverride?: number,
): AcpVegetationDonutTrend {
  const current = vegetationDonutFromRows(rows, totalAreaHaOverride)
  if (current.analyzedFieldCount === 0) {
    return { plantedShareDelta: null, direction: null }
  }

  const previous = vegetationDonutFromRows(rows, totalAreaHaOverride, resolveFieldNdviMeanPrevious)
  if (previous.analyzedFieldCount === 0) {
    return { plantedShareDelta: null, direction: null }
  }

  const delta = Number((current.plantedSharePct - previous.plantedSharePct).toFixed(1))
  if (!Number.isFinite(delta)) {
    return { plantedShareDelta: null, direction: null }
  }
  if (Math.abs(delta) < 0.5) {
    return { plantedShareDelta: delta, direction: 'flat' }
  }
  return { plantedShareDelta: delta, direction: delta > 0 ? 'up' : 'down' }
}

export type AcpLayerLiveIndexStats = {
  mean: number
  min: number
  max: number
  sceneDate: string | null
}

export function resolveLayerLiveIndexStats(
  row: AcpFieldTableRow,
  wmsLayer: string,
): AcpLayerLiveIndexStats | null {
  const zonal = row.result?.layerLiveZonal
  if (!zonal) return null
  const key = wmsLayer.toLowerCase()
  if (key === 'chas') {
    if (row.chas == null || !Number.isFinite(row.chas)) return null
    return { mean: row.chas, min: row.chas, max: row.chas, sceneDate: row.imageDate ?? zonal.sceneDate ?? null }
  }
  const band = zonal[key as 'ndvi' | 'ndmi' | 'ndwi' | 'evi']
  if (!band || typeof band.mean !== 'number') return null
  return {
    mean: band.mean,
    min: band.min,
    max: band.max,
    sceneDate: zonal.sceneDate ?? row.imageDate,
  }
}

export function aggregateLayerLiveIndexStats(
  rows: AcpFieldTableRow[],
  wmsLayer: string,
): AcpLayerLiveIndexStats | null {
  const vals: AcpLayerLiveIndexStats[] = []
  for (const row of rows) {
    const hit = resolveLayerLiveIndexStats(row, wmsLayer)
    if (hit) vals.push(hit)
  }
  if (!vals.length) return null
  const means = vals.map(v => v.mean)
  const mins = vals.map(v => v.min)
  const maxs = vals.map(v => v.max)
  return {
    mean: means.reduce((a, b) => a + b, 0) / means.length,
    min: Math.min(...mins),
    max: Math.max(...maxs),
    sceneDate: vals.find(v => v.sceneDate)?.sceneDate ?? null,
  }
}

/** Continental default — Red Sea / Africa–Europe framing (matches Global home view). */
export const ACP_DEFAULT_MAP_CENTER: [number, number] = [28, 22]
export const ACP_DEFAULT_MAP_ZOOM = 2.5
export const ACP_INITIAL_MAP_ZOOM = 2.5
/** Regional field zoom when a single country / small AOI is selected. */
export const ACP_FITBOUNDS_MAX_ZOOM = 13
export const ACP_FITBOUNDS_MIN_ZOOM = 9
/** Global portfolio view — show all continents without zooming into one country. */
export const ACP_GLOBAL_FITBOUNDS_MAX_ZOOM = 4
/** When AOI span exceeds this (degrees), use global fit caps (no min-zoom). */
export const ACP_GLOBAL_EXTENT_MAX_DEG = 8

export type AcpMapFocusTarget =
  | {
      mode: 'bounds'
      bounds: [[number, number], [number, number]]
      maxZoom?: number
      minZoom?: number | null
    }
  | { mode: 'center'; center: [number, number]; zoom: number }

export function featureCollectionLngLatBounds(
  fc: GeoJSON.FeatureCollection,
): [[number, number], [number, number]] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const f of fc.features) {
    const bb = geometryBBox(f.geometry as { type?: string; coordinates?: unknown })
    if (!bb) continue
    west = Math.min(west, bb[0])
    south = Math.min(south, bb[1])
    east = Math.max(east, bb[2])
    north = Math.max(north, bb[3])
  }
  if (!Number.isFinite(west)) return null
  return [
    [west, south],
    [east, north],
  ]
}

function boundsSpanDegrees(bounds: [[number, number], [number, number]]): number {
  const [[west, south], [east, north]] = bounds
  return Math.max(east - west, north - south)
}

export function resolveAcpMapFocusTargetFromGeoJson(
  fc: GeoJSON.FeatureCollection,
): AcpMapFocusTarget | null {
  const bounds = featureCollectionLngLatBounds(fc)
  if (!bounds) return null
  const isGlobalPortfolio = boundsSpanDegrees(bounds) > ACP_GLOBAL_EXTENT_MAX_DEG
  return {
    mode: 'bounds',
    bounds,
    maxZoom: isGlobalPortfolio ? ACP_GLOBAL_FITBOUNDS_MAX_ZOOM : ACP_FITBOUNDS_MAX_ZOOM,
    minZoom: isGlobalPortfolio ? null : ACP_FITBOUNDS_MIN_ZOOM,
  }
}

/** Resolve map home / initial fit — global portfolio shows all fields; country filter zooms regionally. */
export function resolveAcpMapHomeTarget(
  fc: GeoJSON.FeatureCollection,
  countryFilter = 'all',
): AcpMapFocusTarget {
  let features = fc.features
  if (countryFilter && countryFilter !== 'all') {
    features = features.filter(f => {
      const props = (f as GeoJSON.Feature).properties as Record<string, unknown> | undefined
      return resolveAgroStructuresCountry(props ?? {}) === countryFilter
    })
  }
  if (!features.length) {
    return { mode: 'center', center: ACP_DEFAULT_MAP_CENTER, zoom: ACP_DEFAULT_MAP_ZOOM }
  }

  const scoped: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  const bounds = featureCollectionLngLatBounds(scoped)
  if (!bounds) {
    return { mode: 'center', center: ACP_DEFAULT_MAP_CENTER, zoom: ACP_DEFAULT_MAP_ZOOM }
  }

  const isGlobalPortfolio =
    countryFilter === 'all' && boundsSpanDegrees(bounds) > ACP_GLOBAL_EXTENT_MAX_DEG

  return {
    mode: 'bounds',
    bounds,
    maxZoom: isGlobalPortfolio ? ACP_GLOBAL_FITBOUNDS_MAX_ZOOM : ACP_FITBOUNDS_MAX_ZOOM,
    minZoom: isGlobalPortfolio ? null : ACP_FITBOUNDS_MIN_ZOOM,
  }
}

export function applyAcpMapFocusTarget(
  map: {
    fitBounds: (
      b: [[number, number], [number, number]],
      o?: { padding?: number; maxZoom?: number; duration?: number },
    ) => void
    flyTo: (o: { center: [number, number]; zoom: number; duration?: number }) => void
    getZoom: () => number
    getCenter: () => { lng: number; lat: number }
    easeTo: (o: { center: [number, number]; zoom: number; duration?: number }) => void
    once: (event: string, listener: () => void) => void
  },
  target: AcpMapFocusTarget,
  options?: { animate?: boolean; onSettled?: () => void },
): void {
  const animate = options?.animate !== false
  const duration = animate ? 900 : 0
  const settled = options?.onSettled

  let settledCalled = false
  const notifySettled = () => {
    if (settledCalled) return
    settledCalled = true
    settled?.()
  }

  const armSettledFallback = () => {
    if (!settled) return
    map.once('moveend', notifySettled)
    map.once('idle', notifySettled)
    window.setTimeout(notifySettled, Math.max(400, duration + 600))
  }

  if (target.mode === 'center') {
    map.flyTo({ center: target.center, zoom: target.zoom, duration })
    armSettledFallback()
    return
  }

  map.fitBounds(target.bounds, {
    padding: 48,
    maxZoom: target.maxZoom ?? ACP_FITBOUNDS_MAX_ZOOM,
    duration,
  })
  const minZoom = target.minZoom
  if (minZoom == null || !Number.isFinite(minZoom)) {
    armSettledFallback()
    return
  }

  map.once('moveend', () => {
    if (map.getZoom() < minZoom) {
      const c = map.getCenter()
      map.easeTo({
        center: [c.lng, c.lat],
        zoom: minZoom,
        duration: animate ? 400 : 0,
      })
      armSettledFallback()
      return
    }
    notifySettled()
  })
  armSettledFallback()
}
