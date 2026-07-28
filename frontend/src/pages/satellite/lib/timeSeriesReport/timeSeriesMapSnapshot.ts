import type { LayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import {
  buildTreeImageryMosaic,
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

function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90
  return [lng, lat]
}

/**
 * Expand a WGS84 bbox in Web Mercator so its aspect ratio matches the map frame.
 * Padding and aspect expansion are applied in Mercator meters around the AOI
 * bbox center so the polygon stays visually centered (degree-based padding
 * shifts the Mercator center and looks like an AOI “offset”).
 */
export function fitLngLatBboxToMapAspect(
  bbox: LngLatBbox,
  mapW: number,
  mapH: number,
  padRatio = 0,
): LngLatBbox {
  const frameW = Math.max(mapW, 1)
  const frameH = Math.max(mapH, 1)
  const targetAspect = frameW / frameH
  const [mx0, myS] = lngLatTo3857(bbox.minLng, bbox.minLat)
  const [mx1, myN] = lngLatTo3857(bbox.maxLng, bbox.maxLat)
  let halfW = Math.max(mx1 - mx0, 1e-6) / 2
  let halfH = Math.max(myN - myS, 1e-6) / 2
  const cx = (mx0 + mx1) / 2
  const cy = (myS + myN) / 2

  const pad = Math.max(0, padRatio)
  if (pad > 0) {
    halfW *= 1 + pad
    halfH *= 1 + pad
  }

  const currentAspect = (halfW * 2) / (halfH * 2)
  if (currentAspect > targetAspect) {
    halfH = halfW / targetAspect
  } else {
    halfW = halfH * targetAspect
  }
  const [minLng, minLat] = mercatorToLngLat(cx - halfW, cy - halfH)
  const [maxLng, maxLat] = mercatorToLngLat(cx + halfW, cy + halfH)
  return { minLng, minLat, maxLng, maxLat }
}

/** Fixed layout: title · map frame · legend strip (ArcGIS-style map card). */
export type TimeSeriesSnapshotLayout = {
  titleX: number
  titleY: number
  titleH: number
  mapX: number
  mapY: number
  mapW: number
  mapH: number
  legendX: number
  legendY: number
  legendMaxW: number
  legendStripH: number
}

export function resolveTimeSeriesSnapshotLayout(
  canvasW: number,
  canvasH: number,
): TimeSeriesSnapshotLayout {
  const margin = 6
  const titleH = Math.min(28, Math.max(22, Math.round(canvasH * 0.055)))
  /** Wider strip so Layer Live class keys (LULC, SCL, etc.) stay readable. */
  const legendStripH = Math.min(100, Math.max(64, Math.round(canvasH * 0.18)))
  const mapX = margin
  const mapY = margin + titleH + 2
  const mapW = Math.max(40, canvasW - margin * 2)
  const mapH = Math.max(40, canvasH - margin * 2 - titleH - legendStripH - 6)
  return {
    titleX: mapX,
    titleY: margin,
    titleH,
    mapX,
    mapY,
    mapW,
    mapH,
    legendX: mapX,
    legendY: mapY + mapH + 3,
    legendMaxW: mapW,
    legendStripH,
  }
}

/** Aspect-matched geographic extent for time-series report map frames (AOI centered). */
export function resolveTimeSeriesSnapshotExtent(
  geometry: GeoJSON.Geometry,
  mapW: number,
  mapH: number,
  padRatio = 0.14,
): LngLatBbox | null {
  // Unpadded AOI bbox — pad + aspect fit happen in Mercator so the AOI stays centered.
  const raw = bboxFromGeometry(geometry, 0)
  if (!raw) return null
  return fitLngLatBboxToMapAspect(raw, mapW, mapH, padRatio)
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

/** Prefer fetch; fall back to Image+canvas when CORS blocks fetch but tiles still load. */
async function fetchUrlAsDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, { signal, mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    // Sentinel Hub often returns a tiny transparent PNG (no scene) with HTTP 200.
    if (blob.size > 0 && blob.size < 180) return null
    const mime = blob.type || 'image/png'
    if (mime.includes('xml') || mime.includes('html') || mime.includes('json')) return null
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
    if (signal?.aborted) return null
  }

  // Image element path (map tiles often succeed here even when fetch CORS fails).
  try {
    const dataUrl = await new Promise<string | null>((resolve, reject) => {
      if (signal?.aborted) {
        resolve(null)
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      const onAbort = () => {
        img.src = ''
        resolve(null)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      img.onload = () => {
        signal?.removeEventListener('abort', onAbort)
        try {
          const w = Math.max(1, img.naturalWidth || img.width)
          const h = Math.max(1, img.naturalHeight || img.height)
          if (w < 2 || h < 2) {
            resolve(null)
            return
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
          ctx.drawImage(img, 0, 0)
          // Reject near-empty transparent frames.
          const sample = ctx.getImageData(0, 0, Math.min(w, 64), Math.min(h, 64)).data
          let opaque = 0
          for (let i = 3; i < sample.length; i += 4) {
            if (sample[i]! > 8) opaque += 1
          }
          if (opaque < 4) {
            resolve(null)
            return
          }
          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => {
        signal?.removeEventListener('abort', onAbort)
        reject(new Error('image load failed'))
      }
      img.src = url
    })
    return dataUrl
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
  if (!geometry) return null
  const layout = resolveTimeSeriesSnapshotLayout(widthPx, heightPx)
  const extent = resolveTimeSeriesSnapshotExtent(geometry, layout.mapW, layout.mapH)
  if (!extent) return null
  return fetchEsriSatelliteBasemapForBbox(extent, layout.mapW, layout.mapH, signal)
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
  /** Precomputed aspect-matched extent; defaults to fitted geometry bbox. */
  extent?: LngLatBbox | null
  signal?: AbortSignal
}): Promise<string | null> {
  const width = options.widthPx ?? 420
  const height = options.heightPx ?? 300
  const layout = resolveTimeSeriesSnapshotLayout(width, height)
  const extent =
    options.extent ??
    resolveTimeSeriesSnapshotExtent(options.geometry, layout.mapW, layout.mapH)
  if (!extent) return null

  const bbox4326: [number, number, number, number] = [
    extent.minLng,
    extent.minLat,
    extent.maxLng,
    extent.maxLat,
  ]

  const { buildSentinelHubWmsAoiClip } = await import('../../../../lib/sentinelHubWmsAoiClip')
  const {
    buildSentinelHubWmsGetMapUrlParts,
    getSentinelHubWmsLayerCatalog,
    resolveSentinelHubWmsGetMapLayerName,
    resolveSentinelHubWmsTimeWindow,
    SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS,
  } = await import('../../../../lib/sentinelHubWmsLayers')
  const { getSentinelHubWmsBaseUrl } = await import('../../../../lib/sentinelHubWmsInstance')

  const layerId = options.layerId.trim().toUpperCase()
  const sceneDate = options.sceneDate.trim().slice(0, 10)
  if (!layerId || !sceneDate) return null

  const drawn = { type: 'Feature' as const, geometry: options.geometry, properties: {} }
  const clip = buildSentinelHubWmsAoiClip(drawn, layerId, { sceneDate })
  const catalog = getSentinelHubWmsLayerCatalog()
  const wmsLayer = resolveSentinelHubWmsGetMapLayerName(layerId, catalog)
  const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow(layerId, sceneDate, null, {
    lookbackDays: SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS,
  })
  const bbox3857 = bbox3857From4326(bbox4326)
  const [minX, minY, maxX, maxY] = bbox3857
  const mapW = layout.mapW
  const mapH = layout.mapH
  const evalscriptB64 = clip.evalscriptB64 ?? undefined

  const buildUrl = (withGeometry: boolean) => {
    let url = buildSentinelHubWmsGetMapUrlParts({
      baseUrl: getSentinelHubWmsBaseUrl(),
      layer: wmsLayer,
      timeStart,
      timeEnd,
      cloudCoverage: 80,
      // Keep EVALSCRIPT even when GEOMETRY is dropped — NDVI/ISS need it on the band proxy layer.
      geometryWkt3857: withGeometry ? clip.geometryWkt3857 ?? undefined : undefined,
      evalscriptB64,
      tilePixels: Math.max(mapW, mapH),
    })
    // Request pixel size matches map frame aspect so circle AOIs stay circular (no square→rect stretch).
    url = url
      .replace(/WIDTH=\d+/i, `WIDTH=${Math.round(mapW)}`)
      .replace(/HEIGHT=\d+/i, `HEIGHT=${Math.round(mapH)}`)
    return url.replace('{bbox-epsg-3857}', `${minX},${minY},${maxX},${maxY}`)
  }

  // Prefer AOI-clipped GetMap; retry without GEOMETRY if the clipped request is empty/blocked.
  let dataUrl = await fetchUrlAsDataUrl(buildUrl(true), options.signal)
  if (!dataUrl) {
    dataUrl = await fetchUrlAsDataUrl(buildUrl(false), options.signal)
  }
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
  const [x0, y0] = mapLngLatToMercatorBox(ring[0]![0], ring[0]![1], bbox, padX, padY, w, h)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i < ring.length; i += 1) {
    const [xi, yi] = mapLngLatToMercatorBox(ring[i]![0], ring[i]![1], bbox, padX, padY, w, h)
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
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.strokeStyle = 'rgba(15,23,42,0.35)'
  ctx.lineWidth = 1

  const classes = spec.classes?.filter(c => c.color && c.label) ?? []
  if (classes.length > 0) {
    const cols = classes.length > 6 ? 3 : 2
    const rows = Math.ceil(classes.length / cols)
    const rowH = 14
    const boxH = Math.min(118, 22 + rows * rowH)
    ctx.fillRect(x, y, maxW, boxH)
    ctx.strokeRect(x, y, maxW, boxH)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 10px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(spec.title, x + 6, y + 12)
    const colW = (maxW - 12) / cols
    classes.forEach((cls, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = x + 6 + col * colW
      const cy = y + 18 + row * rowH
      ctx.fillStyle = cls.color
      ctx.fillRect(cx, cy, 10, 10)
      ctx.strokeStyle = 'rgba(15,23,42,0.35)'
      ctx.strokeRect(cx, cy, 10, 10)
      ctx.fillStyle = '#334155'
      ctx.font = '8px system-ui,sans-serif'
      const label = cls.rangeLabel ? `${cls.label} (${cls.rangeLabel})` : cls.label
      ctx.fillText(label.slice(0, 28), cx + 13, cy + 9)
    })
    ctx.restore()
    return
  }

  const colors = extractColorsFromLegend(spec)
  const compact = colors.length > 10
  const shown = compact ? colors.filter((_, i) => i % 2 === 0 || i === colors.length - 1) : colors.slice(0, 12)
  const boxH = compact ? 58 : Math.min(78, 30 + shown.length * 2)
  ctx.fillRect(x, y, maxW, boxH)
  ctx.strokeRect(x, y, maxW, boxH)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(spec.title, x + 8, y + 14)
  if (spec.subtitle) {
    ctx.font = '9px system-ui,sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText(spec.subtitle.slice(0, 72), x + 8, y + 26)
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

function drawNorthArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size = 28): void {
  ctx.save()
  ctx.translate(x, y)
  // Disc
  ctx.beginPath()
  ctx.arc(0, 0, size / 2 + 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1
  ctx.stroke()
  // N pointer
  ctx.beginPath()
  ctx.moveTo(0, -size / 2 + 2)
  ctx.lineTo(size * 0.22, size * 0.18)
  ctx.lineTo(0, size * 0.08)
  ctx.lineTo(-size * 0.22, size * 0.18)
  ctx.closePath()
  ctx.fillStyle = '#0f172a'
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.font = `bold ${Math.max(8, Math.round(size * 0.32))}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('N', 0, size * 0.22)
  ctx.restore()
}

/** Approximate ground scale bar from longitude span at mid-latitude. */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  extent: LngLatBbox,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
): void {
  const midLat = (extent.minLat + extent.maxLat) / 2
  const metersPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180)
  const mapWidthM = Math.max(1, (extent.maxLng - extent.minLng) * metersPerDegLng)
  const targetPx = Math.min(110, Math.max(56, mapW * 0.28))
  const rawM = (targetPx / mapW) * mapWidthM
  const niceSteps = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  let barM = niceSteps[0]!
  for (const s of niceSteps) {
    if (s <= rawM * 1.35) barM = s
  }
  const barPx = Math.max(24, (barM / mapWidthM) * mapW)
  const label = barM >= 1000 ? `${(barM / 1000).toFixed(barM % 1000 === 0 ? 0 : 1)} km` : `${Math.round(barM)} m`
  const x = mapX + 10
  const y = mapY + mapH - 18
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(x - 4, y - 12, barPx + 8, 20)
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1
  ctx.strokeRect(x - 4, y - 12, barPx + 8, 20)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + barPx, y)
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x, y + 4)
  ctx.moveTo(x + barPx, y - 4)
  ctx.lineTo(x + barPx, y + 4)
  ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 9px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x + barPx / 2, y - 2)
  ctx.restore()
}

function drawMapTitleBar(
  ctx: CanvasRenderingContext2D,
  layout: TimeSeriesSnapshotLayout,
  title: string,
  dateLabel: string,
): void {
  const { titleX, titleY, titleH, mapW } = layout
  ctx.save()
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(titleX, titleY, mapW, titleH)
  ctx.fillStyle = '#f8fafc'
  ctx.font = `bold ${Math.max(10, Math.round(titleH * 0.48))}px system-ui,sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  // Match sample atlas header: "NDVI: 2022-03-24"
  const left = dateLabel ? `${title.replace(/\s*·.*$/, '').trim()}: ${dateLabel}` : title
  ctx.fillText(left.slice(0, 64), titleX + 8, titleY + titleH / 2)
  ctx.font = `${Math.max(8, Math.round(titleH * 0.36))}px system-ui,sans-serif`
  ctx.textAlign = 'right'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText('AgroCloud · Sentinel-2', titleX + mapW - 8, titleY + titleH / 2)
  ctx.restore()
}

/** Composite Esri satellite basemap + index raster + AOI + legend + north/scale into PNG base64. */
export async function compositeAoiMapSnapshotBase64(options: {
  geometry: GeoJSON.Geometry
  basemapDataUrl?: string | null
  indexBase64?: string | null
  layerId?: string
  legendSpec?: LayerLiveLegendSpec | null
  widthPx?: number
  heightPx?: number
  /** Aspect-matched extent; computed automatically when omitted. */
  extent?: LngLatBbox | null
  /** Map title (index / analysis name). */
  title?: string
  /** Acquisition / period date shown in the title bar. */
  sceneDate?: string
}): Promise<string | null> {
  const width = options.widthPx ?? 640
  const height = options.heightPx ?? 520
  const layout = resolveTimeSeriesSnapshotLayout(width, height)
  const extent =
    options.extent ??
    resolveTimeSeriesSnapshotExtent(options.geometry, layout.mapW, layout.mapH)
  if (!extent) return null

  const { mapX, mapY, mapW, mapH, legendX, legendY, legendMaxW } = layout
  const layerLabel = (options.layerId ?? 'Index').trim().toUpperCase() || 'Index'
  const title = (options.title ?? layerLabel).trim() || layerLabel
  const dateLabel = (options.sceneDate ?? '').trim().slice(0, 10)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, width, height)

  drawMapTitleBar(ctx, layout, title, dateLabel)

  ctx.save()
  ctx.beginPath()
  ctx.rect(mapX, mapY, mapW, mapH)
  ctx.clip()

  ctx.fillStyle = '#475569'
  ctx.fillRect(mapX, mapY, mapW, mapH)

  if (options.basemapDataUrl) {
    try {
      const basemap = await loadImage(options.basemapDataUrl)
      ctx.drawImage(basemap, mapX, mapY, mapW, mapH)
    } catch {
      /* basemap optional */
    }
  }

  if (options.indexBase64) {
    try {
      const index = await loadImage(`data:image/png;base64,${options.indexBase64}`)
      ctx.save()
      ctx.globalAlpha = 0.94
      ctx.drawImage(index, mapX, mapY, mapW, mapH)
      ctx.restore()
    } catch {
      /* index optional */
    }
  }

  drawAoiOutline(ctx, options.geometry, extent, mapX, mapY, mapW, mapH)
  ctx.restore()

  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  ctx.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1)

  drawNorthArrow(ctx, mapX + mapW - 22, mapY + 22, 26)
  drawScaleBar(ctx, extent, mapX, mapY, mapW, mapH)

  const legend =
    options.legendSpec ??
    (options.layerId ? resolveLayerLiveLegendSpec(options.layerId, options.layerId) : null)
  if (legend) {
    drawSnapshotLegend(ctx, legend, legendX, legendY, legendMaxW)
  }

  try {
    const dataUrl = canvas.toDataURL('image/png')
    return dataUrlToPngBase64(dataUrl)
  } catch {
    // Tainted canvas (rare CORS path) — caller falls back to basemap-only / AOI-only compose.
    return null
  }
}
