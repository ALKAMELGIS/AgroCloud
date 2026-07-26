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
  season?: 'cool' | 'warm' | 'mixed' | 'perennial'
}

const CROP_CATALOG: Record<string, CropDef> = {
  wheat: { name: 'Wheat', nameAr: 'قمح', color: '#e0c341', ndvi: [0.15, 0.45, 0.75, 0.82, 0.5, 0.2], season: 'cool' },
  barley: { name: 'Barley', nameAr: 'شعير', color: '#c9a227', ndvi: [0.15, 0.5, 0.78, 0.72, 0.4, 0.18], season: 'cool' },
  maize: { name: 'Maize / Corn', nameAr: 'ذرة', color: '#f2e600', ndvi: [0.18, 0.35, 0.7, 0.85, 0.6, 0.25], season: 'warm' },
  rice: { name: 'Rice', nameAr: 'أرز', color: '#1f8a4c', ndvi: [0.1, 0.3, 0.65, 0.88, 0.7, 0.3], wantsWater: true, season: 'warm' },
  cotton: { name: 'Cotton', nameAr: 'قطن', color: '#e34234', ndvi: [0.15, 0.3, 0.55, 0.8, 0.75, 0.35], season: 'warm' },
  sorghum: { name: 'Sorghum', nameAr: 'ذرة رفيعة', color: '#f5a000', ndvi: [0.18, 0.35, 0.62, 0.8, 0.6, 0.28], season: 'warm' },
  soybean: { name: 'Soybeans', nameAr: 'فول صويا', color: '#2e7d32', ndvi: [0.18, 0.35, 0.65, 0.82, 0.55, 0.25], season: 'warm' },
  potato: { name: 'Potato', nameAr: 'بطاطس', color: '#a0522d', ndvi: [0.2, 0.55, 0.8, 0.7, 0.4, 0.2], season: 'cool' },
  vegetables: { name: 'Vegetables', nameAr: 'خضروات', color: '#9acd5e', ndvi: [0.2, 0.6, 0.7, 0.5, 0.6, 0.45], season: 'mixed' },
  rhodes: { name: 'Rhodes Grass', nameAr: 'حشيشة رودس', color: '#b14bd8', ndvi: [0.5, 0.74, 0.56, 0.76, 0.58, 0.74], pivotForage: true, season: 'perennial' },
  alfalfa: { name: 'Alfalfa', nameAr: 'برسيم حجازي', color: '#ff5ec8', ndvi: [0.55, 0.8, 0.6, 0.82, 0.62, 0.8], pivotForage: true, season: 'perennial' },
  forage_sorghum: { name: 'Forage Sorghum', nameAr: 'ذرة رفيعة علفية', color: '#d2691e', ndvi: [0.2, 0.42, 0.72, 0.84, 0.58, 0.3], pivotForage: true, season: 'warm' },
  silage_maize: { name: 'Forage Maize / Silage', nameAr: 'ذرة علفية / سيلاج', color: '#ffae00', ndvi: [0.2, 0.42, 0.78, 0.86, 0.45, 0.22], pivotForage: true, season: 'warm' },
  forage_barley: { name: 'Forage Barley', nameAr: 'شعير علفي', color: '#aee03a', ndvi: [0.18, 0.55, 0.8, 0.62, 0.35, 0.18], pivotForage: true, season: 'cool' },
  forage_millet: { name: 'Forage Millet', nameAr: 'دخن علفي', color: '#62b53f', ndvi: [0.2, 0.48, 0.76, 0.6, 0.3, 0.2], pivotForage: true, season: 'warm' },
  pasture: { name: 'Natural Pasture Grass', nameAr: 'مراعٍ طبيعية', color: '#3f9b5a', ndvi: [0.25, 0.42, 0.52, 0.46, 0.36, 0.28], season: 'mixed' },
  sugarcane: { name: 'Sugarcane', nameAr: 'قصب سكر', color: '#1f6f3f', ndvi: [0.5, 0.65, 0.78, 0.85, 0.82, 0.7], evergreen: true, season: 'perennial' },
  datepalm: { name: 'Date Palm / Orchard', nameAr: 'نخيل / بساتين', color: '#7a5a1e', ndvi: [0.58, 0.6, 0.63, 0.64, 0.62, 0.59], evergreen: true, season: 'perennial' },
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
  season: 'cool' | 'warm' | 'mixed' | 'perennial'
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
    season: c.season || 'mixed',
  }
}

/** Field crops first so seasonal cereals win ties over multi-cut forage. */
const COUNTRY_CROPS: Record<string, string[]> = {
  SA: ['wheat', 'maize', 'potato', 'vegetables', 'silage_maize', 'forage_barley', 'forage_sorghum', 'datepalm', 'alfalfa', 'rhodes'],
  EG: ['wheat', 'rice', 'cotton', 'maize', 'potato', 'vegetables', 'silage_maize', 'sugarcane', 'alfalfa'],
  IQ: ['wheat', 'barley', 'rice', 'maize', 'vegetables', 'datepalm', 'alfalfa'],
  AE: ['vegetables', 'wheat', 'silage_maize', 'forage_sorghum', 'datepalm', 'alfalfa', 'rhodes'],
  JO: ['wheat', 'barley', 'vegetables', 'potato', 'datepalm', 'alfalfa'],
  MA: ['wheat', 'barley', 'maize', 'vegetables', 'silage_maize', 'alfalfa'],
  DZ: ['wheat', 'barley', 'maize', 'vegetables', 'datepalm', 'alfalfa'],
  SD: ['sorghum', 'wheat', 'cotton', 'forage_millet', 'vegetables', 'forage_sorghum', 'alfalfa'],
  KW: ['vegetables', 'forage_sorghum', 'alfalfa', 'rhodes'],
  OM: ['vegetables', 'datepalm', 'forage_sorghum', 'alfalfa', 'rhodes'],
  QA: ['vegetables', 'forage_sorghum', 'alfalfa', 'rhodes'],
  US: ['maize', 'soybean', 'wheat', 'cotton', 'sorghum', 'silage_maize', 'alfalfa'],
  IN: ['rice', 'wheat', 'cotton', 'sugarcane', 'sorghum', 'forage_millet', 'vegetables'],
  default: ['wheat', 'maize', 'vegetables', 'potato', 'silage_maize', 'alfalfa', 'rhodes'],
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

/** Calendar affinity of a crop to the analysis season window (0.2–1). */
function cropSeasonAffinity(
  cropSeason: ResolvedCrop['season'] | string,
  seasonStart: string,
  seasonEnd: string,
): number {
  const start = new Date(`${String(seasonStart || '').slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${String(seasonEnd || '').slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return 1
  }
  const kind = cropSeason || 'mixed'
  if (kind === 'mixed' || kind === 'perennial') return 0.85

  const months = new Set<number>()
  const span = end.getTime() - start.getTime()
  const steps = Math.min(24, Math.max(2, Math.round(span / (14 * 86400000))))
  for (let i = 0; i <= steps; i += 1) {
    const t = start.getTime() + (span * i) / steps
    months.add(new Date(t).getUTCMonth() + 1)
  }
  const coolMonths = new Set([10, 11, 12, 1, 2, 3, 4, 5])
  const warmMonths = new Set([3, 4, 5, 6, 7, 8, 9, 10])
  let hit = 0
  for (const m of months) {
    if (kind === 'cool' && coolMonths.has(m)) hit += 1
    if (kind === 'warm' && warmMonths.has(m)) hit += 1
  }
  const ratio = hit / Math.max(months.size, 1)
  return Math.max(0.2, Math.min(1, 0.25 + 0.75 * ratio))
}

/** Phenology distance: MSE + amplitude + peak-phase + (1 − correlation). */
function phenologyMatchDistance(obs: number[], proto: number[]): number {
  const n = Math.min(obs.length, proto.length)
  if (n < 2) return 99
  let sumO = 0
  let sumP = 0
  let sumOO = 0
  let sumPP = 0
  let sumOP = 0
  let mse = 0
  let peakO = 0
  let peakP = 0
  let maxO = -Infinity
  let maxP = -Infinity
  let minO = Infinity
  let minP = Infinity
  for (let i = 0; i < n; i += 1) {
    const o = obs[i]!
    const p = proto[i]!
    const d = o - p
    mse += d * d
    sumO += o
    sumP += p
    sumOO += o * o
    sumPP += p * p
    sumOP += o * p
    if (o > maxO) {
      maxO = o
      peakO = i
    }
    if (p > maxP) {
      maxP = p
      peakP = i
    }
    if (o < minO) minO = o
    if (p < minP) minP = p
  }
  mse /= n
  const meanO = sumO / n
  const meanP = sumP / n
  const varO = Math.max(1e-6, sumOO / n - meanO * meanO)
  const varP = Math.max(1e-6, sumPP / n - meanP * meanP)
  const corr = (sumOP / n - meanO * meanP) / Math.sqrt(varO * varP)
  const ampO = Math.max(0, maxO - minO)
  const ampP = Math.max(0, maxP - minP)
  const ampPenalty = Math.abs(ampO - ampP)
  const peakPenalty = Math.abs(peakO - peakP) / Math.max(1, n - 1)
  const corrPenalty = 1 - Math.max(-1, Math.min(1, corr))
  return mse + 0.35 * ampPenalty + 0.25 * peakPenalty + 0.2 * corrPenalty
}

/** Fill label holes (−1) so Crop Type has no black cloud cutouts. */
function fillUnclassifiedHoles(labels: Int16Array, width: number, height: number, passes = 8): void {
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = 0
    const next = labels.slice()
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x
        if (labels[p]! >= 0) continue
        const counts = new Map<number, number>()
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const l = labels[ny * width + nx]!
            if (l < 0) continue
            counts.set(l, (counts.get(l) || 0) + 1)
          }
        }
        if (!counts.size) continue
        let bestL = -1
        let bestC = -1
        for (const [l, c] of counts) {
          if (c > bestC) {
            bestC = c
            bestL = l
          }
        }
        if (bestL >= 0) {
          next[p] = bestL
          changed += 1
        }
      }
    }
    labels.set(next)
    if (!changed) break
  }
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

  // Strict connected-component circularity only.
  // Do NOT stamp DT-peak disks — that paints fake purple circles on rectangular fields.
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
    let sumX = 0
    let sumY = 0
    while (top > 0) {
      const p = stack[--top]
      comp[count++] = p
      const x = p % width
      const y = (p - x) / width
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && croplandMask[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1
        stack[top++] = p - 1
      }
      if (x < width - 1 && croplandMask[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1
        stack[top++] = p + 1
      }
      if (y > 0 && croplandMask[p - width] && !seen[p - width]) {
        seen[p - width] = 1
        stack[top++] = p - width
      }
      if (y < height - 1 && croplandMask[p + width] && !seen[p + width]) {
        seen[p + width] = 1
        stack[top++] = p + width
      }
    }

    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const d = Math.max(w, h)
    if (count < 120 || d < 14) continue
    const aspect = Math.min(w, h) / Math.max(w, h)
    if (aspect < 0.88) continue
    const diskArea = Math.PI * (d / 2) * (d / 2)
    const fill = count / diskArea
    if (fill < 0.78 || fill > 1.05) continue

    const cx = sumX / count
    const cy = sumY / count
    let sumR = 0
    let sumR2 = 0
    for (let i = 0; i < count; i += 1) {
      const q = comp[i]!
      const x = q % width
      const y = (q - x) / width
      const dx = x - cx
      const dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      sumR += r
      sumR2 += r * r
    }
    const meanR = sumR / count
    const rmsR = Math.sqrt(sumR2 / count)
    const expectedR = Math.sqrt(count / Math.PI)
    if (meanR < expectedR * 0.82 || meanR > expectedR * 1.12) continue
    if (rmsR / Math.max(meanR, 1e-3) > 1.18) continue

    const corner = Math.max(2, Math.round(d * 0.12))
    let cornerCrop = 0
    let cornerTot = 0
    const corners: Array<[number, number]> = [
      [minX, minY],
      [maxX - corner + 1, minY],
      [minX, maxY - corner + 1],
      [maxX - corner + 1, maxY - corner + 1],
    ]
    for (const [x0, y0] of corners) {
      for (let y = y0; y < y0 + corner && y <= maxY; y += 1) {
        for (let x = x0; x < x0 + corner && x <= maxX; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          cornerTot += 1
          if (croplandMask[y * width + x]) cornerCrop += 1
        }
      }
    }
    if (cornerTot > 0 && cornerCrop / cornerTot > 0.35) continue

    const id = diskCount++
    for (let i = 0; i < count; i += 1) {
      const q = comp[i]!
      inPivot[q] = 1
      pivotId[q] = id
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

function classifyCropFields(
  grids: IndexGrid[],
  profile: CropProfile,
  opts: { seasonStart?: string; seasonEnd?: string } = {},
): ClassifyResult {
  if (!grids.length) throw new Error('No imagery grids to classify.')
  const { width, height } = grids[0]
  const n = width * height
  const K = grids.length
  const srcFracs = grids.map((_, i) => (K === 1 ? 0 : i / (K - 1)))
  const seasonStart = opts.seasonStart || ''
  const seasonEnd = opts.seasonEnd || ''

  const crops = profile.crops
  const landcover = profile.landcover
  const seasonWeights = crops.map(c => cropSeasonAffinity(c.season, seasonStart, seasonEnd))
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
    if (cnt < 1) {
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

  const { inPivot, pivotId } = detectPivotFields(croplandMask, width, height)
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

  const SEG_EDGE = 0.11
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
      const meanSig: number[] = new Array(proto.length)
      for (let k = 0; k < proto.length; k += 1) meanSig[k] = objSig[bo + k]! / cnt
      let dist = phenologyMatchDistance(meanSig, proto)
      const aff = seasonWeights[c]!
      dist *= 1.15 - 0.55 * aff
      if (crops[c]!.wantsWater) dist += meanNdwi > 0.05 ? -0.08 : 0.08
      if (isPivotObj && crops[c]!.pivotForage) dist -= 0.02
      if (!isPivotObj && !objNearPivot[o] && crops[c]!.pivotForage) dist += 0.12
      if (crops[c]!.evergreen && dist > EVERGREEN_MAX_DIST) continue
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

  fillUnclassifiedHoles(smoothed, width, height)

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

  // Pivot share is measured against the FINAL classified cropland (the crop classes only,
  // indices 0..crops.length-1). Counting pivot pixels as a subset of cropland guarantees the
  // ratio can never exceed 100% (the old code counted pivots over the broader vegetation mask,
  // producing impossible values like "154.9%").
  const cropClassCount = crops.length
  let pivotPixels = 0
  let croplandPixels = 0
  for (let p = 0; p < n; p += 1) {
    const l = smoothed[p]
    const isCrop = l >= 0 && l < cropClassCount
    if (isCrop) {
      croplandPixels += 1
      if (inPivot[p]) pivotPixels += 1
    }
  }
  const pivotPct = croplandPixels ? (pivotPixels / croplandPixels) * 100 : 0
  const pivots = {
    pixels: pivotPixels,
    pctOfCropland: Number(Math.min(100, Math.max(0, pivotPct)).toFixed(1)),
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
    input: [{ bands: ["B03", "B04", "B08", "B11", "SCL", "CLM", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  // Hard clouds only — thin cirrus / soft CLP / snow false-positives must not wipe arid AOIs.
  var cloud = (scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9) || s.CLM == 1;
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
    const err = new Error(`Sentinel Hub WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
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
  const decode = (data: Uint8ClampedArray, size: number): IndexGrid => {
    const n = size * size
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
      // Validity is alpha only — RGB zeros are real low-index values, not nodata.
      if (a < 128) {
        valid[p] = 0
        continue
      }
      ndvi[p] = r / 127 - 1
      ndwi[p] = g / 127 - 1
      ndmi[p] = b / 127 - 1
      valid[p] = 1
    }
    return { ndvi, ndwi, ndmi, valid, width: size, height: size }
  }
  const buildUrl = (size: number) => {
    let url =
      `${base}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${encodeURIComponent(opts.layer)}` +
      `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
      `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${size}&HEIGHT=${size}` +
      `&TIME=${opts.timeStart}/${opts.timeEnd}` +
      `&MAXCC=${opts.cloudCoverage}` +
      `&SHOWLOGO=false&WARNINGS=false` +
      `&EVALSCRIPT=${encodeURIComponent(opts.evalscriptB64)}`
    return appendSentinelHubWmsAccessToken(url)
  }

  const size0 = Math.min(2500, Math.max(64, opts.size))
  try {
    const data = await fetchWmsImageData(buildUrl(size0), size0, size0, signal)
    return decode(data, size0)
  } catch (err) {
    const status = (err as { status?: number })?.status
    if (status === 400 && size0 > 1024) {
      const size1 = Math.min(1024, size0)
      const data = await fetchWmsImageData(buildUrl(size1), size1, size1, signal)
      return decode(data, size1)
    }
    throw err
  }
}

/** True-color preview (data URL) around a target clear date — full natural RGB (no cloud cutouts). */
async function fetchTrueColorPreview(
  bbox3857: [number, number, number, number],
  isoDate: string,
  size: number,
  layer: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const day = new Date(`${isoDate}T00:00:00Z`)
    // Narrow window around the accepted clear date — do not mosaic across cloudy neighbours.
    const timeStart = new Date(day.getTime() - 3 * 86400000).toISOString().slice(0, 10)
    const timeEnd = new Date(day.getTime() + 3 * 86400000).toISOString().slice(0, 10)
    const [minX, minY, maxX, maxY] = bbox3857
    const evalscript = `//VERSION=3
function setup() { return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4, sampleType: "UINT8" } }; }
function evaluatePixel(s) {
  // Full natural RGB — cloudy *dates* are excluded upstream; do not cut pixels to black.
  if (!s.dataMask) return [0, 0, 0, 0];
  function g(v){ return Math.max(0, Math.min(255, Math.round(v * 3.5 * 255))); }
  return [g(s.B04), g(s.B03), g(s.B02), 255];
}`
    let url =
      `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${encodeURIComponent(layer)}` +
      `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
      `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${size}&HEIGHT=${size}` +
      `&TIME=${timeStart}/${timeEnd}&MAXCC=40&SHOWLOGO=false&WARNINGS=false` +
      `&EVALSCRIPT=${encodeURIComponent(toBase64(evalscript))}`
    url = appendSentinelHubWmsAccessToken(url)
    const data = await fetchWmsImageData(url, size, size, signal)
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! >= 128) opaque += 1
    }
    // Reject empty / failed frames only (not residual cloud cutouts — those are no longer masked).
    if (opaque / (size * size) < 0.15) return null
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
    // More temporal samples => finer NDVI phenology (better season-specific accuracy) and more
    // chances to see each pixel cloud-free within its window.
    const STEPS = 8
    // 3 m target grid: size the request by the AOI span so field / pivot edges stay crisp.
    const TARGET_MPP = 3
    const spanMeters = Math.max(maxX - minX, maxY - minY)
    const SIZE = Math.max(256, Math.min(2500, Math.round(spanMeters / TARGET_MPP)))
    // Prefer ≥45% AOI clear; fall back to best available ≥8% so the tool keeps working.
    const MIN_CLEAR_FRACTION = 0.45
    const CLEAR_FLOOR = 0.08
    /** Granule-level WMS MAXCC — tile cloud metadata ≠ AOI cloud; keep permissive and rank by AOI clear %. */
    const MAX_SCENE_CLOUD = 40
    const dates = evenlySpacedDates(input.season, STEPS)
    const grids: IndexGrid[] = []
    const usedDates: string[] = []
    let skippedEmpty = 0
    let lastFetchErr: unknown = null
    const validFractionOf = (g: IndexGrid): number => {
      let ok = 0
      for (let p = 0; p < g.valid.length; p += 1) ok += g.valid[p]
      return g.valid.length ? ok / g.valid.length : 0
    }
    const candidates: Array<{ date: string; grid: IndexGrid; clear: number }> = []
    const tried = new Set<string>()
    const tryFetchDate = async (
      date: string,
      opts: { cloudCoverage?: number; padDays?: number; clearFloor?: number } = {},
    ) => {
      if (tried.has(date)) return
      tried.add(date)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onUpdate(
        snapshot(
          jobId,
          'fetching',
          0.1 + Math.min(0.5, 0.06 * tried.size),
          `Fetching spectral series ${tried.size} (${date}) — ${country.name}…`,
        ),
      )
      const day = new Date(`${date}T00:00:00Z`)
      const pad = opts.padDays ?? 6
      const t0 = new Date(day.getTime() - pad * 86400000).toISOString().slice(0, 10)
      const t1 = new Date(day.getTime() + pad * 86400000).toISOString().slice(0, 10)
      try {
        const grid = await fetchIndexGrid(
          {
            bbox3857,
            timeStart: t0,
            timeEnd: t1,
            cloudCoverage: opts.cloudCoverage ?? MAX_SCENE_CLOUD,
            size: SIZE,
            layer,
            evalscriptB64,
          },
          signal,
        )
        const clear = validFractionOf(grid)
        if (clear < (opts.clearFloor ?? CLEAR_FLOOR)) {
          skippedEmpty += 1
          return
        }
        candidates.push({ date, grid, clear })
      } catch (gridErr) {
        if (gridErr instanceof DOMException && gridErr.name === 'AbortError') throw gridErr
        lastFetchErr = gridErr
        /* skip a failed date — classifier tolerates gaps */
      }
    }

    for (const d of dates) {
      await tryFetchDate(d!)
    }

    // Wider windows + higher MAXCC when the first pass under-fills.
    if (candidates.length < 2) {
      onUpdate(
        snapshot(jobId, 'fetching', 0.55, 'Retrying with wider date windows…'),
      )
      const alreadyOk = new Set(candidates.map(c => c.date))
      const retryDates = evenlySpacedDates(input.season, 10)
      for (const d of retryDates) {
        if (candidates.length >= 4) break
        if (!d || alreadyOk.has(d)) continue
        tried.delete(d) // allow re-fetch of previously empty dates with looser params
        await tryFetchDate(d, { cloudCoverage: 80, padDays: 12, clearFloor: 0.05 })
      }
    }

    candidates.sort((a, b) => b.clear - a.clear || a.date.localeCompare(b.date))
    const preferred = candidates.filter(c => c.clear >= MIN_CLEAR_FRACTION)
    const pool = preferred.length >= 2 ? preferred : candidates
    const picked: typeof candidates = []
    const minGapMs = 5 * 86400000
    for (const c of pool) {
      if (picked.length >= STEPS) break
      const t = new Date(`${c.date}T00:00:00Z`).getTime()
      if (picked.some(p => Math.abs(new Date(`${p.date}T00:00:00Z`).getTime() - t) < minGapMs)) {
        continue
      }
      picked.push(c)
    }
    for (const c of pool) {
      if (picked.length >= Math.min(STEPS, 4)) break
      if (picked.includes(c)) continue
      picked.push(c)
    }
    picked.sort((a, b) => a.date.localeCompare(b.date))
    for (const p of picked) {
      grids.push(p.grid)
      usedDates.push(p.date)
    }
    if (grids.length < 2) {
      const best = candidates[0]?.clear
      if (best == null && lastFetchErr) {
        return fail(
          `Could not fetch Sentinel-2 imagery for this AOI/season: ${String((lastFetchErr as Error)?.message || lastFetchErr).slice(0, 180)}`,
        )
      }
      return fail(
        best != null
          ? `Not enough usable Sentinel-2 scenes for this AOI/season (best AOI clear ${(best * 100).toFixed(0)}%, need ≥2 dates${skippedEmpty ? `; ${skippedEmpty} empty` : ''}). Try a wider season.`
          : 'Not enough usable Sentinel-2 imagery for this AOI/season to classify. Try a wider season or a clearer period.',
      )
    }

    onUpdate(snapshot(jobId, 'preprocessing', 0.66, 'Building NDVI phenology signatures…'))
    onUpdate(snapshot(jobId, 'inferring', 0.8, `Classifying crops (${profile.country})…`))
    const classified = classifyCropFields(grids, profile, {
      seasonStart: input.season?.start,
      seasonEnd: input.season?.end,
    })

    // Thumbnails come only from the accepted (clear) scenes — never a rejected cloudy date.
    const previewDates = [
      usedDates[0],
      usedDates[Math.floor(usedDates.length / 2)],
      usedDates[usedDates.length - 1],
    ]
    const previews: Array<string | null> = []
    for (const d of previewDates) {
      previews.push(await fetchTrueColorPreview(bbox3857, d, 256, layer, signal))
    }

    const done: CropClassificationJob = {
      id: jobId,
      mode: 'aoi',
      status: 'done',
      progress: 1,
      message: `Classification complete — ${profile.country} (${classified.classStats.length} classes${classified.pivots.pixels ? `, ${classified.pivots.pctOfCropland}% pivot-irrigated` : ''}) at ${TARGET_MPP} m.`,
      error: null,
      result: {
        engine: 'country',
        country: { code: country.code, name: profile.country, source: country.source },
        legend: profile.classes,
        scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
        dates: usedDates,
        maxSceneCloud: MAX_SCENE_CLOUD,
        sceneCloudCover: usedDates.map(date => ({ date, cloudCover: null, cloudy: false })),
        prediction: { url: classified.pngDataUrl, bounds: bbox4326 },
        classStats: classified.classStats,
        inferenceAvailable: true,
        resolutionMeters: TARGET_MPP,
        superResolution: 'resample',
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

