import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import {
  parseGisDistance,
  runGisAreaTable,
  runGisBuffer,
  runGisConvexHull,
  runGisDissolve,
  runGisIntersect,
  runGisSelectByAttribute,
  runGisSelectByLocation,
  runGisUnionOrMerge,
  runGisVoronoi,
} from './geoAiGisEngine'
import { resolveGisInputLayer } from './geoAiGisLayerResolve'

const squareA = turf.featureCollection([
  turf.polygon(
    [
      [
        [55.0, 25.0],
        [55.0, 25.01],
        [55.01, 25.01],
        [55.01, 25.0],
        [55.0, 25.0],
      ],
    ],
    { name: 'A', Crop: 'Wheat' },
  ),
])

const squareB = turf.featureCollection([
  turf.polygon(
    [
      [
        [55.005, 25.005],
        [55.005, 25.015],
        [55.015, 25.015],
        [55.015, 25.005],
        [55.005, 25.005],
      ],
    ],
    { name: 'B', Crop: 'Wheat' },
  ),
])

const points = turf.featureCollection([
  turf.point([55.0, 25.0], { id: 1 }),
  turf.point([55.02, 25.0], { id: 2 }),
  turf.point([55.01, 25.02], { id: 3 }),
])

describe('geoAiGisEngine', () => {
  it('buffers polygons', () => {
    const r = runGisBuffer({
      collection: squareA,
      distance: 500,
      unit: 'meters',
      inputName: 'Farm',
    })
    expect(r.ok).toBe(true)
    expect(r.geojson?.features.length).toBe(1)
    expect(r.outputName).toMatch(/Farm_Buffer/i)
  })

  it('intersects overlapping polygons', () => {
    const r = runGisIntersect({
      a: squareA,
      b: squareB,
      nameA: 'Farms',
      nameB: 'Roads',
    })
    expect(r.ok).toBe(true)
    expect((r.featureCount || 0) >= 1).toBe(true)
  })

  it('merges polygons', () => {
    const both = turf.featureCollection([...squareA.features, ...squareB.features])
    const r = runGisUnionOrMerge({ collection: both, inputName: 'Fields', mode: 'merge' })
    expect(r.ok).toBe(true)
    expect(r.geojson?.features.length).toBe(1)
  })

  it('dissolves by attribute', () => {
    const both = turf.featureCollection([...squareA.features, ...squareB.features])
    const r = runGisDissolve({ collection: both, field: 'Crop', inputName: 'Fields' })
    expect(r.ok).toBe(true)
    expect((r.featureCount || 0) >= 1).toBe(true)
  })

  it('builds area table', () => {
    const r = runGisAreaTable({ collection: squareA, inputName: 'Farm' })
    expect(r.ok).toBe(true)
    expect(r.table?.rows.length).toBe(1)
    expect(Number(r.table?.rows[0]?.values.area_ha)).toBeGreaterThan(0)
  })

  it('convex hull and voronoi', () => {
    const hull = runGisConvexHull({ collection: points, inputName: 'Wells' })
    expect(hull.ok).toBe(true)
    const vor = runGisVoronoi({ collection: points, inputName: 'Wells' })
    expect(vor.ok).toBe(true)
    expect((vor.featureCount || 0) >= 1).toBe(true)
  })

  it('select by location within distance', () => {
    const r = runGisSelectByLocation({
      target: squareA,
      mask: points,
      distance: 5,
      unit: 'kilometers',
      targetName: 'Farms',
      maskName: 'Wells',
    })
    expect(r.ok).toBe(true)
  })

  it('select by attribute', () => {
    const r = runGisSelectByAttribute({
      collection: squareA,
      field: 'Crop',
      value: 'Wheat',
      inputName: 'Farms',
    })
    expect(r.ok).toBe(true)
    expect(r.featureCount).toBe(1)
  })

  it('parses distance strings', () => {
    expect(parseGisDistance('500 m')).toEqual({ distance: 500, unit: 'meters' })
    expect(parseGisDistance('1 km')?.unit).toBe('kilometers')
  })
})

describe('geoAiGisLayerResolve', () => {
  it('resolves AOI and fuzzy layer names', () => {
    const layers = [
      {
        name: 'Farm Boundaries',
        geojson: squareA,
      },
      {
        name: 'Roads',
        geojson: squareB,
      },
    ]
    const aoi = resolveGisInputLayer({
      hint: 'aoi',
      layers,
      liveMapState: {
        aoiGeometry: squareA.features[0]!.geometry,
      },
    })
    expect(aoi.ok).toBe(true)
    if (aoi.ok) expect(aoi.layer.source).toBe('aoi')

    const farms = resolveGisInputLayer({ hint: 'farms', layers, liveMapState: null })
    expect(farms.ok).toBe(true)
    if (farms.ok) expect(farms.layer.name).toMatch(/Farm/i)

    const missing = resolveGisInputLayer({ hint: 'wells', layers, liveMapState: null, allowAoiFallback: false })
    expect(missing.ok).toBe(false)
  })
})
