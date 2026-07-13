import { describe, expect, it } from 'vitest'
import {
  boundsWgs84FromMapCoordinates,
  footprintGeoJsonFromMapCoordinates,
  MAPBOX_IMAGE_MAX_DIMENSION,
} from './siRasterMapLayer'

describe('siRasterMapLayer', () => {
  it('builds a closed polygon footprint from map coordinates', () => {
    const coords: [[number, number], [number, number], [number, number], [number, number]] = [
      [46.5, 24.5],
      [47.0, 24.5],
      [47.0, 24.0],
      [46.5, 24.0],
    ]
    const fc = footprintGeoJsonFromMapCoordinates(coords)
    expect(fc.type).toBe('FeatureCollection')
    const ring = fc.features[0]?.geometry
    expect(ring?.type).toBe('Polygon')
    if (ring?.type !== 'Polygon') return
    expect(ring.coordinates[0]).toHaveLength(5)
    expect(ring.coordinates[0][0]).toEqual([46.5, 24.5])
    expect(ring.coordinates[0][4]).toEqual(ring.coordinates[0][0])
  })

  it('computes axis-aligned bounds from corner coordinates', () => {
    const coords: [[number, number], [number, number], [number, number], [number, number]] = [
      [46.5, 24.5],
      [47.0, 24.5],
      [47.0, 24.0],
      [46.5, 24.0],
    ]
    const bounds = boundsWgs84FromMapCoordinates(coords)
    expect(bounds.west).toBe(46.5)
    expect(bounds.east).toBe(47.0)
    expect(bounds.south).toBe(24.0)
    expect(bounds.north).toBe(24.5)
  })

  it('exposes a safe Mapbox image dimension cap', () => {
    expect(MAPBOX_IMAGE_MAX_DIMENSION).toBeGreaterThanOrEqual(2048)
    expect(MAPBOX_IMAGE_MAX_DIMENSION).toBeLessThanOrEqual(8192)
  })
})
