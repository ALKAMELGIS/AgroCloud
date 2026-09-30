/**
 * On-device tree-crown detector (no backend, no GPU, no model service).
 *
 * A dependency-free fallback so AI Tree Detection ALWAYS produces results even
 * when the hosted model service (backend/services/tree-detection) is offline or
 * unconfigured. It runs a classic tree-top finder over the AOI imagery mosaic
 * and emits boxes in the exact `YoloTreeBox` shape the rest of the pipeline
 * (`crownsFromBoxes` → `assembleTreeResult`) already expects, so georeferencing,
 * AOI clipping, cross-tile de-duplication, size/vigour classification and
 * statistics are all unchanged.
 *
 * Method (per imagery mosaic, all in the mosaic's pixel space):
 *   1. Per-pixel "treeness" = max of two basemap signatures, so it adapts to
 *      whatever the imagery looks like:
 *        a. green dominance (illumination-invariant) — green canopy, and
 *        b. dark-blob top-hat (local background brightness − pixel) — dark tree
 *           crowns on bright bare soil / sand (arid palms), which carry almost
 *           no green signal and were previously missed.
 *   2. Separable box blur to consolidate each crown into one blob.
 *   3. Separable max-filter → local maxima (one peak ≈ one tree-top).
 *   4. Adaptive threshold (scene mean + k·std, k from the confidence gate).
 *   5. Half-peak radial growth (per direction) → crown radius, with an
 *      elongation gate that rejects roads / field edges / shadows lines.
 *
 * When a real model endpoint is reachable it is always preferred (higher
 * accuracy); this only runs as the offline fallback.
 */

import type { YoloTreeBox } from './yoloTreeDetectionClient'

export type LocalCrownDetectOptions = {
  /** Confidence gate in [0,1]; higher → fewer, stronger detections. */
  score?: number
  /** Ground sample distance of the mosaic (m/px) — sizes the crown windows. */
  metersPerPixel: number
  /** Expected typical crown radius (m). Default 2.2. */
  typicalCrownRadiusM?: number
  /** Minimum spacing between two crowns (m). Default 3.2. */
  minTreeSpacingM?: number
  /** Reject crowns smaller / larger than these diameters (m). */
  minCrownDiameterM?: number
  maxCrownDiameterM?: number
}

/** Illumination-invariant green dominance in [0,1] (matches treeDetectionEngine). */
function greenDominanceAt(r: number, g: number, b: number): number {
  const sum = r + g + b + 1e-6
  const dom = g / sum - Math.max(r, b) / sum
  if (dom <= 0) return 0
  return Math.min(1, dom * 4)
}

/** Separable box blur (horizontal then vertical), radius r, O(n·r). */
function boxBlur(src: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r < 1) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const win = 2 * r + 1
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let acc = 0
    for (let x = -r; x <= r; x += 1) acc += src[row + Math.min(width - 1, Math.max(0, x))]!
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = acc / win
      const xAdd = Math.min(width - 1, x + r + 1)
      const xSub = Math.max(0, x - r)
      acc += src[row + xAdd]! - src[row + xSub]!
    }
  }
  for (let x = 0; x < width; x += 1) {
    let acc = 0
    for (let y = -r; y <= r; y += 1) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]!
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = acc / win
      const yAdd = Math.min(height - 1, y + r + 1)
      const ySub = Math.max(0, y - r)
      acc += tmp[yAdd * width + x]! - tmp[ySub * width + x]!
    }
  }
  return out
}

/** Separable max filter (dilation), radius r, O(n·r). */
function maxFilter(src: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r < 1) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      let m = 0
      for (let dx = -r; dx <= r; dx += 1) {
        const v = src[row + Math.min(width - 1, Math.max(0, x + dx))]!
        if (v > m) m = v
      }
      tmp[row + x] = m
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let m = 0
      for (let dy = -r; dy <= r; dy += 1) {
        const v = tmp[Math.min(height - 1, Math.max(0, y + dy)) * width + x]!
        if (v > m) m = v
      }
      out[y * width + x] = m
    }
  }
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Detect tree crowns in ONE imagery mosaic, returning boxes in the mosaic's
 * pixel space (origin top-left) — the same contract as the model service.
 */
export function detectTreeBoxesLocal(imageData: ImageData, opts: LocalCrownDetectOptions): YoloTreeBox[] {
  const { data, width, height } = imageData
  const n = width * height
  if (n === 0) return []

  const mpp = opts.metersPerPixel > 0 ? opts.metersPerPixel : 0.3
  const crownRadiusPx = clamp((opts.typicalCrownRadiusM ?? 2.2) / mpp, 2, 48)
  const minDiaM = opts.minCrownDiameterM ?? 1.2
  const maxDiaM = opts.maxCrownDiameterM ?? 40

  // 1a. Per-pixel luminance + green dominance.
  const lum = new Float32Array(n)
  const green = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p += 1) {
    if (data[i + 3]! === 0) {
      lum[p] = 1 // transparent → treat as bright background (never a dark crown)
      green[p] = 0
      continue
    }
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    lum[p] = (r + g + b) / 765 // /(3*255)
    green[p] = greenDominanceAt(r, g, b)
  }

  // 1b. Dark-blob top-hat: how much darker a pixel is than its LOCAL background.
  // This is what lights up dark tree crowns sitting on bright sand/soil — the
  // arid-palm case that has no green signal. Background = a large-radius blur
  // (several crown widths) so single crowns don't darken their own background.
  const bgRadius = Math.max(3, Math.round(crownRadiusPx * 2.5))
  const bgLum = boxBlur(lum, width, height, bgRadius)
  const DARK_GAIN = 3 // ~0.3 luminance drop below background → full response

  // 1c. Treeness = strongest available signature (green OR dark-blob).
  const treeness = new Float32Array(n)
  for (let p = 0; p < n; p += 1) {
    const dark = clamp((bgLum[p]! - lum[p]!) * DARK_GAIN, 0, 1)
    const g = green[p]!
    treeness[p] = dark > g ? dark : g
  }

  // 2. Consolidate each crown into a single blob.
  const resp = boxBlur(treeness, width, height, Math.max(1, Math.round(crownRadiusPx * 0.5)))

  // 3. Local maxima via max-filter (one peak per crown).
  const nmsR = Math.max(2, Math.round(((opts.minTreeSpacingM ?? 3.2) / mpp) * 0.5))
  const dil = maxFilter(resp, width, height, nmsR)

  // 4. Adaptive threshold from scene statistics.
  let mean = 0
  for (let p = 0; p < n; p += 1) mean += resp[p]!
  mean /= n
  let varSum = 0
  for (let p = 0; p < n; p += 1) {
    const d = resp[p]! - mean
    varSum += d * d
  }
  const std = Math.sqrt(varSum / n)
  const score = clamp(opts.score ?? 0.25, 0.02, 0.9)
  const k = 0.3 + score * 2.0
  const thr = Math.max(0.06, mean + k * std)

  const minRpx = minDiaM / 2 / mpp
  const maxRpx = maxDiaM / 2 / mpp
  const growLimit = Math.ceil(crownRadiusPx * 2.2)
  // Reject blobs whose long axis is this many× the short axis — i.e. linear
  // features (roads, field edges, shadow lines) rather than compact crowns.
  const MAX_ELONGATION = 3.0

  /** Half-peak run length from (x,y) along (dx,dy), in pixels. */
  const growDir = (x: number, y: number, dx: number, dy: number, half: number): number => {
    let d = 1
    for (; d <= growLimit; d += 1) {
      const sx = x + dx * d
      const sy = y + dy * d
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) break
      if (resp[sy * width + sx]! < half) break
    }
    return d
  }

  const boxes: YoloTreeBox[] = []
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const v = resp[row + x]!
      if (v < thr) continue
      // Strict local maximum (peak === dilation at this pixel).
      if (v < dil[row + x]! - 1e-6) continue

      // 5. Crown radius via half-peak radial growth, measured per axis so we
      // can test compactness.
      const half = v * 0.5
      const dRight = growDir(x, y, 1, 0, half)
      const dLeft = growDir(x, y, -1, 0, half)
      const dDown = growDir(x, y, 0, 1, half)
      const dUp = growDir(x, y, 0, -1, half)
      const hExt = (dLeft + dRight) / 2
      const vExt = (dUp + dDown) / 2
      const longAxis = Math.max(hExt, vExt)
      const shortAxis = Math.max(1, Math.min(hExt, vExt))
      if (longAxis / shortAxis > MAX_ELONGATION) continue // elongated → not a crown

      const rPx = clamp((hExt + vExt) / 2, minRpx, maxRpx)
      const diaM = clamp(2 * rPx * mpp, minDiaM, maxDiaM)
      if (diaM < minDiaM || diaM > maxDiaM) continue

      const bxR = diaM / 2 / mpp
      const normScore = clamp(0.45 + (v - thr) * 1.4 + Math.min(0.2, std), 0.3, 0.98)
      boxes.push({
        xmin: x - bxR,
        ymin: y - bxR,
        xmax: x + bxR,
        ymax: y + bxR,
        score: Number(normScore.toFixed(3)),
        label: 'Tree',
      })
    }
  }
  return boxes
}
