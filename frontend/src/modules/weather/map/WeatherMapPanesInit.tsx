import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { ensureDevelopEliteMapDataPane } from '@/modules/dashboard/develop-elite/developEliteMapPanes'
import { ensureWeatherMapPanes } from './weatherMapPanes'

export function WeatherMapPanesInit() {
  const map = useMap()
  useEffect(() => {
    ensureWeatherMapPanes(map)
    ensureDevelopEliteMapDataPane(map)
  }, [map])
  return null
}
