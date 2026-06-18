import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAcpPlatform } from '../acpPlatformContext'
import {
  ACP_WEATHER_FETCH_DEBOUNCE_MS,
  ACP_WEATHER_REFRESH_MS,
  fetchAcpWeatherByFieldKeys,
} from './acpWeatherFieldService'
import {
  buildAcpFieldWeatherLayerEntries,
  type AcpFieldWeatherLayerEntry,
} from './acpWeatherAlertLayerModel'
import {
  ACP_WEATHER_TICKER_MAX_FIELDS,
  resolveAcpWeatherTickerFields,
} from './acpWeatherAlertTickerModel'

export type AcpWeatherFieldContextValue = {
  fields: ReturnType<typeof resolveAcpWeatherTickerFields>
  entries: AcpFieldWeatherLayerEntry[]
  loading: boolean
  error: string | null
}

const AcpWeatherFieldContext = createContext<AcpWeatherFieldContextValue>({
  fields: [],
  entries: [],
  loading: false,
  error: null,
})

export function useAcpWeatherFieldData(): AcpWeatherFieldContextValue {
  return useContext(AcpWeatherFieldContext)
}

export function AcpWeatherFieldProvider({ children }: { children: ReactNode }) {
  const acp = useAcpPlatform()
  const [entries, setEntries] = useState<AcpFieldWeatherLayerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo(
    () =>
      resolveAcpWeatherTickerFields(acp.aoiMask, {
        mapView: acp.mapView,
        scopeMode: acp.scopeMode,
        countryFilter: acp.countryFilter,
        selectedFieldKey: acp.selectedFieldKey,
        maxFields: ACP_WEATHER_TICKER_MAX_FIELDS,
        countryDescriptionMap: acp.countryDescriptionMap,
      }),
    [
      acp.aoiMask,
      acp.countryFilter,
      acp.countryDescriptionMap,
      acp.mapView.bbox,
      acp.mapView.zoom,
      acp.scopeMode,
      acp.selectedFieldKey,
    ],
  )

  const fieldsKey = useMemo(() => fields.map(f => f.fieldKey).join('|'), [fields])

  useEffect(() => {
    if (!fieldsKey) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const weatherByField = await fetchAcpWeatherByFieldKeys(fields)
        if (cancelled) return
        const next = buildAcpFieldWeatherLayerEntries(fields, weatherByField)
        setEntries(next)
        setError(next.length ? null : 'Weather data unavailable')
      } catch {
        if (!cancelled) setError('Weather alert feed temporarily unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const debounce = window.setTimeout(load, ACP_WEATHER_FETCH_DEBOUNCE_MS)
    const interval = window.setInterval(load, ACP_WEATHER_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearTimeout(debounce)
      window.clearInterval(interval)
    }
  }, [fields, fieldsKey])

  const value = useMemo(
    () => ({ fields, entries, loading, error }),
    [entries, error, fields, loading],
  )

  return <AcpWeatherFieldContext.Provider value={value}>{children}</AcpWeatherFieldContext.Provider>
}
