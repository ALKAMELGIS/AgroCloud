/**
 * Spatial batch Sentinel-2 field analytics — one WMS grid fetch per spatial group + scene,
 * then zonal index statistics per field (no per-field Sentinel API calls).
 */
import {
  bbox3857FromGeometry,
  fetchPcSentinelSceneDates,
  fetchSentinelWmsIndicesGrid,
} from './sentinelHubWmsStatisticsEngine.js'

/** ~4 km grouping at mid-latitudes — fields in the same cluster share one scene fetch. */
export const SPATIAL_GROUP_CELL_DEG = 0.04

const GRID_CACHE_TTL_MS = 6 * 60 * 60_000
/** @type {Map<string, { grid: object; expiresAt: number }>} */
const sceneGridCache = new Map()

function addDaysToIso(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function subtractDaysFromIso(iso, days) {
  return addDaysToIso(iso, -days)
}

function webMercatorToLngLat(x, y) {
  const lng = (x * 180) / 20037508.34
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90
  return [lng, lat]
}

/** @param {GeoJSON.Geometry | null | undefined} geometry */
export function geometryCentroid(geometry) {
  if (!geometry || typeof geometry !== 'object') return null
  const points = []
  function walk(coords) {
    if (!coords) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      points.push(coords)
      return
    }
    if (Array.isArray(coords)) coords.forEach(walk)
  }
  walk(geometry.coordinates)
  if (!points.length) return null
  let sx = 0
  let sy = 0
  for (const [lng, lat] of points) {
    sx += lng
    sy += lat
  }
  return [sx / points.length, sy / points.length]
}

/**
 * Group fields by spatial grid cell (centroid) so nearby fields share one Sentinel fetch.
 * @param {Array<{ fieldKey: string; geometry?: GeoJSON.Geometry }>} fields
 */
export function spatialGroupFields(fields, cellDeg = SPATIAL_GROUP_CELL_DEG) {
  /** @type {Map<string, Array<{ fieldKey: string; geometry?: GeoJSON.Geometry }>>} */
  const groups = new Map()
  for (const field of fields) {
    const c = geometryCentroid(field.geometry)
    if (!c) continue
    const key = `${Math.floor(c[0] / cellDeg)}:${Math.floor(c[1] / cellDeg)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(field)
  }
  return [...groups.entries()].map(([groupKey, groupFields]) => ({ groupKey, fields: groupFields }))
}

/**
 * Master AOI for a spatial group — MultiPolygon of all field footprints (one WMS clip).
 * @param {Array<{ geometry?: GeoJSON.Geometry }>} fields
 */
export function buildMasterGeometry(fields) {
  /** @type {number[][][][]} */
  const polys = []
  for (const field of fields) {
    const g = field.geometry
    if (!g || typeof g !== 'object') continue
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      polys.push(g.coordinates)
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      polys.push(...g.coordinates)
    }
  }
  if (!polys.length) return null
  if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] }
  return { type: 'MultiPolygon', coordinates: polys }
}

function pointInRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** @param {GeoJSON.Geometry} geometry */
function pointInGeometry(lng, lat, geometry) {
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0]
    return ring ? pointInRing(lng, lat, ring) : false
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).some(poly => pointInRing(lng, lat, poly?.[0]))
  }
  return false
}

/**
 * Zonal mean indices for one field polygon from a shared NDVI/NDWI/NDMI grid.
 * @param {{ ndvi: Float32Array; ndwi: Float32Array; ndmi: Float32Array; valid: Uint8Array; width: number; height: number; bbox3857: number[] }} grid
 * @param {GeoJSON.Geometry} geometry
 */
export function zonalIndexStatsFromGrid(grid, geometry) {
  const fieldBbox = bbox3857FromGeometry(geometry)
  if (!fieldBbox || !grid?.valid) return null

  const { ndvi, ndwi, ndmi, valid, width, height, bbox3857 } = grid
  const [minX, minY, maxX, maxY] = bbox3857
  const [fminX, fminY, fmaxX, fmaxY] = fieldBbox
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!(spanX > 0 && spanY > 0)) return null

  const colStart = Math.max(0, Math.floor(((fminX - minX) / spanX) * width))
  const colEnd = Math.min(width - 1, Math.ceil(((fmaxX - minX) / spanX) * width))
  const rowStart = Math.max(0, Math.floor(((maxY - fmaxY) / spanY) * height))
  const rowEnd = Math.min(height - 1, Math.ceil(((maxY - fminY) / spanY) * height))

  let count = 0
  let ndviSum = 0
  let ndwiSum = 0
  let ndmiSum = 0

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const p = row * width + col
      if (!valid[p]) continue
      const x = minX + (col + 0.5) * (spanX / width)
      const y = maxY - (row + 0.5) * (spanY / height)
      const [lng, lat] = webMercatorToLngLat(x, y)
      if (!pointInGeometry(lng, lat, geometry)) continue
      count += 1
      ndviSum += ndvi[p]
      ndwiSum += ndwi[p]
      ndmiSum += ndmi[p]
    }
  }

  if (count === 0) return null
  return {
    ndvi: Number((ndviSum / count).toFixed(4)),
    ndwi: Number((ndwiSum / count).toFixed(4)),
    ndmi: Number((ndmiSum / count).toFixed(4)),
    sampleCount: count,
  }
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim()
  if (h.length !== 6) return [0, 0, 0]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function nearestPaletteIndex(r, g, b, paletteRgb) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < paletteRgb.length; i += 1) {
    const [pr, pg, pb] = paletteRgb[i]
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function zonalMajorityFromPixelSamples(votes, classMeta) {
  let bestIdx = -1
  let bestCount = 0
  let total = 0
  for (let i = 0; i < votes.length; i += 1) {
    const c = votes[i] || 0
    if (c <= 0) continue
    total += c
    if (c > bestCount) {
      bestCount = c
      bestIdx = i
    }
  }
  if (bestIdx < 0 || total === 0) return null
  const meta = classMeta[bestIdx]
  return {
    cropType: meta?.name || String(bestIdx),
    confidencePct: Number(((bestCount / total) * 100).toFixed(1)),
    sampleCount: total,
  }
}

function zonalPixelWindow(grid, geometry) {
  const fieldBbox = bbox3857FromGeometry(geometry)
  if (!fieldBbox || !grid?.width || !grid?.height || !grid?.bbox3857) return null

  const { width, height, bbox3857 } = grid
  const [minX, minY, maxX, maxY] = bbox3857
  const [fminX, fminY, fmaxX, fmaxY] = fieldBbox
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!(spanX > 0 && spanY > 0)) return null

  return {
    width,
    height,
    minX,
    maxY,
    spanX,
    spanY,
    colStart: Math.max(0, Math.floor(((fminX - minX) / spanX) * width)),
    colEnd: Math.min(width - 1, Math.ceil(((fmaxX - minX) / spanX) * width)),
    rowStart: Math.max(0, Math.floor(((maxY - fmaxY) / spanY) * height)),
    rowEnd: Math.min(height - 1, Math.ceil(((maxY - fminY) / spanY) * height)),
  }
}

/**
 * Majority crop class inside a polygon from an RGBA classification raster (Prithvi palette).
 * @param {{ rgba: Uint8Array; width: number; height: number; bbox3857: number[]; palette: Array<{ name: string; color: string }> }} grid
 * @param {GeoJSON.Geometry} geometry
 */
export function zonalRgbMajorityFromGrid(grid, geometry) {
  const win = zonalPixelWindow(grid, geometry)
  if (!win || !grid?.rgba || !Array.isArray(grid.palette) || !grid.palette.length) return null

  const paletteRgb = grid.palette.map(entry => hexToRgb(entry.color))
  /** @type {number[]} */
  const votes = new Array(grid.palette.length).fill(0)

  for (let row = win.rowStart; row <= win.rowEnd; row += 1) {
    for (let col = win.colStart; col <= win.colEnd; col += 1) {
      const p = row * win.width + col
      const i = p * 4
      const a = grid.rgba[i + 3]
      if (a === 0) continue
      const x = win.minX + (col + 0.5) * (win.spanX / win.width)
      const y = win.maxY - (row + 0.5) * (win.spanY / win.height)
      const [lng, lat] = webMercatorToLngLat(x, y)
      if (!pointInGeometry(lng, lat, geometry)) continue
      votes[nearestPaletteIndex(grid.rgba[i], grid.rgba[i + 1], grid.rgba[i + 2], paletteRgb)] += 1
    }
  }

  return zonalMajorityFromPixelSamples(votes, grid.palette)
}

/**
 * Majority crop class inside a polygon from an Int16 label raster (country phenology engine).
 * @param {{ labels: Int16Array; width: number; height: number; bbox3857: number[]; classMeta: Array<{ name: string }> }} grid
 * @param {GeoJSON.Geometry} geometry
 * @param {{ skipLabel?: (label: number) => boolean }} [options]
 */
export function zonalLabelMajorityFromGrid(grid, geometry, options = {}) {
  const win = zonalPixelWindow(grid, geometry)
  if (!win || !grid?.labels || !Array.isArray(grid.classMeta) || !grid.classMeta.length) return null

  const skipLabel = typeof options.skipLabel === 'function' ? options.skipLabel : () => false
  /** @type {number[]} */
  const votes = new Array(grid.classMeta.length).fill(0)

  for (let row = win.rowStart; row <= win.rowEnd; row += 1) {
    for (let col = win.colStart; col <= win.colEnd; col += 1) {
      const p = row * win.width + col
      const label = grid.labels[p]
      if (skipLabel(label)) continue
      if (label < 0 || label >= grid.classMeta.length) continue
      const x = win.minX + (col + 0.5) * (win.spanX / win.width)
      const y = win.maxY - (row + 0.5) * (win.spanY / win.height)
      const [lng, lat] = webMercatorToLngLat(x, y)
      if (!pointInGeometry(lng, lat, geometry)) continue
      votes[label] += 1
    }
  }

  return zonalMajorityFromPixelSamples(votes, grid.classMeta)
}

function gridCacheKey(groupKey, sceneDate, cloudCoverage) {
  return `${groupKey}|${sceneDate}|${cloudCoverage}`
}

async function fetchGroupGridCached(wmsConfig, masterGeometry, sceneDate, cloudCoverage, groupKey) {
  const key = gridCacheKey(groupKey, sceneDate, cloudCoverage)
  const cached = sceneGridCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.grid

  const grid = await fetchSentinelWmsIndicesGrid({
    accessToken: wmsConfig.accessToken,
    instanceId: wmsConfig.instanceId,
    geometry: masterGeometry,
    timeStart: sceneDate,
    timeEnd: addDaysToIso(sceneDate, 1),
    cloudCoverage,
    metersPerPixel: 10,
  })

  sceneGridCache.set(key, { grid, expiresAt: Date.now() + GRID_CACHE_TTL_MS })
  return grid
}

/**
 * Process many fields via spatial grouping — returns daily index series per fieldKey.
 * @param {Array<{ fieldKey: string; geometry?: GeoJSON.Geometry }>} fields
 * @param {{
 *   wmsConfig: { accessToken: string; instanceId: string };
 *   lookbackDays?: number;
 *   maxCloudCoverage?: number;
 *   referenceDate?: string;
 *   onProgress?: (p: { done: number; total: number; groups: number; groupIndex: number }) => void;
 *   signal?: AbortSignal;
 * }} options
 * @returns {Promise<Map<string, Array<{ date: string; ndvi: number | null; ndwi: number | null; ndmi: number | null; evi: null; ciRe: null }>>>}
 */
export async function processFieldsSpatialBatch(fields, options) {
  const wmsConfig = options.wmsConfig
  const lookbackDays = Math.max(7, Math.min(365, Number(options.lookbackDays) || 30))
  const maxCloud = Math.max(5, Math.min(100, Number(options.maxCloudCoverage) || 80))
  const refIso = String(options.referenceDate || new Date().toISOString()).slice(0, 10)
  const toIso = addDaysToIso(refIso, 1)
  const fromIso = subtractDaysFromIso(refIso, lookbackDays)

  const groups = spatialGroupFields(fields)
  /** @type {Map<string, Array<{ date: string; ndvi: number | null; ndwi: number | null; ndmi: number | null; evi: null; ciRe: null }>>} */
  const results = new Map()
  const total = fields.length
  let done = 0

  for (let gi = 0; gi < groups.length; gi += 1) {
    if (options.signal?.aborted) break
    const { groupKey, fields: groupFields } = groups[gi]
    const masterGeometry = buildMasterGeometry(groupFields)
    if (!masterGeometry) {
      done += groupFields.length
      options.onProgress?.({ done, total, groups: groups.length, groupIndex: gi })
      continue
    }

    /** @type {Map<string, Array<{ date: string; ndvi: number | null; ndwi: number | null; ndmi: number | null; evi: null; ciRe: null }>>} */
    const fieldDaily = new Map()
    for (const f of groupFields) {
      fieldDaily.set(f.fieldKey, [])
    }

    let sceneDates = []
    try {
      sceneDates = await fetchPcSentinelSceneDates(masterGeometry, fromIso, toIso, maxCloud)
    } catch {
      sceneDates = []
    }

    for (const sceneDate of sceneDates) {
      if (options.signal?.aborted) break
      let grid
      try {
        grid = await fetchGroupGridCached(wmsConfig, masterGeometry, sceneDate, maxCloud, groupKey)
      } catch {
        continue
      }

      for (const field of groupFields) {
        if (!field.geometry) continue
        const stats = zonalIndexStatsFromGrid(grid, field.geometry)
        if (!stats || stats.sampleCount === 0) continue
        fieldDaily.get(field.fieldKey).push({
          date: sceneDate,
          ndvi: stats.ndvi,
          ndwi: stats.ndwi,
          ndmi: stats.ndmi,
          evi: null,
          ciRe: null,
        })
      }
    }

    for (const field of groupFields) {
      const daily = (fieldDaily.get(field.fieldKey) || []).sort((a, b) => a.date.localeCompare(b.date))
      results.set(field.fieldKey, daily)
      done += 1
      options.onProgress?.({ done, total, groups: groups.length, groupIndex: gi })
    }
  }

  return results
}

export function clearSentinelFieldBatchGridCache() {
  sceneGridCache.clear()
}
