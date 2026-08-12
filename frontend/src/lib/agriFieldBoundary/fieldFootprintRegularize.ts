/**
 * Regularize AOI / field footprints toward cadastral farm boundaries:
 * - Near-rectilinear parcels → oriented bounding rectangle (OBB)
 * - Irregular parcels → soften stairs, simplify, snap edges to principal axes
 *   (straight connected edges like professional field boundary maps)
 */

import * as turf from '@turf/turf'

const DEG_STEP = 1
/** Keep original polygon when OBB grows too much (L-shapes / irregular farms). */
const MAX_AREA_INFLATION = 1.65
/**
 * Minimum original-area / OBB-area before snapping to OBB.
 * Lower → more cadastral-style rectangles on near-rectilinear fields.
 */
const MIN_FILL_RATIO = 0.52
/** Soften stair-step edges (metres) before simplify / snap. */
const KEEP_SOFTEN_M = 5.2
/** Degrees — snap edge headings to dominant directions (±90° family). */
const ANGLE_SNAP_DEG = 10
/** Drop vertices that barely divert from the previous edge (degrees). */
const COLINEAR_EPS_DEG = 8
/** Collapse short axis-aligned stair segments shorter than this (metres). */
const STAIR_EDGE_MAX_M = 90
/** Axis-align tolerance for stair detection (degrees from H/V). */
const STAIR_AXIS_TOL_DEG = 18

/**
 * Centre-pivot irrigation footprints must stay round.
 * Polsby–Popper (4πA/P²) is 1.0 for a circle and at most π/4 ≈ 0.785 for any
 * rectangle, so a shape above this guard can never be a cadastral rectangle.
 */
const PIVOT_ROUND_GUARD = 0.82
/**
 * Circularity already proved the parcel is round, so the fit gates — which
 * exist to stop squares being drawn as circles — can relax. Without this a
 * jagged small pivot keeps its 10 m pixel stairs instead of closing to a circle.
 */
const PIVOT_ROUND_MIN_CIRCLE_IOU = 0.78
const PIVOT_ROUND_MIN_CIRCLE_COVERAGE = 0.85

/**
 * Last-resort stair collapse for parcels no rectangle and no circle fits.
 * Douglas–Peucker in metres: 12 m sits above the 10 m Sentinel-2 pixel step
 * that produces the staircase, while still below a typical field edge.
 */
const STAIR_FREE_TOL_M = 9
/** Area the stair collapse may add or drop before it is rejected. */
const STAIR_FREE_AREA_TOL = 0.22
/** Any-angles simplify tolerance (metres) — collapses stairs into straight edges. */
const ANY_ANGLE_TOL_M = 12
/** Area gate for any-angles / diagonal rebuilds. */
const ANGLE_REBUILD_MIN_AREA_RATIO = 0.68
const ANGLE_REBUILD_MAX_AREA_RATIO = 1.42
/**
 * Overlap with the fitted equal-area circle. Unlike circularity this is immune to
 * raster jitter (jagged pivots stay ≈0.94) while a square only reaches ≈0.83.
 */
const PIVOT_MIN_CIRCLE_IOU = 0.9
/** Cheap pre-filter: ring vertices sitting within ±this fraction of one radius. */
const PIVOT_RADIAL_TOL = 0.12
const PIVOT_MIN_RADIAL_SHARE = 0.75
/** Guard against squares / octagons being read as coarse circles. */
const PIVOT_MIN_RING_VERTICES = 10
const PIVOT_CIRCLE_STEPS = 128
/**
 * Angular radial profile: bins of the ring's max radius around the centre.
 * A pivot holds one radius across most bearings even when a corner strip or a
 * neighbouring parcel is fused to it; a square sweeps radii from a to a√2 and
 * only holds ±8% of its median over ≈40% of the bearings.
 */
const PIVOT_PROFILE_BINS = 120
const PIVOT_PROFILE_TOL = 0.08
const PIVOT_MIN_PROFILE_SHARE = 0.62
/** The fitted circle must be almost entirely inside the parcel (no invented land). */
const PIVOT_MIN_CIRCLE_COVERAGE = 0.9
/** With an appendage the IoU drops, so the coverage gate carries the decision. */
const PIVOT_MIN_CIRCLE_IOU_TAIL = 0.72
/** Skip the inscribed-circle search on parcels that cannot be pivots (cost guard). */
const PIVOT_SEARCH_MIN_IOU = 0.6
const PIVOT_SEARCH_MIN_CIRCULARITY = 0.5

/**
 * Last-resort pivot test, immune to raster stairs, holes and multipart specks
 * that defeat the perimeter/bearing tests above: a disc fills π/4 ≈ 0.785 of its
 * min-area rectangle and that rectangle is square, while a cadastral square
 * fills ≈1.0 of its own rectangle and can never enter the band.
 */
const PIVOT_OBB_FILL_MIN = 0.68
const PIVOT_OBB_FILL_MAX = 0.88
const PIVOT_OBB_MIN_SQUARENESS = 0.86
const PIVOT_OBB_MIN_IOU = 0.82
const PIVOT_OBB_MIN_COVERAGE = 0.82
/** Multipart parcels only take the pivot path when one part carries the parcel. */
const PIVOT_MAIN_PART_MIN_SHARE = 0.85

/** Metres of clear space kept around a pivot circle so no parcel touches it. */
const PIVOT_CLEARANCE_M = 2
/** Overlap share of a footprint's own area that triggers a fall back to its traced shape. */
const OVERLAP_REVERT_RATIO = 0.02
/** Drop a parcel that keeps less than this share of its area after carving. */
const OVERLAP_MIN_KEEP_RATIO = 0.2
/** Pivot circles overlapping more than this share of the smaller one are duplicates. */
const PIVOT_DUPLICATE_RATIO = 0.4
/** Never shrink a pivot below this share of its fitted radius to clear a neighbour. */
const PIVOT_MIN_SHRINK_RATIO = 0.7

/** Sides shorter than this (metres) are raster stairs, not real parcel edges. */
const RIGHT_ANGLE_MIN_SEGMENT_M = 5
const RIGHT_ANGLE_MAX_SEGMENT_M = 55
/** Reject right-angle output that moved too much area — genuinely diagonal parcels. */
const RIGHT_ANGLE_MIN_AREA_RATIO = 0.65
const RIGHT_ANGLE_MAX_AREA_RATIO = 1.45
/** Residual overlap (m²) treated as zero after floating-point / edge noise. */
const OVERLAP_EPS_M2 = 1.5

/**
 * ArcGIS Regularize Building Footprint methods, applied to field parcels.
 * - right-angles → 90° between adjoining edges (default — clean cadastral fields)
 * - right-angles-and-diagonals → 45° and 90°
 * - any-angles → straight edges at any heading
 * - circle → best-fitting circle (centre pivots + forced circle mode)
 */
export type FootprintRegularizeMethod =
  | 'right-angles'
  | 'right-angles-and-diagonals'
  | 'any-angles'
  | 'circle'

export const FOOTPRINT_REGULARIZE_METHODS: Array<{
  id: FootprintRegularizeMethod
  label: string
  title: string
}> = [
  {
    id: 'right-angles',
    label: 'Right Angles',
    title: 'Shapes composed of 90° angles between adjoining edges',
  },
  {
    id: 'right-angles-and-diagonals',
    label: 'Right Angles and Diagonals',
    title: 'Shapes composed of 45° and 90° angles between adjoining edges',
  },
  {
    id: 'any-angles',
    label: 'Any Angles',
    title: 'Shapes that form any angles between adjoining edges',
  },
  {
    id: 'circle',
    label: 'Circle',
    title: 'Best fitting circle around the input features',
  },
]

export type RegularizeFootprintOptions = {
  /** Max OBB area / original area before keeping the source geometry. Default 1.65 */
  maxAreaInflation?: number
  /**
   * Require originalArea/obbArea >= this to snap (near-rectangular fields).
   * Default 0.58. Set 0 to disable the fill-ratio gate (legacy aggressive mode).
   */
  minFillRatio?: number
  /**
   * When OBB is rejected, fall back to axis-aligned envelope.
   * Default false for field footprints; AOI path enables it.
   */
  allowEnvelopeFallback?: boolean
  /** Soften kept (non-OBB) polygons to reduce stair-step edges. Default true. */
  softenKept?: boolean
  softenMeters?: number
  /**
   * After soften, snap edges to principal directions for cadastral straight lines.
   * Default true when regularizing field footprints.
   */
  cadastralSnap?: boolean
  /**
   * Detect centre-pivot circles and keep them round instead of squaring them.
   * Default true for field footprints; the AOI path disables it.
   */
  pivotAware?: boolean
  /**
   * Rebuild non-rectangular parcels with true right angles in their own
   * orientation (removes raster staircases). Default true.
   * @deprecated Prefer `method: 'right-angles'`.
   */
  rightAngles?: boolean
  /**
   * Regularize Building Footprint method. Default `right-angles`.
   */
  method?: FootprintRegularizeMethod
  /** Override the stair-collapse threshold (metres). Default scales with area. */
  minSegmentMeters?: number
  /**
   * Make the output disjoint (no overlapping parcels) after regularization.
   * Default true — pivot circles win, overreaching rectangles yield.
   */
  resolveOverlaps?: boolean
  /** Clear space kept around pivot circles (metres). Default 2. */
  pivotClearanceM?: number
  /**
   * Close thin gaps between neighbours then re-carve so parcels share edges
   * (cadastral mosaic). Default 0.85 m. Set 0 to disable.
   */
  abutNeighborsM?: number
}

function asPolygonFeature(
  input:
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon
    | GeoJSON.Feature
    | GeoJSON.FeatureCollection
    | GeoJSON.Geometry
    | null
    | undefined,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!input) return null
  try {
    if (input.type === 'FeatureCollection') {
      const poly = (input.features || []).find(
        f => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
      )
      if (!poly?.geometry) return null
      return {
        type: 'Feature',
        properties: { ...(poly.properties || {}) },
        geometry: poly.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      }
    }
    if (input.type === 'Feature') {
      const g = input.geometry
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
      return {
        type: 'Feature',
        properties: { ...(input.properties || {}) },
        geometry: g,
      }
    }
    if (input.type === 'Polygon' || input.type === 'MultiPolygon') {
      return { type: 'Feature', properties: {}, geometry: input }
    }
  } catch {
    return null
  }
  return null
}

/** Min-area oriented bounding rectangle via discrete rotation search. */
export function orientedBoundingRect(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  try {
    let best: GeoJSON.Feature<GeoJSON.Polygon> | null = null
    let bestArea = Number.POSITIVE_INFINITY
    for (let deg = 0; deg < 90; deg += DEG_STEP) {
      const rotated =
        deg === 0
          ? feature
          : (turf.transformRotate(feature as any, deg, { mutate: false }) as GeoJSON.Feature)
      const box = turf.bbox(rotated as any)
      const env = turf.bboxPolygon(box) as GeoJSON.Feature<GeoJSON.Polygon>
      const area = Math.abs(turf.area(env as any))
      if (!(area > 0) || area >= bestArea) continue
      bestArea = area
      best =
        deg === 0
          ? env
          : (turf.transformRotate(env as any, -deg, { mutate: false }) as GeoJSON.Feature<GeoJSON.Polygon>)
    }
    return best
  } catch {
    return null
  }
}

function ringClosed(ring: number[][]): number[][] {
  if (ring.length < 3) return ring
  const first = ring[0]!
  const last = ring[ring.length - 1]!
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, [first[0]!, first[1]!]]
}

function headingDeg(a: number[], b: number[]): number {
  const dx = (b[0] ?? 0) - (a[0] ?? 0)
  const dy = (b[1] ?? 0) - (a[1] ?? 0)
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg < 0) deg += 180
  if (deg >= 180) deg -= 180
  return deg
}

function edgeLenM(a: number[], b: number[]): number {
  try {
    return turf.distance(turf.point(a as [number, number]), turf.point(b as [number, number]), {
      units: 'meters',
    })
  } catch {
    return 0
  }
}

function normalizeHeadingFamily(deg: number): number {
  let d = deg % 180
  if (d < 0) d += 180
  if (d >= 90) d -= 90
  return d
}

function snapHeading(deg: number, principals: number[], snapTol: number): number {
  let best = deg
  let bestDelta = Infinity
  for (const p of principals) {
    for (const cand of [p, p + 90, p + 180, p + 270]) {
      let d = Math.abs(((deg - cand) % 180) + 180) % 180
      if (d > 90) d = 180 - d
      if (d < bestDelta) {
        bestDelta = d
        best = ((cand % 180) + 180) % 180
      }
    }
  }
  return bestDelta <= snapTol ? best : deg
}

/** Weighted principal headings from the longest edges (0–90° family). */
function dominantHeadings(ring: number[][], maxDirs = 2): number[] {
  const open = ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring.slice()
  if (open.length < 3) return [0]

  const buckets = new Map<number, number>()
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!
    const b = open[(i + 1) % open.length]!
    const len = edgeLenM(a, b)
    if (!(len > 0.15)) continue
    const fam = Math.round(normalizeHeadingFamily(headingDeg(a, b)) / 2) * 2
    buckets.set(fam, (buckets.get(fam) || 0) + len)
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length) return [0]
  const dirs = ranked.slice(0, maxDirs).map(([d]) => d)
  // Ensure orthogonal companion of the primary direction for field rectangles.
  const primary = dirs[0]!
  if (!dirs.some(d => Math.abs(normalizeHeadingFamily(d - (primary + 90))) < 3)) {
    dirs.push(normalizeHeadingFamily(primary + 90))
  }
  return dirs
}

/**
 * Walk the ring projecting successive vertices onto snapped edge directions
 * so boundaries become long straight cadastral segments.
 */
function snapRingToPrincipals(ring: number[][], principals: number[], snapTol: number): number[][] {
  const open = ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring.slice()
  if (open.length < 4) return ringClosed(open)

  const out: number[][] = [[open[0]![0]!, open[0]![1]!]]
  for (let i = 1; i < open.length; i++) {
    const prev = out[out.length - 1]!
    const cur = open[i]!
    const heading = snapHeading(headingDeg(prev, cur), principals, snapTol)
    const rad = (heading * Math.PI) / 180
    const dx = (cur[0] ?? 0) - (prev[0] ?? 0)
    const dy = (cur[1] ?? 0) - (prev[1] ?? 0)
    // Mid-lat meters scale for lon vs lat is imperfect but stable for short edges.
    const midLat = ((prev[1] ?? 0) + (cur[1] ?? 0)) / 2
    const mPerDegLon = Math.max(1e-6, 111_320 * Math.cos((midLat * Math.PI) / 180))
    const mPerDegLat = 111_320
    const dxM = dx * mPerDegLon
    const dyM = dy * mPerDegLat
    const ux = Math.cos(rad)
    const uy = Math.sin(rad)
    const uxM = ux * mPerDegLon
    const uyM = uy * mPerDegLat
    const uLen = Math.hypot(uxM, uyM) || 1
    const nx = uxM / uLen
    const ny = uyM / uLen
    const projM = dxM * nx + dyM * ny
    const next: number[] = [
      (prev[0] ?? 0) + (projM * nx) / mPerDegLon,
      (prev[1] ?? 0) + (projM * ny) / mPerDegLat,
    ]
    // Skip near-duplicates
    if (edgeLenM(prev, next) < 0.25 && i < open.length - 1) continue
    out.push(next)
  }

  // Drop colinear middle vertices
  const cleaned: number[][] = []
  for (let i = 0; i < out.length; i++) {
    const a = cleaned.length ? cleaned[cleaned.length - 1]! : out[(i - 1 + out.length) % out.length]!
    const b = out[i]!
    const c = out[(i + 1) % out.length]!
    if (cleaned.length === 0) {
      cleaned.push(b)
      continue
    }
    const h1 = headingDeg(a, b)
    const h2 = headingDeg(b, c)
    let d = Math.abs(h1 - h2)
    if (d > 90) d = 180 - d
    if (d <= COLINEAR_EPS_DEG && cleaned.length > 0) {
      // replace previous end with b only if last segment prolongs — skip b
      continue
    }
    cleaned.push(b)
  }
  if (cleaned.length < 3) return ringClosed(out)
  return ringClosed(cleaned)
}

/**
 * Round stair-step raster edges then snap to principal cadastral directions.
 */
export function softenFieldPolygonEdges(
  feature: GeoJSON.Feature,
  meters = KEEP_SOFTEN_M,
): GeoJSON.Feature {
  if (!(meters > 0)) return feature
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature
  try {
    const collapsed = collapseStairStepPolygon(feature)
    let working: GeoJSON.Feature = collapsed
    const origArea = Math.abs(turf.area(feature as any))
    const scale = origArea > 0 && origArea < 2_500 ? 0.45 : origArea < 8_000 ? 0.7 : 1
    const effectiveM = Math.max(1.2, meters * scale)

    const half = effectiveM * 0.55
    const dilate = turf.buffer(working as any, half, { units: 'meters' })
    if (!dilate?.geometry) return tagSoftened(collapsed, feature)
    const erode = turf.buffer(dilate as any, -half, { units: 'meters' })
    if (!erode?.geometry) return tagSoftened(collapsed, feature)
    const erode2 = turf.buffer(erode as any, -half * 0.35, { units: 'meters' })
    const dilate2 = erode2?.geometry
      ? turf.buffer(erode2 as any, half * 0.35, { units: 'meters' })
      : erode
    if (!dilate2?.geometry) return tagSoftened(collapsed, feature)

    working = {
      ...feature,
      geometry: dilate2.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    }
    working = collapseStairStepPolygon(working)

    const tol =
      origArea > 50_000
        ? 0.000055
        : origArea > 10_000
          ? 0.00004
          : origArea > 2_000
            ? 0.00003
            : 0.000022
    const simplified = turf.simplify(working as any, {
      tolerance: tol,
      highQuality: true,
    }) as GeoJSON.Feature
    if (
      !simplified?.geometry ||
      (simplified.geometry.type !== 'Polygon' && simplified.geometry.type !== 'MultiPolygon')
    ) {
      return tagSoftened(collapsed, feature)
    }

    const simpGeom = simplified.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
    const ring0 =
      simpGeom.type === 'Polygon'
        ? (simpGeom.coordinates[0] as number[][])
        : (simpGeom.coordinates[0]?.[0] as number[][] | undefined)
    const dense = Array.isArray(ring0) && ring0.length >= 10
    let use: GeoJSON.Feature = simplified
    if (dense) {
      const chaikined = chaikinSmoothPolygon(
        { ...feature, geometry: simplified.geometry },
        1,
      )
      const finalFeat = turf.simplify(chaikined as any, {
        tolerance: tol * 0.75,
        highQuality: true,
      }) as GeoJSON.Feature
      if (
        finalFeat?.geometry &&
        (finalFeat.geometry.type === 'Polygon' || finalFeat.geometry.type === 'MultiPolygon')
      ) {
        use = finalFeat
      }
    }

    const softArea = Math.abs(turf.area(use as any))
    if (!(softArea > 0) || (origArea > 0 && softArea / origArea < 0.55)) {
      return tagSoftened(collapsed, feature)
    }
    if (origArea > 0 && softArea / origArea > 1.55) {
      return tagSoftened(collapsed, feature)
    }
    return {
      ...feature,
      geometry: use.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      properties: {
        ...(feature.properties || {}),
        footprint_softened: true,
      },
    }
  } catch {
    return feature
  }
}

function tagSoftened(candidate: GeoJSON.Feature, fallback: GeoJSON.Feature): GeoJSON.Feature {
  try {
    if (
      candidate?.geometry &&
      JSON.stringify(candidate.geometry) !== JSON.stringify(fallback.geometry)
    ) {
      return {
        ...fallback,
        geometry: candidate.geometry,
        properties: {
          ...(fallback.properties || {}),
          footprint_softened: true,
        },
      }
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function axisKind(heading: number): 'h' | 'v' | null {
  let h = ((heading % 180) + 180) % 180
  const toH = Math.min(h, 180 - h)
  const toV = Math.abs(h - 90)
  if (toH <= STAIR_AXIS_TOL_DEG) return 'h'
  if (toV <= STAIR_AXIS_TOL_DEG) return 'v'
  return null
}

/**
 * Remove classic raster staircase kinks: short horizontal then vertical (or vice versa)
 * segments get replaced by a single diagonal/hinge edge.
 */
export function collapseStairStepRing(ring: number[][]): number[][] {
  const open =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring.slice()
  if (open.length < 5) return ringClosed(open)

  let pts = open.map(p => [p[0]!, p[1]!])
  // Multiple passes — stairs often stack into longer staircases.
  for (let pass = 0; pass < 4; pass++) {
    let removed = 0
    const next: number[][] = []
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n]!
      const b = pts[i]!
      const c = pts[(i + 1) % n]!
      const ab = edgeLenM(a, b)
      const bc = edgeLenM(b, c)
      const ka = axisKind(headingDeg(a, b))
      const kb = axisKind(headingDeg(b, c))
      const isStair =
        ka &&
        kb &&
        ka !== kb &&
        ab > 0.2 &&
        bc > 0.2 &&
        ab <= STAIR_EDGE_MAX_M &&
        bc <= STAIR_EDGE_MAX_M
      if (isStair) {
        // Skip corner vertex B — A→C becomes the professional edge.
        removed += 1
        continue
      }
      // Also drop near-colinear residuals
      let turn = Math.abs(headingDeg(a, b) - headingDeg(b, c))
      if (turn > 90) turn = 180 - turn
      if (turn < COLINEAR_EPS_DEG && ab < STAIR_EDGE_MAX_M && bc < STAIR_EDGE_MAX_M) {
        removed += 1
        continue
      }
      next.push(b)
    }
    if (next.length < 4) break
    pts = next
    if (!removed) break
  }
  return ringClosed(pts)
}

export function collapseStairStepPolygon(feature: GeoJSON.Feature): GeoJSON.Feature {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature
  try {
    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
    if (g.type === 'Polygon') {
      geometry = {
        type: 'Polygon',
        coordinates: g.coordinates.map((ring, i) =>
          i === 0 ? collapseStairStepRing(ring as number[][]) : ring,
        ),
      }
    } else {
      geometry = {
        type: 'MultiPolygon',
        coordinates: g.coordinates.map(poly =>
          poly.map((ring, i) => (i === 0 ? collapseStairStepRing(ring as number[][]) : ring)),
        ),
      }
    }
    const cleaned = turf.cleanCoords({
      ...feature,
      geometry,
    } as any) as GeoJSON.Feature
    return cleaned?.geometry ? cleaned : { ...feature, geometry }
  } catch {
    return feature
  }
}

/** One/few Chaikin iterations — rounds residual stair corners without ballooning area. */
function chaikinSmoothPolygon(feature: GeoJSON.Feature, iterations = 1): GeoJSON.Feature {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature
  const smoothRing = (ring: number[][]): number[][] => {
    let pts =
      ring.length > 1 &&
      ring[0]![0] === ring[ring.length - 1]![0] &&
      ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1)
        : ring.slice()
    if (pts.length < 4) return ringClosed(pts)
    for (let it = 0; it < iterations; it++) {
      const next: number[][] = []
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!
        const b = pts[(i + 1) % pts.length]!
        next.push([
          0.75 * (a[0] ?? 0) + 0.25 * (b[0] ?? 0),
          0.75 * (a[1] ?? 0) + 0.25 * (b[1] ?? 0),
        ])
        next.push([
          0.25 * (a[0] ?? 0) + 0.75 * (b[0] ?? 0),
          0.25 * (a[1] ?? 0) + 0.75 * (b[1] ?? 0),
        ])
      }
      pts = next
    }
    return ringClosed(pts)
  }
  try {
    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
    if (g.type === 'Polygon') {
      geometry = {
        type: 'Polygon',
        coordinates: g.coordinates.map((ring, i) =>
          i === 0 ? smoothRing(ring as number[][]) : ring,
        ),
      }
    } else {
      geometry = {
        type: 'MultiPolygon',
        coordinates: g.coordinates.map(poly =>
          poly.map((ring, i) => (i === 0 ? smoothRing(ring as number[][]) : ring)),
        ),
      }
    }
    return { ...feature, geometry }
  } catch {
    return feature
  }
}

/** Snap polygon rings toward long straight cadastral edges. */
export function cadastralSnapFieldPolygon(feature: GeoJSON.Feature): GeoJSON.Feature {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature
  try {
    const prepared = collapseStairStepPolygon(feature)
    const pg = prepared.geometry
    if (!pg || (pg.type !== 'Polygon' && pg.type !== 'MultiPolygon')) return feature
    const mapRing = (ring: number[][]) => {
      const principals = dominantHeadings(ring, 2)
      return snapRingToPrincipals(ring, principals, ANGLE_SNAP_DEG)
    }
    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
    if (pg.type === 'Polygon') {
      geometry = {
        type: 'Polygon',
        coordinates: pg.coordinates.map((ring, i) => (i === 0 ? mapRing(ring as number[][]) : ring)),
      }
    } else {
      geometry = {
        type: 'MultiPolygon',
        coordinates: pg.coordinates.map(poly =>
          poly.map((ring, i) => (i === 0 ? mapRing(ring as number[][]) : ring)),
        ),
      }
    }
    const next: GeoJSON.Feature = {
      ...feature,
      geometry,
      properties: {
        ...(feature.properties || {}),
        footprint_cadastral_snap: true,
      },
    }
    // Second-pass light simplify to merge residual micro-kinks.
    const simp = turf.simplify(next as any, { tolerance: 0.000018, highQuality: true }) as GeoJSON.Feature
    const origArea = Math.abs(turf.area(feature as any))
    const nextArea = Math.abs(turf.area((simp?.geometry ? simp : next) as any))
    if (!(nextArea > 0) || (origArea > 0 && nextArea / origArea < 0.6)) return feature
    if (!(nextArea > 0) || (origArea > 0 && nextArea / origArea > 1.55)) return feature
    return {
      ...(simp?.geometry ? simp : next),
      properties: {
        ...(feature.properties || {}),
        footprint_softened: true,
        footprint_cadastral_snap: true,
        footprint_method: 'cadastral',
        footprint_regularized: true,
      },
    }
  } catch {
    return feature
  }
}

/**
 * Local metric frame rotated into a parcel's own orientation, so stair-step
 * detection works on tilted farms instead of only on north-aligned ones.
 */
type ParcelFrame = { lon0: number; lat0: number; mPerDegLon: number; mPerDegLat: number }

function parcelFrame(ring: number[][]): ParcelFrame {
  let sumLon = 0
  let sumLat = 0
  let n = 0
  for (const p of ring) {
    sumLon += p[0] ?? 0
    sumLat += p[1] ?? 0
    n += 1
  }
  const lat0 = n ? sumLat / n : 0
  return {
    lon0: n ? sumLon / n : 0,
    lat0,
    mPerDegLon: Math.max(1e-6, 111_320 * Math.cos((lat0 * Math.PI) / 180)),
    mPerDegLat: 111_320,
  }
}

function rotateXy(p: XY, rad: number): XY {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]
}

type XY = [number, number]

/** Length-weighted dominant orientation in the 90° family, from metric edges. */
function dominantOrientationRad(pts: XY[]): number {
  let sx = 0
  let sy = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (!(len > 0.15)) continue
    // ×4 wraps the 90° family onto a full turn so the circular mean is stable.
    const a4 = 4 * Math.atan2(dy, dx)
    sx += len * Math.cos(a4)
    sy += len * Math.sin(a4)
  }
  if (sx === 0 && sy === 0) return 0
  return Math.atan2(sy, sx) / 4
}

/** One axis-parallel side of a rectilinear parcel. */
type RectRun = { axis: 'H' | 'V'; value: number; weight: number }

function buildRectRuns(pts: XY[]): RectRun[] | null {
  const n = pts.length
  if (n < 4) return null
  const edges: Array<{ axis: 'H' | 'V'; perp: number; len: number }> = []
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % n]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (!(len > 0)) continue
    const axis: 'H' | 'V' = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V'
    edges.push({ axis, perp: axis === 'H' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2, len })
  }
  const m = edges.length
  if (m < 4) return null
  // Start on a run boundary so the last run never wraps into the first.
  let start = -1
  for (let i = 0; i < m; i++) {
    if (edges[i]!.axis !== edges[(i - 1 + m) % m]!.axis) {
      start = i
      break
    }
  }
  if (start < 0) return null
  const runs: RectRun[] = []
  for (let k = 0; k < m; k++) {
    const e = edges[(start + k) % m]!
    const last = runs[runs.length - 1]
    if (last && last.axis === e.axis) {
      const weight = last.weight + e.len
      last.value = (last.value * last.weight + e.perp * e.len) / weight
      last.weight = weight
    } else {
      runs.push({ axis: e.axis, value: e.perp, weight: e.len })
    }
  }
  if (runs.length < 4 || runs.length % 2 !== 0) return null
  return runs
}

/**
 * Drop sides shorter than the stair threshold. Removing a side merges its two
 * same-axis neighbours into one long straight edge — this is what erases the
 * raster staircase while keeping true corners.
 */
function pruneShortRuns(runs: RectRun[], minSegmentM: number): RectRun[] {
  let cur = runs.slice()
  for (let guard = 0; guard < 512 && cur.length > 4; guard++) {
    const len = cur.length
    let worst = -1
    let worstSpan = Infinity
    for (let i = 0; i < len; i++) {
      const prev = cur[(i - 1 + len) % len]!
      const next = cur[(i + 1) % len]!
      const span = Math.abs(next.value - prev.value)
      if (span < worstSpan) {
        worstSpan = span
        worst = i
      }
    }
    if (worst < 0 || worstSpan >= minSegmentM) break
    const prevIdx = (worst - 1 + len) % len
    const nextIdx = (worst + 1) % len
    const prev = cur[prevIdx]!
    const next = cur[nextIdx]!
    const weight = prev.weight + next.weight
    const merged: RectRun = {
      axis: prev.axis,
      value: (prev.value * prev.weight + next.value * next.weight) / weight,
      weight,
    }
    const out: RectRun[] = []
    for (let i = 0; i < len; i++) {
      if (i === worst || i === nextIdx) continue
      out.push(i === prevIdx ? merged : cur[i]!)
    }
    cur = out
  }
  return cur
}

/** Corner at the end of each run — alternating axes close the ring exactly. */
function runsToRing(runs: RectRun[]): XY[] | null {
  const len = runs.length
  if (len < 4 || len % 2 !== 0) return null
  const pts: XY[] = []
  for (let i = 0; i < len; i++) {
    const cur = runs[i]!
    const next = runs[(i + 1) % len]!
    if (cur.axis === next.axis) return null
    pts.push([
      cur.axis === 'V' ? cur.value : next.value,
      cur.axis === 'H' ? cur.value : next.value,
    ])
  }
  return pts
}

function ringAreaM2(pts: XY[]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(sum) / 2
}

/**
 * Rebuild one ring as a closed right-angle parcel (ArcGIS "regularize building
 * footprint" style). Returns null when the shape is not rectilinear enough.
 */
function rightAngleRing(ring: number[][], minSegmentM: number): number[][] | null {
  const closed = ringClosed(ring)
  const open = closed.slice(0, -1)
  if (open.length < 4) return null
  const frame = parcelFrame(open)
  const east: XY[] = open.map(p => [
    ((p[0] ?? 0) - frame.lon0) * frame.mPerDegLon,
    ((p[1] ?? 0) - frame.lat0) * frame.mPerDegLat,
  ])
  const theta = dominantOrientationRad(east)
  const local = east.map(p => rotateXy(p, -theta))
  const runs = buildRectRuns(local)
  if (!runs) return null
  const pruned = pruneShortRuns(runs, minSegmentM)
  const rect = runsToRing(pruned)
  if (!rect) return null
  const sourceArea = ringAreaM2(local)
  const rectArea = ringAreaM2(rect)
  if (!(rectArea > 0) || !(sourceArea > 0)) return null
  const ratio = rectArea / sourceArea
  if (ratio < RIGHT_ANGLE_MIN_AREA_RATIO || ratio > RIGHT_ANGLE_MAX_AREA_RATIO) return null
  const out = rect.map(p => {
    const back = rotateXy(p, theta)
    return [frame.lon0 + back[0] / frame.mPerDegLon, frame.lat0 + back[1] / frame.mPerDegLat]
  })
  return ringClosed(out)
}

/** Stair threshold scales with parcel size but stays in a sane metre band. */
function stairThresholdM(areaM2: number, override?: number): number {
  if (override != null && override > 0) return override
  const nominal = Math.sqrt(Math.max(areaM2, 1)) * 0.06
  return Math.min(RIGHT_ANGLE_MAX_SEGMENT_M, Math.max(RIGHT_ANGLE_MIN_SEGMENT_M, nominal))
}

/**
 * Regularize a parcel into straight, right-angled cadastral edges.
 * Polygons with holes and non-rectilinear parcels are left to the caller.
 */
export function rightAngleRegularizePolygon(
  feature: GeoJSON.Feature,
  opts?: { minSegmentMeters?: number },
): GeoJSON.Feature | null {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  try {
    const areaM2 = Math.abs(turf.area(feature as any))
    if (!(areaM2 > 0)) return null
    const minSegmentM = stairThresholdM(areaM2, opts?.minSegmentMeters)

    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
    if (g.type === 'Polygon') {
      if (g.coordinates.length > 1) return null
      const ring = rightAngleRing(g.coordinates[0] as number[][], minSegmentM)
      if (!ring) return null
      geometry = { type: 'Polygon', coordinates: [ring] }
    } else {
      const parts: number[][][][] = []
      let changed = false
      for (const poly of g.coordinates) {
        if (poly.length > 1) {
          parts.push(poly as number[][][])
          continue
        }
        const ring = rightAngleRing(poly[0] as number[][], minSegmentM)
        if (!ring) {
          parts.push(poly as number[][][])
          continue
        }
        changed = true
        parts.push([ring])
      }
      if (!changed) return null
      geometry = { type: 'MultiPolygon', coordinates: parts }
    }

    const next: GeoJSON.Feature = { ...feature, geometry }
    // A pruned ring can fold back on itself — reject rather than emit a bowtie.
    if ((turf.kinks(next as any)?.features?.length || 0) > 0) return null
    return {
      ...next,
      properties: {
        ...(feature.properties || {}),
        footprint_regularized: true,
        footprint_method: 'right-angles',
        footprint_softened: true,
        footprint_cadastral_snap: true,
        footprint_min_segment_m: Math.round(minSegmentM * 10) / 10,
      },
    }
  } catch {
    return null
  }
}

/**
 * Rebuild a ring so every edge heading snaps to a multiple of `stepDeg`
 * (90 → Right Angles, 45 → Right Angles and Diagonals), in the parcel's own
 * orientation. Returns null when the rebuild moves too much area.
 */
function angleSnapRing(ring: number[][], stepDeg: number): number[][] | null {
  const closed = ringClosed(ring)
  const open = closed.slice(0, -1)
  if (open.length < 4) return null
  const frame = parcelFrame(open)
  const east: XY[] = open.map(p => [
    ((p[0] ?? 0) - frame.lon0) * frame.mPerDegLon,
    ((p[1] ?? 0) - frame.lat0) * frame.mPerDegLat,
  ])
  const theta = dominantOrientationRad(east)
  const local = east.map(p => rotateXy(p, -theta))
  const simplified = douglasPeuckerXy(local, Math.max(4, STAIR_FREE_TOL_M * 0.85))
  if (simplified.length < 3) return null

  const stepRad = (stepDeg * Math.PI) / 180
  const rebuilt: XY[] = [simplified[0]!]
  for (let i = 0; i < simplified.length; i++) {
    const a = simplified[i]!
    const b = simplified[(i + 1) % simplified.length]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (!(len > 0.5)) continue
    const heading = Math.atan2(dy, dx)
    const snapped = Math.round(heading / stepRad) * stepRad
    const prev = rebuilt[rebuilt.length - 1]!
    rebuilt.push([prev[0] + Math.cos(snapped) * len, prev[1] + Math.sin(snapped) * len])
  }
  if (rebuilt.length < 4) return null
  // Close: pull the open tip back onto the start without inventing a spike.
  const tip = rebuilt[rebuilt.length - 1]!
  const start = rebuilt[0]!
  const closeDist = Math.hypot(tip[0] - start[0], tip[1] - start[1])
  if (closeDist > 0.75) {
    rebuilt[rebuilt.length - 1] = start
  } else {
    rebuilt[rebuilt.length - 1] = start
  }
  // Drop the duplicate closing vertex for area calc, then re-close.
  const body = rebuilt.slice(0, -1)
  if (body.length < 3) return null
  const sourceArea = ringAreaM2(local)
  const nextArea = ringAreaM2(body)
  if (!(sourceArea > 0) || !(nextArea > 0)) return null
  const ratio = nextArea / sourceArea
  if (ratio < ANGLE_REBUILD_MIN_AREA_RATIO || ratio > ANGLE_REBUILD_MAX_AREA_RATIO) return null

  const out = body.map(p => {
    const back = rotateXy(p, theta)
    return [frame.lon0 + back[0] / frame.mPerDegLon, frame.lat0 + back[1] / frame.mPerDegLat]
  })
  return ringClosed(out)
}

/** Douglas–Peucker on a metric ring (open or closed). */
function douglasPeuckerXy(pts: XY[], tolM: number): XY[] {
  if (pts.length < 3 || !(tolM > 0)) return pts.slice()
  const closed =
    pts.length > 1 &&
    Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 1e-6
  const open = closed ? pts.slice(0, -1) : pts.slice()
  if (open.length < 3) return pts.slice()

  const keep = new Array(open.length).fill(false)
  keep[0] = true
  keep[open.length - 1] = true
  const stack: Array<[number, number]> = [[0, open.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    const a = open[i]!
    const b = open[j]!
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const abLen = Math.hypot(abx, aby) || 1
    let bestIdx = -1
    let bestDist = 0
    for (let k = i + 1; k < j; k++) {
      const p = open[k]!
      const dist = Math.abs(abx * (a[1] - p[1]) - aby * (a[0] - p[0])) / abLen
      if (dist > bestDist) {
        bestDist = dist
        bestIdx = k
      }
    }
    if (bestIdx >= 0 && bestDist > tolM) {
      keep[bestIdx] = true
      stack.push([i, bestIdx], [bestIdx, j])
    }
  }
  const out = open.filter((_, idx) => keep[idx])
  // Closed rings need the first vertex repeated by the caller.
  return out.length >= 3 ? out : open
}

function rebuildPolygonWithRing(
  feature: GeoJSON.Feature,
  ring: number[][],
  method: string,
): GeoJSON.Feature | null {
  const next: GeoJSON.Feature = {
    ...feature,
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
  if ((turf.kinks(next as any)?.features?.length || 0) > 0) return null
  return {
    ...next,
    properties: {
      ...(feature.properties || {}),
      footprint_regularized: true,
      footprint_method: method,
      footprint_softened: true,
      footprint_cadastral_snap: true,
    },
  }
}

/**
 * Right Angles and Diagonals — adjoining edges at 45° or 90°.
 * Falls back to pure right-angles when the diagonal rebuild is unstable.
 */
export function rightAngleDiagonalRegularizePolygon(
  feature: GeoJSON.Feature,
): GeoJSON.Feature | null {
  const g = feature.geometry
  if (!g || g.type !== 'Polygon' || g.coordinates.length > 1) {
    return rightAngleRegularizePolygon(feature)
  }
  try {
    const ring = angleSnapRing(g.coordinates[0] as number[][], 45)
    if (!ring) return rightAngleRegularizePolygon(feature)
    const rebuilt = rebuildPolygonWithRing(feature, ring, 'right-angles-and-diagonals')
    return rebuilt ?? rightAngleRegularizePolygon(feature)
  } catch {
    return rightAngleRegularizePolygon(feature)
  }
}

/**
 * Any Angles — collapse stairs into the longest straight edges at any heading
 * (Douglas–Peucker in metres), without forcing 45°/90° corners.
 */
export function anyAngleRegularizePolygon(feature: GeoJSON.Feature): GeoJSON.Feature | null {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  try {
    const areaM2 = Math.abs(turf.area(feature as any))
    if (!(areaM2 > 0)) return null
    const tol = Math.min(
      28,
      Math.max(ANY_ANGLE_TOL_M, Math.sqrt(areaM2) * 0.045),
    )
    const simplified = stairFreeSimplify(feature, tol)
    if (countVertices(simplified) >= countVertices(feature)) return null
    const nextArea = Math.abs(turf.area(simplified as any))
    const ratio = nextArea / areaM2
    if (ratio < ANGLE_REBUILD_MIN_AREA_RATIO || ratio > ANGLE_REBUILD_MAX_AREA_RATIO) return null
    if ((turf.kinks(simplified as any)?.features?.length || 0) > 0) return null
    return {
      ...simplified,
      properties: {
        ...(feature.properties || {}),
        footprint_regularized: true,
        footprint_method: 'any-angles',
        footprint_softened: true,
        footprint_stair_collapse_m: Math.round(tol * 10) / 10,
      },
    }
  } catch {
    return null
  }
}

/** Circle — best fitting circle (same path as centre-pivot detection, forced). */
export function circleRegularizePolygon(feature: GeoJSON.Feature): GeoJSON.Feature | null {
  try {
    const fit = pivotCircleFit(feature) || provenRoundCircleFit(feature) || equalAreaCircleFit(feature)
    if (!fit) return null
    return pivotCircleFootprint(feature, fit)
  } catch {
    return null
  }
}

function equalAreaCircleFit(feature: GeoJSON.Feature): PivotCircleFit | null {
  try {
    const area = Math.abs(turf.area(feature as any))
    if (!(area > 0)) return null
    const coords = turf.centerOfMass(feature as any)?.geometry?.coordinates as
      | number[]
      | undefined
    if (!coords || coords.length < 2) return null
    const centre: [number, number] = [Number(coords[0]), Number(coords[1])]
    const radiusM = Math.sqrt(area / Math.PI)
    if (!(radiusM > 1)) return null
    const circle = circleAt(centre, radiusM)
    if (!circle) return null
    return (
      scoreCircleFit(feature, circle, centre, radiusM) ?? {
        circle,
        centre,
        radiusM,
        coverage: 0,
        iou: 0,
      }
    )
  } catch {
    return null
  }
}

/** Polsby–Popper circularity: 1.0 for a circle, at most π/4 ≈ 0.785 for a rectangle. */
export function footprintCircularity(feature: GeoJSON.Feature): number {
  try {
    const area = Math.abs(turf.area(feature as any))
    if (!(area > 0)) return 0
    const perimeter = turf.length(turf.polygonToLine(feature as any) as any, { units: 'meters' })
    if (!(perimeter > 0)) return 0
    return (4 * Math.PI * area) / (perimeter * perimeter)
  } catch {
    return 0
  }
}

function outerRingOf(feature: GeoJSON.Feature): number[][] | null {
  const g = feature.geometry
  if (!g || g.type !== 'Polygon') return null
  const ring = g.coordinates?.[0] as number[][] | undefined
  if (!Array.isArray(ring) || ring.length < 4) return null
  return ring
}

/** Fraction of ring vertices sitting on a single radius around the centre of mass. */
function radialUniformity(feature: GeoJSON.Feature, ring: number[][]): number | null {
  try {
    const center = turf.centerOfMass(feature as any)
    if (!center?.geometry) return null
    const open = ringClosed(ring).slice(0, -1)
    if (open.length < PIVOT_MIN_RING_VERTICES) return null
    const radii: number[] = []
    for (const p of open) {
      const d = turf.distance(center, turf.point([p[0]!, p[1]!]), { units: 'meters' })
      if (Number.isFinite(d) && d > 0) radii.push(d)
    }
    if (radii.length < PIVOT_MIN_RING_VERTICES) return null
    const median = [...radii].sort((a, b) => a - b)[Math.floor(radii.length / 2)]!
    if (!(median > 0)) return null
    const onRadius = radii.filter(r => Math.abs(r - median) / median <= PIVOT_RADIAL_TOL).length
    return onRadius / radii.length
  } catch {
    return null
  }
}

/** Perimeter samples of a ring in a local metric frame (origin = frame centre). */
function sampleRingMetres(ring: number[][], frame: ParcelFrame, stepM: number): XY[] {
  const pts: XY[] = ringClosed(ring).map(p => [
    ((p[0] ?? 0) - frame.lon0) * frame.mPerDegLon,
    ((p[1] ?? 0) - frame.lat0) * frame.mPerDegLat,
  ])
  const out: XY[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(0.5, stepM)))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      out.push([a[0] + dx * t, a[1] + dy * t])
    }
  }
  return out
}

function pointInRing(ring: XY[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]
    const yi = ring[i]![1]
    const xj = ring[j]![0]
    const yj = ring[j]![1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distanceToRing(ring: XY[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j]![0]
    const ay = ring[j]![1]
    const bx = ring[i]![0]
    const by = ring[i]![1]
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((x - ax) * dx + (y - ay) * dy) / lenSq : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
    if (d < best) best = d
  }
  return best
}

/**
 * Largest circle that fits inside the ring (grid search, then local refinement).
 * For a pivot fused to a strip or clipped by a road this lands on the irrigation
 * centre, where the centre of mass would be dragged into the appendage.
 */
function maxInscribedCircle(ring: XY[]): { cx: number; cy: number; r: number } | null {
  if (ring.length < 4) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const width = maxX - minX
  const height = maxY - minY
  if (!(width > 0) || !(height > 0)) return null

  let step = Math.max(width, height) / 16
  let best: { cx: number; cy: number; r: number } | null = null
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      if (!pointInRing(ring, x, y)) continue
      const r = distanceToRing(ring, x, y)
      if (!best || r > best.r) best = { cx: x, cy: y, r }
    }
  }
  if (!best) return null

  for (let pass = 0; pass < 5; pass++) {
    step /= 3
    let local = best
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (!dx && !dy) continue
        const x = best.cx + dx * step
        const y = best.cy + dy * step
        if (!pointInRing(ring, x, y)) continue
        const r = distanceToRing(ring, x, y)
        if (r > local.r) local = { cx: x, cy: y, r }
      }
    }
    best = local
  }
  return best
}

/**
 * Max ring radius per bearing bin around a robustly fitted centre. A pivot holds
 * one radius across most bearings even with an appendage; a rectangle sweeps
 * radii from a to a√2 and holds its median over only ≈40% of the bearings.
 */
type RadialProfile = { medianRadiusM: number; onRadiusShare: number; centre: [number, number] }

function radialProfileOf(_feature: GeoJSON.Feature, ring: number[][]): RadialProfile | null {
  try {
    const frame = parcelFrame(ring)
    const closed = ringClosed(ring)
    if (closed.length < 5) return null
    let perimeter = 0
    for (let i = 0; i < closed.length - 1; i++) {
      perimeter += edgeLenM(closed[i]!, closed[i + 1]!)
    }
    if (!(perimeter > 0)) return null

    const samples = sampleRingMetres(ring, frame, perimeter / (PIVOT_PROFILE_BINS * 4))
    if (samples.length < PIVOT_MIN_RING_VERTICES) return null
    const fit = maxInscribedCircle(samples)
    if (!fit || !(fit.r > 0)) return null

    const bins = new Array<number>(PIVOT_PROFILE_BINS).fill(0)
    for (const [x, y] of samples) {
      const dx = x - fit.cx
      const dy = y - fit.cy
      const r = Math.hypot(dx, dy)
      if (!(r > 0)) continue
      let ang = Math.atan2(dy, dx)
      if (ang < 0) ang += Math.PI * 2
      const bin = Math.min(
        PIVOT_PROFILE_BINS - 1,
        Math.floor((ang / (Math.PI * 2)) * PIVOT_PROFILE_BINS),
      )
      if (r > bins[bin]!) bins[bin] = r
    }

    const filled = bins.filter(r => r > 0)
    // A ring that leaves bearings empty does not wrap the centre — not a pivot.
    if (filled.length < PIVOT_PROFILE_BINS * 0.85) return null
    const median = [...filled].sort((a, b) => a - b)[Math.floor(filled.length / 2)]!
    if (!(median > 0)) return null
    const onRadius = filled.filter(r => Math.abs(r - median) / median <= PIVOT_PROFILE_TOL).length
    return {
      medianRadiusM: median,
      onRadiusShare: onRadius / filled.length,
      centre: [
        frame.lon0 + fit.cx / frame.mPerDegLon,
        frame.lat0 + fit.cy / frame.mPerDegLat,
      ],
    }
  } catch {
    return null
  }
}

/**
 * `circle` — a centre pivot that can be redrawn as a clean circle.
 * `round`  — round enough that squaring or edge-snapping would deform it.
 */
export type PivotFootprintKind = 'circle' | 'round' | null

export function classifyPivotFootprint(feature: GeoJSON.Feature): PivotFootprintKind {
  if (pivotCircleFit(feature)) return 'circle'
  return footprintCircularity(feature) >= PIVOT_ROUND_GUARD ? 'round' : null
}

export type PivotCircleFit = {
  circle: GeoJSON.Feature<GeoJSON.Polygon>
  centre: [number, number]
  radiusM: number
  /** Share of the fitted circle covered by the parcel. */
  coverage: number
  iou: number
}

function circleAt(centre: [number, number], radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> | null {
  try {
    if (!(radiusM > 0)) return null
    const circle = turf.circle(turf.point(centre) as any, radiusM, {
      steps: PIVOT_CIRCLE_STEPS,
      units: 'meters',
    }) as GeoJSON.Feature<GeoJSON.Polygon>
    return circle?.geometry ? circle : null
  } catch {
    return null
  }
}

function scoreCircleFit(
  feature: GeoJSON.Feature,
  circle: GeoJSON.Feature<GeoJSON.Polygon>,
  centre: [number, number],
  radiusM: number,
): PivotCircleFit | null {
  try {
    const areaA = Math.abs(turf.area(feature as any))
    const areaB = Math.abs(turf.area(circle as any))
    if (!(areaA > 0) || !(areaB > 0)) return null
    const inter = turf.intersect(turf.featureCollection([feature as any, circle as any]))
    const overlap = inter?.geometry ? Math.abs(turf.area(inter as any)) : 0
    if (!(overlap > 0)) return null
    const union = areaA + areaB - overlap
    return {
      circle,
      centre,
      radiusM,
      coverage: overlap / areaB,
      iou: union > 0 ? overlap / union : 0,
    }
  } catch {
    return null
  }
}

/**
 * Largest polygon part of a parcel. A pivot traced as a circle plus a detached
 * pixel speck arrives as a MultiPolygon, which every ring-based pivot test used
 * to reject outright — leaving the circle to be squared by the OBB path.
 */
function largestPolygonPart(feature: GeoJSON.Feature): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const g = feature.geometry
  if (!g) return null
  if (g.type === 'Polygon') {
    return outerRingOf(feature) ? (feature as GeoJSON.Feature<GeoJSON.Polygon>) : null
  }
  if (g.type !== 'MultiPolygon') return null
  try {
    let best: GeoJSON.Feature<GeoJSON.Polygon> | null = null
    let bestArea = 0
    let total = 0
    for (const rings of g.coordinates || []) {
      if (!Array.isArray(rings?.[0]) || rings[0]!.length < 4) continue
      const part = turf.polygon(rings as any) as GeoJSON.Feature<GeoJSON.Polygon>
      const area = Math.abs(turf.area(part as any))
      if (!(area > 0)) continue
      total += area
      if (area > bestArea) {
        bestArea = area
        best = { ...part, properties: { ...(feature.properties || {}) } }
      }
    }
    if (!best || !(total > 0)) return null
    // Two genuine halves are not a pivot with a speck — leave them alone.
    return bestArea / total >= PIVOT_MAIN_PART_MIN_SHARE ? best : null
  } catch {
    return null
  }
}

/** Short/long side ratio of an oriented bounding rectangle (1.0 = square). */
function rectSquareness(rect: GeoJSON.Feature<GeoJSON.Polygon>): number | null {
  const ring = rect.geometry?.coordinates?.[0] as number[][] | undefined
  if (!Array.isArray(ring) || ring.length < 4) return null
  const a = edgeLenM(ring[0]!, ring[1]!)
  const b = edgeLenM(ring[1]!, ring[2]!)
  if (!(a > 0) || !(b > 0)) return null
  return Math.min(a, b) / Math.max(a, b)
}

/**
 * Pivot fit from the min-area rectangle. Area ratios survive the pixel stairs,
 * centre holes and clipped edges that push circularity and the bearing profile
 * below their gates, so a jagged pivot is still redrawn as a circle instead of
 * being squared into its own bounding box.
 */
function pivotObbCircleFit(feature: GeoJSON.Feature<GeoJSON.Polygon>): PivotCircleFit | null {
  try {
    const rect = orientedBoundingRect(feature)
    if (!rect?.geometry) return null
    const area = Math.abs(turf.area(feature as any))
    const rectArea = Math.abs(turf.area(rect as any))
    if (!(area > 0) || !(rectArea > 0)) return null
    const fill = area / rectArea
    if (fill < PIVOT_OBB_FILL_MIN || fill > PIVOT_OBB_FILL_MAX) return null
    const squareness = rectSquareness(rect)
    if (squareness == null || squareness < PIVOT_OBB_MIN_SQUARENESS) return null

    const ring = rect.geometry.coordinates?.[0] as number[][] | undefined
    if (!Array.isArray(ring) || ring.length < 4) return null
    const shortSideM = Math.min(edgeLenM(ring[0]!, ring[1]!), edgeLenM(ring[1]!, ring[2]!))
    const centreCoords = turf.center(rect as any)?.geometry?.coordinates as number[] | undefined
    if (centreCoords?.length !== 2) return null
    const centre: [number, number] = [centreCoords[0]!, centreCoords[1]!]

    const radii = [shortSideM / 2, Math.sqrt(area / Math.PI)].filter(r => r > 0)
    const fits: PivotCircleFit[] = []
    for (const radiusM of radii) {
      const circle = circleAt(centre, radiusM)
      if (!circle) continue
      const fit = scoreCircleFit(feature, circle, centre, radiusM)
      if (fit) fits.push(fit)
    }
    const best = fits
      .filter(f => f.coverage >= PIVOT_OBB_MIN_COVERAGE)
      .sort((a, b) => b.iou - a.iou)[0]
    return best && best.iou >= PIVOT_OBB_MIN_IOU ? best : null
  } catch {
    return null
  }
}

/**
 * Circle to draw when the parcel is a centre pivot. Three paths:
 * clean pivots match an equal-area circle outright; pivots fused to a corner
 * strip keep one radius across most bearings, so the median-radius circle wins
 * while the coverage gate stops squares from sneaking through; and pivots too
 * jagged or too clipped for either test are caught by the bounding-rectangle fit.
 */
export function pivotCircleFit(feature: GeoJSON.Feature): PivotCircleFit | null {
  const main = largestPolygonPart(feature)
  if (!main) return null
  const ring = outerRingOf(main)
  if (!ring) return null

  let equalArea: PivotCircleFit | null = null
  try {
    const areaM2 = Math.abs(turf.area(main as any))
    const centre = turf.centerOfMass(main as any)?.geometry?.coordinates as number[] | undefined
    if (areaM2 > 0 && centre?.length === 2) {
      const c: [number, number] = [centre[0]!, centre[1]!]
      const radiusM = Math.sqrt(areaM2 / Math.PI)
      const circle = circleAt(c, radiusM)
      if (circle) equalArea = scoreCircleFit(main, circle, c, radiusM)
    }
  } catch {
    equalArea = null
  }

  const legacyShare = radialUniformity(main, ring)
  if (legacyShare != null && legacyShare >= PIVOT_MIN_RADIAL_SHARE) {
    if (equalArea && equalArea.iou >= PIVOT_MIN_CIRCLE_IOU) return equalArea
  }

  // Cheap gates before the inscribed-circle search: a parcel this ragged or this
  // far from any circle cannot be a pivot with an appendage.
  if (!equalArea || equalArea.iou < PIVOT_SEARCH_MIN_IOU) return pivotObbCircleFit(main)
  if (footprintCircularity(main) < PIVOT_SEARCH_MIN_CIRCULARITY) return pivotObbCircleFit(main)

  const profile = radialProfileOf(main, ring)
  if (!profile || profile.onRadiusShare < PIVOT_MIN_PROFILE_SHARE) return pivotObbCircleFit(main)
  const medianCircle = circleAt(profile.centre, profile.medianRadiusM)
  const median = medianCircle
    ? scoreCircleFit(main, medianCircle, profile.centre, profile.medianRadiusM)
    : null
  const candidates = [median, equalArea].filter((f): f is PivotCircleFit => f != null)
  const usable = candidates.filter(f => f.coverage >= PIVOT_MIN_CIRCLE_COVERAGE)
  const best = (usable.length ? usable : []).sort((a, b) => b.iou - a.iou)[0]
  if (best && best.iou >= PIVOT_MIN_CIRCLE_IOU_TAIL) return best
  return pivotObbCircleFit(main)
}

/** Redraw a detected pivot as a clean, closed circle (tails and bites removed). */
function pivotCircleFootprint(
  feature: GeoJSON.Feature,
  fit: PivotCircleFit,
): GeoJSON.Feature | null {
  if (!fit.circle?.geometry) return null
  return {
    ...feature,
    type: 'Feature',
    geometry: fit.circle.geometry,
    properties: {
      ...(feature.properties || {}),
      footprint_regularized: true,
      footprint_method: 'pivot-circle',
      field_shape: 'pivot',
      pivot_radius_m: Math.round(fit.radiusM * 100) / 100,
      pivot_centre: [
        Math.round(fit.centre[0] * 1e7) / 1e7,
        Math.round(fit.centre[1] * 1e7) / 1e7,
      ],
      pivot_circle_iou: Math.round(fit.iou * 1000) / 1000,
    },
  }
}

function countVertices(feature: GeoJSON.Feature): number {
  const g = feature.geometry
  if (g?.type === 'Polygon') {
    return (g.coordinates as number[][][]).reduce((n, ring) => n + ring.length, 0)
  }
  if (g?.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).reduce(
      (n, rings) => n + rings.reduce((m, ring) => m + ring.length, 0),
      0,
    )
  }
  return 0
}

/**
 * Circle fit for parcels circularity already proved round. Same candidates as
 * the main fit, judged against the relaxed gates.
 */
function provenRoundCircleFit(feature: GeoJSON.Feature): PivotCircleFit | null {
  const main = largestPolygonPart(feature)
  if (!main) return null
  const ring = outerRingOf(main)
  if (!ring) return null

  const fits: PivotCircleFit[] = []
  try {
    const areaM2 = Math.abs(turf.area(main as any))
    const centre = turf.centerOfMass(main as any)?.geometry?.coordinates as number[] | undefined
    if (areaM2 > 0 && centre?.length === 2) {
      const c: [number, number] = [centre[0]!, centre[1]!]
      const radiusM = Math.sqrt(areaM2 / Math.PI)
      const circle = circleAt(c, radiusM)
      const fit = circle ? scoreCircleFit(main, circle, c, radiusM) : null
      if (fit) fits.push(fit)
    }
  } catch {
    /* equal-area candidate unavailable */
  }
  const profile = radialProfileOf(main, ring)
  if (profile) {
    const circle = circleAt(profile.centre, profile.medianRadiusM)
    const fit = circle ? scoreCircleFit(main, circle, profile.centre, profile.medianRadiusM) : null
    if (fit) fits.push(fit)
  }

  const best = fits
    .filter(f => f.coverage >= PIVOT_ROUND_MIN_CIRCLE_COVERAGE)
    .sort((a, b) => b.iou - a.iou)[0]
  return best && best.iou >= PIVOT_ROUND_MIN_CIRCLE_IOU ? best : null
}

/**
 * Douglas–Peucker in local metres. Simplifying in degrees would apply a
 * different tolerance along latitude than longitude; projecting first keeps the
 * 7 m step honest in both directions.
 */
export function stairFreeSimplify(
  feature: GeoJSON.Feature,
  toleranceM: number = STAIR_FREE_TOL_M,
): GeoJSON.Feature {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature
  if (!(toleranceM > 0)) return feature

  try {
    const origin = turf.centerOfMass(feature as any)?.geometry?.coordinates as number[] | undefined
    if (origin?.length !== 2) return feature
    const lon0 = origin[0]!
    const lat0 = origin[1]!
    const mPerDegLat = 110_574
    const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180)
    if (!(mPerDegLon > 1)) return feature

    const toM = (c: number[]): number[] => [
      (c[0]! - lon0) * mPerDegLon,
      (c[1]! - lat0) * mPerDegLat,
    ]
    const toDeg = (c: number[]): number[] => [
      lon0 + c[0]! / mPerDegLon,
      lat0 + c[1]! / mPerDegLat,
    ]
    const mapRings = (rings: number[][][], fn: (c: number[]) => number[]) =>
      rings.map(ring => ring.map(fn))

    const projected: GeoJSON.Geometry =
      g.type === 'Polygon'
        ? { type: 'Polygon', coordinates: mapRings(g.coordinates as number[][][], toM) }
        : {
            type: 'MultiPolygon',
            coordinates: (g.coordinates as number[][][][]).map(rings => mapRings(rings, toM)),
          }

    const simplified = turf.simplify({ type: 'Feature', properties: {}, geometry: projected } as any, {
      tolerance: toleranceM,
      highQuality: true,
    }) as GeoJSON.Feature
    const sg = simplified?.geometry
    if (!sg || (sg.type !== 'Polygon' && sg.type !== 'MultiPolygon')) return feature

    const restored: GeoJSON.Geometry =
      sg.type === 'Polygon'
        ? { type: 'Polygon', coordinates: mapRings(sg.coordinates as number[][][], toDeg) }
        : {
            type: 'MultiPolygon',
            coordinates: (sg.coordinates as number[][][][]).map(rings => mapRings(rings, toDeg)),
          }

    const next: GeoJSON.Feature = { ...feature, geometry: restored }
    const origArea = Math.abs(turf.area(feature as any))
    const nextArea = Math.abs(turf.area(next as any))
    if (!(origArea > 0) || !(nextArea > 0)) return feature
    if (Math.abs(nextArea - origArea) / origArea > STAIR_FREE_AREA_TOL) return feature
    return next
  } catch {
    return feature
  }
}

function resolveRegularizeMethod(opts?: RegularizeFootprintOptions): FootprintRegularizeMethod {
  if (opts?.method) return opts.method
  // Legacy flag: rightAngles === false → any-angles (soften / DP only).
  if (opts?.rightAngles === false) return 'any-angles'
  return 'right-angles'
}

/**
 * Apply the selected Regularize Building Footprint method, then fall back to
 * OBB / soften / stair collapse. Centre pivots stay circular unless `circle`
 * is forced for every parcel.
 */
export function regularizePolygonFootprint(
  feature: GeoJSON.Feature,
  opts?: RegularizeFootprintOptions,
): GeoJSON.Feature {
  const maxInflation = opts?.maxAreaInflation ?? MAX_AREA_INFLATION
  const minFill = opts?.minFillRatio ?? MIN_FILL_RATIO
  const allowEnvelope = opts?.allowEnvelopeFallback === true
  const softenKept = opts?.softenKept !== false
  const softenM = opts?.softenMeters ?? KEEP_SOFTEN_M
  const cadastralSnap = opts?.cadastralSnap !== false
  const method = resolveRegularizeMethod(opts)
  const pivotAware = opts?.pivotAware !== false && method !== 'circle'
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature

  const src: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: 'Feature',
    properties: { ...(feature.properties || {}) },
    geometry: g,
  }

  if (method === 'circle') {
    const forced = circleRegularizePolygon(src)
    if (forced) return forced
  }

  if (pivotAware) {
    const fit = pivotCircleFit(src)
    if (fit) {
      const circle = pivotCircleFootprint(feature, fit)
      if (circle) return circle
    }
    if (footprintCircularity(src) >= PIVOT_ROUND_GUARD) {
      const relaxed = provenRoundCircleFit(src)
      if (relaxed) {
        const circle = pivotCircleFootprint(feature, relaxed)
        if (circle) return circle
      }
      // Round parcel — soften raster stairs, but never square or edge-snap it.
      const round: GeoJSON.Feature = {
        ...feature,
        properties: {
          ...(feature.properties || {}),
          footprint_regularized: false,
          footprint_method: 'pivot-round',
          field_shape: 'pivot',
        },
      }
      return softenKept ? softenFieldPolygonEdges(round, softenM) : round
    }
  }

  // ArcGIS-style rebuild BEFORE OBB: an oriented box overshoots paths and
  // invents land between neighbours. Method-specific rebuilds keep the edge.
  let kept: GeoJSON.Feature = {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      footprint_regularized: false,
      footprint_method: 'kept',
    },
  }

  // Method rebuild is the ArcGIS path. Skip when the caller asked for soften-only
  // (`cadastralSnap: false` without an explicit method).
  // Right Angles: rebuild on RAW geometry first — soften rounds corners the
  // rectilinear rebuild needs, which left many parcels as pixel stairs.
  if (cadastralSnap || opts?.method != null) {
    if (method === 'right-angles') {
      const rectRaw = rightAngleRegularizePolygon(feature, {
        minSegmentMeters: opts?.minSegmentMeters,
      })
      if (rectRaw) return rectRaw
      if (softenKept) kept = softenFieldPolygonEdges(kept, softenM)
      const rectSoft = rightAngleRegularizePolygon(kept, {
        minSegmentMeters: opts?.minSegmentMeters,
      })
      if (rectSoft) return rectSoft
    } else {
      if (softenKept) kept = softenFieldPolygonEdges(kept, softenM)
      if (method === 'right-angles-and-diagonals') {
        const diag = rightAngleDiagonalRegularizePolygon(kept)
        if (diag) return diag
      } else if (method === 'any-angles') {
        const any = anyAngleRegularizePolygon(kept)
        if (any) return any
      }
    }
  } else if (softenKept) {
    kept = softenFieldPolygonEdges(kept, softenM)
  }

  try {
    const origArea = Math.abs(turf.area(src as any))
    const obb = orientedBoundingRect(src)
    if (obb?.geometry && origArea > 0) {
      const obbArea = Math.abs(turf.area(obb as any))
      const fillRatio = obbArea > 0 ? origArea / obbArea : 0
      const inflationOk = obbArea / origArea <= maxInflation
      const fillOk = minFill <= 0 || fillRatio >= minFill
      if (
        pivotAware &&
        fillRatio >= PIVOT_OBB_FILL_MIN &&
        fillRatio <= PIVOT_OBB_FILL_MAX &&
        (rectSquareness(obb) ?? 0) >= PIVOT_OBB_MIN_SQUARENESS
      ) {
        const relaxed = provenRoundCircleFit(src)
        if (relaxed) {
          const circle = pivotCircleFootprint(feature, relaxed)
          if (circle) return circle
        }
        const round: GeoJSON.Feature = {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            footprint_regularized: false,
            footprint_method: 'pivot-round',
            field_shape: 'pivot',
            footprint_fill_ratio: Math.round(fillRatio * 1000) / 1000,
          },
        }
        return softenKept ? softenFieldPolygonEdges(round, softenM) : round
      }
      // OBB only when the parcel already fills most of the box — otherwise it
      // inflates across the dirt track into the neighbour (the overlap you saw).
      if (inflationOk && fillOk && fillRatio >= 0.72 && method !== 'any-angles') {
        return {
          ...feature,
          type: 'Feature',
          geometry: obb.geometry,
          properties: {
            ...(feature.properties || {}),
            footprint_regularized: true,
            footprint_method: 'obb',
            footprint_fill_ratio: Math.round(fillRatio * 1000) / 1000,
          },
        }
      }
    }

    if (allowEnvelope) {
      const env = turf.envelope(src as any) as GeoJSON.Feature<GeoJSON.Polygon>
      if (env?.geometry) {
        return {
          ...feature,
          type: 'Feature',
          geometry: env.geometry,
          properties: {
            ...(feature.properties || {}),
            footprint_regularized: true,
            footprint_method: 'envelope',
          },
        }
      }
    }
  } catch {
    /* keep original */
  }

  if (cadastralSnap && method !== 'any-angles') {
    const snapped = cadastralSnapFieldPolygon(kept)
    if (snapped.properties?.footprint_cadastral_snap) return snapped
  }
  // No rectangle and no circle fits this parcel, so it would otherwise ship the
  // raw pixel staircase. Collapse the steps without moving the boundary.
  const straightened = stairFreeSimplify(kept, STAIR_FREE_TOL_M)
  if (countVertices(straightened) < countVertices(kept)) {
    return {
      ...straightened,
      properties: {
        ...(straightened.properties || {}),
        footprint_method: 'kept-simplified',
        footprint_stair_collapse_m: STAIR_FREE_TOL_M,
      },
    }
  }
  return kept
}

/** Regularize a drawn AOI into a clean rectangular footprint (FeatureCollection). */
export function regularizeAoiFeatureCollection(
  aoi: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const feat = asPolygonFeature(aoi)
  if (!feat) {
    if (aoi && typeof aoi === 'object' && (aoi as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
      return aoi as GeoJSON.FeatureCollection
    }
    return { type: 'FeatureCollection', features: [] }
  }

  // AOI: force a clean rectangle for Detect; allow higher inflation + envelope.
  const regular = regularizePolygonFootprint(feat, {
    maxAreaInflation: 2.5,
    minFillRatio: 0,
    allowEnvelopeFallback: true,
    cadastralSnap: false,
    pivotAware: false,
  })
  return {
    type: 'FeatureCollection',
    features: [
      {
        ...regular,
        properties: {
          ...(regular.properties || {}),
          aoi_regularized: true,
          role: 'aoi',
        },
      },
    ],
  }
}

function refreshAreaProps(feature: GeoJSON.Feature): GeoJSON.Feature {
  try {
    const areaM2 = Math.abs(turf.area(feature as any))
    if (!(areaM2 > 0)) return feature
    const props = { ...(feature.properties || {}) } as Record<string, unknown>
    props.area_m2 = Math.round(areaM2 * 100) / 100
    props.area_ha = Math.round((areaM2 / 10_000) * 10_000) / 10_000
    try {
      const len = turf.length(turf.polygonToLine(feature as any) as any, { units: 'meters' })
      if (Number.isFinite(len) && len > 0) props.perimeter_m = Math.round(len * 100) / 100
    } catch {
      /* perimeter optional */
    }
    return { ...feature, properties: props }
  } catch {
    return feature
  }
}

/* ------------------------------------------------------------------ */
/* Overlap resolution                                                 */
/* ------------------------------------------------------------------ */

export type ResolveOverlapOptions = {
  /** Clear space kept around pivot circles so nothing touches them. Default 2 m. */
  pivotClearanceM?: number
  /** Overlap share of its own area that makes a footprint fall back to its traced shape. */
  revertOverlapRatio?: number
  /** Drop a parcel that keeps less than this share of its area after carving. */
  minKeepRatio?: number
}

function methodOf(feature: GeoJSON.Feature): string {
  return String((feature.properties as Record<string, unknown> | null)?.footprint_method || '')
}

/** True for footprints redrawn as a clean pivot circle. */
export function isPivotCircleFeature(feature: GeoJSON.Feature): boolean {
  return methodOf(feature) === 'pivot-circle'
}

function areaM2(feature: GeoJSON.Feature): number {
  try {
    const a = Math.abs(turf.area(feature as any))
    return Number.isFinite(a) ? a : 0
  } catch {
    return 0
  }
}

function overlapM2(a: GeoJSON.Feature, b: GeoJSON.Feature): number {
  try {
    const inter = turf.intersect(turf.featureCollection([a as any, b as any]))
    if (!inter?.geometry) return 0
    const value = Math.abs(turf.area(inter as any))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

/** Keep the biggest ring after a carve — slivers read as stray strokes on the map. */
function largestPart(feature: GeoJSON.Feature): GeoJSON.Feature | null {
  const g = feature.geometry
  if (!g) return null
  if (g.type === 'Polygon') return feature
  if (g.type !== 'MultiPolygon') return null
  let best: GeoJSON.Position[][] | null = null
  let bestArea = 0
  for (const coords of g.coordinates || []) {
    const part: GeoJSON.Feature = {
      type: 'Feature',
      properties: feature.properties || {},
      geometry: { type: 'Polygon', coordinates: coords },
    }
    const a = areaM2(part)
    if (a > bestArea) {
      bestArea = a
      best = coords
    }
  }
  if (!best) return null
  return { ...feature, geometry: { type: 'Polygon', coordinates: best } }
}

function carveFootprint(
  feature: GeoJSON.Feature,
  blockers: GeoJSON.Feature[],
): GeoJSON.Feature | null {
  let current: GeoJSON.Feature | null = feature
  for (const blocker of blockers) {
    if (!current) return null
    try {
      let diff = turf.difference(turf.featureCollection([current as any, blocker as any]))
      // Tiny buffer when edges only kiss — still removes the visible overlap.
      if (!diff?.geometry) {
        const padded = bufferOut(blocker, 0.35)
        diff = turf.difference(turf.featureCollection([current as any, padded as any]))
      }
      if (!diff?.geometry) return null
      current = largestPart({ ...current, geometry: diff.geometry })
    } catch {
      try {
        const padded = bufferOut(blocker, 0.5)
        const diff = turf.difference(turf.featureCollection([current as any, padded as any]))
        if (!diff?.geometry) return current
        current = largestPart({ ...current, geometry: diff.geometry })
      } catch {
        return current
      }
    }
  }
  return current
}

/**
 * Final pairwise pass — guarantee no residual overlap remains after the
 * priority-based carve. Smaller / lower-tier parcels yield.
 */
export function enforceDisjointFootprints(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  if (features.length < 2) return features
  const out: Array<GeoJSON.Feature | null> = features.map(f => refreshAreaProps(f))
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[i]
      if (!a?.geometry) continue
      for (let j = i + 1; j < out.length; j++) {
        const b = out[j]
        if (!b?.geometry) continue
        const overlap = overlapM2(a, b)
        if (!(overlap > OVERLAP_EPS_M2)) continue
        const areaA = areaM2(a)
        const areaB = areaM2(b)
        const tierA = overlapTier(a)
        const tierB = overlapTier(b)
        // Higher tier (synthetic) yields; equal tier → smaller yields.
        const aYields = tierA > tierB || (tierA === tierB && areaA <= areaB)
        const victimIdx = aYields ? i : j
        const keeper = aYields ? b : a
        const victim = aYields ? a : b
        const victimArea = aYields ? areaA : areaB
        const carved = carveFootprint(victim, [keeper])
        if (carved?.geometry && areaM2(carved) >= victimArea * OVERLAP_MIN_KEEP_RATIO) {
          out[victimIdx] = refreshAreaProps({
            ...carved,
            properties: {
              ...(carved.properties || {}),
              footprint_overlap_clipped: true,
            },
          })
        } else {
          out[victimIdx] = null
        }
        changed = true
      }
    }
    if (!changed) break
  }
  return out.filter((f): f is GeoJSON.Feature => Boolean(f?.geometry && areaM2(f) > OVERLAP_EPS_M2))
}

function bufferOut(feature: GeoJSON.Feature, metres: number): GeoJSON.Feature {
  if (!(metres > 0)) return feature
  try {
    const buffered = turf.buffer(feature as any, metres, { units: 'meters' })
    return buffered?.geometry ? (buffered as GeoJSON.Feature) : feature
  } catch {
    return feature
  }
}

type OverlapItem = {
  index: number
  feature: GeoJSON.Feature
  original: GeoJSON.Feature | null
  tier: number
  area: number
  pivot: { centre: [number, number]; radiusM: number } | null
}

function pivotGeometryOf(feature: GeoJSON.Feature): OverlapItem['pivot'] {
  if (!isPivotCircleFeature(feature)) return null
  const props = (feature.properties || {}) as Record<string, unknown>
  const centre = props.pivot_centre
  const radius = Number(props.pivot_radius_m)
  if (!Array.isArray(centre) || centre.length < 2 || !(radius > 0)) return null
  const lon = Number(centre[0])
  const lat = Number(centre[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return { centre: [lon, lat], radiusM: radius }
}

/**
 * Traced outlines and pivot circles outrank synthetic rectangles, so an inflated
 * OBB never eats a neighbour: it reverts to its traced shape first, and only the
 * remainder is carved away.
 */
function overlapTier(feature: GeoJSON.Feature): number {
  const method = methodOf(feature)
  if (method === 'pivot-circle') return 0
  if (method === 'obb' || method === 'envelope') return 2
  return 1
}

/**
 * Make the footprint set disjoint: pivot circles stay whole with clear space
 * around them, overreaching rectangles fall back to their traced outline, and
 * whatever still overlaps a higher-priority parcel is carved off.
 */
export function resolveFootprintOverlaps(
  features: GeoJSON.Feature[],
  originals?: Array<GeoJSON.Feature | null | undefined>,
  opts?: ResolveOverlapOptions,
): GeoJSON.Feature[] {
  if (!features?.length) return features || []
  const clearance = Math.max(0, opts?.pivotClearanceM ?? PIVOT_CLEARANCE_M)
  const revertRatio = opts?.revertOverlapRatio ?? OVERLAP_REVERT_RATIO
  const minKeep = opts?.minKeepRatio ?? OVERLAP_MIN_KEEP_RATIO

  const items: OverlapItem[] = features.map((feature, index) => ({
    index,
    feature,
    original: originals?.[index] ?? null,
    tier: overlapTier(feature),
    area: areaM2(feature),
    pivot: pivotGeometryOf(feature),
  }))

  const order = [...items].sort((a, b) => a.tier - b.tier || b.area - a.area)
  type Accepted = {
    index: number
    feature: GeoJSON.Feature
    /** Shape other parcels must stay out of (pivots add the clearance ring). */
    clip: GeoJSON.Feature
    bbox: number[]
    pivot: OverlapItem['pivot']
  }
  const accepted: Accepted[] = []

  const accept = (item: OverlapItem, feature: GeoJSON.Feature) => {
    const pivot = pivotGeometryOf(feature)
    const clip = pivot ? bufferOut(feature, clearance) : feature
    accepted.push({
      index: item.index,
      feature,
      clip,
      bbox: turf.bbox(clip as any) as number[],
      pivot,
    })
  }

  for (const item of order) {
    if (!item.area) continue
    const box = (() => {
      try {
        return turf.bbox(item.feature as any) as number[]
      } catch {
        return null
      }
    })()
    if (!box) continue

    const blockers = accepted.filter(
      a => !(a.bbox[2]! < box[0]! || box[2]! < a.bbox[0]! || a.bbox[3]! < box[1]! || box[3]! < a.bbox[1]!),
    )
    if (!blockers.length) {
      accept(item, item.feature)
      continue
    }

    const hits = blockers
      .map(b => ({ blocker: b, overlap: overlapM2(item.feature, b.clip) }))
      .filter(h => h.overlap > 0)
    if (!hits.length) {
      accept(item, item.feature)
      continue
    }
    const totalOverlap = hits.reduce((sum, h) => sum + h.overlap, 0)

    // Pivot vs pivot: drop duplicates, otherwise shrink the radius so the circle
    // stays a full circle instead of being carved into a crescent.
    if (item.pivot) {
      const worst = Math.max(...hits.map(h => h.overlap))
      if (worst / item.area >= PIVOT_DUPLICATE_RATIO) continue
      let radius = item.pivot.radiusM
      for (const hit of hits) {
        const other = hit.blocker.pivot
        if (!other) {
          radius = -1
          break
        }
        const d = turf.distance(turf.point(item.pivot.centre), turf.point(other.centre), {
          units: 'meters',
        })
        radius = Math.min(radius, d - other.radiusM - clearance)
      }
      if (radius >= item.pivot.radiusM * PIVOT_MIN_SHRINK_RATIO) {
        const circle = circleAt(item.pivot.centre, radius)
        if (circle) {
          accept(item, {
            ...item.feature,
            geometry: circle.geometry,
            properties: {
              ...(item.feature.properties || {}),
              pivot_radius_m: Math.round(radius * 100) / 100,
              footprint_overlap_shrunk: true,
            },
          })
          continue
        }
      }
    }

    // An overreaching rectangle is worse than its traced outline — try the source
    // geometry before carving bites out of a synthetic shape.
    let candidate = item.feature
    let overlapRatio = totalOverlap / item.area
    if (overlapRatio > revertRatio && item.original?.geometry && item.tier > 0) {
      // The traced outline is the raw pixel mask — rebuild with diagonals/right
      // angles so the overlap fallback never reintroduces the staircase.
      const rebuilt =
        rightAngleDiagonalRegularizePolygon(item.original) ||
        rightAngleRegularizePolygon(item.original) ||
        stairFreeSimplify(item.original)
      const traced = refreshAreaProps({
        ...rebuilt,
        properties: {
          ...(item.original.properties || {}),
          ...(rebuilt.properties || {}),
          footprint_overlap_reverted: true,
          footprint_method:
            String((rebuilt.properties as Record<string, unknown> | null)?.footprint_method || '') ||
            'kept-simplified',
        },
      })
      const tracedArea = areaM2(traced)
      if (tracedArea > 0) {
        const tracedOverlap = blockers.reduce((sum, b) => sum + overlapM2(traced, b.clip), 0)
        if (tracedOverlap / tracedArea < overlapRatio) {
          candidate = traced
          overlapRatio = tracedOverlap / tracedArea
        }
      }
    }

    const carved = carveFootprint(
      candidate,
      blockers.map(b => b.clip),
    )
    if (!carved?.geometry) continue
    const keptArea = areaM2(carved)
    if (!(keptArea > 0) || keptArea / Math.max(item.area, 1) < minKeep) continue
    accept(item, {
      ...carved,
      properties: {
        ...(carved.properties || {}),
        footprint_overlap_clipped: true,
      },
    })
  }

  return accepted.sort((a, b) => a.index - b.index).map(a => a.feature)
}

/**
 * Expand every parcel slightly then re-carve overlaps so neighbours abut
 * (shared cadastral edges) instead of leaving thin corridors of empty map.
 */
export function abutNeighborFootprints(
  features: GeoJSON.Feature[],
  gapCloseM = 0.85,
): GeoJSON.Feature[] {
  if (!(gapCloseM > 0) || features.length < 2) return features
  const expanded = features.map(f => {
    if (!f?.geometry) return f
    const buffered = bufferOut(f, gapCloseM)
    if (!buffered?.geometry) return f
    return refreshAreaProps({
      ...f,
      geometry: buffered.geometry,
      properties: {
        ...(f.properties || {}),
        footprint_abutted: true,
      },
    })
  })
  return enforceDisjointFootprints(expanded)
}

/** Regularize detected field polygons — ArcGIS-style method, then zero overlap. */
export function regularizeFieldFootprints(
  fc: GeoJSON.FeatureCollection,
  opts?: RegularizeFootprintOptions,
): GeoJSON.FeatureCollection {
  if (!fc?.features?.length) return fc
  const method = resolveRegularizeMethod(opts)
  const regularized = fc.features.map(f =>
    regularizePolygonFootprint(f, {
      allowEnvelopeFallback: false,
      cadastralSnap: true,
      method,
      ...opts,
    }),
  )
  if (opts?.resolveOverlaps === false) {
    return { type: 'FeatureCollection', features: regularized.map(refreshAreaProps) }
  }
  let disjoint = enforceDisjointFootprints(
    resolveFootprintOverlaps(regularized, fc.features, {
      pivotClearanceM: opts?.pivotClearanceM,
    }),
  )
  const abutM = opts?.abutNeighborsM
  const closeM = abutM === undefined ? 0.85 : abutM
  if (closeM > 0) {
    disjoint = abutNeighborFootprints(disjoint, closeM)
  }
  return { type: 'FeatureCollection', features: disjoint.map(refreshAreaProps) }
}
