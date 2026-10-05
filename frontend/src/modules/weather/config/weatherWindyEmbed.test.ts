import { describe, expect, it } from 'vitest'
import { estimateMapZoomForBounds } from './weatherMapView'
import { resolveWindyMapView } from './weatherWindyEmbed'

describe('resolveWindyMapView', () => {
  it('fits all locations to shared bounds center', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [55.27, 25.2] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-7.98, 31.63] },
        },
      ],
    }
    const view = resolveWindyMapView({
      farmId: 'all',
      lat: 25,
      lon: 55,
      agriLocations: fc,
    })
    expect(view.zoom).toBeLessThanOrEqual(6)
    expect(view.lat).toBeGreaterThan(20)
    expect(view.lat).toBeLessThan(35)
  })

  it('uses exact agri point for a single farm', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 12 },
          geometry: { type: 'Point', coordinates: [54.5, 24.4] },
        },
      ],
    }
    const view = resolveWindyMapView({
      farmId: 'loc-12',
      lat: 0,
      lon: 0,
      agriLocations: fc,
    })
    expect(view.zoom).toBe(10)
    expect(view.lat).toBeCloseTo(24.4, 1)
    expect(view.lon).toBeCloseTo(54.5, 1)
  })
})

describe('estimateMapZoomForBounds', () => {
  it('returns lower zoom for wide spans', () => {
    expect(estimateMapZoomForBounds(-40, 50, -20, 60)).toBeLessThanOrEqual(4)
  })
})
