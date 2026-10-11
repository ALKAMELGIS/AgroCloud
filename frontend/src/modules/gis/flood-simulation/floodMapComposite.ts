import { buildDepthRgbaBuffer } from './floodColorRamp'
import type { FloodFineTune, FloodSimulationResult, FloodVisualizationMode } from './floodTypes'
import { applyAoiMaskToField, depthFieldForMode } from './floodRasterPreview'

/** Draw white/cyan flow streaks on the RGBA buffer (reference-style surface flow). */
function paintFlowStreaks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  vx: Float32Array,
  vy: Float32Array,
  mask: Uint8Array,
  fineTune: FloodFineTune,
): void {
  const density = Math.max(4, Math.round(14 / Math.max(0.25, fineTune.flowLineDensity)))
  const len = Math.max(3, Math.round(6 * fineTune.flowLineThickness))
  const velScale = fineTune.velocityExaggeration

  for (let j = density; j < height - density; j += density) {
    for (let i = density; i < width - density; i += density) {
      const idx = j * width + i
      if (mask.length && !mask[idx]) continue
      const speed = Math.hypot(vx[idx], vy[idx]) * velScale
      if (speed < 0.008) continue
      const dx = vx[idx] / speed
      const dy = vy[idx] / speed
      const strength = Math.min(1, speed * 8)
      const o = idx * 4
      if (rgba[o + 3] < 40) continue
      for (let s = 0; s < len; s++) {
        const px = Math.round(i + dx * s)
        const py = Math.round(j + dy * s)
        if (px < 0 || py < 0 || px >= width || py >= height) break
        const pi = (py * width + px) * 4
        const blend = strength * (1 - s / len)
        rgba[pi] = Math.min(255, rgba[pi] + blend * 180)
        rgba[pi + 1] = Math.min(255, rgba[pi + 1] + blend * 220)
        rgba[pi + 2] = Math.min(255, rgba[pi + 2] + blend * 255)
        rgba[pi + 3] = Math.min(255, rgba[pi + 3] + blend * 120)
      }
    }
  }
}

export function buildFloodMapCompositeRgba(
  result: FloodSimulationResult,
  frameIndex: number,
  mode: FloodVisualizationMode,
  fineTune: FloodFineTune,
): Uint8ClampedArray {
  const frame = result.frames[Math.min(frameIndex, result.frames.length - 1)]
  if (!frame) return new Uint8ClampedArray(result.width * result.height * 4)

  let field = applyAoiMaskToField(result, depthFieldForMode(result, frameIndex, mode))
  if (fineTune.depthExaggeration !== 1) {
    const ex = fineTune.depthExaggeration
    const boosted = new Float32Array(field.length)
    for (let i = 0; i < field.length; i++) boosted[i] = field[i] * ex
    field = boosted
  }

  const rgba = buildDepthRgbaBuffer(field, 1)
  const showFlow = mode === 'depthTime' || mode === 'flowPaths' || mode === 'flowSpeed'
  if (showFlow && frame.vx.length === field.length) {
    paintFlowStreaks(rgba, result.width, result.height, frame.vx, frame.vy, result.mask, fineTune)
  }
  return rgba
}

export function floodMapCompositeDataUrl(
  result: FloodSimulationResult,
  frameIndex: number,
  mode: FloodVisualizationMode,
  fineTune: FloodFineTune,
): string {
  const rgba = buildFloodMapCompositeRgba(result, frameIndex, mode, fineTune)
  const canvas = document.createElement('canvas')
  canvas.width = result.width
  canvas.height = result.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(new ImageData(rgba, result.width, result.height), 0, 0)
  return canvas.toDataURL('image/png')
}
