import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getArcgisPortalToken } from '../../../lib/arcgisPortalToken'
import {
  buildAgroStructuresLayerAoiMask,
  buildAgroStructuresMapOutlineGeoJson,
  buildAgroStructuresLayerKpiTotals,
  buildAgroStructuresCountryDescriptionMapFromFeatures,
  fetchAgroStructuresCountryDescriptionMap,
  fetchAgroStructuresGeoJson,
  fetchAgroStructuresGeoJsonInBbox,
  resolveAgroStructuresCountry,
  resolveAgroStructuresCountryLabel,
} from '../../../lib/agroStructuresPrimaryAoi'
import {
  extractCropAlertFieldsFromMask,
  runCropAlertEngine,
  type CropAlertEngineSettings,
  type CropAlertFieldResult,
} from '../../../lib/siCropAlertEngine'
import {
  buildSnapshotsFromSentinelSeries,
  fetchCropAlertSentinelLiveBatch,
} from '../../../lib/siCropAlertSentinelLive'
import { buildCropAlertImageryContext } from '../../../lib/siCropAlertImageryValidation'
import { localIsoDate } from '../../../lib/siSentinelImageryDate'
import { expandLngLatBBox, type LngLatBBox } from '../../../lib/siMapViewport'
import {
  getGisContentItemDetails,
  getGisContentMapRegistry,
  getGisContentRowById,
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '../../../lib/gisContentPortalStore'
import {
  hostedFeatureLayerGeoJsonForRow,
  isAgroStructuresPortalRow,
  readGisHostedFeatureLayerSnapshot,
} from '../../../lib/gisHostedFeatureLayerPortal'
import { computeStableGisFeatureKey } from '../../../lib/gisFeatureStableKey'
import {
  hydrateAcpCropAlertResultsRef,
  isAcpCropAlertResultsValidForReferenceDate,
  loadAcpCropAlertResultsCache,
  persistAcpCropAlertResultsCache,
} from './acpCropAlertCache'
import { useAcpPlatform } from './acpPlatformContext'
import type { AcpPlatformConfig } from './acpPlatformConfig'
import { isAcpExcludedPortalMapRow } from './map/acpPortalMapLayers'
import {
  buildAcpPortfolioCountryOptions,
  buildFieldTableRows,
  filterGeoJsonFeaturesInBBox,
  vegetationDonutFromRows,
  type AcpCountryOption,
  type AcpFieldTableRow,
} from './acpMapSpatial'
import {
  geojsonCollectionSignature,
  quantizeViewportBboxSignature,
  resolveAgroStructuresPortalSignature,
  type AcpStructuresLoadRequest,
} from './acpStructuresLoadPolicy'
import { emitAcpAoiSync, installAcpGisRepositoryAoiListener } from './acpAoiSyncBus'
import {
  maskHasUncachedAlertFields,
  pruneCropAlertResultsToMask,
} from './acpStructuresAlertSync'
import {
  buildAcpScopeKpiTotals,
  isAcpDistributionMapLinked,
  isAcpViewportScopeActive,
  resolveAcpDistributionGeoFeatures,
  resolveAcpScopeGeoFeatures,
} from './acpViewportScope'
import { purgeAcpWmsCachesForReferenceDate } from './acpWmsSpecCache'

const ACP_VIEWPORT_STRUCTURES_DEBOUNCE_MS = 1200

function applyDecisionFilter(
  rows: AcpFieldTableRow[],
  decisionFilter: string,
): AcpFieldTableRow[] {
  if (decisionFilter === 'critical') {
    return rows.filter(r => r.severity === 'critical' || r.alertTier === 'critical')
  }
  if (decisionFilter === 'warning') {
    return rows.filter(r => r.alertTier === 'stress' || r.alertTier === 'watch' || r.severity === 'warning')
  }
  if (decisionFilter === 'stable') {
    return rows.filter(r => r.alertTier === 'stable')
  }
  if (decisionFilter === 'healthy') {
    return rows.filter(r => r.severity === 'normal' && r.alertTier === 'stable')
  }
  return rows
}

function computeFieldKey(f: { properties?: Record<string, unknown>; geometry?: GeoJSON.Geometry }, i: number) {
  return computeStableGisFeatureKey(f, i)
}

function resolveScopedFeatures(
  mask: { features?: unknown[] } | GeoJSON.FeatureCollection | null,
  scopeMode: 'viewport' | 'selection' | 'global',
  bbox: LngLatBBox | null,
  selectedFieldKey: string | null,
  countryFilter: string,
) {
  if (!mask?.features?.length) return []
  let features = filterGeoJsonFeaturesInBBox(mask, scopeMode === 'viewport' ? bbox : null)
  if (scopeMode === 'selection' && selectedFieldKey) {
    features = features.filter((f, i) => computeFieldKey(f, i) === selectedFieldKey)
  }
  if (countryFilter && countryFilter !== 'all') {
    features = features.filter(f => resolveAgroStructuresCountry(f.properties ?? {}) === countryFilter)
  }
  return features
}

async function resolveAgroStructuresLayerGeojson(
  token: string | undefined,
  signal: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const registry = getGisContentMapRegistry()
  for (const id of registry.activeItemIds) {
    const row = getGisContentRowById(id)
    if (!row || !isAgroStructuresPortalRow(row)) continue
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    if (snap?.externalServiceUrl?.trim()) break
    if (snap?.geojson?.features?.length) {
      return snap.geojson as GeoJSON.FeatureCollection
    }
  }
  const geojson = await fetchAgroStructuresGeoJson(token || undefined)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return geojson as GeoJSON.FeatureCollection
}

function readPortalAgroStructuresGeojson(): GeoJSON.FeatureCollection | null {
  const registry = getGisContentMapRegistry()
  for (const id of registry.activeItemIds) {
    const row = getGisContentRowById(id)
    if (!row || !isAgroStructuresPortalRow(row)) continue
    const geojson = hostedFeatureLayerGeoJsonForRow(row)
    if (geojson.features?.length) return geojson as GeoJSON.FeatureCollection
  }
  return null
}

type EngineStateRef = {
  mapView: { bbox: LngLatBBox | null }
  scopeMode: 'viewport' | 'selection' | 'global'
  selectedFieldKey: string | null
  countryFilter: string
  config: AcpPlatformConfig
  alertSettings: CropAlertEngineSettings
  analysisDate: string
  autoFollowDate: boolean
}

export function useAcpDashboardEngine() {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const { registerEngineSnapshot, refreshEngineRef } = acp

  const resultsRef = useRef<Map<string, CropAlertFieldResult> | null>(null)
  const countryDescriptionMapRef = useRef<Map<string, string>>(new Map())
  const [countryDescriptionMap, setCountryDescriptionMap] = useState<Map<string, string>>(
    () => new Map(),
  )
  if (resultsRef.current === null) {
    const referenceDate = acp.autoFollowDate ? localIsoDate() : acp.analysisDate
    resultsRef.current = hydrateAcpCropAlertResultsRef(referenceDate, referenceDate)
  }
  const maskRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const fullLayerRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const structuresAbortRef = useRef<AbortController | null>(null)
  const sentinelAbortRef = useRef<AbortController | null>(null)
  const structuresLoadedRef = useRef(false)
  const lastFullGeojsonSigRef = useRef<string | null>(null)
  const lastMaskSigRef = useRef<string | null>(null)
  const lastViewportBboxSigRef = useRef<string | null>(null)
  const lastPortalAgroSigRef = useRef<string | null>(null)
  const lastWmsDateRef = useRef<string | null>(null)
  const lastReferenceDateRef = useRef<string | null>(null)
  const lastClipModeRef = useRef<AcpPlatformConfig['clipMode'] | null>(null)
  const loadInFlightRef = useRef<Promise<void> | null>(null)

  const stateRef = useRef<EngineStateRef>({
    mapView: acp.mapView,
    scopeMode: acp.scopeMode,
    selectedFieldKey: acp.selectedFieldKey,
    countryFilter: acp.countryFilter,
    config: acp.config,
    alertSettings: acp.alertSettings,
    analysisDate: acp.analysisDate,
    autoFollowDate: acp.autoFollowDate,
  })

  useEffect(() => {
    stateRef.current = {
      mapView: acp.mapView,
      scopeMode: acp.scopeMode,
      selectedFieldKey: acp.selectedFieldKey,
      countryFilter: acp.countryFilter,
      config: acp.config,
      alertSettings: acp.alertSettings,
      analysisDate: acp.analysisDate,
      autoFollowDate: acp.autoFollowDate,
    }
  }, [
    acp.mapView,
    acp.scopeMode,
    acp.selectedFieldKey,
    acp.countryFilter,
    acp.config,
    acp.alertSettings,
    acp.analysisDate,
    acp.autoFollowDate,
  ])

  const publishKpiFromFullLayer = useCallback(
    (fullLayer: GeoJSON.FeatureCollection) => {
      const s = stateRef.current
      registerEngineSnapshot({
        kpiTotals: buildAgroStructuresLayerKpiTotals(fullLayer, { countryFilter: s.countryFilter }),
      })
    },
    [registerEngineSnapshot],
  )

  const publishScopeFromMask = useCallback(
    (mask: GeoJSON.FeatureCollection) => {
      const s = stateRef.current
      const scopedFeats = resolveScopedFeatures(
        mask,
        s.scopeMode,
        s.mapView.bbox,
        s.selectedFieldKey,
        s.countryFilter,
      )
      registerEngineSnapshot({
        scopedFieldRows: buildFieldTableRows(
          scopedFeats,
          resultsRef.current!,
          countryDescriptionMapRef.current,
          { analysisDate: s.analysisDate },
        ),
      })
    },
    [registerEngineSnapshot],
  )

  const sentinelSkipInitialEffectRef = useRef(false)

  const runSentinelPipeline = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    const mask = maskRef.current
    if (!mask?.features?.length) return

    const s = stateRef.current
    const referenceDate = s.autoFollowDate ? localIsoDate() : s.analysisDate
    const previousResults = Array.from(resultsRef.current!.values())
    const forceRefresh = opts?.forceRefresh === true
    const hasNewFields = maskHasUncachedAlertFields(mask, resultsRef.current!)

    const cached = loadAcpCropAlertResultsCache(referenceDate, referenceDate)
    if (
      !forceRefresh &&
      !hasNewFields &&
      isAcpCropAlertResultsValidForReferenceDate(cached, referenceDate)
    ) {
      if (cached!.results.length) {
        resultsRef.current = new Map(cached!.results.map(r => [r.fieldKey, r]))
        publishScopeFromMask(mask)
        registerEngineSnapshot({
          sentinelLoading: false,
          engineError: null,
          allResults: cached!.results,
          lastEngineRunAt: cached!.lastRunAt,
        })
      }
      return
    }

    sentinelAbortRef.current?.abort()
    const ac = new AbortController()
    sentinelAbortRef.current = ac
    registerEngineSnapshot({
      sentinelLoading: true,
      engineError: null,
      ...(previousResults.length > 0 ? { allResults: previousResults } : {}),
    })

    try {
      const fields = extractCropAlertFieldsFromMask(mask as { features?: unknown[] })
      const scopedFeats = resolveScopedFeatures(
        mask,
        s.scopeMode,
        s.mapView.bbox,
        s.selectedFieldKey,
        s.countryFilter,
      )
      let fetchScopeFeats = scopedFeats
      if (s.config.clipMode === 'viewport' && s.mapView.bbox && s.scopeMode !== 'viewport') {
        fetchScopeFeats = filterGeoJsonFeaturesInBBox(mask, s.mapView.bbox)
        if (s.countryFilter && s.countryFilter !== 'all') {
          fetchScopeFeats = fetchScopeFeats.filter(
            f => resolveAgroStructuresCountry(f.properties ?? {}) === s.countryFilter,
          )
        }
      }
      const visibleFields = extractCropAlertFieldsFromMask({ features: fetchScopeFeats } as {
        features?: unknown[]
      })
      const fetchFields =
        visibleFields.length > 0
          ? visibleFields
          : s.config.clipMode === 'viewport' && s.mapView.bbox
            ? extractCropAlertFieldsFromMask({
                features: filterGeoJsonFeaturesInBBox(mask, s.mapView.bbox),
              } as { features?: unknown[] })
            : fields.slice(0, 50)

      const imageryCtx = buildCropAlertImageryContext({
        userRequestedDate: referenceDate,
        fetchDate: referenceDate,
        latestSceneIso: null,
        autoFollowImagery: s.autoFollowDate,
      })

      const seriesMap = s.alertSettings.enabled
        ? await fetchCropAlertSentinelLiveBatch(fetchFields, referenceDate, {
            concurrency: 8,
            signal: ac.signal,
            cacheScope: 'standalone',
          })
        : new Map()

      if (ac.signal.aborted) return

      const liveSnapshots = new Map<
        string,
        {
          current: import('../../../lib/siCropAlertEngine').CropAlertIndexSnapshot
          previous7: import('../../../lib/siCropAlertEngine').CropAlertIndexSnapshot
          previous30: import('../../../lib/siCropAlertEngine').CropAlertIndexSnapshot
          seasonalPeakNdvi: number
          imagery?: import('../../../lib/siCropAlertImageryValidation').CropAlertFieldImageryMeta
          ndviSeries?: import('../../../lib/siCropAlertNdviTimeSeries').NdviSceneSeriesAnalysis | null
          trend?: import('../../../lib/siCropAlertEngine').CropAlertTrend
        }
      >()
      for (const field of fields) {
        const series = seriesMap.get(field.fieldKey)
        if (!series) continue
        const snaps = buildSnapshotsFromSentinelSeries(field, referenceDate, series, imageryCtx, {
          preferLatestAvailable: s.autoFollowDate,
        })
        liveSnapshots.set(field.fieldKey, {
          current: snaps.current,
          previous7: snaps.previous7,
          previous30: snaps.previous30,
          seasonalPeakNdvi: snaps.seasonalPeakNdvi,
          imagery: snaps.imagery,
          ndviSeries: snaps.ndviSeries,
          trend: snaps.trend,
        })
      }

      const results = s.alertSettings.enabled
        ? runCropAlertEngine(fields, referenceDate, s.alertSettings, liveSnapshots)
        : []
      const resolvedResults = results.length > 0 ? results : previousResults
      resultsRef.current = new Map(resolvedResults.map(r => [r.fieldKey, r]))

      if (results.length > 0) {
        persistAcpCropAlertResultsCache({
          referenceDate,
          userRequestedDate: referenceDate,
          imageryContext: imageryCtx,
          results,
          lastRunAt: Date.now(),
          liveFieldCount: liveSnapshots.size,
        })
      }

      publishScopeFromMask(mask)

      registerEngineSnapshot({
        sentinelLoading: false,
        engineError: null,
        allResults: resolvedResults,
        lastEngineRunAt: Date.now(),
      })
    } catch (err) {
      if (ac.signal.aborted) return
      registerEngineSnapshot({
        sentinelLoading: false,
        engineError: err instanceof Error ? err.message : 'Sentinel pipeline failed',
        allResults: previousResults.length > 0 ? previousResults : undefined,
        lastEngineRunAt: Date.now(),
      })
    }
  }, [registerEngineSnapshot, publishScopeFromMask])

  const loadStructures = useCallback(async (opts?: AcpStructuresLoadRequest) => {
    const force = opts?.force ?? false
    const reason = opts?.reason ?? 'initial'
    const showLoadingBanner = opts?.showLoadingBanner ?? !structuresLoadedRef.current

    const s = stateRef.current
    const portalSig = resolveAgroStructuresPortalSignature()
    const viewportBboxSig =
      s.config.clipMode === 'viewport' && s.mapView.bbox
        ? quantizeViewportBboxSignature(s.mapView.bbox)
        : null
    const clipModeChanged = lastClipModeRef.current != null && lastClipModeRef.current !== s.config.clipMode

    const viewportOnly =
      structuresLoadedRef.current &&
      !force &&
      reason === 'viewport' &&
      s.config.clipMode === 'viewport' &&
      Boolean(viewportBboxSig) &&
      viewportBboxSig !== lastViewportBboxSigRef.current

    if (!force && structuresLoadedRef.current && !clipModeChanged) {
      const portalSame = portalSig === lastPortalAgroSigRef.current
      if (portalSame) {
        if (s.config.clipMode === 'viewport') {
          if (!viewportOnly) return
        } else if (portalSame && lastFullGeojsonSigRef.current && lastMaskSigRef.current) {
          return
        }
      }
    }

    if (loadInFlightRef.current) return loadInFlightRef.current

    const runLoad = async () => {
      structuresAbortRef.current?.abort()
      const ac = new AbortController()
      structuresAbortRef.current = ac

      if (showLoadingBanner && !structuresLoadedRef.current) {
        registerEngineSnapshot({ engineLoading: true, engineError: null })
      }

      try {
        const token = getArcgisPortalToken()
        let fullGeojson = fullLayerRef.current
        const prevFullSig = lastFullGeojsonSigRef.current
        const prevMaskSig = lastMaskSigRef.current

        if (!viewportOnly) {
          fullGeojson = await resolveAgroStructuresLayerGeojson(token || undefined, ac.signal)
          if (ac.signal.aborted) return

          fullLayerRef.current = fullGeojson
          lastFullGeojsonSigRef.current = geojsonCollectionSignature(fullGeojson)
          publishKpiFromFullLayer(fullGeojson)
        } else if (!fullGeojson) {
          return
        }

        let maskSource: GeoJSON.FeatureCollection = fullGeojson!
        if (s.config.clipMode === 'viewport' && s.mapView.bbox) {
          maskSource = (await fetchAgroStructuresGeoJsonInBbox(
            expandLngLatBBox(s.mapView.bbox, 0.15),
            token || undefined,
            ac.signal,
          )) as GeoJSON.FeatureCollection
        }

        if (ac.signal.aborted) return

        const mask = buildAgroStructuresLayerAoiMask(maskSource)
        const outlineSource: GeoJSON.FeatureCollection =
          s.config.clipMode === 'viewport' && s.mapView.bbox
            ? {
                type: 'FeatureCollection',
                features: filterGeoJsonFeaturesInBBox(
                  fullGeojson!,
                  expandLngLatBBox(s.mapView.bbox, 0.15),
                ),
              }
            : (fullGeojson! as GeoJSON.FeatureCollection)
        const mapOutline = buildAgroStructuresMapOutlineGeoJson(
          outlineSource,
        ) as GeoJSON.FeatureCollection | null
        const maskSig = geojsonCollectionSignature(mask as GeoJSON.FeatureCollection | null)
        const newFullSig = geojsonCollectionSignature(fullGeojson!)
        const fullLayerChanged = !viewportOnly && newFullSig !== prevFullSig
        const structuresChanged =
          force ||
          reason === 'portal' ||
          reason === 'manual' ||
          fullLayerChanged ||
          (maskSig !== prevMaskSig && reason !== 'viewport')
        const maskUnchanged = maskSig === prevMaskSig && structuresLoadedRef.current

        lastPortalAgroSigRef.current = portalSig
        lastClipModeRef.current = s.config.clipMode
        if (viewportBboxSig) lastViewportBboxSigRef.current = viewportBboxSig
        else if (s.config.clipMode !== 'viewport') lastViewportBboxSigRef.current = null

        if (!mask?.features?.length) {
          maskRef.current = null
          structuresLoadedRef.current = false
          lastMaskSigRef.current = null
          registerEngineSnapshot({
            engineLoading: false,
            structuresHydrated: false,
            sentinelLoading: false,
            engineError: 'No Farm Plots or PIVOT features found in Agro_Structures.',
            aoiMask: null,
            structureMapOutline: null,
            scopedFieldRows: [],
            allResults: [],
            kpiTotals: { totalCount: 0, totalAreaHa: 0, countryCount: 0, byType: [] },
            chartLabels: [],
            chartNdvi: [],
            chartChas: [],
            chartNdmi: [],
            lastEngineRunAt: Date.now(),
          })
          return
        }

        maskRef.current = mask as GeoJSON.FeatureCollection
        structuresLoadedRef.current = true
        lastMaskSigRef.current = maskSig
        if (structuresChanged) {
          pruneCropAlertResultsToMask(mask as GeoJSON.FeatureCollection, resultsRef.current!)
        }
        publishScopeFromMask(mask as GeoJSON.FeatureCollection)

        const referenceDate = s.autoFollowDate ? localIsoDate() : s.analysisDate
        if (!structuresChanged) {
          const cached = loadAcpCropAlertResultsCache(referenceDate, referenceDate)
          if (cached?.results.length) {
            resultsRef.current = new Map(cached.results.map(r => [r.fieldKey, r]))
            registerEngineSnapshot({
              allResults: cached.results,
              lastEngineRunAt: cached.lastRunAt || null,
            })
            publishScopeFromMask(mask as GeoJSON.FeatureCollection)
          }
        } else if (resultsRef.current!.size > 0) {
          registerEngineSnapshot({
            allResults: Array.from(resultsRef.current!.values()),
          })
        }

        registerEngineSnapshot({
          engineLoading: false,
          structuresHydrated: true,
          engineError: null,
          ...(maskUnchanged && !structuresChanged && mapOutline
            ? { structureMapOutline: mapOutline }
            : {
                aoiMask: mask as GeoJSON.FeatureCollection,
                structureMapOutline: mapOutline,
              }),
        })

        if (referenceDate !== lastWmsDateRef.current) {
          lastWmsDateRef.current = referenceDate
          acp.commitWmsLayer({ startDate: referenceDate, endDate: referenceDate })
        }

        const needsAlertRefresh =
          reason === 'manual' ||
          structuresChanged ||
          maskHasUncachedAlertFields(mask as GeoJSON.FeatureCollection, resultsRef.current!)
        void runSentinelPipeline({ forceRefresh: needsAlertRefresh })
        sentinelSkipInitialEffectRef.current = true
      } catch (err) {
        if (ac.signal.aborted) return
        registerEngineSnapshot({
          engineLoading: false,
          engineError: err instanceof Error ? err.message : 'Agro_Structures load failed',
          lastEngineRunAt: Date.now(),
        })
      }
    }

    const promise = runLoad()
    loadInFlightRef.current = promise
    try {
      await promise
    } finally {
      if (loadInFlightRef.current === promise) loadInFlightRef.current = null
    }
  }, [acp.commitWmsLayer, registerEngineSnapshot, publishKpiFromFullLayer, publishScopeFromMask, runSentinelPipeline])

  const loadStructuresRef = useRef(loadStructures)
  loadStructuresRef.current = loadStructures

  useEffect(() => {
    refreshEngineRef.current = () => {
      void loadStructuresRef.current({ force: true, reason: 'manual', showLoadingBanner: false })
    }
  }, [refreshEngineRef])

  useEffect(() => {
    const portalGeojson = readPortalAgroStructuresGeojson()
    if (portalGeojson) {
      fullLayerRef.current = portalGeojson
      lastFullGeojsonSigRef.current = geojsonCollectionSignature(portalGeojson)
      publishKpiFromFullLayer(portalGeojson)
    }
    void loadStructuresRef.current({ reason: 'initial' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial hydrate
  }, [])

  const portalAgroSig = useMemo(
    () => resolveAgroStructuresPortalSignature(),
    [portal.version],
  )
  const observedPortalAgroSigRef = useRef<string | null>(null)

  useEffect(() => {
    if (observedPortalAgroSigRef.current === portalAgroSig) return
    const isFirstObservation = observedPortalAgroSigRef.current === null
    observedPortalAgroSigRef.current = portalAgroSig
    if (isFirstObservation) return
    emitAcpAoiSync({ reason: 'portal', signature: portalAgroSig, force: true })
    void loadStructuresRef.current({ reason: 'portal', showLoadingBanner: false, force: true })
  }, [portalAgroSig])

  useEffect(() => {
    return installAcpGisRepositoryAoiListener(() => {
      emitAcpAoiSync({ reason: 'gis-repository', signature: resolveAgroStructuresPortalSignature(), force: true })
      void loadStructuresRef.current({ reason: 'portal', showLoadingBanner: false, force: true })
    })
  }, [])

  useEffect(() => {
    const fullLayer = fullLayerRef.current
    if (!fullLayer) return
    publishKpiFromFullLayer(fullLayer)
  }, [acp.countryFilter, publishKpiFromFullLayer])

  const viewportBboxSig = useMemo(() => {
    if (acp.config.clipMode !== 'viewport' || !acp.mapView.bbox) return null
    return quantizeViewportBboxSignature(acp.mapView.bbox)
  }, [acp.config.clipMode, acp.mapView.bbox])

  useEffect(() => {
    if (acp.config.clipMode !== 'viewport' || !viewportBboxSig) return
    if (viewportBboxSig === lastViewportBboxSigRef.current) return
    const t = window.setTimeout(() => {
      if (viewportBboxSig === lastViewportBboxSigRef.current) return
      void loadStructuresRef.current({ reason: 'viewport', showLoadingBanner: false })
    }, ACP_VIEWPORT_STRUCTURES_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [acp.config.clipMode, viewportBboxSig])

  useEffect(() => {
    if (lastClipModeRef.current == null || lastClipModeRef.current === acp.config.clipMode) return
    if (!structuresLoadedRef.current) return
    void loadStructuresRef.current({ reason: 'viewport', showLoadingBanner: false, force: true })
  }, [acp.config.clipMode])

  useEffect(() => {
    const mask = maskRef.current
    if (!mask) return
    if (stateRef.current.scopeMode === 'viewport') {
      publishScopeFromMask(mask)
    }
  }, [acp.scopeMode, acp.mapView.bbox, publishScopeFromMask])

  useEffect(() => {
    const mask = maskRef.current
    if (!mask) return
    publishScopeFromMask(mask)
  }, [
    acp.scopeMode,
    acp.selectedFieldKey,
    acp.countryFilter,
    acp.config.clipMode,
    publishScopeFromMask,
  ])

  useEffect(() => {
    const referenceDate = acp.autoFollowDate ? localIsoDate() : acp.analysisDate
    const prev = lastReferenceDateRef.current
    if (prev != null && prev !== referenceDate) {
      purgeAcpWmsCachesForReferenceDate(referenceDate)
      const cached = loadAcpCropAlertResultsCache(referenceDate, referenceDate)
      if (cached?.results.length) {
        resultsRef.current = new Map(cached.results.map(r => [r.fieldKey, r]))
        registerEngineSnapshot({
          allResults: cached.results,
          lastEngineRunAt: cached.lastRunAt || null,
        })
        const mask = maskRef.current
        if (mask) publishScopeFromMask(mask)
      }
    }
    lastReferenceDateRef.current = referenceDate
  }, [
    acp.analysisDate,
    acp.autoFollowDate,
    publishScopeFromMask,
    registerEngineSnapshot,
  ])

  useEffect(() => {
    if (!structuresLoadedRef.current || !maskRef.current) return
    if (!sentinelSkipInitialEffectRef.current) return
    void runSentinelPipeline()
  }, [acp.analysisDate, acp.autoFollowDate, runSentinelPipeline])

  useEffect(() => {
    if (!acp.alertSettings.enabled || !structuresLoadedRef.current) return
    if (acp.config.autoRefreshMinutes <= 0) return
    const ms = Math.max(1, acp.config.autoRefreshMinutes) * 60_000
    const id = window.setInterval(() => void runSentinelPipeline(), ms)
    return () => window.clearInterval(id)
  }, [acp.alertSettings.enabled, acp.config.autoRefreshMinutes, runSentinelPipeline])

  const viewportScopeActive = useMemo(
    () => isAcpViewportScopeActive(acp.mapView, acp.scopeMode),
    [acp.mapView.bbox, acp.mapView.zoom, acp.scopeMode],
  )

  const scopeFeatures = useMemo(
    () => resolveAcpScopeGeoFeatures(acp.aoiMask, acp.mapView, acp.scopeMode, acp.countryFilter),
    [acp.aoiMask, acp.countryFilter, acp.mapView, acp.scopeMode],
  )

  const scopeFieldRows = useMemo(() => {
    if (!scopeFeatures.length) return acp.scopedFieldRows
    const resultsMap = new Map(acp.allResults.map(r => [r.fieldKey, r]))
    return buildFieldTableRows(scopeFeatures, resultsMap, countryDescriptionMap, {
      analysisDate: acp.analysisDate,
    })
  }, [acp.allResults, acp.analysisDate, acp.scopedFieldRows, countryDescriptionMap, scopeFeatures])

  const filteredRows = useMemo(
    () => applyDecisionFilter(scopeFieldRows, acp.decisionFilter),
    [scopeFieldRows, acp.decisionFilter],
  )

  const liveAlertRows = filteredRows

  const displayKpiTotals = useMemo(
    () => {
      if (viewportScopeActive) {
        return buildAcpScopeKpiTotals(acp.aoiMask, acp.mapView, acp.scopeMode, acp.countryFilter)
      }
      if (acp.countryFilter && acp.countryFilter !== 'all' && acp.aoiMask?.features.length) {
        return buildAgroStructuresLayerKpiTotals(acp.aoiMask, { countryFilter: acp.countryFilter })
      }
      return acp.kpiTotals
    },
    [
      acp.aoiMask,
      acp.countryFilter,
      acp.kpiTotals,
      acp.mapView,
      acp.scopeMode,
      viewportScopeActive,
    ],
  )

  const distributionMapLinked = useMemo(
    () => isAcpDistributionMapLinked(acp.mapView),
    [acp.mapView.bbox],
  )

  const distributionFeatures = useMemo(
    () => resolveAcpDistributionGeoFeatures(acp.aoiMask, acp.mapView, acp.countryFilter),
    [acp.aoiMask, acp.countryFilter, acp.mapView],
  )

  const distributionRows = useMemo(() => {
    if (!distributionFeatures.length) return []
    const resultsMap = new Map(acp.allResults.map(r => [r.fieldKey, r]))
    return buildFieldTableRows(distributionFeatures, resultsMap, countryDescriptionMap, {
      analysisDate: acp.analysisDate,
    })
  }, [acp.allResults, acp.analysisDate, countryDescriptionMap, distributionFeatures])

  const distributionDonut = useMemo(
    () => vegetationDonutFromRows(distributionRows),
    [distributionRows],
  )

  const countries = useMemo(
    (): AcpCountryOption[] =>
      buildAcpPortfolioCountryOptions(acp.aoiMask, countryDescriptionMap),
    [acp.aoiMask, countryDescriptionMap],
  )

  useEffect(() => {
    const registry = getGisContentMapRegistry()
    const count = registry.activeItemIds.filter(id => {
      const row = getGisContentRowById(id)
      return row && !isGisContentRowInRecycle(row) && !isAcpExcludedPortalMapRow(row)
    }).length
    registerEngineSnapshot({ portalLayerCount: count })
  }, [portal.version, registerEngineSnapshot])

  useEffect(() => {
    let cancelled = false
    const maskFeatures = acp.aoiMask?.features ?? []
    void (async () => {
      const token = getArcgisPortalToken() || undefined
      const fromFeatures = buildAgroStructuresCountryDescriptionMapFromFeatures(maskFeatures)
      const fromSchema = await fetchAgroStructuresCountryDescriptionMap(token)
      if (cancelled) return
      const merged = new Map(fromSchema)
      for (const [code, label] of fromFeatures) merged.set(code, label)
      countryDescriptionMapRef.current = merged
      setCountryDescriptionMap(merged)
      registerEngineSnapshot({ countryDescriptionMap: merged })
      if (maskRef.current?.features?.length) publishScopeFromMask(maskRef.current)
    })()
    return () => {
      cancelled = true
    }
  }, [acp.aoiMask, portal.version, publishScopeFromMask, registerEngineSnapshot])

  return {
    filteredRows,
    liveAlertRows,
    displayKpiTotals,
    viewportScopeActive,
    distributionMapLinked,
    distributionDonut,
    distributionRows,
    countries,
    portalVersion: portal.version,
  }
}
