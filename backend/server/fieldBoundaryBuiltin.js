/**
 * Hostinger / production field delineation when Python :8092 is not running.
 * Decodes the map RGB capture (jpeg-js / pngjs) and polygonizes vegetation /
 * cultivated patches — same contract as agri-field-boundary POST /detect.
 */

import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const MAX_EDGE = 768

function decodeDataUrl(image) {
  const raw = String(image || '').trim()
  if (!raw) throw new Error('Expected image data URL or base64.')
  const comma = raw.indexOf(',')
  const header = comma >= 0 && raw.startsWith('data:') ? raw.slice(0, comma).toLowerCase() : ''
  const b64 = comma >= 0 && raw.startsWith('data:') ? raw.slice(comma + 1) : raw
  const buf = Buffer.from(b64, 'base64')
  if (!buf.length) throw new Error('Empty image payload.')

  const isPng = header.includes('image/png') || (buf[0] === 0x89 && buf[1] === 0x50)
  if (isPng) {
    const png = PNG.sync.read(buf)
    return { width: png.width, height: png.height, data: png.data }
  }
  const jpg = jpeg.decode(buf, { maxMemoryUsageInMB: 256, useTArray: true })
  return { width: jpg.width, height: jpg.height, data: Buffer.from(jpg.data) }
}

function downsampleRgba(data, width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  if (scale >= 0.999) return { data, width, height }
  const nw = Math.max(1, Math.round(width * scale))
  const nh = Math.max(1, Math.round(height * scale))
  const out = Buffer.alloc(nw * nh * 4)
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale))
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale))
      const si = (sy * width + sx) * 4
      const di = (y * nw + x) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = data[si + 3]
    }
  }
  return { data: out, width: nw, height: nh }
}

function isFieldPixel(r, g, b) {
  const sum = r + g + b || 1
  const rn = r / sum
  const gn = g / sum
  const bn = b / sum
  const exg = 2 * gn - rn - bn
  const brightness = (r + g + b) / 3

  if (g > 40 && g > r && g > b && exg > 0.02) return true
  if (g > 80 && g > r * 0.8 && g > b * 1.2) return true
  if (g > 100 && r > 80 && r < g * 1.15 && b < g * 0.6 && g > b * 1.5) return true
  if (g > 30 && g > r * 1.3 && g > b * 1.3 && brightness < 120) return true

  // Arid cropland: darker warm soil, not bright sand / rock.
  if (brightness > 45 && brightness < 155 && r > g && r > b && Math.abs(r - g) > 8 && r > b * 1.15) {
    return true
  }
  return false
}

function morphErode(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) out[i] = 1
    }
  }
  return out
}

function morphDilate(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) out[i] = 1
    }
  }
  return out
}

function pointInPolygon(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside
  }
  return inside
}

function extractAoiRings(aoi) {
  if (!aoi || typeof aoi !== 'object') return []
  const rings = []
  const addGeom = g => {
    if (!g) return
    if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) rings.push(g.coordinates[0])
    if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) {
        if (Array.isArray(poly?.[0])) rings.push(poly[0])
      }
    }
  }
  if (aoi.type === 'FeatureCollection') {
    for (const f of aoi.features || []) addGeom(f?.geometry)
  } else if (aoi.type === 'Feature') addGeom(aoi.geometry)
  else addGeom(aoi)
  return rings
}

function applyAoiMask(mask, width, height, bbox, aoi) {
  const rings = extractAoiRings(aoi)
  if (!rings.length) return
  const [west, south, east, north] = bbox
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!mask[idx]) continue
      const lon = west + (x / Math.max(width - 1, 1)) * (east - west)
      const lat = north - (y / Math.max(height - 1, 1)) * (north - south)
      if (!rings.some(ring => pointInPolygon(lon, lat, ring))) mask[idx] = 0
    }
  }
}

function findComponents(mask, width, height, minPixels) {
  const visited = new Uint8Array(width * height)
  const components = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!mask[idx] || visited[idx]) continue
      const pixels = []
      const queue = [idx]
      visited[idx] = 1
      while (queue.length) {
        const ci = queue.pop()
        pixels.push(ci)
        const cy = (ci / width) | 0
        const cx = ci % width
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const ni = ny * width + nx
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1
            queue.push(ni)
          }
        }
      }
      if (pixels.length < minPixels) continue
      const edgePixels = []
      for (const pi of pixels) {
        const py = (pi / width) | 0
        const px = pi % width
        let isEdge = false
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
            isEdge = true
            break
          }
        }
        if (isEdge) edgePixels.push([px, py])
      }
      components.push({ edgePixels, pixelCount: pixels.length })
    }
  }
  return components
}

function convexHull(points) {
  if (points.length <= 2) return points.slice()
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function pointToLineDist(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function simplifyRing(ring, epsilon) {
  if (ring.length <= 3) return ring
  let maxDist = 0
  let maxIdx = 0
  const first = ring[0]
  const last = ring[ring.length - 1]
  for (let i = 1; i < ring.length - 1; i++) {
    const d = pointToLineDist(ring[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRing(ring.slice(0, maxIdx + 1), epsilon)
    const right = simplifyRing(ring.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

function metersPerDeg(lat) {
  const r = (lat * Math.PI) / 180
  const mLat = 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r)
  const mLon = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r)
  return { mLon: Math.max(mLon, 1), mLat: Math.max(mLat, 1) }
}

function componentToPolygon(comp, width, height, bbox, opts = {}) {
  const preserveGeometry = Boolean(opts.preserveGeometry)
  const [west, south, east, north] = bbox
  const hull = convexHull(comp.edgePixels)
  if (hull.length < 3) return null
  let geoRing = hull.map(([px, py]) => [
    west + (px / Math.max(width - 1, 1)) * (east - west),
    north - (py / Math.max(height - 1, 1)) * (north - south),
  ])
  const diagDeg = Math.hypot(east - west, north - south)
  if (!preserveGeometry) {
    geoRing = simplifyRing(geoRing, diagDeg * 0.002)
  }
  if (geoRing.length < 3) return null
  geoRing.push([...geoRing[0]])
  const latMid = (south + north) / 2
  const { mLon, mLat } = metersPerDeg(latMid)
  const mCoords = geoRing.map(([lon, lat]) => [lon * mLon, lat * mLat])
  let area = 0
  let perimeter = 0
  for (let i = 0; i < mCoords.length - 1; i++) {
    area += mCoords[i][0] * mCoords[i + 1][1]
    area -= mCoords[i + 1][0] * mCoords[i][1]
    perimeter += Math.hypot(mCoords[i + 1][0] - mCoords[i][0], mCoords[i + 1][1] - mCoords[i][1])
  }
  return { ring: geoRing, areaM2: Math.abs(area) / 2, perimeterM: perimeter }
}

function polygonizeMaskWork({
  mask,
  width,
  height,
  bbox,
  aoi,
  minAreaM2,
  source,
  engine,
  defaultConfidence = 0.55,
  preserveGeometry = false,
}) {
  applyAoiMask(mask, width, height, bbox, aoi)
  const cleaned = preserveGeometry ? mask : morphDilate(morphErode(mask, width, height), width, height)
  const minArea = Number(minAreaM2 ?? 1) || 1
  const pxPerM2 = (() => {
    const [west, south, east, north] = bbox
    const { mLon, mLat } = metersPerDeg((south + north) / 2)
    const areaM2 = Math.abs((east - west) * mLon * (north - south) * mLat)
    return width * height / Math.max(areaM2, 1)
  })()
  const minPixels = Math.max(8, Math.round(minArea * pxPerM2 * 0.35))
  const components = findComponents(cleaned, width, height, minPixels)
  const features = []
  let scoreSum = 0
  for (const comp of components) {
    const poly = componentToPolygon(comp, width, height, bbox, { preserveGeometry })
    if (!poly || poly.areaM2 < minArea) continue
    const confidence = defaultConfidence
    scoreSum += confidence
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [poly.ring] },
      properties: {
        field_id: `FTW-${String(features.length + 1).padStart(4, '0')}`,
        confidence,
        confidence_mean: confidence,
        area_m2: Math.round(poly.areaM2 * 100) / 100,
        area_ha: Math.round((poly.areaM2 / 10000) * 10000) / 10000,
        perimeter_m: Math.round(poly.perimeterM * 10) / 10,
        source: source || 'ftw-raster-mosaic',
      },
    })
  }
  const count = features.length
  return {
    geojson: { type: 'FeatureCollection', features },
    count,
    score: count ? Math.round((scoreSum / count) * 10000) / 10000 : 0,
    engine,
    device: 'cpu',
    source: source || 'ftw-raster-mosaic',
    stats: { field: count },
    aoi_applied: Boolean(aoi),
    width,
    height,
  }
}

/** Vectorize a white-on-black binary mask PNG (FTW raster mosaic). */
export function vectorizeBinaryMaskBuiltin(body, { maxEdge = 2048 } = {}) {
  const bbox = body?.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error('bbox must be [west, south, east, north].')
  }
  const decoded = decodeDataUrl(body.mask ?? body.image)
  const preserve = Boolean(body.preserve_geometry)
  const work = preserve
    ? { width: decoded.width, height: decoded.height, data: decoded.data }
    : downsampleRgba(decoded.data, decoded.width, decoded.height, maxEdge)
  const { width, height, data } = work
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const lum = Math.max(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0)
    mask[i] = lum > 127 ? 1 : 0
  }
  return polygonizeMaskWork({
    mask,
    width,
    height,
    bbox,
    aoi: body.aoi,
    minAreaM2: body.min_area_m2 ?? body.minAreaM2 ?? 500,
    source: body.source || 'ftw-raster-mosaic',
    engine: body.preserve_geometry
      ? 'ftw-raster-mosaic-seamless-builtin'
      : body.engine || 'ftw-raster-mosaic-builtin',
    defaultConfidence: 0.55,
    preserveGeometry: Boolean(body.preserve_geometry),
  })
}

/**
 * @param {{ image?: string, bbox: number[], aoi?: object, min_confidence?: number, min_area_m2?: number, minConfidence?: number, minAreaM2?: number, source?: string }} body
 */
export function detectFieldsBuiltin(body) {
  const bbox = body?.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error('bbox must be [west, south, east, north].')
  }
  const decoded = decodeDataUrl(body.image)
  const work = downsampleRgba(decoded.data, decoded.width, decoded.height, MAX_EDGE)
  const { width, height, data } = work
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    if (isFieldPixel(data[o], data[o + 1], data[o + 2])) mask[i] = 1
  }
  applyAoiMask(mask, width, height, bbox, body.aoi)
  const cleaned = morphDilate(morphErode(mask, width, height), width, height)
  const minArea = Number(body.min_area_m2 ?? body.minAreaM2 ?? 1) || 1
  const pxPerM2 = (() => {
    const [west, south, east, north] = bbox
    const { mLon, mLat } = metersPerDeg((south + north) / 2)
    const areaM2 = Math.abs((east - west) * mLon * (north - south) * mLat)
    return width * height / Math.max(areaM2, 1)
  })()
  const minPixels = Math.max(12, Math.round(minArea * pxPerM2))
  const components = findComponents(cleaned, width, height, minPixels)
  const features = []
  let scoreSum = 0
  for (const comp of components) {
    const poly = componentToPolygon(comp, width, height, bbox)
    if (!poly || poly.areaM2 < minArea) continue
    const confidence = Math.min(0.92, 0.35 + Math.min(0.5, comp.pixelCount / (width * height * 0.08)))
    scoreSum += confidence
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [poly.ring] },
      properties: {
        field_id: `F-${String(features.length + 1).padStart(3, '0')}`,
        confidence,
        area_m2: Math.round(poly.areaM2 * 100) / 100,
        area_ha: Math.round((poly.areaM2 / 10000) * 10000) / 10000,
        perimeter_m: Math.round(poly.perimeterM * 10) / 10,
      },
    })
  }
  const count = features.length
  return {
    geojson: { type: 'FeatureCollection', features },
    count,
    score: count ? Math.round((scoreSum / count) * 10000) / 10000 : 0,
    engine: 'spectral-builtin',
    device: 'cpu',
    source: body.source || 'basemap',
    stats: { field: count, fallback_from: 'python-8092' },
    aoi_applied: Boolean(body.aoi),
    width,
    height,
  }
}
