import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type { CropAlertEngineSettings, CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import {
  ACP_DEFAULT_MAP_CENTER,
  ACP_DEFAULT_MAP_ZOOM,
} from './acpMapSpatial'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import type { GisContentRow } from '../../master/gisContentPortalData'
import { hydrateAcpCropAlertEngineSnapshot } from './acpCropAlertCache'
import {
  type AcpMapScopeMode,
  type AcpPlatformConfig,
  DEFAULT_ACP_PLATFORM_CONFIG,
  loadAcpAlertEngineSettings,
  loadAcpPlatformConfig,
  persistAcpAlertEngineSettings,
  persistAcpPlatformConfig,
} from './acpPlatformConfig'
import type { AcpFieldTableRow } from './acpMapSpatial'
import {
  buildAcpLayerVisibilityFromDefaults,
  isAcpPortalLayerVisible,
  type AcpCoreMapLayerKey,
  type AcpMapLayerVisibility,
} from './acpMapLayerVisibility'
import {
  buildAcpAoiSyncSignature,
  emitAcpAoiSync,
  subscribeAcpAoiSync,
} from './acpAoiSyncBus'
import { geojsonCollectionSignature } from './acpStructuresLoadPolicy'

export type AcpMapViewState = {
  bbox: LngLatBBox | null
  zoom: number
  center: [number, number]
}

/** Committed Sentinel WMS parameters — only change on Apply / explicit user actions. */
export type AcpCommittedWmsParams = {
  layerId: string
  startDate: string
  endDate: string
  cloudCoverage: number
  revision: number
}

export type AcpPlatformContextValue = {
  config: AcpPlatformConfig
  setConfig: (next: AcpPlatformConfig | ((prev: AcpPlatformConfig) => AcpPlatformConfig)) => void
  applyConfig: (patch: Partial<AcpPlatformConfig>) => void
  alertSettings: CropAlertEngineSettings
  setAlertSettings: (next: CropAlertEngineSettings) => void
  mapView: AcpMapViewState
  setMapView: (next: AcpMapViewState) => void
  scopeMode: AcpMapScopeMode
  setScopeMode: (mode: AcpMapScopeMode) => void
  selectedFieldKey: string | null
  setSelectedFieldKey: (key: string | null) => void
  /** Bumped on explicit locate (crosshairs) — re-triggers map fly-to for the same field. */
  locateFieldSeq: number
  requestFieldLocate: (fieldKey: string) => void
  /** Set when user clicks a field in the weather ticker — opens map popup + fly-to. */
  weatherTickerFocusFieldKey: string | null
  setWeatherTickerFocusFieldKey: (key: string | null) => void
  selectedWmsLayer: string
  setSelectedWmsLayer: (layer: string) => void
  /** Frozen WMS query — map reads this, not live pan/zoom state. */
  wmsParams: AcpCommittedWmsParams
  commitWmsLayer: (patch?: Partial<Omit<AcpCommittedWmsParams, 'revision'>>) => void
  refreshWmsLayer: () => void
  analysisDate: string
  setAnalysisDate: (iso: string) => void
  autoFollowDate: boolean
  setAutoFollowDate: (v: boolean) => void
  decisionFilter: 'healthy' | 'stable' | 'warning' | 'critical' | null
  setDecisionFilter: (f: 'healthy' | 'stable' | 'warning' | 'critical' | null) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  addDataOpen: boolean
  setAddDataOpen: (v: boolean) => void
  /** Engine outputs — updated by useAcpDashboardEngine */
  scopedFieldRows: AcpFieldTableRow[]
  allResults: CropAlertFieldResult[]
  kpiTotals: { totalCount: number; totalAreaHa: number; countryCount: number; byType: ReturnType<typeof import('./acpMapSpatial').buildKpiTotalsFromFeatures>['byType'] }
  chartLabels: string[]
  chartNdvi: number[]
  chartChas: number[]
  chartNdmi: number[]
  engineLoading: boolean
  structuresHydrated: boolean
  sentinelLoading: boolean
  engineError: string | null
  lastEngineRunAt: number | null
  aoiMask: GeoJSON.FeatureCollection | null
  /** Map outline — mask polygons + greenhouse types (excluded from WMS dataMask). */
  structureMapOutline: GeoJSON.FeatureCollection | null
  portalLayerCount: number
  registerEngineSnapshot: (snap: Partial<AcpEngineSnapshot>) => void
  refreshEngine: () => void
  refreshEngineRef: React.MutableRefObject<(() => void) | null>
  /** Bumped on every AOI auto-sync (weather, alerts, WMS listeners). */
  aoiSyncRevision: number
  mapHomeRef: MutableRefObject<(() => void) | null>
  mapFocusGeoJsonRef: MutableRefObject<((geojson: GeoJSON.FeatureCollection) => void) | null>
  countryFilter: string
  setCountryFilter: (c: string) => void
  layerVisibility: AcpMapLayerVisibility
  setCoreLayerVisible: (key: AcpCoreMapLayerKey, visible: boolean) => void
  setPortalLayerVisible: (layerId: string, visible: boolean) => void
  isPortalLayerVisible: (layerId: string) => boolean
  applyDashboardDefaultsFromConfig: () => void
  saveCurrentLayerDefaultsToConfig: () => void
  saveCurrentPortalLayerDefaultsToConfig: () => AcpPlatformConfig['defaultPortalLayerVisibility']
}

export type AcpEngineSnapshot = {
  scopedFieldRows: AcpFieldTableRow[]
  allResults: CropAlertFieldResult[]
  kpiTotals: AcpPlatformContextValue['kpiTotals']
  chartLabels: string[]
  chartNdvi: number[]
  chartChas: number[]
  chartNdmi: number[]
  engineLoading: boolean
  structuresHydrated: boolean
  sentinelLoading: boolean
  engineError: string | null
  lastEngineRunAt: number | null
  aoiMask: GeoJSON.FeatureCollection | null
  /** Map outline — mask polygons + greenhouse types (excluded from WMS dataMask). */
  structureMapOutline: GeoJSON.FeatureCollection | null
  portalLayerCount: number
  /** ArcGIS Country coded-value code → description (e.g. 3 → Egypt). */
  countryDescriptionMap: Map<string, string>
}

const defaultMapView: AcpMapViewState = {
  bbox: null,
  zoom: ACP_DEFAULT_MAP_ZOOM,
  center: ACP_DEFAULT_MAP_CENTER,
}

const AcpPlatformContext = createContext<AcpPlatformContextValue | null>(null)

export function AcpPlatformProvider({ children }: { children: ReactNode }) {
  const initialConfig = loadAcpPlatformConfig()
  const [config, setConfigState] = useState<AcpPlatformConfig>(() => initialConfig)
  const [alertSettings, setAlertSettingsState] = useState<CropAlertEngineSettings>(() =>
    loadAcpAlertEngineSettings(),
  )
  const [mapView, setMapView] = useState<AcpMapViewState>(defaultMapView)
  const [scopeMode, setScopeMode] = useState<AcpMapScopeMode>(() => config.mapScopeMode)
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null)
  const [locateFieldSeq, setLocateFieldSeq] = useState(0)
  const requestFieldLocate = useCallback((fieldKey: string) => {
    const key = String(fieldKey || '').trim()
    if (!key) return
    setSelectedFieldKey(key)
    setScopeMode('selection')
    setLocateFieldSeq(seq => seq + 1)
  }, [])
  const [weatherTickerFocusFieldKey, setWeatherTickerFocusFieldKey] = useState<string | null>(null)
  const [selectedWmsLayer, setSelectedWmsLayerState] = useState(() => config.wmsLayerName)
  const [analysisDate, setAnalysisDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [autoFollowDate, setAutoFollowDate] = useState(() => config.defaultAutoFollowDate)
  const [wmsParams, setWmsParams] = useState<AcpCommittedWmsParams>(() => {
    const today = new Date().toISOString().slice(0, 10)
    const cfg = loadAcpPlatformConfig()
    return {
      layerId: cfg.wmsLayerName,
      startDate: today,
      endDate: today,
      cloudCoverage: cfg.cloudCoverage,
      revision: 0,
    }
  })
  const [decisionFilter, setDecisionFilter] = useState<AcpPlatformContextValue['decisionFilter']>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addDataOpen, setAddDataOpen] = useState(false)
  const [countryFilter, setCountryFilter] = useState(() => initialConfig.defaultCountryFilter || 'all')
  const [layerVisibility, setLayerVisibility] = useState<AcpMapLayerVisibility>(() =>
    buildAcpLayerVisibilityFromDefaults(initialConfig.defaultLayerVisibility, initialConfig.defaultPortalLayerVisibility),
  )
  const [engineSnap, setEngineSnap] = useState<AcpEngineSnapshot>(() => {
    const referenceDate = new Date().toISOString().slice(0, 10)
    const hydrated = hydrateAcpCropAlertEngineSnapshot(referenceDate, referenceDate)
    return {
      scopedFieldRows: [],
      allResults: hydrated.allResults,
      kpiTotals: { totalCount: 0, totalAreaHa: 0, countryCount: 0, byType: [] },
      chartLabels: [],
      chartNdvi: [],
      chartChas: [],
      chartNdmi: [],
      engineLoading: true,
      structuresHydrated: false,
      sentinelLoading: false,
      engineError: null,
      lastEngineRunAt: hydrated.lastEngineRunAt,
      aoiMask: null,
      structureMapOutline: null,
      portalLayerCount: 0,
      countryDescriptionMap: new Map(),
    }
  })
  const refreshEngineRef = useMemo(() => ({ current: null as (() => void) | null }), [])
  const [aoiSyncRevision, setAoiSyncRevision] = useState(0)
  const mapHomeRef = useRef<(() => void) | null>(null)
  const mapFocusGeoJsonRef = useRef<((geojson: GeoJSON.FeatureCollection) => void) | null>(null)

  const setConfig = useCallback((next: AcpPlatformConfig | ((prev: AcpPlatformConfig) => AcpPlatformConfig)) => {
    setConfigState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      persistAcpPlatformConfig(resolved)
      return resolved
    })
  }, [])

  const applyConfig = useCallback(
    (patch: Partial<AcpPlatformConfig>) => {
      setConfig(prev => ({ ...prev, ...patch }))
    },
    [setConfig],
  )

  const setAlertSettings = useCallback((next: CropAlertEngineSettings) => {
    setAlertSettingsState(next)
    persistAcpAlertEngineSettings(next)
  }, [])

  const registerEngineSnapshot = useCallback((snap: Partial<AcpEngineSnapshot>) => {
    setEngineSnap(prev => {
      const next = { ...prev, ...snap }
      const maskChanged =
        snap.aoiMask !== undefined &&
        geojsonCollectionSignature(snap.aoiMask) !== geojsonCollectionSignature(prev.aoiMask)
      const outlineChanged =
        snap.structureMapOutline !== undefined &&
        geojsonCollectionSignature(snap.structureMapOutline) !==
          geojsonCollectionSignature(prev.structureMapOutline)
      const alertsChanged =
        snap.allResults !== undefined &&
        snap.allResults
          .map(r => r.fieldKey)
          .sort()
          .join('|') !==
          prev.allResults
            .map(r => r.fieldKey)
            .sort()
            .join('|')

      if (maskChanged || outlineChanged) {
        emitAcpAoiSync({
          reason: 'engine',
          signature: buildAcpAoiSyncSignature(next.aoiMask, next.structureMapOutline),
        })
      } else if (alertsChanged) {
        emitAcpAoiSync({
          reason: 'alerts',
          signature: buildAcpAoiSyncSignature(next.aoiMask, next.structureMapOutline),
        })
      }
      return next
    })
  }, [])

  useEffect(() => subscribeAcpAoiSync(() => setAoiSyncRevision(rev => rev + 1)), [])

  const refreshEngine = useCallback(() => {
    refreshEngineRef.current?.()
  }, [refreshEngineRef])

  const setCoreLayerVisible = useCallback((key: AcpCoreMapLayerKey, visible: boolean) => {
    setLayerVisibility(prev => ({ ...prev, [key]: visible }))
  }, [])

  const setPortalLayerVisible = useCallback((layerId: string, visible: boolean) => {
    setLayerVisibility(prev => ({
      ...prev,
      portal: { ...prev.portal, [layerId]: visible },
    }))
  }, [])

  const isPortalLayerVisible = useCallback(
    (layerId: string) => isAcpPortalLayerVisible(layerVisibility, layerId),
    [layerVisibility],
  )

  const applyDashboardDefaultsFromConfig = useCallback(() => {
    setLayerVisibility(
      buildAcpLayerVisibilityFromDefaults(
        config.defaultLayerVisibility,
        config.defaultPortalLayerVisibility,
      ),
    )
    setScopeMode(config.mapScopeMode)
    setAutoFollowDate(config.defaultAutoFollowDate)
    setCountryFilter(config.defaultCountryFilter || 'all')
  }, [config])

  const saveCurrentLayerDefaultsToConfig = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      defaultLayerVisibility: {
        aoi: layerVisibility.aoi,
        sentinelWms: layerVisibility.sentinelWms,
        liveChas: layerVisibility.liveChas,
        liveAlertTicker: layerVisibility.liveAlertTicker,
        weatherAlerts: layerVisibility.weatherAlerts,
      },
    }))
  }, [layerVisibility, setConfig])

  const saveCurrentPortalLayerDefaultsToConfig = useCallback((): AcpPlatformConfig['defaultPortalLayerVisibility'] => {
    return { ...layerVisibility.portal }
  }, [layerVisibility.portal])

  const commitWmsLayer = useCallback(
    (patch?: Partial<Omit<AcpCommittedWmsParams, 'revision'>>) => {
      setWmsParams(prev => ({
        layerId: patch?.layerId ?? selectedWmsLayer,
        startDate: patch?.startDate ?? analysisDate,
        endDate: patch?.endDate ?? analysisDate,
        cloudCoverage: patch?.cloudCoverage ?? config.cloudCoverage,
        revision: prev.revision + 1,
      }))
    },
    [selectedWmsLayer, analysisDate, config.cloudCoverage],
  )

  const refreshWmsLayer = useCallback(() => {
    setWmsParams(prev => ({ ...prev, revision: prev.revision + 1 }))
  }, [])

  const setSelectedWmsLayer = useCallback(
    (layer: string) => {
      setSelectedWmsLayerState(layer)
      commitWmsLayer({ layerId: layer })
    },
    [commitWmsLayer],
  )

  const value = useMemo<AcpPlatformContextValue>(
    () => ({
      config,
      setConfig,
      applyConfig,
      alertSettings,
      setAlertSettings,
      mapView,
      setMapView,
      scopeMode,
      setScopeMode,
      selectedFieldKey,
      setSelectedFieldKey,
      locateFieldSeq,
      requestFieldLocate,
      weatherTickerFocusFieldKey,
      setWeatherTickerFocusFieldKey,
      selectedWmsLayer,
      setSelectedWmsLayer,
      wmsParams,
      commitWmsLayer,
      refreshWmsLayer,
      analysisDate,
      setAnalysisDate,
      autoFollowDate,
      setAutoFollowDate,
      decisionFilter,
      setDecisionFilter,
      settingsOpen,
      setSettingsOpen,
      addDataOpen,
      setAddDataOpen,
      countryFilter,
      setCountryFilter,
      layerVisibility,
      setCoreLayerVisible,
      setPortalLayerVisible,
      isPortalLayerVisible,
      applyDashboardDefaultsFromConfig,
      saveCurrentLayerDefaultsToConfig,
      saveCurrentPortalLayerDefaultsToConfig,
      portalLayerCount: engineSnap.portalLayerCount,
      aoiSyncRevision,
      refreshEngine,
      refreshEngineRef,
      mapHomeRef,
      mapFocusGeoJsonRef,
      registerEngineSnapshot,
      ...engineSnap,
    }),
    [
      config,
      setConfig,
      applyConfig,
      alertSettings,
      setAlertSettings,
      mapView,
      scopeMode,
      selectedFieldKey,
      locateFieldSeq,
      requestFieldLocate,
      weatherTickerFocusFieldKey,
      selectedWmsLayer,
      wmsParams,
      commitWmsLayer,
      refreshWmsLayer,
      analysisDate,
      autoFollowDate,
      decisionFilter,
      settingsOpen,
      addDataOpen,
      countryFilter,
      layerVisibility,
      setCoreLayerVisible,
      setPortalLayerVisible,
      isPortalLayerVisible,
      applyDashboardDefaultsFromConfig,
      saveCurrentLayerDefaultsToConfig,
      saveCurrentPortalLayerDefaultsToConfig,
      aoiSyncRevision,
      refreshEngine,
      refreshEngineRef,
      mapHomeRef,
      mapFocusGeoJsonRef,
      registerEngineSnapshot,
      engineSnap,
    ],
  )

  return <AcpPlatformContext.Provider value={value}>{children}</AcpPlatformContext.Provider>
}

export function useAcpPlatform(): AcpPlatformContextValue {
  const ctx = useContext(AcpPlatformContext)
  if (!ctx) throw new Error('useAcpPlatform must be used within AcpPlatformProvider')
  return ctx
}

/** Optional platform context — null outside AgroCloud Platform dashboard. */
export function useOptionalAcpPlatform(): AcpPlatformContextValue | null {
  return useContext(AcpPlatformContext)
}

export type { GisContentRow }
