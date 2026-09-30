import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { worldPxToLngLat } from '@/modules/ai/detection/tree/webMercatorTiles'

function cropElevBand(
  elev: Float32Array,
  srcW: number,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
): Float32Array {
  const out = new Float32Array(cw * ch)
  for (let y = 0; y < ch; y += 1) {
    const srcRow = (y0 + y) * srcW + x0
    out.set(elev.subarray(srcRow, srcRow + cw), y * cw)
  }
  return out
}

function cropMaskBand(mask: Uint8Array, srcW: number, x0: number, y0: number, cw: number, ch: number): Uint8Array {
  const out = new Uint8Array(cw * ch)
  for (let y = 0; y < ch; y += 1) {
    const srcRow = (y0 + y) * srcW + x0
    out.set(mask.subarray(srcRow, srcRow + cw), y * cw)
  }
  return out
}

function demWithCrop(dem: DemGrid, x0: number, y0: number, cw: number, ch: number, elev: Float32Array): DemGrid {
  const originWorldPxX = dem.originWorldPxX + x0
  const originWorldPxY = dem.originWorldPxY + y0
  const { zoom } = dem
  const pxToLngLat = (cx: number, cy: number): [number, number] =>
    worldPxToLngLat(originWorldPxX + cx, originWorldPxY + cy, zoom)
  return {
    ...dem,
    width: cw,
    height: ch,
    elev,
    originWorldPxX,
    originWorldPxY,
    cornerCoords: [pxToLngLat(0, 0), pxToLngLat(cw, 0), pxToLngLat(cw, ch), pxToLngLat(0, ch)],
    pxToLngLat,
  }
}

/** Tight crop around AOI mask pixels (with padding) to shrink compute + previews. */
export function trimDemGridWithMask(
  dem: DemGrid,
  mask: Uint8Array | null,
  padPx = 2,
): { dem: DemGrid; mask: Uint8Array | null } | null {
  if (!mask?.length) return null
  const { width: w, height: h } = dem
  if (mask.length !== w * h) return null

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null

  const x0 = Math.max(0, minX - padPx)
  const y0 = Math.max(0, minY - padPx)
  const x1 = Math.min(w - 1, maxX + padPx)
  const y1 = Math.min(h - 1, maxY + padPx)
  const cw = x1 - x0 + 1
  const ch = y1 - y0 + 1
  if (cw === w && ch === h) return { dem, mask }

  const elev = cropElevBand(dem.elev, w, x0, y0, cw, ch)
  const croppedMask = cropMaskBand(mask, w, x0, y0, cw, ch)
  return { dem: demWithCrop(dem, x0, y0, cw, ch, elev), mask: croppedMask }
}

export function cropBandToDem(
  dem: DemGrid,
  band: Float32Array,
  fromDem: DemGrid,
): Float32Array {
  if (dem.width === fromDem.width && dem.height === fromDem.height) return band
  const { width: w, height: h } = fromDem
  const dx = dem.originWorldPxX - fromDem.originWorldPxX
  const dy = dem.originWorldPxY - fromDem.originWorldPxY
  const x0 = dx
  const y0 = dy
  return cropElevBand(band, w, x0, y0, dem.width, dem.height)
}
