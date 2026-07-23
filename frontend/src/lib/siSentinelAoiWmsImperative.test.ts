import { describe, expect, it, vi } from 'vitest'
import { SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX } from './siSentinelAoiWmsStack'
import {
  createSiSentinelAoiWmsPingPongRuntime,
  ensureSiSentinelAoiWmsPingPongStackOnMap,
  hideSiSentinelAoiWmsPingPongStack,
  isSiSentinelAoiWmsPingPongMapId,
  revealSiSentinelAoiWmsPingPongStack,
  siSentinelAoiWmsPingPongLayerId,
  siSentinelAoiWmsPingPongSourceId,
  syncSiSentinelAoiWmsPingPongStack,
} from './siSentinelAoiWmsImperative'

describe('siSentinelAoiWmsImperative', () => {
  it('builds ping-pong source and layer ids', () => {
    expect(siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)).toBe(
      'sentinel-layer-aoi-source-0-s1',
    )
    expect(siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 2, 0)).toBe(
      'sentinel-layer-aoi-layer-2-s0',
    )
    expect(isSiSentinelAoiWmsPingPongMapId('sentinel-layer-aoi-layer-2-s0')).toBe(true)
    expect(isSiSentinelAoiWmsPingPongMapId('sentinel-layer-aoi-layer-2')).toBe(false)
  })

  it('keeps active slot visible until inactive tiles are ready', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = {
      idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
      clipSource: null,
      displayChunks: [{ evalscriptB64: 'abc' }],
      tileUrls: ['https://example.test/a'],
      tilePixels: 512,
      aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
      renderReady: true,
      sessionKey: 'sess',
      sourceRefreshKey: 'refresh',
    }

    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, Record<string, unknown>>()
    const layout: Array<[string, string, unknown]> = []
    const paint: Array<[string, string, unknown]> = []
    let loaded = new Set<string>()

    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: (id: string) => (layers.has(id) ? {} : null),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn((tiles: string[]) => { src.tiles = [...tiles] }) }
        sources.set(id, src)
      },
      addLayer: (spec: { id: string }) => {
        layers.set(spec.id, spec)
      },
      isSourceLoaded: (id: string) => loaded.has(id),
      on: vi.fn(),
      off: vi.fn(),
      setLayoutProperty: (id: string, prop: string, value: unknown) => {
        layout.push([id, prop, value])
      },
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        paint.push([id, prop, value])
      },
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const inactiveSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    loaded.add(activeSource)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })

    expect(sources.has(activeSource)).toBe(true)
    expect(layout).toContainEqual([activeLayer, 'visibility', 'visible'])

    syncSiSentinelAoiWmsPingPongStack(
      map as any,
      { ...stack, tileUrls: ['https://example.test/b'] } as any,
      runtime,
      { visible: true, opacity: 0.9 },
    )

    expect(sources.get(inactiveSource)?.setTiles).toHaveBeenCalled()
    expect(
      layout.filter(([id, prop, val]) => id === activeLayer && prop === 'visibility' && val === 'none'),
    ).toHaveLength(0)
  })

  it('reveal does not call setTiles when URLs already match and sources are loaded', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = {
      idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
      clipSource: null,
      displayChunks: [{ evalscriptB64: 'abc' }],
      tileUrls: ['https://example.test/a'],
      tilePixels: 512,
      aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
      renderReady: true,
      sessionKey: 'sess',
      sourceRefreshKey: 'refresh',
    }
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const loaded = new Set<string>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn() }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: (id: string) => loaded.has(id),
      on: vi.fn(),
      off: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    loaded.add(activeSource)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    const setTilesCalls = sources.get(activeSource)?.setTiles.mock.calls.length ?? 0

    revealSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.85 })
    expect(sources.get(activeSource)?.setTiles.mock.calls.length).toBe(setTilesCalls)
  })

  it('reveal uses visibility-only path when URLs match even if source is mid-zoom reload', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = {
      idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
      clipSource: null,
      displayChunks: [{ evalscriptB64: 'abc' }],
      tileUrls: ['https://example.test/a'],
      tilePixels: 512,
      aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
      renderReady: true,
      sessionKey: 'sess',
      sourceRefreshKey: 'refresh',
    }
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn() }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: () => false,
      on: vi.fn(),
      off: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    const setTilesCalls = sources.get(activeSource)?.setTiles.mock.calls.length ?? 0

    revealSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.85 })
    expect(sources.get(activeSource)?.setTiles.mock.calls.length).toBe(setTilesCalls)
  })

  it('hide does not cancel in-flight wait cleanup', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = {
      idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
      clipSource: null,
      displayChunks: [{ evalscriptB64: 'abc' }],
      tileUrls: ['https://example.test/a'],
      tilePixels: 512,
      aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
      renderReady: true,
      sessionKey: 'sess',
      sourceRefreshKey: 'refresh',
    }
    const cleanup = vi.fn()
    runtime.chunks.set('sentinel-layer-aoi:0', {
      activeSlot: 0,
      activeUrl: 'https://example.test/pending',
      waitCleanup: cleanup,
    })
    runtime.mountedChunkCount = 1

    const map = {
      getLayer: () => ({}),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    }

    hideSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, 0.9)
    expect(cleanup).not.toHaveBeenCalled()
  })
})
