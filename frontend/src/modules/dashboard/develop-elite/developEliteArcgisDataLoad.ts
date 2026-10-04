import { getArcgisPortalToken } from '@/modules/gis/layers/arcgisPortalToken'
import {
  fetchArcGisTableRows,
  fetchCropsTableMeta,
  fetchFeatureLayerDrawingInfo,
  fetchArcgisFeatureLayerGeoJsonExact,
  fetchArcgisLayerDrawingInfoExact,
  fetchFeatureLayerGeoJson,
  fetchStructuresCountryLabelMap,
} from './developEliteArcgisFetch'
import type { DevelopEliteDashboardConfig } from './developEliteDashboardConfig'
import {
  developEliteArcgisCacheKey,
  getDevelopEliteArcgisSessionCache,
  setDevelopEliteArcgisSessionCache,
  type DevelopEliteArcgisDataSnapshot,
} from './developEliteArcgisSessionCache'
import {
  fetchDevelopEliteWorldCountriesGeoJson,
  fetchWorldCountriesCountryDomain,
  fetchWorldCountriesDrawingInfo,
} from './developEliteWorldCountriesLoad'

const inflightByKey = new Map<string, Promise<DevelopEliteArcgisDataSnapshot>>()

async function fetchDevelopEliteArcgisSnapshot(
  config: DevelopEliteDashboardConfig,
): Promise<DevelopEliteArcgisDataSnapshot> {
  const token = getArcgisPortalToken() || undefined
  const zonesLayerUrl = config.zonesLayerUrl
  const [
    geo,
    zonesGeo,
    crops,
    meta,
    drawingInfo,
    treesGeo,
    treesStyle,
    agriGeo,
    agriStyle,
    worldGeo,
    worldDomain,
    worldDrawing,
  ] = await Promise.all([
    fetchFeatureLayerGeoJson(config.structuresLayerUrl, token),
    fetchArcgisFeatureLayerGeoJsonExact(zonesLayerUrl, token).catch(
      () => ({ type: 'FeatureCollection' as const, features: [] }),
    ),
    fetchArcGisTableRows(config.cropsTableUrl, token),
    fetchCropsTableMeta(config.cropsTableUrl),
    fetchFeatureLayerDrawingInfo(config.structuresLayerUrl, token),
    fetchArcgisFeatureLayerGeoJsonExact(config.treesLayerUrl, token).catch(
      () => ({ type: 'FeatureCollection' as const, features: [] }),
    ),
    fetchArcgisLayerDrawingInfoExact(config.treesLayerUrl, token),
    fetchArcgisFeatureLayerGeoJsonExact(config.agriLocationLayerUrl, token).catch(
      () => ({ type: 'FeatureCollection' as const, features: [] }),
    ),
    fetchArcgisLayerDrawingInfoExact(config.agriLocationLayerUrl, token),
    fetchDevelopEliteWorldCountriesGeoJson(config.worldCountriesLayerUrl, token).catch(() => null),
    fetchWorldCountriesCountryDomain(config.worldCountriesLayerUrl, token),
    fetchWorldCountriesDrawingInfo(config.worldCountriesLayerUrl, token).catch(() => null),
  ])

  const labels = await fetchStructuresCountryLabelMap(config.structuresLayerUrl, geo.features, token)
  const zoneLayer = zonesGeo.features.length ? zonesGeo : null
  const treeFeats = treesGeo.features ?? []
  const agriFeats = agriGeo.features ?? []
  const fetchedAt = Date.now()

  return {
    structures: geo,
    zoneLayerStructures: zoneLayer,
    structuresDrawingInfo: drawingInfo,
    cropRows: crops,
    treeFeatures: treeFeats,
    treesDrawingInfo: treesStyle,
    agriLocationFeatures: agriFeats,
    agriLocationDrawingInfo: agriStyle,
    cropMeta: meta,
    countryLabels: labels,
    worldCountries: worldGeo,
    worldCountryDomain: worldDomain,
    worldCountriesDrawingInfo: worldDrawing,
    fetchedAt,
  }
}

/** Session cache + single in-flight request per layer URL set (survives unmount). */
export function ensureDevelopEliteArcgisSnapshot(
  config: DevelopEliteDashboardConfig,
  options: { force?: boolean } = {},
): Promise<DevelopEliteArcgisDataSnapshot> {
  const key = developEliteArcgisCacheKey(config)
  if (!options.force) {
    const cached = getDevelopEliteArcgisSessionCache(key)
    if (cached) return Promise.resolve(cached)
    const pending = inflightByKey.get(key)
    if (pending) return pending
  } else {
    inflightByKey.delete(key)
  }

  const promise = fetchDevelopEliteArcgisSnapshot(config)
    .then(snapshot => {
      setDevelopEliteArcgisSessionCache(key, snapshot)
      inflightByKey.delete(key)
      return snapshot
    })
    .catch(err => {
      inflightByKey.delete(key)
      throw err
    })

  inflightByKey.set(key, promise)
  return promise
}
