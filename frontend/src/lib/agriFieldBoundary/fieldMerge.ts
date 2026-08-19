/**
 * Merge over-segmented agricultural field fragments into one parcel when they
 * share a long border (or nearly touch within ~1 Sentinel-2 pixel) and look
 * like pieces of the same field — not distinct neighbors across a road.
 */

import * as turf from '@turf/turf'

/** Soft floor for FTW finish/merge — kills S2 pinhead squares even if UI slider is 1. */
export const FTW_FINISH_MIN_AREA_M2 = 500

export type MergeFieldFragmentsOptions = {
  /** Max gap between parcels to treat as "touching" (metres). Default 10. */
  gapMeters?: number
  /**
   * Min shared-border length / shorter perimeter to merge.
   * Higher → fewer merges. Default 0.35.
   */
  contactFrac?: number
  /** Drop / ignore pieces smaller than this (m²). Default 1. */
  minAreaM2?: number
  /** Disable merging entirely. */
  enabled?: boolean
}

export function isFtwFieldEngine(sourceOrEngine?: string | null): boolean {
  const s = String(sourceOrEngine || '').toLowerCase()
  return s === 'ftw-live' || s === 'ftw-infer' || s.includes('ftw')
}

/** FTW, FoW, and similar cadastral catalog engines — grid-aligned post-process. */
export function isCadastralFieldEngine(sourceOrEngine?: string | null): boolean {
  const s = String(sourceOrEngine || '').toLowerCase()
  return (
    isFtwFieldEngine(s) ||
    s === 'fow' ||
    s.includes('fields-of-the-world') ||
    s.includes('fields_of_the_world')
  )
}

/** Effective min-area used by finishResult / re-apply for merge + AOI refine. */
export function finishMinAreaM2(minAreaM2: number, ftw: boolean): number {
  if (ftw) return Math.max(FTW_FINISH_MIN_AREA_M2, Math.max(0, minAreaM2))
  return Math.max(0.05, Math.min(minAreaM2, 40))
}

/** Merge options tuned for FTW over-segmentation vs other engines. */
export function finishMergeOptions(
  minAreaM2: number,
  opts: { ftw: boolean; enabled?: boolean },
): MergeFieldFragmentsOptions {
  const ftw = Boolean(opts.ftw)
  return {
    enabled: opts.enabled !== false,
    gapMeters: ftw ? 14 : 10,
    contactFrac: ftw ? 0.2 : 0.25,
    minAreaM2: finishMinAreaM2(minAreaM2, ftw),
  }
}

function areaM2(f: GeoJSON.Feature): number {
  try {
    const a = turf.area(f as any)
    return Number.isFinite(a) ? a : 0
  } catch {
    return 0
  }
}

function confOf(f: GeoJSON.Feature): number {
  const p = (f.properties || {}) as Record<string, unknown>
  const c = Number(p.confidence ?? p.score ?? p.conf ?? 0)
  return Number.isFinite(c) ? c : 0
}

function perimeterM(f: GeoJSON.Feature): number {
  try {
    const len = turf.length(turf.polygonToLine(f as any) as any, { units: 'kilometers' })
    return Number.isFinite(len) ? len * 1000 : 0
  } catch {
    try {
      const len = turf.length(f as any, { units: 'kilometers' })
      return Number.isFinite(len) ? len * 1000 : 0
    } catch {
      return 0
    }
  }
}

/** Polsby–Popper compactness (1 = circle). */
function compactness(f: GeoJSON.Feature): number {
  const a = areaM2(f)
  const p = perimeterM(f)
  if (a <= 0 || p <= 0) return 0
  return (4 * Math.PI * a) / (p * p)
}

function sharedBorderMeters(a: GeoJSON.Feature, b: GeoJSON.Feature, gapM: number): number {
  try {
    const bufA = turf.buffer(a as any, Math.max(gapM, 0.5), { units: 'meters' })
    if (!bufA) return 0
    const inter = turf.intersect(turf.featureCollection([bufA as any, b as any]))
    if (!inter) return 0
    // Approximate contact length from intersection area / gap width.
    const interArea = turf.area(inter as any)
    if (!Number.isFinite(interArea) || interArea <= 0) return 0
    // Buffer of gapM around A into B ≈ shared_length * gapM (not 2×).
    return interArea / Math.max(gapM, 0.5)
  } catch {
    return 0
  }
}

function nearlyTouch(a: GeoJSON.Feature, b: GeoJSON.Feature, gapM: number): boolean {
  try {
    if (turf.booleanIntersects(a as any, b as any)) return true
    const d = turf.distance(
      turf.centerOfMass(a as any) as any,
      turf.centerOfMass(b as any) as any,
      { units: 'meters' },
    )
    // Cheap reject: centres farther than combined radii + gap.
    const ra = Math.sqrt(areaM2(a) / Math.PI)
    const rb = Math.sqrt(areaM2(b) / Math.PI)
    if (d > ra + rb + gapM * 3) return false
    const buf = turf.buffer(a as any, gapM, { units: 'meters' })
    return !!buf && turf.booleanIntersects(buf as any, b as any)
  } catch {
    return false
  }
}

function shouldMerge(
  a: GeoJSON.Feature,
  b: GeoJSON.Feature,
  opts: Required<Pick<MergeFieldFragmentsOptions, 'gapMeters' | 'contactFrac'>>,
): boolean {
  if (!nearlyTouch(a, b, opts.gapMeters)) return false
  const contact = sharedBorderMeters(a, b, opts.gapMeters)
  const pa = perimeterM(a)
  const pb = perimeterM(b)
  const shorter = Math.min(pa, pb)
  if (shorter <= 0) return false
  if (contact < opts.contactFrac * shorter) return false

  const aa = areaM2(a)
  const ab = areaM2(b)
  // Two already large, compact rectangles with only a short corner contact → keep split.
  const ca = compactness(a)
  const cb = compactness(b)
  if (aa > 5000 && ab > 5000 && ca > 0.55 && cb > 0.55 && contact < 0.22 * shorter) {
    return false
  }
  return true
}

function unionPair(a: GeoJSON.Feature, b: GeoJSON.Feature): GeoJSON.Feature | null {
  try {
    const u = turf.union(turf.featureCollection([a as any, b as any])) as GeoJSON.Feature | null
    if (!u?.geometry) return null
    const wa = areaM2(a)
    const wb = areaM2(b)
    const conf =
      wa + wb > 0 ? (confOf(a) * wa + confOf(b) * wb) / (wa + wb) : Math.max(confOf(a), confOf(b))
    return {
      type: 'Feature',
      properties: {
        ...(a.properties || {}),
        ...(b.properties || {}),
        confidence: Math.round(conf * 10000) / 10000,
        confidence_score: Math.round(conf * 10000) / 10000,
        score: Math.round(conf * 10000) / 10000,
        field_merged: true,
        area_m2: Math.round(areaM2(u)),
      },
      geometry: u.geometry,
    }
  } catch {
    return null
  }
}

/**
 * Iteratively merge touching field fragments.
 * Returns a new FeatureCollection; does not mutate input.
 */
export function mergeFieldFragments(
  fc: GeoJSON.FeatureCollection | null | undefined,
  opts?: MergeFieldFragmentsOptions,
): GeoJSON.FeatureCollection {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  if (!fc?.features?.length) return empty
  if (opts?.enabled === false) {
    return { type: 'FeatureCollection', features: [...fc.features] }
  }

  const gapMeters = opts?.gapMeters ?? 10
  const contactFrac = opts?.contactFrac ?? 0.25
  const minArea = Math.max(0, opts?.minAreaM2 ?? 1)

  let features = fc.features.filter(f => {
    const t = f?.geometry?.type
    if (t !== 'Polygon' && t !== 'MultiPolygon') return false
    return areaM2(f) >= minArea
  })

  let changed = true
  let guard = 0
  while (changed && guard < 40) {
    changed = false
    guard += 1
    outer: for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const a = features[i]!
        const b = features[j]!
        if (!shouldMerge(a, b, { gapMeters, contactFrac })) continue
        const merged = unionPair(a, b)
        if (!merged) continue
        features = features.filter((_, idx) => idx !== i && idx !== j)
        features.push(merged)
        changed = true
        break outer
      }
    }
  }

  return { type: 'FeatureCollection', features }
}
