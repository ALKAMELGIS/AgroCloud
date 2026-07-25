/**
 * Self-contained, GIS-grade GeoTIFF (.tif) writer for Hydro / Well Site rasters.
 *
 * Design goals (ArcGIS Pro / QGIS compatible):
 *   • Single-band 32-bit IEEE float — native computed values (no 8-bit quantisation).
 *   • Fully georeferenced EPSG:3857 via ModelPixelScale + ModelTiepoint + GeoKeys.
 *   • Clipped to the AOI; outside pixels use finite NoData (−9999), never IEEE NaN
 *     (NaN makes ArcGIS Pro stretch ±3.4e38 and paint the layer solid black).
 *   • Uncompressed by default + embedded GDAL STATISTICS_* for correct stretch.
 */

import {
  GIS_FLOAT_NODATA,
  buildGdalPamAuxXml,
  computeFloatRasterStats,
  writeFloat32GisGeoTiff,
} from '../gis/gisGeoTiffWriter'

/** Circumference of the Web-Mercator world in projected metres. */
const WORLD_METERS = 2 * Math.PI * 6378137
const TILE_SIZE = 256

/** A single-band raster + the georeferencing needed to write a GeoTIFF. */
export type GeoBand = {
  /** Native values, row-major (length = width*height). */
  values: Float32Array
  width: number
  height: number
  /** Web-Mercator zoom the grid was sampled at. */
  zoom: number
  /** World-pixel coordinate of the grid's top-left corner at `zoom`. */
  originWorldPxX: number
  originWorldPxY: number
  /** NoData sentinel (finite; defaults to −9999). */
  nodata: number
  /** Human-readable layer / file name. */
  name: string
}

type ClipWindow = { c0: number; r0: number; c1: number; r1: number }

/** Tight pixel window (inclusive) of the AOI mask, or the full grid if no mask. */
function maskWindow(mask: Uint8Array | null, width: number, height: number): ClipWindow {
  if (!mask) return { c0: 0, r0: 0, c1: width - 1, r1: height - 1 }
  let c0 = width
  let r0 = height
  let c1 = -1
  let r1 = -1
  for (let r = 0; r < height; r += 1) {
    const row = r * width
    for (let c = 0; c < width; c += 1) {
      if (!mask[row + c]) continue
      if (c < c0) c0 = c
      if (c > c1) c1 = c
      if (r < r0) r0 = r
      if (r > r1) r1 = r
    }
  }
  if (c1 < 0) return { c0: 0, r0: 0, c1: width - 1, r1: height - 1 }
  return { c0, r0, c1, r1 }
}

export type ExportGeoTiffResult = {
  blob: Blob
  filename: string
  /** Optional PAM sidecar for ArcGIS Pro. */
  auxXml?: string
  auxFilename?: string
}

/**
 * Clip a band to its AOI mask and return a georeferenced, single-band Float32
 * GeoTIFF (EPSG:3857) as a downloadable Blob.
 */
export function buildAoiGeoTiff(
  band: GeoBand,
  aoiMask: Uint8Array | null,
  opts?: { epsg?: number; compress?: boolean },
): ExportGeoTiffResult {
  const { width, height, values } = band
  const nodata =
    Number.isFinite(band.nodata) && !Number.isNaN(band.nodata) ? band.nodata : GIS_FLOAT_NODATA
  const win = maskWindow(aoiMask, width, height)
  const cw = win.c1 - win.c0 + 1
  const ch = win.r1 - win.r0 + 1

  const out = new Float32Array(cw * ch)
  for (let r = 0; r < ch; r += 1) {
    const srcRow = (win.r0 + r) * width
    const dstRow = r * cw
    for (let c = 0; c < cw; c += 1) {
      const srcIdx = srcRow + win.c0 + c
      const inside = !aoiMask || aoiMask[srcIdx]
      const v = values[srcIdx]!
      out[dstRow + c] = inside && Number.isFinite(v) ? v : nodata
    }
  }

  const mapSize = TILE_SIZE * 2 ** band.zoom
  const pixelScale = WORLD_METERS / mapSize
  const winOriginPxX = band.originWorldPxX + win.c0
  const winOriginPxY = band.originWorldPxY + win.r0
  const tiepointX = -WORLD_METERS / 2 + winOriginPxX * pixelScale
  const tiepointY = WORLD_METERS / 2 - winOriginPxY * pixelScale

  // `compress` kept for API compatibility — always uncompressed (ArcGIS-safe).
  void opts?.compress

  const arrayBuffer = writeFloat32GisGeoTiff({
    width: cw,
    height: ch,
    samples: out,
    pixelScaleX: pixelScale,
    pixelScaleY: pixelScale,
    tiepointX,
    tiepointY,
    epsg: opts?.epsg ?? 3857,
    geographic: false,
    nodata,
    description: band.name,
    embedStats: true,
  })

  const safe = band.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const filename = `${safe || 'raster'}.tif`
  const stats = computeFloatRasterStats(out, nodata)
  const auxXml = buildGdalPamAuxXml({ nodata, stats, bandName: band.name })

  return {
    blob: new Blob([arrayBuffer], { type: 'image/tiff' }),
    filename,
    auxXml,
    auxFilename: `${filename}.aux.xml`,
  }
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download GeoTIFF + optional PAM aux.xml sidecar. */
export function downloadGeoTiffWithAux(result: ExportGeoTiffResult): void {
  downloadBlob(result.blob, result.filename)
  if (result.auxXml && result.auxFilename) {
    downloadBlob(new Blob([result.auxXml], { type: 'application/xml' }), result.auxFilename)
  }
}
