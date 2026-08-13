import { describe, expect, it } from 'vitest'
import {
  FTW_FINISH_MIN_AREA_M2,
  finishMergeOptions,
  finishMinAreaM2,
  isFtwFieldEngine,
  mergeFieldFragments,
} from './fieldMerge'

function rectM(
  westM: number,
  southM: number,
  widthM: number,
  heightM: number,
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  const lon0 = 55
  const lat0 = 24
  const mLon = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const mLat = 111_320
  const lon = (x: number) => lon0 + x / mLon
  const lat = (y: number) => lat0 + y / mLat
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon(westM), lat(southM)],
          [lon(westM + widthM), lat(southM)],
          [lon(westM + widthM), lat(southM + heightM)],
          [lon(westM), lat(southM + heightM)],
          [lon(westM), lat(southM)],
        ],
      ],
    },
  }
}

describe('mergeFieldFragments', () => {
  it('unions touching fragments of the same field', () => {
    const left = rectM(0, 0, 81, 100, { confidence: 0.9 })
    const right = rectM(80, 0, 80, 100, { confidence: 0.8 }) // 1 m overlap
    const out = mergeFieldFragments(
      { type: 'FeatureCollection', features: [left, right] },
      { gapMeters: 10, contactFrac: 0.2, minAreaM2: 1 },
    )
    expect(out.features.length).toBe(1)
    expect(out.features[0]!.properties?.field_merged).toBe(true)
  })

  it('keeps neighbours separated by a clear gap (road)', () => {
    const left = rectM(0, 0, 80, 100, { confidence: 0.9 })
    const right = rectM(100, 0, 80, 100, { confidence: 0.8 }) // 20 m gap
    const out = mergeFieldFragments(
      { type: 'FeatureCollection', features: [left, right] },
      { gapMeters: 8, contactFrac: 0.35, minAreaM2: 1 },
    )
    expect(out.features.length).toBe(2)
  })

  it('respects enabled=false', () => {
    const left = rectM(0, 0, 80, 100)
    const right = rectM(80, 0, 80, 100)
    const out = mergeFieldFragments(
      { type: 'FeatureCollection', features: [left, right] },
      { enabled: false },
    )
    expect(out.features.length).toBe(2)
  })

  it('FTW finish floor drops pinhead squares even when UI minArea is 1', () => {
    expect(isFtwFieldEngine('ftw-live')).toBe(true)
    expect(finishMinAreaM2(1, true)).toBe(FTW_FINISH_MIN_AREA_M2)
    const opts = finishMergeOptions(1, { ftw: true })
    expect(opts.minAreaM2).toBe(500)
    expect(opts.gapMeters).toBe(14)
    expect(opts.contactFrac).toBe(0.2)

    const pinhead = rectM(0, 0, 10, 10) // ~100 m²
    const field = rectM(50, 0, 80, 100) // ~8000 m²
    const out = mergeFieldFragments(
      { type: 'FeatureCollection', features: [pinhead, field] },
      opts,
    )
    expect(out.features.length).toBe(1)
    expect(out.features[0]!.geometry.type).toBe('Polygon')
  })
})
