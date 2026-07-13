import type { LayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import {
  buildTreeImageryMosaic,
  geometryBBox,
  lngLatToWorldPx,
  TREE_IMAGERY_PROVIDERS,
} from '../../../../lib/treeDetection/webMercatorTiles'

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

/**
 * Map WGS84 lng/lat to canvas pixels using Web Mercator (EPSG:3857).
 * Matches Esri satellite tile basemaps — true north-up orthographic 2D, no pitch.
 */
export function mapLngLatToMercatorBox(
  lng: number,
  lat: number,
  bbox: LngLatBbox,
  x: number,
  yTop: number,
  w: number,
  h: number,
): [number, number] {
  const [mx0, mySouth] = lngLatTo3857(bbox.minLng, bbox.minLat)
  const [mx1, myNorth] = lngLatTo3857(bbox.maxLng, bbox.maxLat)
  const [mx, my] = lngLatTo3857(lng, lat)
  const dX = Math.max(mx1 - mx0, 1e-9)
  const dY = Math.max(myNorth - mySouth, 1e-9)
  const px = x + ((mx - mx0) / dX) * w
  const py = yTop + h - ((my - mySouth) / dY) * h
  return [px, py]
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

export async function fetchEsriSatelliteBasemapForBbox(
  bbox: LngLatBbox,
  widthPx = 480,
  heightPx = 320,
  signal?: AbortSignal,
): Promise<string | null> {
  const lngLatBBox = { west: bbox.minLng, south: bbox.minLat, east: bbox.maxLng, north: bbox.maxLat }
  const mosaic = await buildTreeImageryMosaic({
    bbox: lngLatBBox,
    provider: TREE_IMAGERY_PROVIDERS.esri,
    maxTiles: 25,
    maxZoom: 18,
    signal,
  })
  if (!mosaic) return null

  const [wx0, wyNorth] = lngLatToWorldPx(lngLatBBox.west, lngLatBBox.north, mosaic.zoom)
  const [wx1, wySouth] = lngLatToWorldPx(lngLatBBox.east, lngLatBBox.south, mosaic.zoom)
  const sx = wx0 - mosaic.originWorldPxX
  const sy = wyNorth - mosaic.originWorldPxY
  const sw = Math.max(wx1 - wx0, 1)
  const sh = Math.max(wySouth - wyNorth, 1)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#64748b'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.drawImage(mosaic.canvas, sx, sy, sw, sh, 0, 0, widthPx, heightPx)
  return canvas.toDataURL('image/jpeg', 0.92)
}

export async function fetchEsriSatelliteBasemapSnapshot(
  geometry: GeoJSON.Geometry | null | undefined,
  widthPx = 480,
  heightPx = 320,
  signal?: AbortSignal,
): Promise<string | null> {
  const bbox = geometryBBox(geometry)
  if (!bbox) return null

  const mosaic = await buildTreeImageryMosaic({
    bbox,
    provider: TREE_IMAGERY_PROVIDERS.esri,
    maxTiles: 16,
    maxZoom: 18,
    signal,
  })
  if (!mosaic) return null

  const [wx0, wyNorth] = lngLatToWorldPx(bbox.west, bbox.north, mosaic.zoom)
  const [wx1, wySouth] = lngLatToWorldPx(bbox.east, bbox.south, mosaic.zoom)
  const sx = wx0 - mosaic.originWorldPxX
  const sy = wyNorth - mosaic.originWorldPxY
  const sw = Math.max(wx1 - wx0, 1)
  const sh = Math.max(wySouth - wyNorth, 1)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#334155'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.drawImage(mosaic.canvas, sx, sy, sw, sh, 0, 0, widthPx, heightPx)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/** Esri World Imagery basemap (preferred) with optional Mapbox satellite fallback. */
export async function fetchSatelliteBasemapSnapshot(
  geometry: GeoJSON.Geometry | null | undefined,
  mapboxToken?: string,
  widthPx = 480,
  heightPx = 320,
  signal?: AbortSignal,
): Promise<string | null> {
  const esri = await fetchEsriSatelliteBasemapSnapshot(geometry, widthPx, heightPx, signal)
  if (esri) return esri
  return fetchFieldMapSnapshot(geometry, mapboxToken, widthPx, heightPx)
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

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  bbox: LngLatBbox,
  padX: number,
  padY: number,
  w: number,
  h: number,
): void {
  if (ring.length < 2) return
  const [x0, y0] = mapLngLatToBox(ring[0]![0], ring[0]![1], bbox, padX, padY, w, h)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i < ring.length; i += 1) {
    const [xi, yi] = mapLngLatToBox(ring[i]![0], ring[i]![1], bbox, padX, padY, w, h)
    ctx.lineTo(xi, yi)
  }
  ctx.closePath()
  ctx.stroke()
}

function drawAoiOutline(
  ctx: CanvasRenderingContext2D,
  geometry: GeoJSON.Geometry,
  bbox: LngLatBbox,
  padX: number,
  padY: number,
  w: number,
  h: number,
): void {
  ctx.save()
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 2
  const type = geometry.type
  if (type === 'Polygon') {
    const coords = geometry.coordinates as [number, number][][]
    coords.forEach(ring => drawRing(ctx, ring, bbox, padX, padY, w, h))
  } else if (type === 'MultiPolygon') {
    const coords = geometry.coordinates as [number, number][][][]
    coords.forEach(poly => poly.forEach(ring => drawRing(ctx, ring, bbox, padX, padY, w, h)))
  } else if (type === 'LineString') {
    drawRing(ctx, geometry.coordinates as [number, number][], bbox, padX, padY, w, h)
  } else if (type === 'MultiLineString') {
    ;(geometry.coordinates as [number, number][][]).forEach(ring => drawRing(ctx, ring, bbox, padX, padY, w, h))
  }
  ctx.restore()
}

function extractColorsFromLegend(spec: LayerLiveLegendSpec): string[] {
  if (spec.classes?.length) return spec.classes.map(c => c.color).filter(Boolean)
  if (!spec.gradientCss) return ['#1a9850', '#ffffbf', '#d73027']
  const matches = spec.gradientCss.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g)
  return matches?.length ? matches : ['#1a9850', '#ffffbf', '#d73027']
}

function drawSnapshotLegend(
  ctx: CanvasRenderingContext2D,
  spec: LayerLiveLegendSpec,
  x: number,
  y: number,
  maxW: number,
): void {
  const colors = extractColorsFromLegend(spec)
  const compact = colors.length > 10
  const shown = compact ? colors.filter((_, i) => i % 2 === 0 || i === colors.length - 1) : colors.slice(0, 10)
  const boxH = compact ? 54 : Math.min(72, 28 + shown.length * 2)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.strokeStyle = 'rgba(15,23,42,0.35)'
  ctx.lineWidth = 1
  ctx.fillRect(x, y, maxW, boxH)
  ctx.strokeRect(x, y, maxW, boxH)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(spec.title, x + 8, y + 14)
  if (spec.subtitle) {
    ctx.font = '9px system-ui,sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText(spec.subtitle, x + 8, y + 26)
  }
  const barY = spec.subtitle ? y + 32 : y + 20
  const barW = maxW - 16
  const barH = 10
  const segW = barW / Math.max(shown.length, 1)
  shown.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(x + 8 + i * segW, barY, segW + 1, barH)
  })
  ctx.fillStyle = '#475569'
  ctx.font = '9px system-ui,sans-serif'
  if (spec.valueMin != null) ctx.fillText(String(spec.valueMin), x + 8, barY + 22)
  if (spec.valueMax != null) {
    ctx.textAlign = 'right'
    ctx.fillText(String(spec.valueMax), x + 8 + barW, barY + 22)
  }
  if (spec.scaleLabels) {
    ctx.textAlign = 'center'
    ctx.font = '8px system-ui,sans-serif'
    ctx.fillText(spec.scaleLabels.low, x + 8 + barW * 0.15, barY + 22)
    ctx.fillText(spec.scaleLabels.mid, x + 8 + barW * 0.5, barY + 22)
    ctx.fillText(spec.scaleLabels.high, x + 8 + barW * 0.85, barY + 22)
  }
  ctx.restore()
}

/** Composite Esri satellite basemap + index raster + AOI outline + legend into PNG base64 (no prefix). */
export async function compositeAoiMapSnapshotBase64(options: {
  geometry: GeoJSON.Geometry
  basemapDataUrl?: string | null
  indexBase64?: string | null
  layerId?: string
  legendSpec?: LayerLiveLegendSpec | null
  widthPx?: number
  heightPx?: number
}): Promise<string | null> {
  const bbox = bboxFromGeometry(options.geometry)
  if (!bbox) return null
  const width = options.widthPx ?? 480
  const height = options.heightPx ?? 320
  const pad = 0

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#475569'
  ctx.fillRect(0, 0, width, height)

  if (options.basemapDataUrl) {
    try {
      const basemap = await loadImage(options.basemapDataUrl)
      ctx.drawImage(basemap, pad, pad, width - pad * 2, height - pad * 2)
    } catch {
      /* basemap optional */
    }
  }

  if (options.indexBase64) {
    try {
      const index = await loadImage(`data:image/png;base64,${options.indexBase64}`)
      ctx.save()
      ctx.globalAlpha = 0.94
      ctx.drawImage(index, pad, pad, width - pad * 2, height - pad * 2)
      ctx.restore()
    } catch {
      /* index optional */
    }
  }

  drawAoiOutline(ctx, options.geometry, bbox, pad, pad, width - pad * 2, height - pad * 2)

  const legend =
    options.legendSpec ??
    (options.layerId ? resolveLayerLiveLegendSpec(options.layerId, options.layerId) : null)
  if (legend) {
    drawSnapshotLegend(ctx, legend, width - 228, height - 78, 220)
  }

  const dataUrl = canvas.toDataURL('image/png')
  return dataUrlToPngBase64(dataUrl)
}
