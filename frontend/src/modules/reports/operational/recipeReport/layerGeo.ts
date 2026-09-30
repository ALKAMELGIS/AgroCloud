/** Minimal layer shape from IndexedDB `savedLayers` (GIS map). */

export type StoredLayer = {
  id: number | string
  name?: string
  type?: string
  data?: unknown
}

const DB_NAME = 'GisMapStore'
const STORE_NAME = 'layers'

export async function loadStoredLayers(): Promise<StoredLayer[]> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const layers = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get('savedLayers')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    })
    return Array.isArray(layers) ? (layers as StoredLayer[]) : []
  } catch {
    return []
  }
}

/** First configured GIS layer id used for columns (prefer non-management). */
export function primaryLayerSourceId(columns: { sourceKey: string }[]): string | null {
  const nonMgmt = columns.find(c => !String(c.sourceKey).startsWith('management:'))
  const pick = nonMgmt ?? columns[0]
  if (!pick) return null
  const sk = String(pick.sourceKey)
  return sk.startsWith('management:') ? sk.slice('management:'.length) : sk
}

export function findLayerGeoJson(layers: StoredLayer[], layerId: string): { type: 'FeatureCollection'; features: unknown[] } | null {
  const idStr = String(layerId).trim()
  const layer = layers.find(l => String(l.id) === idStr)
  if (!layer?.data) return null
  const d = layer.data as Record<string, unknown>
  if (d.type === 'FeatureCollection' && Array.isArray(d.features)) return d as { type: 'FeatureCollection'; features: unknown[] }
  if (d.type === 'Feature' && (d as any).geometry) {
    return { type: 'FeatureCollection', features: [d] }
  }
  if (d.type && typeof (d as any).coordinates !== 'undefined') {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: d }],
    }
  }
  return null
}

export type LngLat = [number, number]

export function collectLngLats(fc: { features?: unknown[] }): LngLat[] {
  const pts: LngLat[] = []
  const ring = (coords: unknown): void => {
    if (!coords) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      pts.push([coords[0], coords[1]])
      return
    }
    if (Array.isArray(coords)) coords.forEach(ring)
  }
  for (const f of fc.features ?? []) {
    const g = (f as { geometry?: { type?: string; coordinates?: unknown; geometries?: unknown[] } }).geometry
    if (!g) continue
    if (g.type === 'Point') ring(g.coordinates)
    else if (g.type === 'MultiPoint') ring(g.coordinates)
    else if (g.type === 'LineString') ring(g.coordinates)
    else if (g.type === 'MultiLineString') ring(g.coordinates)
    else if (g.type === 'Polygon') ring(g.coordinates)
    else if (g.type === 'MultiPolygon') ring(g.coordinates)
    else if (g.type === 'GeometryCollection') {
      for (const gg of (g as any).geometries ?? []) {
        ring((gg as any).coordinates)
      }
    }
  }
  return pts
}

export function bboxFromPts(pts: LngLat[]): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  if (!pts.length) return null
  let minLng = pts[0][0]
  let maxLng = pts[0][0]
  let minLat = pts[0][1]
  let maxLat = pts[0][1]
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  return { minLng, minLat, maxLng, maxLat }
}
