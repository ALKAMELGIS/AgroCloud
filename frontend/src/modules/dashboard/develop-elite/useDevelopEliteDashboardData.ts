import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ArcGisTableRow, type DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import { ensureDevelopEliteArcgisSnapshot } from './developEliteArcgisDataLoad'
import {
  aggregateChartSlices,
  readArcGisField,
  resolveCodedFieldLabel,
  resolveCropLabel,
  resolveDevelopEliteFieldDomainLabels,
} from './developEliteChartAggregate'
import {
  type DevelopEliteDashboardConfig,
  type DevelopEliteMapDataLayerId,
  saveDevelopEliteDashboardConfig,
} from './developEliteDashboardConfig'
import {
  isDevelopEliteMapDataLayerVisible,
  normalizeDevelopEliteMapDataLayerOrder,
  normalizeDevelopEliteMapLayerOpacity,
  normalizeDevelopEliteMapLayerVisibility,
} from './developEliteMapDataLayers'
import {
  buildDevelopEliteStructureFieldKeyByFarmName,
  buildDevelopEliteStructureFieldKeyByJoinCode,
  findDevelopEliteStructureFieldKey,
  normalizeDevelopEliteFarmNameKey,
  normalizeDevelopEliteJoinKey,
} from './developEliteLayerJoin'
import { sortDevelopEliteListBySearch } from './developEliteListSearch'
import {
  formatDevelopEliteCropHarvestDate,
  formatDevelopEliteCropPlantingDate,
} from './developEliteArcgisDate'
import {
  buildCountryListItems,
  buildFarmListItems,
  buildAgriLocationProjectCodeListItems,
  filterProjectCodeListForCountry,
  compareDevelopEliteCropTableRows,
  compareDevelopEliteFarmListItems,
  computeDevelopEliteKpis,
  computeDevelopEliteStructuresTotalAreaHa,
  developEliteAgriKpiFilters,
  developEliteMapDisplayFilters,
  computeDevelopEliteZoneLayerTotalAreaHa,
  computeSideStructureCounts,
  filterCropRowsForChartStats,
  filterCropRowsForStructures,
  filterGeoJsonFeaturesByMapView,
  filterScopedTreeFeatures,
  filterStructureFeatures,
  filterStructureFeaturesByMapView,
  normalizeStructureFeatures,
  resolveDevelopEliteCountryFilterLabel,
  type DevelopEliteFilterContext,
  type DevelopEliteFilters,
  type DevelopEliteListContext,
  type DevelopEliteMapView,
  type DevelopEliteStructureFeature,
} from './developEliteKpiEngine'
import {
  buildWorldCountryListItems,
  filterWorldCountriesForMap,
} from './developEliteWorldCountries'
import { resolveDevelopEliteMapWorldCountriesGeoJson } from './developEliteMapWorldCountriesGeoJson'
import {
  clearDevelopEliteArcgisSessionCache,
  developEliteArcgisBoot,
  developEliteArcgisCacheKey,
  developEliteArcgisLayerUrlsChanged,
  getDevelopEliteArcgisSessionCache,
  setDevelopEliteArcgisSessionCache,
  type DevelopEliteArcgisDataSnapshot,
} from './developEliteArcgisSessionCache'
import { dispatchDevelopEliteDashboardRefresh } from './developEliteDashboardEvents'
import { fetchDevelopEliteWorldCountriesGeoJson } from './developEliteWorldCountriesLoad'
import {
  quantizeDevelopEliteMapView,
  shouldPublishDevelopEliteMapView,
} from './developEliteMapViewPublish'

export type DevelopEliteChartSlice = { label: string; value: number; color: string }

export function useDevelopEliteDashboardData() {
  const boot = developEliteArcgisBoot()
  const bootSnapshot = boot.snapshot

  const [config, setConfig] = useState<DevelopEliteDashboardConfig>(() => boot.config)
  const [filters, setFilters] = useState<DevelopEliteFilters>({
    country: 'all',
    zoneId: 'all',
    selectedFieldKey: null,
    locationSearch: '',
  })
  const [mapView, setMapView] = useState<DevelopEliteMapView | null>(null)
  const mapViewRef = useRef<DevelopEliteMapView | null>(null)
  const publishMapView = useCallback((view: DevelopEliteMapView) => {
    const next = quantizeDevelopEliteMapView(view)
    if (!shouldPublishDevelopEliteMapView(mapViewRef.current, next)) return
    mapViewRef.current = next
    startTransition(() => setMapView(next))
  }, [])
  const [structures, setStructures] = useState<GeoJSON.FeatureCollection | null>(
    () => bootSnapshot?.structures ?? null,
  )
  const [zoneLayerStructures, setZoneLayerStructures] = useState<GeoJSON.FeatureCollection | null>(
    () => bootSnapshot?.zoneLayerStructures ?? null,
  )
  const [structuresDrawingInfo, setStructuresDrawingInfo] = useState<Record<string, unknown> | null>(
    () => bootSnapshot?.structuresDrawingInfo ?? null,
  )
  const [cropRows, setCropRows] = useState<ArcGisTableRow[]>(() => bootSnapshot?.cropRows ?? [])
  const [treeFeatures, setTreeFeatures] = useState<GeoJSON.Feature[]>(
    () => bootSnapshot?.treeFeatures ?? [],
  )
  const [treesDrawingInfo, setTreesDrawingInfo] = useState<Record<string, unknown> | null>(
    () => bootSnapshot?.treesDrawingInfo ?? null,
  )
  const [agriLocationFeatures, setAgriLocationFeatures] = useState<GeoJSON.Feature[]>(
    () => bootSnapshot?.agriLocationFeatures ?? [],
  )
  const [agriLocationDrawingInfo, setAgriLocationDrawingInfo] = useState<Record<string, unknown> | null>(
    () => bootSnapshot?.agriLocationDrawingInfo ?? null,
  )
  const [irrigationValveFeatures, setIrrigationValveFeatures] = useState<GeoJSON.Feature[]>(
    () => bootSnapshot?.irrigationValveFeatures ?? [],
  )
  const [irrigationValvesDrawingInfo, setIrrigationValvesDrawingInfo] = useState<
    Record<string, unknown> | null
  >(() => bootSnapshot?.irrigationValvesDrawingInfo ?? null)
  const [irrigationMainPipeFeatures, setIrrigationMainPipeFeatures] = useState<GeoJSON.Feature[]>(
    () => bootSnapshot?.irrigationMainPipeFeatures ?? [],
  )
  const [irrigationMainPipeDrawingInfo, setIrrigationMainPipeDrawingInfo] = useState<
    Record<string, unknown> | null
  >(() => bootSnapshot?.irrigationMainPipeDrawingInfo ?? null)
  const [cropMeta, setCropMeta] = useState<DevelopEliteLayerMeta>(
    () =>
      bootSnapshot?.cropMeta ?? {
        cropTypeLabels: new Map(),
        fieldDomainLabels: new Map(),
      },
  )
  const [countryLabels, setCountryLabels] = useState<Map<string, string>>(
    () => bootSnapshot?.countryLabels ?? new Map(),
  )
  const [worldCountries, setWorldCountries] = useState<GeoJSON.FeatureCollection | null>(
    () => bootSnapshot?.worldCountries ?? null,
  )
  const [worldCountriesDrawingInfo, setWorldCountriesDrawingInfo] = useState<Record<
    string,
    unknown
  > | null>(() => bootSnapshot?.worldCountriesDrawingInfo ?? null)
  const [worldCountryDomain, setWorldCountryDomain] = useState<Map<string, string>>(
    () => bootSnapshot?.worldCountryDomain ?? new Map(),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(() =>
    bootSnapshot?.fetchedAt ? new Date(bootSnapshot.fetchedAt) : null,
  )
  const [reloadToken, setReloadToken] = useState(0)
  const [tableHighlightRowId, setTableHighlightRowId] = useState<string | null>(null)
  const [tableFlashRowId, setTableFlashRowId] = useState<string | null>(null)
  const [mapHighlightFieldKey, setMapHighlightFieldKey] = useState<string | null>(null)
  const [mapFlyToRequest, setMapFlyToRequest] = useState(0)
  const [mapCountryFlyRequest, setMapCountryFlyRequest] = useState(0)
  const [farmListFlashFieldKey, setFarmListFlashFieldKey] = useState<string | null>(null)
  const [chartCropTypeFilter, setChartCropTypeFilter] = useState<string | null>(null)
  const tableRowsRef = useRef<Record<string, string>[]>([])

  /** Refetch all ArcGIS layers + KPIs/charts/map without a browser reload. */
  const refresh = useCallback(() => {
    clearDevelopEliteArcgisSessionCache(developEliteArcgisCacheKey(configRef.current))
    setError(null)
    setChartCropTypeFilter(null)
    setMapHighlightFieldKey(null)
    setTableHighlightRowId(null)
    setFarmListFlashFieldKey(null)
    setFilters({
      country: 'all',
      zoneId: 'all',
      selectedFieldKey: null,
      locationSearch: '',
    })
    setReloadToken(t => t + 1)
    dispatchDevelopEliteDashboardRefresh({ resetMapViewport: true })
  }, [])
  const refreshing = loading && structures !== null
  const initialLoading = false

  const applyArcgisSnapshot = useCallback((snapshot: DevelopEliteArcgisDataSnapshot) => {
    setStructures(snapshot.structures)
    setZoneLayerStructures(snapshot.zoneLayerStructures)
    setStructuresDrawingInfo(snapshot.structuresDrawingInfo)
    setCropRows(snapshot.cropRows)
    setTreeFeatures(snapshot.treeFeatures)
    setTreesDrawingInfo(snapshot.treesDrawingInfo)
    setAgriLocationFeatures(snapshot.agriLocationFeatures)
    setAgriLocationDrawingInfo(snapshot.agriLocationDrawingInfo)
    setIrrigationValveFeatures(snapshot.irrigationValveFeatures)
    setIrrigationValvesDrawingInfo(snapshot.irrigationValvesDrawingInfo)
    setIrrigationMainPipeFeatures(snapshot.irrigationMainPipeFeatures)
    setIrrigationMainPipeDrawingInfo(snapshot.irrigationMainPipeDrawingInfo)
    setCropMeta(snapshot.cropMeta)
    setCountryLabels(snapshot.countryLabels)
    setWorldCountries(snapshot.worldCountries)
    setWorldCountryDomain(snapshot.worldCountryDomain)
    setWorldCountriesDrawingInfo(snapshot.worldCountriesDrawingInfo)
    setLastRefreshedAt(new Date(snapshot.fetchedAt))
  }, [])

  const applyArcgisPartial = useCallback((patch: Partial<DevelopEliteArcgisDataSnapshot>) => {
    if (patch.structures !== undefined) setStructures(patch.structures)
    if (patch.zoneLayerStructures !== undefined) setZoneLayerStructures(patch.zoneLayerStructures)
    if (patch.structuresDrawingInfo !== undefined) setStructuresDrawingInfo(patch.structuresDrawingInfo)
    if (patch.cropRows !== undefined) setCropRows(patch.cropRows)
    if (patch.treeFeatures !== undefined) setTreeFeatures(patch.treeFeatures)
    if (patch.treesDrawingInfo !== undefined) setTreesDrawingInfo(patch.treesDrawingInfo)
    if (patch.agriLocationFeatures !== undefined) setAgriLocationFeatures(patch.agriLocationFeatures)
    if (patch.agriLocationDrawingInfo !== undefined)
      setAgriLocationDrawingInfo(patch.agriLocationDrawingInfo)
    if (patch.irrigationValveFeatures !== undefined)
      setIrrigationValveFeatures(patch.irrigationValveFeatures)
    if (patch.irrigationValvesDrawingInfo !== undefined)
      setIrrigationValvesDrawingInfo(patch.irrigationValvesDrawingInfo)
    if (patch.irrigationMainPipeFeatures !== undefined)
      setIrrigationMainPipeFeatures(patch.irrigationMainPipeFeatures)
    if (patch.irrigationMainPipeDrawingInfo !== undefined)
      setIrrigationMainPipeDrawingInfo(patch.irrigationMainPipeDrawingInfo)
    if (patch.cropMeta !== undefined) setCropMeta(patch.cropMeta)
    if (patch.countryLabels !== undefined) setCountryLabels(patch.countryLabels)
    if (patch.worldCountries !== undefined) setWorldCountries(patch.worldCountries)
    if (patch.worldCountryDomain !== undefined) setWorldCountryDomain(patch.worldCountryDomain)
    if (patch.worldCountriesDrawingInfo !== undefined)
      setWorldCountriesDrawingInfo(patch.worldCountriesDrawingInfo)
    if (patch.fetchedAt !== undefined) setLastRefreshedAt(new Date(patch.fetchedAt))
    if (patch.structures?.features?.length) setLoading(false)
  }, [])

  const structuresRef = useRef(structures)
  structuresRef.current = structures
  const configRef = useRef(config)
  configRef.current = config

  const persistConfig = useCallback((next: DevelopEliteDashboardConfig) => {
    setConfig(prev => {
      saveDevelopEliteDashboardConfig(next)
      if (developEliteArcgisLayerUrlsChanged(prev, next)) {
        setReloadToken(t => t + 1)
      }
      return next
    })
  }, [])

  const patchConfig = useCallback((patch: Partial<DevelopEliteDashboardConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      saveDevelopEliteDashboardConfig(next)
      return next
    })
  }, [])

  useEffect(() => {
    const force = reloadToken > 0
    let cancelled = false

    const cacheKey = developEliteArcgisCacheKey(config)
    if (!force) {
      const cached = getDevelopEliteArcgisSessionCache(cacheKey)
      if (cached) {
        applyArcgisSnapshot(cached)
        return
      }
    }

    const showBusy = force || structuresRef.current === null
    if (showBusy) setLoading(true)
    setError(null)

    ensureDevelopEliteArcgisSnapshot(config, {
      force,
      onPartial: patch => {
        if (cancelled) return
        applyArcgisPartial(patch)
      },
    })
      .then(snapshot => {
        if (cancelled) return
        applyArcgisSnapshot(snapshot)
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load ArcGIS data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    applyArcgisPartial,
    applyArcgisSnapshot,
    config.structuresLayerUrl,
    config.zonesLayerUrl,
    config.cropsTableUrl,
    config.treesLayerUrl,
    config.agriLocationLayerUrl,
    config.irrigationValvesLayerUrl,
    config.irrigationMainPipeLayerUrl,
    config.worldCountriesLayerUrl,
    reloadToken,
  ])

  useEffect(() => {
    const visible = worldCountries?.features?.length
      ? filterWorldCountriesForMap(worldCountries.features, worldCountryDomain)
      : []
    if (visible.length) return

    let cancelled = false
    fetchDevelopEliteWorldCountriesGeoJson(config.worldCountriesLayerUrl)
      .then(fc => {
        if (cancelled || !fc?.features?.length) return
        const mapReady = filterWorldCountriesForMap(fc.features, worldCountryDomain)
        if (!mapReady.length) return
        setWorldCountries(fc)
        const key = developEliteArcgisCacheKey(config)
        const cached = getDevelopEliteArcgisSessionCache(key)
        if (cached) {
          setDevelopEliteArcgisSessionCache(key, {
            ...cached,
            worldCountries: fc,
            fetchedAt: Date.now(),
          })
        }
      })
      .catch(() => {
        /* optional layer */
      })

    return () => {
      cancelled = true
    }
  }, [config.worldCountriesLayerUrl, worldCountries, worldCountryDomain])

  const allFeatures = useMemo(() => normalizeStructureFeatures(structures), [structures])
  const allFeaturesRef = useRef(allFeatures)
  allFeaturesRef.current = allFeatures

  const mergedCountryLabels = useMemo(() => {
    const merged = new Map(countryLabels)
    for (const [code, label] of worldCountryDomain) {
      if (!merged.has(code)) merged.set(code, label)
    }
    return merged
  }, [countryLabels, worldCountryDomain])

  const listContext = useMemo(
    (): DevelopEliteListContext => ({ countryLabels: mergedCountryLabels }),
    [mergedCountryLabels],
  )

  const zoneListMapSortFeatures = useMemo((): DevelopEliteStructureFeature[] => {
    return agriLocationFeatures.map((f, i) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: { ...(f.properties ?? {}) },
    })) as DevelopEliteStructureFeature[]
  }, [agriLocationFeatures])

  const zoneList = useMemo(() => {
    const items = buildAgriLocationProjectCodeListItems(agriLocationFeatures)
    return filterProjectCodeListForCountry(items, agriLocationFeatures, filters.country, {
      countryLabels: mergedCountryLabels,
      worldCountryDomain,
    })
  }, [agriLocationFeatures, filters.country, mergedCountryLabels, worldCountryDomain])

  const filterContext = useMemo((): DevelopEliteFilterContext => {
    const activeZoneLabel =
      filters.zoneId && filters.zoneId !== 'all'
        ? zoneList.find(z => z.zoneId === filters.zoneId)?.label ?? null
        : null
    return {
      countryLabels: mergedCountryLabels,
      worldCountryDomain,
      activeZoneLabel,
    }
  }, [filters.zoneId, mergedCountryLabels, worldCountryDomain, zoneList])

  const scopedFeatures = useMemo(() => {
    const base = filterStructureFeatures(allFeatures, filters, filterContext)
    return filterStructureFeaturesByMapView(base, mapView)
  }, [allFeatures, filters, filterContext, mapView])

  const scopedCropRows = useMemo(
    () =>
      filterCropRowsForStructures(
        cropRows,
        scopedFeatures,
        filters,
        config.cropStructureJoinField,
      ),
    [cropRows, scopedFeatures, filters, config.cropStructureJoinField],
  )

  const tableScopeFilters = useMemo(
    (): DevelopEliteFilters => ({
      country: filters.country,
      zoneId: filters.zoneId,
      selectedFieldKey: null,
      locationSearch: filters.locationSearch,
    }),
    [filters.country, filters.zoneId, filters.locationSearch],
  )

  const tableStructurePool = useMemo(() => {
    const base = filterStructureFeatures(allFeatures, tableScopeFilters, filterContext)
    return filterStructureFeaturesByMapView(base, mapView)
  }, [allFeatures, filterContext, mapView, tableScopeFilters])

  const tableCropRows = useMemo(
    () =>
      filterCropRowsForChartStats(
        cropRows,
        tableStructurePool,
        tableScopeFilters,
        config.cropStructureJoinField,
      ),
    [cropRows, tableStructurePool, tableScopeFilters, config.cropStructureJoinField],
  )

  const scopedTreeCount = useMemo(() => {
    const scoped = filterScopedTreeFeatures(treeFeatures, scopedFeatures, filters)
    return filterGeoJsonFeaturesByMapView(scoped, mapView).length
  }, [treeFeatures, scopedFeatures, filters, mapView])

  const agriKpiFilters = useMemo(() => developEliteAgriKpiFilters(filters), [filters])

  const agriKpiStructures = useMemo(() => {
    const base = filterStructureFeatures(allFeatures, agriKpiFilters, filterContext)
    return filterStructureFeaturesByMapView(base, mapView)
  }, [agriKpiFilters, allFeatures, filterContext, mapView])

  const kpiAgriLocationFeatures = useMemo(
    () => filterGeoJsonFeaturesByMapView(agriLocationFeatures, mapView),
    [agriLocationFeatures, mapView],
  )

  const mapLayerVisibility = useMemo(
    () => normalizeDevelopEliteMapLayerVisibility(config.mapLayerVisibility),
    [config.mapLayerVisibility],
  )

  const agroStructuresLayerVisible = isDevelopEliteMapDataLayerVisible(
    mapLayerVisibility,
    'agro-structures',
  )

  /** Same pool as the map canvas: all structures on the layer, clipped to the current map view. */
  const mapLinkedStructureFeatures = useMemo(() => {
    const base = filterStructureFeatures(
      allFeatures,
      developEliteMapDisplayFilters(filters),
      filterContext,
    )
    return filterStructureFeaturesByMapView(base, mapView)
  }, [allFeatures, filterContext, filters, mapView])

  const heroZoneLayerTotalAreaHa = useMemo(() => {
    if (!agroStructuresLayerVisible) return 0
    if (zoneLayerStructures?.features?.length) {
      return computeDevelopEliteZoneLayerTotalAreaHa(zoneLayerStructures, mapView)
    }
    return computeDevelopEliteStructuresTotalAreaHa(mapLinkedStructureFeatures)
  }, [
    agroStructuresLayerVisible,
    mapLinkedStructureFeatures,
    mapView,
    zoneLayerStructures,
  ])

  const heroMapCultivatedAreaHa = useMemo(() => {
    if (!agroStructuresLayerVisible) return 0
    return computeDevelopEliteStructuresTotalAreaHa(mapLinkedStructureFeatures)
  }, [agroStructuresLayerVisible, mapLinkedStructureFeatures])

  const kpis = useMemo(() => {
    const base = computeDevelopEliteKpis(
      scopedFeatures,
      scopedCropRows,
      config,
      scopedTreeCount,
      kpiAgriLocationFeatures,
      agriLocationDrawingInfo,
      filters,
      agriKpiStructures,
      agriKpiFilters,
    )
    return {
      ...base,
      heroTotalAreaHa: heroMapCultivatedAreaHa,
      heroZoneLayerTotalAreaHa,
    }
  }, [
    scopedFeatures,
    scopedCropRows,
    config,
    scopedTreeCount,
    kpiAgriLocationFeatures,
    agriLocationDrawingInfo,
    agriKpiFilters,
    agriKpiStructures,
    filters,
    heroMapCultivatedAreaHa,
    heroZoneLayerTotalAreaHa,
  ])

  const farmListFilters = useMemo(
    (): DevelopEliteFilters => ({
      country: filters.country,
      zoneId: filters.zoneId,
      selectedFieldKey: null,
      locationSearch: '',
    }),
    [filters.country, filters.zoneId],
  )

  const farmList = useMemo(() => {
    const scoped = filterStructureFeatures(allFeatures, farmListFilters, filterContext)
    const items = buildFarmListItems(scoped, listContext)
    return sortDevelopEliteListBySearch(
      items,
      filters.locationSearch,
      item => `${item.title} ${item.subtitle ?? ''}`,
      compareDevelopEliteFarmListItems,
    )
  }, [allFeatures, farmListFilters, filterContext, filters.locationSearch, listContext])

  const countryList = useMemo(() => {
    const fromWorld = buildWorldCountryListItems(worldCountries, worldCountryDomain)
    if (fromWorld.length) return fromWorld
    return buildCountryListItems(allFeatures, listContext)
  }, [allFeatures, listContext, worldCountries, worldCountryDomain])
  const sideCounts = useMemo(() => {
    const pool = filterStructureFeatures(
      allFeatures,
      {
        country: filters.country,
        zoneId: filters.zoneId,
        selectedFieldKey: null,
        locationSearch: filters.locationSearch,
      },
      filterContext,
    )
    return computeSideStructureCounts(filterStructureFeaturesByMapView(pool, mapView))
  }, [
    allFeatures,
    filterContext,
    filters.country,
    filters.locationSearch,
    filters.zoneId,
    mapView,
  ])

  /** Pie/bar use the same Farm_Code–joined crop rows as the grid table (not a separate chart-only filter). */
  const chartSlices = useMemo(
    () =>
      aggregateChartSlices(
        tableCropRows,
        config.chartGroupField,
        cropMeta,
        config.chartValueField,
      ),
    [tableCropRows, config.chartGroupField, config.chartValueField, cropMeta],
  )

  const cropTypeColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const slice of chartSlices) map.set(slice.label, slice.color)
    return map
  }, [chartSlices])

  const activeCountryLabel = useMemo(
    () => resolveDevelopEliteCountryFilterLabel(filters.country, countryList, mergedCountryLabels),
    [countryList, mergedCountryLabels, filters.country],
  )

  const mapWorldCountriesPortfolioExtentGeoJson = useMemo(
    () => resolveDevelopEliteMapWorldCountriesGeoJson(worldCountries, worldCountryDomain),
    [worldCountries, worldCountryDomain],
  )

  /** Portfolio country outlines — always show full set; country filter only scopes KPIs/farms and map fly-to. */
  const mapWorldCountriesGeoJson = useMemo(
    () => resolveDevelopEliteMapWorldCountriesGeoJson(worldCountries, worldCountryDomain),
    [worldCountries, worldCountryDomain],
  )

  const mapGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: allFeatures as DevelopEliteStructureFeature[] }
  }, [allFeatures])

  const mapTreesGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: treeFeatures }
  }, [treeFeatures])

  const mapAgriLocationGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: agriLocationFeatures }
  }, [agriLocationFeatures])

  const mapIrrigationValvesGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: irrigationValveFeatures }
  }, [irrigationValveFeatures])

  const mapIrrigationMainPipeGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: irrigationMainPipeFeatures }
  }, [irrigationMainPipeFeatures])

  const mapDataLayerOrder = useMemo(
    () => normalizeDevelopEliteMapDataLayerOrder(config.mapDataLayerOrder),
    [config.mapDataLayerOrder],
  )

  const mapDataLayerOpacity = useMemo(
    () => normalizeDevelopEliteMapLayerOpacity(config.mapDataLayerOpacity),
    [config.mapDataLayerOpacity],
  )

  const setMapLayerVisible = useCallback((id: DevelopEliteMapDataLayerId, visible: boolean) => {
    setConfig(prev => {
      const next = {
        ...prev,
        mapLayerVisibility: {
          ...normalizeDevelopEliteMapLayerVisibility(prev.mapLayerVisibility),
          [id]: visible,
        },
      }
      saveDevelopEliteDashboardConfig(next)
      return next
    })
  }, [])

  const setMapDataLayerOrder = useCallback((order: DevelopEliteMapDataLayerId[]) => {
    setConfig(prev => {
      const next = {
        ...prev,
        mapDataLayerOrder: normalizeDevelopEliteMapDataLayerOrder(order),
      }
      saveDevelopEliteDashboardConfig(next)
      return next
    })
  }, [])

  const setMapDataLayerOpacity = useCallback((id: DevelopEliteMapDataLayerId, opacity: number) => {
    setConfig(prev => {
      const next = {
        ...prev,
        mapDataLayerOpacity: normalizeDevelopEliteMapLayerOpacity({
          ...prev.mapDataLayerOpacity,
          [id]: opacity,
        }),
      }
      saveDevelopEliteDashboardConfig(next)
      return next
    })
  }, [])

  const structureFieldKeyByJoinCode = useMemo(
    () => buildDevelopEliteStructureFieldKeyByJoinCode(allFeatures, config.cropStructureJoinField),
    [allFeatures, config.cropStructureJoinField],
  )

  const structureFieldKeyByFarmName = useMemo(
    () => buildDevelopEliteStructureFieldKeyByFarmName(allFeatures),
    [allFeatures],
  )

  const tableRows = useMemo(() => {
    const joinField = config.cropStructureJoinField
    const sorted = [...tableCropRows].sort((a, b) =>
      compareDevelopEliteCropTableRows(a, b, joinField),
    )
    return sorted.slice(0, 200).map((row, i) => {
      const out: Record<string, string> = { _rowId: String(row.OBJECTID ?? row.objectid ?? i) }
      const rawFc = readArcGisField(row, joinField)
      const fc = rawFc != null && rawFc !== '' ? normalizeDevelopEliteJoinKey(String(rawFc)) : ''
      let fieldKey = fc ? structureFieldKeyByJoinCode.get(fc) ?? '' : ''
      if (!fieldKey) {
        const farmNameRaw = readArcGisField(row, 'Farm_Name')
        const farmName =
          farmNameRaw != null && farmNameRaw !== ''
            ? normalizeDevelopEliteFarmNameKey(String(farmNameRaw))
            : ''
        if (farmName) fieldKey = structureFieldKeyByFarmName.get(farmName) ?? ''
      }
      out._fieldKey = fieldKey
      for (const col of config.tableColumns) {
        if (col === 'OBJECTID') {
          out[col] = String(i + 1)
        } else if (col === 'Crop_Type') {
          out[col] = resolveCropLabel(row, cropMeta, col)
        } else if (resolveDevelopEliteFieldDomainLabels(cropMeta, col)) {
          out[col] = resolveCodedFieldLabel(row, cropMeta, col)
        } else if (col === 'Planting_Date') {
          out[col] = formatDevelopEliteCropPlantingDate(row)
        } else if (col === 'Harvest_Date') {
          out[col] = formatDevelopEliteCropHarvestDate(row)
        } else if (col === 'Total_Tree') {
          const v = readArcGisField(row, col)
          out[col] = v != null && v !== '' ? String(v) : ''
        } else {
          const v = readArcGisField(row, col)
          out[col] = v != null && v !== '' ? String(v) : ''
        }
      }
      return out
    })
  }, [
    tableCropRows,
    config.tableColumns,
    config.cropStructureJoinField,
    cropMeta,
    structureFieldKeyByJoinCode,
    structureFieldKeyByFarmName,
  ])

  tableRowsRef.current = tableRows

  const displayTableRows = useMemo(() => {
    if (!chartCropTypeFilter) return tableRows
    return tableRows.filter(row => row.Crop_Type === chartCropTypeFilter)
  }, [chartCropTypeFilter, tableRows])

  const selectCountry = useCallback((code: string) => {
    setChartCropTypeFilter(null)
    setMapHighlightFieldKey(null)
    setFilters(f => ({
      ...f,
      country: code || 'all',
      zoneId: 'all',
      selectedFieldKey: null,
    }))
    setMapCountryFlyRequest(n => n + 1)
  }, [])

  const selectZone = useCallback((zoneId: string) => {
    setMapHighlightFieldKey(null)
    setFilters(f => ({ ...f, zoneId: zoneId || 'all' }))
  }, [])

  const selectFarm = useCallback((fieldKey: string | null) => {
    setChartCropTypeFilter(null)
    setMapHighlightFieldKey(fieldKey)
    setFilters(f => ({ ...f, selectedFieldKey: fieldKey }))
    if (fieldKey) setMapFlyToRequest(n => n + 1)
  }, [])

  const focusFarmOnMap = useCallback((fieldKey: string) => {
    setChartCropTypeFilter(null)
    setMapHighlightFieldKey(fieldKey)
    setFilters(f => ({ ...f, selectedFieldKey: fieldKey }))
    setMapFlyToRequest(n => n + 1)
    setFarmListFlashFieldKey(null)
    requestAnimationFrame(() => setFarmListFlashFieldKey(fieldKey))
    window.setTimeout(() => {
      setFarmListFlashFieldKey(current => (current === fieldKey ? null : current))
    }, 1600)
  }, [])

  const resolveTableRowFieldKey = useCallback(
    (row: Record<string, string> | undefined): string | null => {
      if (!row) return null
      if (row._fieldKey?.trim()) return row._fieldKey.trim()
      const joinField = config.cropStructureJoinField
      const farmCode = row.Farm_Code ?? row[joinField] ?? ''
      const farmName = row.Farm_Name ?? ''
      if (!farmCode.trim() && !farmName.trim()) return null
      const fromLive = findDevelopEliteStructureFieldKey(
        allFeaturesRef.current,
        joinField,
        farmCode,
        farmName,
      )
      if (fromLive) return fromLive
      if (farmCode.trim()) {
        const fromMap = structureFieldKeyByJoinCode.get(normalizeDevelopEliteJoinKey(farmCode))
        if (fromMap) return fromMap
      }
      if (farmName.trim()) {
        return structureFieldKeyByFarmName.get(normalizeDevelopEliteFarmNameKey(farmName)) ?? null
      }
      return null
    },
    [config.cropStructureJoinField, structureFieldKeyByFarmName, structureFieldKeyByJoinCode],
  )

  const focusTableRow = useCallback(
    (rowId: string) => {
      setTableHighlightRowId(rowId)
      const row = tableRowsRef.current.find(r => r._rowId === rowId)
      const fieldKey = resolveTableRowFieldKey(row)
      if (!fieldKey) return
      setMapHighlightFieldKey(fieldKey)
      setFilters(f => ({ ...f, selectedFieldKey: fieldKey }))
    },
    [resolveTableRowFieldKey],
  )

  const selectChartCropType = useCallback((cropLabel: string) => {
    const next = chartCropTypeFilter === cropLabel ? null : cropLabel
    setChartCropTypeFilter(next)
    setMapHighlightFieldKey(null)
    setFilters(f => ({ ...f, selectedFieldKey: null }))
    if (!next) return
    const row = tableRowsRef.current.find(r => r.Crop_Type === next)
    if (row) {
      setTableHighlightRowId(row._rowId)
      setTableFlashRowId(row._rowId)
      window.setTimeout(() => {
        setTableFlashRowId(current => (current === row._rowId ? null : current))
      }, 1600)
    }
  }, [chartCropTypeFilter])

  const activateTableRowOnMap = useCallback(
    (rowId: string) => {
      const row = tableRowsRef.current.find(r => r._rowId === rowId)
      const fieldKey = resolveTableRowFieldKey(row)
      if (!fieldKey) return
      setTableHighlightRowId(rowId)
      setTableFlashRowId(rowId)
      focusFarmOnMap(fieldKey)
      window.setTimeout(() => {
        setTableFlashRowId(current => (current === rowId ? null : current))
      }, 1600)
    },
    [focusFarmOnMap, resolveTableRowFieldKey],
  )

  const mapFieldHighlightKey = mapHighlightFieldKey ?? filters.selectedFieldKey

  const setLocationSearch = useCallback((q: string) => {
    setFilters(f => ({ ...f, locationSearch: q }))
  }, [])

  return {
    config,
    persistConfig,
    patchConfig,
    filters,
    loading,
    error,
    refresh,
    refreshing,
    initialLoading,
    lastRefreshedAt,
    kpis,
    farmList,
    zoneList,
    zoneListMapSortFeatures,
    mapView,
    setMapView: publishMapView,
    countryList,
    sideCounts,
    chartSlices,
    cropTypeColors,
    mapGeoJson,
    mapTreesGeoJson,
    mapAgriLocationGeoJson,
    mapIrrigationValvesGeoJson,
    mapIrrigationMainPipeGeoJson,
    treesDrawingInfo,
    agriLocationDrawingInfo,
    irrigationValvesDrawingInfo,
    irrigationMainPipeDrawingInfo,
    mapLayerVisibility,
    mapDataLayerOrder,
    mapDataLayerOpacity,
    setMapLayerVisible,
    setMapDataLayerOrder,
    setMapDataLayerOpacity,
    mapWorldCountriesGeoJson,
    mapWorldCountriesPortfolioExtentGeoJson,
    worldCountriesDrawingInfo,
    structuresDrawingInfo,
    tableRows: displayTableRows,
    chartCropTypeFilter,
    selectChartCropType,
    tableHighlightRowId,
    tableFlashRowId,
    mapFieldHighlightKey,
    focusTableRow,
    activateTableRowOnMap,
    mapFlyToRequest,
    mapCountryFlyRequest,
    activeCountryLabel,
    selectCountry,
    selectZone,
    selectFarm,
    focusFarmOnMap,
    farmListFlashFieldKey,
    setLocationSearch,
    scopedFeatures,
    countryLabels,
    worldCountryDomain,
  }
}
