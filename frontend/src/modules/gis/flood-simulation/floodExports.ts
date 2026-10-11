import { buildDepthRgbaBuffer } from './floodColorRamp'
import type { FloodSimulationResult, SimulationConfig } from './floodTypes'

export function exportFloodConfigJson(config: SimulationConfig, result: FloodSimulationResult | null): Blob {
  const payload = {
    config,
    summary: result
      ? {
          frames: result.frames.length,
          backend: result.backend,
          cellSizeM: result.cellSizeM,
          bbox: result.bbox,
        }
      : null,
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function exportFloodDepthPng(
  depth: Float32Array,
  width: number,
  height: number,
  opacity = 0.92,
): Promise<Blob> {
  const rgba = buildDepthRgbaBuffer(depth, opacity)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  const img = new ImageData(new Uint8ClampedArray(rgba), width, height)
  ctx.putImageData(img, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('png'))), 'image/png')
  })
}

export async function downloadFloodDepthPng(
  depth: Float32Array,
  width: number,
  height: number,
  filename = 'flood-depth.png',
): Promise<void> {
  const blob = await exportFloodDepthPng(depth, width, height)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportFloodExtentGeoJson(
  result: FloodSimulationResult,
  frameIndex: number,
  depthThresholdM = 0.05,
): GeoJSON.FeatureCollection {
  const frame = result.frames[Math.min(frameIndex, result.frames.length - 1)]
  const { width, height, bbox, cellSizeM } = result
  const features: GeoJSON.Feature[] = []
  const dLng = (bbox.east - bbox.west) / width
  const dLat = (bbox.north - bbox.south) / height
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i
      if (!result.mask[idx] || frame.depth[idx] < depthThresholdM) continue
      const west = bbox.west + i * dLng
      const east = west + dLng
      const north = bbox.north - j * dLat
      const south = north - dLat
      features.push({
        type: 'Feature',
        properties: {
          depthM: frame.depth[idx],
          maxDepthM: result.maxDepthGrid[idx],
          cellSizeM,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, north],
              [east, north],
              [east, south],
              [west, south],
              [west, north],
            ],
          ],
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
