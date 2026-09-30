import { describe, expect, it } from 'vitest'
import {
  CROP_COUNTRY_OPTIONS,
  clampBboxForCropImagery,
  countryAoiFeature,
  cropCountryOptionKey,
} from './siCropCountryAoi'

describe('siCropCountryAoi', () => {
  it('lists crop-profile countries as priority seed', () => {
    expect(CROP_COUNTRY_OPTIONS.some(c => c.code === 'EG')).toBe(true)
    expect(CROP_COUNTRY_OPTIONS.some(c => c.name === 'Egypt')).toBe(true)
  })

  it('builds stable option keys for ISO and name-only rows', () => {
    expect(cropCountryOptionKey('eg', 'Egypt')).toBe('EG')
    expect(cropCountryOptionKey('', 'Some Territory')).toBe('N:Some Territory')
  })

  it('clamps large national bboxes for high-res imagery (~0.05°)', () => {
    const clamped = clampBboxForCropImagery([24.7, 22.0, 36.9, 31.7])
    expect(clamped[2] - clamped[0]).toBeLessThanOrEqual(0.051)
    expect(clamped[3] - clamped[1]).toBeLessThanOrEqual(0.051)
  })

  it('builds a country AOI data-mask feature for the map', () => {
    const geom: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [30, 28],
          [32, 28],
          [32, 30],
          [30, 30],
          [30, 28],
        ],
      ],
    }
    const f = countryAoiFeature(geom, { code: 'EG', name: 'Egypt' })
    expect(f.properties?.countryCode).toBe('EG')
    expect(f.properties?.aoiMask).toBe(true)
    expect(f.properties?.aoiSource).toBe('country-mask')
    expect(f.geometry).toEqual(geom)
  })

  it('shrinks national AOIs for high-res crop inference chips', async () => {
    const { aoiForCropInference, aoiSpansFarBeyondPredictionBounds, resolveCropGridSize } =
      await import('./siCropCountryAoi')
    const egyptLike: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [24.7, 22],
          [36.9, 22],
          [36.9, 31.7],
          [24.7, 31.7],
          [24.7, 22],
        ],
      ],
    }
    const chip = aoiForCropInference(egyptLike)
    expect(chip.type).toBe('Polygon')
    const ring = (chip as GeoJSON.Polygon).coordinates[0]!
    const lngs = ring.map(p => p[0]!)
    const lats = ring.map(p => p[1]!)
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeLessThanOrEqual(0.051)
    expect(Math.max(...lats) - Math.min(...lats)).toBeLessThanOrEqual(0.051)
    expect(aoiSpansFarBeyondPredictionBounds(egyptLike, [30, 28, 30.8, 28.8])).toBe(true)
    const size = resolveCropGridSize([30, 28, 30.05, 28.05], 10, 512)
    expect(size).toBeGreaterThanOrEqual(256)
    expect(size).toBeLessThanOrEqual(512)
  })
})
