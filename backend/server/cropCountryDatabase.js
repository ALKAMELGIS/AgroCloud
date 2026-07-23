/**
 * Country-aware crop database + reverse geocoding for the Prithvi/AOI crop
 * classification engine.
 *
 * The classifier is restricted to the crops commonly grown in the country that
 * contains the AOI, which improves realism and prevents predicting crops that
 * do not exist in the region.
 *
 * Each crop carries a coarse multi-temporal NDVI phenology prototype sampled at
 * 6 normalized season positions [0, .2, .4, .6, .8, 1]. The classifier resamples
 * a pixel's NDVI time-series onto the same positions and assigns the nearest
 * crop prototype (restricted to the country's crop set), after first peeling off
 * non-vegetation classes (water / bare / built) by simple index rules.
 */

const NORM_POSITIONS = [0, 0.2, 0.4, 0.6, 0.8, 1]

/**
 * Non-crop land-use / land-cover (LULC) classes shared across all countries.
 * The classifier resolves these FIRST and only runs crop typing on land that
 * passes the cropland gate — non-agricultural pixels keep their LULC class and
 * are never labelled as a crop.
 *
 * Note (honesty / non-misleading): Sentinel-2 (10 m) + 3 indices cannot reliably
 * separate residential vs industrial vs roads, so impervious surfaces are grouped
 * as "Built-up / Urban" rather than inventing distinctions the data can't support.
 */
const BASE_LANDCOVER = [
  { id: 'water', name: 'Water', nameAr: 'مياه', color: '#3b6fc9' },
  { id: 'built', name: 'Built-up / Urban', nameAr: 'عمران / مبانٍ وطرق', color: '#8a8a8a' },
  { id: 'bare', name: 'Bare soil / Fallow', nameAr: 'تربة عارية / بور', color: '#c9b079' },
  { id: 'natural', name: 'Natural / Sparse vegetation', nameAr: 'غطاء طبيعي / متفرّق', color: '#6b8f4e' },
]

/**
 * Crop catalogue. Phenology profiles are intentionally region-tuned and can be
 * refined later. Profiles are *relative* NDVI shapes (0..1) over the local
 * growing season window provided by the user.
 */
const CROP_CATALOG = {
  // ---- Field crops (cool / winter–spring cereals in MENA) ----
  wheat: {
    name: 'Wheat',
    nameAr: 'قمح',
    color: '#e0c341',
    ndvi: [0.15, 0.45, 0.75, 0.82, 0.5, 0.2],
    season: 'cool',
  },
  barley: {
    name: 'Barley',
    nameAr: 'شعير',
    color: '#c9a227',
    ndvi: [0.15, 0.5, 0.78, 0.72, 0.4, 0.18],
    season: 'cool',
  },
  maize: {
    name: 'Maize / Corn',
    nameAr: 'ذرة',
    color: '#f2e600',
    ndvi: [0.18, 0.35, 0.7, 0.85, 0.6, 0.25],
    season: 'warm',
  },
  rice: {
    name: 'Rice',
    nameAr: 'أرز',
    color: '#1f8a4c',
    ndvi: [0.1, 0.3, 0.65, 0.88, 0.7, 0.3],
    wantsWater: true,
    season: 'warm',
  },
  cotton: {
    name: 'Cotton',
    nameAr: 'قطن',
    color: '#e34234',
    ndvi: [0.15, 0.3, 0.55, 0.8, 0.75, 0.35],
    season: 'warm',
  },
  sorghum: {
    name: 'Sorghum',
    nameAr: 'ذرة رفيعة',
    color: '#f5a000',
    ndvi: [0.18, 0.35, 0.62, 0.8, 0.6, 0.28],
    season: 'warm',
  },
  soybean: {
    name: 'Soybeans',
    nameAr: 'فول صويا',
    color: '#2e7d32',
    ndvi: [0.18, 0.35, 0.65, 0.82, 0.55, 0.25],
    season: 'warm',
  },
  potato: {
    name: 'Potato',
    nameAr: 'بطاطس',
    color: '#a0522d',
    ndvi: [0.2, 0.55, 0.8, 0.7, 0.4, 0.2],
    season: 'cool',
  },
  vegetables: {
    name: 'Vegetables',
    nameAr: 'خضروات',
    color: '#9acd5e',
    ndvi: [0.2, 0.6, 0.7, 0.5, 0.6, 0.45],
    season: 'mixed',
  },
  // ---- Forage (often multi-cut; prefer only when phenology matches) ----
  rhodes: {
    name: 'Rhodes Grass',
    nameAr: 'حشيشة رودس',
    color: '#b14bd8',
    ndvi: [0.5, 0.74, 0.56, 0.76, 0.58, 0.74],
    pivotForage: true,
    season: 'perennial',
  },
  alfalfa: {
    name: 'Alfalfa',
    nameAr: 'برسيم حجازي',
    color: '#ff5ec8',
    ndvi: [0.55, 0.8, 0.6, 0.82, 0.62, 0.8],
    pivotForage: true,
    season: 'perennial',
  },
  forage_sorghum: {
    name: 'Forage Sorghum',
    nameAr: 'ذرة رفيعة علفية',
    color: '#d2691e',
    ndvi: [0.2, 0.42, 0.72, 0.84, 0.58, 0.3],
    pivotForage: true,
    season: 'warm',
  },
  silage_maize: {
    name: 'Forage Maize / Silage',
    nameAr: 'ذرة علفية / سيلاج',
    color: '#ffae00',
    ndvi: [0.2, 0.42, 0.78, 0.86, 0.45, 0.22],
    pivotForage: true,
    season: 'warm',
  },
  forage_barley: {
    name: 'Forage Barley',
    nameAr: 'شعير علفي',
    color: '#aee03a',
    ndvi: [0.18, 0.55, 0.8, 0.62, 0.35, 0.18],
    pivotForage: true,
    season: 'cool',
  },
  forage_millet: {
    name: 'Forage Millet',
    nameAr: 'دخن علفي',
    color: '#62b53f',
    ndvi: [0.2, 0.48, 0.76, 0.6, 0.3, 0.2],
    pivotForage: true,
    season: 'warm',
  },
  pasture: {
    name: 'Natural Pasture Grass',
    nameAr: 'مراعٍ طبيعية',
    color: '#3f9b5a',
    ndvi: [0.25, 0.42, 0.52, 0.46, 0.36, 0.28],
    season: 'mixed',
  },
  // ---- Orchards / perennial ----
  sugarcane: {
    name: 'Sugarcane',
    nameAr: 'قصب سكر',
    color: '#1f6f3f',
    ndvi: [0.5, 0.65, 0.78, 0.85, 0.82, 0.7],
    evergreen: true,
    season: 'perennial',
  },
  datepalm: {
    name: 'Date Palm / Orchard',
    nameAr: 'نخيل / بساتين',
    color: '#7a5a1e',
    ndvi: [0.58, 0.6, 0.63, 0.64, 0.62, 0.59],
    evergreen: true,
    season: 'perennial',
  },
}

function crop(id) {
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

/**
 * ISO-2 country code → common crop set (field crops listed before multi-cut forage
 * so seasonal cereals are preferred when phenology ties).
 */
const COUNTRY_CROPS = {
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

const COUNTRY_NAMES = {
  SA: 'Saudi Arabia', EG: 'Egypt', IQ: 'Iraq', AE: 'United Arab Emirates', JO: 'Jordan',
  MA: 'Morocco', DZ: 'Algeria', SD: 'Sudan', US: 'United States', IN: 'India',
  KW: 'Kuwait', OM: 'Oman', QA: 'Qatar',
}

/** Rough bounding boxes [west, south, east, north] for offline fallback detection. */
const COUNTRY_BBOXES = [
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

/** @param {GeoJSON.Geometry} geometry → [lng, lat] centroid (bbox center). */
export function aoiCentroid(geometry) {
  const pts = []
  const walk = c => {
    if (!c) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') return void pts.push(c)
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk(geometry?.coordinates)
  if (!pts.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < minX) minX = lng
    if (lng > maxX) maxX = lng
    if (lat < minY) minY = lat
    if (lat > maxY) maxY = lat
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

function countryFromBbox(lng, lat) {
  for (const [code, [w, s, e, n]] of COUNTRY_BBOXES) {
    if (lng >= w && lng <= e && lat >= s && lat <= n) return code
  }
  return null
}

/**
 * Detect the country containing an AOI. Uses OSM Nominatim reverse geocoding,
 * with an offline bounding-box fallback.
 * @param {GeoJSON.Geometry} geometry
 * @returns {Promise<{ code: string; name: string; source: 'nominatim' | 'bbox' | 'default' }>}
 */
export async function detectCountryFromAoi(geometry) {
  const c = aoiCentroid(geometry)
  if (!c) return { code: 'default', name: 'Unknown', source: 'default' }
  const [lng, lat] = c
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=5&accept-language=en`
    const ctrl = AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AgroCloud-CropClassifier/1.0 (contact: support@agrocloud)' },
      signal: ctrl,
    })
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

/**
 * Build the classification class list (crops + landcover) for a country code.
 * @param {string} code ISO-2 country code.
 * @returns {{ country: string; crops: ReturnType<typeof crop>[]; landcover: typeof BASE_LANDCOVER; classes: any[] }}
 */
export function cropProfileForCountry(code) {
  const ids = COUNTRY_CROPS[code] || COUNTRY_CROPS.default
  const crops = ids.map(crop)
  const classes = [
    ...crops.map(c => ({ id: c.id, name: c.name, nameAr: c.nameAr, color: c.color, kind: 'crop' })),
    ...BASE_LANDCOVER.map(l => ({ id: l.id, name: l.name, nameAr: l.nameAr, color: l.color, kind: 'landcover' })),
  ]
  return { country: COUNTRY_NAMES[code] || code, crops, landcover: BASE_LANDCOVER, classes }
}

/**
 * Calendar affinity of a crop class to the analysis season window (0 = poor, 1 = strong).
 * Cool crops peak Oct–May (MENA); warm crops Mar–Sep; perennial/mixed always usable.
 * @param {'cool'|'warm'|'mixed'|'perennial'|string} cropSeason
 * @param {string} seasonStart YYYY-MM-DD
 * @param {string} seasonEnd YYYY-MM-DD
 */
export function cropSeasonAffinity(cropSeason, seasonStart, seasonEnd) {
  const start = new Date(`${String(seasonStart || '').slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${String(seasonEnd || '').slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return 1
  }
  const kind = cropSeason || 'mixed'
  if (kind === 'mixed' || kind === 'perennial') return 0.85

  // Sample months covered by the window (cap steps for speed).
  const months = new Set()
  const span = end.getTime() - start.getTime()
  const steps = Math.min(24, Math.max(2, Math.round(span / (14 * 86400000))))
  for (let i = 0; i <= steps; i += 1) {
    const t = start.getTime() + (span * i) / steps
    months.add(new Date(t).getUTCMonth() + 1) // 1–12
  }
  const coolMonths = new Set([10, 11, 12, 1, 2, 3, 4, 5])
  const warmMonths = new Set([3, 4, 5, 6, 7, 8, 9, 10])
  let hit = 0
  for (const m of months) {
    if (kind === 'cool' && coolMonths.has(m)) hit += 1
    if (kind === 'warm' && warmMonths.has(m)) hit += 1
  }
  const ratio = hit / Math.max(months.size, 1)
  // Soft floor so out-of-season crops remain possible but heavily down-weighted.
  return Math.max(0.2, Math.min(1, 0.25 + 0.75 * ratio))
}

/**
 * Phenology distance: MSE + amplitude + peak-phase + (1 − correlation).
 * Lower is better.
 */
export function phenologyMatchDistance(obs, proto) {
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
    const o = obs[i]
    const p = proto[i]
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

export { NORM_POSITIONS, BASE_LANDCOVER }
