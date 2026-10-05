import type { ColorStop } from './weatherColorRamp'
import { interpolateColor } from './weatherColorRamp'

/** 256×1 RGBA lookup for GPU scalar coloring. */
export function buildColorLutRgba(stops: ColorStop[], min: number, max: number): Uint8Array {
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const value = min + (max - min) * t
    const css = interpolateColor(stops, value)
    const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (m) {
      lut[i * 4] = Number(m[1])
      lut[i * 4 + 1] = Number(m[2])
      lut[i * 4 + 2] = Number(m[3])
      lut[i * 4 + 3] = 255
    } else {
      lut[i * 4 + 3] = 0
    }
  }
  return lut
}
