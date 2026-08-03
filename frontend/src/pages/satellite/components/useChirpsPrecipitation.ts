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

/** Keep in sync with backend MAX_DAILY_SERIES / MAX_MONTHLY_SERIES. */
const MAX_DAILY_SERIES_DAYS = 120
const MAX_MONTHLY_SERIES_MONTHS = 60

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

function addUtcDays(iso: string, delta: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${end.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.floor((b - a) / 86400000) + 1
}

function monthsBetweenApprox(start: string, end: string): number {
  const [ys, ms] = start.slice(0, 7).split('-').map(Number)
  const [ye, me] = end.slice(0, 7).split('-').map(Number)
  if (![ys, ms, ye, me].every(Number.isFinite)) return 0
  return (ye! - ys!) * 12 + (me! - ms!) + 1
}

/** Clamp analytics window so timeseries never trips the backend 400 limit. */
export function clampChirpsSeriesWindow(input: {
  start: string
  end: string
  aggregation: ChirpsAggregation
}): { start: string; end: string; clamped: boolean; note: string | null } {
  let start = input.start.slice(0, 10)
  let end = input.end.slice(0, 10)
  if (start > end) [start, end] = [end, start]

  if (input.aggregation === 'daily') {
    const n = daysBetweenInclusive(start, end)
    if (n > MAX_DAILY_SERIES_DAYS) {
      return {
        start: addUtcDays(end, -(MAX_DAILY_SERIES_DAYS - 1)),
        end,
        clamped: true,
        note: `Daily series clamped to last ${MAX_DAILY_SERIES_DAYS} days (was ${n}).`,
      }
    }
  } else {
    const n = monthsBetweenApprox(start, end)
    if (n > MAX_MONTHLY_SERIES_MONTHS) {
      const d = new Date(`${end}T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() - (MAX_MONTHLY_SERIES_MONTHS - 1))
      return {
        start: d.toISOString().slice(0, 10),
        end,
        clamped: true,
        note: `Monthly series clamped to last ${MAX_MONTHLY_SERIES_MONTHS} months (was ${n}).`,
      }
    }
  }
  return { start, end, clamped: false, note: null }
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
  const [opacity, setOpacity] = useState(0.88)
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
      setRaster(null)
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

    let end = (seriesEnd || date).slice(0, 10)
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
    const window = clampChirpsSeriesWindow({ start, end, aggregation })
    start = window.start
    end = window.end

    // Map raster must succeed independently of timeseries analytics.
    let rRaw: ChirpsRasterResponse | null = null
    let rasterErr: string | null = null
    try {
      rRaw = await fetchChirpsRaster({
        geometry,
        date,
        aggregation,
        signal: ac.signal,
      })
    } catch (e) {
      if (ac.signal.aborted) return
      rasterErr = e instanceof Error ? e.message : 'CHIRPS raster load failed'
    }

    if (ac.signal.aborted) return

    if (rRaw) {
      const r = maskChirpsRasterToPolygon(rRaw, geometry)
      setRaster(r)
      setHeatVisible(true)
    } else {
      setRaster(null)
    }

    let ts: ChirpsTimeseriesResponse | null = null
    let tsErr: string | null = null
    try {
      ts = await fetchChirpsTimeseries({
        geometry,
        start,
        end,
        aggregation,
        signal: ac.signal,
      })
    } catch (e) {
      if (ac.signal.aborted) return
      tsErr = e instanceof Error ? e.message : 'CHIRPS timeseries load failed'
    }

    if (ac.signal.aborted) return

    setTimeseries(ts)

    if (rRaw) {
      setStatus('done')
      const notes = [window.note, tsErr ? `Analytics: ${tsErr}` : null].filter(Boolean)
      setError(notes.length ? notes.join(' ') : null)
      return
    }

    setStatus('error')
    setError(rasterErr || tsErr || 'CHIRPS load failed')
  }, [geometry, hasAoi, sceneDate, seriesStart, seriesEnd, aggregation])

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort()
      return
    }
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
