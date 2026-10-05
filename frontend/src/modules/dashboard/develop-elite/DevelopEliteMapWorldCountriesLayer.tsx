import { useLayoutEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import {
  DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE,
  DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE_Z_INDEX,
  ensureDevelopEliteMapWorldCountriesPane,
} from './developEliteMapPanes'
import { createDevelopEliteMapWorldCountriesSvgRenderer } from './developEliteMapRenderers'
import { developEliteWorldCountriesPathStyle } from './developEliteWorldCountriesMapStyle'

type Props = {
  geojson: GeoJSON.FeatureCollection
}

export function developEliteWorldCountriesLayerSignature(
  geojson: GeoJSON.FeatureCollection,
): string {
  const ids = geojson.features.map(f => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    return String(f.id ?? props.OBJECTID ?? '')
  })
  return `${geojson.features.length}:${ids.join(',')}`
}

function raiseWorldCountriesPane(map: L.Map): void {
  ensureDevelopEliteMapWorldCountriesPane(map)
  const pane = map.getPane(DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE)
  if (pane) {
    pane.style.zIndex = String(DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE_Z_INDEX)
    pane.style.pointerEvents = 'none'
  }
}

/**
 * World_Countries — dedicated pane (z 580) above basemap tiles, below markers (600) and structures (620).
 */
export function DevelopEliteMapWorldCountriesLayer({ geojson }: Props) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const geojsonRef = useRef(geojson)
  geojsonRef.current = geojson
  const dataSig = developEliteWorldCountriesLayerSignature(geojson)

  useLayoutEffect(() => {
    const fc = geojsonRef.current
    layerRef.current?.remove()
    layerRef.current = null

    if (!fc.features.length) return

    raiseWorldCountriesPane(map)
    const renderer = createDevelopEliteMapWorldCountriesSvgRenderer(map)
    const layer = L.geoJSON(fc, {
      pane: DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE,
      renderer,
      smoothFactor: 0.5,
      style: developEliteWorldCountriesPathStyle,
      interactive: false,
    })
    layer.addTo(map)
    layer.bringToFront()
    layerRef.current = layer

    const syncStack = () => {
      raiseWorldCountriesPane(map)
      layerRef.current?.bringToFront()
    }
    map.on('zoomend', syncStack)
    map.on('moveend', syncStack)
    map.on('baselayerchange', syncStack)
    requestAnimationFrame(syncStack)

    return () => {
      map.off('zoomend', syncStack)
      map.off('moveend', syncStack)
      map.off('baselayerchange', syncStack)
      layer.remove()
      if (layerRef.current === layer) layerRef.current = null
    }
  }, [map, dataSig])

  return null
}
