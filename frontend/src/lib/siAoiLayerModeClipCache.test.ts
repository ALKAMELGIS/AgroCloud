import { describe, expect, it } from 'vitest'
import {
  getCachedSiAoiLayerModeClipMask,
  getCachedSentinelHubWmsDisplayChunks,
  siAoiLayerGeoJsonCacheSig,
  siAoiLayerModeClipMaskCacheKey,
  siAoiLayerModeMaskCacheKey,
  siAoiLayerModeSettingsPinKey,
  siAoiLayerModeWarmChunksCacheKey,
} from './siAoiLayerModeClipCache'

const layer = {
  id: 'fields-1',
  geojson: {
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 1 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [46.6, 24.7],
              [46.61, 24.7],
              [46.61, 24.71],
              [46.6, 24.71],
              [46.6, 24.7],
            ],
          ],
        },
      },
    ],
  },
}

describe('siAoiLayerModeClipCache', () => {
  it('returns the same mask instance for identical cache keys', () => {
    const settings = {
      sourceLayerId: 'fields-1',
      maskMode: 'entire-layer' as const,
      filterField: '',
      filterValues: [] as string[],
    }
    const a = getCachedSiAoiLayerModeClipMask(layer, settings, new Set())
    const b = getCachedSiAoiLayerModeClipMask(layer, settings, new Set())
    expect(a).toBe(b)
    expect(a?.features?.length).toBe(1)
  })

  it('settings pin key ignores viewport geo signature churn', () => {
    const settings = {
      sourceLayerId: 'fields-1',
      maskMode: 'entire-layer' as const,
      filterField: '',
      filterValues: [] as string[],
    }
    const pin = siAoiLayerModeSettingsPinKey(settings, new Set(), layer)
    const fullKey = siAoiLayerModeMaskCacheKey(layer, settings, new Set())
    expect(fullKey.startsWith(pin)).toBe(true)
    expect(pin).not.toContain('nobbox')
  })

  it('caches WMS display chunks by stable key', () => {
    const mask = getCachedSiAoiLayerModeClipMask(
      layer,
      {
        sourceLayerId: 'fields-1',
        maskMode: 'entire-layer',
        filterField: '',
        filterValues: [],
      },
      new Set(),
    )
    const maskKey = siAoiLayerModeMaskCacheKey(
      layer,
      { sourceLayerId: 'fields-1', maskMode: 'entire-layer', filterField: '', filterValues: [] },
      new Set(),
    )
    const chunkKey = `${maskKey}|layer:NDVI|scene:2024-06-01|vmin:|cap:8`
    const a = getCachedSentinelHubWmsDisplayChunks(mask, 'NDVI', { maxTileLayers: 8 }, chunkKey)
    const b = getCachedSentinelHubWmsDisplayChunks(mask, 'NDVI', { maxTileLayers: 8 }, chunkKey)
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('warm chunk cache key stays stable when viewport geo signature changes', () => {
    const settings = {
      sourceLayerId: 'fields-1',
      maskMode: 'entire-layer' as const,
      filterField: '',
      filterValues: [] as string[],
    }
    const pin = siAoiLayerModeSettingsPinKey(settings, new Set(), layer)
    const viewportLayer = {
      ...layer,
      geojson: {
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 99 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [47.0, 25.0],
                  [47.01, 25.0],
                  [47.01, 25.01],
                  [47.0, 25.01],
                  [47.0, 25.0],
                ],
              ],
            },
          },
        ],
      },
    }
    const warmA = siAoiLayerModeWarmChunksCacheKey(pin, 'NDVI', '2024-06-01', { maxTileLayers: 8 })
    const warmB = siAoiLayerModeWarmChunksCacheKey(pin, 'NDVI', '2024-06-01', { maxTileLayers: 8 })
    const geoChurnKey = siAoiLayerModeMaskCacheKey(viewportLayer, settings, new Set())
    expect(warmA).toBe(warmB)
    expect(warmA).not.toBe(
      siAoiLayerModeWarmChunksCacheKey(geoChurnKey, 'NDVI', '2024-06-01', { maxTileLayers: 8 }),
    )
    expect(warmA).toContain('vp:full')
    expect(
      siAoiLayerModeWarmChunksCacheKey(pin, 'NDVI', '2024-06-01', {
        maxTileLayers: 8,
        viewportBBox: [47, 25, 47.2, 25.2],
      }),
    ).toContain('vp:47.000')
    expect(siAoiLayerGeoJsonCacheSig(viewportLayer)).not.toBe(siAoiLayerGeoJsonCacheSig(layer))
  })

  it('clip mask cache key tracks pinned mask geometry not empty source layer', () => {
    const settings = {
      sourceLayerId: 'fields-1',
      maskMode: 'entire-layer' as const,
      filterField: '',
      filterValues: [] as string[],
    }
    const mask = getCachedSiAoiLayerModeClipMask(layer, settings, new Set())
    const emptyLayer = { id: 'fields-1', geojson: { features: [] } }
    const fromMask = siAoiLayerModeClipMaskCacheKey(mask, settings, new Set())
    const fromEmpty = siAoiLayerModeMaskCacheKey(emptyLayer, settings, new Set())
    expect(fromMask).not.toBe(fromEmpty)
    expect(fromMask).toContain('geo:')
  })

  it('builds entire-layer clip from populated viewport-like geojson', () => {
    const emptyMask = getCachedSiAoiLayerModeClipMask(
      { id: 'aoi-stream', geojson: { features: [] } },
      {
        sourceLayerId: 'aoi-stream',
        maskMode: 'entire-layer',
        filterField: '',
        filterValues: [],
      },
      new Set(),
    )
    expect(emptyMask).toBeNull()
    const mask = getCachedSiAoiLayerModeClipMask(
      { id: 'aoi-stream', geojson: layer.geojson },
      {
        sourceLayerId: 'aoi-stream',
        maskMode: 'entire-layer',
        filterField: 'Structure_Type',
        filterValues: ['1006', '1007'],
      },
      new Set(),
    )
    expect(mask?.features?.length).toBe(1)
  })
})
