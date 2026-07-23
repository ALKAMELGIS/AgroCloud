/**
 * Disk + JSON catalog for uploaded aerial rasters.
 * PostGIS is optional (DATABASE_URL); catalog always works file-backed.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** backend/ — keep uploads next to the Express server (matches docker volume). */
const BACKEND_ROOT = path.resolve(__dirname, '../..')
export const RASTER_UPLOAD_ROOT = path.join(BACKEND_ROOT, 'uploads', 'rasters')
export const RASTER_TILE_CACHE_ROOT = path.join(BACKEND_ROOT, 'cache', 'tiles')
const CATALOG_PATH = path.join(RASTER_UPLOAD_ROOT, 'catalog.json')

function ensureDirs() {
  fs.mkdirSync(RASTER_UPLOAD_ROOT, { recursive: true })
  fs.mkdirSync(RASTER_TILE_CACHE_ROOT, { recursive: true })
}

function readCatalog() {
  ensureDirs()
  if (!fs.existsSync(CATALOG_PATH)) return { rasters: {} }
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  } catch {
    return { rasters: {} }
  }
}

function writeCatalog(catalog) {
  ensureDirs()
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
}

export function createRasterRecord(input) {
  ensureDirs()
  const id = input.id || randomUUID()
  const dir = path.join(RASTER_UPLOAD_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  const record = {
    id,
    name: input.name || 'raster',
    status: 'processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourcePath: null,
    cogPath: null,
    crs: null,
    bboxWgs84: null,
    footprint: null,
    widthPx: null,
    heightPx: null,
    bands: null,
    resolutionMeters: null,
    acquisitionDate: null,
    sensor: null,
    error: null,
    ...input,
  }
  const catalog = readCatalog()
  catalog.rasters[id] = record
  writeCatalog(catalog)
  return record
}

export function updateRasterRecord(id, patch) {
  const catalog = readCatalog()
  const prev = catalog.rasters[id]
  if (!prev) return null
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
  catalog.rasters[id] = next
  writeCatalog(catalog)
  return next
}

export function getRasterRecord(id) {
  return readCatalog().rasters[id] || null
}

export function listRasterRecords() {
  return Object.values(readCatalog().rasters).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )
}

export function deleteRasterRecord(id) {
  const catalog = readCatalog()
  const prev = catalog.rasters[id]
  if (!prev) return false
  delete catalog.rasters[id]
  writeCatalog(catalog)
  const dir = path.join(RASTER_UPLOAD_ROOT, id)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  const tileDir = path.join(RASTER_TILE_CACHE_ROOT, id)
  try {
    fs.rmSync(tileDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  return true
}

export function rasterDir(id) {
  return path.join(RASTER_UPLOAD_ROOT, id)
}

export function publicCogUrlForTitiler(id, record) {
  // TiTiler mounts uploads volume at /data → /data/{id}/cog.tif
  const fileName = path.basename(record.cogPath || record.sourcePath || 'cog.tif')
  return `file:///data/${id}/${fileName}`
}
