import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import maplibregl from 'maplibre-gl'
import { Link } from 'react-router-dom'
import { DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT } from '@/modules/gis/editing/leafletMapSketchInteraction'
import { wmoWeatherIconClass } from '@/modules/remote-sensing/weather/openMeteoWeather'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { registerDevelopEliteMapLibreIntelPick } from './developEliteMapLibreIntelPick'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
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
import { isDevelopEliteMapLibreStyleReady } from './developEliteMapLibreStyle'
import { applyDevelopEliteMapLibrePerformanceTuning } from './developEliteMapLibrePerformance'

export function DevelopEliteMapLibreInteractionTune() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const container = map.getContainer()
    let interacting = 0
    const bump = (delta: number) => {
      interacting = Math.max(0, interacting + delta)
      container.classList.toggle('develop-elite-map--interacting', interacting > 0)
    }
    const resetInteractionChrome = () => {
      interacting = 0
      container.classList.remove('develop-elite-map--interacting', 'develop-elite-map--zooming')
    }
    const onMoveStart = () => bump(1)
    const onMoveEnd = () => bump(-1)
    const onZoomStart = () => container.classList.add('develop-elite-map--zooming')
    const onZoomEnd = () => container.classList.remove('develop-elite-map--zooming')
    map.on('movestart', onMoveStart)
    map.on('moveend', onMoveEnd)
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    window.addEventListener(DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT, resetInteractionChrome)
    return () => {
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
    const refresh = () => requestAnimationFrame(() => map.resize())
    window.addEventListener('develop-elite-layout-changed', refresh)
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
    window.addEventListener('orientationchange', refresh)
    const root = map.getContainer()?.closest('.develop-elite-map')
    const ro =
      root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null
    if (root && ro) ro.observe(root)
    refresh()
    return () => {
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
      const liveClip = draw?.clipGeoJson ?? clipSource
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
    let layerLiveRaf = 0
    const scheduleLayerLiveSync = () => {
      if (layerLiveRaf) cancelAnimationFrame(layerLiveRaf)
      layerLiveRaf = requestAnimationFrame(() => {
        layerLiveRaf = 0
        if (typeof map.isMoving === 'function' && map.isMoving()) return
        sync()
      })
    }
    map.on('moveend', scheduleLayerLiveSync)
    map.on('zoomend', scheduleLayerLiveSync)
    return () => {
      if (layerLiveRaf) cancelAnimationFrame(layerLiveRaf)
      map.off('moveend', scheduleLayerLiveSync)
      map.off('zoomend', scheduleLayerLiveSync)
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || insight?.tool !== 'intel' || !insight.setPoint) return
    return registerDevelopEliteMapLibreIntelPick(map, (lat, lng) => insight.setPoint(lat, lng))
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

  const map = mapRef.current
  const host = map?.getContainer()
  if (!insight || !host || insight.tool !== 'intel') return null

  const stopMapEvent = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  return createPortal(
    <aside
      className="develop-elite-map__insight-panel"
      aria-label="Open-Meteo weather"
      onPointerDown={stopMapEvent}
      onClick={stopMapEvent}
      onDoubleClick={stopMapEvent}
    >
      <p className="develop-elite-map__insight-panel-title">Open-Meteo</p>
      {!insight.point ? <p>Click the map to read weather at that point.</p> : null}
      {insight.weatherStatus === 'loading' ? <p>Loading forecast…</p> : null}
      {insight.weatherStatus === 'error' ? <p>{insight.weatherError}</p> : null}
      {insight.snapshot ? (
        <div className="develop-elite-map__insight-wx">
          <i className={wmoWeatherIconClass(insight.snapshot.weatherCode)} aria-hidden />
          <strong>
            {insight.snapshot.temperatureC != null ? `${Math.round(insight.snapshot.temperatureC)}°C` : '—'}
          </strong>
          <span>{insight.snapshot.conditionLabel}</span>
          <span>
            {insight.point ? `${insight.point.lat.toFixed(3)}, ${insight.point.lng.toFixed(3)}` : ''}
          </span>
          {insight.point ? (
            <Link
              className="develop-elite-map__insight-wi-link"
              to={`/weather/intelligence?lat=${insight.point.lat}&lng=${insight.point.lng}`}
            >
              Open Weather Intelligence
            </Link>
          ) : null}
        </div>
      ) : null}
    </aside>,
    host,
  )
}
