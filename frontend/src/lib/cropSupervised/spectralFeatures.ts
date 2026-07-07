import type { CropTrainingSample, SpectralSignature, SupervisedClassDef } from './types'

export type IndexGrid = {
  ndvi: Float32Array
  ndwi: Float32Array
  ndmi: Float32Array
  valid: Uint8Array
  width: number
  height: number
}

const WEB_MERCATOR_R = 6378137
const MAX_MERCATOR_LAT = 85.05112878

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))
  const x = ((lng * Math.PI) / 180) * WEB_MERCATOR_R
  const y = WEB_MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

export function geometryBbox4326(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geometry as { coordinates?: unknown }).coordinates)
  if (!pts.length) throw new Error('AOI polygon has no coordinates.')
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

function pixelLngLat(
  x: number,
  y: number,
  width: number,
  height: number,
  bbox4326: [number, number, number, number],
): [number, number] {
  const [w, s, e, n] = bbox4326
  const lng = w + ((x + 0.5) / width) * (e - w)
  const lat = n - ((y + 0.5) / height) * (n - s)
  return [lng, lat]
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length) return false
  if (!pointInRing(lng, lat, rings[0]!)) return false
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lng, lat, rings[i]!)) return false
  }
  return true
}

function sampleRings(geom: CropTrainingSample['geometry']): number[][][] {
  if (geom.type === 'Point') return []
  if (geom.type === 'Polygon') return geom.coordinates as unknown as number[][][]
  return (geom.coordinates as unknown as number[][][][]).flat()
}

function collectSamplePixels(
  sample: CropTrainingSample,
  width: number,
  height: number,
  bbox4326: [number, number, number, number],
): number[] {
  if (sample.geometry.type === 'Point') {
    const [lng, lat] = sample.geometry.coordinates
    const [w, s, e, n] = bbox4326
    const x = Math.floor(((lng - w) / (e - w)) * width)
    const y = Math.floor(((n - lat) / (n - s)) * height)
    if (x >= 0 && x < width && y >= 0 && y < height) return [y * width + x]
    return []
  }
  const rings = sampleRings(sample.geometry)
  const pixels: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [lng, lat] = pixelLngLat(x, y, width, height, bbox4326)
      if (pointInPolygon(lng, lat, rings)) pixels.push(y * width + x)
    }
  }
  return pixels
}

/** Build a feature vector: per-timestep NDVI/NDWI/NDMI means + amplitude stats. */
export function extractSampleFeatures(
  sample: CropTrainingSample,
  grids: IndexGrid[],
  bbox4326: [number, number, number, number],
): SpectralSignature | null {
  if (!grids.length) return null
  const { width, height } = grids[0]!
  const pixels = collectSamplePixels(sample, width, height, bbox4326)
  if (!pixels.length) return null

  const perStep = grids.length * 3
  const features = new Float32Array(perStep + 3)
  const ndviSeries: number[] = []

  for (let t = 0; t < grids.length; t += 1) {
    const g = grids[t]!
    let ndviSum = 0
    let ndwiSum = 0
    let ndmiSum = 0
    let cnt = 0
    for (const p of pixels) {
      if (!g.valid[p]) continue
      ndviSum += g.ndvi[p]!
      ndwiSum += g.ndwi[p]!
      ndmiSum += g.ndmi[p]!
      cnt += 1
    }
    if (!cnt) {
      features[t * 3] = 0
      features[t * 3 + 1] = 0
      features[t * 3 + 2] = 0
      ndviSeries.push(0)
    } else {
      const mNdvi = ndviSum / cnt
      features[t * 3] = mNdvi
      features[t * 3 + 1] = ndwiSum / cnt
      features[t * 3 + 2] = ndmiSum / cnt
      ndviSeries.push(mNdvi)
    }
  }

  const minNdvi = Math.min(...ndviSeries)
  const maxNdvi = Math.max(...ndviSeries)
  features[perStep] = maxNdvi - minNdvi
  features[perStep + 1] = ndviSeries.reduce((a, b) => a + b, 0) / ndviSeries.length
  features[perStep + 2] = ndviSeries[ndviSeries.length - 1]! - ndviSeries[0]!

  return {
    className: sample.className,
    sampleId: sample.id,
    features,
    pixelCount: pixels.length,
  }
}

export function extractAllSampleFeatures(
  samples: CropTrainingSample[],
  grids: IndexGrid[],
  bbox4326: [number, number, number, number],
): SpectralSignature[] {
  const out: SpectralSignature[] = []
  for (const s of samples) {
    const sig = extractSampleFeatures(s, grids, bbox4326)
    if (sig) out.push(sig)
  }
  return out
}

export function pixelFeatureVector(
  p: number,
  grids: IndexGrid[],
): Float32Array | null {
  const perStep = grids.length * 3
  const features = new Float32Array(perStep + 3)
  const ndviSeries: number[] = []
  for (let t = 0; t < grids.length; t += 1) {
    const g = grids[t]!
    if (!g.valid[p]) return null
    features[t * 3] = g.ndvi[p]!
    features[t * 3 + 1] = g.ndwi[p]!
    features[t * 3 + 2] = g.ndmi[p]!
    ndviSeries.push(g.ndvi[p]!)
  }
  const minNdvi = Math.min(...ndviSeries)
  const maxNdvi = Math.max(...ndviSeries)
  features[perStep] = maxNdvi - minNdvi
  features[perStep + 1] = ndviSeries.reduce((a, b) => a + b, 0) / ndviSeries.length
  features[perStep + 2] = ndviSeries[ndviSeries.length - 1]! - ndviSeries[0]!
  return features
}

const CLASS_PALETTE = [
  '#f6e700',
  '#1f7a1f',
  '#e30613',
  '#f5a000',
  '#7a5a1e',
  '#ff66d1',
  '#4b5aa7',
  '#a4d08c',
  '#9fd4cf',
  '#d9d98c',
  '#9a9a9a',
  '#c45bff',
  '#00b4d8',
  '#fb8500',
  '#588157',
]

export function buildClassDefs(classNames: string[]): SupervisedClassDef[] {
  const sorted = [...classNames].sort((a, b) => a.localeCompare(b))
  return sorted.map((name, index) => ({
    name,
    color: CLASS_PALETTE[index % CLASS_PALETTE.length]!,
    index,
  }))
}

export function classIndexByName(defs: SupervisedClassDef[]): Map<string, number> {
  return new Map(defs.map(d => [d.name.toLowerCase(), d.index]))
}

export function bbox3857From4326(bbox4326: [number, number, number, number]): [number, number, number, number] {
  const [w, s, e, n] = bbox4326
  const [minX, minY] = lngLatTo3857(w, s)
  const [maxX, maxY] = lngLatTo3857(e, n)
  return [minX, minY, maxX, maxY]
}
