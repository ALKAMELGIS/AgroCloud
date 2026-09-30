import L from 'leaflet'

/** Service root URL ending at `/ImageServer` (no trailing slash). */
export function getImageServerServiceRootFromUrl(input: string): string | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  let parts = u.pathname.split('/').filter(Boolean)
  const i = parts.findIndex(p => p.toLowerCase() === 'imageserver')
  if (i === -1) return null
  if (parts.length > i + 1 && /^\d+$/.test(parts[parts.length - 1]!)) {
    parts = parts.slice(0, -1)
  }
  const rootPath = `/${parts.slice(0, i + 1).join('/')}`
  return `${u.origin}${rootPath}`
}

export type ArcGisExtent = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  spatialReference?: { wkid?: number; latestWkid?: number }
}

export function arcgisExtentToWgs84BBox(extent: ArcGisExtent): [number, number, number, number] | null {
  if (!extent || [extent.xmin, extent.ymin, extent.xmax, extent.ymax].some(n => typeof n !== 'number' || !Number.isFinite(n))) {
    return null
  }
  const wkid = extent.spatialReference?.latestWkid ?? extent.spatialReference?.wkid
  try {
    if (wkid === 4326) {
      return [extent.xmin, extent.ymin, extent.xmax, extent.ymax]
    }
    const sw = L.CRS.EPSG3857.unproject(L.point(extent.xmin, extent.ymin))
    const ne = L.CRS.EPSG3857.unproject(L.point(extent.xmax, extent.ymax))
    const west = Math.min(sw.lng, ne.lng)
    const east = Math.max(sw.lng, ne.lng)
    const south = Math.min(sw.lat, ne.lat)
    const north = Math.max(sw.lat, ne.lat)
    return [west, south, east, north]
  } catch {
    return null
  }
}

export async function fetchImageServerMeta(
  serviceUrl: string,
  opts?: { signal?: AbortSignal; token?: string },
): Promise<{ name: string; extent?: ArcGisExtent; fullExtent?: ArcGisExtent }> {
  const base = serviceUrl.replace(/\/+$/, '')
  const u = new URL(`${base}`)
  u.searchParams.set('f', 'pjson')
  const tok = opts?.token?.trim()
  if (tok) u.searchParams.set('token', tok)
  const res = await fetch(u.toString(), { method: 'GET', signal: opts?.signal })
  if (!res.ok) throw new Error(`ImageServer metadata request failed (${res.status}).`)
  const json = (await res.json()) as Record<string, unknown>
  if (json?.error && typeof (json.error as any)?.message === 'string') {
    throw new Error(String((json.error as any).message))
  }
  const t = String(json.type || '').toLowerCase()
  if (t !== 'imageserver') throw new Error('URL is not an ArcGIS Image Server endpoint.')
  const name = String(json.name || json.mapName || 'Image Server')
  return {
    name,
    extent: json.extent as ArcGisExtent | undefined,
    fullExtent: json.fullExtent as ArcGisExtent | undefined,
  }
}

export type EsriImageServerGridLayerOptions = L.GridLayerOptions & { arcgisToken?: string }

/** Leaflet grid layer that draws each tile via ArcGIS `exportImage` (works when the service is not a fused tile cache). */
export function createEsriImageServerGridLayer(serviceUrl: string, options?: EsriImageServerGridLayerOptions): L.GridLayer {
  const { arcgisToken, ...gridOptions } = options ?? {}
  const token = arcgisToken?.trim() || ''
  const base = serviceUrl.replace(/\/+$/, '')
  const Grid = L.GridLayer.extend({
    createTile(this: L.GridLayer, coords: L.Coords, done: L.DoneCallback): HTMLElement {
      const el = L.DomUtil.create('img', 'leaflet-tile') as HTMLImageElement
      const size = this.getTileSize() as L.Point
      const x = Math.max(1, Math.round(size.x))
      const y = Math.max(1, Math.round(size.y))
      const bounds = (this as unknown as { _tileCoordsToBounds: (c: L.Coords) => L.LatLngBounds })._tileCoordsToBounds(coords)
      const nw = L.CRS.EPSG3857.project(bounds.getNorthWest())
      const se = L.CRS.EPSG3857.project(bounds.getSouthEast())
      const xmin = Math.min(nw.x, se.x)
      const xmax = Math.max(nw.x, se.x)
      const ymin = Math.min(nw.y, se.y)
      const ymax = Math.max(nw.y, se.y)
      const bbox = `${xmin},${ymin},${xmax},${ymax}`
      const params = new URLSearchParams({
        bbox,
        bboxSR: '3857',
        imageSR: '3857',
        size: `${x},${y}`,
        f: 'image',
        format: 'png',
        transparent: 'true',
        interpolation: 'RSP_BilinearInterpolation',
        compressionQuality: '85',
      })
      if (token) params.set('token', token)
      el.decoding = 'async'
      el.alt = ''
      el.setAttribute('role', 'presentation')
      el.crossOrigin = 'anonymous'
      el.onload = () => done(undefined, el)
      el.onerror = () => done(new Error('Tile failed'), el)
      el.src = `${base}/exportImage?${params.toString()}`
      return el
    },
  })
  return new (Grid as unknown as new (opts?: L.GridLayerOptions) => L.GridLayer)({
    maxZoom: 22,
    maxNativeZoom: 19,
    ...gridOptions,
  })
}
