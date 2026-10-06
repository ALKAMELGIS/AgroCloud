import { useEffect, useMemo, useState } from 'react'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import type { WeatherLocationRow } from './useWeatherLocationRows'
import {
  enrichDailyForRows,
  rowHasLiveTemp,
} from '../services/openMeteoLocationBatch'
import type { WeatherFarmSite } from '../services/weatherFarmService'

function rowNeedsDailyExtents(row: WeatherLocationRow | undefined): boolean {
  return Boolean(row && rowHasLiveTemp(row) && (row.dailyMinC == null || row.dailyMaxC == null))
}

/** Client-side patch when sidebar rows have live temp but missing Open-Meteo daily min/max. */
export function useSupplementLocationDailyExtents(
  sites: WeatherFarmSite[],
  rows: WeatherLocationRow[],
): Map<WeatherLocationId, { dailyMinC: number; dailyMaxC: number }> {
  const [patch, setPatch] = useState<Map<WeatherLocationId, { dailyMinC: number; dailyMaxC: number }>>(
    () => new Map(),
  )

  const sitesKey = useMemo(() => sites.map(s => `${s.id}:${s.lat},${s.lng}`).join('|'), [sites])
  const rowsKey = useMemo(
    () => rows.map(r => `${r.id}:${r.temperatureC}:${r.dailyMinC}:${r.dailyMaxC}`).join('|'),
    [rows],
  )

  useEffect(() => {
    if (!sites.length || !rows.length) {
      setPatch(new Map())
      return
    }
    const needs = sites.filter(s => rowNeedsDailyExtents(rows.find(r => r.id === s.id)))
    if (!needs.length) return

    const ac = new AbortController()
    void enrichDailyForRows(sites, rows, ac.signal).then(enriched => {
      if (ac.signal.aborted) return
      const next = new Map<WeatherLocationId, { dailyMinC: number; dailyMaxC: number }>()
      for (const r of enriched) {
        if (r.dailyMinC != null && r.dailyMaxC != null && rowHasLiveTemp(r)) {
          next.set(r.id, { dailyMinC: r.dailyMinC, dailyMaxC: r.dailyMaxC })
        }
      }
      if (next.size) setPatch(next)
    })
    return () => ac.abort()
  }, [sitesKey, rowsKey, sites, rows])

  return patch
}
