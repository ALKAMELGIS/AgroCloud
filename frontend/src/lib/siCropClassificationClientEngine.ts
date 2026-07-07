/**
 * Client-side country-aware crop classification engine.
 *
 * Faithful in-browser port of the backend `country` engine
 * (`backend/server/cropClassificationProxy.js` → `cropFieldClassifier.js` +
 * `cropCountryDatabase.js`). Lets the Crop AI tool run fully client-side on a
 * static deployment (GitHub Pages / Hostinger static) with NO Node backend:
 *   AOI → Sentinel Hub OGC WMS index grids (browser fetch + canvas) → NDVI
 *   phenology classification → colored Crop Type layer.
 *
 * Sentinel Hub WMS sends CORS headers, so the browser can read GetMap pixels via
 * canvas. The heavy ML `prithvi` engine still needs the GPU backend; only the
 * default deterministic engine is ported here.
 */

import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from './sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl } from './sentinelHubWmsInstance'
import { assertCropPanelProvider } from './cropSupervised/cropDataProvider'
import { resolveCropPipelineProfile } from './cropSupervised/cropProviderPipelineProfile'
import type {
  CropClassificationJob,
  CropClassificationJobStatus,
  CropClassLegendItem,
  RunAoiInput,
} from './siPrithviCropPipeline'

/* ───────────────────────── Country crop database (ported) ───────────────────────── */

const NORM_POSITIONS = [0, 0.2, 0.4, 0.6, 0.8, 1]

type LandcoverDef = { id: string; name: string; nameAr: string; color: string }

const BASE_LANDCOVER: LandcoverDef[] = [
  { id: 'water', name: 'Water', nameAr: 'مياه', color: '#3b6fc9' },
  { id: 'built', name: 'Built-up / Urban', nameAr: 'عمران / مبانٍ وطرق', color: '#8a8a8a' },
  { id: 'bare', name: 'Bare soil / Fallow', nameAr: 'تربة عارية / بور', color: '#c9b079' },
  { id: 'natural', name: 'Natural / Sparse vegetation', nameAr: 'غطاء طبيعي / متفرّق', color: '#6b8f4e' },
]

type CropDef = {
  name: string
  nameAr: string
  color: string
  ndvi: number[]
  wantsWater?: boolean
  evergreen?: boolean
  pivotForage?: boolean
}

const CROP_CATALOG: Record<string, CropDef> = {
  wheat: { name: 'Wheat', nameAr: 'قمح', color: '#e0c341', ndvi: [0.15, 0.45, 0.75, 0.82, 0.5, 0.2] },
  barley: { name: 'Barley', nameAr: 'شعير', color: '#c9a227', ndvi: [0.15, 0.5, 0.78, 0.72, 0.4, 0.18] },
  maize: { name: 'Maize / Corn', nameAr: 'ذرة', color: '#f2e600', ndvi: [0.18, 0.35, 0.7, 0.85, 0.6, 0.25] },
  rice: { name: 'Rice', nameAr: 'أرز', color: '#1f8a4c', ndvi: [0.1, 0.3, 0.65, 0.88, 0.7, 0.3], wantsWater: true },
  cotton: { name: 'Cotton', nameAr: 'قطن', color: '#e34234', ndvi: [0.15, 0.3, 0.55, 0.8, 0.75, 0.35] },
  sorghum: { name: 'Sorghum', nameAr: 'ذرة رفيعة', color: '#f5a000', ndvi: [0.18, 0.35, 0.62, 0.8, 0.6, 0.28] },
  soybean: { name: 'Soybeans', nameAr: 'فول صويا', color: '#2e7d32', ndvi: [0.18, 0.35, 0.65, 0.82, 0.55, 0.25] },
  potato: { name: 'Potato', nameAr: 'بطاطس', color: '#a0522d', ndvi: [0.2, 0.55, 0.8, 0.7, 0.4, 0.2] },
  vegetables: { name: 'Vegetables', nameAr: 'خضروات', color: '#9acd5e', ndvi: [0.2, 0.6, 0.7, 0.5, 0.6, 0.45] },
  rhodes: { name: 'Rhodes Grass', nameAr: 'حشيشة رودس', color: '#b14bd8', ndvi: [0.5, 0.74, 0.56, 0.76, 0.58, 0.74], pivotForage: true },
  alfalfa: { name: 'Alfalfa', nameAr: 'برسيم حجازي', color: '#ff5ec8', ndvi: [0.55, 0.8, 0.6, 0.82, 0.62, 0.8], pivotForage: true },
  forage_sorghum: { name: 'Forage Sorghum', nameAr: 'ذرة رفيعة علفية', color: '#d2691e', ndvi: [0.2, 0.42, 0.72, 0.84, 0.58, 0.3], pivotForage: true },
  silage_maize: { name: 'Forage Maize / Silage', nameAr: 'ذرة علفية / سيلاج', color: '#ffae00', ndvi: [0.2, 0.42, 0.78, 0.86, 0.45, 0.22], pivotForage: true },
  forage_barley: { name: 'Forage Barley', nameAr: 'شعير علفي', color: '#aee03a', ndvi: [0.18, 0.55, 0.8, 0.62, 0.35, 0.18], pivotForage: true },
  forage_millet: { name: 'Forage Millet', nameAr: 'دخن علفي', color: '#62b53f', ndvi: [0.2, 0.48, 0.76, 0.6, 0.3, 0.2], pivotForage: true },
  pasture: { name: 'Natural Pasture Grass', nameAr: 'مراعٍ طبيعية', color: '#3f9b5a', ndvi: [0.25, 0.42, 0.52, 0.46, 0.36, 0.28] },
  sugarcane: { name: 'Sugarcane', nameAr: 'قصب سكر', color: '#1f6f3f', ndvi: [0.5, 0.65, 0.78, 0.85, 0.82, 0.7], evergreen: true },
  datepalm: { name: 'Date Palm / Orchard', nameAr: 'نخيل / بساتين', color: '#7a5a1e', ndvi: [0.58, 0.6, 0.63, 0.64, 0.62, 0.59], evergreen: true },
}

type ResolvedCrop = {
  id: string
  name: string
  nameAr: string
  color: string
  ndvi: number[]
  wantsWater: boolean
  evergreen: boolean
  pivotForage: boolean
}

function crop(id: string): ResolvedCrop {
  const c = CROP_CATALOG[id]
  return {
    id,
    name: c.name,
    nameAr: c.nameAr,
    color: c.color,
    ndvi: c.ndvi,
    wantsWater: !!c.wantsWater,
    evergreen: !!c.evergreen,
    pivotForage: !!c.pivotForage,
  }
}

const COUNTRY_CROPS: Record<string, string[]> = {
  SA: ['rhodes', 'alfalfa', 'forage_sorghum', 'silage_maize', 'forage_barley', 'wheat', 'maize', 'potato', 'vegetables', 'datepalm'],
  EG: ['wheat', 'rice', 'cotton', 'maize', 'silage_maize', 'alfalfa', 'sugarcane', 'potato', 'vegetables'],
  IQ: ['wheat', 'barley', 'rice', 'alfalfa', 'maize', 'vegetables', 'datepalm'],
  AE: ['rhodes', 'alfalfa', 'forage_sorghum', 'silage_maize', 'vegetables', 'wheat', 'datepalm'],
  JO: ['wheat', 'barley', 'alfalfa', 'vegetables', 'potato', 'datepalm'],
  MA: ['wheat', 'barley', 'alfalfa', 'silage_maize', 'vegetables', 'maize'],
  DZ: ['wheat', 'barley', 'alfalfa', 'vegetables', 'maize', 'datepalm'],
  SD: ['sorghum', 'forage_sorghum', 'wheat', 'cotton', 'alfalfa', 'forage_millet', 'vegetables'],
  KW: ['rhodes', 'alfalfa', 'vegetables', 'forage_sorghum'],
  OM: ['rhodes', 'alfalfa', 'vegetables', 'datepalm', 'forage_sorghum'],
  QA: ['rhodes', 'alfalfa', 'vegetables', 'forage_sorghum'],
  US: ['maize', 'soybean', 'wheat', 'cotton', 'sorghum', 'alfalfa', 'silage_maize'],
  IN: ['rice', 'wheat', 'cotton', 'sugarcane', 'sorghum', 'forage_millet', 'vegetables'],
  default: ['wheat', 'maize', 'alfalfa', 'rhodes', 'silage_maize', 'vegetables', 'potato'],
}

const COUNTRY_NAMES: Record<string, string> = {
  SA: 'Saudi Arabia', EG: 'Egypt', IQ: 'Iraq', AE: 'United Arab Emirates', JO: 'Jordan',
  MA: 'Morocco', DZ: 'Algeria', SD: 'Sudan', US: 'United States', IN: 'India',
  KW: 'Kuwait', OM: 'Oman', QA: 'Qatar',
}

const COUNTRY_BBOXES: Array<[string, [number, number, number, number]]> = [
  ['SA', [34.5, 16.0, 55.7, 32.2]],
  ['EG', [24.7, 22.0, 36.9, 31.7]],
  ['IQ', [38.8, 29.0, 48.6, 37.4]],
  ['AE', [51.0, 22.6, 56.4, 26.1]],
  ['JO', [34.9, 29.2, 39.3, 33.4]],
  ['MA', [-13.2, 27.7, -1.0, 35.9]],
  ['DZ', [-8.7, 18.9, 12.0, 37.1]],
  ['SD', [21.8, 8.7, 38.6, 22.2]],
  ['KW', [46.5, 28.5, 48.5, 30.1]],
  ['QA', [50.7, 24.5, 51.7, 26.2]],
  ['OM', [52.0, 16.6, 59.9, 26.4]],
  ['IN', [68.1, 6.7, 97.4, 35.5]],
  ['US', [-125.0, 24.5, -66.9, 49.4]],
]

type CropProfile = {
  country: string
  crops: ResolvedCrop[]
  landcover: LandcoverDef[]
  classes: CropClassLegendItem[]
}

function cropProfileForCountry(code: string): CropProfile {
  const ids = COUNTRY_CROPS[code] || COUNTRY_CROPS.default
  const crops = ids.map(crop)
  const classes: CropClassLegendItem[] = [
    ...crops.map(c => ({ id: c.id, name: c.name, nameAr: c.nameAr, color: c.color, kind: 'crop' as const })),
    ...BASE_LANDCOVER.map(l => ({ id: l.id, name: l.name, nameAr: l.nameAr, color: l.color, kind: 'landcover' as const })),
  ]
  return { country: COUNTRY_NAMES[code] || code, crops, landcover: BASE_LANDCOVER, classes }
}

type AoiGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon

function aoiCentroid(geometry: AoiGeometry): [number, number] | null {
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
  if (!pts.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < minX) minX = lng
    if (lng > maxX) maxX = lng
    if (lat < minY) minY = lat
    if (lat > maxY) maxY = lat
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

function countryFromBbox(lng: number, lat: number): string | null {
  for (const [code, [w, s, e, n]] of COUNTRY_BBOXES) {
    if (lng >= w && lng <= e && lat >= s && lat <= n) return code
  }
  return null
}

type DetectedCountry = { code: string; name: string; source: 'nominatim' | 'bbox' | 'default' }

async function detectCountryFromAoi(geometry: AoiGeometry): Promise<DetectedCountry> {
  const c = aoiCentroid(geometry)
  if (!c) return { code: 'default', name: 'Unknown', source: 'default' }
  const [lng, lat] = c
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=5&accept-language=en`
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (res.ok) {
      const json = await res.json()
      const code = String(json?.address?.country_code || '').toUpperCase()
      const name = String(json?.address?.country || COUNTRY_NAMES[code] || code || 'Unknown')
      if (code) return { code, name, source: 'nominatim' }
    }
  } catch {
    /* fall through to offline */
  }
  const bboxCode = countryFromBbox(lng, lat)
  if (bboxCode) return { code: bboxCode, name: COUNTRY_NAMES[bboxCode] || bboxCode, source: 'bbox' }
  return { code: 'default', name: 'Unknown', source: 'default' }
}

/* ───────────────────────── Classifier (ported, canvas PNG) ───────────────────────── */

type IndexGrid = {
  ndvi: Float32Array
  ndwi: Float32Array
  ndmi: Float32Array
  valid: Uint8Array
  width: number
  height: number
}

type ClassStat = { id: string; name: string; pct: number }

function hexToRgb(hex: string): [number, number, number] {
  const h = String(hex).replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function resampleToPhenophases(values: number[], srcFracs: number[]): number[] {
  const out = new Array(NORM_POSITIONS.length)
  for (let k = 0; k < NORM_POSITIONS.length; k += 1) {
    const x = NORM_POSITIONS[k]
    let lo = 0
    while (lo < srcFracs.length - 1 && srcFracs[lo + 1] < x) lo += 1
    const hi = Math.min(lo + 1, srcFracs.length - 1)
    if (lo === hi) {
      out[k] = values[lo]
    } else {
      const t = (x - srcFracs[lo]) / Math.max(1e-6, srcFracs[hi] - srcFracs[lo])
      out[k] = values[lo] + t * (values[hi] - values[lo])
    }
  }
  return out
}

function distanceTransform(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9
  const dt = new Float32Array(width * height)
  for (let i = 0; i < dt.length; i += 1) dt[i] = mask[i] ? INF : 0
  const a = 1
  const b = Math.SQRT2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (dt[p] === 0) continue
      let m = dt[p]
      if (x > 0) m = Math.min(m, dt[p - 1] + a)
      if (y > 0) m = Math.min(m, dt[p - width] + a)
      if (x > 0 && y > 0) m = Math.min(m, dt[p - width - 1] + b)
      if (x < width - 1 && y > 0) m = Math.min(m, dt[p - width + 1] + b)
      dt[p] = m
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const p = y * width + x
      if (dt[p] === 0) continue
      let m = dt[p]
      if (x < width - 1) m = Math.min(m, dt[p + 1] + a)
      if (y < height - 1) m = Math.min(m, dt[p + width] + a)
      if (x < width - 1 && y < height - 1) m = Math.min(m, dt[p + width + 1] + b)
      if (x > 0 && y < height - 1) m = Math.min(m, dt[p + width - 1] + b)
      dt[p] = m
    }
  }
  return dt
}

function detectPivotFields(
  croplandMask: Uint8Array,
  width: number,
  height: number,
): { inPivot: Uint8Array; pivotId: Int32Array } {
  const n = width * height
  const inPivot = new Uint8Array(n)
  const pivotId = new Int32Array(n).fill(-1)
  let diskCount = 0

  const dt = distanceTransform(croplandMask, width, height)
  const RMIN = Math.max(4, Math.round(0.02 * Math.min(width, height)))
  const WIN = 2
  const centers: Array<[number, number, number]> = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const r = dt[p]
      if (r < RMIN) continue
      let isMax = true
      for (let dy = -WIN; dy <= WIN && isMax; dy += 1) {
        for (let dx = -WIN; dx <= WIN; dx += 1) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
          if (dt[ny * width + nx] > r) { isMax = false; break }
        }
      }
      if (isMax) centers.push([x, y, r])
    }
  }
  centers.sort((u, v) => v[2] - u[2])
  for (let i = 0; i < centers.length; i += 1) {
    const cx = centers[i][0]
    const cy = centers[i][1]
    const r = centers[i][2]
    if (inPivot[cy * width + cx]) continue
    const id = diskCount++
    const rr = r * 1.02
    const r2 = rr * rr
    const x0 = Math.max(0, Math.floor(cx - rr))
    const x1 = Math.min(width - 1, Math.ceil(cx + rr))
    const y0 = Math.max(0, Math.floor(cy - rr))
    const y1 = Math.min(height - 1, Math.ceil(cy + rr))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const ddx = x - cx
        const ddy = y - cy
        if (ddx * ddx + ddy * ddy <= r2) {
          const q = y * width + x
          inPivot[q] = 1
          if (pivotId[q] < 0) pivotId[q] = id
        }
      }
    }
  }

  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const comp = new Int32Array(n)
  for (let p0 = 0; p0 < n; p0 += 1) {
    if (!croplandMask[p0] || seen[p0]) continue
    let top = 0
    stack[top++] = p0
    seen[p0] = 1
    let count = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (top > 0) {
      const p = stack[--top]
      comp[count++] = p
      const x = p % width
      const y = (p - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && croplandMask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1 }
      if (x < width - 1 && croplandMask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1 }
      if (y > 0 && croplandMask[p - width] && !seen[p - width]) { seen[p - width] = 1; stack[top++] = p - width }
      if (y < height - 1 && croplandMask[p + width] && !seen[p + width]) { seen[p + width] = 1; stack[top++] = p + width }
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const d = Math.max(w, h)
    const diskArea = Math.PI * (d / 2) * (d / 2)
    const fill = count / diskArea
    const aspect = Math.min(w, h) / Math.max(w, h)
    if (count >= 50 && aspect >= 0.75 && fill >= 0.6 && fill <= 1.15) {
      const id = diskCount++
      for (let i = 0; i < count; i += 1) {
        const q = comp[i]
        inPivot[q] = 1
        if (pivotId[q] < 0) pivotId[q] = id
      }
    }
  }

  for (let p = 0; p < n; p += 1) {
    if (inPivot[p] && !croplandMask[p]) {
      inPivot[p] = 0
      pivotId[p] = -1
    }
  }
  return { inPivot, pivotId }
}

type ClassifyResult = {
  pngDataUrl: string
  width: number
  height: number
  classStats: ClassStat[]
  pivots: { pixels: number; pctOfCropland: number }
  fields: { objects: number; pivotObjects: number }
}

function classifyCropFields(grids: IndexGrid[], profile: CropProfile): ClassifyResult {
  if (!grids.length) throw new Error('No imagery grids to classify.')
  const { width, height } = grids[0]
  const n = width * height
  const K = grids.length
  const srcFracs = grids.map((_, i) => (K === 1 ? 0 : i / (K - 1)))

  const crops = profile.crops
  const landcover = profile.landcover
  const water = landcover.find(l => l.id === 'water')!
  const bare = landcover.find(l => l.id === 'bare')!
  const built = landcover.find(l => l.id === 'built')!
  const natural = landcover.find(l => l.id === 'natural')!

  const WATER_IDX = crops.length
  const BUILT_IDX = crops.length + 1
  const BARE_IDX = crops.length + 2
  const NATURAL_IDX = crops.length + 3
  const classMeta = [
    ...crops.map(c => ({ id: c.id, name: c.name, color: c.color })),
    { id: water.id, name: water.name, color: water.color },
    { id: built.id, name: built.name, color: built.color },
    { id: bare.id, name: bare.name, color: bare.color },
    { id: natural.id, name: natural.name, color: natural.color },
  ]

  const WATER_NDWI = 0.2
  const WATER_MAXNDVI = 0.28
  const BUILT_MAXNDVI = 0.3
  const BUILT_NDMI = -0.12
  const BARE_MAXNDVI = 0.3
  const CROP_PEAK_MIN = 0.45
  const CROP_AMP_MIN = 0.22
  const NATURAL_FLOOR = 0.3

  const cropProtos = crops.map(c => c.ndvi)
  const labels = new Int16Array(n).fill(-1)

  const CROPLAND_PENDING = -2
  const VEG_FLOOR = 0.22
  const EVERGREEN_MIN_NDVI = 0.45
  const EVERGREEN_MAX_AMP = 0.18
  const EVERGREEN_MAX_DIST = 0.06
  const EVERGREEN_MIN_OBJ = 40
  const croplandMask = new Uint8Array(n)
  const vegMask = new Uint8Array(n)
  const sampledAll = new Float32Array(n * NORM_POSITIONS.length)
  const minNdviArr = new Float32Array(n)
  const maxNdviArr = new Float32Array(n)
  const meanNdwiArr = new Float32Array(n)

  const series = new Array(K)
  const fracs = new Array(K)
  for (let p = 0; p < n; p += 1) {
    let cnt = 0
    let ndwiSum = 0
    let ndmiSum = 0
    let maxNdvi = -1
    let minNdvi = 2
    for (let d = 0; d < K; d += 1) {
      if (!grids[d].valid[p]) continue
      const v = grids[d].ndvi[p]
      series[cnt] = v
      fracs[cnt] = srcFracs[d]
      ndwiSum += grids[d].ndwi[p]
      ndmiSum += grids[d].ndmi[p]
      if (v > maxNdvi) maxNdvi = v
      if (v < minNdvi) minNdvi = v
      cnt += 1
    }
    if (cnt < 2) {
      labels[p] = -1
      continue
    }
    const meanNdwi = ndwiSum / cnt
    const meanNdmi = ndmiSum / cnt
    const amplitude = maxNdvi - minNdvi

    if (maxNdvi >= VEG_FLOOR) vegMask[p] = 1

    if (meanNdwi > WATER_NDWI && maxNdvi < WATER_MAXNDVI) {
      labels[p] = WATER_IDX
      continue
    }
    if (maxNdvi < BUILT_MAXNDVI && meanNdmi < BUILT_NDMI) {
      labels[p] = BUILT_IDX
      continue
    }
    if (maxNdvi < BARE_MAXNDVI) {
      labels[p] = BARE_IDX
      continue
    }

    const isCropland = maxNdvi >= CROP_PEAK_MIN || (amplitude >= CROP_AMP_MIN && maxNdvi >= NATURAL_FLOOR + 0.05)
    if (!isCropland) {
      labels[p] = NATURAL_IDX
      continue
    }

    const sampled = resampleToPhenophases(series.slice(0, cnt), fracs.slice(0, cnt))
    croplandMask[p] = 1
    labels[p] = CROPLAND_PENDING
    minNdviArr[p] = minNdvi
    maxNdviArr[p] = maxNdvi
    meanNdwiArr[p] = meanNdwi
    sampledAll.set(sampled, p * NORM_POSITIONS.length)
  }

  const { inPivot, pivotId } = detectPivotFields(vegMask, width, height)
  const PH = NORM_POSITIONS.length

  const PIVOT_BUFFER_R = Math.max(2, Math.round(0.012 * Math.min(width, height)))
  const nearPivot = new Uint8Array(n)
  {
    const tmp = new Uint8Array(n)
    const R = PIVOT_BUFFER_R
    for (let y = 0; y < height; y += 1) {
      const row = y * width
      for (let x = 0; x < width; x += 1) {
        let on = 0
        for (let dx = -R; dx <= R; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          if (inPivot[row + nx]) { on = 1; break }
        }
        tmp[row + x] = on
      }
    }
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let on = 0
        for (let dy = -R; dy <= R; dy += 1) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          if (tmp[ny * width + x]) { on = 1; break }
        }
        nearPivot[y * width + x] = on
      }
    }
  }

  const objId = new Int32Array(n).fill(-1)
  let nextObj = 0
  const pivotObjMap = new Map<number, number>()
  for (let p = 0; p < n; p += 1) {
    if (croplandMask[p] && pivotId[p] >= 0) {
      let oid = pivotObjMap.get(pivotId[p])
      if (oid === undefined) {
        oid = nextObj++
        pivotObjMap.set(pivotId[p], oid)
      }
      objId[p] = oid
    }
  }

  const SEG_EDGE = 0.16
  const growStack = new Int32Array(n)
  for (let p0 = 0; p0 < n; p0 += 1) {
    if (!croplandMask[p0] || objId[p0] >= 0) continue
    const oid = nextObj++
    let top = 0
    growStack[top++] = p0
    objId[p0] = oid
    while (top > 0) {
      const p = growStack[--top]
      const x = p % width
      const y = (p - x) / width
      const bp = p * PH
      const tryNb = (q: number): void => {
        if (q < 0 || q >= n) return
        if (!croplandMask[q] || objId[q] >= 0 || pivotId[q] >= 0) return
        const bq = q * PH
        let diff = 0
        for (let k = 0; k < PH; k += 1) diff += Math.abs(sampledAll[bp + k] - sampledAll[bq + k])
        if (diff / PH > SEG_EDGE) return
        objId[q] = oid
        growStack[top++] = q
      }
      if (x > 0) tryNb(p - 1)
      if (x < width - 1) tryNb(p + 1)
      if (y > 0) tryNb(p - width)
      if (y < height - 1) tryNb(p + width)
    }
  }
  const objCount = nextObj

  const objCnt = new Int32Array(objCount)
  const objSig = new Float32Array(objCount * PH)
  const objMinNdvi = new Float32Array(objCount)
  const objMaxNdvi = new Float32Array(objCount)
  const objNdwi = new Float32Array(objCount)
  const objIsPivot = new Uint8Array(objCount)
  const objNearPivot = new Uint8Array(objCount)
  for (let i = 0; i < objCount; i += 1) objMinNdvi[i] = 2
  for (let p = 0; p < n; p += 1) {
    const o = objId[p]
    if (o < 0) continue
    objCnt[o] += 1
    const bp = p * PH
    const bo = o * PH
    for (let k = 0; k < PH; k += 1) objSig[bo + k] += sampledAll[bp + k]
    if (minNdviArr[p] < objMinNdvi[o]) objMinNdvi[o] = minNdviArr[p]
    if (maxNdviArr[p] > objMaxNdvi[o]) objMaxNdvi[o] = maxNdviArr[p]
    objNdwi[o] += meanNdwiArr[p]
    if (inPivot[p]) objIsPivot[o] = 1
    if (nearPivot[p]) objNearPivot[o] = 1
  }

  const objLabel = new Int16Array(objCount).fill(NATURAL_IDX)
  for (let o = 0; o < objCount; o += 1) {
    const cnt = objCnt[o]
    if (!cnt) continue
    const bo = o * PH
    const meanNdwi = objNdwi[o] / cnt
    const minNdvi = objMinNdvi[o]
    const amplitude = objMaxNdvi[o] - objMinNdvi[o]
    const isPivotObj = objIsPivot[o] === 1
    let best = -1
    let bestDist = Infinity
    for (let c = 0; c < cropProtos.length; c += 1) {
      if (crops[c].evergreen) {
        if (minNdvi < EVERGREEN_MIN_NDVI) continue
        if (amplitude > EVERGREEN_MAX_AMP) continue
        if (isPivotObj || objNearPivot[o]) continue
        if (cnt < EVERGREEN_MIN_OBJ) continue
      }
      const proto = cropProtos[c]
      let dist = 0
      for (let k = 0; k < proto.length; k += 1) {
        const diff = objSig[bo + k] / cnt - proto[k]
        dist += diff * diff
      }
      if (crops[c].wantsWater) dist += meanNdwi > 0.05 ? -0.08 : 0.08
      if (isPivotObj && crops[c].pivotForage) dist -= 0.03
      if (crops[c].evergreen && dist > EVERGREEN_MAX_DIST) continue
      if (dist < bestDist) {
        bestDist = dist
        best = c
      }
    }
    objLabel[o] = best >= 0 ? best : NATURAL_IDX
  }

  for (let p = 0; p < n; p += 1) {
    if (objId[p] >= 0) labels[p] = objLabel[objId[p]]
    else if (labels[p] === CROPLAND_PENDING) labels[p] = NATURAL_IDX
  }

  const smoothed = new Int16Array(n)
  const counts = new Map<number, number>()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (labels[p] < 0) {
        smoothed[p] = -1
        continue
      }
      if (objId[p] >= 0) {
        smoothed[p] = labels[p]
        continue
      }
      counts.clear()
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
          const q = ny * width + nx
          if (objId[q] >= 0) continue
          const l = labels[q]
          if (l < 0) continue
          counts.set(l, (counts.get(l) || 0) + 1)
        }
      }
      let bestL = labels[p]
      let bestC = -1
      for (const [l, c] of counts) {
        if (c > bestC) {
          bestC = c
          bestL = l
        }
      }
      smoothed[p] = bestL
    }
  }

  const evergreenIdx = new Set<number>()
  for (let c = 0; c < crops.length; c += 1) if (crops[c].evergreen) evergreenIdx.add(c)
  if (evergreenIdx.size) {
    for (let p = 0; p < n; p += 1) {
      if (!nearPivot[p]) continue
      if (!evergreenIdx.has(smoothed[p])) continue
      const o = objId[p]
      const legal = o >= 0 ? objLabel[o] : -1
      smoothed[p] = legal >= 0 && !evergreenIdx.has(legal) ? legal : BARE_IDX
    }
  }

  const rgb = classMeta.map(m => hexToRgb(m.color))
  const tally = new Array(classMeta.length).fill(0)
  let validPixels = 0
  const image = new Uint8ClampedArray(n * 4)
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const l = smoothed[p]
    if (l < 0) {
      image[i] = 0
      image[i + 1] = 0
      image[i + 2] = 0
      image[i + 3] = 0
      continue
    }
    const [r, g, b] = rgb[l]
    image[i] = r
    image[i + 1] = g
    image[i + 2] = b
    image[i + 3] = 255
    tally[l] += 1
    validPixels += 1
  }
  const pngDataUrl = rgbaToPngDataUrl(image, width, height)

  const classStats: ClassStat[] = classMeta
    .map((m, idx) => ({ id: m.id, name: m.name, pct: validPixels ? Number(((tally[idx] / validPixels) * 100).toFixed(1)) : 0 }))
    .filter(s => s.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  let pivotPixels = 0
  let croplandPixels = 0
  for (let p = 0; p < n; p += 1) {
    if (croplandMask[p]) croplandPixels += 1
    if (inPivot[p]) pivotPixels += 1
  }
  const pivots = {
    pixels: pivotPixels,
    pctOfCropland: croplandPixels ? Number(((pivotPixels / croplandPixels) * 100).toFixed(1)) : 0,
  }
  const fields = { objects: objCount, pivotObjects: pivotObjMap.size }

  return { pngDataUrl, width, height, classStats, pivots, fields }
}

/* ───────────────────────── Browser raster helpers (canvas) ───────────────────────── */

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function rgbaToPngDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable for crop layer rendering.')
  const imgData = ctx.createImageData(width, height)
  imgData.data.set(rgba)
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

const WEB_MERCATOR_R = 6378137
const MAX_MERCATOR_LAT = 85.05112878

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))
  const x = (lng * Math.PI) / 180 * WEB_MERCATOR_R
  const y = WEB_MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

/** [west, south, east, north] in EPSG:4326 from a Polygon/MultiPolygon. */
function geometryBbox4326(geometry: AoiGeometry): [number, number, number, number] {
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

/** Index-grid evalscript: R/G/B = NDVI/NDWI/NDMI encoded (v+1)*127, A = validity (mirrors backend). */
const INDEX_GRID_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), 255];
}`

function toBase64(text: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(text)))
  }
  // Fallback for non-DOM environments (should not happen in the browser engine).
  return text
}

function resolveEvalProxyLayer(): string {
  return resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
}

async function fetchWmsImageData(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { headers: { Accept: 'image/png' }, signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sentinel Hub WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close?.()
  }
}

/** Fetch one NDVI/NDWI/NDMI index grid for the AOI bbox + date window via OGC WMS. */
async function fetchIndexGrid(
  opts: {
    bbox3857: [number, number, number, number]
    timeStart: string
    timeEnd: string
    cloudCoverage: number
    size: number
    layer: string
    evalscriptB64: string
  },
  signal?: AbortSignal,
): Promise<IndexGrid> {
  const [minX, minY, maxX, maxY] = opts.bbox3857
  const base = getSentinelHubWmsBaseUrl()
  let url =
    `${base}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(opts.layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${opts.size}&HEIGHT=${opts.size}` +
    `&TIME=${opts.timeStart}/${opts.timeEnd}` +
    `&MAXCC=${opts.cloudCoverage}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(opts.evalscriptB64)}`
  url = appendSentinelHubWmsAccessToken(url)

  const data = await fetchWmsImageData(url, opts.size, opts.size, signal)
  const n = opts.size * opts.size
  const ndvi = new Float32Array(n)
  const ndwi = new Float32Array(n)
  const ndmi = new Float32Array(n)
  const valid = new Uint8Array(n)
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128 || (r === 0 && g === 0 && b === 0)) {
      valid[p] = 0
      continue
    }
    ndvi[p] = r / 127 - 1
    ndwi[p] = g / 127 - 1
    ndmi[p] = b / 127 - 1
    valid[p] = 1
  }
  return { ndvi, ndwi, ndmi, valid, width: opts.size, height: opts.size }
}

/** True-color preview (data URL) around a target date for the AOI bbox. */
async function fetchTrueColorPreview(
  bbox3857: [number, number, number, number],
  isoDate: string,
  size: number,
  layer: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const day = new Date(`${isoDate}T00:00:00Z`)
    const timeStart = new Date(day.getTime() - 20 * 86400000).toISOString().slice(0, 10)
    const timeEnd = new Date(day.getTime() + 10 * 86400000).toISOString().slice(0, 10)
    const [minX, minY, maxX, maxY] = bbox3857
    const evalscript = `//VERSION=3
function setup() { return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4, sampleType: "UINT8" } }; }
function evaluatePixel(s) {
  if (!s.dataMask) return [0, 0, 0, 0];
  function g(v){ return Math.max(0, Math.min(255, Math.round(v * 3.5 * 255))); }
  return [g(s.B04), g(s.B03), g(s.B02), 255];
}`
    let url =
      `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${encodeURIComponent(layer)}` +
      `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
      `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${size}&HEIGHT=${size}` +
      `&TIME=${timeStart}/${timeEnd}&MAXCC=60&SHOWLOGO=false&WARNINGS=false` +
      `&EVALSCRIPT=${encodeURIComponent(toBase64(evalscript))}`
    url = appendSentinelHubWmsAccessToken(url)
    const data = await fetchWmsImageData(url, size, size, signal)
    return rgbaToPngDataUrl(data, size, size)
  } catch {
    return null
  }
}

function evenlySpacedDates(season: { start: string; end: string }, count: number): string[] {
  const start = new Date(`${season.start}T00:00:00Z`).getTime()
  const end = new Date(`${season.end}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Invalid season range.')
  }
  const out: string[] = []
  const k = Math.max(2, count)
  for (let i = 0; i < k; i += 1) {
    const t = start + ((end - start) * i) / (k - 1)
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/* ───────────────────────── Orchestrator ───────────────────────── */

function snapshot(
  jobId: string,
  status: CropClassificationJobStatus,
  progress: number,
  message: string,
  extra?: Partial<CropClassificationJob>,
): CropClassificationJob {
  return {
    id: jobId,
    mode: 'aoi',
    status,
    progress,
    message,
    result: null,
    error: null,
    ...extra,
  }
}

/**
 * Run the country-aware crop classification fully in the browser.
 * Calls `onUpdate` with progressive job snapshots (matching the backend job shape).
 */
export async function runClientAoiCropClassification(
  jobId: string,
  input: RunAoiInput,
  onUpdate: (job: CropClassificationJob) => void,
  signal?: AbortSignal,
): Promise<CropClassificationJob> {
  const fail = (message: string): CropClassificationJob => {
    const job = snapshot(jobId, 'error', 1, 'Pipeline failed.', { error: message })
    onUpdate(job)
    return job
  }

  try {
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
      return fail('Client crop classification requires a browser environment.')
    }
    try {
      assertCropPanelProvider(input.dataProvider ?? 'satellite')
    } catch (err) {
      return fail(String((err as Error)?.message || err))
    }
    const pipelineProfile = resolveCropPipelineProfile(
      input.dataProvider ?? 'satellite',
      'ai-prithvi',
    )
    onUpdate(snapshot(jobId, 'fetching', 0.06, 'Detecting country from AOI…'))
    const country = await detectCountryFromAoi(input.aoi)
    const profile = cropProfileForCountry(country.code)

    const bbox4326 = geometryBbox4326(input.aoi)
    const [w, s, e, n] = bbox4326
    const [minX, minY] = lngLatTo3857(w, s)
    const [maxX, maxY] = lngLatTo3857(e, n)
    const bbox3857: [number, number, number, number] = [minX, minY, maxX, maxY]

    const layer = resolveEvalProxyLayer()
    const evalscriptB64 = toBase64(INDEX_GRID_EVALSCRIPT)
    const STEPS = 5
    const SIZE = 224
    const dates = evenlySpacedDates(input.season, STEPS)
    const grids: IndexGrid[] = []
    for (let i = 0; i < dates.length; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onUpdate(
        snapshot(
          jobId,
          'fetching',
          0.1 + (0.5 * i) / dates.length,
          `Fetching spectral series ${i + 1}/${dates.length} (${dates[i]}) — ${country.name}…`,
        ),
      )
      const day = new Date(`${dates[i]}T00:00:00Z`)
      const t0 = new Date(day.getTime() - 25 * 86400000).toISOString().slice(0, 10)
      const t1 = new Date(day.getTime() + 15 * 86400000).toISOString().slice(0, 10)
      try {
        const grid = await fetchIndexGrid(
          { bbox3857, timeStart: t0, timeEnd: t1, cloudCoverage: 60, size: SIZE, layer, evalscriptB64 },
          signal,
        )
        grids.push(grid)
      } catch (gridErr) {
        if (gridErr instanceof DOMException && gridErr.name === 'AbortError') throw gridErr
        /* skip a failed date — classifier tolerates gaps */
      }
    }
    if (grids.length < 2) {
      return fail('Not enough cloud-free Sentinel-2 imagery for this AOI/season to classify. Try a wider season or a clearer area.')
    }

    onUpdate(snapshot(jobId, 'preprocessing', 0.66, 'Building NDVI phenology signatures…'))
    onUpdate(snapshot(jobId, 'inferring', 0.8, `Classifying crops (${profile.country})…`))
    const classified = classifyCropFields(grids, profile)

    const previewIdx = [0, Math.floor(dates.length / 2), dates.length - 1]
    const previews: Array<string | null> = []
    for (const idx of previewIdx) {
      previews.push(await fetchTrueColorPreview(bbox3857, dates[idx], 256, layer, signal))
    }

    const done: CropClassificationJob = {
      id: jobId,
      mode: 'aoi',
      status: 'done',
      progress: 1,
      message: `Classification complete — ${profile.country} (${classified.classStats.length} classes${classified.pivots.pixels ? `, ${classified.pivots.pctOfCropland}% pivot-irrigated` : ''}).`,
      error: null,
      result: {
        engine: 'country',
        dataProvider: input.dataProvider ?? 'satellite',
        pipelineProfile: pipelineProfile.id,
        country: { code: country.code, name: profile.country, source: country.source },
        legend: profile.classes,
        scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
        dates,
        prediction: { url: classified.pngDataUrl, bounds: bbox4326 },
        classStats: classified.classStats,
        inferenceAvailable: true,
      },
    }
    onUpdate(done)
    return done
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const job = snapshot(jobId, 'error', 1, 'Cancelled.', { error: 'Aborted' })
      return job
    }
    return fail(String((err as Error)?.message || err))
  }
}

