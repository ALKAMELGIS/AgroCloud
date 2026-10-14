import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import type { CutFillAnalysisResult } from './cutFillTypes'

/** Match on-map preview resolution; Word layout handles captions/legends. */
const REPORT_MAX_EDGE = 1280

export type CutFillReportMapFigure = {
  label: string
  /** One-line legend under the map card in Word (not baked into the PNG). */
  legendCaption: string
  base64: string
}

type RGBA = [number, number, number, number]

function reportScale(w: number, h: number): { outW: number; outH: number; step: number } {
  const maxEdge = Math.max(w, h)
  if (maxEdge <= REPORT_MAX_EDGE) return { outW: w, outH: h, step: 1 }
  const step = Math.ceil(maxEdge / REPORT_MAX_EDGE)
  return { outW: Math.max(1, Math.ceil(w / step)), outH: Math.max(1, Math.ceil(h / step)), step }
}

function reportRasterToBase64(
  dem: DemGrid,
  aoiMask: Uint8Array | null,
  colorAt: (i: number) => RGBA,
): string {
  const { width: w, height: h } = dem
  const { outW, outH, step } = reportScale(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(outW, outH)
  const data = img.data
  for (let oy = 0; oy < outH; oy += 1) {
    for (let ox = 0; ox < outW; ox += 1) {
      const x = ox * step
      const y = oy * step
      const i = y * w + x
      const p = (oy * outW + ox) * 4
      if (aoiMask && !aoiMask[i]) {
        data[p + 3] = 0
        continue
      }
      const [r, g, b, a] = colorAt(i)
      data[p] = r
      data[p + 1] = g
      data[p + 2] = b
      data[p + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : ''
}

export async function buildReportMapFigures(
  result: CutFillAnalysisResult,
  aoiMask: Uint8Array | null,
): Promise<CutFillReportMapFigure[]> {
  const { dem, existingElev, designElev, difference, classification } = result
  let eMin = Infinity
  let eMax = -Infinity
  for (let i = 0; i < existingElev.length; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const a = existingElev[i]!
    const b = designElev[i]!
    if (Number.isFinite(a)) {
      eMin = Math.min(eMin, a)
      eMax = Math.max(eMax, a)
    }
    if (Number.isFinite(b)) {
      eMin = Math.min(eMin, b)
      eMax = Math.max(eMax, b)
    }
  }
  if (!Number.isFinite(eMin)) {
    eMin = 0
    eMax = 1
  }
  const elevRgb = (e: number): RGBA => {
    if (!Number.isFinite(e)) return [0, 0, 0, 0]
    const t = eMax > eMin ? (e - eMin) / (eMax - eMin) : 0.5
    return [Math.round(40 + t * 80), Math.round(80 + t * 120), Math.round(60 + (1 - t) * 40), 230]
  }

  const specs: Array<[string, string, (i: number) => RGBA]> = [
    [
      'Cut / Fill classification',
      'Cut (red) · Fill (green) · No change (gray)',
      i => {
        const c = classification[i]!
        if (c === 1) return [220, 38, 38, 220]
        if (c === 2) return [22, 163, 74, 220]
        return [180, 180, 180, 100]
      },
    ],
    [
      'Elevation difference (design − existing)',
      'Green = fill (ΔZ negative) · Red = cut (ΔZ positive)',
      i => {
        const dz = difference[i]!
        if (!Number.isFinite(dz)) return [0, 0, 0, 0]
        if (dz > 0.01) {
          const t = Math.min(1, dz / 4)
          return [Math.round(232 - 40 * t), Math.round(150 * (1 - t) + 48), 36, 210]
        }
        if (dz < -0.01) {
          const t = Math.min(1, -dz / 4)
          return [34, Math.round(150 + 70 * t), Math.round(90 - 40 * t), 210]
        }
        return [161, 161, 170, 90]
      },
    ],
    ['Existing surface', 'Elevation ramp (low → high)', i => elevRgb(existingElev[i]!)],
    ['Design surface', 'Elevation ramp (low → high)', i => elevRgb(designElev[i]!)],
  ]

  return specs.map(([label, legendCaption, colorAt]) => ({
    label,
    legendCaption,
    base64: reportRasterToBase64(dem, aoiMask, colorAt),
  }))
}
