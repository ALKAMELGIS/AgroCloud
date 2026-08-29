/**
 * Post-process FTW seamless raster — heals tile-cut stairstep edges and micro-gaps
 * without merging the underlying PMTiles data.
 */

export type FtwSeamlessPostProcessOptions = {
  /** Axis-aligned morphological close radius (px). Default 2. */
  closeRadiusPx?: number
  /** Mask feather blur radius (px). Default 1. */
  blurRadiusPx?: number
}

function dilateHorizontal(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < w && src[row + nx]) {
          v = 255
          break
        }
      }
      out[row + x] = v
    }
  }
  return out
}

function dilateVertical(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < h && src[ny * w + x]) {
          v = 255
          break
        }
      }
      out[y * w + x] = v
    }
  }
  return out
}

function erodeHorizontal(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let ok = true
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= w || !src[row + nx]) {
          ok = false
          break
        }
      }
      out[row + x] = ok ? 255 : 0
    }
  }
  return out
}

function erodeVertical(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = true
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h || !src[ny * w + x]) {
          ok = false
          break
        }
      }
      out[y * w + x] = ok ? 255 : 0
    }
  }
  return out
}

/** Close axis-aligned tile seams (MVT clip stairsteps). */
function morphCloseAxis(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let m = dilateHorizontal(mask, w, h, r)
  m = dilateVertical(m, w, h, r)
  m = erodeHorizontal(m, w, h, r)
  m = erodeVertical(m, w, h, r)
  return m
}

function boxBlurMask(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  const diam = r * 2 + 1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= w) continue
        sum += src[y * w + nx]!
        n++
      }
      tmp[y * w + x] = Math.round(sum / n)
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        sum += tmp[ny * w + x]!
        n++
      }
      out[y * w + x] = Math.round(sum / n)
    }
  }

  void diam
  return out
}

function sampleNearestFilledRgb(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  maxRadius = 6,
): [number, number, number] {
  const i = y * w + x
  if (mask[i]) {
    const o = i * 4
    return [data[o]!, data[o + 1]!, data[o + 2]!]
  }
  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (!mask[ni]) continue
        const o = ni * 4
        return [data[o]!, data[o + 1]!, data[o + 2]!]
      }
    }
  }
  return [0, 0, 0]
}

/** Smooth tile-cut jagged edges on a painted FTW seamless canvas. */
export function postProcessFtwSeamlessCanvas(
  canvas: HTMLCanvasElement,
  options?: FtwSeamlessPostProcessOptions,
): void {
  const w = canvas.width
  const h = canvas.height
  if (w <= 0 || h <= 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const src = ctx.getImageData(0, 0, w, h)
  const filled = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    filled[i] =
      src.data[o + 3]! > 8 || src.data[o]! > 8 || src.data[o + 1]! > 8 || src.data[o + 2]! > 8 ? 255 : 0
  }

  const closeR = Math.max(1, Math.min(4, options?.closeRadiusPx ?? 2))
  const blurR = Math.max(0, Math.min(3, options?.blurRadiusPx ?? 1))

  let smoothMask = morphCloseAxis(filled, w, h, closeR)
  if (blurR > 0) smoothMask = boxBlurMask(smoothMask, w, h, blurR)

  const out = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const alpha = smoothMask[i]!
      if (alpha < 12) continue
      const o = i * 4
      const [r, g, b] = sampleNearestFilledRgb(src.data, filled, w, h, x, y)
      out.data[o] = r
      out.data[o + 1] = g
      out.data[o + 2] = b
      out.data[o + 3] = alpha
    }
  }

  ctx.putImageData(out, 0, 0)
}
