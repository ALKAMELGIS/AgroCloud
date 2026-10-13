import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import {
  computeDevelopEliteSpaceBlend,
  type DevelopEliteSpaceCamera,
} from './developEliteMapSpaceEnvironment'
import { paintDevelopEliteMapSpaceStarfield } from './developEliteMapSpaceStarfieldCanvas'

type Props = {
  hostRef: RefObject<HTMLDivElement | null>
}

function readCamera(map: {
  getZoom: () => number
  getPitch: () => number
  getBearing: () => number
}): DevelopEliteSpaceCamera {
  return {
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  }
}

/** Procedural star dome behind MapLibre — synced to globe bearing/pitch/zoom. */
export function DevelopEliteMapSpaceBackdrop({ hostRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    const map = mapRef.current
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!map || !canvas || !host) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let raf = 0
    let running = true

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const paint = (timeMs: number) => {
      raf = 0
      if (!running) return
      const camera = readCamera(map)
      const blend = computeDevelopEliteSpaceBlend(camera)
      host.classList.toggle('develop-elite-map__viewport--space-canvas', blend > 0.04)
      const rect = host.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      paintDevelopEliteMapSpaceStarfield(ctx, w, h, camera, blend, timeMs)
      if (blend > 0.04 && running) {
        raf = requestAnimationFrame(paint)
      }
    }

    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(paint)
    }

    resize()
    schedule()

    map.on('move', schedule)
    map.on('zoom', schedule)
    map.on('rotate', schedule)
    map.on('pitch', schedule)
    map.on('moveend', schedule)

    const ro = new ResizeObserver(() => {
      resize()
      schedule()
    })
    ro.observe(host)

    return () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      map.off('move', schedule)
      map.off('zoom', schedule)
      map.off('rotate', schedule)
      map.off('pitch', schedule)
      map.off('moveend', schedule)
      ro.disconnect()
      host.classList.remove('develop-elite-map__viewport--space-canvas')
    }
  }, [hostRef, mapReady, mapRef])

  return (
    <canvas
      ref={canvasRef}
      className="develop-elite-map__space-starfield"
      aria-hidden
      role="presentation"
    />
  )
}
