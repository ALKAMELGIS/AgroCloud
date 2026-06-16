import { describe, expect, it } from 'vitest'
import { buildAgroStructuresLayerAoiMask, fetchAgroStructuresGeoJson } from './agroStructuresPrimaryAoi'
import { buildSentinelHubWmsAoiClipChunks } from './sentinelHubWmsAoiClip'

describe('Agro_Structures live WMS clip diagnostic', () => {
  it('loads Farm Plots + PIVOT only and builds chunked WMS geometry under URL limits', async () => {
    const data = await fetchAgroStructuresGeoJson()
    expect(data.features.length).toBeGreaterThan(500)
    const mask = buildAgroStructuresLayerAoiMask(data)
    expect(mask?.features.length).toBeGreaterThan(400)
    expect(mask!.features.length).toBeLessThan(data.features.length)
    for (const layer of ['NDVI', 'TRUE_COLOR', 'NDMI']) {
      const chunks = buildSentinelHubWmsAoiClipChunks(mask, layer)
      expect(chunks.length, `${layer} chunks`).toBeGreaterThan(1)
      for (const [i, chunk] of chunks.entries()) {
        expect(chunk.geometryWkt3857, `${layer} chunk ${i} geometry`).toBeTruthy()
        expect(chunk.geometryWkt3857.length, `${layer} chunk ${i} wkt len`).toBeLessThan(7000)
        expect(chunk.evalscriptB64, `${layer} chunk ${i} evalscript`).toBeTruthy()
      }
    }
  }, 120_000)
})
