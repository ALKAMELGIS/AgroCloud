import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { weatherEffectsPane } from './weatherMapPanes'
import type { WindGridPoint } from './weatherFieldGrid'

type Props = {
  samples: WindGridPoint[]
  enabled: boolean
  particleCount?: number
}

function idwComponent(
  lat: number,
  lng: number,
  samples: WindGridPoint[],
  field: 'u' | 'v',
  power = 2,
): number {
  if (!samples.length) return 0
  let num = 0
  let den = 0
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (const s of samples) {
    const dx = (lng - s.lng) * cosLat
    const dy = lat - s.lat
    const d2 = dx * dx + dy * dy
    if (d2 < 1e-10) return s[field]
    const w = 1 / Math.pow(d2, power / 2)
    num += w * s[field]
    den += w
  }
  return den > 0 ? num / den : 0
}

type Particle = { lat: number; lng: number; age: number }

export function WeatherWindParticleOverlay({ samples, enabled, particleCount = 1400 }: Props) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || samples.length < 4) return

    const canvas = document.createElement('canvas')
    canvas.className = 'weather-wind-particle-overlay'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '220'
    canvasRef.current = canvas
    weatherEffectsPane(map).appendChild(canvas)

    const bounds = map.getBounds()
    const seed = () => {
      const pts: Particle[] = []
      for (let i = 0; i < particleCount; i++) {
        pts.push({
          lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
          lng: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
          age: Math.random() * 120,
        })
      }
      particlesRef.current = pts
    }
    seed()

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
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      const b = map.getBounds()
      const zoom = map.getZoom()
      const stepScale = Math.max(0.35, 2.4 - zoom * 0.22)

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)'
      ctx.lineWidth = 1
      ctx.beginPath()

      for (const p of particlesRef.current) {
        const u = idwComponent(p.lat, p.lng, samples, 'u')
        const v = idwComponent(p.lat, p.lng, samples, 'v')
        const from = map.latLngToContainerPoint([p.lat, p.lng])
        const dLat = (v * stepScale) / 111_000
        const dLng = (u * stepScale) / (111_000 * Math.cos((p.lat * Math.PI) / 180))
        p.lat += dLat
        p.lng += dLng
        p.age += 1
        const to = map.latLngToContainerPoint([p.lat, p.lng])
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)

        if (
          p.age > 90 ||
          p.lat < b.getSouth() ||
          p.lat > b.getNorth() ||
          p.lng < b.getWest() ||
          p.lng > b.getEast()
        ) {
          p.lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth())
          p.lng = b.getWest() + Math.random() * (b.getEast() - b.getWest())
          p.age = 0
        }
      }
      ctx.stroke()
    }

    const loop = () => {
      tick()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const onMove = () => seed()
    map.on('moveend zoomend', onMove)

    return () => {
      map.off('moveend zoomend', onMove)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      canvas.remove()
      canvasRef.current = null
    }
  }, [map, samples, enabled, particleCount])

  return null
}
