/**
 * Live map state → a compact, authoritative context block for the Geo AI assistant.
 *
 * This lets the model "see" what the user is currently looking at — camera, basemap,
 * drawn AOI (with area / centroid / extent), the layer roster (visibility + opacity),
 * the active analysis (index, scene date, resolution) and its live legend / per-class
 * area statistics, plus the currently selected feature — so the user never has to
 * describe the map. The block is intentionally terse (token-friendly) and is appended
 * to the system instruction for every backend (Gemini / Claude / DeepSeek).
 *
 * Geometry math (area / centroid / bbox) is self-contained so this module pulls in no
 * extra dependencies.
 */

import type { GeoAiBasemapFeature } from './geoAiBasemapQuery'

type GeoJsonGeometryLike = {
  type?: string
  coordinates?: unknown
  geometry?: GeoJsonGeometryLike
} | null

export type GeoAiCameraState = {
  longitude?: number | null
  latitude?: number | null
  zoom?: number | null
  pitch?: number | null
  bearing?: number | null
  is3D?: boolean
}

export type GeoAiLayerState = {
  id?: string
  name: string
  visible?: boolean
  /** 0..1 draw opacity. */
  opacity?: number | null
  /** Vector | Raster | Layer, etc. */
  kind?: string | null
  source?: string | null
  crs?: string | null
  featureCount?: number | null
}

export type GeoAiLegendClassArea = {
  name: string
  color?: string | null
  areaHa?: number | null
  areaM2?: number | null
  pct?: number | null
}

export type GeoAiActiveAnalysisState = {
  /** e.g. NDVI, SAVI, NDWI, LST, Tree Detection, Land Cover. */
  label: string
  acquisitionDate?: string | null
  resolutionMeters?: number | null
  meanValue?: number | null
  /** Dynamic legend classes (with live per-class area) the user currently sees. */
  classes?: GeoAiLegendClassArea[]
  /** Loading / unavailable note, surfaced verbatim when classes are absent. */
  note?: string | null
}

export type GeoAiSelectedFeatureState = {
  layerName?: string | null
  lng?: number | null
  lat?: number | null
  attributes?: Array<{ label: string; value: string }>
}

/** Satellite map toolbox status so the agent can guide AOI / RS / hydro workflows. */
export type GeoAiToolboxState = {
  /** Currently expanded dock section id, if any. */
  openSection?: string | null
  imageryTimeSeriesOpen?: boolean
  drawingActive?: boolean
  hasAoi?: boolean
  /** Compact hints for available analysis tools. */
  availableTools?: string[]
}

export type GeoAiLiveMapState = {
  camera?: GeoAiCameraState | null
  basemapLabel?: string | null
  aoiGeometry?: GeoJsonGeometryLike
  layers?: GeoAiLayerState[]
  activeAnalysis?: GeoAiActiveAnalysisState | null
  selectedFeature?: GeoAiSelectedFeatureState | null
  /** Named places / POIs read live from the basemap near the current view. */
  basemapFeatures?: GeoAiBasemapFeature[]
  toolbox?: GeoAiToolboxState | null
}

const EARTH_RADIUS_M = 6378137

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Spherical ring area (m²) — same formulation as turf/@turf/area. */
function ringAreaM2(ring: number[][]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i += 1) {
    let lowerIndex: number
    let middleIndex: number
    let upperIndex: number
    if (i === n - 2) {
      lowerIndex = n - 2
      middleIndex = n - 1
      upperIndex = 0
    } else if (i === n - 1) {
      lowerIndex = n - 1
      middleIndex = 0
      upperIndex = 1
    } else {
      lowerIndex = i
      middleIndex = i + 1
      upperIndex = i + 2
    }
    const p1 = ring[lowerIndex]!
    const p2 = ring[middleIndex]!
    const p3 = ring[upperIndex]!
    total += (toRad(p3[0]!) - toRad(p1[0]!)) * Math.sin(toRad(p2[1]!))
  }
  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2
}

function polygonAreaM2(rings: number[][][]): number {
  if (!rings.length) return 0
  let area = Math.abs(ringAreaM2(rings[0]!))
  for (let i = 1; i < rings.length; i += 1) area -= Math.abs(ringAreaM2(rings[i]!))
  return Math.max(0, area)
}

type GeometryMetrics = {
  type: string
  areaM2: number
  centroid: [number, number] | null
  bbox: [number, number, number, number] | null
  vertexCount: number
}

function unwrapGeometry(input: GeoJsonGeometryLike): GeoJsonGeometryLike {
  if (!input) return null
  if (input.type === 'Feature' && input.geometry) return input.geometry
  return input
}

/** Area (m²), vertex-average centroid, and bbox for Polygon / MultiPolygon / others. */
export function geometryMetrics(input: GeoJsonGeometryLike): GeometryMetrics | null {
  const geom = unwrapGeometry(input)
  if (!geom || !geom.type) return null
  let area = 0
  let sumLng = 0
  let sumLat = 0
  let count = 0
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  const visit = (pos: number[]) => {
    const lng = Number(pos[0])
    const lat = Number(pos[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    sumLng += lng
    sumLat += lat
    count += 1
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
  }
  const walk = (coords: unknown, depth: number) => {
    if (!Array.isArray(coords)) return
    if (depth === 0) {
      visit(coords as number[])
      return
    }
    for (const c of coords) walk(c, depth - 1)
  }

  const coords = geom.coordinates as unknown
  switch (geom.type) {
    case 'Polygon':
      area = polygonAreaM2(coords as number[][][])
      walk(coords, 2)
      break
    case 'MultiPolygon':
      for (const poly of (coords as number[][][][]) || []) area += polygonAreaM2(poly)
      walk(coords, 3)
      break
    case 'Point':
      walk(coords, 0)
      break
    case 'LineString':
    case 'MultiPoint':
      walk(coords, 1)
      break
    case 'MultiLineString':
      walk(coords, 2)
      break
    default:
      return null
  }

  return {
    type: geom.type,
    areaM2: area,
    centroid: count > 0 ? [sumLng / count, sumLat / count] : null,
    bbox: count > 0 ? [minLng, minLat, maxLng, maxLat] : null,
    vertexCount: count,
  }
}

function fmtCoord(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(5) : '—'
}

function fmtArea(areaM2: number): string {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return '0 m²'
  const ha = areaM2 / 10_000
  const km2 = areaM2 / 1_000_000
  const haStr = ha >= 100 ? ha.toFixed(0) : ha >= 1 ? ha.toFixed(1) : ha.toFixed(2)
  const m2Str = Math.round(areaM2).toLocaleString('en-US')
  const km2Str = km2 >= 0.01 ? ` · ${km2.toFixed(2)} km²` : ''
  return `${haStr} ha (${m2Str} m²${km2Str})`
}

/**
 * Render the live map state as a compact markdown block, or `''` when there is
 * effectively nothing to report.
 */
export function buildGeoAiLiveMapStateBlock(state: GeoAiLiveMapState | null | undefined): string {
  if (!state) return ''
  const lines: string[] = []

  const cam = state.camera
  if (cam && (cam.longitude != null || cam.latitude != null || cam.zoom != null)) {
    const view =
      cam.is3D || (typeof cam.pitch === 'number' && cam.pitch > 1)
        ? `3D (pitch ${Math.round(cam.pitch ?? 0)}°, bearing ${Math.round(cam.bearing ?? 0)}°)`
        : '2D'
    const zoom = typeof cam.zoom === 'number' ? cam.zoom.toFixed(1) : '—'
    lines.push(`- Camera: center ${fmtCoord(cam.longitude)},${fmtCoord(cam.latitude)} · zoom ${zoom} · ${view}`)
  }

  if (state.basemapLabel?.trim()) {
    lines.push(`- Basemap: ${state.basemapLabel.trim()}`)
  }

  const aoiMetrics = geometryMetrics(state.aoiGeometry)
  if (aoiMetrics && aoiMetrics.centroid) {
    const c = aoiMetrics.centroid
    const bbox = aoiMetrics.bbox
    const areaPart = aoiMetrics.areaM2 > 0 ? ` · area ${fmtArea(aoiMetrics.areaM2)}` : ''
    const bboxPart = bbox
      ? ` · bbox [${bbox[0].toFixed(4)}, ${bbox[1].toFixed(4)}, ${bbox[2].toFixed(4)}, ${bbox[3].toFixed(4)}]`
      : ''
    lines.push(
      `- AOI: ${aoiMetrics.type.toLowerCase()}${areaPart} · centroid ${c[0].toFixed(5)},${c[1].toFixed(5)}${bboxPart}`,
    )
  } else {
    lines.push('- AOI: none drawn (no analysis boundary yet)')
  }

  const tb = state.toolbox
  if (tb) {
    const bits: string[] = []
    bits.push(tb.hasAoi ? 'AOI drawn' : 'no AOI')
    if (tb.drawingActive) bits.push('drawing active')
    if (tb.imageryTimeSeriesOpen) bits.push('Imagery Time Series open')
    if (tb.openSection?.trim()) bits.push(`dock=${tb.openSection.trim()}`)
    lines.push(`- Toolbox: ${bits.join(' · ')}`)
    if (tb.availableTools?.length) {
      lines.push(`  Available analysis tools: ${tb.availableTools.slice(0, 12).join(', ')}`)
    }
  }

  const a = state.activeAnalysis
  if (a?.label) {
    const bits: string[] = [a.label]
    if (a.acquisitionDate) bits.push(`scene ${a.acquisitionDate}`)
    if (typeof a.resolutionMeters === 'number') bits.push(`${a.resolutionMeters} m/px`)
    if (typeof a.meanValue === 'number' && Number.isFinite(a.meanValue)) bits.push(`AOI mean ${a.meanValue.toFixed(3)}`)
    lines.push(`- Active analysis: ${bits.join(' · ')}`)
    if (a.classes?.length) {
      lines.push('  Legend classes (live per-class area):')
      for (const cl of a.classes) {
        const area = typeof cl.areaHa === 'number' && cl.areaHa > 0 ? `${cl.areaHa >= 100 ? cl.areaHa.toFixed(0) : cl.areaHa >= 1 ? cl.areaHa.toFixed(1) : cl.areaHa.toFixed(2)} ha` : null
        const pct = typeof cl.pct === 'number' && Number.isFinite(cl.pct) ? `${cl.pct.toFixed(1)}%` : null
        const stat = [area, pct].filter(Boolean).join(' · ')
        lines.push(`    • ${cl.name}${stat ? ` — ${stat}` : ''}`)
      }
    } else if (a.note?.trim()) {
      lines.push(`  (${a.note.trim()})`)
    }
  }

  if (state.layers?.length) {
    const sorted = state.layers.slice(0, 30)
    lines.push('- Layers (top → bottom of the map stack):')
    for (const l of sorted) {
      const on = l.visible === false ? 'off' : 'on'
      const kind = l.kind ? `, ${l.kind}` : ''
      const feats = typeof l.featureCount === 'number' ? `, ${l.featureCount} features` : ''
      const op =
        typeof l.opacity === 'number' && Number.isFinite(l.opacity) && l.opacity < 0.999
          ? `, opacity ${Math.round(l.opacity * 100)}%`
          : ''
      const crs = l.crs ? `, ${l.crs}` : ''
      lines.push(`    • [${on}] ${l.name}${kind}${feats}${op}${crs}`)
    }
  }

  const f = state.selectedFeature
  if (f && (f.lng != null || f.attributes?.length)) {
    const where = f.lng != null && f.lat != null ? ` @ ${f.lng.toFixed(5)},${f.lat.toFixed(5)}` : ''
    const attrs = f.attributes?.length
      ? ` — ${f.attributes
          .slice(0, 8)
          .map(r => `${r.label}: ${r.value}`)
          .join(', ')}`
      : ''
    lines.push(`- Selected feature: ${f.layerName || 'Location'}${where}${attrs}`)
  }

  const bm = state.basemapFeatures
  if (bm?.length) {
    lines.push('- Basemap places / POIs near the current view (read live from the basemap):')
    for (const feat of bm.slice(0, 14)) {
      const cat = feat.category ? `, ${feat.category}` : ''
      let dist = ''
      if (typeof feat.distanceM === 'number' && Number.isFinite(feat.distanceM)) {
        dist = feat.distanceM < 950 ? ` · ~${Math.round(feat.distanceM / 10) * 10} m` : ` · ~${(feat.distanceM / 1000).toFixed(feat.distanceM < 9500 ? 1 : 0)} km`
      }
      const at =
        typeof feat.lng === 'number' && typeof feat.lat === 'number'
          ? ` @ ${feat.lng.toFixed(5)},${feat.lat.toFixed(5)}`
          : ''
      lines.push(`    • ${feat.name}${cat}${dist}${at}`)
    }
  }

  if (!lines.length) return ''
  return [
    '### LIVE MAP STATE',
    '(Authoritative snapshot of exactly what the user currently sees on the map. Treat these as facts; never ask the user to describe the map, AOI, layers, or analysis — read them here. Numbers below are measured/computed from the live map.)',
    ...lines,
  ].join('\n')
}
