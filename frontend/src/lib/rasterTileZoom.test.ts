import { describe, expect, it } from 'vitest'
import {
  buildMapboxRasterSourceSpec,
  ensureRasterStyleMaxNativeZoom,
  patchMapRasterSourcesMaxNativeZoom,
  rasterTileMaxNativeZoom,
  rasterTilesSourceMaxNativeZoom,
} from './rasterTileZoom'

const ESRI_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

describe('rasterTileZoom', () => {
  it('caps Esri World Imagery at native zoom 19', () => {
    const url = ESRI_IMAGERY_URL
    expect(rasterTileMaxNativeZoom(url)).toBe(19)
    expect(rasterTilesSourceMaxNativeZoom({ tiles: [url] })).toBe(19)
  })

  it('buildMapboxRasterSourceSpec applies native maxzoom', () => {
    const spec = buildMapboxRasterSourceSpec({ tiles: [ESRI_IMAGERY_URL] })
    expect(spec.maxzoom).toBe(19)
  })

  it('clamps overly high service maxLOD to provider native cap', () => {
    expect(rasterTilesSourceMaxNativeZoom({ tiles: [ESRI_IMAGERY_URL], maxzoom: 22 })).toBe(19)
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
          tiles: [ESRI_IMAGERY_URL],
        },
      },
      layers: [],
    }) as { sources: Record<string, { maxzoom?: number }> }

    expect(style.sources.imagery.maxzoom).toBe(19)
  })

  it('patchMapRasterSourcesMaxNativeZoom rebuilds live sources missing maxzoom', () => {
    const sources: Record<string, { type: string; tiles: string[]; maxzoom?: number }> = {
      imagery: { type: 'raster', tiles: [ESRI_IMAGERY_URL] },
    }
    const layers = [{ id: 'imagery-layer', type: 'raster', source: 'imagery', paint: {}, layout: {} }]
    const addedSources: Array<{ id: string; spec: Record<string, unknown> }> = []
    const addedLayers: Array<{ spec: Record<string, unknown>; before?: string }> = []
    const map = {
      getStyle: () => ({ sources, layers }),
      removeLayer: (id: string) => {
        const idx = layers.findIndex(l => l.id === id)
        if (idx >= 0) layers.splice(idx, 1)
      },
      removeSource: (id: string) => {
        delete sources[id]
      },
      addSource: (id: string, spec: Record<string, unknown>) => {
        sources[id] = spec as { type: string; tiles: string[]; maxzoom?: number }
        addedSources.push({ id, spec })
      },
      addLayer: (spec: Record<string, unknown>, beforeId?: string) => {
        layers.push(spec as (typeof layers)[number])
        addedLayers.push({ spec, before: beforeId })
      },
    }

    expect(patchMapRasterSourcesMaxNativeZoom(map)).toBe(1)
    expect(sources.imagery?.maxzoom).toBe(19)
    expect(addedLayers.some(entry => entry.spec.id === 'imagery-layer')).toBe(true)
  })
})
