import { describe, expect, it } from 'vitest'
import {
  layersAoiClipNeedsHydrate,
  layersAoiExpectedFeatureCount,
  pickLargestFeatureCollection,
  resolveLayersAoiClipGeoJson,
} from './layersAoiClipGeoJson'
import { SiViewportFeatureCache } from './siViewportFeatureCache'

function fc(n: number) {
  return {
    type: 'FeatureCollection' as const,
    features: Array.from({ length: n }, (_, i) => ({
      type: 'Feature',
      properties: { OBJECTID: i + 1 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    })),
  }
}

describe('layersAoiClipGeoJson', () => {
  it('picks the largest collection regardless of fixed farm counts', () => {
    expect(pickLargestFeatureCollection(fc(4), fc(30), fc(12))?.features.length).toBe(30)
    expect(pickLargestFeatureCollection(fc(1), fc(7))?.features.length).toBe(7)
    expect(pickLargestFeatureCollection(null, fc(2))?.features.length).toBe(2)
  })

  it('prefers accumulated cache over viewport slice for any layer size', () => {
    const cache = new SiViewportFeatureCache()
    cache.merge(fc(18).features)
    const out = resolveLayersAoiClipGeoJson({
      layer: { id: 'any-layer', name: 'Any', geojson: fc(3), viewportStreaming: true },
      viewportCache: cache,
      viewportGeoJson: fc(3),
    })
    expect(out?.features.length).toBe(18)
  })

  it('uses full local geojson when cache is empty (uploaded shapefile)', () => {
    const out = resolveLayersAoiClipGeoJson({
      layer: { id: 'upload', name: 'Upload', geojson: fc(42) },
      viewportCache: null,
      viewportGeoJson: null,
    })
    expect(out?.features.length).toBe(42)
  })

  it('needs hydrate when pin is thinner than metadata / cache (any N)', () => {
    expect(
      layersAoiClipNeedsHydrate({
        layer: {
          id: 'a',
          source: 'arcgis',
          sourceUrl: 'https://example.com/FeatureServer/0',
          viewportStreaming: true,
          importMetadata: { featureCount: 87 },
        } as any,
        pinFeatureCount: 4,
        cacheFeatureCount: 4,
      }),
    ).toBe(true)
    expect(
      layersAoiClipNeedsHydrate({
        layer: {
          id: 'b',
          source: 'arcgis',
          sourceUrl: 'https://example.com/FeatureServer/0',
          geojson: fc(12),
        } as any,
        pinFeatureCount: 12,
        cacheFeatureCount: 12,
      }),
    ).toBe(false)
  })

  it('reads expected count from importMetadata when present', () => {
    expect(
      layersAoiExpectedFeatureCount({
        id: 'x',
        importMetadata: { featureCount: 215 },
      } as any),
    ).toBe(215)
  })
})
