/**
 * Client for the backend CRS database + raster CRS assignment.
 *   GET  /api/crs/search?q=&limit=
 *   GET  /api/crs/:code
 *   POST /api/raster/:id/assign-crs
 */
import { apiUrl } from '../apiOrigin'
import type { AgroCloudRasterRecord, CrsInfo } from './siRasterTileService'

/** One search-result row from /api/crs/search. */
export type CrsSearchResult = {
  code: string
  epsg: number
  name: string
  kind: string | null
  units: string | null
  authority: string
  areaOfUse: string | null
  accuracy: number | null
}

/** Search the EPSG database ("UTM Zone 40N", "EPSG:32640", "WGS84", "Dubai", …). */
export async function searchCrs(query: string, limit = 25, signal?: AbortSignal): Promise<CrsSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(apiUrl(`/api/crs/search?q=${encodeURIComponent(q)}&limit=${limit}`), { signal })
  if (!res.ok) throw new Error(`CRS search failed (${res.status})`)
  const body = (await res.json()) as { results?: CrsSearchResult[] }
  return body.results || []
}

/** Full description of a single CRS by EPSG code. */
export async function describeCrs(code: string, signal?: AbortSignal): Promise<CrsInfo & { proj4?: string; wkt?: string }> {
  const res = await fetch(apiUrl(`/api/crs/${encodeURIComponent(code)}`), { signal })
  if (!res.ok) throw new Error(`CRS lookup failed (${res.status})`)
  return (await res.json()) as CrsInfo & { proj4?: string; wkt?: string }
}

/** Override a raster's CRS; the server recomputes footprint/bbox and returns the record. */
export async function assignRasterCrs(
  rasterId: string,
  crs: string,
  signal?: AbortSignal,
): Promise<AgroCloudRasterRecord> {
  const res = await fetch(apiUrl(`/api/raster/${rasterId}/assign-crs`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ crs }),
    signal,
  })
  if (!res.ok) {
    let detail = `Assign CRS failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return (await res.json()) as AgroCloudRasterRecord
}
