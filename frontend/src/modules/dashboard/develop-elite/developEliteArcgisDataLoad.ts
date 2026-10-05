import { getArcgisPortalToken } from '@/modules/gis/layers/arcgisPortalToken'
import { buildAgroStructuresCountryDescriptionMapFromFeatures } from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
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
import { normalizeDevelopEliteStructuresLayerUrl } from './developEliteDashboardConfig'
import { developElitePrimaryStructuresLayerUrl } from './developEliteArcgisFetch'
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

type InflightArcgisLoad = {
  promise: Promise<DevelopEliteArcgisDataSnapshot>
  partials: Set<DevelopEliteArcgisPartialHandler>
}

const inflightByKey = new Map<string, InflightArcgisLoad>()

function emitArcgisPartial(inflight: InflightArcgisLoad, patch: Partial<DevelopEliteArcgisDataSnapshot>) {
  for (const handler of inflight.partials) handler(patch)
}

export type DevelopEliteArcgisPartialHandler = (patch: Partial<DevelopEliteArcgisDataSnapshot>) => void

function countryLabelsFromFeatures(features: GeoJSON.Feature[]): Map<string, string> {
  return new Map(buildAgroStructuresCountryDescriptionMapFromFeatures(features))
}

async function fetchDevelopEliteArcgisSnapshot(
  config: DevelopEliteDashboardConfig,
  onPartial?: DevelopEliteArcgisPartialHandler,
): Promise<DevelopEliteArcgisDataSnapshot> {
  const token = getArcgisPortalToken() || undefined
  const structuresLayerUrl = normalizeDevelopEliteStructuresLayerUrl(config.structuresLayerUrl)
  const structuresDrawingUrl = developElitePrimaryStructuresLayerUrl(structuresLayerUrl)
  const zonesLayerUrl = config.zonesLayerUrl
  const emit = onPartial ?? (() => {})

  const geoPromise = fetchFeatureLayerGeoJson(structuresLayerUrl, token).then(geo => {
    emit({
      structures: geo,
      countryLabels: countryLabelsFromFeatures(geo.features ?? []),
    })
    return geo
  })

  const cropsPromise = fetchArcGisTableRows(config.cropsTableUrl, token).then(cropRows => {
    emit({ cropRows })
    return cropRows
  })

  const metaPromise = fetchCropsTableMeta(config.cropsTableUrl).then(cropMeta => {
    emit({ cropMeta })
    return cropMeta
  })

  const drawingPromise = fetchFeatureLayerDrawingInfo(structuresDrawingUrl, token).then(
    structuresDrawingInfo => {
      emit({ structuresDrawingInfo })
      return structuresDrawingInfo
    },
  )

  const zonesPromise = fetchArcgisFeatureLayerGeoJsonExact(zonesLayerUrl, token)
    .catch(() => ({ type: 'FeatureCollection' as const, features: [] }))
    .then(zonesGeo => {
      const zoneLayer = zonesGeo.features.length ? zonesGeo : null
      emit({ zoneLayerStructures: zoneLayer })
      return zonesGeo
    })

  const treesGeoPromise = fetchArcgisFeatureLayerGeoJsonExact(config.treesLayerUrl, token)
    .catch(() => ({ type: 'FeatureCollection' as const, features: [] }))
    .then(treesGeo => {
      emit({ treeFeatures: treesGeo.features ?? [] })
      return treesGeo
    })

  const treesStylePromise = fetchArcgisLayerDrawingInfoExact(config.treesLayerUrl, token).then(
    treesDrawingInfo => {
      emit({ treesDrawingInfo })
      return treesDrawingInfo
    },
  )

  const agriGeoPromise = fetchArcgisFeatureLayerGeoJsonExact(config.agriLocationLayerUrl, token)
    .catch(() => ({ type: 'FeatureCollection' as const, features: [] }))
    .then(agriGeo => {
      emit({ agriLocationFeatures: agriGeo.features ?? [] })
      return agriGeo
    })

  const agriStylePromise = fetchArcgisLayerDrawingInfoExact(config.agriLocationLayerUrl, token).then(
    agriLocationDrawingInfo => {
      emit({ agriLocationDrawingInfo })
      return agriLocationDrawingInfo
    },
  )

  const irrigationGeoPromise = fetchArcgisFeatureLayerGeoJsonExact(
    config.irrigationValvesLayerUrl,
    token,
  )
    .catch(() => ({ type: 'FeatureCollection' as const, features: [] }))
    .then(irrigationGeo => {
      emit({ irrigationValveFeatures: irrigationGeo.features ?? [] })
      return irrigationGeo
    })

  const irrigationStylePromise = fetchArcgisLayerDrawingInfoExact(
    config.irrigationValvesLayerUrl,
    token,
  ).then(irrigationValvesDrawingInfo => {
    emit({ irrigationValvesDrawingInfo })
    return irrigationValvesDrawingInfo
  })

  const irrigationMainPipeGeoPromise = fetchArcgisFeatureLayerGeoJsonExact(
    config.irrigationMainPipeLayerUrl,
    token,
  )
    .catch(() => ({ type: 'FeatureCollection' as const, features: [] }))
    .then(irrigationMainPipeGeo => {
      emit({ irrigationMainPipeFeatures: irrigationMainPipeGeo.features ?? [] })
      return irrigationMainPipeGeo
    })

  const irrigationMainPipeStylePromise = fetchArcgisLayerDrawingInfoExact(
    config.irrigationMainPipeLayerUrl,
    token,
  ).then(irrigationMainPipeDrawingInfo => {
    emit({ irrigationMainPipeDrawingInfo })
    return irrigationMainPipeDrawingInfo
  })

  const worldGeoPromise = (async () => {
    const load = () => fetchDevelopEliteWorldCountriesGeoJson(config.worldCountriesLayerUrl, token)
    let worldCountries: GeoJSON.FeatureCollection | null = null
    try {
      worldCountries = await load()
    } catch {
      worldCountries = null
    }
    if (!worldCountries?.features?.length) {
      try {
        worldCountries = await load()
      } catch {
        /* keep null */
      }
    }
    emit({ worldCountries })
    return worldCountries
  })()

  const worldDomainPromise = fetchWorldCountriesCountryDomain(config.worldCountriesLayerUrl, token).then(
    worldCountryDomain => {
      emit({ worldCountryDomain })
      return worldCountryDomain
    },
  )

  const worldDrawingPromise = fetchWorldCountriesDrawingInfo(config.worldCountriesLayerUrl, token)
    .catch(() => null)
    .then(worldCountriesDrawingInfo => {
      emit({ worldCountriesDrawingInfo })
      return worldCountriesDrawingInfo
    })

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
    irrigationGeo,
    irrigationStyle,
    irrigationMainPipeGeo,
    irrigationMainPipeStyle,
    worldGeo,
    worldDomain,
    worldDrawing,
  ] = await Promise.all([
    geoPromise,
    zonesPromise,
    cropsPromise,
    metaPromise,
    drawingPromise,
    treesGeoPromise,
    treesStylePromise,
    agriGeoPromise,
    agriStylePromise,
    irrigationGeoPromise,
    irrigationStylePromise,
    irrigationMainPipeGeoPromise,
    irrigationMainPipeStylePromise,
    worldGeoPromise,
    worldDomainPromise,
    worldDrawingPromise,
  ])

  const labels = await fetchStructuresCountryLabelMap(structuresLayerUrl, geo.features, token)
  emit({ countryLabels: labels })

  const zoneLayer = zonesGeo.features.length ? zonesGeo : null
  const treeFeats = treesGeo.features ?? []
  const agriFeats = agriGeo.features ?? []
  const irrigationFeats = irrigationGeo.features ?? []
  const irrigationMainPipeFeats = irrigationMainPipeGeo.features ?? []
  const fetchedAt = Date.now()

  const snapshot: DevelopEliteArcgisDataSnapshot = {
    structures: geo,
    zoneLayerStructures: zoneLayer,
    structuresDrawingInfo: drawingInfo,
    cropRows: crops,
    treeFeatures: treeFeats,
    treesDrawingInfo: treesStyle,
    agriLocationFeatures: agriFeats,
    agriLocationDrawingInfo: agriStyle,
    irrigationValveFeatures: irrigationFeats,
    irrigationValvesDrawingInfo: irrigationStyle,
    irrigationMainPipeFeatures: irrigationMainPipeFeats,
    irrigationMainPipeDrawingInfo: irrigationMainPipeStyle,
    cropMeta: meta,
    countryLabels: labels,
    worldCountries: worldGeo,
    worldCountryDomain: worldDomain,
    worldCountriesDrawingInfo: worldDrawing,
    fetchedAt,
  }

  emit(snapshot)
  return snapshot
}

/** Session cache + single in-flight request per layer URL set (survives unmount). */
export function ensureDevelopEliteArcgisSnapshot(
  config: DevelopEliteDashboardConfig,
  options: { force?: boolean; onPartial?: DevelopEliteArcgisPartialHandler } = {},
): Promise<DevelopEliteArcgisDataSnapshot> {
  const key = developEliteArcgisCacheKey(config)
  if (!options.force) {
    const cached = getDevelopEliteArcgisSessionCache(key)
    if (cached) return Promise.resolve(cached)
    const pending = inflightByKey.get(key)
    if (pending) {
      if (options.onPartial) pending.partials.add(options.onPartial)
      return pending.promise
    }
  } else {
    inflightByKey.delete(key)
  }

  const partials = new Set<DevelopEliteArcgisPartialHandler>()
  if (options.onPartial) partials.add(options.onPartial)

  const inflight: InflightArcgisLoad = {
    partials,
    promise: fetchDevelopEliteArcgisSnapshot(config, patch => emitArcgisPartial(inflight, patch))
      .then(snapshot => {
        setDevelopEliteArcgisSessionCache(key, snapshot)
        inflightByKey.delete(key)
        return snapshot
      })
      .catch(err => {
        inflightByKey.delete(key)
        throw err
      }),
  }

  inflightByKey.set(key, inflight)
  return inflight.promise
}
