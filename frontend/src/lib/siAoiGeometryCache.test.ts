import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSiAoiGeometryCache,
  ensureSiAoiGeometryCache,
  getSiAoiGeometryRecord,
  isSiAoiGeometryComplete,
  layerNeedsFullAoiServiceQuery,
  peekSiAoiAnalysisGeoJson,
} from './siAoiGeometryCache'

vi.mock('./arcgisFeatureLayerGeoJson', () => ({
  fetchArcGisFeatureLayerGeoJson: vi.fn(async () => ({
    type: 'FeatureCollection',
    features: Array.from({ length: 30 }, (_, i) => ({
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
  })),
}))

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

describe('siAoiGeometryCache', () => {
  afterEach(() => {
    clearSiAoiGeometryCache()
    vi.clearAllMocks()
  })

  it('requires a full service query for viewport-streaming ArcGIS layers', () => {
    expect(
      layerNeedsFullAoiServiceQuery({
        id: 'potato',
        source: 'arcgis',
        sourceUrl: 'https://example.com/FeatureServer/0',
        viewportStreaming: true,
        geojson: fc(4),
        importMetadata: { featureCount: 30 },
      }),
    ).toBe(true)
    expect(
      layerNeedsFullAoiServiceQuery({
        id: 'upload',
        source: 'upload',
        geojson: fc(42),
      }),
    ).toBe(false)
  })

  it('seeds uploaded layers from local geojson without a service query', async () => {
    const rec = await ensureSiAoiGeometryCache({
      id: 'upload',
      source: 'upload',
      geojson: fc(12),
    })
    expect(rec.status).toBe('complete')
    expect(rec.loadedCount).toBe(12)
    expect(rec.queriedUrl).toBeNull()
    expect(peekSiAoiAnalysisGeoJson('upload')?.features.length).toBe(12)
  })

  it('queries the full FeatureServer for streaming layers instead of the viewport slice', async () => {
    const rec = await ensureSiAoiGeometryCache({
      id: 'potato',
      source: 'arcgis',
      sourceUrl: 'https://example.com/FeatureServer/0',
      viewportStreaming: true,
      geojson: fc(4),
      importMetadata: { featureCount: 30 },
    })
    expect(isSiAoiGeometryComplete(rec)).toBe(true)
    expect(rec.loadedCount).toBe(30)
    expect(rec.queriedUrl).toContain('FeatureServer/0')
    expect(getSiAoiGeometryRecord('potato')?.loadedCount).toBe(30)
  })

  it('reuses a completed service query', async () => {
    const { fetchArcGisFeatureLayerGeoJson } = await import('./arcgisFeatureLayerGeoJson')
    const first = await ensureSiAoiGeometryCache({
      id: 'potato',
      source: 'arcgis',
      sourceUrl: 'https://example.com/FeatureServer/0',
      viewportStreaming: true,
      geojson: { features: [] },
    })
    const second = await ensureSiAoiGeometryCache({
      id: 'potato',
      source: 'arcgis',
      sourceUrl: 'https://example.com/FeatureServer/0',
      viewportStreaming: true,
      geojson: { features: [] },
    })
    expect(second).toBe(first)
    expect(fetchArcGisFeatureLayerGeoJson).toHaveBeenCalledTimes(1)
  })
})
