import { describe, expect, it } from 'vitest'
import {
  buildAcpCoLocatedMarkerFieldKeys,
  resolveAcpCoMarkerPixelOffset,
  resolveAcpWeatherFieldEdgePlacement,
} from './acpMapMarkerLayout'

describe('acpMapMarkerLayout', () => {
  it('keeps CHAS markers at centroid regardless of weather layer', () => {
    expect(resolveAcpCoMarkerPixelOffset('chas', false)).toEqual([0, 0])
    expect(resolveAcpCoMarkerPixelOffset('chas', true)).toEqual([0, 0])
    expect(resolveAcpCoMarkerPixelOffset('weather', true)).toEqual([0, 0])
  })

  it('builds shared field keys from both marker sets', () => {
    expect(
      buildAcpCoLocatedMarkerFieldKeys(['a', 'b'], ['b', 'c']),
    ).toEqual(new Set(['b']))
  })

  it('places weather readout outside the NE field edge', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[55, 24], [55.1, 24], [55.1, 24.1], [55, 24.1], [55, 24]]],
    }
    const placement = resolveAcpWeatherFieldEdgePlacement(geometry, [55.05, 24.05])
    expect(placement.anchor).toBe('bottom-left')
    expect(placement.lngLat[0]).toBeGreaterThan(55.1)
    expect(placement.lngLat[1]).toBeGreaterThan(24.1)
    expect(placement.pixelOffset[0]).toBeGreaterThan(0)
    expect(placement.pixelOffset[1]).toBeLessThan(0)
  })
})
