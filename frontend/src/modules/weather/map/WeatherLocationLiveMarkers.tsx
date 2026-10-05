import { useEffect, useMemo, useState } from 'react'

import { useMap } from 'react-leaflet'

import L from 'leaflet'

import { flyToLatLng } from '@/modules/dashboard/develop-elite/developEliteMapFly'

import { wmoWeatherLabel } from '@/modules/remote-sensing/weather/openMeteoWeather'

import { weatherLocationIdFromFeature } from '../config/weatherFarmIds'
import { readFeaturePointLatLng } from './weatherLocationPoint'

import { pulseWeatherMapLocation } from './weatherMapLocationPulse'

import { wmoWeatherEmojiMeta } from '../config/wmoWeatherEmoji'

import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import type { WeatherLocationId } from '../config/weatherFarmIds'

import { fetchLocationLiveRow, peekLocationLiveRow } from '../services/locationLiveWeatherCache'



type Props = {

  geojson: GeoJSON.FeatureCollection | null

  rows: WeatherLocationRow[]

  selectedId?: WeatherLocationId

  onSelect?: (id: WeatherLocationId) => void

  enabled?: boolean

}



function escapeAttr(value: string): string {

  return value

    .replace(/&/g, '&amp;')

    .replace(/"/g, '&quot;')

    .replace(/</g, '&lt;')

}



function formatTemp(c: number | null): string {

  if (c == null || !Number.isFinite(c)) return '…'

  return `${c.toFixed(1)}°C`

}



function buildMarkerHtml(row: WeatherLocationRow | undefined, label: string, selected: boolean): string {

  const hasData = row?.temperatureC != null && Number.isFinite(row.temperatureC)

  const { emoji, anim } = wmoWeatherEmojiMeta(row?.weatherCode)

  const temp = formatTemp(row?.temperatureC ?? null)

  const aria = `${label}: ${wmoWeatherLabel(row?.weatherCode ?? null)}, ${hasData ? temp : 'loading'}`

  const selectedClass = selected ? ' is-selected' : ''

  const liveClass = hasData ? ' is-live' : ''

  return `

    <div class="weather-loc-marker${selectedClass}${liveClass}" aria-label="${escapeAttr(aria)}">

      <div class="weather-loc-marker__badge">

        <span class="weather-loc-marker__pulse" aria-hidden="true"></span>

        <span class="weather-loc-marker__badge-text">LIVE</span>

      </div>

      <div class="weather-loc-marker__card">

        <span class="weather-loc-marker__emoji weather-loc-marker__emoji--${anim}" aria-hidden="true">${emoji}</span>

        <span class="weather-loc-marker__temp">${temp}</span>

      </div>

      <span class="weather-loc-marker__name" title="${escapeAttr(label)}">${escapeAttr(label)}</span>

      <span class="weather-loc-marker__caret" aria-hidden="true"></span>

    </div>

  `

}



function mergeRow(

  base: WeatherLocationRow | undefined,

  live: WeatherLocationRow | undefined,

  id: WeatherLocationId,

  label: string,

): WeatherLocationRow {

  const pick = live?.temperatureC != null ? live : base

  return {

    id,

    label: pick?.label ?? label,

    temperatureC: pick?.temperatureC ?? null,

    humidityPct: pick?.humidityPct ?? null,

    windSpeedKmh: pick?.windSpeedKmh ?? null,

    windDirectionDeg: pick?.windDirectionDeg ?? null,

    precipMm: pick?.precipMm ?? null,

    weatherCode: pick?.weatherCode ?? null,

  }

}



export function WeatherLocationLiveMarkers({

  geojson,

  rows,

  selectedId,

  onSelect,

  enabled = true,

}: Props) {

  const map = useMap()

  const [liveById, setLiveById] = useState<Record<string, WeatherLocationRow>>({})



  const rowsById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])



  useEffect(() => {

    if (!enabled || !geojson?.features?.length) return

    let cancelled = false

    const ac = new AbortController()



    const run = async () => {

      for (const feature of geojson.features) {

        if (cancelled || ac.signal.aborted) break

        const id = weatherLocationIdFromFeature(feature)

        if (!id || id === 'all') continue

        const latlng = readFeaturePointLatLng(feature)

        if (!latlng) continue

        const [lat, lng] = latlng

        const base = rowsById.get(id)

        if (base?.temperatureC != null) continue

        const cached = peekLocationLiveRow(lat, lng)

        if (cached?.temperatureC != null) {

          setLiveById(prev => ({ ...prev, [id]: { ...cached, id, label: base?.label ?? id } }))

          continue

        }

        try {

          await new Promise(r => window.setTimeout(r, 100))

          const row = await fetchLocationLiveRow(id, base?.label ?? id, lat, lng, ac.signal)

          if (cancelled) break

          setLiveById(prev => ({ ...prev, [id]: row }))

        } catch {

          /* next site */

        }

      }

    }



    void run()

    return () => {

      cancelled = true

      ac.abort()

    }

  }, [enabled, geojson, rowsById])



  useEffect(() => {

    if (!enabled || !geojson?.features?.length) return



    const group = L.layerGroup([], { pane: 'markerPane' })

    map.addLayer(group)



    for (const feature of geojson.features) {

      const id = weatherLocationIdFromFeature(feature)

      if (!id || id === 'all') continue

      const latlng = readFeaturePointLatLng(feature)

      if (!latlng) continue



      const base = rowsById.get(id)

      const live = liveById[id]

      const label = base?.label ?? live?.label ?? id

      const row = mergeRow(base, live, id, label)

      const selected = selectedId === id

      const html = buildMarkerHtml(row, label, selected)



      const icon = L.divIcon({

        className: 'weather-loc-marker-leaflet',

        html,

        iconSize: [120, 78],

        iconAnchor: [60, 74],

      })



      const marker = L.marker(latlng, {

        icon,

        pane: 'markerPane',

        interactive: Boolean(onSelect),

        keyboard: Boolean(onSelect),

        riseOnHover: true,

        zIndexOffset: selected ? 1200 : 400,

      })



      if (onSelect) {

        marker.on('click', (e: L.LeafletMouseEvent) => {

          L.DomEvent.stopPropagation(e)

          if (selectedId === id) {

            flyToLatLng(map, latlng[0], latlng[1], 16)

            pulseWeatherMapLocation(map, latlng[0], latlng[1])

          }

          onSelect(id)

        })

      }



      marker.addTo(group)

    }



    return () => {

      map.removeLayer(group)

    }

  }, [enabled, geojson, liveById, map, onSelect, rowsById, selectedId])

  return null
}