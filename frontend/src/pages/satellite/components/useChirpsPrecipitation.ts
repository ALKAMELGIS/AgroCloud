import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchChirpsRaster,
  fetchChirpsTimeseries,
  type ChirpsRasterResponse,
  type ChirpsTimeseriesResponse,
} from '../../../lib/chirpsRainfall/chirpsClient'
import {
  CHIRPS_LAYER_ID,
  type ChirpsAggregation,
  type ChirpsAnalytics,
} from '../../../lib/chirpsRainfall/chirpsIndices'
import {
  buildChirpsAnalyticsFromTimeseries,
  exportChirpsCsv,
  exportChirpsExcel,
  exportChirpsGeoTiffZip,
} from '../../../lib/chirpsRainfall/chirpsExports'
import { exportChirpsHtmlReport } from '../../../lib/chirpsRainfall/chirpsReportDoc'
import { maskChirpsRasterToPolygon } from '../../../lib/chirpsRainfall/chirpsRasterMask'

export { CHIRPS_LAYER_ID }

type Params = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  enabled: boolean
  sceneDate: string
  seriesStart?: string
  seriesEnd?: string
  aoiName?: string
  ndmi?: number | null
  ndwi?: number | null
}

export function useChirpsPrecipitation({
  geometry,
  enabled,
  sceneDate,
  seriesStart,
  seriesEnd,
  aoiName,
  ndmi,
  ndwi,
}: Params) {
  const [aggregation, setAggregation] = useState<ChirpsAggregation>('daily')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [raster, setRaster] = useState<ChirpsRasterResponse | null>(null)
  const [timeseries, setTimeseries] = useState<ChirpsTimeseriesResponse | null>(null)
  const [heatVisible, setHeatVisible] = useState(true)
  const [opacity, setOpacity] = useState(0.85)
  const abortRef = useRef<AbortController | null>(null)

  const hasAoi = !!(geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'))

  const analytics: ChirpsAnalytics | null = useMemo(() => {
    if (!timeseries) return null
    return buildChirpsAnalyticsFromTimeseries(timeseries, { ndmi, ndwi })
  }, [timeseries, ndmi, ndwi])

  const run = useCallback(async () => {
    if (!geometry || !hasAoi) {
      setError('Draw an AOI polygon first')
      setStatus('error')
      return
    }
    const date = String(sceneDate || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Select a valid imagery / analysis date')
      setStatus('error')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setStatus('loading')
    setError(null)
    try {
      const end = (seriesEnd || date).slice(0, 10)
      let start = (seriesStart || date).slice(0, 10)
      // Default lookback for analytics when start≈end
      if (start === end) {
        const d = new Date(`${end}T00:00:00Z`)
        if (aggregation === 'daily') d.setUTCDate(d.getUTCDate() - 29)
        else if (aggregation === 'monthly') d.setUTCMonth(d.getUTCMonth() - 11)
        else if (aggregation === 'seasonal') d.setUTCMonth(d.getUTCMonth() - 2)
        else d.setUTCFullYear(d.getUTCFullYear() - 4)
        start = d.toISOString().slice(0, 10)
      }

      const [rRaw, ts] = await Promise.all([
        fetchChirpsRaster({
          geometry,
          date,
          aggregation,
          signal: ac.signal,
        }),
        fetchChirpsTimeseries({
          geometry,
          start,
          end,
          aggregation,
          signal: ac.signal,
        }),
      ])
      if (ac.signal.aborted) return
      // Clip preview to the drawn AOI polygon (API returns bbox window).
      const r = maskChirpsRasterToPolygon(rRaw, geometry)
      setRaster(r)
      setTimeseries(ts)
      setHeatVisible(true)
      setStatus('done')
    } catch (e) {
      if (ac.signal.aborted) return
      setRaster(null)
      setTimeseries(null)
      setStatus('error')
      setError(e instanceof Error ? e.message : 'CHIRPS load failed')
    }
  }, [geometry, hasAoi, sceneDate, seriesStart, seriesEnd, aggregation])

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort()
      return
    }
    // Auto-load when PRECIP layer is active and AOI+date ready
    if (hasAoi && sceneDate) void run()
    return () => abortRef.current?.abort()
  }, [enabled, hasAoi, sceneDate, aggregation, geometry]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportGeoTiff = useCallback(async () => {
    if (!raster) return false
    await exportChirpsGeoTiffZip(raster, aoiName || 'aoi')
    return true
  }, [raster, aoiName])

  const exportCsv = useCallback(() => {
    if (!timeseries || !analytics) return false
    exportChirpsCsv(timeseries.points, analytics, {
      aoiName: aoiName || 'AOI',
      start: timeseries.start,
      end: timeseries.end,
    })
    return true
  }, [timeseries, analytics, aoiName])

  const exportExcel = useCallback(() => {
    if (!timeseries || !analytics) return false
    exportChirpsExcel(timeseries.points, analytics, {
      aoiName: aoiName || 'AOI',
      start: timeseries.start,
      end: timeseries.end,
      source: timeseries.source,
    })
    return true
  }, [timeseries, analytics, aoiName])

  const exportReport = useCallback(() => {
    if (!timeseries || !analytics) return false
    exportChirpsHtmlReport({
      aoiName: aoiName || 'AOI',
      start: timeseries.start,
      end: timeseries.end,
      source: timeseries.source,
      points: timeseries.points,
      analytics,
    })
    return true
  }, [timeseries, analytics, aoiName])

  const stats = useMemo(() => {
    if (!raster?.stats && !analytics) return []
    const rows: Array<{ label: string; value: string }> = []
    if (raster?.stats?.mean != null) rows.push({ label: 'Map mean', value: `${raster.stats.mean.toFixed(1)} mm` })
    if (analytics?.totalMm != null) rows.push({ label: 'Total P', value: `${analytics.totalMm.toFixed(1)} mm` })
    if (analytics?.rai != null) rows.push({ label: 'RAI', value: `${analytics.rai.toFixed(1)} %` })
    if (analytics?.spi != null) rows.push({ label: 'SPI', value: `${analytics.spi.toFixed(2)} (${analytics.spiLabel})` })
    if (analytics?.rti != null) rows.push({ label: 'RTI', value: `${analytics.rti.toFixed(3)} mm/step` })
    if (analytics?.rdi != null) rows.push({ label: 'RDI', value: analytics.rdi.toFixed(2) })
    if (analytics?.wai != null) rows.push({ label: 'WAI', value: analytics.wai.toFixed(2) })
    return rows
  }, [raster, analytics])

  return {
    aggregation,
    setAggregation,
    status,
    error,
    raster,
    timeseries,
    analytics,
    stats,
    heatVisible,
    setHeatVisible: () => setHeatVisible(v => !v),
    opacity,
    setOpacity,
    hasAoi,
    hasResult: !!raster,
    run,
    exportGeoTiff,
    exportCsv,
    exportExcel,
    exportReport,
  }
}

export type UseChirpsPrecipitation = ReturnType<typeof useChirpsPrecipitation>
