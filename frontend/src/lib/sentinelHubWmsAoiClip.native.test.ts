import { describe, expect, it } from 'vitest'
import {
  buildSentinelHubWmsAoiClip,
  buildSentinelHubWmsDisplayChunks,
  canRenderSentinelHubWmsLayerOnMap,
  isSentinelHubWmsRenderReady,
  usesPresetSentinelHubWmsLayer,
} from './sentinelHubWmsAoiClip'

describe('sentinelHubWmsAoiClip native layers', () => {
  const drawn = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [55.1, 25.1],
          [55.2, 25.1],
          [55.2, 25.2],
          [55.1, 25.2],
          [55.1, 25.1],
        ],
      ],
    },
  }

  it('clips NDVI to AOI geometry with SCL 10-class client evalscript', () => {
    const { evalscriptB64, geometryWkt3857 } = buildSentinelHubWmsAoiClip(drawn, 'NDVI')
    expect(geometryWkt3857).toMatch(/^POLYGON\(|^MULTIPOLYGON\(/)
    expect(evalscriptB64).toBeTruthy()
    const decoded = atob(evalscriptB64!)
    expect(decoded).toContain('index(samples.B08, samples.B04)')
    expect(decoded).toContain('imgVals.concat(1)')
    expect(decoded).not.toContain('concat(samples.dataMask)')
    expect(decoded).not.toContain('scl == 3')
  })

  it('keeps preset Highlight Optimized Natural Color on server evalscript (GEOMETRY only)', () => {
    expect(usesPresetSentinelHubWmsLayer('HIGHLIGHT_OPTIMIZED_NATURAL_COLOR')).toBe(true)
    const { evalscriptB64, geometryWkt3857 } = buildSentinelHubWmsAoiClip(
      drawn,
      'HIGHLIGHT_OPTIMIZED_NATURAL_COLOR',
    )
    expect(geometryWkt3857).toBeTruthy()
    expect(evalscriptB64).toBeNull()
  })

  it('renders analytical layers on full map canvas without AOI geometry', () => {
    const ndviChunks = buildSentinelHubWmsDisplayChunks(null, 'NDVI')
    expect(ndviChunks.length).toBe(1)
    expect(ndviChunks[0]?.geometryWkt3857).toBeNull()
    expect(ndviChunks[0]?.evalscriptB64).toBeTruthy()
    expect(canRenderSentinelHubWmsLayerOnMap('NDVI', ndviChunks)).toBe(true)
    expect(isSentinelHubWmsRenderReady('NDVI', ndviChunks)).toBe(true)

    for (const layer of ['SAVI', 'VHS', 'CHAS', 'DCHAS'] as const) {
      const chunks = buildSentinelHubWmsDisplayChunks(null, layer)
      expect(chunks.length).toBe(1)
      expect(chunks[0]?.geometryWkt3857).toBeNull()
      expect(chunks[0]?.evalscriptB64).toBeTruthy()
      expect(canRenderSentinelHubWmsLayerOnMap(layer, chunks)).toBe(true)
      expect(isSentinelHubWmsRenderReady(layer, chunks)).toBe(true)
    }
  })

  it('uses full canvas without AOI and geometry clip when Agro_Structures mask exists', () => {
    const drawn = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.1, 25.1],
            [55.2, 25.1],
            [55.2, 25.2],
            [55.1, 25.2],
            [55.1, 25.1],
          ],
        ],
      },
    }
    const chunks = buildSentinelHubWmsDisplayChunks(null, 'SAVI')
    expect(chunks[0]?.geometryWkt3857).toBeNull()
    expect(isSentinelHubWmsRenderReady('SAVI', chunks, { aoiBoundsLngLat: null })).toBe(true)
    const clipped = buildSentinelHubWmsDisplayChunks(drawn, 'SAVI')
    expect(clipped.length).toBeGreaterThan(0)
    expect(clipped[0]?.geometryWkt3857).toMatch(/^POLYGON\(|^MULTIPOLYGON\(/)
    expect(clipped[0]?.evalscriptB64).toBeTruthy()
    expect(
      isSentinelHubWmsRenderReady('SAVI', clipped, {
        aoiBoundsLngLat: [55.1, 25.1, 55.2, 25.2],
      }),
    ).toBe(true)
  })
})
