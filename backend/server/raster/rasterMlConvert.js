import { basename } from 'node:path'

const ML_URL = (process.env.IMAGE_CLASSIFICATION_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

/**
 * Build the source path candidates the ML service can resolve (docker /data first, then host abs).
 * Mirrors imageClassificationProxy.rasterPathCandidates.
 */
function sourceCandidates(rasterId, sourcePath) {
  const fileName = sourcePath ? basename(sourcePath) : 'source'
  return [`/data/${rasterId}/${fileName}`, sourcePath].filter(Boolean)
}

/**
 * Ask the FastAPI image-classification service (rasterio/GDAL) to convert a GDAL-only raster
 * (e.g. JPEG 2000) into a Web Mercator GeoTIFF written beside the source (shared uploads volume).
 *
 * @returns {Promise<{crs:string, bbox_wgs84:{west:number,south:number,east:number,north:number},
 *   width:number, height:number, bands:number, resolution_m:number}>}
 */
export async function convertRasterViaMlService(rasterId, sourcePath) {
  const body = {
    raster_id: rasterId,
    source_candidates: sourceCandidates(rasterId, sourcePath),
    dest_name: 'cog.tif',
  }

  let res
  try {
    res = await fetch(`${ML_URL}/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000),
    })
  } catch (err) {
    const msg = String(err?.message || err)
    const offline = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout|aborted|network/i.test(msg)
    if (offline) {
      throw new Error(
        'JPEG 2000 (.JP2) needs the image-classification service to decode it. ' +
          'Start it (docker compose up image-classification) or install GDAL, then re-upload.',
      )
    }
    throw new Error(`JP2 conversion request failed: ${msg}`)
  }

  if (!res.ok) {
    let detail = `Raster conversion service responded ${res.status}.`
    try {
      const json = await res.json()
      if (json?.detail) detail = String(json.detail)
    } catch {
      /* ignore parse error */
    }
    throw new Error(detail)
  }

  return await res.json()
}
