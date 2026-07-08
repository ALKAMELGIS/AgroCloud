export type LngLatBbox = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

function walkCoords(node: unknown, out: [number, number][]): void {
  if (!node) return
  if (
    Array.isArray(node) &&
    node.length >= 2 &&
    typeof node[0] === 'number' &&
    typeof node[1] === 'number' &&
    (node.length === 2 || typeof node[2] !== 'number')
  ) {
    out.push([node[0], node[1]])
    return
  }
  if (Array.isArray(node)) node.forEach(c => walkCoords(c, out))
}

export function bboxFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  padRatio = 0.08,
): LngLatBbox | null {
  if (!geometry) return null
  const pts: [number, number][] = []
  walkCoords((geometry as { coordinates?: unknown }).coordinates, pts)
  if (!pts.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  const dLng = Math.max(maxLng - minLng, 1e-6)
  const dLat = Math.max(maxLat - minLat, 1e-6)
  return {
    minLng: minLng - dLng * padRatio,
    minLat: minLat - dLat * padRatio,
    maxLng: maxLng + dLng * padRatio,
    maxLat: maxLat + dLat * padRatio,
  }
}

async function fetchUrlAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || 'image/jpeg'
    const buf = await blob.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const b64 = typeof btoa !== 'undefined' ? btoa(binary) : ''
    return b64 ? `data:${mime};base64,${b64}` : null
  } catch {
    return null
  }
}

export async function fetchFieldMapSnapshot(
  geometry: GeoJSON.Geometry | null | undefined,
  mapboxToken: string | undefined,
  widthPx = 480,
  heightPx = 320,
): Promise<string | null> {
  const bbox = bboxFromGeometry(geometry)
  const token = mapboxToken?.trim()
  if (!bbox || !token) return null
  const bboxPath = `[${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}]`
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${bboxPath}/${widthPx}x${heightPx}@2x` +
    `?padding=40&logo=false&attribution=false&access_token=${encodeURIComponent(token)}`
  return fetchUrlAsDataUrl(url)
}

export function mapLngLatToBox(
  lng: number,
  lat: number,
  bbox: LngLatBbox,
  x: number,
  yTop: number,
  w: number,
  h: number,
): [number, number] {
  const dlng = Math.max(bbox.maxLng - bbox.minLng, 1e-9)
  const dlat = Math.max(bbox.maxLat - bbox.minLat, 1e-9)
  const px = x + ((lng - bbox.minLng) / dlng) * w
  const py = yTop + h - ((lat - bbox.minLat) / dlat) * h
  return [px, py]
}
