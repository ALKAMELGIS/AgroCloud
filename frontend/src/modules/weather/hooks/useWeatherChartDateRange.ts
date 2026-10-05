import { useCallback, useEffect, useState } from 'react'
import {
  clampWeatherChartDateRange,
  getDefaultWeatherChartDateRange,
  getWeatherChartTodayYmd,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'

export function useWeatherChartDateRange() {
  const [range, setRangeState] = useState<WeatherChartDateRange>(() => getDefaultWeatherChartDateRange())

  const setRange = useCallback((next: WeatherChartDateRange) => {
    setRangeState(clampWeatherChartDateRange(next))
  }, [])

  useEffect(() => {
    const syncEndToToday = () => {
      const today = getWeatherChartTodayYmd()
      setRangeState(prev => {
        if (prev.endDate >= today) return prev
        return { ...prev, endDate: today }
      })
    }
    syncEndToToday()
    const id = window.setInterval(syncEndToToday, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const resetToDefault = useCallback(() => {
    setRangeState(getDefaultWeatherChartDateRange())
  }, [])

  return { range, setRange, resetToDefault }
}
