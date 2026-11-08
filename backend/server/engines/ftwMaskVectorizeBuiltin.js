/**
 * Node fallback for FTW mosaic vectorize when Python :8092 is unavailable.
 */

import { vectorizeBinaryMaskBuiltin } from './fieldBoundaryBuiltin.js'

/**
 * @param {{ mask: string, bbox: number[], min_area_m2?: number, minAreaM2?: number, aoi?: object }} body
 */
export function vectorizeFtwMosaicBuiltin(body) {
  const out = vectorizeBinaryMaskBuiltin(
    {
      ...body,
      source: 'ftw-raster-mosaic',
      engine: 'ftw-raster-mosaic-builtin',
    },
    { maxEdge: 2048 },
  )
  return {
    ...out,
    aoi_applied: out.aoi_applied,
  }
}
