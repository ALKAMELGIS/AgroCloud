export type LngLatBbox = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export function bbox4326FromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  padRatio = 0.08,
): [number, number, number, number] | null {
  const bbox = bboxFromGeometry(geometry, padRatio)
  if (!bbox) return null
  return [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
}

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const y = Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180)
  return [x, (y * 20037508.34) / 180]
}

export function bbox3857From4326(bbox4326: [number, number, number, number]): [number, number, number, number] {
  const [w, s, e, n] = bbox4326
  const [minX, minY] = lngLatTo3857(w, s)
  const [maxX, maxY] = lngLatTo3857(e, n)
  return [minX, minY, maxX, maxY]
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

async function fetchUrlAsDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, { signal })
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

export function dataUrlToPngBase64(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

/** Fetch a single Sentinel Hub WMS index map for AOI + scene date (PNG base64, no prefix). */
export async function fetchIndexLayerMapSnapshotBase64(options: {
  geometry: GeoJSON.Geometry
  layerId: string
  sceneDate: string
  widthPx?: number
  heightPx?: number
  signal?: AbortSignal
}): Promise<string | null> {
  const bbox4326 = bbox4326FromGeometry(options.geometry)
  if (!bbox4326) return null

  const { buildSentinelHubWmsAoiClip } = await import('../../../../lib/sentinelHubWmsAoiClip')
  const {
    buildSentinelHubWmsGetMapUrlParts,
    getSentinelHubWmsLayerCatalog,
    resolveSentinelHubWmsGetMapLayerName,
    resolveSentinelHubWmsTimeWindow,
  } = await import('../../../../lib/sentinelHubWmsLayers')
  const { getSentinelHubWmsBaseUrl } = await import('../../../../lib/sentinelHubWmsInstance')

  const layerId = options.layerId.trim().toUpperCase()
  const sceneDate = options.sceneDate.trim().slice(0, 10)
  if (!layerId || !sceneDate) return null

  const drawn = { type: 'Feature' as const, geometry: options.geometry, properties: {} }
  const clip = buildSentinelHubWmsAoiClip(drawn, layerId)
  const catalog = getSentinelHubWmsLayerCatalog()
  const wmsLayer = resolveSentinelHubWmsGetMapLayerName(layerId, catalog)
  const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow(layerId, sceneDate, null, {
    lookbackDays: 14,
  })
  const bbox3857 = bbox3857From4326(bbox4326)
  const [minX, minY, maxX, maxY] = bbox3857
  const width = options.widthPx ?? 420
  const height = options.heightPx ?? 300

  let url = buildSentinelHubWmsGetMapUrlParts({
    baseUrl: getSentinelHubWmsBaseUrl(),
    layer: wmsLayer,
    timeStart,
    timeEnd,
    cloudCoverage: 60,
    geometryWkt3857: clip.geometryWkt3857 ?? undefined,
    evalscriptB64: clip.evalscriptB64 ?? undefined,
    tilePixels: Math.max(width, height),
  })
  url = url.replace('{bbox-epsg-3857}', `${minX},${minY},${maxX},${maxY}`)

  const dataUrl = await fetchUrlAsDataUrl(url, options.signal)
  return dataUrlToPngBase64(dataUrl)
}

/** Same as {@link fetchIndexLayerMapSnapshotBase64} but returns a full data URL for UI previews. */
export async function fetchIndexLayerMapSnapshotDataUrl(options: {
  geometry: GeoJSON.Geometry
  layerId: string
  sceneDate: string
  widthPx?: number
  heightPx?: number
  signal?: AbortSignal
}): Promise<string | null> {
  const base64 = await fetchIndexLayerMapSnapshotBase64(options)
  return base64 ? `data:image/png;base64,${base64}` : null
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
