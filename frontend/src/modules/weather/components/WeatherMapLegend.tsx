import { useMemo } from 'react'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import { interpolateColor } from '../map/weatherColorRamp'

type Props = {
  layer: WeatherMapLayerDef
  sourceLabel?: string
  resolutionLabel?: string
  windSpeedKmh?: number | null
  windDirectionLabel?: string | null
  rasterOpacity?: number
  onRasterOpacityChange?: (opacity: number) => void
}

function buildLegendGradient(layer: WeatherMapLayerDef): string {
  const stops = layer.legendStops
  if (!stops.length) return 'transparent'
  const min = stops[0].value
  const max = stops[stops.length - 1].value
  const parts: string[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const value = min + (max - min) * t
    parts.push(`${interpolateColor(stops, value)} ${(t * 100).toFixed(1)}%`)
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export function WeatherMapLegend({
  layer,
  sourceLabel,
  windSpeedKmh,
  windDirectionLabel,
  rasterOpacity,
  onRasterOpacityChange,
}: Props) {
  const legendGradient = useMemo(() => buildLegendGradient(layer), [layer])

  return (
    <aside className="weather-map-legend" aria-label="Map legend">
      <div className="weather-map-legend__head">
        <span className="weather-map-legend__title">{layer.label}</span>
        <span className="weather-map-legend__unit">{layer.unit}</span>
      </div>
      <div
        className="weather-map-legend__gradient"
        style={{ background: legendGradient }}
        role="img"
        aria-label={`${layer.label} color scale`}
      />
      <div className="weather-map-legend__ramp">
        {layer.legendStops.map(stop => (
          <span key={stop.value} className="weather-map-legend__tick">
            {stop.value}
          </span>
        ))}
      </div>
      {onRasterOpacityChange && rasterOpacity != null ? (
        <label className="weather-map-legend__opacity">
          <span>Opacity</span>
          <input
            type="range"
            min={0.35}
            max={1}
            step={0.05}
            value={rasterOpacity}
            onChange={e => onRasterOpacityChange(Number(e.target.value))}
            aria-label="Raster layer opacity"
          />
        </label>
      ) : null}
      <p className="weather-map-legend__meta">{sourceLabel ?? 'Open-Meteo'}</p>
      {windSpeedKmh != null ? (
        <p className="weather-map-legend__wind">
          Wind {Math.round(windSpeedKmh)} km/h
          {windDirectionLabel ? ` · ${windDirectionLabel}` : ''}
        </p>
      ) : null}
    </aside>
  )
}
