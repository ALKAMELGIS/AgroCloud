import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGfsRasterTimeline } from './useGfsRasterTimeline'
import type { WeatherMapMode } from '../config/weatherMapModes'
import type { WeatherPrecipWindow, WeatherVizMode } from '../config/weatherVizModes'
import {
  loadWeatherOperationsThresholds,
  subscribeWeatherOperationsThresholds,
} from '../config/weatherThresholds'
import { buildWeatherAlerts } from '../analysis/buildWeatherAlerts'
import { computeFarmWeatherStats } from '../analysis/farmWeatherStats'
import { buildOperationalWeatherIndicators } from '../insights/buildOperationalWeatherIndicators'
import { isWeatherClimateMapModeAvailable } from '../config/weatherPhase2Layers'
import { useWeatherMonitoringData, type WeatherMobileTab } from './useWeatherMonitoringData'

const AUTO_REFRESH_MS = 15 * 60_000

export type WeatherIntelligenceStateOptions = {
  /** Viewport IDW raster from Open-Meteo (hourly grid); disables GFS tile timeline when true. */
  preferOpenMeteoRaster?: boolean
}

function formatHourlyTimelineLabel(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function useWeatherIntelligenceState(options: WeatherIntelligenceStateOptions = {}) {
  const preferOpenMeteoRaster = options.preferOpenMeteoRaster ?? false
  const base = useWeatherMonitoringData()
  const [mapMode, setMapMode] = useState<WeatherMapMode>('weather')
  const [vizMode, setVizMode] = useState<WeatherVizMode>('animated')
  const [precipWindow, setPrecipWindow] = useState<WeatherPrecipWindow>('6h')
  const [timelineHourIndex, setTimelineHourIndex] = useState(0)
  const [windAnimPlaying, setWindAnimPlaying] = useState(false)
  const [layerManagerOpen, setLayerManagerOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<GeoJSON.Feature | null>(null)
  const [compareFarmIds, setCompareFarmIds] = useState<string[]>([])
  const [thresholds, setThresholds] = useState(loadWeatherOperationsThresholds)

  useEffect(() => subscribeWeatherOperationsThresholds(() => setThresholds(loadWeatherOperationsThresholds())), [])

  useEffect(() => {
    if (mapMode === 'climate' && !isWeatherClimateMapModeAvailable()) {
      setMapMode('weather')
    }
  }, [mapMode])

  const gfs = useGfsRasterTimeline()
  const hourly = base.bundle?.hourlyForecast ?? []
  const useGfsTimeline = !preferOpenMeteoRaster && gfs.validTimes.length > 0
  const rasterFrameCount = useGfsTimeline
    ? Math.min(gfs.validTimes.length, 120)
    : Math.min(hourly.length, 48)

  const mapTimeIso = useGfsTimeline
    ? gfs.pickFrameTime(timelineHourIndex % Math.max(1, rasterFrameCount))
    : hourly[timelineHourIndex]?.time ?? base.bundle?.snapshot?.observedAt

  const mapTimeIsoNext =
    rasterFrameCount >= 2 && windAnimPlaying
      ? useGfsTimeline
        ? gfs.nextFrameTime(timelineHourIndex % rasterFrameCount)
        : hourly[(timelineHourIndex + 1) % rasterFrameCount]?.time
      : undefined

  const rasterTimelineLabels = useGfsTimeline
    ? gfs.labels.length
      ? gfs.labels
      : undefined
    : hourly.length
      ? hourly.map(h => formatHourlyTimelineLabel(h.time))
      : undefined

  useEffect(() => {
    if (!rasterFrameCount || timelineHourIndex < rasterFrameCount) return
    setTimelineHourIndex(0)
  }, [rasterFrameCount, timelineHourIndex])

  useEffect(() => {
    const id = window.setInterval(() => {
      void base.refreshWeather()
      gfs.refreshMeta()
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [base.refreshWeather, gfs.refreshMeta])

  const animRef = useRef<number | null>(null)
  useEffect(() => {
    if (!windAnimPlaying || rasterFrameCount < 2) {
      gfs.setRasterBlend(0)
      if (animRef.current != null) cancelAnimationFrame(animRef.current)
      animRef.current = null
      return
    }
    const frameMs = 1400
    let start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / frameMs
      if (t >= 1) {
        setTimelineHourIndex(i => (i + 1) % rasterFrameCount)
        gfs.setRasterBlend(0)
        start = now
      } else {
        gfs.setRasterBlend(t)
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current)
      animRef.current = null
      gfs.setRasterBlend(0)
    }
  }, [windAnimPlaying, rasterFrameCount, gfs.setRasterBlend])

  useEffect(() => {
    if (!windAnimPlaying || rasterFrameCount >= 2) return
    const id = window.setInterval(() => {
      setTimelineHourIndex(i => (i + 1) % Math.max(1, rasterFrameCount))
    }, 1100)
    return () => window.clearInterval(id)
  }, [windAnimPlaying, rasterFrameCount])

  const indicators = useMemo(
    () =>
      buildOperationalWeatherIndicators(
        base.bundle,
        thresholds,
        base.loadingWeather,
        base.weatherError,
      ),
    [base.bundle, base.loadingWeather, base.weatherError, thresholds],
  )

  const alerts = useMemo(
    () => buildWeatherAlerts(base.bundle, base.queryPoint.label, thresholds),
    [base.bundle, base.queryPoint.label, thresholds],
  )

  const farmStats = useMemo(() => computeFarmWeatherStats(base.bundle), [base.bundle])

  const setMobileTab = useCallback(
    (tab: WeatherMobileTab | 'analysis' | 'stats') => {
      if (tab === 'analysis' || tab === 'stats') {
        base.setMobileTab('map')
        setMapMode('analysis')
        return
      }
      base.setMobileTab(tab)
    },
    [base],
  )

  const mobileTab = base.mobileTab

  return {
    ...base,
    indicators,
    alerts,
    farmStats,
    mapMode,
    setMapMode,
    vizMode,
    setVizMode,
    precipWindow,
    setPrecipWindow,
    timelineHourIndex,
    setTimelineHourIndex,
    mapTimeIso,
    mapTimeIsoNext,
    rasterBlend: gfs.rasterBlend,
    gfsRasterMeta: gfs.meta,
    rasterTimelineLabels,
    preferOpenMeteoRaster,
    windAnimPlaying,
    setWindAnimPlaying,
    layerManagerOpen,
    setLayerManagerOpen,
    advancedOpen,
    setAdvancedOpen,
    selectedField,
    setSelectedField,
    compareFarmIds,
    setCompareFarmIds,
    thresholds,
    setThresholds,
    mobileTab,
    setMobileTab,
  }
}
