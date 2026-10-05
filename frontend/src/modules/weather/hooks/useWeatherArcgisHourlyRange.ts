import { useEffect, useMemo, useRef, useState } from 'react'
import { filterHourlyByDateRange, type WeatherChartDateRange } from '../config/weatherChartDateRange'
import {
  fetchOpenMeteoHourlyForDateRange,
  peekOpenMeteoHourlyRangeCache,
  type OpenMeteoDashboardBundle,
  type OpenMeteoDashboardHourlyPoint,
} from '../services/openMeteoWeatherDashboard'

function bundleHourlyFallback(
  bundle: OpenMeteoDashboardBundle | null,
  range: WeatherChartDateRange,
): OpenMeteoDashboardHourlyPoint[] {
  const series = bundle?.hourlyForecast?.length ? bundle.hourlyForecast : bundle?.hourly ?? []
  if (!series.length) return []
  return filterHourlyByDateRange(series, range)
}

/**
 * Shared hourly series for ArcGIS forecast tabs — cached, prefetched, shows bundle data immediately.
 */
export function useWeatherArcgisHourlyRange(
  lat: number,
  lng: number,
  range: WeatherChartDateRange,
  bundle: OpenMeteoDashboardBundle | null,
) {
  const fallback = useMemo(
    () => bundleHourlyFallback(bundle, range),
    [bundle, range.startDate, range.endDate],
  )

  const [hourlyRange, setHourlyRange] = useState<OpenMeteoDashboardHourlyPoint[]>(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback
    const cached = peekOpenMeteoHourlyRangeCache(lat, lng, range)
    if (cached?.length) return cached
    return fallback
  })

  const [hourlyRangeLoading, setHourlyRangeLoading] = useState(() => hourlyRange.length === 0)
  const fetchSeqRef = useRef(0)

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const instantFallback = bundleHourlyFallback(bundle, range)
    const cached = peekOpenMeteoHourlyRangeCache(lat, lng, range)
    if (cached?.length) {
      setHourlyRange(cached)
      setHourlyRangeLoading(false)
    } else if (instantFallback.length) {
      setHourlyRange(instantFallback)
      setHourlyRangeLoading(false)
    } else {
      setHourlyRangeLoading(true)
    }

    const ac = new AbortController()
    const flight = ++fetchSeqRef.current
    void fetchOpenMeteoHourlyForDateRange(lat, lng, range, ac.signal)
      .then(rows => {
        if (ac.signal.aborted || flight !== fetchSeqRef.current) return
        if (rows.length) setHourlyRange(rows)
      })
      .catch(() => {
        /* keep fallback / cache */
      })
      .finally(() => {
        if (!ac.signal.aborted && flight === fetchSeqRef.current) {
          setHourlyRangeLoading(false)
        }
      })

    return () => ac.abort()
  }, [lat, lng, range.startDate, range.endDate, bundle])

  return { hourlyRange, hourlyRangeLoading }
}
