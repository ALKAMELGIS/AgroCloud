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

  it('uses analysis geojson over viewport slices for streaming layers', () => {
    const cache = new SiViewportFeatureCache()
    cache.merge(fc(4).features)
    const out = resolveLayersAoiClipGeoJson({
      layer: {
        id: 'potato',
        name: 'Potato',
        source: 'arcgis',
        geojson: fc(4),
        viewportStreaming: true,
      },
      analysisGeoJson: fc(30),
      analysisComplete: true,
      viewportCache: cache,
      viewportGeoJson: fc(4),
    })
    expect(out?.features.length).toBe(30)
  })

  it('does not use viewport slice as analysis clip for streaming layers', () => {
    const cache = new SiViewportFeatureCache()
    cache.merge(fc(4).features)
    const out = resolveLayersAoiClipGeoJson({
      layer: {
        id: 'potato',
        name: 'Potato',
        source: 'arcgis',
        sourceUrl: 'https://example.com/FeatureServer/0',
        geojson: fc(4),
        viewportStreaming: true,
      },
      viewportCache: cache,
      viewportGeoJson: fc(4),
    })
    expect(out).toBeNull()
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
        analysisComplete: true,
        analysisLoadedCount: 12,
      }),
    ).toBe(false)
  })

  it('does not hydrate after a complete analysis query even if viewport cache is smaller', () => {
    expect(
      layersAoiClipNeedsHydrate({
        layer: {
          id: 'potato',
          source: 'arcgis',
          sourceUrl: 'https://example.com/FeatureServer/0',
          viewportStreaming: true,
          importMetadata: { featureCount: 30 },
        } as any,
        pinFeatureCount: 30,
        cacheFeatureCount: 4,
        analysisComplete: true,
        analysisLoadedCount: 30,
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
