import { describe, expect, it } from 'vitest'
import {
  ACP_CO_MARKER_GAP_X,
  ACP_CO_MARKER_GAP_Y,
  buildAcpCoLocatedMarkerFieldKeys,
  resolveAcpCoMarkerPixelOffset,
  resolveAcpWeatherFieldEdgePlacement,
} from './acpMapMarkerLayout'

describe('acpMapMarkerLayout', () => {
  it('returns zero offset for weather markers (edge placement)', () => {
    expect(resolveAcpCoMarkerPixelOffset('weather', false)).toEqual([0, 0])
    expect(resolveAcpCoMarkerPixelOffset('weather', true)).toEqual([0, 0])
  })

  it('offsets CHAS away from centroid when weather is also present', () => {
    const chas = resolveAcpCoMarkerPixelOffset('chas', true)
    expect(chas[0]).toBeLessThan(0)
    expect(chas[1]).toBeGreaterThan(0)
    expect(Math.abs(chas[0])).toBeGreaterThanOrEqual(Math.round(ACP_CO_MARKER_GAP_X * 0.55))
    expect(chas[1]).toBeGreaterThanOrEqual(Math.round(ACP_CO_MARKER_GAP_Y * 0.35))
  })

  it('builds shared field keys from both marker sets', () => {
    expect(
      buildAcpCoLocatedMarkerFieldKeys(['a', 'b'], ['b', 'c']),
    ).toEqual(new Set(['b']))
  })

  it('places weather readout on the NE field edge', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[55, 24], [55.1, 24], [55.1, 24.1], [55, 24.1], [55, 24]]],
    }
    const placement = resolveAcpWeatherFieldEdgePlacement(geometry, [55.05, 24.05])
    expect(placement.anchor).toBe('bottom-left')
    expect(placement.lngLat[0]).toBeGreaterThan(55.05)
    expect(placement.lngLat[1]).toBeGreaterThan(24.05)
    expect(placement.lngLat[0]).toBeLessThan(55.1)
    expect(placement.lngLat[1]).toBeLessThan(24.1)
  })
})
