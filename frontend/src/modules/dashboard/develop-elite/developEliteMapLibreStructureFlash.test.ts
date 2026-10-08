import { describe, expect, it, vi } from 'vitest'
import { syncDevelopEliteMapLibreStructureHighlight } from './developEliteMapLibreStructureFlash'

describe('syncDevelopEliteMapLibreStructureHighlight', () => {
  it('loads a single feature into the highlight source', () => {
    const setData = vi.fn()
    const map = {
      isStyleLoaded: () => true,
      loaded: () => true,
      getStyle: () => ({ layers: [{ id: 'basemap' }] }),
      getSource: (id: string) => (id === 'de-agro-structures-highlight' ? { setData } : undefined),
      getLayer: () => undefined,
      addSource: vi.fn(),
      addLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    } as never

    const feature = {
      type: 'Feature',
      properties: { OBJECTID: 42 },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    }
    const geojson = { type: 'FeatureCollection', features: [feature] }

    syncDevelopEliteMapLibreStructureHighlight(map, geojson, 'OBJECTID:42', false)
    expect(setData).toHaveBeenCalledWith({
      type: 'FeatureCollection',
      features: [feature],
    })
  })
})
