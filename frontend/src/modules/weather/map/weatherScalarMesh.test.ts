import { describe, expect, it } from 'vitest'
import { getWeatherMapLayer } from '../config/weatherLayerCatalog'
import { buildScalarMesh } from './weatherScalarMesh'

describe('buildScalarMesh', () => {
  it('builds a smooth grid from sparse samples', () => {
    const layer = getWeatherMapLayer('temperature')
    const samples = [
      { lat: 25, lng: 55, value: 30 },
      { lat: 25, lng: 56, value: 32 },
      { lat: 26, lng: 55, value: 28 },
      { lat: 26, lng: 56, value: 31 },
    ]
    const mesh = buildScalarMesh(
      samples,
      { west: 54.9, south: 24.9, east: 56.1, north: 26.1 },
      8,
      8,
      layer,
    )
    expect(mesh).not.toBeNull()
    expect(mesh!.values.length).toBe(64)
    expect(mesh!.values.some(v => Number.isFinite(v))).toBe(true)
  })
})
