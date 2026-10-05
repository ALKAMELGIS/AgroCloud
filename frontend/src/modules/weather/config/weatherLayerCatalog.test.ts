import { describe, expect, it } from 'vitest'
import { buildOpenMeteoMapTileUrl, formatOpenMeteoMapTileTime } from './weatherLayerCatalog'
import { windDegSpeedToUv } from '../map/weatherFieldGrid'

describe('formatOpenMeteoMapTileTime', () => {
  it('normalizes to hour precision', () => {
    expect(formatOpenMeteoMapTileTime('2026-10-05T15:30:00')).toBe('2026-10-05T15:30')
    expect(formatOpenMeteoMapTileTime('2026-10-05 15:30')).toBe('2026-10-05T15:30')
  })
})

describe('buildOpenMeteoMapTileUrl', () => {
  it('appends time query for ECMWF tiles', () => {
    const url = buildOpenMeteoMapTileUrl('temperature_2m', '2026-10-05T12:00:00Z')
    expect(url).toContain('temperature_2m')
    expect(url).toContain('time=2026-10-05T12%3A00')
  })
})

describe('windDegSpeedToUv', () => {
  it('maps north wind to negative v', () => {
    const { u, v } = windDegSpeedToUv(36, 0)
    expect(Math.abs(u)).toBeLessThan(0.01)
    expect(v).toBeLessThan(0)
  })
})
