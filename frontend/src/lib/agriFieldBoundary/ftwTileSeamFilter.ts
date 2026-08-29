/**
 * Remove PMTiles / raster-tile seam slivers from FTW field exports.
 * Uses Field Boundaries as the reference geometry — no dissolve, simplify, or resample.
 */

import * as turf from '@turf/turf'
import { ftwFeatureStableKey } from './ftwGlobalTileDedupe'

export type FtwTileSeamFilterOptions = {
  /** Drop strips narrower than this (m). Default 4 m (~1 pixel at FTW z14). */
  minSeamWidthM?: number
  /** Minimum long axis for a thin strip to count as a tile seam (m). Default 18 m. */
  minSeamLengthM?: number
  /** Max aspect ratio (long/short) for seam classification. Default 12. */
  maxSeamAspect?: number
}

const DEFAULTS: Required<FtwTileSeamFilterOptions> = {
  minSeamWidthM: 4,
  minSeamLengthM: 18,
  maxSeamAspect: 12,
}

function featureConfidence(f: GeoJSON.Feature): number {
  const p = (f.properties ?? {}) as Record<string, unknown>
  const c = Number(p.confidence_mean ?? p.confidence ?? 0)
  return Number.isFinite(c) ? c : 0
}

function ringLonLatToMeters(ring: GeoJSON.Position[]): Array<[number, number]> {
  const latMid = ring.reduce((s, p) => s + p[1]!, 0) / Math.max(ring.length, 1)
  const cos = Math.cos((latMid * Math.PI) / 180)
  const mLon = 111_320 * cos
  const mLat = 110_540
  return ring.map(([lon, lat]) => [lon! * mLon, lat! * mLat])
}

/** Minimum caliper width (m) — thin vertical/horizontal tile cuts score very low. */
export function polygonMinWidthMeters(feature: GeoJSON.Feature): number {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return Infinity
  try {
    const ring =
      g.type === 'Polygon'
        ? g.coordinates[0]
        : g.coordinates?.[0]?.[0]
    if (!ring || ring.length < 4) return Infinity
    const m = ringLonLatToMeters(ring)
    let minWidth = Infinity
    for (let i = 0; i < m.length - 1; i++) {
      const [x0, y0] = m[i]!
      const [x1, y1] = m[i + 1]!
      const edgeLen = Math.hypot(x1 - x0, y1 - y0)
      if (edgeLen < 1e-6) continue
      const nx = -(y1 - y0) / edgeLen
      const ny = (x1 - x0) / edgeLen
      let minP = Infinity
      let maxP = -Infinity
      for (const [px, py] of m) {
        const proj = px * nx + py * ny
        minP = Math.min(minP, proj)
        maxP = Math.max(maxP, proj)
      }
      minWidth = Math.min(minWidth, maxP - minP)
    }
    return Number.isFinite(minWidth) ? minWidth : Infinity
  } catch {
    return Infinity
  }
}

function bboxDimsMeters(feature: GeoJSON.Feature): { widthM: number; heightM: number } {
  const bbox = turf.bbox(feature)
  const latMid = (bbox[1]! + bbox[3]!) / 2
  const cos = Math.cos((latMid * Math.PI) / 180)
  const mLon = 111_320 * cos
  const mLat = 110_540
  return {
    widthM: Math.abs(bbox[2]! - bbox[0]!) * mLon,
    heightM: Math.abs(bbox[3]! - bbox[1]!) * mLat,
  }
}

/** True when polygon is a tile-boundary sliver (not a real field). */
export function isFtwTileSeamSliver(
  feature: GeoJSON.Feature,
  opts?: FtwTileSeamFilterOptions,
): boolean {
  const o = { ...DEFAULTS, ...opts }
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return true

  let areaM2 = 0
  try {
    areaM2 = turf.area(feature as turf.AllGeoJSON)
  } catch {
    return true
  }
  if (areaM2 <= 0) return true

  const { widthM, heightM } = bboxDimsMeters(feature)
  const minDim = Math.min(widthM, heightM)
  const maxDim = Math.max(widthM, heightM)
  if (minDim <= o.minSeamWidthM && maxDim >= o.minSeamLengthM) return true
  if (minDim > 0 && maxDim / minDim >= o.maxSeamAspect && minDim <= o.minSeamWidthM * 2.5) {
    return true
  }

  const minWidth = polygonMinWidthMeters(feature)
  if (minWidth <= o.minSeamWidthM && maxDim >= o.minSeamLengthM) return true

  let perimeterM = 0
  try {
    perimeterM = turf.length(turf.polygonToLine(feature as turf.AllGeoJSON), { units: 'meters' })
  } catch {
    perimeterM = 0
  }
  // Hairline stairstep tile cuts: tiny area, huge perimeter/area ratio.
  if (areaM2 < 250 && perimeterM > 0 && perimeterM / Math.sqrt(areaM2) > 28) return true

  return false
}

/**
 * Reference Field Boundaries — one geometry per stable id, highest confidence wins.
 * No dissolve / merge / overlap carve.
 */
export function buildFtwReferenceFieldBoundaries(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const byKey = new Map<string, GeoJSON.Feature>()
  for (const f of features) {
    const key = ftwFeatureStableKey(f)
    const prev = byKey.get(key)
    if (!prev || featureConfidence(f) >= featureConfidence(prev)) {
      byKey.set(key, f)
    }
  }
  return [...byKey.values()]
}

/**
 * Keep original field boundary geometries; drop tile-seam slivers only.
 */
export function stripFtwTileSeamSlivers(
  features: GeoJSON.Feature[],
  opts?: FtwTileSeamFilterOptions,
): GeoJSON.Feature[] {
  return features.filter(f => !isFtwTileSeamSliver(f, opts))
}

/**
 * Field-boundary-mask export: reference polygons validated, seams removed, geometry untouched.
 */
export function applyFtwFieldBoundaryMaskExport(
  rawFeatures: GeoJSON.Feature[],
  opts?: FtwTileSeamFilterOptions,
): GeoJSON.Feature[] {
  const reference = buildFtwReferenceFieldBoundaries(rawFeatures)
  return stripFtwTileSeamSlivers(reference, opts)
}
