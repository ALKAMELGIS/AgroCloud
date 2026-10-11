/** Encode depth (m) to RGBA for GPU texture (0 = transparent). */
export function depthToRgba(depthM: number, opacity = 1): [number, number, number, number] {
  if (!Number.isFinite(depthM) || depthM <= 0.0002) return [0, 0, 0, 0]
  const t = depthM <= 0.05 ? depthM / 0.05 : depthM <= 0.1 ? 0.2 + (depthM - 0.05) / 0.05 * 0.15 : depthM <= 0.25
    ? 0.35 + (depthM - 0.1) / 0.15 * 0.2
    : depthM <= 0.5
      ? 0.55 + (depthM - 0.25) / 0.25 * 0.2
      : depthM <= 1
        ? 0.75 + (depthM - 0.5) / 0.5 * 0.15
        : depthM <= 2
          ? 0.9 + (depthM - 1) / 1 * 0.08
          : 1
  const hue = 0.54 - t * 0.14
  const sat = 0.88 + t * 0.1
  const light = 0.42 + t * 0.38
  const c = hslToRgb(hue, sat, light)
  const a = Math.min(1, (0.55 + t * 0.45) * opacity)
  return [c[0], c[1], c[2], a]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hueToRgb(p, q, hue + 1 / 3)
  const g = hueToRgb(p, q, hue)
  const b = hueToRgb(p, q, hue - 1 / 3)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

export function buildDepthRgbaBuffer(depth: Float32Array, opacity = 0.92): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(depth.length * 4)
  for (let i = 0; i < depth.length; i++) {
    const [r, g, b, a] = depthToRgba(depth[i], opacity)
    const o = i * 4
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = Math.round(a * 255)
  }
  return rgba
}
