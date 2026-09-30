import { describe, expect, it, vi } from 'vitest'
import {
  setSiSentinelAoiWmsLayerPresentation,
  siSentinelAoiWmsChunkKey,
  syncSiSentinelAoiWmsChunkBounds,
  syncSiSentinelAoiWmsChunkTiles,
} from './siSentinelAoiWmsFlickerFree'

describe('siSentinelAoiWmsFlickerFree', () => {
  it('skips redundant tile URL swaps', () => {
    const applied = new Map<string, string>()
    const source = { setTiles: vi.fn() }
    const key = siSentinelAoiWmsChunkKey('sentinel-layer-aoi', 0)

    expect(syncSiSentinelAoiWmsChunkTiles(source, 'https://example.test/a', applied, key)).toBe(true)
    expect(syncSiSentinelAoiWmsChunkTiles(source, 'https://example.test/a', applied, key)).toBe(false)
    expect(source.setTiles).toHaveBeenCalledTimes(1)
  })

  it('skips redundant bounds updates', () => {
    const applied = new Map<string, string>()
    const source = { setBounds: vi.fn() }
    const key = siSentinelAoiWmsChunkKey('sentinel-layer-aoi', 1)
    const bounds: [number, number, number, number] = [46, 24, 47, 25]

    syncSiSentinelAoiWmsChunkBounds(source, bounds, applied, key)
    syncSiSentinelAoiWmsChunkBounds(source, bounds, applied, key)

    expect(source.setBounds).toHaveBeenCalledTimes(1)
  })

  it('hides with opacity only so Mapbox keeps warming tiles (Edit AOI pattern)', () => {
    const layout: Array<[string, string, unknown]> = []
    const paint: Array<[string, string, unknown]> = []
    const map = {
      getLayer: () => ({}),
      setLayoutProperty: (id: string, prop: string, value: unknown) => {
        layout.push([id, prop, value])
      },
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        paint.push([id, prop, value])
      },
    }

    setSiSentinelAoiWmsLayerPresentation(map as any, 'sentinel-layer-aoi-layer-0', true, 0.85, true)
    setSiSentinelAoiWmsLayerPresentation(map as any, 'sentinel-layer-aoi-layer-0', false, 0.85, true)

    expect(layout.filter(([, prop, val]) => prop === 'visibility' && val === 'visible')).toHaveLength(2)
    expect(layout.some(([, prop, val]) => prop === 'visibility' && val === 'none')).toBe(false)
    expect(paint).toContainEqual(['sentinel-layer-aoi-layer-0', 'raster-opacity', 0.85])
    expect(paint).toContainEqual(['sentinel-layer-aoi-layer-0', 'raster-opacity', 0])
  })

  it('can unload with visibility none when requested', () => {
    const layout: Array<[string, string, unknown]> = []
    const map = {
      getLayer: () => ({}),
      setLayoutProperty: (id: string, prop: string, value: unknown) => {
        layout.push([id, prop, value])
      },
      setPaintProperty: () => undefined,
    }

    setSiSentinelAoiWmsLayerPresentation(map as any, 'layer', false, 1, true, { unloadWhenHidden: true })
    expect(layout).toContainEqual(['layer', 'visibility', 'none'])
  })
})
