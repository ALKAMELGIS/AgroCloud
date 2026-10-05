import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  readLocationMapLayer,
  suggestMapLayerForWeather,
  weatherReadingFromSnapshot,
  writeLocationMapLayer,
} from '../config/weatherLocationMapLayer'

import type { WeatherLocationId } from '../config/weatherFarmIds'

import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'

import {

  buildOperationalWeatherIndicators,

  type OperationalWeatherIndicator,

} from '../insights/buildOperationalWeatherIndicators'

import {

  computeWeatherKpiTrend,

  fetchOpenMeteoDashboardBundle,

  mergeLocationPatchIntoBundle,

  type LocationWeatherPatch,

  type OpenMeteoDashboardBundle,

  type WeatherKpiTrend,

  weatherBundleHasSnapshot,
  weatherBundleHasUsableData,

} from '../services/openMeteoWeatherDashboard'

import {

  getWeatherFarmSite,

  loadWeatherFarmCatalog,

  type WeatherFarmCatalog,

  type WeatherFarmSite,

} from '../services/weatherFarmService'



export type WeatherMobileTab = 'map' | 'insights' | 'forecast'



export function useWeatherMonitoringData() {

  const [catalog, setCatalog] = useState<WeatherFarmCatalog | null>(null)

  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [farmId, setFarmId] = useState<WeatherLocationId>('all')

  const [activeLayerId, setActiveLayerId] = useState<WeatherMapLayerId>(() => {
    return readLocationMapLayer('all') ?? 'temperature'
  })
  const autoLayerSuggestedKeyRef = useRef<string>('')

  const [bundle, setBundle] = useState<OpenMeteoDashboardBundle | null>(null)

  const [locationPatch, setLocationPatch] = useState<LocationWeatherPatch | null>(null)

  const [loadingWeather, setLoadingWeather] = useState(false)

  const [weatherError, setWeatherError] = useState<string | null>(null)

  const [mobileTab, setMobileTab] = useState<WeatherMobileTab>('map')

  const [customLocation, setCustomLocation] = useState<{ lat: number; lng: number; label: string } | null>(

    null,

  )



  useEffect(() => {

    let cancelled = false

    loadWeatherFarmCatalog()

      .then(c => {

        if (!cancelled) setCatalog(c)

      })

      .catch(e => {

        if (!cancelled) setCatalogError(e instanceof Error ? e.message : 'Failed to load farms')

      })

    return () => {

      cancelled = true

    }

  }, [])



  useEffect(() => {

    if (!catalog?.sites.length) return

    if (!catalog.sites.some(s => s.id === farmId)) setFarmId('all')

  }, [catalog, farmId])



  const site: WeatherFarmSite | null = useMemo(() => {

    if (!catalog) return null

    return getWeatherFarmSite(catalog, farmId)

  }, [catalog, farmId])



  const queryPoint = useMemo(() => {

    if (customLocation) return customLocation

    if (site) return { lat: site.lat, lng: site.lng, label: site.label }

    return { lat: 44.87, lng: 19.53, label: 'Default' }

  }, [customLocation, site])



  const bundleForPanels = useMemo(

    () => mergeLocationPatchIntoBundle(bundle, queryPoint.lat, queryPoint.lng, locationPatch),

    [bundle, locationPatch, queryPoint.lat, queryPoint.lng],

  )



  const refreshWeather = useCallback(async () => {

    setLoadingWeather(true)

    setWeatherError(null)

    try {

      const next = await fetchOpenMeteoDashboardBundle(queryPoint.lat, queryPoint.lng)

      setBundle(next)

    } catch (e) {
      setWeatherError(e instanceof Error ? e.message : 'Weather unavailable')
    } finally {
      setLoadingWeather(false)
    }
  }, [queryPoint.lat, queryPoint.lng])



  useEffect(() => {

    void refreshWeather()

  }, [refreshWeather])

  const setActiveLayerIdForLocation = useCallback(
    (layerId: WeatherMapLayerId) => {
      setActiveLayerId(layerId)
      writeLocationMapLayer(farmId, layerId)
    },
    [farmId],
  )

  useEffect(() => {
    const saved = readLocationMapLayer(farmId)
    if (saved) {
      setActiveLayerId(saved)
      autoLayerSuggestedKeyRef.current = ''
      return
    }
    const suggestKey = `${farmId}:${queryPoint.lat.toFixed(3)},${queryPoint.lng.toFixed(3)}`
    if (autoLayerSuggestedKeyRef.current === suggestKey) return
    const snap = bundle?.snapshot
    if (
      snap &&
      (Math.abs(snap.lat - queryPoint.lat) > 0.08 || Math.abs(snap.lng - queryPoint.lng) > 0.08)
    ) {
      return
    }
    const reading = weatherReadingFromSnapshot(snap)
    if (!reading) return
    setActiveLayerId(suggestMapLayerForWeather(reading))
    autoLayerSuggestedKeyRef.current = suggestKey
  }, [farmId, bundle?.snapshot, queryPoint.lat, queryPoint.lng])



  useEffect(() => {

    if (weatherBundleHasSnapshot(bundle) || !locationPatch) return

    const merged = mergeLocationPatchIntoBundle(bundle, queryPoint.lat, queryPoint.lng, locationPatch)

    if (weatherBundleHasSnapshot(merged)) setBundle(merged)

  }, [bundle, locationPatch, queryPoint.lat, queryPoint.lng])



  const trend: WeatherKpiTrend = useMemo(

    () => computeWeatherKpiTrend(bundleForPanels?.hourlyForecast ?? bundleForPanels?.hourly ?? []),

    [bundleForPanels],

  )



  const indicators: OperationalWeatherIndicator[] = useMemo(

    () => buildOperationalWeatherIndicators(bundleForPanels, undefined, loadingWeather, weatherError),

    [bundleForPanels, loadingWeather, weatherError],

  )



  return {

    catalog,

    catalogError,

    farmId,

    setFarmId,

    site,

    activeLayerId,

    setActiveLayerId: setActiveLayerIdForLocation,

    bundle: bundleForPanels,

    weatherDataReady: weatherBundleHasUsableData(bundleForPanels),

    loadingWeather,

    weatherError,

    refreshWeather,

    setLocationWeatherPatch: setLocationPatch,

    trend,

    indicators,

    queryPoint,

    setCustomLocation,

    mobileTab,

    setMobileTab,

  }

}


