import { describe, expect, it } from 'vitest'
import {
  ensureRasterStyleMaxNativeZoom,
  rasterTileMaxNativeZoom,
  rasterTilesSourceMaxNativeZoom,
} from './rasterTileZoom'

describe('rasterTileZoom', () => {
  it('caps Esri World Imagery at native zoom 19', () => {
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    expect(rasterTileMaxNativeZoom(url)).toBe(19)
    expect(rasterTilesSourceMaxNativeZoom({ tiles: [url] })).toBe(19)
  })

  it('clamps overly high service maxLOD to provider native cap', () => {
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    expect(rasterTilesSourceMaxNativeZoom({ tiles: [url], maxzoom: 22 })).toBe(19)
  })

  it('does not cap dynamic bbox export services', () => {
    const url =
      'https://example.com/MapServer/export?bbox={bbox-epsg-3857}&size=256,256&f=image'
    expect(rasterTilesSourceMaxNativeZoom({ tiles: [url], maxzoom: 22 })).toBeUndefined()
  })

  it('patches Mapbox style raster sources missing maxzoom', () => {
    const style = ensureRasterStyleMaxNativeZoom({
      version: 8,
      sources: {
        imagery: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
        },
      },
      layers: [],
    }) as { sources: Record<string, { maxzoom?: number }> }

    expect(style.sources.imagery.maxzoom).toBe(19)
  })
})
