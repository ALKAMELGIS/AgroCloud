import { buildDepthRgbaBuffer } from './floodColorRamp'
import type { FloodSimulationResult, FloodVisualizationMode } from './floodTypes'

export function depthFieldForMode(
  result: FloodSimulationResult,
  frameIndex: number,
  mode: FloodVisualizationMode,
): Float32Array {
  const frame = result.frames[Math.min(frameIndex, result.frames.length - 1)]
  if (!frame) return new Float32Array(result.width * result.height)
  if (mode === 'maxDepth') return result.maxDepthGrid
  if (mode === 'flowSpeed') {
    const out = new Float32Array(frame.depth.length)
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.hypot(frame.vx[i], frame.vy[i])
    }
    return out
  }
  if (mode === 'flowPaths') {
    return frame.depth
  }
  return frame.depth
}

export function applyAoiMaskToField(result: FloodSimulationResult, field: Float32Array): Float32Array {
  const { mask } = result
  if (!mask.length || mask.length !== field.length) return field
  const out = new Float32Array(field.length)
  for (let i = 0; i < field.length; i++) {
    out[i] = mask[i] ? field[i] : 0
  }
  return out
}

export function floodPreviewDataUrl(
  result: FloodSimulationResult,
  frameIndex: number,
  mode: FloodVisualizationMode,
  _opacity: number,
): string {
  const field = applyAoiMaskToField(result, depthFieldForMode(result, frameIndex, mode))
  const rgba = buildDepthRgbaBuffer(field, 1)
  const canvas = document.createElement('canvas')
  canvas.width = result.width
  canvas.height = result.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), result.width, result.height), 0, 0)
  return canvas.toDataURL('image/png')
}

export function floodImageCoordinates(
  bbox: FloodSimulationResult['bbox'],
): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [bbox.west, bbox.north],
    [bbox.east, bbox.north],
    [bbox.east, bbox.south],
    [bbox.west, bbox.south],
  ]
}
