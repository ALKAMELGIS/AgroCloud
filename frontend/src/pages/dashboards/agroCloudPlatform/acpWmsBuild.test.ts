import { describe, expect, it } from 'vitest'
import { buildAgroStructuresLayerAoiMask, fetchAgroStructuresGeoJson } from '../../../lib/agroStructuresPrimaryAoi'
import { buildAcpWmsSessionClipFeatureCollection, buildAcpWmsTileClipSource, resolveAcpWmsBuildOptions } from './acpWmsClip'
import { buildAcpWmsChunkTileEntries, limitAcpWmsTileEntries } from './acpWmsViewportEngine'
import {
  buildSentinelLayerLiveDisplayChunks,
  isSentinelLayerLiveWmsRenderReady,
} from '../../../lib/sentinelLayerLiveWmsEngine'

describe('limitAcpWmsTileEntries', () => {
  it('passthrough — layer cap is applied at WKT merge build time', () => {
    const entries = [
      { spec: { url: 'a' }, bounds: [0, 0, 1, 1] },
      { spec: { url: 'b' }, bounds: [1, 1, 2, 2] },
      { spec: { url: 'c' }, bounds: [2, 2, 3, 3] },
    ] as ReturnType<typeof buildAcpWmsChunkTileEntries>

    expect(limitAcpWmsTileEntries(entries, 2)).toHaveLength(3)
    expect(limitAcpWmsTileEntries(entries, 2)).toEqual(entries)
  })
})

describe('ACP WMS tile build', () => {
  it('builds render-ready NDVI chunks and GetMap URLs for session clip', async () => {
    const data = await fetchAgroStructuresGeoJson()
    const mask = buildAgroStructuresLayerAoiMask(data)
    expect(mask?.features.length).toBeGreaterThan(10)

    const clip = buildAcpWmsTileClipSource(mask!, 'all')
    const opts = resolveAcpWmsBuildOptions(clip.features.length)
    const chunks = buildSentinelLayerLiveDisplayChunks(clip, 'NDVI', opts)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(64)
    expect(isSentinelLayerLiveWmsRenderReady('NDVI', chunks, clip)).toBe(true)

    const entries = buildAcpWmsChunkTileEntries(clip, 'NDVI', '2026-05-01', '2026-06-16', 20, 32)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.length).toBeLessThanOrEqual(64)
    for (const entry of entries) {
      expect(entry.spec.url).toContain('GetMap')
      expect(entry.spec.url).toContain('TIME=')
      expect(entry.spec.url).toContain('GEOMETRY=')
      expect(entry.spec.url).toContain('EVALSCRIPT=')
      expect(entry.bounds).toBeTruthy()
    }
  }, 120_000)
})
