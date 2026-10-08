import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Map as LeafletMap } from 'leaflet'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import {
  SI_DEFAULT_LIVE_WMS_LAYER,
  type SentinelHubWmsLayerInfo,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import {
  clearDevelopEliteLayerLiveMounted,
  syncDevelopEliteLayerLiveMounted,
  type DevelopEliteLayerLiveMountedEntry,
} from './developEliteMapLayerLiveMount'
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
import {
  DevelopEliteMapLayerLiveContext,
  useDevelopEliteMapLayerLive,
  type DevelopEliteMapLayerLiveContextValue,
} from './developEliteMapLayerLiveContext'

export { useDevelopEliteMapLayerLive } from './developEliteMapLayerLiveContext'

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
  const [layerLiveLegendOpen, setLayerLiveLegendOpen] = useState(false)

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

  const toggleLayerLiveLegend = useCallback(() => {
    setLayerLiveLegendOpen(open => {
      const next = !open
      if (next && developEliteLayerLiveHasDrawnAoiClip(primaryClip)) {
        setLayerLiveActive(true)
        setLayerLiveStatus('')
      }
      return next
    })
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
    (): DevelopEliteMapLayerLiveContextValue => ({
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
      layerLiveLegendOpen,
      toggleLayerLiveLegend,
      setLayerLiveLegendOpen,
    }),
    [
      clipSource,
      cloudCoverage,
      layerLiveLegendOpen,
      toggleLayerLiveLegend,
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

export function DevelopEliteMapLayerLiveEngine() {
  const map = useMap()
  const ctx = useDevelopEliteMapLayerLive()
  const draw = useDevelopEliteMapDraw()
  const insight = useDevelopEliteMapInsight()
  const mapSwipeOpen = insight?.tool === 'swipe'
  const { clipSource, layerLiveActive, layerValue, wmsDate, cloudCoverage, setLayerLiveStatus } = ctx
  const mountedRef = useRef<DevelopEliteLayerLiveMountedEntry[]>([])
  const drawClipSignature = draw?.clipGeoJson ? JSON.stringify(draw.clipGeoJson) : ''

  const syncTiles = useCallback(() => {
    ensureLayerLivePane(map)

    if (!layerLiveActive || mapSwipeOpen) {
      clearDevelopEliteLayerLiveMounted(map, mountedRef.current)
      mountedRef.current = []
      if (!mapSwipeOpen) setLayerLiveStatus('')
      return
    }

    const liveClip = draw?.clipGeoJson ?? clipSource
    if (!developEliteLayerLiveHasDrawnAoiClip(liveClip)) {
      setLayerLiveStatus('Draw an AOI with Edit (DRAW) to show Layer Live inside the sketch only.')
      clearDevelopEliteLayerLiveMounted(map, mountedRef.current)
      mountedRef.current = []
      return
    }

    const plans = buildDevelopEliteLayerLiveTilePlans({
      layerId: layerValue,
      isoDate: wmsDate,
      clipSource: liveClip,
      cloudCoverage,
    })
    const aoiBounds = resolveSiSentinelAoiWmsBoundsLngLat(liveClip)

    if (!plans.length || !aoiBounds) {
      setLayerLiveStatus(
        'Cannot load imagery for this drawn AOI — check Sentinel Hub credentials or pick another date.',
      )
      clearDevelopEliteLayerLiveMounted(map, mountedRef.current)
      mountedRef.current = []
      return
    }

    setLayerLiveStatus('')
    const lat = map.getCenter().lat
    mountedRef.current = syncDevelopEliteLayerLiveMounted(
      map,
      {
        pane: DEVELOP_ELITE_LAYER_LIVE_PANE,
        plans,
        clipSource: liveClip,
        latitudeDeg: lat,
        opacity: 0.92,
      },
      mountedRef.current,
    )

    const imageEntry = mountedRef.current.find(e => e.kind === 'image')
    if (imageEntry?.kind === 'image') {
      imageEntry.layer.off('error')
      imageEntry.layer.on('error', () => {
        setLayerLiveStatus(
          `${layerValue || 'Index'} failed to load — verify Sentinel Hub token and imagery date.`,
        )
      })
      imageEntry.layer.once('load', () => setLayerLiveStatus(''))
    }
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
      clearDevelopEliteLayerLiveMounted(map, mountedRef.current)
      mountedRef.current = []
    }
  }, [map, syncTiles])

  useEffect(() => {
    if (!layerLiveActive || mapSwipeOpen) return
    const onViewport = () => syncTiles()
    map.on('zoomend', onViewport)
    map.on('moveend', onViewport)
    return () => {
      map.off('zoomend', onViewport)
      map.off('moveend', onViewport)
    }
  }, [layerLiveActive, map, mapSwipeOpen, syncTiles])

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
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const fc = draw?.clipGeoJson
    const sig = fc?.features?.length ? JSON.stringify(fc) : ''
    if (!sig) {
      lastSketchSigRef.current = ''
      return
    }
    if (sig === lastSketchSigRef.current) return
    lastSketchSigRef.current = sig
    if (layerLiveActive) return
    const frame = window.requestAnimationFrame(() => {
      if (drawRef.current?.activeTool) return
      activateLayerLive()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activateLayerLive, draw?.activeTool, draw?.clipGeoJson, layerLiveActive])

  return null
}

export { DevelopEliteMapLayerLivePanel } from './DevelopEliteMapLayerLivePanel'

