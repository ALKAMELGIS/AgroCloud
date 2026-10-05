import { TileLayer } from 'react-leaflet'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import { gfsVariableForLayer } from '../config/weatherGfsRaster'
import { buildGfsRasterTileUrl } from '../services/gfsRasterService'
import { WEATHER_TILE_PANE } from './weatherMapPanes'

type Props = {
  layer: WeatherMapLayerDef
  mapTimeIso?: string
  nextTimeIso?: string
  /** 0 = current frame only; 1 = fully on next frame (crossfade). */
  blend?: number
  opacity?: number
  enabled?: boolean
}

export function WeatherGfsTileLayer({
  layer,
  mapTimeIso,
  nextTimeIso,
  blend = 0,
  opacity = 0.88,
  enabled = true,
}: Props) {
  if (!enabled) return null

  const variable = gfsVariableForLayer(layer.id)
  const url = buildGfsRasterTileUrl(variable, mapTimeIso)
  const urlNext = nextTimeIso ? buildGfsRasterTileUrl(variable, nextTimeIso) : null
  const b = Math.max(0, Math.min(1, blend))
  const showCrossfade = urlNext && b > 0.02

  return (
    <>
      {showCrossfade ? (
        <TileLayer
          key={`gfs-next-${variable}-${nextTimeIso}`}
          url={urlNext!}
          opacity={opacity * b}
          pane={WEATHER_TILE_PANE}
          zIndex={304}
          maxZoom={18}
          maxNativeZoom={8}
          crossOrigin="anonymous"
          updateWhenZooming
          updateWhenIdle
          keepBuffer={8}
          className="weather-gfs-tile-layer weather-gfs-tile-layer--next"
        />
      ) : null}
      <TileLayer
        key={`gfs-${variable}-${mapTimeIso ?? 'latest'}`}
        url={url}
        opacity={showCrossfade ? opacity * (1 - b) : opacity}
        pane={WEATHER_TILE_PANE}
        zIndex={305}
        maxZoom={18}
        maxNativeZoom={8}
        crossOrigin="anonymous"
        updateWhenZooming
        updateWhenIdle
        keepBuffer={8}
        className="weather-gfs-tile-layer"
      />
    </>
  )
}
