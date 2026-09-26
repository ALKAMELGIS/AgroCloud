import type { DemGrid } from '../hydroWatershed/terrainTiles'
import type { CutFillRasterLayer } from './cutFillTypes'

type RGBA = [number, number, number, number]

const PREVIEW_MAX_EDGE = 640

function previewScale(w: number, h: number): { outW: number; outH: number; step: number } {
  const maxEdge = Math.max(w, h)
  if (maxEdge <= PREVIEW_MAX_EDGE) return { outW: w, outH: h, step: 1 }
  const step = Math.ceil(maxEdge / PREVIEW_MAX_EDGE)
  return {
    outW: Math.max(1, Math.ceil(w / step)),
    outH: Math.max(1, Math.ceil(h / step)),
    step,
  }
}

function rasterToDataUrl(
  dem: DemGrid,
  aoiMask: Uint8Array | null,
  colorAt: (i: number) => RGBA,
): string {
  const { width: w, height: h } = dem
  const { outW, outH, step } = previewScale(w, h)
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
  return canvas.toDataURL('image/png')
}

function elevToTerrainRgb(e: number, min: number, max: number): RGBA {
  if (!Number.isFinite(e)) return [0, 0, 0, 0]
  const t = max > min ? (e - min) / (max - min) : 0.5
  const r = Math.round(40 + t * 80)
  const g = Math.round(80 + t * 120)
  const b = Math.round(60 + (1 - t) * 40)
  return [r, g, b, 220]
}

export function buildElevationPreviewLayer(
  dem: DemGrid,
  elev: Float32Array,
  mask: Uint8Array | null,
  opacity = 0.85,
): CutFillRasterLayer {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < elev.length; i += 1) {
    if (mask && !mask[i]) continue
    const v = elev[i]!
    if (!Number.isFinite(v)) continue
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  if (!Number.isFinite(min)) {
    min = 0
    max = 1
  }
  return {
    dataUrl: rasterToDataUrl(dem, mask, i => elevToTerrainRgb(elev[i]!, min, max)),
    coordinates: dem.cornerCoords,
    opacity,
  }
}

export function buildDifferencePreviewLayer(
  dem: DemGrid,
  difference: Float32Array,
  mask: Uint8Array | null,
): CutFillRasterLayer {
  return {
    dataUrl: rasterToDataUrl(dem, mask, i => {
      const dz = difference[i]!
      if (!Number.isFinite(dz)) return [0, 0, 0, 0]
      // Cut = warm red/orange, fill = green. Outside the AOI stays transparent.
      if (dz > 0.01) {
        const t = Math.min(1, dz / 4)
        return [Math.round(232 - 40 * t), Math.round(150 * (1 - t) + 48), 36, Math.round(150 + 80 * t)]
      }
      if (dz < -0.01) {
        const t = Math.min(1, -dz / 4)
        return [34, Math.round(150 + 70 * t), Math.round(90 - 40 * t), Math.round(150 + 80 * t)]
      }
      return [161, 161, 170, 70]
    }),
    coordinates: dem.cornerCoords,
    opacity: 0.88,
  }
}

export const CUT_FILL_MAP_SWATCH = {
  CUT: '#dc2626',
  FILL: '#16a34a',
  NO_CHANGE: '#a1a1aa',
} as const

const CLASS_MASK_RGBA: Record<0 | 1 | 2, RGBA> = {
  1: [220, 38, 38, 200],
  2: [22, 163, 74, 200],
  0: [161, 161, 170, 140],
}

/** One class only. Cells outside the AOI (non-finite ΔZ) stay transparent so the basemap remains visible. */
export function buildClassMaskLayer(
  dem: DemGrid,
  classification: Uint8Array,
  difference: Float32Array,
  code: 0 | 1 | 2,
): CutFillRasterLayer {
  const color = CLASS_MASK_RGBA[code]
  return {
    dataUrl: rasterToDataUrl(dem, null, i => {
      const dz = difference[i]
      if (dz == null || !Number.isFinite(dz)) return [0, 0, 0, 0]
      if (classification[i] !== code) return [0, 0, 0, 0]
      return color
    }),
    coordinates: dem.cornerCoords,
    opacity: 0.92,
  }
}

export function buildCutFillClassMasks(
  dem: DemGrid,
  classification: Uint8Array,
  difference: Float32Array,
): { cut: CutFillRasterLayer; fill: CutFillRasterLayer; noChange: CutFillRasterLayer } {
  return {
    cut: buildClassMaskLayer(dem, classification, difference, 1),
    fill: buildClassMaskLayer(dem, classification, difference, 2),
    noChange: buildClassMaskLayer(dem, classification, difference, 0),
  }
}

export function buildClassificationPreviewLayer(
  dem: DemGrid,
  classification: Uint8Array,
  mask: Uint8Array | null,
): CutFillRasterLayer {
  return {
    dataUrl: rasterToDataUrl(dem, mask, i => {
      const c = classification[i]!
      if (c === 1) return [220, 38, 38, 200]
      if (c === 2) return [22, 163, 74, 200]
      return [180, 180, 180, 80]
    }),
    coordinates: dem.cornerCoords,
    opacity: 0.75,
  }
}
