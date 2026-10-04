import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Map as LeafletMap, TileLayer } from 'leaflet'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import { RemoteSensingLayerLiveStrip } from '@/modules/remote-sensing/imagery/RemoteSensingLayerLiveStrip'
import '@/modules/remote-sensing/imagery/RemoteSensingPanel.css'
import {
  SI_DEFAULT_LIVE_WMS_LAYER,
  SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
  type SentinelHubWmsLayerInfo,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import {
  createSentinelHubBboxTileLayer,
  updateSentinelHubBboxTileLayerUrl,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'
import {
  buildDevelopEliteLayerLiveLayerGroups,
  buildDevelopEliteLayerLiveTilePlans,
  DEVELOP_ELITE_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE,
  DEVELOP_ELITE_LAYER_LIVE_PANE,
  DEVELOP_ELITE_LAYER_LIVE_PANE_Z_INDEX,
  developEliteDefaultImageryIsoDate,
  fetchDevelopEliteSentinelWmsCatalog,
  developEliteLayerLiveHasDrawnAoiClip,
  resolveDevelopEliteLayerLiveClipSource,
} from './developEliteMapLayerLiveCore'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'

type LayerLiveContextValue = {
  clipSource: unknown
  wmsDate: string
  onWmsDateChange: (iso: string) => void
  onResetImageryDateAuto: () => void
  imageryDateAutoFollow: boolean
  isFetchingSentinelScenes: boolean
  layerGroups: ReturnType<typeof buildDevelopEliteLayerLiveLayerGroups>
  layerValue: string
  onLayerChange: (layerId: string) => void
  isLoadingLayers: boolean
  layerLiveActive: boolean
  hasDrawnAoiClip: boolean
  onToggleLayerLive: () => void
  activateLayerLive: () => void
  layerLiveTitle: string
  layerLiveStatus: string
  setLayerLiveStatus: (message: string) => void
  cloudCoverage: number
  onCloudCoverageChange: (value: number) => void
}

const DevelopEliteMapLayerLiveContext = createContext<LayerLiveContextValue | null>(null)

export function useDevelopEliteMapLayerLive(): LayerLiveContextValue {
  const ctx = useContext(DevelopEliteMapLayerLiveContext)
  if (!ctx) {
    throw new Error('useDevelopEliteMapLayerLive must be used within DevelopEliteMapLayerLiveProvider')
  }
  return ctx
}

type ProviderProps = {
  /** Drawn AOI sketch (preferred for Layer Live dataMask clip). */
  primaryClip: unknown
  /** Portfolio / structures fallback when sketch is missing or not render-ready. */
  fallbackClip: unknown
  children: ReactNode
}

export function DevelopEliteMapLayerLiveProvider({ primaryClip, fallbackClip, children }: ProviderProps) {
  const [catalog, setCatalog] = useState<SentinelHubWmsLayerInfo[]>([])
  const [isLoadingLayers, setIsLoadingLayers] = useState(true)
  const [layerId, setLayerId] = useState(SI_DEFAULT_LIVE_WMS_LAYER)
  const [wmsDate, setWmsDate] = useState(() => developEliteDefaultImageryIsoDate())
  const [imageryDateAutoFollow, setImageryDateAutoFollow] = useState(true)
  const [layerLiveActive, setLayerLiveActive] = useState(false)
  const [layerLiveStatus, setLayerLiveStatus] = useState('')
  const [cloudCoverage, setCloudCoverage] = useState(DEVELOP_ELITE_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE)

  useEffect(() => {
    const ac = new AbortController()
    const timeoutId = window.setTimeout(() => ac.abort(), 18_000)
    setIsLoadingLayers(true)
    void fetchDevelopEliteSentinelWmsCatalog(ac.signal)
      .then(next => {
        if (!ac.signal.aborted) setCatalog(next)
      })
      .catch(() => {
        if (!ac.signal.aborted) setCatalog([])
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoadingLayers(false)
      })
    return () => {
      ac.abort()
      window.clearTimeout(timeoutId)
    }
  }, [])

  const layerGroups = useMemo(() => buildDevelopEliteLayerLiveLayerGroups(catalog), [catalog])

  const hasDrawnAoiClip = useMemo(
    () => developEliteLayerLiveHasDrawnAoiClip(primaryClip),
    [primaryClip],
  )

  const clipSource = useMemo(
    () => resolveDevelopEliteLayerLiveClipSource(primaryClip, fallbackClip, layerId),
    [fallbackClip, layerId, primaryClip],
  )

  useEffect(() => {
    if (!hasDrawnAoiClip && layerLiveActive) {
      setLayerLiveActive(false)
      setLayerLiveStatus('Draw an AOI with Edit (DRAW) to show Layer Live inside the sketch only.')
    }
  }, [hasDrawnAoiClip, layerLiveActive])

  useEffect(() => {
    if (!layerGroups.length) return
    const flat = layerGroups.flatMap(g => g.options)
    if (flat.some(o => o.id === layerId || o.id.toUpperCase() === layerId.toUpperCase())) return
    const ndvi = flat.find(o => o.id.toUpperCase() === 'NDVI')
    setLayerId(ndvi?.id ?? flat[0]!.id)
  }, [layerGroups, layerId])

  const onWmsDateChange = useCallback((iso: string) => {
    setImageryDateAutoFollow(false)
    setWmsDate(iso.slice(0, 10))
  }, [])

  const onResetImageryDateAuto = useCallback(() => {
    setImageryDateAutoFollow(true)
    setWmsDate(developEliteDefaultImageryIsoDate())
  }, [])

  const onToggleLayerLive = useCallback(() => {
    setLayerLiveActive(prev => {
      if (prev) {
        setLayerLiveStatus('')
        return false
      }
      if (!developEliteLayerLiveHasDrawnAoiClip(primaryClip)) {
        setLayerLiveStatus('Draw an AOI with Edit (DRAW) to show Layer Live inside the sketch only.')
        return false
      }
      setLayerLiveStatus('')
      return true
    })
  }, [primaryClip])

  const activateLayerLive = useCallback(() => {
    if (!developEliteLayerLiveHasDrawnAoiClip(primaryClip)) return
    setLayerLiveActive(true)
    setLayerLiveStatus('')
  }, [primaryClip])

  const onCloudCoverageChange = useCallback((value: number) => {
    setCloudCoverage(Math.max(0, Math.min(100, Math.round(value))))
  }, [])

  const layerLiveTitle = !hasDrawnAoiClip
    ? 'Draw an AOI first — Layer Live shows index imagery inside the sketch only'
    : layerLiveActive
      ? `Hide ${layerId || 'index'} inside drawn AOI`
      : `Show ${layerId || 'index'} inside drawn AOI (Layer Live)`

  const value = useMemo(
    (): LayerLiveContextValue => ({
      clipSource,
      wmsDate,
      onWmsDateChange,
      onResetImageryDateAuto,
      imageryDateAutoFollow,
      isFetchingSentinelScenes: false,
      layerGroups,
      layerValue: layerId,
      onLayerChange: setLayerId,
      isLoadingLayers,
      layerLiveActive,
      hasDrawnAoiClip,
      onToggleLayerLive,
      activateLayerLive,
      layerLiveTitle,
      layerLiveStatus,
      setLayerLiveStatus,
      cloudCoverage,
      onCloudCoverageChange,
    }),
    [
      clipSource,
      cloudCoverage,
      hasDrawnAoiClip,
      imageryDateAutoFollow,
      isLoadingLayers,
      layerGroups,
      layerId,
      activateLayerLive,
      layerLiveActive,
      layerLiveStatus,
      layerLiveTitle,
      onCloudCoverageChange,
      onResetImageryDateAuto,
      onToggleLayerLive,
      onWmsDateChange,
      setLayerLiveStatus,
      wmsDate,
    ],
  )

  return (
    <DevelopEliteMapLayerLiveContext.Provider value={value}>{children}</DevelopEliteMapLayerLiveContext.Provider>
  )
}

function ensureLayerLivePane(map: LeafletMap): HTMLElement {
  const name = DEVELOP_ELITE_LAYER_LIVE_PANE
  if (!map.getPane(name)) {
    const pane = map.createPane(name)
    pane.style.zIndex = String(DEVELOP_ELITE_LAYER_LIVE_PANE_Z_INDEX)
  } else {
    map.getPane(name)!.style.zIndex = String(DEVELOP_ELITE_LAYER_LIVE_PANE_Z_INDEX)
  }
  return map.getPane(name)!
}

type MountedLiveEntry = { layer: TileLayer; url: string }

function clearMountedLayerLive(map: LeafletMap, mounted: MountedLiveEntry[]) {
  for (const entry of mounted) {
    map.removeLayer(entry.layer)
  }
}

export function DevelopEliteMapLayerLiveEngine() {
  const map = useMap()
  const ctx = useDevelopEliteMapLayerLive()
  const draw = useDevelopEliteMapDraw()
  const insight = useDevelopEliteMapInsight()
  const mapSwipeOpen = insight?.tool === 'swipe'
  const { clipSource, layerLiveActive, layerValue, wmsDate, cloudCoverage, setLayerLiveStatus } = ctx
  const mountedRef = useRef<MountedLiveEntry[]>([])
  const tileErrorTimerRef = useRef<number | null>(null)
  const sawTileLoadRef = useRef(false)
  const drawClipSignature = draw?.clipGeoJson ? JSON.stringify(draw.clipGeoJson) : ''

  const syncTiles = useCallback(() => {
    ensureLayerLivePane(map)

    if (!layerLiveActive || mapSwipeOpen) {
      clearMountedLayerLive(map, mountedRef.current)
      mountedRef.current = []
      if (!mapSwipeOpen) setLayerLiveStatus('')
      return
    }

    if (!developEliteLayerLiveHasDrawnAoiClip(draw?.clipGeoJson)) {
      setLayerLiveStatus('Draw an AOI with Edit (DRAW) to show Layer Live inside the sketch only.')
      clearMountedLayerLive(map, mountedRef.current)
      mountedRef.current = []
      return
    }

    const plans = buildDevelopEliteLayerLiveTilePlans({
      layerId: layerValue,
      isoDate: wmsDate,
      clipSource,
      cloudCoverage,
    })
    const aoiBounds = resolveSiSentinelAoiWmsBoundsLngLat(clipSource ?? draw?.clipGeoJson)

    if (!plans.length || !aoiBounds) {
      setLayerLiveStatus(
        'Cannot load imagery for this drawn AOI — check Sentinel Hub credentials or pick another date.',
      )
      clearMountedLayerLive(map, mountedRef.current)
      mountedRef.current = []
      return
    }

    setLayerLiveStatus('')
    sawTileLoadRef.current = false
    if (tileErrorTimerRef.current != null) {
      window.clearTimeout(tileErrorTimerRef.current)
      tileErrorTimerRef.current = null
    }

    const lat = map.getCenter().lat
    const nextMounted: MountedLiveEntry[] = []

    const scheduleLoadFailureStatus = () => {
      if (tileErrorTimerRef.current != null) window.clearTimeout(tileErrorTimerRef.current)
      tileErrorTimerRef.current = window.setTimeout(() => {
        tileErrorTimerRef.current = null
        if (!sawTileLoadRef.current) {
          setLayerLiveStatus(
            `${layerValue || 'Index'} failed to load — verify Sentinel Hub token and imagery date.`,
          )
        }
      }, 12_000)
    }

    let watchTileLoad = false

    plans.forEach((plan, planIndex) => {
      const prev = mountedRef.current[planIndex]
      if (prev && map.hasLayer(prev.layer)) {
        if (prev.url === plan.url) {
          nextMounted.push(prev)
          return
        }
        updateSentinelHubBboxTileLayerUrl(prev.layer, plan.url)
        nextMounted.push({ layer: prev.layer, url: plan.url })
        watchTileLoad = true
        return
      }

      watchTileLoad = true
      const layer = createSentinelHubBboxTileLayer(plan.url, {
        pane: DEVELOP_ELITE_LAYER_LIVE_PANE,
        opacity: 0.9,
        stableDuringInteraction: true,
        minZoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
        latitudeDeg: lat,
        crossOrigin: null,
      })
      layer.on('tileload', () => {
        sawTileLoadRef.current = true
        setLayerLiveStatus('')
        if (tileErrorTimerRef.current != null) {
          window.clearTimeout(tileErrorTimerRef.current)
          tileErrorTimerRef.current = null
        }
      })
      layer.on('tileerror', scheduleLoadFailureStatus)
      layer.addTo(map)
      nextMounted.push({ layer, url: plan.url })
    })

    for (const entry of mountedRef.current) {
      if (!nextMounted.some(n => n.layer === entry.layer)) {
        map.removeLayer(entry.layer)
      }
    }
    mountedRef.current = nextMounted
    if (watchTileLoad) scheduleLoadFailureStatus()
  }, [
    clipSource,
    cloudCoverage,
    draw?.clipGeoJson,
    drawClipSignature,
    layerLiveActive,
    layerValue,
    map,
    mapSwipeOpen,
    setLayerLiveStatus,
    wmsDate,
  ])

  useEffect(() => {
    syncTiles()
    return () => {
      if (tileErrorTimerRef.current != null) {
        window.clearTimeout(tileErrorTimerRef.current)
        tileErrorTimerRef.current = null
      }
      clearMountedLayerLive(map, mountedRef.current)
      mountedRef.current = []
    }
  }, [map, syncTiles])

  useEffect(() => {
    if (!layerLiveActive) return
    syncTiles()
  }, [drawClipSignature, layerLiveActive, syncTiles])

  return null
}

/** Fade AOI sketch fill while Layer Live paints NDVI inside the clip mask. */
export function DevelopEliteMapLayerLiveSketchDimBridge() {
  const draw = useDevelopEliteMapDraw()
  const { layerLiveActive } = useDevelopEliteMapLayerLive()

  useEffect(() => {
    const fg = draw?.featureGroupRef.current
    if (!fg) return
    const fillOpacity = layerLiveActive ? 0.05 : 0.2
    fg.eachLayer(layer => {
      const path = layer as L.Path
      if (typeof path.setStyle === 'function') path.setStyle({ fillOpacity })
    })
  }, [draw, draw?.clipGeoJson, layerLiveActive])

  return null
}

/** Turn on Layer Live when the user finishes a DRAW AOI so dataMask clips to the sketch. */
export function DevelopEliteMapLayerLiveDrawBridge() {
  const draw = useDevelopEliteMapDraw()
  const { layerLiveActive, activateLayerLive } = useDevelopEliteMapLayerLive()
  const lastSketchSigRef = useRef('')

  useEffect(() => {
    const fc = draw?.clipGeoJson
    const sig = fc?.features?.length ? JSON.stringify(fc) : ''
    if (!sig) {
      lastSketchSigRef.current = ''
      return
    }
    if (sig === lastSketchSigRef.current) return
    lastSketchSigRef.current = sig
    if (!layerLiveActive) activateLayerLive()
  }, [activateLayerLive, draw?.clipGeoJson, layerLiveActive])

  return null
}

export function DevelopEliteMapLayerLivePanel() {
  const {
    layerLiveStatus,
    wmsDate,
    onWmsDateChange,
    onResetImageryDateAuto,
    imageryDateAutoFollow,
    isFetchingSentinelScenes,
    layerGroups,
    layerValue,
    onLayerChange,
    isLoadingLayers,
    layerLiveActive,
    hasDrawnAoiClip,
    onToggleLayerLive,
    layerLiveTitle,
    cloudCoverage,
    onCloudCoverageChange,
  } = useDevelopEliteMapLayerLive()
  return (
    <div className="develop-elite-map__si-rs-panel si-rs-panel si-rs-panel--flat">
      <RemoteSensingLayerLiveStrip
        className="develop-elite-map__si-strip"
        layerSelectMenuPortal
        layerSelectRootClassName="si-rs-panel-select"
        layerSelectMenuClassName="develop-elite-map__layer-select-menu"
        wmsDate={wmsDate}
        onWmsDateChange={onWmsDateChange}
        onResetImageryDateAuto={onResetImageryDateAuto}
        imageryDateAutoFollow={imageryDateAutoFollow}
        isFetchingSentinelScenes={isFetchingSentinelScenes}
        layerGroups={layerGroups}
        layerValue={layerValue}
        onLayerChange={onLayerChange}
        isLoadingLayers={isLoadingLayers}
        layerLiveActive={layerLiveActive}
        layerLiveDisabled={!hasDrawnAoiClip}
        onToggleLayerLive={onToggleLayerLive}
        layerLiveTitle={layerLiveTitle}
        cloudCoverage={cloudCoverage}
        onCloudCoverageChange={onCloudCoverageChange}
      />
      {layerLiveStatus ? (
        <p className="develop-elite-map__layer-live-status" role="status">{layerLiveStatus}</p>
      ) : null}
    </div>
  )
}

