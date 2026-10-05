import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import { fetchOpenMeteoLocationRowsBatch } from '../services/openMeteoLocationBatch'
import type { WeatherFarmSite } from '../services/weatherFarmService'

export type WeatherLocationRow = {
  id: WeatherLocationId
  label: string
  temperatureC: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  precipMm: number | null
  weatherCode: number | null
  countryLabel?: string
  dailyMinC?: number | null
  dailyMaxC?: number | null
}

export function useWeatherLocationRows(sites: WeatherFarmSite[], refreshKey?: string | number) {
  const [rows, setRows] = useState<WeatherLocationRow[]>([])
  const [loading, setLoading] = useState(false)
  const siteKey = useMemo(() => sites.map(s => s.id).join('\0'), [sites])

  const load = useCallback(async () => {
    if (!sites.length) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const loaded = await fetchOpenMeteoLocationRowsBatch(sites)
      if (loaded.length) {
        setRows(prev => {
          const byId = new Map(loaded.map(r => [r.id, r]))
          return sites.map(s => {
            const next = byId.get(s.id)
            const prevRow = prev.find(p => p.id === s.id)
            if (next && next.temperatureC != null) return next
            if (prevRow?.temperatureC != null) return prevRow
            return (
              next ??
              prevRow ?? {
                id: s.id,
                label: s.label,
                temperatureC: null,
                humidityPct: null,
                windSpeedKmh: null,
                windDirectionDeg: null,
                precipMm: null,
                weatherCode: null,
              }
            )
          })
        })
      }

    } catch {
      /* keep previous rows on transient failure */
    } finally {
      setLoading(false)
    }
  }, [siteKey, sites])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
    }, 120)
    return () => window.clearTimeout(id)
  }, [load, refreshKey])

  return { rows, loading, reload: load }
}
