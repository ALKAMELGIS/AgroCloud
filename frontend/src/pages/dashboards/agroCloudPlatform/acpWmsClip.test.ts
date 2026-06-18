import { describe, expect, it } from 'vitest'
import {
  buildAcpWmsExtentLoadSet,
  buildAcpWmsExtentTileSignature,
  buildAcpWmsLiveClipFromMapView,
  buildAcpWmsSessionClipSignature,
  buildAcpWmsTileClipForMapView,
  buildAcpWmsTileClipSource,
  resolveAcpWmsBuildOptions,
  resolveAcpWmsClipForMapView,
  resolveScaleBasedLoadCap,
  ACP_WMS_MAX_PACKED_TILE_LAYERS,
} from './acpWmsClip'

describe('buildAcpWmsExtentLoadSet', () => {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 1, Country: 'Morocco' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-6, 32], [-5.9, 32], [-5.9, 32.1], [-6, 32.1], [-6, 32]]],
        },
      },
      {
        type: 'Feature',
        properties: { OBJECTID: 2, Country: 'UAE' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[55, 24], [55.1, 24], [55.1, 24.1], [55, 24.1], [55, 24]]],
        },
      },
      {
        type: 'Feature',
        properties: { OBJECTID: 3, Country: 'UAE' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[55.2, 24.2], [55.3, 24.2], [55.3, 24.3], [55.2, 24.3], [55.2, 24.2]]],
        },
      },
    ],
  }

  it('prefers fields nearest map center over array order', () => {
    const clip = buildAcpWmsExtentLoadSet(fc, {
      mapCenter: [55.15, 24.15],
    })
    expect(clip.features[0]?.properties?.OBJECTID).toBe(2)
    expect(buildAcpWmsSessionClipSignature(clip)).toContain('2')
  })

  it('keeps full polygon geometry for extent-filtered features (dataMask, not clip)', () => {
    const clip = buildAcpWmsExtentLoadSet(fc, {
      viewportBBox: [54.5, 23.5, 55.5, 24.5],
      mapCenter: [55, 24],
    })
    expect(clip.features).toHaveLength(2)
    const first = clip.features[0]?.geometry as GeoJSON.Polygon
    expect(first?.coordinates?.[0]?.length).toBeGreaterThan(3)
  })

  it('buildAcpWmsTileClipSource filters by country only (definition query)', () => {
    const uae = buildAcpWmsTileClipSource(fc, 'UAE')
    expect(uae.features).toHaveLength(2)
    expect(uae.features.every(f => f.properties?.Country === 'UAE')).toBe(true)
    const all = buildAcpWmsTileClipSource(fc, 'all')
    expect(all.features).toHaveLength(3)
  })

  it('buildAcpWmsTileClipForMapView scopes load set to viewport at field zoom', () => {
    const clip = buildAcpWmsTileClipForMapView(fc, {
      zoom: 12,
      bbox: [54.5, 23.5, 55.5, 24.5],
      center: [55, 24],
      countryFilter: 'all',
    })
    expect(clip.features).toHaveLength(2)
    expect(clip.features.every(f => f.properties?.Country === 'UAE')).toBe(true)
  })

  it('resolveAcpWmsClipForMapView uses extent filter at field zoom (dynamic pan)', () => {
    const many: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 20 }, (_, i) => ({
        type: 'Feature' as const,
        properties: { OBJECTID: i + 1, Country: 'UAE' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [55 + i * 0.01, 24],
              [55 + i * 0.01 + 0.005, 24],
              [55 + i * 0.01 + 0.005, 24.005],
              [55 + i * 0.01, 24.005],
              [55 + i * 0.01, 24],
            ],
          ],
        },
      })),
    }
    const clipEast = resolveAcpWmsClipForMapView(many, {
      countryFilter: 'all',
      zoom: 12,
      bbox: [55.15, 23.9, 55.35, 24.2],
      center: [55.2, 24.05],
      maxWmsLayers: 4,
    })
    const clipWest = resolveAcpWmsClipForMapView(many, {
      countryFilter: 'all',
      zoom: 12,
      bbox: [54.9, 23.9, 55.05, 24.2],
      center: [54.95, 24.05],
      maxWmsLayers: 4,
    })
    expect(clipEast.features.length).toBeGreaterThan(0)
    expect(clipWest.features.length).toBeGreaterThan(0)
    expect(buildAcpWmsSessionClipSignature(clipEast)).not.toBe(
      buildAcpWmsSessionClipSignature(clipWest),
    )
  })

  it('resolveScaleBasedLoadCap is unbounded at field zoom (extent filter only)', () => {
    expect(resolveScaleBasedLoadCap(7, 4)).toBe(Number.POSITIVE_INFINITY)
    expect(resolveScaleBasedLoadCap(9, 4)).toBe(Number.POSITIVE_INFINITY)
    expect(resolveScaleBasedLoadCap(13, 4)).toBe(Number.POSITIVE_INFINITY)
  })

  it('buildAcpWmsExtentTileSignature quantizes extent', () => {
    const a: [number, number, number, number] = [54.512, 23.508, 55.518, 24.512]
    const b: [number, number, number, number] = [54.513, 23.509, 55.519, 24.513]
    expect(buildAcpWmsExtentTileSignature(a, 12)).toBe(buildAcpWmsExtentTileSignature(b, 12))
  })

  it('loads all viewport-intersecting fields at field zoom (not first-N slice)', () => {
    const many: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 20 }, (_, i) => ({
        type: 'Feature' as const,
        properties: { OBJECTID: i + 1, Country: 'UAE' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [55 + i * 0.01, 24],
              [55 + i * 0.01 + 0.005, 24],
              [55 + i * 0.01 + 0.005, 24.005],
              [55 + i * 0.01, 24.005],
              [55 + i * 0.01, 24],
            ],
          ],
        },
      })),
    }
    const clip = resolveAcpWmsClipForMapView(many, {
      countryFilter: 'all',
      zoom: 12,
      bbox: [54.9, 23.9, 55.25, 24.2],
      center: [55.1, 24.05],
      maxWmsLayers: 4,
    })
    expect(clip.features.length).toBe(20)
  })

  it('uses platform tile cap with per-field rings when field count allows', () => {
    expect(resolveAcpWmsBuildOptions(12, 32)).toEqual({
      preferSingleRingChunks: true,
      maxTileLayers: 32,
      viewportBBox: null,
    })
    expect(resolveAcpWmsBuildOptions(20)).toEqual({
      preferSingleRingChunks: true,
      maxTileLayers: ACP_WMS_MAX_PACKED_TILE_LAYERS,
      viewportBBox: null,
    })
  })

  it('buildAcpWmsLiveClipFromMapView remains compatible', () => {
    const clip = buildAcpWmsLiveClipFromMapView(fc, {
      zoom: 12,
      bbox: [54.5, 23.5, 55.5, 24.5],
      center: [55, 24],
      countryFilter: 'all',
    })
    expect(clip.features.length).toBe(2)
  })
})
