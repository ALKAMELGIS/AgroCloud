/**
 * Search map layers, sketches, and AOI fields from the satellite search box.
 */

import type { MapSearchResult } from './mapSearchGeocode'
import type { SiAoiFieldRecord } from './siAoiFields'

type SearchableLayer = {
  id?: string
  name?: string
  geojson?: GeoJSON.FeatureCollection | GeoJSON.Feature | null
}

type SearchSiMapOptions = {
  layers?: SearchableLayer[] | null
  sketch?: GeoJSON.Feature | GeoJSON.FeatureCollection | { geometry?: GeoJSON.Geometry | null } | null
  aoiFields?: SiAoiFieldRecord[] | null
  limit?: number
}

function needle(q: string): string {
  return q.trim().toLowerCase()
}

function matches(hay: string | null | undefined, q: string): boolean {
  if (!q) return false
  return String(hay || '').toLowerCase().includes(q)
}

function bboxOfGeometry(geometry: GeoJSON.Geometry | null | undefined): [number, number, number, number] | undefined {
  if (!geometry) return undefined
  const coords: number[][] = []
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      coords.push([Number(node[0]), Number(node[1])])
      return
    }
    for (const child of node) walk(child)
  }
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries || []) walk((g as GeoJSON.Geometry & { coordinates?: unknown }).coordinates)
  } else {
    walk((geometry as GeoJSON.Geometry & { coordinates?: unknown }).coordinates)
  }
  if (!coords.length) return undefined
  let w = coords[0]![0]
  let s = coords[0]![1]
  let e = w
  let n = s
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

function centerOfBbox(bbox: [number, number, number, number]): { lng: number; lat: number } {
  return { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 }
}

function geometryOfUnknown(input: unknown): GeoJSON.Geometry | null {
  if (!input || typeof input !== 'object') return null
  const rec = input as { type?: string; geometry?: GeoJSON.Geometry; features?: GeoJSON.Feature[] }
  if (rec.type === 'Feature' && rec.geometry) return rec.geometry
  if (rec.geometry) return rec.geometry
  if (rec.type === 'FeatureCollection' && Array.isArray(rec.features) && rec.features[0]?.geometry) {
    return rec.features[0].geometry
  }
  if (typeof rec.type === 'string' && 'coordinates' in rec) return rec as GeoJSON.Geometry
  return null
}

export function mapSearchResultIcon(kind?: string): string {
  switch (String(kind || '').toLowerCase()) {
    case 'layer':
      return 'fa-solid fa-layer-group'
    case 'feature':
      return 'fa-solid fa-border-all'
    case 'sketch':
      return 'fa-solid fa-draw-polygon'
    case 'aoi-field':
      return 'fa-solid fa-vector-square'
    default:
      return 'fa-solid fa-location-dot'
  }
}

export function searchSiMapLayersAndFeatures(
  query: string,
  opts: SearchSiMapOptions = {},
): MapSearchResult[] {
  const q = needle(query)
  if (q.length < 2) return []
  const limit = Math.max(1, Math.min(opts.limit ?? 6, 12))
  const out: MapSearchResult[] = []

  for (const layer of opts.layers || []) {
    if (out.length >= limit) break
    const name = String(layer.name || layer.id || 'Layer')
    if (!matches(name, q)) continue
    const geom = geometryOfUnknown(layer.geojson)
    const bbox = bboxOfGeometry(geom)
    const center = bbox ? centerOfBbox(bbox) : { lng: 0, lat: 0 }
    if (!bbox) continue
    out.push({
      id: `layer:${layer.id || name}`,
      label: name,
      subtitle: 'Map layer',
      lng: center.lng,
      lat: center.lat,
      bbox,
      kind: 'layer',
      score: 0.92,
    })
  }

  const sketchGeom = geometryOfUnknown(opts.sketch)
  if (out.length < limit && sketchGeom && (matches('aoi', q) || matches('sketch', q) || matches('drawn', q))) {
    const bbox = bboxOfGeometry(sketchGeom)
    if (bbox) {
      const center = centerOfBbox(bbox)
      out.push({
        id: 'sketch:aoi',
        label: 'Drawn AOI',
        subtitle: 'Sketch',
        lng: center.lng,
        lat: center.lat,
        bbox,
        kind: 'sketch',
        score: 0.88,
      })
    }
  }

  for (const field of opts.aoiFields || []) {
    if (out.length >= limit) break
    if (!matches(field.name, q) && !matches(field.id, q)) continue
    const bbox = bboxOfGeometry(field.geometry)
    const [lng, lat] = field.centroid
    out.push({
      id: `aoi-field:${field.id}`,
      label: field.name || 'AOI field',
      subtitle: 'AOI field',
      lng,
      lat,
      bbox,
      kind: 'aoi-field',
      score: 0.9,
      properties: { areaHa: field.areaHa, perimeterM: field.perimeterM },
    })
  }

  return out.slice(0, limit)
}
