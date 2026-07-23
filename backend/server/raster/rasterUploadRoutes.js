/**
 * Aerial / high-res raster API:
 *   POST   /api/raster/upload
 *   GET    /api/raster
 *   GET    /api/raster/:id
 *   DELETE /api/raster/:id
 *   GET    /api/raster/:id/download
 *   GET    /api/raster/:id/tilejson
 *   GET    /api/raster/:id/tiles/:z/:x/:y(.png)
 *   GET    /api/raster/:id/footprint
 *   GET    /api/raster/:id/wms
 *   GET    /api/raster/:id/wmts
 */
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import {
  createRasterRecord,
  updateRasterRecord,
  getRasterRecord,
  listRasterRecords,
  deleteRasterRecord,
  rasterDir,
} from './rasterStore.js'
import { readRasterMetadata, hasGdal } from './rasterMetadata.js'
import { describeCrs } from './projectionManager.js'
import { assertSupportedDriver, ensureCloudOptimizedGeoTiff, isJp2Name } from './rasterCogPipeline.js'
import { convertRasterViaMlService } from './rasterMlConvert.js'
import {
  isPlainImageName,
  imageDimensions,
  resolveBoundsFromSidecar,
  bakeGeoTiffFromImage,
} from './rasterImageBake.js'
import {
  buildTileJson,
  getRasterTilePng,
  setTileHeaders,
  handleWmsGetMap,
  handleWmts,
  titilerConfigured,
} from './rasterTileProxy.js'

const MAX_UPLOAD_BYTES = Number(process.env.RASTER_MAX_UPLOAD_BYTES || 4 * 1024 * 1024 * 1024)

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const id = req.rasterUploadId
    const dir = rasterDir(id)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.tif'
    cb(null, `source${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 8 },
})

async function processUploadedRaster(id) {
  const record = getRasterRecord(id)
  if (!record) return
  try {
    updateRasterRecord(id, { status: 'processing', error: null })
    const sourcePath = record.sourcePath
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error('Uploaded source file missing')
    }
    assertSupportedDriver(record.name)

    // Plain images (PNG/JPEG) are not GeoTIFFs: decode them and either georeference
    // automatically from a world-file sidecar, or mark them for interactive placement.
    if (isPlainImageName(record.name)) {
      await processPlainImageUpload(id, sourcePath)
      return
    }

    // JPEG 2000 (e.g. Pléiades Neo .JP2) needs GDAL/OpenJPEG. If local GDAL is missing,
    // delegate decoding + reprojection to the rasterio-backed ML service.
    if (isJp2Name(record.name) && !(await hasGdal())) {
      await processJp2ViaMlService(id, sourcePath)
      return
    }

    const meta = await readRasterMetadata(sourcePath)
    const { cogPath, converted } = await ensureCloudOptimizedGeoTiff(sourcePath, rasterDir(id), meta)
    updateRasterRecord(id, {
      status: 'ready',
      cogPath,
      crs: meta.crs,
      bboxWgs84: meta.bboxWgs84,
      footprint: meta.footprint,
      widthPx: meta.widthPx,
      heightPx: meta.heightPx,
      bands: meta.bands,
      resolutionMeters: meta.resolutionMeters,
      acquisitionDate: meta.acquisitionDate,
      sensor: meta.sensor,
      convertedToCog: converted,
      tiler: titilerConfigured() ? 'titiler' : 'local',
      error: null,
    })
  } catch (err) {
    console.error('[raster] process failed', id, err)
    updateRasterRecord(id, {
      status: 'failed',
      error: err.message || String(err),
    })
  }
}

/**
 * Handle a PNG/JPEG upload: decode dimensions, then either auto-georeference from a
 * world-file sidecar or park the raster in `needs_georef` for interactive placement.
 */
async function processPlainImageUpload(id, sourcePath) {
  const { width, height } = imageDimensions(sourcePath)
  const dir = rasterDir(id)
  const sidecar = resolveBoundsFromSidecar(dir, width, height)

  if (sidecar) {
    const cogPath = path.join(dir, 'cog.tif')
    const baked = await bakeGeoTiffFromImage({
      sourcePath,
      destPath: cogPath,
      bounds: sidecar.sourceBounds,
      crs: sidecar.crs,
      wgsBounds: sidecar.bounds,
    })
    updateRasterRecord(id, {
      status: 'ready',
      cogPath,
      crs: 'EPSG:4326',
      bboxWgs84: baked.bboxWgs84,
      footprint: baked.footprint,
      widthPx: baked.width,
      heightPx: baked.height,
      bands: baked.bands,
      resolutionMeters: baked.resolutionMeters,
      sourceKind: 'image',
      georefSource: sidecar.source || 'sidecar',
      convertedToCog: true,
      tiler: titilerConfigured() ? 'titiler' : 'local',
      error: null,
    })
    return
  }

  // No georeferencing available — wait for the client to supply placement bounds.
  updateRasterRecord(id, {
    status: 'needs_georef',
    widthPx: width,
    heightPx: height,
    bands: 3,
    sourceKind: 'image',
    error: null,
  })
}

/**
 * Handle a JPEG 2000 upload (no local GDAL): the rasterio-backed ML service decodes it,
 * reprojects to Web Mercator, and writes cog.tif into this raster's directory. Ortho
 * products (e.g. Pléiades Neo) carry their own georeferencing, so the result is ready to tile.
 */
async function processJp2ViaMlService(id, sourcePath) {
  const dir = rasterDir(id)
  const info = await convertRasterViaMlService(id, sourcePath)
  const cogPath = path.join(dir, 'cog.tif')
  if (!fs.existsSync(cogPath)) {
    throw new Error('JP2 conversion did not produce an output raster.')
  }
  const bbox = info.bbox_wgs84 || null
  updateRasterRecord(id, {
    status: 'ready',
    cogPath,
    crs: info.crs || 'EPSG:3857',
    bboxWgs84: bbox,
    footprint: footprintFromBbox(bbox),
    widthPx: info.width ?? null,
    heightPx: info.height ?? null,
    bands: info.bands ?? null,
    resolutionMeters: info.resolution_m ?? null,
    sourceKind: 'satellite',
    georefSource: 'embedded',
    convertedToCog: true,
    tiler: titilerConfigured() ? 'titiler' : 'local',
    error: null,
  })
}

/** Build a rectangular WGS84 footprint feature from a bbox (west/south/east/north). */
function footprintFromBbox(bbox) {
  if (!bbox) return null
  const { west, south, east, north } = bbox
  return {
    type: 'Feature',
    properties: { kind: 'raster_extent' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
          [west, north],
        ],
      ],
    },
  }
}

/** Size in bytes of the baked COG (preferred) or the original source file, or null. */
function fileByteSize(record) {
  const p = record.cogPath || record.sourcePath
  try {
    if (p && fs.existsSync(p)) return fs.statSync(p).size
  } catch {
    /* stat failed — treat as unknown */
  }
  return null
}

/**
 * Approximate ground pixel size in metres, derived from the WGS84 extent and pixel
 * dimensions. Falls back to any resolution reported by the raster metadata reader.
 */
function computePixelSizeMeters(record) {
  const b = record.bboxWgs84
  if (b && record.widthPx && record.heightPx) {
    const midLat = (b.north + b.south) / 2
    const mPerDegLat = 111320
    const mPerDegLon = 111320 * Math.cos((midLat * Math.PI) / 180)
    const widthM = Math.abs(b.east - b.west) * mPerDegLon
    const heightM = Math.abs(b.north - b.south) * mPerDegLat
    const avg = (widthM / record.widthPx + heightM / record.heightPx) / 2
    if (Number.isFinite(avg) && avg > 0) return Number(avg.toFixed(3))
  }
  return record.resolutionMeters ?? null
}

/** Rich CRS description (name/datum/units/accuracy) for the client validation panel. */
function buildCrsInfo(record) {
  if (!record?.crs) return null
  const d = describeCrs(record.crs)
  if (!d) return { code: record.crs, name: record.crs, authority: 'EPSG' }
  return {
    code: d.code,
    epsg: d.epsg,
    name: d.name,
    authority: d.authority,
    datum: d.datum,
    units: d.units,
    kind: d.kind,
    areaOfUse: d.areaOfUse,
    accuracy: d.accuracy,
  }
}

/** GIS validation summary: source CRS -> map display CRS, datum, transform, warnings. */
function buildCrsValidation(record) {
  if (!record?.crs) return null
  const src = describeCrs(record.crs)
  const targetCrs = 'EPSG:3857'
  const warnings = []
  const gs = record.georefSource || ''
  if (gs.startsWith('manual:')) {
    if (gs === 'manual:crs') warnings.push('CRS assigned/overridden manually.')
    else warnings.push('Location set manually via georeferencing (bbox/corners/GCPs).')
  }
  if (src?.datum && !/WGS[\s_]?(1984|84)/i.test(src.datum)) {
    warnings.push(
      `Source datum "${src.datum}" differs from the map datum (WGS 84); using a proj4 transform (no NTv2/grid shift).`,
    )
  }
  if (!src) warnings.push(`CRS ${record.crs} is not in the EPSG database — verify the coordinate system.`)
  return {
    sourceCrs: record.crs,
    sourceName: src?.name || record.crs,
    sourceDatum: src?.datum || null,
    targetCrs,
    targetName: 'WGS 84 / Pseudo-Mercator',
    targetDatum: 'World Geodetic System 1984',
    transformationApplied: `${record.crs} -> ${targetCrs} (on-the-fly)`,
    units: src?.units || null,
    accuracy: src?.accuracy ?? null,
    warnings,
  }
}

function publicRecord(record, req) {
  if (!record) return null
  const tilejson = record.status === 'ready' ? buildTileJson(req, record) : null
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    error: record.error,
    crs: record.crs,
    crsInfo: buildCrsInfo(record),
    crsValidation: buildCrsValidation(record),
    bboxWgs84: record.bboxWgs84,
    footprint: record.footprint,
    widthPx: record.widthPx,
    heightPx: record.heightPx,
    bands: record.bands,
    resolutionMeters: record.resolutionMeters,
    pixelSizeMeters: computePixelSizeMeters(record),
    byteSize: fileByteSize(record),
    isCog: !!record.cogPath,
    acquisitionDate: record.acquisitionDate,
    sensor: record.sensor,
    sourceKind: record.sourceKind || null,
    georefSource: record.georefSource || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    tiler: record.tiler,
    convertedToCog: record.convertedToCog,
    tilejson,
    tiles: tilejson?.tiles || null,
  }
}

/** Public projection of a raster record (shared with the CRS routes). */
export function publicRasterRecord(record, req) {
  return publicRecord(record, req)
}

export function registerRasterRoutes(app) {
  app.post(
    '/api/raster/upload',
    (req, res, next) => {
      const id = randomUUID()
      req.rasterUploadId = id
      createRasterRecord({ id, name: 'pending', status: 'uploading' })
      upload.fields([
        { name: 'raster', maxCount: 1 },
        { name: 'file', maxCount: 1 },
        { name: 'sidecar', maxCount: 6 },
      ])(req, res, err => {
        if (err) {
          deleteRasterRecord(id)
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Raster upload exceeds size limit' })
          }
          return res.status(400).json({ error: err.message || 'Upload failed' })
        }
        next()
      })
    },
    async (req, res) => {
      const id = req.rasterUploadId
      try {
        const files = [...(req.files?.raster || []), ...(req.files?.file || [])]
        const primary = files[0]
        if (!primary) {
          deleteRasterRecord(id)
          return res.status(400).json({ error: 'No raster file in multipart field "raster" or "file"' })
        }
        assertSupportedDriver(primary.originalname)
        const sidecars = req.files?.sidecar || []
        for (const sc of sidecars) {
          const dest = path.join(rasterDir(id), path.basename(sc.originalname))
          if (path.resolve(sc.path) !== path.resolve(dest)) {
            fs.renameSync(sc.path, dest)
          }
        }
        updateRasterRecord(id, {
          name: req.body?.name || primary.originalname,
          sourcePath: primary.path,
          status: 'processing',
        })
        setImmediate(() => {
          processUploadedRaster(id).catch(err => console.error(err))
        })
        const record = getRasterRecord(id)
        return res.status(202).json(publicRecord(record, req))
      } catch (err) {
        updateRasterRecord(id, { status: 'failed', error: err.message })
        const status = err.status || 500
        return res.status(status).json({ error: err.message || 'Raster upload failed' })
      }
    },
  )

  // Interactive placement for non-georeferenced images (PNG/JPEG without a world file).
  app.post('/api/raster/:id/georeference', async (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    if ((record.sourceKind || (isPlainImageName(record.name) ? 'image' : null)) !== 'image') {
      return res.status(400).json({ error: 'Georeferencing is only supported for image uploads (PNG/JPEG).' })
    }
    if (!record.sourcePath || !fs.existsSync(record.sourcePath)) {
      return res.status(409).json({ error: 'Source image is no longer available; re-upload it.' })
    }
    // Placement mode: 'bbox' (default), 'corners' (NW/NE/SE/SW), or 'gcps' (>=3 points).
    const body = req.body || {}
    const mode = body.mode || (body.corners ? 'corners' : body.gcps ? 'gcps' : 'bbox')
    const bakeArgs = { sourcePath: record.sourcePath, crs: 'EPSG:4326' }
    try {
      if (mode === 'corners') {
        const c = body.corners || {}
        for (const key of ['nw', 'ne', 'se', 'sw']) {
          const p = c[key]
          if (!Array.isArray(p) || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1]))) {
            return res.status(400).json({ error: `Invalid corner "${key}": need [lon, lat].` })
          }
        }
        bakeArgs.corners = {
          nw: [Number(c.nw[0]), Number(c.nw[1])],
          ne: [Number(c.ne[0]), Number(c.ne[1])],
          se: [Number(c.se[0]), Number(c.se[1])],
          sw: [Number(c.sw[0]), Number(c.sw[1])],
        }
      } else if (mode === 'gcps') {
        const gcps = Array.isArray(body.gcps) ? body.gcps : []
        if (gcps.length < 3) {
          return res.status(400).json({ error: 'Ground control points: need at least 3 points.' })
        }
        bakeArgs.gcps = gcps.map(g => ({
          col: Number(g.col ?? g.px),
          row: Number(g.row ?? g.py),
          lon: Number(g.lon ?? g.x),
          lat: Number(g.lat ?? g.y),
        }))
        if (bakeArgs.gcps.some(g => ![g.col, g.row, g.lon, g.lat].every(Number.isFinite))) {
          return res.status(400).json({ error: 'Invalid GCP: each needs col,row,lon,lat numbers.' })
        }
      } else {
        const b = body.bounds || body
        const bounds = { west: Number(b.west), south: Number(b.south), east: Number(b.east), north: Number(b.north) }
        if (
          ![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) ||
          bounds.east <= bounds.west ||
          bounds.north <= bounds.south
        ) {
          return res.status(400).json({ error: 'Invalid bounds: need west<east and south<north (WGS84 degrees).' })
        }
        bakeArgs.bounds = bounds
      }

      const cogPath = path.join(rasterDir(record.id), 'cog.tif')
      bakeArgs.destPath = cogPath
      const baked = await bakeGeoTiffFromImage(bakeArgs)
      const next = updateRasterRecord(record.id, {
        status: 'ready',
        cogPath,
        crs: 'EPSG:4326',
        bboxWgs84: baked.bboxWgs84,
        footprint: baked.footprint,
        widthPx: baked.width,
        heightPx: baked.height,
        bands: baked.bands,
        resolutionMeters: baked.resolutionMeters,
        sourceKind: 'image',
        georefSource: `manual:${mode}`,
        convertedToCog: true,
        tiler: titilerConfigured() ? 'titiler' : 'local',
        error: null,
      })
      return res.json(publicRecord(next, req))
    } catch (err) {
      console.error('[raster] georeference failed', record.id, err)
      const status = err.status || 500
      return res.status(status).json({ error: err.message || 'Georeferencing failed' })
    }
  })

  app.get('/api/raster', (req, res) => {
    res.json({ rasters: listRasterRecords().map(r => publicRecord(r, req)) })
  })

  app.get('/api/raster/:id', (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    res.json(publicRecord(record, req))
  })

  app.delete('/api/raster/:id', (req, res) => {
    if (!deleteRasterRecord(req.params.id)) return res.status(404).json({ error: 'Raster not found' })
    res.json({ ok: true })
  })

  // Export the baked GeoTIFF/COG (or the original source if no COG was produced).
  app.get('/api/raster/:id/download', (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    const cogReady = record.cogPath && fs.existsSync(record.cogPath)
    const filePath = cogReady ? record.cogPath : record.sourcePath
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(409).json({ error: 'No raster file available to download yet.' })
    }
    const base = String(record.name || `raster-${record.id}`).replace(/\.[^.]+$/, '')
    const ext = cogReady ? 'tif' : path.extname(filePath).replace('.', '').toLowerCase() || 'tif'
    const isTiff = ext === 'tif' || ext === 'tiff'
    res.setHeader('Content-Type', isTiff ? 'image/tiff' : 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${base}.${ext}"`)
    fs.createReadStream(filePath)
      .on('error', err => {
        if (!res.headersSent) res.status(500).json({ error: err.message || 'Download failed' })
      })
      .pipe(res)
  })

  app.get('/api/raster/:id/tilejson', (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    if (record.status !== 'ready') {
      return res.status(409).json({ error: 'Raster not ready', status: record.status, detail: record.error })
    }
    res.json(buildTileJson(req, record))
  })

  app.get('/api/raster/:id/footprint', (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    res.json({
      type: 'FeatureCollection',
      features: record.footprint ? [record.footprint] : [],
      bboxWgs84: record.bboxWgs84,
    })
  })

  app.get(['/api/raster/:id/tiles/:z/:x/:y.png', '/api/raster/:id/tiles/:z/:x/:y'], async (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    if (record.status !== 'ready') {
      return res.status(409).json({ error: 'Raster not ready', status: record.status })
    }
    const z = Number(req.params.z)
    const x = Number(req.params.x)
    const y = Number(String(req.params.y).replace(/\.png$/i, ''))
    if (![z, x, y].every(n => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ error: 'Invalid tile coordinates' })
    }
    try {
      const { buf } = await getRasterTilePng(record, z, x, y)
      setTileHeaders(res)
      res.send(buf)
    } catch (err) {
      console.error('[raster] tile error', err)
      res.status(502).json({ error: err.message || 'Tile generation failed' })
    }
  })

  app.get('/api/raster/:id/wms', async (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    if (record.status !== 'ready') {
      return res.status(409).json({ error: 'Raster not ready', status: record.status })
    }
    try {
      await handleWmsGetMap(req, res, record)
    } catch (err) {
      res.status(502).json({ error: err.message || 'WMS failed' })
    }
  })

  app.get('/api/raster/:id/wmts', (req, res) => {
    const record = getRasterRecord(req.params.id)
    if (!record) return res.status(404).json({ error: 'Raster not found' })
    if (record.status !== 'ready') {
      return res.status(409).json({ error: 'Raster not ready', status: record.status })
    }
    const request = String(req.query.REQUEST || req.query.request || '')
    if (/GetTile/i.test(request)) {
      const z = Number(req.query.TILEMATRIX || req.query.TileMatrix)
      const x = Number(req.query.TILECOL || req.query.TileCol)
      const y = Number(req.query.TILEROW || req.query.TileRow)
      return res.redirect(`/api/raster/${record.id}/tiles/${z}/${x}/${y}.png`)
    }
    handleWmts(req, res, record)
  })
}
