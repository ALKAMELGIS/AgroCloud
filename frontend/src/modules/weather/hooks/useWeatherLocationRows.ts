import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import {
  coalesceLocationRow,
  fetchOpenMeteoLocationRowsBatch,
  rowHasLiveTemp,
  seedLocationRowsFromLiveCache,
} from '../services/openMeteoLocationBatch'
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

function emptyPlaceholder(s: WeatherFarmSite): WeatherLocationRow {
  return {
    id: s.id,
    label: s.label,
    temperatureC: null,
    humidityPct: null,
    windSpeedKmh: null,
    windDirectionDeg: null,
    precipMm: null,
    weatherCode: null,
  }
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
    const cachedSeed = seedLocationRowsFromLiveCache(sites)
    if (cachedSeed.some(rowHasLiveTemp)) {
      setRows(cachedSeed)
    }
    setLoading(true)
    try {
      const mergeIntoState = (loaded: WeatherLocationRow[]) => {
        setRows(prev => {
          const byId = new Map(loaded.map(r => [r.id, r]))
          return sites.map(s => {
            const prevRow = prev.find(p => p.id === s.id) ?? emptyPlaceholder(s)
            const next = byId.get(s.id)
            if (!next) return prevRow
            return coalesceLocationRow(prevRow, next)
          })
        })
        if (loaded.some(rowHasLiveTemp)) setLoading(false)
      }

      const loaded = await fetchOpenMeteoLocationRowsBatch(sites, undefined, mergeIntoState)
      if (loaded.length) mergeIntoState(loaded)
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

  useEffect(() => {
    if (!sites.length) return
    const syncFromMapCache = () => {
      const seeded = seedLocationRowsFromLiveCache(sites)
      if (!seeded.some(rowHasLiveTemp)) return
      setRows(prev =>
        sites.map(s => {
          const fromCache = seeded.find(r => r.id === s.id)
          const prevRow = prev.find(p => p.id === s.id)
          if (fromCache && rowHasLiveTemp(fromCache)) return fromCache
          return prevRow ?? fromCache ?? emptyPlaceholder(s)
        }),
      )
      setLoading(false)
    }
    window.addEventListener('weather-location-live-cache', syncFromMapCache)
    return () => window.removeEventListener('weather-location-live-cache', syncFromMapCache)
  }, [siteKey, sites])

  return { rows, loading, reload: load }
}
