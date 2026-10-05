import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  buildArcGisImageServerRasterTiles,
  fetchArcGisFeatureGeoJsonInBbox,
} from '@/modules/gis/layers/arcgisDynamicLayer'
import { createSentinelHubBboxTileLayer } from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'
import {
  WEATHER_ARCGIS_DATA_LAYERS,
  type WeatherArcgisDataLayerDef,
  type WeatherArcgisDataLayerId,
} from '../config/weatherArcgisDataLayers'
import type { WeatherArcgisDataLayerPrefs } from '../config/weatherArcgisDataLayerPrefs'
import { WEATHER_TILE_PANE, ensureWeatherMapPanes } from './WeatherMapPanes'

function layerStyle(def: WeatherArcgisDataLayerDef): L.PathOptions | L.CircleMarkerOptions {
  switch (def.id) {
    case 'noaa_metar_wind':
      return { color: '#7dd3fc', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 0.75, radius: 4 }
    case 'era5_annual_temp':
      return { color: '#fdba74', weight: 0.6, fillColor: '#f97316', fillOpacity: 0.28 }
    case 'world_countries':
      return { color: 'rgba(148, 163, 184, 0.85)', weight: 1, fillColor: 'transparent', fillOpacity: 0 }
    case 'world_cities':
      return { color: '#fde047', weight: 1, fillColor: '#facc15', fillOpacity: 0.85, radius: 3 }
    default:
      return { color: '#94a3b8', weight: 1, fillOpacity: 0.2 }
  }
}

function WeatherArcgisImageLayerOnMap({
  def,
  visible,
  opacity,
}: {
  def: WeatherArcgisDataLayerDef
  visible: boolean
  opacity: number
}) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

  useEffect(() => {
    ensureWeatherMapPanes(map)
    const tileUrl = buildArcGisImageServerRasterTiles(def.serviceUrl).tiles[0]
    const layer = createSentinelHubBboxTileLayer(tileUrl, {
      opacity,
      pane: WEATHER_TILE_PANE,
      minZoom: def.minZoom ?? 0,
      crossOrigin: null,
    })
    layerRef.current = layer
    return () => {
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [map, def.serviceUrl, def.minZoom])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.setOpacity(opacity)
    if (visible) {
      if (!map.hasLayer(layer)) layer.addTo(map)
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer)
    }
  }, [map, visible, opacity])

  return null
}

function WeatherArcgisFeatureLayerOnMap({
  def,
  visible,
  opacity,
}: {
  def: WeatherArcgisDataLayerDef
  visible: boolean
  opacity: number
}) {
  const map = useMap()
  const geoRef = useRef<L.GeoJSON | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    ensureWeatherMapPanes(map)
    const style = layerStyle(def)

    const clearLayer = () => {
      if (geoRef.current) {
        map.removeLayer(geoRef.current)
        geoRef.current = null
      }
    }

    const load = async () => {
      if (!visible) {
        clearLayer()
        return
      }
      const zoom = map.getZoom()
      if (def.minZoom != null && zoom < def.minZoom) {
        clearLayer()
        return
      }
      const b = map.getBounds()
      const bbox: [number, number, number, number] = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ]
      try {
        const fc = await fetchArcGisFeatureGeoJsonInBbox(def.serviceUrl, bbox)
        clearLayer()
        const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
          pane: WEATHER_TILE_PANE,
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, { ...(style as L.CircleMarkerOptions), opacity }),
          style: () => ({ ...(style as L.PathOptions), opacity }),
        })
        geoRef.current = layer
        layer.addTo(map)
      } catch {
        /* service may rate-limit or block CORS on some networks */
      }
    }

    const scheduleLoad = () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void load()
      }, 280)
    }

    if (visible) scheduleLoad()
    else clearLayer()

    map.on('moveend', scheduleLoad)
    map.on('zoomend', scheduleLoad)
    return () => {
      map.off('moveend', scheduleLoad)
      map.off('zoomend', scheduleLoad)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      clearLayer()
    }
  }, [map, def, visible, opacity])

  return null
}

type Props = {
  prefs: WeatherArcgisDataLayerPrefs
}

export function WeatherArcgisDataLayersOnMap({ prefs }: Props) {
  const sorted = [...WEATHER_ARCGIS_DATA_LAYERS].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <>
      {sorted.map(def => {
        const pref = prefs[def.id as WeatherArcgisDataLayerId]
        if (!pref) return null
        if (def.kind === 'image') {
          return (
            <WeatherArcgisImageLayerOnMap
              key={def.id}
              def={def}
              visible={pref.visible}
              opacity={pref.opacity}
            />
          )
        }
        return (
          <WeatherArcgisFeatureLayerOnMap
            key={def.id}
            def={def}
            visible={pref.visible}
            opacity={pref.opacity}
          />
        )
      })}
    </>
  )
}
