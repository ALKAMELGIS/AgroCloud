import { describe, expect, it } from 'vitest'
import type { Map as MaplibreMap } from 'maplibre-gl'

import { splitDevelopEliteLinePaint } from './developEliteMapLibreOverlays'
import { developEliteMapLibreHasLayer } from './developEliteMapLibreStyle'

describe('splitDevelopEliteLinePaint', () => {
  it('moves line-cap / line-join to layout so MapLibre accepts the layer', () => {
    expect(
      splitDevelopEliteLinePaint({ 'line-color': '#004da8', 'line-width': 2, 'line-cap': 'round', 'line-join': 'round' }),
    ).toEqual({
      paint: { 'line-color': '#004da8', 'line-width': 2 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
  })
})

describe('developEliteMapLibreHasLayer', () => {
  it('sees an existing layer even while a source is still loading (style not "loaded")', () => {
    const map = {
      isStyleLoaded: () => false,
      getLayer: (id: string) => (id === 'de-trees-circle' ? { id } : undefined),
    } as unknown as MaplibreMap
    expect(developEliteMapLibreHasLayer(map, 'de-trees-circle')).toBe(true)
    expect(developEliteMapLibreHasLayer(map, 'missing')).toBe(false)
  })

  it('is false when the map has no style yet', () => {
    const map = { getLayer: () => { throw new Error('no style') } } as unknown as MaplibreMap
    expect(developEliteMapLibreHasLayer(map, 'x')).toBe(false)
    expect(developEliteMapLibreHasLayer(null, 'x')).toBe(false)
  })
})
