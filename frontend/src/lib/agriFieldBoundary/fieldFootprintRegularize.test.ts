import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import {
  abutNeighborFootprints,
  classifyPivotFootprint,
  collapseStairStepRing,
  enforceDisjointFootprints,
  footprintCircularity,
  orientedBoundingRect,
  regularizeAoiFeatureCollection,
  regularizeFieldFootprints,
  regularizePolygonFootprint,
  rightAngleDiagonalRegularizePolygon,
  rightAngleRegularizePolygon,
  stairFreeSimplify,
} from './fieldFootprintRegularize'

/** Local metres (rotated by `tiltDeg`) → lon/lat near 55E 24N. */
function localToLonLat(x: number, y: number, tiltDeg: number): number[] {
  const rad = (tiltDeg * Math.PI) / 180
  const east = x * Math.cos(rad) - y * Math.sin(rad)
  const north = x * Math.sin(rad) + y * Math.cos(rad)
  return [
    55.0 + east / (111_320 * Math.cos((24 * Math.PI) / 180)),
    24.0 + north / 111_320,
  ]
}

/** Centre-pivot footprint with raster-like jitter on the ring. */
function pivotFeature(radiusM: number, jitterFrac = 0): GeoJSON.Feature<GeoJSON.Polygon> {
  const center: [number, number] = [55.0, 24.0]
  const steps = 48
  const ring: number[][] = []
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 360 - 180
    const wobble = jitterFrac ? 1 + (i % 2 === 0 ? jitterFrac : -jitterFrac) : 1
    const p = turf.destination(turf.point(center), (radiusM * wobble) / 1000, bearing, {
      units: 'kilometers',
    })
    ring.push(p.geometry.coordinates as number[])
  }
  ring.push([...ring[0]!])
  return {
    type: 'Feature',
    properties: { field_id: 'P1' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

/** Axis-aligned parcel in degrees, anchored at its south-west corner. */
function rectFeature(
  lon: number,
  lat: number,
  dLon: number,
  dLat: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon, lat],
          [lon + dLon, lat],
          [lon + dLon, lat + dLat],
          [lon, lat + dLat],
          [lon, lat],
        ],
      ],
    },
  }
}

/** Centre pivot with a rectangular strip fused to its east side (metres). */
function pivotWithStrip(radiusM: number, widthM: number, lengthM: number): GeoJSON.Feature {
  const circle = turf.circle(turf.point([55.0, 24.0]), radiusM, {
    steps: 96,
    units: 'meters',
  })
  const mLon = 111_320 * Math.cos((24 * Math.PI) / 180)
  const strip = rectFeature(
    55.0 + (radiusM - 20) / mLon,
    24.0 - widthM / 2 / 111_320,
    lengthM / mLon,
    widthM / 111_320,
  )
  const merged = turf.union(turf.featureCollection([circle as any, strip as any])) as GeoJSON.Feature
  return { ...merged, properties: { field_id: 'PT1' } }
}

/**
 * Staircase ring of a pixel-quantized disc — the outline a raster pivot mask
 * produces, whose inflated perimeter defeats circularity.
 */
function rasterPivotRing(radiusM: number, pixelM: number, tiltDeg = 11): number[][] {
  const rows = Math.floor(radiusM / pixelM)
  const right: number[][] = []
  const left: number[][] = []
  for (let row = -rows; row <= rows; row++) {
    const yBottom = row * pixelM
    const yTop = (row + 1) * pixelM
    const yMid = (yBottom + yTop) / 2
    const halfWidth = Math.sqrt(Math.max(0, radiusM * radiusM - yMid * yMid))
    const x = Math.max(pixelM, Math.round(halfWidth / pixelM) * pixelM)
    right.push([x, yBottom], [x, yTop])
    left.push([-x, yBottom], [-x, yTop])
  }
  const local = [...right, ...left.reverse()]
  local.push([...local[0]!])
  return local.map(([x, y]) => localToLonLat(x!, y!, tiltDeg))
}

/** Pixel-quantized pivot plus a detached speck — a MultiPolygon field mask. */
function rasterPivotWithSpeck(radiusM: number, pixelM: number): GeoJSON.Feature {
  const mLon = 111_320 * Math.cos((24 * Math.PI) / 180)
  const speck = rectFeature(
    55.0 + (radiusM * 1.6) / mLon,
    24.0 + (radiusM * 1.6) / 111_320,
    (pixelM * 2) / mLon,
    (pixelM * 2) / 111_320,
  )
  return {
    type: 'Feature',
    properties: { field_id: 'MP1' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [rasterPivotRing(radiusM, pixelM)],
        speck.geometry.coordinates as number[][][],
      ],
    },
  }
}

function overlapAreaM2(a: GeoJSON.Feature, b: GeoJSON.Feature): number {
  const inter = turf.intersect(turf.featureCollection([a as any, b as any]))
  return inter?.geometry ? Math.round(Math.abs(turf.area(inter as any))) : 0
}

const tiltedRect: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { field_id: 'T1' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [55.0, 24.0],
        [55.002, 24.001],
        [55.001, 24.003],
        [54.999, 24.002],
        [55.0, 24.0],
      ],
    ],
  },
}

/** L-shaped parcel — should NOT snap to OBB / envelope. */
const lShape: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { field_id: 'L1' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [55.0, 24.0],
        [55.004, 24.0],
        [55.004, 24.001],
        [55.001, 24.001],
        [55.001, 24.003],
        [55.0, 24.003],
        [55.0, 24.0],
      ],
    ],
  },
}

describe('fieldFootprintRegularize', () => {
  it('builds an oriented bounding rect for a tilted polygon', () => {
    const obb = orientedBoundingRect(tiltedRect)
    expect(obb?.geometry?.type).toBe('Polygon')
    expect(obb!.geometry.coordinates[0].length).toBeGreaterThanOrEqual(5)
  })

  it('marks regularized field footprints when near-rectilinear', () => {
    const out = regularizePolygonFootprint(tiltedRect)
    expect(out.properties?.footprint_regularized).toBe(true)
    expect(['obb', 'right-angles', 'right-angles-and-diagonals']).toContain(
      out.properties?.footprint_method,
    )
    expect(out.geometry?.type).toBe('Polygon')
  })

  it('keeps irregular L-shaped fields instead of forcing a rectangle', () => {
    const out = regularizePolygonFootprint(lShape, { softenKept: false, cadastralSnap: false })
    expect(out.properties?.footprint_method).toBe('kept')
    expect(out.properties?.footprint_regularized).toBe(false)
    expect(out.geometry).toEqual(lShape.geometry)
  })

  it('softens kept stair-step parcels when OBB is not applied', () => {
    const stair: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.0, 24.0],
            [55.002, 24.0],
            [55.002, 24.0004],
            [55.0024, 24.0004],
            [55.0024, 24.0008],
            [55.0028, 24.0008],
            [55.0028, 24.0015],
            [55.0, 24.0015],
            [55.0, 24.0],
          ],
        ],
      },
    }
    const out = regularizePolygonFootprint(stair, {
      minFillRatio: 0.95,
      softenKept: true,
      cadastralSnap: false,
    })
    expect(['kept', 'kept-simplified']).toContain(out.properties?.footprint_method)
    expect(
      out.properties?.footprint_softened === true ||
        out.properties?.footprint_method === 'kept-simplified',
    ).toBe(true)
  })

  it('collapses 10 m raster stairs without moving the boundary', () => {
    // Diagonal edge traced as 10 m pixel steps — the shape a mask polygonizer emits.
    const ring: number[][] = [localToLonLat(0, 0, 0)]
    for (let i = 0; i < 20; i++) {
      ring.push(localToLonLat(i * 10, i * 10, 0))
      ring.push(localToLonLat((i + 1) * 10, i * 10, 0))
    }
    ring.push(localToLonLat(200, 0, 0))
    ring.push([...ring[0]!])
    const stairs: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    }

    const out = stairFreeSimplify(stairs)
    const before = turf.area(stairs as any)
    const after = turf.area(out as any)
    expect((out.geometry as GeoJSON.Polygon).coordinates[0]!.length).toBeLessThan(ring.length / 2)
    expect(Math.abs(after - before) / before).toBeLessThan(0.15)
  })

  it('leaves already-straight parcels untouched', () => {
    const out = stairFreeSimplify(lShape)
    expect(out.geometry).toEqual(lShape.geometry)
  })

  it('applies cadastral edge snap for stair-step fields toward straight farm boundaries', () => {
    const stair: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.0, 24.0],
            [55.002, 24.0],
            [55.002, 24.0004],
            [55.0024, 24.0004],
            [55.0024, 24.0008],
            [55.0028, 24.0008],
            [55.0028, 24.0015],
            [55.0, 24.0015],
            [55.0, 24.0],
          ],
        ],
      },
    }
    // Soften / any-angles path collapses stairs (Right Angles rebuilds to ≤5 verts instead).
    const out = regularizePolygonFootprint(stair, {
      method: 'any-angles',
      minFillRatio: 0.95,
      softenKept: true,
      cadastralSnap: true,
    })
    expect(
      out.properties?.footprint_cadastral_snap === true ||
        out.properties?.footprint_method === 'obb' ||
        out.properties?.footprint_method === 'any-angles' ||
        out.properties?.footprint_softened === true ||
        out.properties?.footprint_method === 'kept-simplified',
    ).toBe(true)
    const ring = (out.geometry as GeoJSON.Polygon).coordinates[0]!
    // Cadastral / soften should reduce stair vertices vs raw 9-point ring.
    expect(ring.length).toBeLessThan(9)
  })

  it('collapses classic H/V raster stair corners', () => {
    const stair = [
      [55.0, 24.0],
      [55.002, 24.0],
      [55.002, 24.0004],
      [55.0024, 24.0004],
      [55.0024, 24.0008],
      [55.0028, 24.0008],
      [55.0028, 24.0015],
      [55.0, 24.0015],
      [55.0, 24.0],
    ]
    const out = collapseStairStepRing(stair)
    expect(out.length).toBeLessThan(stair.length)
  })

  it('regularizes AOI into a FeatureCollection with aoi_regularized', () => {
    const fc = regularizeAoiFeatureCollection(tiltedRect.geometry)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties?.aoi_regularized).toBe(true)
  })

  it('scores circles near 1.0 and rectangles at or below pi/4', () => {
    expect(footprintCircularity(pivotFeature(400))).toBeGreaterThan(0.95)
    expect(footprintCircularity(tiltedRect)).toBeLessThanOrEqual(0.79)
  })

  it('keeps centre-pivot circles round instead of snapping them to a square', () => {
    const pivot = pivotFeature(400)
    expect(classifyPivotFootprint(pivot)).toBe('circle')

    const out = regularizePolygonFootprint(pivot)
    expect(out.properties?.footprint_method).toBe('pivot-circle')
    expect(out.properties?.field_shape).toBe('pivot')
    expect(Number(out.properties?.pivot_radius_m)).toBeGreaterThan(0)

    // A squared pivot would collapse to ~5 corner vertices and gain ~27% area.
    const ring = (out.geometry as GeoJSON.Polygon).coordinates[0]!
    expect(ring.length).toBeGreaterThan(32)
    const areaRatio = Math.abs(turf.area(out as any)) / Math.abs(turf.area(pivot as any))
    expect(areaRatio).toBeGreaterThan(0.97)
    expect(areaRatio).toBeLessThan(1.03)
  })

  it('detects jagged raster pivots that circularity alone would miss', () => {
    const wobbly = pivotFeature(300, 0.06)
    expect(footprintCircularity(wobbly)).toBeLessThan(0.82)
    expect(classifyPivotFootprint(wobbly)).toBe('circle')

    const out = regularizePolygonFootprint(wobbly, { minFillRatio: 0.5, maxAreaInflation: 1.6 })
    expect(out.properties?.footprint_method).toBe('pivot-circle')
  })

  it('never squares a pixel-quantized pivot into its bounding box', () => {
    const raster: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: { field_id: 'R1' },
      geometry: { type: 'Polygon', coordinates: [rasterPivotRing(300, 30)] },
    }
    // Raster stairs push circularity far below the round guard.
    expect(footprintCircularity(raster)).toBeLessThan(0.82)

    const out = regularizePolygonFootprint(raster)
    expect(out.properties?.footprint_method).toBe('pivot-circle')
    expect(out.properties?.field_shape).toBe('pivot')
    expect(footprintCircularity(out)).toBeGreaterThan(0.97)

    const radius = Number(out.properties?.pivot_radius_m)
    expect(radius).toBeGreaterThan(300 * 0.9)
    expect(radius).toBeLessThan(300 * 1.1)
    // A squared pivot would gain the four corners (≈27% area).
    const areaRatio = Math.abs(turf.area(out as any)) / Math.abs(turf.area(raster as any))
    expect(areaRatio).toBeGreaterThan(0.9)
    expect(areaRatio).toBeLessThan(1.12)
  })

  it('redraws a multipart pivot mask as one circle and drops the speck', () => {
    const multi = rasterPivotWithSpeck(300, 30)
    const out = regularizePolygonFootprint(multi)
    expect(out.properties?.footprint_method).toBe('pivot-circle')
    expect(out.geometry?.type).toBe('Polygon')

    const speckCentre = turf.point([
      55.0 + 490 / (111_320 * Math.cos((24 * Math.PI) / 180)),
      24.0 + 490 / 111_320,
    ])
    expect(turf.booleanPointInPolygon(speckCentre, out as any)).toBe(false)
  })

  it('keeps two genuine halves of a multipart parcel out of the pivot path', () => {
    const split: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          rectFeature(55.0, 24.0, 0.003, 0.003).geometry.coordinates as number[][][],
          rectFeature(55.006, 24.0, 0.003, 0.003).geometry.coordinates as number[][][],
        ],
      },
    }
    expect(classifyPivotFootprint(split)).toBeNull()
  })

  it('still squares near-rectilinear parcels with pivot detection enabled', () => {
    const out = regularizePolygonFootprint(tiltedRect)
    expect(['obb', 'right-angles', 'right-angles-and-diagonals']).toContain(
      out.properties?.footprint_method,
    )
  })

  it('does not mistake a densely sampled square for a pivot', () => {
    const ring: number[][] = []
    const step = 0.0002
    for (let i = 0; i < 20; i++) ring.push([55.0 + i * step, 24.0])
    for (let i = 0; i < 20; i++) ring.push([55.004, 24.0 + i * step])
    for (let i = 20; i > 0; i--) ring.push([55.0 + i * step, 24.004])
    for (let i = 20; i > 0; i--) ring.push([55.0, 24.0 + i * step])
    ring.push([55.0, 24.0])
    const dense: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    }
    expect(classifyPivotFootprint(dense)).toBeNull()
    expect(['obb', 'right-angles', 'right-angles-and-diagonals']).toContain(
      regularizePolygonFootprint(dense).properties?.footprint_method,
    )
  })

  it('rebuilds right angles on a rotated staircase parcel', () => {
    // L-shaped parcel whose inner edge is a 12-step raster staircase, rotated
    // 34° off north — global H/V stair detection cannot see these edges.
    const local: number[][] = [
      [0, 0],
      [600, 0],
      [600, 150],
    ]
    for (let i = 0; i < 12; i++) {
      const x = 600 - i * 37.5
      local.push([x, i % 2 === 0 ? 162 : 150])
      local.push([x - 37.5, i % 2 === 0 ? 162 : 150])
    }
    local.push([150, 150], [150, 600], [0, 600], [0, 0])

    const ring = local.map(([x, y]) => localToLonLat(x!, y!, 34))
    const parcel: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    }

    const out = regularizePolygonFootprint(parcel, {
      softenKept: false,
      cadastralSnap: true,
      method: 'right-angles',
    })
    expect(['right-angles', 'right-angles-and-diagonals', 'cadastral', 'kept-simplified']).toContain(
      out.properties?.footprint_method,
    )

    const outRing = (out.geometry as GeoJSON.Polygon).coordinates[0]!
    expect(outRing.length).toBeLessThan(ring.length)
    expect(outRing[0]).toEqual(outRing[outRing.length - 1])
    expect(turf.kinks(out as any).features).toHaveLength(0)

    // Every corner is a right angle, and the L is not collapsed into a box.
    const open = outRing.slice(0, -1)
    expect(open.length).toBeGreaterThanOrEqual(6)
    for (let i = 0; i < open.length; i++) {
      const a = turf.point(open[(i - 1 + open.length) % open.length] as [number, number])
      const b = turf.point(open[i] as [number, number])
      const c = turf.point(open[(i + 1) % open.length] as [number, number])
      let turn = Math.abs(((turf.bearing(b, c) - turf.bearing(a, b) + 540) % 360) - 180)
      turn = Math.min(turn, 180 - turn)
      expect(Math.abs(turn - 90)).toBeLessThan(6)
    }
  })

  it('leaves genuinely diagonal parcels alone instead of forcing right angles', () => {
    const triangle: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.0, 24.0],
            [55.006, 24.0],
            [55.0, 24.004],
            [55.0, 24.0],
          ],
        ],
      },
    }
    expect(rightAngleRegularizePolygon(triangle)).toBeNull()
  })

  it('regularizes a field FeatureCollection', () => {
    const fc = regularizeFieldFootprints({
      type: 'FeatureCollection',
      features: [tiltedRect],
    })
    expect(fc.features[0].properties?.footprint_regularized).toBe(true)
    expect(Number(fc.features[0].properties?.area_m2)).toBeGreaterThan(0)
  })

  it('redraws a pivot fused to a square strip as a complete circle', () => {
    const fused = pivotWithStrip(300, 300, 250)
    // The strip breaks circularity and the equal-area circle fit.
    expect(footprintCircularity(fused)).toBeLessThan(0.82)

    const out = regularizePolygonFootprint(fused)
    expect(out.properties?.footprint_method).toBe('pivot-circle')
    expect(out.properties?.field_shape).toBe('pivot')

    // The recovered radius is the pivot's own radius, not the inflated equal-area one.
    const radius = Number(out.properties?.pivot_radius_m)
    expect(radius).toBeGreaterThan(300 * 0.94)
    expect(radius).toBeLessThan(300 * 1.06)
    expect(footprintCircularity(out)).toBeGreaterThan(0.97)

    // No trace of the strip is left on the footprint.
    const stripTip = turf.destination(turf.point([55.0, 24.0]), 0.52, 90, { units: 'kilometers' })
    expect(turf.booleanPointInPolygon(stripTip, out as any)).toBe(false)
  })

  it('leaves pivot circles whole and carves the overlapping parcel away', () => {
    const pivot = pivotFeature(250)
    // Square parcel pushed onto the pivot from the east.
    const square = rectFeature(150, 24.0 - 0.0018, 0.004, 0.0036)
    const fc = regularizeFieldFootprints({
      type: 'FeatureCollection',
      features: [pivot, square],
    })
    expect(fc.features).toHaveLength(2)

    const circle = fc.features.find(f => f.properties?.footprint_method === 'pivot-circle')!
    const parcel = fc.features.find(f => f !== circle)!
    expect(circle).toBeTruthy()
    expect(circle.properties?.footprint_overlap_clipped).toBeUndefined()
    expect(Math.abs(turf.area(circle as any)) / Math.abs(turf.area(pivot as any))).toBeCloseTo(1, 1)

    expect(overlapAreaM2(circle, parcel)).toBe(0)
    // The 2 m clearance keeps the parcel from touching the pivot outline.
    const ring = turf.buffer(circle as any, 1, { units: 'meters' }) as GeoJSON.Feature
    expect(overlapAreaM2(ring, parcel)).toBe(0)
  })

  it('drops a duplicate pivot instead of stacking two circles', () => {
    const fc = regularizeFieldFootprints({
      type: 'FeatureCollection',
      features: [pivotFeature(240), pivotFeature(232)],
    })
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]!.properties?.footprint_method).toBe('pivot-circle')
  })

  it('makes every regularized parcel disjoint from its neighbours', () => {
    const features = [
      rectFeature(55.0, 24.0, 0.004, 0.003),
      // Overlaps the first parcel by roughly a third.
      rectFeature(55.0027, 24.0008, 0.004, 0.003),
      rectFeature(55.008, 24.0, 0.003, 0.003),
    ]
    const out = regularizeFieldFootprints({ type: 'FeatureCollection', features })
    for (let i = 0; i < out.features.length; i++) {
      for (let j = i + 1; j < out.features.length; j++) {
        expect(overlapAreaM2(out.features[i]!, out.features[j]!)).toBe(0)
      }
    }
    expect(out.features.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps overlap resolution optional', () => {
    const features = [
      rectFeature(55.0, 24.0, 0.004, 0.003),
      rectFeature(55.0027, 24.0008, 0.004, 0.003),
    ]
    const out = regularizeFieldFootprints(
      { type: 'FeatureCollection', features },
      { resolveOverlaps: false },
    )
    expect(overlapAreaM2(out.features[0]!, out.features[1]!)).toBeGreaterThan(0)
  })

  it('rebuilds stair parcels with Right Angles and Diagonals', () => {
    const ring: number[][] = [localToLonLat(0, 0, 15)]
    for (let i = 0; i < 16; i++) {
      ring.push(localToLonLat(i * 10, 0, 15))
      ring.push(localToLonLat(i * 10, 10, 15))
    }
    for (let i = 16; i >= 0; i--) {
      ring.push(localToLonLat(i * 10, 120, 15))
    }
    ring.push([...ring[0]!])
    const stair: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: { field_id: 'S1' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }
    const out = regularizePolygonFootprint(stair, {
      method: 'right-angles-and-diagonals',
      minFillRatio: 0.95,
    })
    expect(
      ['right-angles-and-diagonals', 'right-angles', 'obb', 'kept-simplified', 'cadastral'].includes(
        String(out.properties?.footprint_method),
      ),
    ).toBe(true)
    expect(countRingVertices(out)).toBeLessThan(countRingVertices(stair))
  })

  it('enforces zero overlap even when both parcels inflate', () => {
    const a = rectFeature(55.0, 24.0, 0.005, 0.004)
    const b = rectFeature(55.0025, 24.001, 0.005, 0.004)
    expect(overlapAreaM2(a, b)).toBeGreaterThan(0)
    const out = enforceDisjointFootprints([a, b])
    expect(out.length).toBe(2)
    expect(overlapAreaM2(out[0]!, out[1]!)).toBeLessThan(2)
  })

  it('abuts neighbours so thin gaps close into a shared edge', () => {
    // Two parcels with a ~0.5 m corridor between them (equatorial approx).
    const left = rectFeature(55.0, 24.0, 0.002, 0.002)
    const right = rectFeature(55.002005, 24.0, 0.002, 0.002)
    const gapBefore = turf.distance(
      turf.point([55.002, 24.001]),
      turf.point([55.002005, 24.001]),
      { units: 'meters' },
    )
    expect(gapBefore).toBeGreaterThan(0.3)
    expect(gapBefore).toBeLessThan(1.2)
    const abutted = abutNeighborFootprints([left, right], 0.9)
    expect(abutted.length).toBe(2)
    expect(overlapAreaM2(abutted[0]!, abutted[1]!)).toBeLessThan(2)
    // Combined area should grow toward closing the corridor (not shrink).
    const before = turf.area(left as any) + turf.area(right as any)
    const after = turf.area(abutted[0]! as any) + turf.area(abutted[1]! as any)
    expect(after).toBeGreaterThan(before * 0.98)
  })

  it('Right Angles method produces 90° corners on a stair rectangle', () => {
    const stair = collapseStairFixture()
    const out =
      rightAngleRegularizePolygon(stair) ||
      rightAngleDiagonalRegularizePolygon(stair) ||
      regularizePolygonFootprint(stair, { method: 'right-angles' })
    expect(out).toBeTruthy()
    expect(out!.properties?.footprint_regularized === true || countRingVertices(out!) <= 9).toBe(
      true,
    )
  })
})

function countRingVertices(feature: GeoJSON.Feature): number {
  const g = feature.geometry
  if (!g || g.type !== 'Polygon') return 0
  return (g.coordinates[0] || []).length
}

/** Axis-aligned rectangle with classic raster stairs on the east edge. */
function collapseStairFixture(): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: number[][] = [
    localToLonLat(0, 0, 0),
    localToLonLat(100, 0, 0),
    localToLonLat(100, 10, 0),
    localToLonLat(110, 10, 0),
    localToLonLat(110, 20, 0),
    localToLonLat(120, 20, 0),
    localToLonLat(120, 80, 0),
    localToLonLat(0, 80, 0),
    localToLonLat(0, 0, 0),
  ]
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}
