import { describe, expect, it } from 'vitest'
import { resolveSiActiveAoi } from './siAoiManager'
import { drawnAoiClipSignature } from '../pages/satellite/siDrawnAoiLiveIndex'

const ring = (lng: number, lat: number): [number, number][] => [
  [lng, lat],
  [lng + 0.01, lat],
  [lng + 0.01, lat + 0.01],
  [lng, lat + 0.01],
  [lng, lat],
]

const polyFc = (id: number, lng: number, lat: number, props: Record<string, unknown> = {}) =>
  ({
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { OBJECTID: id, ...props },
        geometry: { type: 'Polygon' as const, coordinates: [ring(lng, lat)] },
      },
    ],
  }) as GeoJSON.FeatureCollection

describe('resolveSiActiveAoi', () => {
  it('returns null when all sources are empty', () => {
    expect(resolveSiActiveAoi({})).toEqual({ geometry: null, key: '', source: null })
    expect(
      resolveSiActiveAoi({
        drawnClip: null,
        layersEnabled: true,
        layersMask: { type: 'FeatureCollection', features: [] },
        agroMask: null,
      }),
    ).toEqual({ geometry: null, key: '', source: null })
  })

  it('prefers drawn sketch over layers and agro', () => {
    const drawn = polyFc(1, 55.1, 25.1)
    const layers = polyFc(2, 55.2, 25.2)
    const agro = polyFc(3, 55.3, 25.3, { Structure_Type: 1007 })

    const result = resolveSiActiveAoi({
      drawnClip: drawn,
      layersEnabled: true,
      layersMask: layers,
      agroMask: agro,
    })

    expect(result.source).toBe('draw')
    expect(result.geometry).toBe(drawn)
    expect(result.key).toBe(drawnAoiClipSignature(drawn))
    expect(result.key).toMatch(/^drawn:/)
  })

  it('uses layers mask when enabled and no drawn clip', () => {
    const layers = polyFc(10, 54.0, 24.0)
    const agro = polyFc(11, 54.1, 24.1, { Structure_Type: 1006 })

    const result = resolveSiActiveAoi({
      drawnClip: null,
      layersEnabled: true,
      layersMask: layers,
      layersPinKey: 'lid:test|mode:entire-layer|field:|fv:',
      agroMask: agro,
    })

    expect(result.source).toBe('layers')
    expect(result.geometry).toBe(layers)
    expect(result.key).toBe('layers:lid:test|mode:entire-layer|field:|fv:')
  })

  it('ignores layers mask when Layers AOI is disabled', () => {
    const layers = polyFc(10, 54.0, 24.0)
    const agro = polyFc(11, 54.1, 24.1, { Structure_Type: 1007 })

    const result = resolveSiActiveAoi({
      layersEnabled: false,
      layersMask: layers,
      agroMask: agro,
    })

    expect(result.source).toBe('agro')
    expect(result.geometry).toBe(agro)
    expect(result.key).toMatch(/^agro:/)
  })

  it('falls back to agro mask when draw and layers are unavailable', () => {
    const agro = polyFc(7, 55.5, 25.5, { Structure_Type: 1007 })

    const result = resolveSiActiveAoi({ agroMask: agro })

    expect(result.source).toBe('agro')
    expect(result.geometry).toBe(agro)
    expect(result.key).toContain('st:fp-pivot|n1')
    expect(result.key).toContain('|7')
  })

  it('builds a geo-based layers key when pin is omitted', () => {
    const layers = polyFc(42, 56.0, 26.0)

    const result = resolveSiActiveAoi({
      layersEnabled: true,
      layersMask: layers,
    })

    expect(result.source).toBe('layers')
    expect(result.key).toMatch(/^layers:n1\|/)
  })

  it('treats empty drawn FeatureCollection as absent', () => {
    const layers = polyFc(1, 50, 20)

    const result = resolveSiActiveAoi({
      drawnClip: { type: 'FeatureCollection', features: [] },
      layersEnabled: true,
      layersMask: layers,
    })

    expect(result.source).toBe('layers')
    expect(result.geometry).toBe(layers)
  })
})
