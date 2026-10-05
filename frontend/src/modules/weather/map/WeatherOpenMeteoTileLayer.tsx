import { TileLayer } from 'react-leaflet'
import { buildOpenMeteoMapTileUrl } from '../config/weatherLayerCatalog'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import { WEATHER_TILE_PANE } from './weatherMapPanes'

type Props = {
  layer: WeatherMapLayerDef
  mapTimeIso?: string
  opacity?: number
}

/** ECMWF IFS forecast tiles — smooth Windy-style scalar fields. */
export function WeatherOpenMeteoTileLayer({ layer, mapTimeIso, opacity = 0.8 }: Props) {
  const url = buildOpenMeteoMapTileUrl(layer.openMeteoVariable, mapTimeIso)
  return (
    <TileLayer
      key={`${layer.openMeteoVariable}-${mapTimeIso ?? 'latest'}`}
      url={url}
      opacity={opacity}
      pane={WEATHER_TILE_PANE}
      zIndex={360}
      maxZoom={18}
      maxNativeZoom={8}
      crossOrigin="anonymous"
      updateWhenZooming
      updateWhenIdle
      keepBuffer={8}
      className="weather-forecast-tile-layer"
    />
  )
}
