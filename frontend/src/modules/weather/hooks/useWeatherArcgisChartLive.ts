import { useEffect, useState } from 'react'
import {
  type WeatherChartLiveCadence,
  weatherChartLiveCadenceMs,
} from '../charts/weatherArcgisChartLive'

type Options = {
  cadence: WeatherChartLiveCadence
  enabled?: boolean
  /** Fired on each cadence tick (e.g. refresh Open-Meteo). */
  onTick?: () => void
}

function dataRefreshMs(cadence: WeatherChartLiveCadence): number {
  if (cadence === '1h') return weatherChartLiveCadenceMs('1h')
  return weatherChartLiveCadenceMs('1m')
}

/** Wall clock for ArcGIS charts — NOW line updates every second; Open-Meteo refresh follows cadence. */
export function useWeatherArcgisChartLive({ cadence, enabled = true, onTick }: Options) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return

    setNowMs(Date.now())
    const clockId = window.setInterval(() => setNowMs(Date.now()), 1_000)

    const dataId = window.setInterval(() => onTick?.(), dataRefreshMs(cadence))
    onTick?.()

    return () => {
      window.clearInterval(clockId)
      window.clearInterval(dataId)
    }
  }, [cadence, enabled, onTick])

  return nowMs
}
