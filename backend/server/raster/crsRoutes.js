/**
 * Coordinate Reference System (CRS) endpoints backed by ProjectionManager.
 *
 *   GET  /api/crs/search?q=&limit=   -> ranked CRS matches (code, name, datum, units, area)
 *   GET  /api/crs/:code              -> full CRS description
 *   POST /api/raster/:id/assign-crs  -> override a raster's CRS, recompute footprint/bbox
 */
import fs from 'fs'
import path from 'path'
import { describeCrs, normalizeCode, searchCrs } from './projectionManager.js'
import { footprintForCrs, readRasterSourceCorners } from './rasterMetadata.js'
import { getRasterRecord, updateRasterRecord, RASTER_TILE_CACHE_ROOT } from './rasterStore.js'
import { publicRasterRecord } from './rasterUploadRoutes.js'

/** Clear cached XYZ tiles for a raster so they re-render against the new CRS. */
function clearTileCache(id) {
  const dir = path.join(RASTER_TILE_CACHE_ROOT, id)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

export function registerCrsRoutes(app) {
  app.get('/api/crs/search', (req, res) => {
    const q = String(req.query.q || '').trim()
    const limit = Number(req.query.limit) || 25
    if (!q) return res.json({ query: '', results: [] })
    try {
      return res.json({ query: q, results: searchCrs(q, limit) })
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'CRS search failed' })
    }
  })

  app.get('/api/crs/:code', (req, res) => {
    const norm = normalizeCode(req.params.code)
    if (!norm) return res.status(400).json({ error: 'Invalid CRS code' })
    const info = describeCrs(norm)
    if (!info) return res.status(404).json({ error: `Unknown CRS ${norm}` })
    return res.json(info)
  })

  // Override/assign a raster's CRS and recompute its WGS84 footprint from native corners.
  app.post('/api/raster/:id/assign-crs', async (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    const crs = normalizeCode(req.body?.crs)
    if (!crs || !/^EPSG:\d+$/.test(crs)) {
      return res.status(400).json({ error: 'Provide a valid EPSG code, e.g. { "crs": "EPSG:32640" }' })
    }
    const info = describeCrs(crs)
    if (!info) return res.status(400).json({ error: `Unknown CRS ${crs}` })
    const filePath = record.cogPath || record.sourcePath
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(409).json({ error: 'Raster file missing on disk — re-upload before assigning a CRS.' })
    }
    try {
      const { corners, widthPx, heightPx, pixelSizeX, pixelSizeY } =
        await readRasterSourceCorners(filePath)
      const { bboxWgs84, footprint, resolutionMeters } = footprintForCrs(
        corners,
        crs,
        pixelSizeX,
        pixelSizeY,
      )
      const next = updateRasterRecord(record.id, {
        crs,
        bboxWgs84,
        footprint,
        widthPx: record.widthPx || widthPx,
        heightPx: record.heightPx || heightPx,
        resolutionMeters: resolutionMeters ?? record.resolutionMeters,
        georefSource: 'manual:crs',
        status: 'ready',
        error: null,
      })
      clearTileCache(record.id)
      return res.json(publicRasterRecord(next, req))
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'Failed to assign CRS' })
    }
  })
}
