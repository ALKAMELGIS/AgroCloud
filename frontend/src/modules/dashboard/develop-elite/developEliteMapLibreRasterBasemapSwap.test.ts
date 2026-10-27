import { describe, expect, it, vi } from 'vitest'
import { developEliteMapLibreTrySwapRasterBasemap } from './developEliteMapLibreRasterBasemapSwap'

describe('developEliteMapLibreTrySwapRasterBasemap', () => {
  it('updates r0 tiles without setStyle when layout matches', () => {
    const setTiles = vi.fn()
    const map = {
      isStyleLoaded: () => true,
      getSource: () => ({ setTiles }),
      triggerRepaint: vi.fn(),
    }
    const ok = developEliteMapLibreTrySwapRasterBasemap(map as never, {
      version: 8,
      sources: {
        r0: { type: 'raster', tiles: ['https://example.com/{z}/{x}/{y}'] },
      },
      layers: [{ id: 'layer-0', type: 'raster', source: 'r0' }],
    })
    expect(ok).toBe(true)
    expect(setTiles).toHaveBeenCalledWith(['https://example.com/{z}/{x}/{y}'])
  })
})
