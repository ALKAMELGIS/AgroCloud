import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { weatherEffectsPane } from './weatherMapPanes'
import type { FieldGridPoint, WindGridPoint } from './weatherFieldGrid'
import { buildScalarMesh, meshDimensionsForZoom, sampleMeshBilinear } from './weatherScalarMesh'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'

type Props = {
  precipSamples: FieldGridPoint[]
  windSamples: WindGridPoint[]
  layer: WeatherMapLayerDef
  enabled: boolean
  intensity?: number
}

type Drop = { x: number; y: number; speed: number; len: number }

function idwWind(lat: number, lng: number, samples: WindGridPoint[]): { u: number; v: number } {
  if (!samples.length) return { u: 0, v: 0 }
  let un = 0
  let vn = 0
  let den = 0
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (const s of samples) {
    const dx = (lng - s.lng) * cosLat
    const dy = lat - s.lat
    const d2 = dx * dx + dy * dy
    const w = 1 / Math.max(d2, 1e-8)
    un += w * s.u
    vn += w * s.v
    den += w
  }
  return den > 0 ? { u: un / den, v: vn / den } : { u: 0, v: 0 }
}

export function WeatherPrecipAnimationOverlay({
  precipSamples,
  windSamples,
  layer,
  enabled,
  intensity = 1,
}: Props) {
  const map = useMap()
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || precipSamples.length < 4) return

    const canvas = document.createElement('canvas')
    canvas.className = 'weather-precip-animation-overlay'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '218'
    weatherEffectsPane(map).appendChild(canvas)

    const drops: Drop[] = Array.from({ length: 520 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.4 + Math.random() * 0.8,
      len: 6 + Math.random() * 10,
    }))

    const tick = () => {
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
      ctx.fillRect(0, 0, w, h)

      const b = map.getBounds()
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
      const { cols, rows } = meshDimensionsForZoom(map.getZoom())
      const mesh = buildScalarMesh(precipSamples, bbox, cols, rows, layer)
      if (!mesh) return

      ctx.strokeStyle = 'rgba(147, 197, 253, 0.55)'
      ctx.lineWidth = 1.2
      ctx.beginPath()

      for (const d of drops) {
        const x = d.x * w
        const y = d.y * h
        const latlng = map.containerPointToLatLng([x, y])
        const mm = sampleMeshBilinear(mesh, latlng.lat, latlng.lng) ?? 0
        if (mm < 0.05) {
          d.x = Math.random()
          d.y = Math.random()
          continue
        }
        const { u, v } = idwWind(latlng.lat, latlng.lng, windSamples)
        const windScale = 0.35 + Math.min(2.5, mm) * 0.25
        const dx = u * windScale * intensity
        const dy = v * windScale * intensity + d.speed * (0.8 + mm * 0.15)
        const nx = x + dx
        const ny = y + dy
        ctx.moveTo(x, y)
        ctx.lineTo(x + dx * 0.3, y + dy * 0.3 + d.len * 0.15)
        d.x = nx / w
        d.y = ny / h
        if (d.x < 0 || d.x > 1 || d.y < 0 || d.y > 1) {
          d.x = Math.random()
          d.y = Math.random()
        }
      }
      ctx.stroke()
    }

    const loop = () => {
      tick()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      canvas.remove()
    }
  }, [map, precipSamples, windSamples, layer, enabled, intensity])

  return null
}
