import { afterEach, describe, expect, it, vi } from 'vitest'
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

function makeStack(tileUrl = 'https://example.test/a') {
  return {
    idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
    clipSource: null,
    displayChunks: [{ evalscriptB64: 'abc' }],
    tileUrls: [tileUrl],
    tilePixels: 512,
    aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
    renderReady: true,
    sessionKey: 'sess',
    sourceRefreshKey: 'refresh',
  }
}

describe('siSentinelAoiWmsImperative', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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
    const stack = makeStack()

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

  it('warm reveal: same URLs apply opacity/visibility only — no setTiles on active slot', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = makeStack()
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const layout: Array<[string, string, unknown]> = []
    const paint: Array<[string, string, unknown]> = []
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
    const inactiveLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    loaded.add(activeSource)
    // Warm-hidden prefetch, then Show on map via reveal.
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: false, opacity: 0.9 })
    const setTilesCalls = sources.get(activeSource)?.setTiles.mock.calls.length ?? 0
    layout.length = 0
    paint.length = 0

    revealSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.85 })

    expect(sources.get(activeSource)?.setTiles.mock.calls.length).toBe(setTilesCalls)
    expect(layout).toContainEqual([activeLayer, 'visibility', 'visible'])
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0.85])
    expect(paint).toContainEqual([inactiveLayer, 'raster-opacity', 0])
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

  it('cold first paint shows immediately without waiting for sourcedata/idle', () => {
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
    const layout: Array<[string, string, unknown]> = []
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn((tiles: string[]) => { src.tiles = [...tiles] }) }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: () => false,
      on: vi.fn(),
      off: vi.fn(),
      setLayoutProperty: (id: string, prop: string, value: unknown) => {
        layout.push([id, prop, value])
      },
      setPaintProperty: vi.fn(),
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })

    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    expect(map.on).not.toHaveBeenCalled()
    expect(layout).toContainEqual([activeLayer, 'visibility', 'visible'])
  })

  it('warm hide keeps layout visible so tiles prefetch before Show on map', () => {
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
    const layout: Array<[string, string, unknown]> = []
    const paint: Array<[string, string, unknown]> = []
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn((tiles: string[]) => { src.tiles = [...tiles] }) }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: () => false,
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
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: false, opacity: 0.9 })

    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    expect(layout).toContainEqual([activeLayer, 'visibility', 'visible'])
    expect(layout.some(([, , val]) => val === 'none')).toBe(false)
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0])
    expect(map.on).not.toHaveBeenCalled()

    // Enable Show on map — opacity only; no tile re-fetch required.
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0.9])
  })

  it('index URL swap keeps previous frame until inactive tiles are ready', () => {
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
    const listeners = new Map<string, Array<(ev?: unknown) => void>>()
    const paint: Array<[string, string, unknown]> = []
    let loaded = new Set<string>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = { tiles: [...spec.tiles], setTiles: vi.fn((tiles: string[]) => { src.tiles = [...tiles] }) }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: (id: string) => loaded.has(id),
      on: (event: string, handler: (ev?: unknown) => void) => {
        const list = listeners.get(event) ?? []
        list.push(handler)
        listeners.set(event, list)
      },
      off: (event: string, handler: (ev?: unknown) => void) => {
        const list = listeners.get(event) ?? []
        listeners.set(
          event,
          list.filter(h => h !== handler),
        )
      },
      setLayoutProperty: vi.fn(),
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        paint.push([id, prop, value])
      },
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    loaded.add(activeSource)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    paint.length = 0
    syncSiSentinelAoiWmsPingPongStack(
      map as any,
      { ...stack, tileUrls: ['https://example.test/ndvi'] } as any,
      runtime,
      { visible: true, opacity: 0.9 },
    )

    expect(listeners.has('idle')).toBe(false)
    expect(listeners.has('sourcedata')).toBe(true)
    const prevLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const nextLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    const nextSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    expect(paint).toContainEqual([prevLayer, 'raster-opacity', 0.9])
    expect(paint).toContainEqual([nextLayer, 'raster-opacity', 0])
    expect(runtime.chunks.get(`${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}:0`)?.activeSlot).toBe(0)

    loaded.add(nextSource)
    for (const handler of listeners.get('sourcedata') ?? []) {
      handler({ sourceId: nextSource, isSourceLoaded: true })
    }

    expect(paint).toContainEqual([nextLayer, 'raster-opacity', 0.9])
    expect(paint).toContainEqual([prevLayer, 'raster-opacity', 0])
    expect(runtime.chunks.get(`${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}:0`)?.activeSlot).toBe(1)
  })

  it('date/layer swap: holds previous slot until inactive source is loaded', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = makeStack()
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const listeners = new Map<string, Array<(ev?: unknown) => void>>()
    const paint: Array<[string, string, unknown]> = []
    let loaded = new Set<string>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = {
          tiles: [...spec.tiles],
          setTiles: vi.fn((tiles: string[]) => {
            src.tiles = [...tiles]
          }),
        }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: (id: string) => loaded.has(id),
      on: (event: string, handler: (ev?: unknown) => void) => {
        const list = listeners.get(event) ?? []
        list.push(handler)
        listeners.set(event, list)
      },
      off: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        paint.push([id, prop, value])
      },
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const inactiveLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    const chunkKey = `${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}:0`
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const inactiveSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    loaded.add(activeSource)

    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    paint.length = 0
    syncSiSentinelAoiWmsPingPongStack(
      map as any,
      { ...stack, tileUrls: ['https://example.test/b'] } as any,
      runtime,
      { visible: true, opacity: 0.9 },
    )

    const pending = runtime.chunks.get(chunkKey)
    expect(pending?.activeSlot).toBe(0)
    expect(pending?.activeUrl).toBe('https://example.test/a')
    expect(pending?.pendingUrl).toBe('https://example.test/b')
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0.9])
    expect(paint).toContainEqual([inactiveLayer, 'raster-opacity', 0])
    expect(listeners.has('sourcedata')).toBe(true)

    loaded.add(inactiveSource)
    for (const handler of listeners.get('sourcedata') ?? []) {
      handler({ sourceId: inactiveSource, isSourceLoaded: true })
    }

    expect(runtime.chunks.get(chunkKey)?.activeSlot).toBe(1)
    expect(runtime.chunks.get(chunkKey)?.activeUrl).toBe('https://example.test/b')
    expect(paint).toContainEqual([inactiveLayer, 'raster-opacity', 0.9])
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0])
  })

  it('metadata sourcedata does not hide the visible index slot', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = makeStack()
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const listeners = new Map<string, Array<(ev?: unknown) => void>>()
    const paint: Array<[string, string, unknown]> = []
    const loaded = new Set<string>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = {
          tiles: [...spec.tiles],
          setTiles: vi.fn((tiles: string[]) => {
            src.tiles = [...tiles]
          }),
        }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: (id: string) => loaded.has(id),
      on: (event: string, handler: (ev?: unknown) => void) => {
        const list = listeners.get(event) ?? []
        list.push(handler)
        listeners.set(event, list)
      },
      off: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        paint.push([id, prop, value])
      },
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const inactiveLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    const chunkKey = `${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}:0`
    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const inactiveSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 1)
    loaded.add(activeSource)
    loaded.add(inactiveSource)

    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    paint.length = 0
    syncSiSentinelAoiWmsPingPongStack(
      map as any,
      { ...stack, tileUrls: ['https://example.test/iss'] } as any,
      runtime,
      { visible: true, opacity: 0.9 },
    )

    for (const handler of listeners.get('sourcedata') ?? []) {
      handler({ sourceId: inactiveSource, isSourceLoaded: true, sourceDataType: 'metadata' })
    }

    expect(runtime.chunks.get(chunkKey)?.activeSlot).toBe(0)
    expect(paint).toContainEqual([activeLayer, 'raster-opacity', 0.9])
    expect(
      paint.filter(([id, prop, val]) => id === activeLayer && prop === 'raster-opacity' && val === 0),
    ).toHaveLength(0)

    for (const handler of listeners.get('sourcedata') ?? []) {
      handler({ sourceId: inactiveSource, isSourceLoaded: true, sourceDataType: 'idle' })
    }
    expect(runtime.chunks.get(chunkKey)?.activeSlot).toBe(1)
    expect(paint).toContainEqual([inactiveLayer, 'raster-opacity', 0.9])
  })

  it('reverting to the active URL cancels the in-flight inactive wait', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    const stack = makeStack()
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const listeners = new Map<string, Array<(ev?: unknown) => void>>()
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = {
          tiles: [...spec.tiles],
          setTiles: vi.fn((tiles: string[]) => {
            src.tiles = [...tiles]
          }),
        }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: () => false,
      on: (event: string, handler: (ev?: unknown) => void) => {
        const list = listeners.get(event) ?? []
        list.push(handler)
        listeners.set(event, list)
      },
      off: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })
    syncSiSentinelAoiWmsPingPongStack(
      map as any,
      { ...stack, tileUrls: ['https://example.test/b'] } as any,
      runtime,
      { visible: true, opacity: 0.9 },
    )
    const chunkKey = `${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}:0`
    expect(runtime.chunks.get(chunkKey)?.pendingUrl).toBe('https://example.test/b')

    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, { visible: true, opacity: 0.9 })

    expect(runtime.chunks.get(chunkKey)?.pendingUrl).toBe('')
    expect(runtime.chunks.get(chunkKey)?.activeUrl).toBe('https://example.test/a')
    expect(runtime.chunks.get(chunkKey)?.activeSlot).toBe(0)
    expect(map.off).toHaveBeenCalled()
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
      pendingUrl: '',
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

  it('cold enable with clip mounts sources via ensure+sync (not reveal noop)', () => {
    const runtime = createSiSentinelAoiWmsPingPongRuntime()
    // Simulate warm stack empty → reveal would no-op; ensure+sync after clip rebuild mounts URLs.
    const emptyStack = {
      idPrefix: SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
      clipSource: null,
      displayChunks: [] as Array<{ evalscriptB64: string }>,
      tileUrls: [] as string[],
      tilePixels: 512,
      aoiBoundsLngLat: null as [number, number, number, number] | null,
      renderReady: false,
      sessionKey: 'cold',
      sourceRefreshKey: 'cold',
    }
    const sources = new Map<string, { tiles: string[]; setTiles: ReturnType<typeof vi.fn> }>()
    const layout: Array<[string, string, unknown]> = []
    const map = {
      getSource: (id: string) => sources.get(id) ?? null,
      getLayer: () => ({}),
      addSource: (id: string, spec: { tiles: string[] }) => {
        const src = {
          tiles: [...spec.tiles],
          setTiles: vi.fn((tiles: string[]) => {
            src.tiles = [...tiles]
          }),
        }
        sources.set(id, src)
      },
      addLayer: vi.fn(),
      isSourceLoaded: () => false,
      on: vi.fn(),
      off: vi.fn(),
      setLayoutProperty: (id: string, prop: string, value: unknown) => {
        layout.push([id, prop, value])
      },
      setPaintProperty: vi.fn(),
    }

    revealSiSentinelAoiWmsPingPongStack(map as any, emptyStack as any, runtime, {
      visible: true,
      opacity: 0.85,
    })
    expect(sources.size).toBe(0)

    const stack = {
      ...emptyStack,
      displayChunks: [{ evalscriptB64: 'ndvi' }],
      tileUrls: ['https://example.test/cold-ndvi'],
      aoiBoundsLngLat: [46, 24, 47, 25] as [number, number, number, number],
      renderReady: true,
      sourceRefreshKey: 'cold-ready',
    }
    // Invalidate like Layers enable
    runtime.appliedUrls.clear()
    runtime.appliedBounds.clear()
    for (const chunkState of runtime.chunks.values()) {
      chunkState.waitCleanup?.()
      chunkState.waitCleanup = null
      chunkState.activeUrl = ''
    }

    ensureSiSentinelAoiWmsPingPongStackOnMap(map as any, stack as any, 8, runtime)
    syncSiSentinelAoiWmsPingPongStack(map as any, stack as any, runtime, {
      visible: true,
      opacity: 0.85,
    })

    const activeSource = siSentinelAoiWmsPingPongSourceId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    const activeLayer = siSentinelAoiWmsPingPongLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 0, 0)
    expect(sources.has(activeSource)).toBe(true)
    expect(sources.get(activeSource)?.tiles).toEqual(['https://example.test/cold-ndvi'])
    expect(layout).toContainEqual([activeLayer, 'visibility', 'visible'])
  })
})
