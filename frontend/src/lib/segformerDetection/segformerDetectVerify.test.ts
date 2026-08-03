import { describe, expect, it } from 'vitest'
import {
  getSegFormerClass,
  getSegFormerDefaultMinConfidence,
  SEGFORMER_AG_MIN_CONFIDENCE,
  SEGFORMER_DEFAULT_MIN_CONFIDENCE,
} from './segformerCatalog'
import { hasSegFormerDrawableResult } from '../../pages/satellite/components/segformerDetection/useSegFormerDetection'

describe('segformer Detect verify (ag mapping + drawable overlay)', () => {
  it('uses ADE20K field(29) only for Agricultural Field (field pipeline)', () => {
    const field = getSegFormerClass(1)
    expect(field?.ade20kIndices).toEqual([29])
  })

  it('keeps broader proxies for other Agriculture field classes', () => {
    const cultivated = getSegFormerClass(2)
    expect(cultivated?.ade20kIndices).toEqual(expect.arrayContaining([29, 9, 17, 13]))

    const irrigated = getSegFormerClass(6)
    expect(irrigated?.ade20kIndices).toEqual(expect.arrayContaining([29, 9, 17]))

    const rainfed = getSegFormerClass(7)
    expect(rainfed?.ade20kIndices).toEqual(expect.arrayContaining([29, 9, 17, 13]))
  })

  it('uses a lower default confidence for agriculture / trees', () => {
    expect(getSegFormerDefaultMinConfidence('agriculture')).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence('trees')).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence('buildings')).toBe(SEGFORMER_DEFAULT_MIN_CONFIDENCE)
    expect(SEGFORMER_AG_MIN_CONFIDENCE).toBeLessThan(SEGFORMER_DEFAULT_MIN_CONFIDENCE)
  })

  it('treats polygons and/or mask_png as drawable map results', () => {
    expect(hasSegFormerDrawableResult(null)).toBe(false)
    expect(
      hasSegFormerDrawableResult({
        geojson: { type: 'FeatureCollection', features: [] },
        maskPng: null,
      }),
    ).toBe(false)

    expect(
      hasSegFormerDrawableResult({
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                  ],
                ],
              },
            },
          ],
        },
        maskPng: null,
      }),
    ).toBe(true)

    expect(
      hasSegFormerDrawableResult({
        geojson: { type: 'FeatureCollection', features: [] },
        maskPng: 'data:image/png;base64,aaa',
      }),
    ).toBe(true)
  })
})
