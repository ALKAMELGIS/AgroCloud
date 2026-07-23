/**
 * ProjectionManager — a shared CRS/projection engine for the raster pipeline.
 *
 * Registers a comprehensive EPSG definition set into proj4 (backed by the `epsg-index`
 * database, ~8000 CRS with proj4 strings) so any georeferenced raster — UTM zones,
 * national grids, ETRS89/NAD83, etc. — can be reprojected on the fly. GDAL/PROJ (when
 * installed) still handles COG conversion/warping with real datum grids; this module is
 * the pure-JS fallback + the CRS metadata/search database.
 *
 * Loaded ONCE (lazy singleton); definitions and lookups are cached. Never reloaded per
 * upload.
 */
import { createRequire } from 'module'
import proj4 from 'proj4'

// `require` shim for ESM (this file is type:module) to load the JSON database.
const require = createRequire(import.meta.url)

const WEB_MERCATOR_HALF = 20037508.342789244

/** @type {Map<string, any> | null} EPSG numeric-code string -> epsg-index record. */
let epsgDb = null
/** Cache of describeCrs() results keyed by normalized 'EPSG:xxxx'. */
const describeCache = new Map()
/** Codes we have already pushed into proj4.defs (avoids repeat work). */
const registered = new Set()

/** Load the EPSG database once. Safe to call repeatedly. */
export function warmProjectionManager() {
  if (epsgDb) return epsgDb
  try {
    // Lazy require keeps startup import cheap until first raster touches the engine.
    const all = require('epsg-index/all.json')
    epsgDb = new Map(Object.entries(all))
  } catch (err) {
    console.warn('[proj] epsg-index unavailable, only built-in proj4 CRS will work:', err?.message)
    epsgDb = new Map()
  }
  return epsgDb
}

/** Normalize any CRS-ish value to 'EPSG:xxxx' (or return null when not an EPSG code). */
export function normalizeCode(crs) {
  if (crs == null) return null
  if (typeof crs === 'number' && Number.isFinite(crs)) return `EPSG:${Math.trunc(crs)}`
  const s = String(crs).trim()
  if (!s) return null
  const m = s.match(/(?:EPSG:?)?(\d{3,7})/i)
  if (m) return `EPSG:${m[1]}`
  return s // pass through raw proj4/WKT-ish strings unchanged
}

/** Numeric code portion of an 'EPSG:xxxx' string, or null. */
function numericCode(crs) {
  const norm = normalizeCode(crs)
  const m = norm && norm.match(/^EPSG:(\d+)$/)
  return m ? m[1] : null
}

/** Programmatic WGS84 UTM proj4 def for 326zz (north) / 327zz (south) as a last resort. */
function utmProj4FromCode(code) {
  const n = Number(code)
  if (n >= 32601 && n <= 32660) return `+proj=utm +zone=${n - 32600} +datum=WGS84 +units=m +no_defs`
  if (n >= 32701 && n <= 32760) return `+proj=utm +zone=${n - 32700} +south +datum=WGS84 +units=m +no_defs`
  return null
}

/**
 * Ensure a CRS is registered in proj4 so reproject() works. Returns true when the CRS is
 * usable (built-in, freshly registered, or a raw proj4/WKT string proj4 can parse).
 */
export function ensureCrsRegistered(crs) {
  const norm = normalizeCode(crs)
  if (!norm) return false
  // Raw proj4/WKT string (not an EPSG code) — proj4 parses these directly.
  if (!/^EPSG:\d+$/.test(norm)) return true
  if (registered.has(norm)) return true
  if (proj4.defs(norm)) {
    registered.add(norm)
    return true
  }
  const code = numericCode(norm)
  const db = warmProjectionManager()
  const rec = code ? db.get(code) : null
  const def = rec?.proj4 || utmProj4FromCode(code)
  if (!def) return false
  try {
    proj4.defs(norm, def)
    registered.add(norm)
    return true
  } catch {
    return false
  }
}

/**
 * Reproject a single [x, y] coordinate from one CRS to another. Fast paths for the common
 * WGS84 <-> WebMercator cases; otherwise proj4 after ensuring both CRS are registered.
 * Throws with an actionable message when a CRS cannot be resolved.
 */
export function reproject(fromCrs, toCrs, coord) {
  const from = normalizeCode(fromCrs) || 'EPSG:4326'
  const to = normalizeCode(toCrs) || 'EPSG:4326'
  if (from === to) return [coord[0], coord[1]]
  if (from === 'EPSG:4326' && to === 'EPSG:3857') return lngLatToMerc(coord[0], coord[1])
  if (from === 'EPSG:3857' && to === 'EPSG:4326') return mercToLngLat(coord[0], coord[1])
  if (!ensureCrsRegistered(from)) {
    throw new Error(`Unknown source CRS ${from} — assign a coordinate system and retry.`)
  }
  if (!ensureCrsRegistered(to)) {
    throw new Error(`Unknown target CRS ${to} — assign a coordinate system and retry.`)
  }
  return proj4(from, to, [coord[0], coord[1]])
}

export function lngLatToMerc(lng, lat) {
  const x = (lng * WEB_MERCATOR_HALF) / 180
  const latRad = (lat * Math.PI) / 180
  const y = (WEB_MERCATOR_HALF * Math.log(Math.tan(Math.PI / 4 + latRad / 2))) / Math.PI
  return [x, y]
}

export function mercToLngLat(x, y) {
  const lng = (x / WEB_MERCATOR_HALF) * 180
  const latRad = Math.atan(Math.sinh((y / WEB_MERCATOR_HALF) * Math.PI))
  return [lng, (latRad * 180) / Math.PI]
}

/** Extract a human datum name from a WKT string (DATUM["..."]). */
function datumFromWkt(wkt) {
  if (!wkt) return null
  const m = String(wkt).match(/DATUM\["([^"]+)"/i)
  return m ? m[1].replace(/_/g, ' ') : null
}

/** epsg-index bbox is [north, west, south, east]. */
function areaBboxFromRecord(rec) {
  const b = Array.isArray(rec?.bbox) ? rec.bbox : null
  if (!b || b.length < 4) return null
  return { north: b[0], west: b[1], south: b[2], east: b[3] }
}

function kindLabel(rec) {
  const k = String(rec?.kind || '')
  if (/PROJ/i.test(k)) return 'projected'
  if (/GEOG/i.test(k)) return 'geographic'
  if (/GEOC/i.test(k)) return 'geocentric'
  if (/VERT/i.test(k)) return 'vertical'
  if (/COMPOUND/i.test(k)) return 'compound'
  return 'unknown'
}

/**
 * Rich description of a CRS for the validation/search UI.
 * @returns {{code, epsg:number|null, name, authority, datum, units, kind, proj4, wkt, areaOfUse, areaBbox, accuracy}|null}
 */
export function describeCrs(crs) {
  const norm = normalizeCode(crs)
  if (!norm) return null
  if (describeCache.has(norm)) return describeCache.get(norm)
  const code = numericCode(norm)
  const db = warmProjectionManager()
  const rec = code ? db.get(code) : null
  const info = {
    code: norm,
    epsg: code ? Number(code) : null,
    name: rec?.name || (norm === 'EPSG:3857' ? 'WGS 84 / Pseudo-Mercator' : norm),
    authority: 'EPSG',
    datum: datumFromWkt(rec?.wkt) || (/4326|3857/.test(norm) ? 'World Geodetic System 1984' : null),
    units: rec?.unit || (kindLabel(rec) === 'geographic' ? 'degree' : 'metre'),
    kind: kindLabel(rec),
    proj4: rec?.proj4 || (proj4.defs(norm) ? 'built-in' : null),
    wkt: rec?.wkt || null,
    areaOfUse: rec?.area || null,
    areaBbox: areaBboxFromRecord(rec),
    accuracy: rec?.accuracy ?? null,
  }
  describeCache.set(norm, info)
  return info
}

/** Common human aliases (space/punctuation-stripped, lowercase) -> canonical EPSG code. */
const CRS_ALIASES = {
  wgs84: 4326,
  wgs1984: 4326,
  webmercator: 3857,
  pseudomercator: 3857,
  googlemercator: 3857,
  sphericalmercator: 3857,
  nad83: 4269,
  etrs89: 4258,
  nad27: 4267,
  wgs72: 4322,
}

/** Compact search-result summary. */
function summary(rec, code) {
  return {
    code: `EPSG:${code}`,
    epsg: Number(code),
    name: rec.name || `EPSG:${code}`,
    kind: kindLabel(rec),
    units: rec.unit || null,
    authority: 'EPSG',
    areaOfUse: rec.area || null,
    accuracy: rec.accuracy ?? null,
  }
}

/**
 * Search the EPSG database by code, name, or area of use.
 * Handles "EPSG:32640", "32640", "UTM Zone 40N", "WGS84", "ETRS89", "Dubai", etc.
 * @returns {Array} ranked summaries (best first)
 */
export function searchCrs(query, limit = 25) {
  const db = warmProjectionManager()
  const q = String(query || '').trim()
  if (!q) return []
  const lim = Math.max(1, Math.min(100, Number(limit) || 25))

  // Direct code hit first.
  const directCode = numericCode(q)
  const results = []
  const seen = new Set()
  const pushHit = (code, score) => {
    if (seen.has(code) || !db.has(code)) return
    results.push({ ...summary(db.get(code), code), score })
    seen.add(code)
  }
  if (directCode && db.has(directCode)) pushHit(directCode, 1000)

  const ql = q.toLowerCase()
  const qNoSpace = ql.replace(/[\s_/,-]/g, '')
  // Common human aliases -> canonical EPSG code (strong hit).
  const alias = CRS_ALIASES[qNoSpace]
  if (alias) pushHit(String(alias), 980)
  // Normalize "utm zone 40n" style queries for name matching.
  const tokens = ql.replace(/[,]/g, ' ').split(/\s+/).filter(Boolean)
  for (const [code, rec] of db) {
    if (seen.has(code)) continue
    const name = String(rec.name || '').toLowerCase()
    const area = String(rec.area || '').toLowerCase()
    if (!name && !area) continue
    const nameNoSpace = name.replace(/[\s_/,-]/g, '')
    let score = 0
    if (name === ql || nameNoSpace === qNoSpace) score = 900
    else if (name.startsWith(ql) || nameNoSpace.startsWith(qNoSpace)) score = 700
    else if (name.includes(ql) || nameNoSpace.includes(qNoSpace)) score = 500
    else if (tokens.length && tokens.every(t => name.includes(t))) score = 400
    else if (area.includes(ql)) score = 200
    else if (tokens.length > 1 && tokens.every(t => `${name} ${area}`.includes(t))) score = 150
    if (score <= 0) continue
    // Prefer projected/geographic CRS over exotic kinds when scores tie.
    const k = kindLabel(rec)
    if (k === 'projected' || k === 'geographic') score += 20
    // Nudge canonical WGS 84 / Web Mercator defaults to the top of ambiguous queries.
    if (code === '4326' || code === '3857') score += 40
    else if (name.includes('wgs 84')) score += 10
    results.push({ ...summary(rec, code), score })
    seen.add(code)
  }

  results.sort((a, b) => b.score - a.score || a.epsg - b.epsg)
  return results.slice(0, lim).map(({ score, ...rest }) => rest)
}
