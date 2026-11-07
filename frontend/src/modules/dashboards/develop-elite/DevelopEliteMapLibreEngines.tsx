import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import maplibregl from 'maplibre-gl'
import { DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT } from '@/modules/gis/editing/leafletMapSketchInteraction'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { registerDevelopEliteMapLibreIntelPick } from './developEliteMapLibreIntelPick'
import { developEliteMapIntelSeedLatLng } from './developEliteMapIntelSeed'
import {
  DevelopEliteMapInsightWeatherPanel,
  useDevelopEliteMapInsight,
} from './DevelopEliteMapInsightTools'
import { useDevelopEliteMapLayerLive } from './developEliteMapLayerLiveContext'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import {
  buildDevelopEliteLayerLiveTilePlans,
  developEliteLayerLiveHasDrawnAoiClip,
} from './developEliteMapLayerLiveCore'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import {
  clearDevelopEliteLayerLiveMaplibre,
  syncDevelopEliteLayerLiveMaplibre,
} from './developEliteMapLayerLiveMaplibreMount'
import { DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT } from './developEliteDashboardEvents'
import { DEVELOP_ELITE_MAP_BASEMAP_APPLIED_EVENT } from './developEliteMapLibreBasemapOverlayRestore'
import { isDevelopEliteMapLibreStyleReady } from './developEliteMapLibreStyle'
import { applyDevelopEliteMapLibrePerformanceTuning } from './developEliteMapLibrePerformance'
import { setDevelopEliteMapLibreOverlaysInteractionPaused } from './developEliteMapLibreOverlays'
import { setDevelopEliteLayerLiveMaplibreInteractionPaused } from './developEliteMapLayerLiveMaplibreMount'

export function DevelopEliteMapLibreInteractionTune() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const container = map.getContainer()
    const mapShell = container.closest<HTMLElement>('.develop-elite-map')
    let interacting = 0
    const setInteractingChrome = (active: boolean) => {
      container.classList.toggle('develop-elite-map--interacting', active)
      mapShell?.classList.toggle('develop-elite-map--interacting', active)
    }
    const overlaysPausedForGesture = () =>
      interacting > 0 || container.classList.contains('develop-elite-map--zooming')

    const setOverlaysPaused = (paused: boolean) => {
      setDevelopEliteMapLibreOverlaysInteractionPaused(map, paused)
      setDevelopEliteLayerLiveMaplibreInteractionPaused(map, paused)
    }
    let overlayRestoreTimer = 0
    const scheduleOverlayRestore = () => {
      if (overlayRestoreTimer) window.clearTimeout(overlayRestoreTimer)
      const restore = () => {
        overlayRestoreTimer = 0
        setOverlaysPaused(overlaysPausedForGesture())
      }
      const onIdle = () => {
        map.off('idle', onIdle)
        restore()
      }
      map.once('idle', onIdle)
      overlayRestoreTimer = window.setTimeout(() => {
        map.off('idle', onIdle)
        restore()
      }, 120)
    }

    const bump = (delta: number) => {
      interacting = Math.max(0, interacting + delta)
      setInteractingChrome(interacting > 0)
    }
    const resetInteractionChrome = () => {
      interacting = 0
      setInteractingChrome(false)
      container.classList.remove('develop-elite-map--zooming')
      mapShell?.classList.remove('develop-elite-map--zooming')
      if (overlayRestoreTimer) window.clearTimeout(overlayRestoreTimer)
      overlayRestoreTimer = 0
      setOverlaysPaused(false)
    }
    const onMoveStart = () => {
      bump(1)
      if (overlayRestoreTimer) window.clearTimeout(overlayRestoreTimer)
      setOverlaysPaused(true)
    }
    const onMoveEnd = () => {
      bump(-1)
      scheduleOverlayRestore()
    }
    const onZoomStart = () => {
      container.classList.add('develop-elite-map--zooming')
      mapShell?.classList.add('develop-elite-map--zooming')
      if (overlayRestoreTimer) window.clearTimeout(overlayRestoreTimer)
      setOverlaysPaused(true)
    }
    const onZoomEnd = () => {
      container.classList.remove('develop-elite-map--zooming')
      mapShell?.classList.remove('develop-elite-map--zooming')
      scheduleOverlayRestore()
    }
    map.on('movestart', onMoveStart)
    map.on('moveend', onMoveEnd)
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    window.addEventListener(DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT, resetInteractionChrome)
    return () => {
      if (overlayRestoreTimer) window.clearTimeout(overlayRestoreTimer)
      map.off('movestart', onMoveStart)
      map.off('moveend', onMoveEnd)
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      window.removeEventListener(DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT, resetInteractionChrome)
      container.classList.remove('develop-elite-map--interacting', 'develop-elite-map--zooming')
    }
  }, [mapReady, mapRef])

  return null
}

export function DevelopEliteMapLibreGridDragLock() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const enableMap = () => {
      map.dragPan.enable()
      map.scrollZoom.enable()
      map.doubleClickZoom.enable()
      map.boxZoom.enable()
      map.touchZoomRotate.enable()
      applyDevelopEliteMapLibrePerformanceTuning(map)
    }
    const disableMap = () => {
      map.dragPan.disable()
      map.scrollZoom.disable()
      map.doubleClickZoom.disable()
      map.boxZoom.disable()
      map.touchZoomRotate.disable()
    }
    const onGridDrag = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<{ active: boolean }>).detail?.active)
      if (active) disableMap()
      else enableMap()
    }
    window.addEventListener('develop-elite-grid-drag', onGridDrag)
    return () => {
      window.removeEventListener('develop-elite-grid-drag', onGridDrag)
      enableMap()
    }
  }, [mapReady, mapRef])

  return null
}

export function DevelopEliteMapLibreResizeBridge() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    let resizeTimer = 0
    const refresh = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0
        requestAnimationFrame(() => map.resize())
      }, 100)
    }
    window.addEventListener('develop-elite-layout-changed', refresh)
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
    window.addEventListener('orientationchange', refresh)
    const root = map.getContainer()?.closest('.develop-elite-map')
    const ro =
      root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null
    if (root && ro) ro.observe(root)
    refresh()
    return () => {
      if (resizeTimer) window.clearTimeout(resizeTimer)
      window.removeEventListener('develop-elite-layout-changed', refresh)
      window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
      window.removeEventListener('orientationchange', refresh)
      ro?.disconnect()
    }
  }, [mapReady, mapRef])

  return null
}

export function DevelopEliteMapLibreTransientPin({ position }: { position: [number, number] | null }) {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const markerRef = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!position) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const [lat, lng] = position
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.className = 'develop-elite-map__libre-pin'
      el.setAttribute('aria-hidden', 'true')
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
    } else {
      markerRef.current.setLngLat([lng, lat])
    }
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [mapReady, mapRef, position])

  return null
}

export function DevelopEliteMapLibreLayerLiveEngine() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const ctx = useDevelopEliteMapLayerLive()
  const draw = useDevelopEliteMapDraw()
  const insight = useDevelopEliteMapInsight()
  const mapSwipeOpen = insight?.tool === 'swipe'
  const { clipSource, layerLiveActive, layerValue, wmsDate, cloudCoverage, setLayerLiveStatus } = ctx

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const sync = () => {
      if (!isDevelopEliteMapLibreStyleReady(map)) return
      if (!layerLiveActive || mapSwipeOpen) {
        clearDevelopEliteLayerLiveMaplibre(map)
        if (!mapSwipeOpen) setLayerLiveStatus('')
        return
      }
      const liveClip = draw?.clipGeoJson
      if (!developEliteLayerLiveHasDrawnAoiClip(liveClip)) {
        setLayerLiveStatus('Draw an AOI with Edit (DRAW) to show Layer Live inside the sketch only.')
        clearDevelopEliteLayerLiveMaplibre(map)
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
        clearDevelopEliteLayerLiveMaplibre(map)
        return
      }
      setLayerLiveStatus('')
      syncDevelopEliteLayerLiveMaplibre(map, {
        plans,
        clipSource: liveClip,
        opacity: 0.92,
      })
    }

    sync()
    map.on('style.load', sync)
    map.on('load', sync)
    window.addEventListener(DEVELOP_ELITE_MAP_BASEMAP_APPLIED_EVENT, sync)
    return () => {
      map.off('style.load', sync)
      map.off('load', sync)
      window.removeEventListener(DEVELOP_ELITE_MAP_BASEMAP_APPLIED_EVENT, sync)
      clearDevelopEliteLayerLiveMaplibre(map)
    }
  }, [
    clipSource,
    cloudCoverage,
    draw?.clipGeoJson,
    layerLiveActive,
    layerValue,
    mapReady,
    mapRef,
    mapSwipeOpen,
    setLayerLiveStatus,
    wmsDate,
  ])

  return null
}

export function DevelopEliteMapLibreInsightEngine() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const insight = useDevelopEliteMapInsight()
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) {
      setPortalHost(null)
      return
    }
    setPortalHost(map.getContainer())
  }, [mapReady, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || insight?.tool !== 'intel' || !insight.setPoint) return
    return registerDevelopEliteMapLibreIntelPick(map, (lat, lng) => insight.setPoint(lat, lng))
  }, [insight?.setPoint, insight?.tool, mapReady, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || insight?.tool !== 'intel' || !insight.setPoint) return
    const { lat, lng } = developEliteMapIntelSeedLatLng(map)
    insight.setPoint(lat, lng)
  }, [insight?.setPoint, insight?.tool, mapReady, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!insight?.point || insight.tool !== 'intel') {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const { lat, lng } = insight.point
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.className = 'develop-elite-map__insight-pick-marker'
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
    } else {
      markerRef.current.setLngLat([lng, lat])
    }
  }, [insight?.point, insight?.tool, mapReady, mapRef])

  if (!insight || !portalHost || insight.tool !== 'intel') return null

  return createPortal(<DevelopEliteMapInsightWeatherPanel insight={insight} />, portalHost)
}
