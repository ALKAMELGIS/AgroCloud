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
import { isAcpWeatherFeedActive } from '../acpMapLayerVisibility'
import {
  ACP_WEATHER_TICKER_MAX_FIELDS,
  resolveAcpWeatherTickerFields,
} from './acpWeatherAlertTickerModel'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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

async function loadWeatherFields(
  fields: ReturnType<typeof resolveAcpWeatherTickerFields>,
): Promise<AcpFieldWeatherLayerEntry[]> {
  const weatherByField = await fetchAcpWeatherByFieldKeys(fields)
  return buildAcpFieldWeatherLayerEntries(fields, weatherByField)
}

export function AcpWeatherFieldProvider({ children }: { children: ReactNode }) {
  const acp = useAcpPlatform()
  const [entries, setEntries] = useState<AcpFieldWeatherLayerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldsRef = useRef<ReturnType<typeof resolveAcpWeatherTickerFields>>([])

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
      acp.aoiSyncRevision,
    ],
  )

  fieldsRef.current = fields
  const fieldsKey = useMemo(() => fields.map(f => f.fieldKey).join('|'), [fields])
  const weatherFeedActive = isAcpWeatherFeedActive(acp.layerVisibility)

  useEffect(() => {
    if (!weatherFeedActive || !fieldsKey) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const next = await loadWeatherFields(fieldsRef.current)
        if (cancelled) return
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
  }, [fieldsKey, weatherFeedActive])

  /** Immediate resync when AOI / alerts bus fires — no debounce. */
  useEffect(() => {
    if (!acp.aoiSyncRevision || !weatherFeedActive || !fieldsKey) return

    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const next = await loadWeatherFields(fieldsRef.current)
        if (cancelled) return
        setEntries(next)
        setError(next.length ? null : 'Weather data unavailable')
      } catch {
        if (!cancelled) setError('Weather alert feed temporarily unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [acp.aoiSyncRevision, fieldsKey, weatherFeedActive])

  const value = useMemo(
    () => ({ fields, entries, loading, error }),
    [entries, error, fields, loading],
  )

  return <AcpWeatherFieldContext.Provider value={value}>{children}</AcpWeatherFieldContext.Provider>
}
