import { describe, expect, it, vi } from 'vitest'
import {
  applyMapLibreGlobeOrFieldEnvironment,
  MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM,
  mergeMapLibreGlobeCockpitStyle,
  setMapLibreGlobeProjection,
} from './maplibreGlobeEnvironment'

describe('maplibreGlobeEnvironment', () => {
  it('merges globe projection and sky into a raster style', () => {
    const out = mergeMapLibreGlobeCockpitStyle({ version: 8, sources: {}, layers: [] })
    expect(out.projection).toEqual({ type: 'globe' })
    expect(out.sky).toBeDefined()
    expect(out.light).toBeDefined()
  })

  it('prefers MapLibre globe projection type', () => {
    const setProjection = vi.fn()
    setMapLibreGlobeProjection({ setProjection })
    expect(setProjection).toHaveBeenCalledWith({ type: 'globe' })
  })

  it('uses field basemap environment above portfolio globe zoom', () => {
    const setFog = vi.fn()
    const setSky = vi.fn()
    const map = {
      getZoom: () => MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM + 2,
      setFog,
      setSky,
      getCanvas: () => ({ style: {} }),
      getContainer: () => null,
    }
    applyMapLibreGlobeOrFieldEnvironment(map as never)
    expect(setFog).toHaveBeenCalledWith(null)
    expect(setSky).toHaveBeenCalledWith(undefined)
  })
})
