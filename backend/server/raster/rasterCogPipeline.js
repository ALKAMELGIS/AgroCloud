/**
 * Convert source raster to Cloud Optimized GeoTIFF when GDAL is available.
 * Preserves source CRS on disk; TiTiler / tile renderer reproject to EPSG:3857 on read.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { hasGdal } from './rasterMetadata.js'

function runCmd(cmd, args, timeoutMs = 600_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} timed out`))
    }, timeoutMs)
    child.stderr.on('data', d => {
      stderr += d.toString()
    })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr || `${cmd} exited ${code}`))
    })
  })
}

const UNSUPPORTED_EXT = new Set(['.ecw', '.sid'])
const JP2_EXT = new Set(['.jp2', '.j2k', '.jpf', '.jpx'])

export function assertSupportedDriver(fileName) {
  const ext = path.extname(fileName || '').toLowerCase()
  if (UNSUPPORTED_EXT.has(ext)) {
    const err = new Error(
      `Format ${ext} requires a licensed GDAL driver. Convert to GeoTIFF/COG and re-upload.`,
    )
    err.status = 415
    throw err
  }
}

/** JPEG 2000 family — needs GDAL/OpenJPEG (local) or the ML service to decode. */
export function isJp2Name(fileName) {
  return JP2_EXT.has(path.extname(fileName || '').toLowerCase())
}

/**
 * @returns {{ cogPath: string, converted: boolean }}
 */
export async function ensureCloudOptimizedGeoTiff(sourcePath, outDir, meta = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  const cogPath = path.join(outDir, 'cog.tif')

  if (meta.isCog && sourcePath.toLowerCase().endsWith('.tif')) {
    if (path.resolve(sourcePath) !== path.resolve(cogPath)) {
      fs.copyFileSync(sourcePath, cogPath)
    }
    return { cogPath, converted: false }
  }

  if (!(await hasGdal())) {
    // Serve the original GeoTIFF; geotiff.js / TiTiler can still tile many classic TIFFs.
    if (path.resolve(sourcePath) !== path.resolve(cogPath)) {
      try {
        fs.copyFileSync(sourcePath, cogPath)
      } catch {
        return { cogPath: sourcePath, converted: false }
      }
    }
    return { cogPath, converted: false }
  }

  // Prefer COG driver when available; fall back to tiled GeoTIFF + overviews.
  try {
    await runCmd('gdal_translate', [
      '-of',
      'COG',
      '-co',
      'COMPRESS=DEFLATE',
      '-co',
      'NUM_THREADS=ALL_CPUS',
      '-co',
      'BIGTIFF=IF_SAFER',
      sourcePath,
      cogPath,
    ])
    return { cogPath, converted: true }
  } catch (cogErr) {
    console.warn('[raster] COG driver failed, using GTiff tiled:', cogErr.message)
  }

  await runCmd('gdal_translate', [
    '-of',
    'GTiff',
    '-co',
    'TILED=YES',
    '-co',
    'COMPRESS=DEFLATE',
    '-co',
    'BIGTIFF=IF_SAFER',
    sourcePath,
    cogPath,
  ])
  try {
    await runCmd('gdaladdo', ['-r', 'average', cogPath, '2', '4', '8', '16'])
  } catch {
    /* overviews optional */
  }
  return { cogPath, converted: true }
}
