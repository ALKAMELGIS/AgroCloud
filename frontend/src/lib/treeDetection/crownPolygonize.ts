/**
 * Crown polygon helpers: georeference instance masks and refine box detections
 * into crown rings using greenness contour inside the box crop.
 */

import type { YoloTreeBox, YoloTreeInstance } from './yoloTreeDetectionClient'
import type { TreeImageryMosaic } from './webMercatorTiles'

export type PixelRing = [number, number][]

function greenDominance(r: number, g: number, b: number): number {
  const sum = r + g + b + 1e-6
  const dom = g / sum - Math.max(r, b) / sum
  if (dom <= 0) return 0
  return Math.min(1, dom * 4)
}

/** Axis-aligned rectangle ring in pixel space. */
export function boxToPixelRing(box: YoloTreeBox): PixelRing {
  const x1 = box.xmin
  const y1 = box.ymin
  const x2 = box.xmax
  const y2 = box.ymax
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ]
}

/**
 * Marching-squares-lite: walk the exterior of a binary mask to get a closed ring.
 * Returns null if the mask is empty or too thin.
 */
export function maskToPixelRing(
  mask: Uint8Array,
  width: number,
  height: number,
  step = 2,
): PixelRing | null {
  // Collect boundary pixels along a coarse grid, then convex hull for a stable crown.
  const pts: Array<[number, number]> = []
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = y * width + x
      if (!mask[i]) continue
      const edge =
        !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]
      if (edge) pts.push([x, y])
    }
  }
  if (pts.length < 5) return null
  const hull = convexHull(pts)
  if (hull.length < 3) return null
  if (hull[0]![0] !== hull[hull.length - 1]![0] || hull[0]![1] !== hull[hull.length - 1]![1]) {
    hull.push([hull[0]![0], hull[0]![1]])
  }
  return hull
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Array<[number, number]>): PixelRing {
  const pts = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  if (pts.length <= 1) return pts
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

/**
 * Extract a crown ring from greenness inside a detection box.
 * Falls back to null when vegetation signal is weak (caller uses circle/box).
 */
export function crownRingFromBoxCrop(
  mosaic: TreeImageryMosaic,
  box: YoloTreeBox,
  greenThresh = 0.18,
): PixelRing | null {
  const { width, height, imageData } = mosaic
  const x0 = Math.max(0, Math.floor(box.xmin))
  const y0 = Math.max(0, Math.floor(box.ymin))
  const x1 = Math.min(width - 1, Math.ceil(box.xmax))
  const y1 = Math.min(height - 1, Math.ceil(box.ymax))
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  if (bw < 4 || bh < 4) return null

  const mask = new Uint8Array(bw * bh)
  const rgba = imageData.data
  let hit = 0
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const ci = (y * width + x) * 4
      const g = greenDominance(rgba[ci]!, rgba[ci + 1]!, rgba[ci + 2]!)
      if (g >= greenThresh) {
        mask[(y - y0) * bw + (x - x0)] = 1
        hit += 1
      }
    }
  }
  if (hit < 8) return null
  const local = maskToPixelRing(mask, bw, bh, Math.max(1, Math.floor(Math.min(bw, bh) / 32)))
  if (!local) return null
  return local.map(([x, y]) => [x + x0, y + y0] as [number, number])
}

/** Closed circle ring in pixel space. */
export function circlePixelRing(cx: number, cy: number, r: number, steps = 24): PixelRing {
  const ring: PixelRing = []
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  ring.push([ring[0]![0], ring[0]![1]])
  return ring
}

/** Georeference a pixel ring using mosaic.pxToLngLat. */
export function pixelRingToLngLat(
  ring: PixelRing,
  mosaic: TreeImageryMosaic,
): [number, number][] {
  return ring.map(([x, y]) => {
    const [lng, lat] = mosaic.pxToLngLat(x, y)
    return [Number(lng.toFixed(7)), Number(lat.toFixed(7))]
  })
}

export function resolveCrownPixelRing(
  mosaic: TreeImageryMosaic,
  box: YoloTreeBox,
  instance?: YoloTreeInstance | null,
): PixelRing {
  if (instance?.polygon?.length && instance.polygon.length >= 4) {
    return instance.polygon.map(([x, y]) => [x, y] as [number, number])
  }
  const fromCrop = crownRingFromBoxCrop(mosaic, box)
  if (fromCrop) return fromCrop
  const cx = (box.xmin + box.xmax) / 2
  const cy = (box.ymin + box.ymax) / 2
  const r = Math.max(2, (box.xmax - box.xmin + box.ymax - box.ymin) / 4)
  return circlePixelRing(cx, cy, r)
}

/** Simple polygon area in pixel^2 (shoelace). */
export function ringAreaPx(ring: PixelRing): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1]
  }
  return Math.abs(a) / 2
}

/** Approx IoU of two axis-aligned bboxes of rings (fast for NMS). */
export function ringBBoxIoU(a: PixelRing, b: PixelRing): number {
  const bb = (r: PixelRing) => {
    let xmin = Infinity
    let ymin = Infinity
    let xmax = -Infinity
    let ymax = -Infinity
    for (const [x, y] of r) {
      if (x < xmin) xmin = x
      if (y < ymin) ymin = y
      if (x > xmax) xmax = x
      if (y > ymax) ymax = y
    }
    return { xmin, ymin, xmax, ymax }
  }
  const A = bb(a)
  const B = bb(b)
  const ix1 = Math.max(A.xmin, B.xmin)
  const iy1 = Math.max(A.ymin, B.ymin)
  const ix2 = Math.min(A.xmax, B.xmax)
  const iy2 = Math.min(A.ymax, B.ymax)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  const areaA = Math.max(0, A.xmax - A.xmin) * Math.max(0, A.ymax - A.ymin)
  const areaB = Math.max(0, B.xmax - B.xmin) * Math.max(0, B.ymax - B.ymin)
  const uni = areaA + areaB - inter
  return uni > 0 ? inter / uni : 0
}
