import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import { interpolateColor, windDirectionColor } from './weatherColorRamp'
import type { FieldGridPoint } from './weatherFieldGrid'
import { idwInterpolate } from './weatherFieldGrid'

type Props = {
  samples: FieldGridPoint[]
  layer: WeatherMapLayerDef
  enabled: boolean
  opacity?: number
  pixelStep?: number
}

export function WeatherFieldCanvasOverlay({
  samples,
  layer,
  enabled,
  opacity = 0.42,
  pixelStep = 3,
}: Props) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || samples.length < 3) return

    const canvas = document.createElement('canvas')
    canvas.className = 'weather-field-canvas-overlay'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '215'
    canvasRef.current = canvas

    const pane = map.getPanes().overlayPane
    pane.appendChild(canvas)

    const draw = () => {
      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = size.x
      const h = size.y
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = opacity

      const isWindDir = layer.id === 'wind_direction'
      const step = Math.max(2, pixelStep)

      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const latlng = map.containerPointToLatLng([x, y])
          const value = idwInterpolate(latlng.lat, latlng.lng, samples)
          if (value == null || !Number.isFinite(value)) continue
          ctx.fillStyle = isWindDir
            ? windDirectionColor(value)
            : interpolateColor(layer.legendStops, value)
          ctx.fillRect(x, y, step, step)
        }
      }
      ctx.globalAlpha = 1
    }

    const schedule = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(draw)
    }

    schedule()
    map.on('move zoom resize viewreset', schedule)

    return () => {
      map.off('move zoom resize viewreset', schedule)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      canvas.remove()
      canvasRef.current = null
    }
  }, [map, samples, layer, enabled, opacity, pixelStep])

  return null
}
