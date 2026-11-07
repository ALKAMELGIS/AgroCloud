import { describe, expect, it, vi } from 'vitest'
import { buildSentinelHubWmsDisplayChunks } from '@/modules/remote-sensing/imagery/sentinelHubWmsAoiClip'
import {
  buildDevelopEliteMapRasterStack,
  buildDevelopEliteRasterClipFeatureCollection,
  buildDevelopEliteRasterWmsClipSource,
  isDevelopEliteClippedRasterStackReady,
} from './developEliteMapRasterEngine'
import { defaultDevelopEliteRasterSlot } from './developEliteMapRasterConfig'
import {
  DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE,
  DEVELOP_ELITE_PIVOT_STRUCTURE_CODE,
} from './developEliteMapRasterConfig'

vi.mock('@/modules/remote-sensing/imagery/siSentinelAoiWmsStack', async importOriginal => {
  const actual = await importOriginal<typeof import('@/modules/remote-sensing/imagery/siSentinelAoiWmsStack')>()
  return {
    ...actual,
    buildSiSentinelAoiWmsStackState: vi.fn((idPrefix: string, input: { activeWmsLayer: string | null }) => ({
      idPrefix,
      clipSource: input,
      displayChunks: [{ geometryWkt3857: null, evalscriptB64: 'abc' }],
      tileUrls: [`mock-wms-${input.activeWmsLayer}`],
      tilePixels: 512,
      aoiBoundsLngLat: null,
      renderReady: true,
      sessionKey: 's',
      sourceRefreshKey: 'r',
    })),
  }
})

describe('buildDevelopEliteRasterClipFeatureCollection', () => {
  const structures: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Structure_Type: DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE },
        geometry: {
          type: 'Polygon',
          coordinates: [[[54.5, 24.4], [54.6, 24.4], [54.6, 24.5], [54.5, 24.5], [54.5, 24.4]]],
        },
      },
      {
        type: 'Feature',
        properties: { Structure_Type: DEVELOP_ELITE_PIVOT_STRUCTURE_CODE },
        geometry: {
          type: 'Polygon',
          coordinates: [[[55.5, 25.4], [55.6, 25.4], [55.6, 25.5], [55.5, 25.5], [55.5, 25.4]]],
        },
      },
    ],
  }

  const viewport = { west: 54, south: 24, east: 55, north: 25, zoom: 10 }

  it('returns empty FC when clipmask off', () => {
    const slot = { ...defaultDevelopEliteRasterSlot('NDVI'), clipmask: false }
    const clip = buildDevelopEliteRasterClipFeatureCollection(structures, slot, viewport)
    expect(clip.features).toHaveLength(0)
  })

  it('farm-only clip reduces feature count', () => {
    const slot = {
      ...defaultDevelopEliteRasterSlot('NDVI'),
      clipmask: true,
      clipSubtype: 'farm' as const,
    }
    const clip = buildDevelopEliteRasterClipFeatureCollection(structures, slot, viewport)
    expect(clip.features).toHaveLength(1)
    expect(clip.features[0]?.properties?.Structure_Type).toBe(DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE)
  })
})

describe('buildDevelopEliteRasterWmsClipSource', () => {
  const ring: GeoJSON.Position[] = [
    [54.5, 24.4],
    [54.6, 24.4],
    [54.6, 24.5],
    [54.5, 24.5],
    [54.5, 24.4],
  ]
  const structures: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Structure_Type: DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  }

  it('builds NDVI WMS chunks with geometry WKT and dataMask evalscript', () => {
    const slot = { ...defaultDevelopEliteRasterSlot('NDVI'), clipmask: true }
    const mask = buildDevelopEliteRasterWmsClipSource(structures, slot, null)
    expect(mask?.features.length).toBe(1)
    const chunks = buildSentinelHubWmsDisplayChunks(mask, 'NDVI', { sceneDate: '2025-06-01' })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every(c => c.geometryWkt3857 && c.evalscriptB64)).toBe(true)
  })
})

describe('isDevelopEliteClippedRasterStackReady', () => {
  it('rejects clipmask stacks without geometry WKT', () => {
    const slot = { ...defaultDevelopEliteRasterSlot('NDVI'), clipmask: true, showOnMap: true }
    const stack = {
      renderReady: true,
      tileUrls: ['u'],
      displayChunks: [{ geometryWkt3857: null, evalscriptB64: 'x' }],
    } as import('@/modules/remote-sensing/imagery/siSentinelAoiWmsStack').SiSentinelAoiWmsStackState
    expect(isDevelopEliteClippedRasterStackReady(slot, stack)).toBe(false)
  })
})

describe('buildDevelopEliteMapRasterStack', () => {
  it('builds stack with NDVI layer id', async () => {
    const { buildSiSentinelAoiWmsStackState } = await import(
      '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
    )
    const slot = { ...defaultDevelopEliteRasterSlot('NDVI'), showOnMap: true }
    const stack = buildDevelopEliteMapRasterStack({
      slot,
      slotIndex: 0,
      structuresGeoJson: { type: 'FeatureCollection', features: [] },
      viewport: null,
      sentinelFetchDate: '2025-06-01',
    })
    expect(stack.tileUrls[0]).toContain('NDVI')
    expect(buildSiSentinelAoiWmsStackState).toHaveBeenCalled()
  })
})
