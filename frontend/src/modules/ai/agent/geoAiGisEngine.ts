/**
 * Frontend GIS geoprocessing engine for Neighborhood Agent (Turf.js).
 * Always returns a NEW FeatureCollection — never mutates source layers.
 */

import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import type { GeoJsonFeatureCollection } from './geoAiGisLayerResolve'

export type GisDistanceUnit = 'meters' | 'kilometers' | 'miles' | 'feet'

export type GisEngineResult = {
  ok: boolean
  message: string
  outputName: string
  geojson?: FeatureCollection
  table?: {
    kind: 'statistics'
    title: string
    columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>
    rows: Array<{ values: Record<string, string | number | null> }>
  }
  featureCount?: number
}

function toFc(input: GeoJsonFeatureCollection | FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (input.features || [])
      .filter(f => f && f.geometry)
      .map(f => ({
        type: 'Feature' as const,
        properties: { ...(f.properties || {}) },
        geometry: f.geometry as Geometry,
      })),
  }
}

function sanitizeOutputName(raw: string | undefined, fallback: string): string {
  const s = (raw || fallback).trim().replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  return s.slice(0, 80) || fallback
}

export function normalizeGisDistanceUnit(raw: unknown): GisDistanceUnit {
  const t = String(raw || 'meters').toLowerCase()
  if (/^km|kilomet/.test(t)) return 'kilometers'
  if (/^mi|mile/.test(t)) return 'miles'
  if (/^ft|feet|foot/.test(t)) return 'feet'
  return 'meters'
}

function turfUnits(unit: GisDistanceUnit): turf.Units {
  if (unit === 'kilometers') return 'kilometers'
  if (unit === 'miles') return 'miles'
  if (unit === 'feet') return 'feet'
  return 'meters'
}

function emptyFail(message: string, outputName: string): GisEngineResult {
  return { ok: false, message, outputName }
}

function okLayer(
  message: string,
  outputName: string,
  geojson: FeatureCollection,
): GisEngineResult {
  return {
    ok: true,
    message,
    outputName,
    geojson,
    featureCount: geojson.features.length,
  }
}

/** Buffer features by distance (optional multi-ring distances). */
export function runGisBuffer(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  distance: number
  unit?: GisDistanceUnit | string
  rings?: number[]
  outputName?: string
  inputName?: string
}): GisEngineResult {
  const unit = normalizeGisDistanceUnit(input.unit)
  const baseName = sanitizeOutputName(
    input.outputName,
    `${input.inputName || 'Layer'}_Buffer_${input.distance}${unit === 'meters' ? 'm' : unit === 'kilometers' ? 'km' : ''}`,
  )
  const fc = toFc(input.collection)
  if (!fc.features.length) return emptyFail('Input has no features to buffer.', baseName)
  if (!(input.distance > 0) && !(input.rings && input.rings.some(d => d > 0))) {
    return emptyFail('Buffer distance must be > 0.', baseName)
  }

  const distances =
    input.rings && input.rings.length
      ? input.rings.filter(d => Number.isFinite(d) && d > 0)
      : [input.distance]

  const outFeatures: Feature[] = []
  for (const d of distances) {
    for (const f of fc.features) {
      try {
        const buffered = turf.buffer(f as Feature, d, { units: turfUnits(unit) })
        if (!buffered) continue
        buffered.properties = {
          ...(f.properties || {}),
          ...(buffered.properties || {}),
          buffer_distance: d,
          buffer_unit: unit,
        }
        outFeatures.push(buffered)
      } catch {
        // skip invalid geometries
      }
    }
  }

  if (!outFeatures.length) return emptyFail('Buffer produced no geometries.', baseName)
  return okLayer(
    `Buffered ${fc.features.length} feature(s) → ${outFeatures.length} polygon(s). Layer added: ${baseName}`,
    baseName,
    { type: 'FeatureCollection', features: outFeatures },
  )
}

function pairwiseOverlay(
  a: FeatureCollection,
  b: FeatureCollection,
  mode: 'intersect' | 'erase',
): Feature[] {
  const out: Feature[] = []
  const clipParts = b.features
  for (const fa of a.features) {
    if (!fa.geometry) continue
    try {
      if (mode === 'intersect') {
        for (const fb of clipParts) {
          if (!fb.geometry) continue
          const hit = turf.intersect(
            turf.featureCollection([fa as Feature, fb as Feature]),
          )
          if (hit) {
            hit.properties = { ...(fa.properties || {}), ...(fb.properties || {}) }
            out.push(hit)
          }
        }
      } else {
        // erase: difference against union of clip layer when possible
        let current: Feature | null = fa as Feature
        for (const fb of clipParts) {
          if (!current?.geometry || !fb.geometry) continue
          try {
            const diff = turf.difference(turf.featureCollection([current, fb as Feature]))
            current = diff
            if (!current) break
          } catch {
            /* keep current */
          }
        }
        if (current?.geometry) out.push(current)
      }
    } catch {
      /* skip */
    }
  }
  return out
}

export function runGisIntersect(input: {
  a: GeoJsonFeatureCollection | FeatureCollection
  b: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  nameA?: string
  nameB?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(
    input.outputName,
    `${input.nameA || 'A'}_${input.nameB || 'B'}_Intersect`,
  )
  const fa = toFc(input.a)
  const fb = toFc(input.b)
  if (!fa.features.length || !fb.features.length) {
    return emptyFail('Intersect needs features on both inputs.', outputName)
  }
  const features = pairwiseOverlay(fa, fb, 'intersect')
  if (!features.length) return emptyFail('Intersect produced no overlapping geometries.', outputName)
  return okLayer(
    `Intersected ${input.nameA || 'A'} ∩ ${input.nameB || 'B'} → ${features.length} feature(s). Layer added: ${outputName}`,
    outputName,
    { type: 'FeatureCollection', features },
  )
}

export function runGisClip(input: {
  target: GeoJsonFeatureCollection | FeatureCollection
  clip: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  targetName?: string
  clipName?: string
}): GisEngineResult {
  return runGisIntersect({
    a: input.target,
    b: input.clip,
    outputName: sanitizeOutputName(input.outputName, `${input.targetName || 'Layer'}_Clip`),
    nameA: input.targetName,
    nameB: input.clipName || 'clip',
  })
}

export function runGisErase(input: {
  target: GeoJsonFeatureCollection | FeatureCollection
  eraser: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  targetName?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(input.outputName, `${input.targetName || 'Layer'}_Erase`)
  const fa = toFc(input.target)
  const fb = toFc(input.eraser)
  if (!fa.features.length) return emptyFail('Erase target has no features.', outputName)
  const features = pairwiseOverlay(fa, fb, 'erase')
  if (!features.length) return emptyFail('Erase removed all geometry.', outputName)
  return okLayer(
    `Erased using ${fb.features.length} mask feature(s) → ${features.length} remaining. Layer added: ${outputName}`,
    outputName,
    { type: 'FeatureCollection', features },
  )
}

export function runGisUnionOrMerge(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  inputName?: string
  mode?: 'union' | 'merge'
}): GisEngineResult {
  const outputName = sanitizeOutputName(
    input.outputName,
    `${input.inputName || 'Layer'}_${input.mode === 'merge' ? 'Merge' : 'Union'}`,
  )
  const fc = toFc(input.collection)
  if (!fc.features.length) return emptyFail('No features to union/merge.', outputName)

  const polys = fc.features.filter(f => {
    const t = f.geometry?.type
    return t === 'Polygon' || t === 'MultiPolygon'
  })
  if (polys.length < 1) return emptyFail('Union/merge needs polygon features.', outputName)

  try {
    let combined: Feature = polys[0] as Feature
    for (let i = 1; i < polys.length; i++) {
      const next = turf.union(turf.featureCollection([combined, polys[i] as Feature]))
      if (next) combined = next
    }
    combined.properties = { ...(combined.properties || {}), merged_count: polys.length }
    return okLayer(
      `Merged ${polys.length} polygon(s) into 1. Layer added: ${outputName}`,
      outputName,
      { type: 'FeatureCollection', features: [combined] },
    )
  } catch (e) {
    return emptyFail(e instanceof Error ? e.message : 'Union failed.', outputName)
  }
}

export function runGisDissolve(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  field?: string
  outputName?: string
  inputName?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(input.outputName, `${input.inputName || 'Layer'}_Dissolve`)
  const fc = toFc(input.collection)
  if (!fc.features.length) return emptyFail('No features to dissolve.', outputName)

  const field = (input.field || '').trim()
  if (!field) {
    return runGisUnionOrMerge({
      collection: fc,
      outputName,
      inputName: input.inputName,
      mode: 'merge',
    })
  }

  const groups = new Map<string, Feature[]>()
  for (const f of fc.features) {
    const key = String(f.properties?.[field] ?? '')
    const list = groups.get(key) || []
    list.push(f as Feature)
    groups.set(key, list)
  }

  const out: Feature[] = []
  for (const [key, feats] of groups) {
    try {
      let combined: Feature = feats[0]!
      for (let i = 1; i < feats.length; i++) {
        const next = turf.union(turf.featureCollection([combined, feats[i]!]))
        if (next) combined = next
      }
      combined.properties = { ...(combined.properties || {}), [field]: key, dissolved_count: feats.length }
      out.push(combined)
    } catch {
      /* skip group */
    }
  }
  if (!out.length) return emptyFail(`Dissolve by "${field}" produced no features.`, outputName)
  return okLayer(
    `Dissolved by ${field} → ${out.length} feature(s). Layer added: ${outputName}`,
    outputName,
    { type: 'FeatureCollection', features: out },
  )
}

export function runGisConvexHull(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  inputName?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(input.outputName, `${input.inputName || 'Layer'}_ConvexHull`)
  const fc = toFc(input.collection)
  if (fc.features.length < 1) return emptyFail('Convex hull needs features.', outputName)
  try {
    const hull = turf.convex(fc)
    if (!hull) return emptyFail('Convex hull could not be computed.', outputName)
    return okLayer(`Convex hull created. Layer added: ${outputName}`, outputName, {
      type: 'FeatureCollection',
      features: [hull],
    })
  } catch (e) {
    return emptyFail(e instanceof Error ? e.message : 'Convex hull failed.', outputName)
  }
}

export function runGisVoronoi(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  outputName?: string
  inputName?: string
  bbox?: [number, number, number, number]
}): GisEngineResult {
  const outputName = sanitizeOutputName(input.outputName, `${input.inputName || 'Layer'}_Voronoi`)
  const fc = toFc(input.collection)
  const points: Feature[] = []
  for (const f of fc.features) {
    try {
      const c = turf.centroid(f as Feature)
      points.push(c)
    } catch {
      /* skip */
    }
  }
  if (points.length < 2) return emptyFail('Voronoi needs at least 2 point locations.', outputName)
  try {
    const pts = turf.featureCollection(points)
    const bbox = input.bbox || (turf.bbox(pts) as [number, number, number, number])
    // expand bbox slightly
    const pad = 0.02
    const padded: [number, number, number, number] = [
      bbox[0] - pad,
      bbox[1] - pad,
      bbox[2] + pad,
      bbox[3] + pad,
    ]
    const vor = turf.voronoi(pts, { bbox: padded })
    if (!vor?.features?.length) return emptyFail('Voronoi produced no cells.', outputName)
    return okLayer(
      `Voronoi / Thiessen from ${points.length} points → ${vor.features.length} cells. Layer added: ${outputName}`,
      outputName,
      vor,
    )
  } catch (e) {
    return emptyFail(e instanceof Error ? e.message : 'Voronoi failed.', outputName)
  }
}

export function runGisAreaTable(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  inputName?: string
  idField?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(undefined, `${input.inputName || 'Layer'}_Area`)
  const fc = toFc(input.collection)
  if (!fc.features.length) return emptyFail('No features for area calculation.', outputName)

  const idField = (input.idField || '').trim()
  const rows: Array<{ values: Record<string, string | number | null> }> = []
  let totalM2 = 0
  fc.features.forEach((f, i) => {
    let areaM2 = 0
    try {
      areaM2 = turf.area(f as Feature)
    } catch {
      areaM2 = 0
    }
    totalM2 += areaM2
    const id =
      (idField && f.properties?.[idField] != null
        ? String(f.properties[idField])
        : String(f.properties?.name ?? f.properties?.Name ?? f.properties?.id ?? i + 1)) || String(i + 1)
    rows.push({
      values: {
        feature: id,
        area_m2: Math.round(areaM2 * 100) / 100,
        area_ha: Math.round((areaM2 / 10000) * 1000) / 1000,
      },
    })
  })

  return {
    ok: true,
    message: `Calculated area for ${fc.features.length} feature(s). Total ${ (totalM2 / 10000).toFixed(3) } ha.`,
    outputName,
    featureCount: fc.features.length,
    table: {
      kind: 'statistics',
      title: `${input.inputName || 'Layer'} area`,
      columns: [
        { key: 'feature', label: 'Feature', align: 'left' },
        { key: 'area_ha', label: 'Area ha', align: 'right' },
        { key: 'area_m2', label: 'Area m²', align: 'right' },
      ],
      rows: rows.slice(0, 200),
    },
  }
}

/** Select features within distance of a mask layer (buffer mask then intersect). */
export function runGisSelectByLocation(input: {
  target: GeoJsonFeatureCollection | FeatureCollection
  mask: GeoJsonFeatureCollection | FeatureCollection
  distance?: number
  unit?: GisDistanceUnit | string
  relationship?: 'within' | 'intersects' | 'within_distance'
  outputName?: string
  targetName?: string
  maskName?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(
    input.outputName,
    `${input.targetName || 'Layer'}_SelectByLocation`,
  )
  const target = toFc(input.target)
  let mask = toFc(input.mask)
  if (!target.features.length) return emptyFail('Select-by-location target is empty.', outputName)
  if (!mask.features.length) return emptyFail('Select-by-location mask is empty.', outputName)

  const rel = input.relationship || (input.distance && input.distance > 0 ? 'within_distance' : 'intersects')
  if (rel === 'within_distance' && input.distance && input.distance > 0) {
    const buffered = runGisBuffer({
      collection: mask,
      distance: input.distance,
      unit: input.unit,
      inputName: input.maskName || 'mask',
      outputName: 'tmp_mask_buffer',
    })
    if (!buffered.ok || !buffered.geojson) {
      return emptyFail(buffered.message, outputName)
    }
    mask = buffered.geojson
  }

  const selected: Feature[] = []
  for (const f of target.features) {
    if (!f.geometry) continue
    let keep = false
    for (const m of mask.features) {
      if (!m.geometry) continue
      try {
        if (rel === 'within') {
          keep = turf.booleanWithin(f as Feature, m as Feature)
        } else {
          keep = turf.booleanIntersects(f as Feature, m as Feature)
        }
      } catch {
        keep = false
      }
      if (keep) break
    }
    if (keep) selected.push(f as Feature)
  }

  if (!selected.length) return emptyFail('No features matched the spatial selection.', outputName)
  return okLayer(
    `Select by location (${rel}) → ${selected.length} of ${target.features.length}. Layer added: ${outputName}`,
    outputName,
    { type: 'FeatureCollection', features: selected },
  )
}

export function runGisSelectByAttribute(input: {
  collection: GeoJsonFeatureCollection | FeatureCollection
  field: string
  value?: string | number | boolean
  operator?: '=' | '!=' | 'contains' | '>' | '<'
  outputName?: string
  inputName?: string
}): GisEngineResult {
  const outputName = sanitizeOutputName(
    input.outputName,
    `${input.inputName || 'Layer'}_SelectByAttribute`,
  )
  const fc = toFc(input.collection)
  const field = (input.field || '').trim()
  if (!field) return emptyFail('Select-by-attribute requires a field name.', outputName)
  const op = input.operator || '='
  const want = input.value

  const selected = fc.features.filter(f => {
    const raw = f.properties?.[field]
    if (op === 'contains') {
      return String(raw ?? '')
        .toLowerCase()
        .includes(String(want ?? '').toLowerCase())
    }
    if (op === '>') return Number(raw) > Number(want)
    if (op === '<') return Number(raw) < Number(want)
    if (op === '!=') return String(raw) !== String(want)
    return String(raw) === String(want)
  }) as Feature[]

  if (!selected.length) return emptyFail(`No features where ${field} ${op} ${want}.`, outputName)
  return okLayer(
    `Select by attribute (${field} ${op} ${want}) → ${selected.length}. Layer added: ${outputName}`,
    outputName,
    { type: 'FeatureCollection', features: selected },
  )
}

/** Parse free-form distance like "500 m", "1 km". */
export function parseGisDistance(raw: unknown): { distance: number; unit: GisDistanceUnit } | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return { distance: raw, unit: 'meters' }
  }
  const s = String(raw || '').trim().toLowerCase()
  const m = s.match(/^([\d.+-]+)\s*(m|meter|meters|km|kilometer|kilometers|mi|mile|miles|ft|feet)?$/)
  if (!m) return null
  const distance = Number(m[1])
  if (!Number.isFinite(distance) || distance <= 0) return null
  const u = m[2] || 'm'
  return { distance, unit: normalizeGisDistanceUnit(u) }
}

export type { Position }
