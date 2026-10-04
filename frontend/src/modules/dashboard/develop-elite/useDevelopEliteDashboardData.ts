import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import { type ArcGisTableRow, type DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import { ensureDevelopEliteArcgisSnapshot } from './developEliteArcgisDataLoad'
import {
  aggregateChartSlices,
  readArcGisField,
  resolveCropLabel,
} from './developEliteChartAggregate'
import {
  type DevelopEliteDashboardConfig,
  type DevelopEliteMapDataLayerId,
  saveDevelopEliteDashboardConfig,
} from './developEliteDashboardConfig'
import {
  normalizeDevelopEliteMapDataLayerOrder,
  normalizeDevelopEliteMapLayerVisibility,
} from './developEliteMapDataLayers'
import { normalizeDevelopEliteJoinKey } from './developEliteLayerJoin'
import { sortDevelopEliteListBySearch } from './developEliteListSearch'
import {
  formatDevelopEliteCropHarvestDate,
  formatDevelopEliteCropPlantingDate,
  resolveDevelopEliteCropPlantingDateRaw,
} from './developEliteArcgisDate'
import {
  buildCountryListItems,
  buildFarmListItems,
  buildZoneListItems,
  compareDevelopEliteListNames,
  filterZoneListForCountry,
  computeDevelopEliteKpis,
  computeDevelopEliteZoneLayerTotalAreaHa,
  computeSideStructureCounts,
  countScopedTreeFeatures,
  filterCropRowsForChartStats,
  filterCropRowsForStructures,
  filterStructureFeatures,
  normalizeStructureFeatures,
  resolveDevelopEliteCountryFilterLabel,
  type DevelopEliteFilterContext,
  type DevelopEliteFilters,
  type DevelopEliteListContext,
  type DevelopEliteMapView,
  type DevelopEliteStructureFeature,
  type DevelopEliteZoneListItem,
} from './developEliteKpiEngine'
import {
  buildWorldCountryListItems,
  filterWorldCountriesForMap,
  readWorldCountryCode,
} from './developEliteWorldCountries'
import {
  developEliteArcgisBoot,
  developEliteArcgisCacheKey,
  developEliteArcgisLayerUrlsChanged,
  getDevelopEliteArcgisSessionCache,
  type DevelopEliteArcgisDataSnapshot,
} from './developEliteArcgisSessionCache'

export type DevelopEliteChartSlice = { label: string; value: number; color: string }

function mergeCountryRelationshipZones(
  zones: DevelopEliteZoneListItem[],
  world: GeoJSON.FeatureCollection | null,
  country: string,
  labels: Map<string, string>,
  domain: Map<string, string>,
): DevelopEliteZoneListItem[] {
  const selected = country?.trim()
  if (!selected || selected === 'all' || !world?.features?.length) return zones
  const wantLabel = (labels.get(selected) || domain.get(selected) || selected).trim().toLowerCase()
  const extra: DevelopEliteZoneListItem[] = []
  for (const feature of world.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const code = readWorldCountryCode(props, domain)
    const name = String(props.ALL_COUNTRY ?? props.COUNTRYAFF ?? '').trim()
    const matches =
      code === selected ||
      name.toLowerCase() === selected.toLowerCase() ||
      name.toLowerCase() === wantLabel ||
      (labels.get(code) || '').toLowerCase() === wantLabel
    if (!matches) continue
    const zoneId = String(props.ZONE_ID ?? props.Zone_ID ?? '').trim()
    if (!zoneId) continue
    if (zones.some(zone => zone.zoneId.toLowerCase() === zoneId.toLowerCase())) continue
    if (extra.some(zone => zone.zoneId.toLowerCase() === zoneId.toLowerCase())) continue
    extra.push({ zoneId, label: zoneId, count: 0 })
  }
  if (!extra.length) return zones
  return [...zones, ...extra].sort((a, b) => compareDevelopEliteListNames(a.label, b.label))
}

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
  const [cropMeta, setCropMeta] = useState<DevelopEliteLayerMeta>(
    () => bootSnapshot?.cropMeta ?? { cropTypeLabels: new Map() },
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

  const refresh = useCallback(() => setReloadToken(t => t + 1), [])
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
    setCropMeta(snapshot.cropMeta)
    setCountryLabels(snapshot.countryLabels)
    setWorldCountries(snapshot.worldCountries)
    setWorldCountryDomain(snapshot.worldCountryDomain)
    setWorldCountriesDrawingInfo(snapshot.worldCountriesDrawingInfo)
    setLastRefreshedAt(new Date(snapshot.fetchedAt))
  }, [])

  const structuresRef = useRef(structures)
  structuresRef.current = structures

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

    ensureDevelopEliteArcgisSnapshot(config, { force })
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
    applyArcgisSnapshot,
    config.structuresLayerUrl,
    config.zonesLayerUrl,
    config.cropsTableUrl,
    config.treesLayerUrl,
    config.agriLocationLayerUrl,
    config.worldCountriesLayerUrl,
    reloadToken,
  ])

  const allFeatures = useMemo(() => normalizeStructureFeatures(structures), [structures])

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

  const zoneLayerFeatures = useMemo(
    () =>
      zoneLayerStructures?.features?.length
        ? normalizeStructureFeatures(zoneLayerStructures)
        : [],
    [zoneLayerStructures],
  )

  const zoneListMapSortFeatures = useMemo(
    () => (zoneLayerFeatures.length ? zoneLayerFeatures : allFeatures),
    [allFeatures, zoneLayerFeatures],
  )

  const zoneList = useMemo(() => {
    const items = buildZoneListItems(zoneLayerFeatures.length ? zoneLayerFeatures : allFeatures)
    const filtered = filterZoneListForCountry(items, allFeatures, filters.country, {
      countryLabels: mergedCountryLabels,
      worldCountryDomain,
    })
    return mergeCountryRelationshipZones(
      filtered,
      worldCountries,
      filters.country,
      mergedCountryLabels,
      worldCountryDomain,
    )
  }, [
    allFeatures,
    zoneLayerFeatures,
    filters.country,
    mergedCountryLabels,
    worldCountryDomain,
    worldCountries,
  ])

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

  const scopedFeatures = useMemo(
    () => filterStructureFeatures(allFeatures, filters, filterContext),
    [allFeatures, filters, filterContext],
  )

  const mapStructureFeatures = useMemo(
    () =>
      filterStructureFeatures(
        allFeatures,
        {
          ...filters,
          selectedFieldKey: null,
        },
        filterContext,
      ),
    [allFeatures, filters, filterContext],
  )

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

  /** Crops table (layer 1): zone/country scope — not limited to farms with a visible structure polygon. */
  const tableCropRows = useMemo(
    () =>
      filterCropRowsForChartStats(
        cropRows,
        allFeatures,
        filters,
        config.cropStructureJoinField,
      ),
    [cropRows, allFeatures, filters, config.cropStructureJoinField],
  )

  const scopedTreeCount = useMemo(
    () => countScopedTreeFeatures(treeFeatures, scopedFeatures, filters),
    [treeFeatures, scopedFeatures, filters],
  )

  const heroZoneLayerTotalAreaHa = useMemo(
    () => computeDevelopEliteZoneLayerTotalAreaHa(zoneLayerStructures),
    [zoneLayerStructures],
  )

  const kpis = useMemo(() => {
    const base = computeDevelopEliteKpis(
      scopedFeatures,
      scopedCropRows,
      config,
      scopedTreeCount,
      agriLocationFeatures,
      agriLocationDrawingInfo,
      filters,
    )
    return { ...base, heroZoneLayerTotalAreaHa }
  }, [
    scopedFeatures,
    scopedCropRows,
    config,
    scopedTreeCount,
    agriLocationFeatures,
    agriLocationDrawingInfo,
    filters,
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
    const nameSort = (a: (typeof items)[number], b: (typeof items)[number]) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    return sortDevelopEliteListBySearch(
      items,
      filters.locationSearch,
      item => `${item.title} ${item.subtitle ?? ''}`,
      nameSort,
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
    return computeSideStructureCounts(pool)
  }, [
    allFeatures,
    filterContext,
    filters.country,
    filters.locationSearch,
    filters.zoneId,
  ])

  const chartCropRows = useMemo(
    () =>
      filterCropRowsForChartStats(
        cropRows,
        scopedFeatures,
        filters,
        config.cropStructureJoinField,
      ),
    [cropRows, scopedFeatures, filters, config.cropStructureJoinField],
  )

  const chartSlices = useMemo(
    () =>
      aggregateChartSlices(
        chartCropRows,
        config.chartGroupField,
        cropMeta,
        config.chartValueField,
      ),
    [chartCropRows, config.chartGroupField, config.chartValueField, cropMeta],
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

  const mapWorldCountriesPortfolioExtentGeoJson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!worldCountries?.features?.length) return null
    const visible = filterWorldCountriesForMap(worldCountries.features, worldCountryDomain)
    if (!visible.length) return null
    return { type: 'FeatureCollection', features: visible }
  }, [worldCountries, worldCountryDomain])

  /** Portfolio country outlines — always show full set; country filter only scopes KPIs/farms and map fly-to. */
  const mapWorldCountriesGeoJson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!worldCountries?.features?.length) return null
    const visible = filterWorldCountriesForMap(worldCountries.features, worldCountryDomain)
    if (!visible.length) return null
    return { type: 'FeatureCollection', features: visible }
  }, [worldCountries, worldCountryDomain])

  const mapGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: mapStructureFeatures as DevelopEliteStructureFeature[] }
  }, [mapStructureFeatures])

  const mapTreesGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: treeFeatures }
  }, [treeFeatures])

  const mapAgriLocationGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return { type: 'FeatureCollection', features: agriLocationFeatures }
  }, [agriLocationFeatures])

  const mapLayerVisibility = useMemo(
    () => normalizeDevelopEliteMapLayerVisibility(config.mapLayerVisibility),
    [config.mapLayerVisibility],
  )

  const mapDataLayerOrder = useMemo(
    () => normalizeDevelopEliteMapDataLayerOrder(config.mapDataLayerOrder),
    [config.mapDataLayerOrder],
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

  const structureFieldKeyByJoinCode = useMemo(() => {
    const joinField = config.cropStructureJoinField
    const map = new Map<string, string>()
    for (let i = 0; i < allFeatures.length; i++) {
      const f = allFeatures[i]!
      const raw = readArcGisField(f.properties ?? {}, joinField)
      const code = raw != null && raw !== '' ? normalizeDevelopEliteJoinKey(String(raw)) : ''
      if (code && !map.has(code)) map.set(code, computeStableGisFeatureKey(f, i))
    }
    return map
  }, [allFeatures, config.cropStructureJoinField])

  const tableRows = useMemo(() => {
    const joinField = config.cropStructureJoinField
    const sorted = [...tableCropRows].sort((a, b) => {
      const aPlant = resolveDevelopEliteCropPlantingDateRaw(a) != null ? 0 : 1
      const bPlant = resolveDevelopEliteCropPlantingDateRaw(b) != null ? 0 : 1
      if (aPlant !== bPlant) return aPlant - bPlant
      const an = String(readArcGisField(a, 'Farm_Name') ?? '')
      const bn = String(readArcGisField(b, 'Farm_Name') ?? '')
      return an.localeCompare(bn, undefined, { sensitivity: 'base' })
    })
    return sorted.slice(0, 200).map((row, i) => {
      const out: Record<string, string> = { _rowId: String(row.OBJECTID ?? row.objectid ?? i) }
      const rawFc = readArcGisField(row, joinField)
      const fc = rawFc != null && rawFc !== '' ? normalizeDevelopEliteJoinKey(String(rawFc)) : ''
      out._fieldKey = fc ? structureFieldKeyByJoinCode.get(fc) ?? '' : ''
      for (const col of config.tableColumns) {
        if (col === 'OBJECTID') {
          const oid =
            readArcGisField(row, 'OBJECTID_1') ??
            readArcGisField(row, 'OBJECTID') ??
            readArcGisField(row, 'objectid')
          out[col] = oid != null && oid !== '' ? String(oid) : ''
        } else if (col === 'Crop_Type') {
          out[col] = resolveCropLabel(row, cropMeta, col)
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
  ])

  const selectCountry = useCallback((code: string) => {
    setFilters(f => ({
      ...f,
      country: code || 'all',
      zoneId: 'all',
      selectedFieldKey: null,
    }))
  }, [])

  const selectZone = useCallback((zoneId: string) => {
    setFilters(f => ({ ...f, zoneId: zoneId || 'all' }))
  }, [])

  const selectFarm = useCallback((fieldKey: string | null) => {
    setFilters(f => ({ ...f, selectedFieldKey: fieldKey }))
  }, [])

  const focusTableRow = useCallback((rowId: string) => {
    setTableHighlightRowId(rowId)
  }, [])

  const activateTableRowOnMap = useCallback(
    (fieldKey: string | null) => {
      if (!fieldKey) return
      selectFarm(fieldKey)
    },
    [selectFarm],
  )

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
    setMapView,
    countryList,
    sideCounts,
    chartSlices,
    cropTypeColors,
    mapGeoJson,
    mapTreesGeoJson,
    mapAgriLocationGeoJson,
    treesDrawingInfo,
    agriLocationDrawingInfo,
    mapLayerVisibility,
    mapDataLayerOrder,
    setMapLayerVisible,
    setMapDataLayerOrder,
    mapWorldCountriesGeoJson,
    mapWorldCountriesPortfolioExtentGeoJson,
    worldCountriesDrawingInfo,
    structuresDrawingInfo,
    tableRows,
    tableHighlightRowId,
    focusTableRow,
    activateTableRowOnMap,
    activeCountryLabel,
    selectCountry,
    selectZone,
    selectFarm,
    setLocationSearch,
    scopedFeatures,
    countryLabels,
    worldCountryDomain,
  }
}
