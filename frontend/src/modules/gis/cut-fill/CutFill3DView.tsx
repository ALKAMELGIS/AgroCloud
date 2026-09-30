import { useEffect, useRef } from 'react'
import type { CutFillAnalysisResult } from './cutFillTypes'
import { CUT_FILL_CLASS_CUT, CUT_FILL_CLASS_FILL } from './cutFillEngine'

type Props = {
  result: CutFillAnalysisResult | null
}

/** Inset preview — does not move the main map camera. */
export function CutFill3DView({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !result) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { dem, difference, classification } = result
    const w = canvas.width
    const h = canvas.height
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, w, h)
    const stepX = Math.max(1, Math.floor(dem.width / w))
    const stepY = Math.max(1, Math.floor(dem.height / h))
    let minDz = Infinity
    let maxDz = -Infinity
    for (let i = 0; i < difference.length; i += 1) {
      const v = difference[i]!
      if (!Number.isFinite(v)) continue
      minDz = Math.min(minDz, v)
      maxDz = Math.max(maxDz, v)
    }
    const span = Math.max(0.01, maxDz - minDz)
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const gx = Math.min(dem.width - 1, px * stepX)
        const gy = Math.min(dem.height - 1, py * stepY)
        const i = gy * dem.width + gx
        const cls = classification[i]!
        let color = 'rgba(100,116,139,0.35)'
        if (cls === CUT_FILL_CLASS_CUT) {
          const t = (difference[i]! - minDz) / span
          color = `rgba(220,${Math.round(40 + 40 * (1 - t))},40,0.9)`
        } else if (cls === CUT_FILL_CLASS_FILL) {
          const t = (-difference[i]! - -maxDz) / span
          color = `rgba(40,${Math.round(100 + 80 * t)},220,0.9)`
        }
        ctx.fillStyle = color
        const dz = difference[i]!
        const extrude = Number.isFinite(dz) ? Math.min(6, Math.abs(dz)) : 0
        ctx.fillRect(px, py - extrude, 1, 1 + extrude)
      }
    }
  }, [result])

  if (!result) return null

  return (
    <details className="si-cutfill__3d" style={{ marginBottom: 10 }}>
      <summary>3D cut/fill preview (inset)</summary>
      <canvas ref={canvasRef} width={280} height={120} style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
    </details>
  )
}
