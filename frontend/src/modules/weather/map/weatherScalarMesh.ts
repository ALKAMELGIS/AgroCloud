import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import type { FieldGridPoint, LngLatBBox } from './weatherFieldGrid'
import { idwInterpolate } from './weatherFieldGrid'

export type ScalarMesh = {
  cols: number
  rows: number
  bbox: LngLatBBox
  values: Float32Array
  min: number
  max: number
}

export function meshDimensionsForZoom(zoom: number): { cols: number; rows: number } {
  if (zoom >= 12) return { cols: 96, rows: 96 }
  if (zoom >= 10) return { cols: 80, rows: 80 }
  if (zoom >= 8) return { cols: 72, rows: 72 }
  return { cols: 64, rows: 64 }
}

export function legendValueRange(layer: WeatherMapLayerDef): { min: number; max: number } {
  const stops = layer.legendStops
  if (!stops.length) return { min: 0, max: 1 }
  let min = stops[0].value
  let max = stops[0].value
  for (const s of stops) {
    min = Math.min(min, s.value)
    max = Math.max(max, s.value)
  }
  if (max - min < 1e-6) max = min + 1
  return { min, max }
}

export function buildScalarMesh(
  samples: FieldGridPoint[],
  bbox: LngLatBBox,
  cols: number,
  rows: number,
  layer: WeatherMapLayerDef,
): ScalarMesh | null {
  if (samples.length < 3) return null
  const { min, max } = legendValueRange(layer)
  const values = new Float32Array(cols * rows)
  let hasData = false
  for (let j = 0; j < rows; j++) {
    const lat = bbox.south + ((bbox.north - bbox.south) * j) / Math.max(rows - 1, 1)
    for (let i = 0; i < cols; i++) {
      const lng = bbox.west + ((bbox.east - bbox.west) * i) / Math.max(cols - 1, 1)
      const v = idwInterpolate(lat, lng, samples, 2.2)
      if (v != null && Number.isFinite(v)) {
        values[j * cols + i] = v
        hasData = true
      } else {
        values[j * cols + i] = NaN
      }
    }
  }
  if (!hasData) return null
  return { cols, rows, bbox, values, min, max }
}

export function sampleMeshBilinear(mesh: ScalarMesh, lat: number, lng: number): number | null {
  const { bbox, cols, rows, values } = mesh
  if (lng < bbox.west || lng > bbox.east || lat < bbox.south || lat > bbox.north) return null
  const fx = ((lng - bbox.west) / Math.max(bbox.east - bbox.west, 1e-9)) * (cols - 1)
  const fy = ((lat - bbox.south) / Math.max(bbox.north - bbox.south, 1e-9)) * (rows - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const v00 = values[y0 * cols + x0]
  const v10 = values[y0 * cols + x1]
  const v01 = values[y1 * cols + x0]
  const v11 = values[y1 * cols + x1]
  if ([v00, v10, v01, v11].some(v => !Number.isFinite(v))) return null
  const top = v00 + (v10 - v00) * tx
  const bot = v01 + (v11 - v01) * tx
  return top + (bot - top) * ty
}
