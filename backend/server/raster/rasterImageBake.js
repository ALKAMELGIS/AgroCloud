/**
 * Decode plain images (PNG / JPEG) and bake them into a georeferenced GeoTIFF
 * that the existing geotiff.js tiler + rasterio ML pipeline can read.
 *
 * This makes non-GeoTIFF imagery (Google Earth exports, drone stills, screenshots,
 * scanned maps) usable without GDAL on the host: we decode to RGB and write a
 * single-strip GeoTIFF with ModelTiepoint / ModelPixelScale georeferencing.
 *
 * Georeferencing comes from either:
 *   1. a world file (+ optional .prj) sidecar, or
 *   2. an explicit bounding box supplied later by the Georeferencing step.
 */
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { writeArrayBuffer } from 'geotiff'
import proj4 from 'proj4'

const PLAIN_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg'])
const WORLD_FILE_EXT = new Set(['.pgw', '.pngw', '.jgw', '.jpgw', '.jpegw', '.wld'])
const METADATA_XML_EXT = new Set(['.xml'])

export function isPlainImageName(name) {
  return PLAIN_IMAGE_EXT.has(path.extname(name || '').toLowerCase())
}

/** Decode a PNG/JPEG file to interleaved 8-bit RGB. */
export function decodeImageRgb(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase()
  const buf = fs.readFileSync(sourcePath)
  let width
  let height
  let rgba
  if (ext === '.png') {
    const png = PNG.sync.read(buf)
    width = png.width
    height = png.height
    rgba = png.data // RGBA
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const decoded = jpeg.decode(buf, { maxMemoryUsageInMB: 2048, formatAsRGBA: true })
    width = decoded.width
    height = decoded.height
    rgba = decoded.data // RGBA
  } else {
    throw new Error(`Unsupported image type for decode: ${ext}`)
  }
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0, o = 0; i < width * height; i += 1) {
    const s = i * 4
    rgb[o++] = rgba[s]
    rgb[o++] = rgba[s + 1]
    rgb[o++] = rgba[s + 2]
  }
  return { width, height, rgb }
}

/** Read image dimensions only (still decodes; fine for typical upload sizes). */
export function imageDimensions(sourcePath) {
  const { width, height } = decodeImageRgb(sourcePath)
  return { width, height }
}

function parseWorldFileText(text) {
  const nums = String(text)
    .trim()
    .split(/\r?\n/)
    .map(l => Number(l.trim()))
  if (nums.length < 6 || nums.some(n => !Number.isFinite(n))) return null
  const [pixelSizeX, rotationY, rotationX, pixelSizeY, upperLeftX, upperLeftY] = nums
  return { pixelSizeX, rotationY, rotationX, pixelSizeY, upperLeftX, upperLeftY }
}

function epsgFromPrjWkt(wkt) {
  const trimmed = String(wkt || '').trim()
  if (!trimmed) return null
  const matches = [...trimmed.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/gi)]
  if (matches.length) return `EPSG:${matches[matches.length - 1][1]}`
  if (/Pseudo-Mercator|Web_Mercator/i.test(trimmed)) return 'EPSG:3857'
  if (/GCS_WGS_1984|"WGS 84"/i.test(trimmed)) return 'EPSG:4326'
  const utm = trimmed.match(/UTM[_ ]Zone[_ ]?(\d{1,2})([NS])/i)
  if (utm) {
    const zone = Number(utm[1])
    const north = utm[2].toUpperCase() === 'N'
    if (zone >= 1 && zone <= 60) return `EPSG:${north ? 32600 + zone : 32700 + zone}`
  }
  return null
}

/**
 * Parse an Airbus DIMAP metadata document (Pléiades / Pléiades Neo / SPOT) for the
 * geographic dataset extent. DIMAP v2 uses <Vertex><LON>/<LAT>; v1 uses FRAME_LON/FRAME_LAT.
 * The extent is geographic (WGS84 lon/lat), so this returns an EPSG:4326 bbox.
 * @returns {{west:number, south:number, east:number, north:number} | null}
 */
function parseDimapExtent(xmlText) {
  const text = String(xmlText || '')
  if (!/<Dimap_Document|<Dataset_Extent|<Dataset_Frame|DIMAP/i.test(text)) return null
  const lons = []
  const lats = []
  const lonRe = /<(?:LON|FRAME_LON)>\s*(-?\d+(?:\.\d+)?)\s*<\/(?:LON|FRAME_LON)>/gi
  const latRe = /<(?:LAT|FRAME_LAT)>\s*(-?\d+(?:\.\d+)?)\s*<\/(?:LAT|FRAME_LAT)>/gi
  let m
  while ((m = lonRe.exec(text)) !== null) lons.push(Number(m[1]))
  while ((m = latRe.exec(text)) !== null) lats.push(Number(m[1]))
  const validLon = lons.filter(Number.isFinite)
  const validLat = lats.filter(Number.isFinite)
  if (validLon.length < 2 || validLat.length < 2) return null
  const west = Math.min(...validLon)
  const east = Math.max(...validLon)
  const south = Math.min(...validLat)
  const north = Math.max(...validLat)
  if (east <= west || north <= south) return null
  if (west < -180 || east > 180 || south < -90 || north > 90) return null
  return { west, south, east, north }
}

function findSidecar(dir, extSet) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }
  const hit = entries.find(f => extSet.has(path.extname(f).toLowerCase()))
  return hit ? path.join(dir, hit) : null
}

/**
 * Resolve georeferencing bounds from a world-file (+ optional .prj) sidecar.
 * @returns {{ bounds: {west,south,east,north}, crs: string } | null}
 */
export function resolveBoundsFromSidecar(dir, width, height) {
  const worldPath = findSidecar(dir, WORLD_FILE_EXT)
  if (!worldPath) {
    // No world file — try an Airbus DIMAP metadata sidecar (geographic extent, WGS84).
    const xmlPath = findSidecar(dir, METADATA_XML_EXT)
    if (xmlPath) {
      const extent = parseDimapExtent(fs.readFileSync(xmlPath, 'utf8'))
      if (extent) {
        return { crs: 'EPSG:4326', sourceBounds: extent, bounds: extent, source: 'dimap' }
      }
    }
    return null
  }
  const world = parseWorldFileText(fs.readFileSync(worldPath, 'utf8'))
  if (!world) return null

  const prjPath = findSidecar(dir, new Set(['.prj']))
  let crs = prjPath ? epsgFromPrjWkt(fs.readFileSync(prjPath, 'utf8')) : null

  // Corners in source CRS (ESRI center-of-pixel convention).
  const corner = (col, row) => [
    world.upperLeftX + col * world.pixelSizeX + row * world.rotationX,
    world.upperLeftY + col * world.rotationY + row * world.pixelSizeY,
  ]
  const cs = [corner(-0.5, -0.5), corner(width - 0.5, -0.5), corner(width - 0.5, height - 0.5), corner(-0.5, height - 0.5)]
  const xs = cs.map(c => c[0])
  const ys = cs.map(c => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  if (!crs) {
    if (Math.max(Math.abs(minX), Math.abs(maxX)) > 1_000_000) crs = 'EPSG:3857'
    else if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90) crs = 'EPSG:4326'
    else return null // unknown projected CRS without a .prj
  }

  // Reproject to WGS84 for the record bbox; keep source CRS for the baked GeoTIFF.
  const toWgs = (x, y) => {
    if (crs === 'EPSG:4326') return [x, y]
    try {
      return proj4(crs, 'EPSG:4326', [x, y])
    } catch {
      return [x, y]
    }
  }
  const wgs = [toWgs(minX, minY), toWgs(maxX, maxY)]
  const wgsWest = Math.min(wgs[0][0], wgs[1][0])
  const wgsEast = Math.max(wgs[0][0], wgs[1][0])
  const wgsSouth = Math.min(wgs[0][1], wgs[1][1])
  const wgsNorth = Math.max(wgs[0][1], wgs[1][1])

  return {
    crs,
    sourceBounds: { west: minX, south: minY, east: maxX, north: maxY },
    bounds: { west: wgsWest, south: wgsSouth, east: wgsEast, north: wgsNorth },
    source: 'worldfile',
  }
}

function footprintFromBounds(b) {
  return {
    type: 'Feature',
    properties: { kind: 'raster_extent' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.west, b.north],
          [b.east, b.north],
          [b.east, b.south],
          [b.west, b.south],
          [b.west, b.north],
        ],
      ],
    },
  }
}

function footprintFromCorners(corners) {
  const ring = [...corners.map(c => [c[0], c[1]]), [corners[0][0], corners[0][1]]]
  return {
    type: 'Feature',
    properties: { kind: 'raster_extent' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

/**
 * Least-squares affine solve: find [a,b,c] such that value ≈ a*col + b*row + c for each
 * axis, given control points {col,row,x,y}. Exact for 3 points, best-fit for more.
 * @returns {{ m00:number, m01:number, m03:number, m10:number, m11:number, m13:number }}
 */
function solveAffine(points) {
  // Normal equations: (AᵀA) p = Aᵀb, with A rows [col,row,1].
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const atx = [0, 0, 0]
  const aty = [0, 0, 0]
  for (const p of points) {
    const v = [p.col, p.row, 1]
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) ata[i][j] += v[i] * v[j]
      atx[i] += v[i] * p.x
      aty[i] += v[i] * p.y
    }
  }
  const solve3 = (Ain, bin) => {
    // Gaussian elimination with partial pivoting on a copied 3x4 augmented matrix.
    const m = Ain.map((row, i) => [...row, bin[i]])
    for (let col = 0; col < 3; col += 1) {
      let piv = col
      for (let r = col + 1; r < 3; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
      if (Math.abs(m[piv][col]) < 1e-12) throw new Error('Degenerate control points (collinear).')
      ;[m[col], m[piv]] = [m[piv], m[col]]
      for (let r = 0; r < 3; r += 1) {
        if (r === col) continue
        const f = m[r][col] / m[col][col]
        for (let k = col; k < 4; k += 1) m[r][k] -= f * m[col][k]
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
  }
  const [m00, m01, m03] = solve3(ata, atx)
  const [m10, m11, m13] = solve3(ata, aty)
  return { m00, m01, m03, m10, m11, m13 }
}

/** Apply a pixel→world affine to a (col,row) pixel coordinate. */
function applyAffine(a, col, row) {
  return [a.m00 * col + a.m01 * row + a.m03, a.m10 * col + a.m11 * row + a.m13]
}

/** World coords of the four image corners (NW, NE, SE, SW) under a pixel→world affine. */
function worldCornersFromAffine(a, width, height) {
  return [
    applyAffine(a, 0, 0),
    applyAffine(a, width, 0),
    applyAffine(a, width, height),
    applyAffine(a, 0, height),
  ]
}

/** True when the affine has no rotation/skew (north-up), so it can use ModelPixelScale. */
function isAxisAligned(a) {
  const scale = Math.max(Math.abs(a.m00), Math.abs(a.m11), 1e-12)
  return Math.abs(a.m01) < scale * 1e-6 && Math.abs(a.m10) < scale * 1e-6
}

function resolutionMetersForBounds(bounds, width, crs) {
  if (crs === 'EPSG:4326') {
    const midLat = (bounds.south + bounds.north) / 2
    const mPerDeg = 111_320 * Math.cos((midLat * Math.PI) / 180)
    return ((bounds.east - bounds.west) / width) * mPerDeg
  }
  return (bounds.east - bounds.west) / width
}

/** Build the pixel→world affine for the requested placement mode. */
function affineForPlacement({ width, height, bounds, corners, gcps }) {
  if (gcps && gcps.length >= 3) {
    const pts = gcps.map(g => ({
      col: Number(g.col ?? g.px),
      row: Number(g.row ?? g.py),
      x: Number(g.lon ?? g.x),
      y: Number(g.lat ?? g.y),
    }))
    if (pts.some(p => ![p.col, p.row, p.x, p.y].every(Number.isFinite))) {
      throw new Error('Invalid ground control points: need col,row,lon,lat numbers.')
    }
    return solveAffine(pts)
  }
  if (corners) {
    const { nw, ne, se, sw } = corners
    for (const c of [nw, ne, se, sw]) {
      if (!Array.isArray(c) || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) {
        throw new Error('Invalid corners: need NW/NE/SE/SW as [lon,lat].')
      }
    }
    return solveAffine([
      { col: 0, row: 0, x: Number(nw[0]), y: Number(nw[1]) },
      { col: width, row: 0, x: Number(ne[0]), y: Number(ne[1]) },
      { col: width, row: height, x: Number(se[0]), y: Number(se[1]) },
      { col: 0, row: height, x: Number(sw[0]), y: Number(sw[1]) },
    ])
  }
  const west = Number(bounds?.west)
  const south = Number(bounds?.south)
  const east = Number(bounds?.east)
  const north = Number(bounds?.north)
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    throw new Error('Invalid georeferencing bounds: expected west<east and south<north.')
  }
  // North-up: origin at (col=0,row=0)=NW; y decreases with row.
  return {
    m00: (east - west) / width,
    m01: 0,
    m03: west,
    m10: 0,
    m11: -(north - south) / height,
    m13: north,
  }
}

/**
 * Bake a georeferenced GeoTIFF from a plain image. Placement is one of:
 *   - `bounds`  {west,south,east,north}  axis-aligned extent (default), or
 *   - `corners` {nw,ne,se,sw} each [lon,lat] (supports rotation), or
 *   - `gcps`    [{col,row,lon,lat}] (>=3, least-squares affine).
 * Non-north-up placements are written with a GeoTIFF ModelTransformation.
 * @param {object} p
 * @param {string} p.sourcePath   PNG/JPEG on disk
 * @param {string} p.destPath     output GeoTIFF (cog.tif)
 * @param {string} p.crs          EPSG code of the supplied world coords (EPSG:4326 or EPSG:3857)
 * @param {{west,south,east,north}} [p.bounds]
 * @param {{nw,ne,se,sw}} [p.corners]
 * @param {Array<{col,row,lon,lat}>} [p.gcps]
 * @param {{west,south,east,north}} [p.wgsBounds] override WGS84 bbox for the record
 */
export async function bakeGeoTiffFromImage({
  sourcePath,
  destPath,
  bounds,
  corners,
  gcps,
  crs = 'EPSG:4326',
  wgsBounds,
}) {
  const { width, height, rgb } = decodeImageRgb(sourcePath)
  const affine = affineForPlacement({ width, height, bounds, corners, gcps })

  const metadata = {
    width,
    height,
    BitsPerSample: [8, 8, 8],
    PhotometricInterpretation: 2,
    GTModelTypeGeoKey: crs === 'EPSG:4326' ? 2 : 1,
    GTRasterTypeGeoKey: 1,
  }
  if (crs === 'EPSG:4326') metadata.GeographicTypeGeoKey = 4326
  else if (crs === 'EPSG:3857') metadata.ProjectedCSTypeGeoKey = 3857
  else metadata.ProjectedCSTypeGeoKey = Number(String(crs).replace(/^EPSG:/i, '')) || 4326

  if (isAxisAligned(affine)) {
    // ModelPixelScale + single tiepoint (fast, matches the north-up tiler path).
    metadata.ModelPixelScale = [Math.abs(affine.m00), Math.abs(affine.m11), 0]
    metadata.ModelTiepoint = [0, 0, 0, affine.m03, affine.m13, 0]
  } else {
    // Full affine (rotation/skew) as a 4x4 ModelTransformation.
    metadata.ModelTransformation = [
      affine.m00, affine.m01, 0, affine.m03,
      affine.m10, affine.m11, 0, affine.m13,
      0, 0, 0, 0,
      0, 0, 0, 1,
    ]
    // geotiff.js injects a whole-globe ModelPixelScale when one is absent (placing the
    // raster across the entire planet — the "strips" bug). Supply an axis-aligned
    // approximation (NW origin + per-pixel ground size) so any consumer that ignores the
    // ModelTransformation still gets a sane footprint. Our tiler always uses the transform.
    metadata.ModelPixelScale = [
      Math.hypot(affine.m00, affine.m10),
      Math.hypot(affine.m01, affine.m11),
      0,
    ]
    metadata.ModelTiepoint = [0, 0, 0, affine.m03, affine.m13, 0]
  }

  const arrayBuffer = await writeArrayBuffer(rgb, metadata)
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer))

  // World corners of the image, reprojected to WGS84 for the record bbox + footprint.
  const toWgs = (x, y) => {
    if (crs === 'EPSG:4326') return [x, y]
    try {
      return proj4(crs, 'EPSG:4326', [x, y])
    } catch {
      return [x, y]
    }
  }
  const worldCorners = worldCornersFromAffine(affine, width, height).map(([x, y]) => toWgs(x, y))
  const lons = worldCorners.map(c => c[0])
  const lats = worldCorners.map(c => c[1])
  const computedBounds = {
    west: Math.min(...lons),
    east: Math.max(...lons),
    south: Math.min(...lats),
    north: Math.max(...lats),
  }
  const recordBounds = wgsBounds || computedBounds
  const rotated = !isAxisAligned(affine)

  return {
    width,
    height,
    bands: 3,
    crs,
    bboxWgs84: recordBounds,
    footprint: rotated ? footprintFromCorners(worldCorners) : footprintFromBounds(recordBounds),
    resolutionMeters: resolutionMetersForBounds(recordBounds, width, crs === 'EPSG:4326' ? 'EPSG:4326' : crs),
  }
}
