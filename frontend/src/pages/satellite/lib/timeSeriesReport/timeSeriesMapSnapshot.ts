import { getMapboxAccessToken } from '../../../../lib/mapboxAccessToken'

export type LngLatBbox = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

function collectCoords(geometry: GeoJSON.Geometry, out: number[][]): void {
  if (geometry.type === 'Point') {
    out.push(geometry.coordinates as number[])
    return
  }
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    for (const c of geometry.coordinates) out.push(c as number[])
    return
  }
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      for (const c of ring as number[][]) out.push(c)
    }
    return
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) {
        for (const c of ring as number[][]) out.push(c)
      }
    }
  }
}

export function bboxFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  padRatio = 0.12,
): LngLatBbox | null {
  if (!geometry) return null
  const coords: number[][] = []
  collectCoords(geometry, coords)
  if (!coords.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of coords) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  if (!Number.isFinite(minLng)) return null
  const w = Math.max(maxLng - minLng, 1e-6)
  const h = Math.max(maxLat - minLat, 1e-6)
  const px = w * padRatio
  const py = h * padRatio
  return {
    minLng: minLng - px,
    minLat: minLat - py,
    maxLng: maxLng + px,
    maxLat: maxLat + py,
  }
}

async function fetchUrlAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || 'image/png'
    const buf = await blob.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const b64 = typeof btoa !== 'undefined' ? btoa(binary) : ''
    if (!b64) return null
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

export async function fetchFieldMapSnapshot(
  geometry: GeoJSON.Geometry | null | undefined,
  widthPx = 640,
  heightPx = 360,
): Promise<string | null> {
  const bbox = bboxFromGeometry(geometry)
  const token = getMapboxAccessToken()
  if (!bbox || !token.trim()) return null
  const { minLng, minLat, maxLng, maxLat } = bbox
  const bboxPath = `[${minLng},${minLat},${maxLng},${maxLat}]`
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${bboxPath}/${widthPx}x${heightPx}@2x` +
    `?padding=40&logo=false&attribution=false&access_token=${encodeURIComponent(token)}`
  return fetchUrlAsDataUrl(url)
}
