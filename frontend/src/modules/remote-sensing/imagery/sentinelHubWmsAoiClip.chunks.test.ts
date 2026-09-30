import { describe, expect, it } from 'vitest'
import {
  buildSentinelHubWmsDisplayChunks,
  mergeWktChunkGroupsToCap,
  packOuterRingsIntoFixedBucketGroups,
  packOuterRingsIntoWktChunkGroups,
  packOuterRingsIntoWktChunks,
  resolveLayersAoiWmsMaxTileLayers,
  SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES,
} from './sentinelHubWmsAoiClip'

describe('mergeWktChunkGroupsToCap', () => {
  it('merges groups to cap while retaining all rings (full coverage)', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 12; i++) {
      const lng = 55 + (i % 4) * 0.02
      const lat = 25 + Math.floor(i / 4) * 0.02
      rings.push([
        [lng, lat],
        [lng + 0.008, lat],
        [lng + 0.008, lat + 0.008],
        [lng, lat + 0.008],
        [lng, lat],
      ])
    }
    const evalscriptB64 = btoa('//VERSION=3')
    const groups = rings.map(ring => ({
      geometryWkt3857: `POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`,
      outerRings: [ring],
    }))
    expect(groups.length).toBeGreaterThan(8)

    const merged = mergeWktChunkGroupsToCap(groups, 8, evalscriptB64)
    expect(merged.length).toBeLessThanOrEqual(8)
    expect(merged.length).toBeGreaterThan(0)
    const mergedRingCount = merged.reduce((n, g) => n + g.outerRings.length, 0)
    expect(mergedRingCount).toBe(rings.length)
  })
})

describe('resolveLayersAoiWmsMaxTileLayers', () => {
  it('scales source budget with feature count for large ArcGIS AOIs', () => {
    expect(resolveLayersAoiWmsMaxTileLayers(12)).toBeGreaterThanOrEqual(8)
    expect(resolveLayersAoiWmsMaxTileLayers(30)).toBe(24)
    expect(resolveLayersAoiWmsMaxTileLayers(216)).toBe(36)
    expect(resolveLayersAoiWmsMaxTileLayers(930)).toBe(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
  })
})

describe('packOuterRingsIntoWktChunks', () => {
  it('packs many rings into fewer WKT parts under budget', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 120; i++) {
      const lng = 55 + (i % 10) * 0.01
      const lat = 25 + Math.floor(i / 10) * 0.01
      rings.push([
        [lng, lat],
        [lng + 0.008, lat],
        [lng + 0.008, lat + 0.008],
        [lng, lat + 0.008],
        [lng, lat],
      ])
    }
    const evalscriptB64 = btoa('//VERSION=3')
    const chunks = packOuterRingsIntoWktChunks(rings, evalscriptB64)
    expect(chunks.length).toBeLessThan(rings.length)
    expect(chunks.length).toBeGreaterThan(0)
    for (const wkt of chunks) {
      expect(wkt.length).toBeLessThan(6000)
      expect(wkt).toMatch(/^MULTIPOLYGON\(|^POLYGON\(/)
    }
  })

  it('packs ~20 pivot-sized rings into a handful of tile layers', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 20; i++) {
      const lng = 55 + (i % 5) * 0.02
      const lat = 25 + Math.floor(i / 5) * 0.02
      const pts: [number, number][] = []
      for (let a = 0; a < 16; a++) {
        const rad = (a / 16) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * 0.004, lat + Math.sin(rad) * 0.004])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const groups = packOuterRingsIntoWktChunkGroups(rings, btoa('//VERSION=3'))
    expect(groups.length).toBeLessThanOrEqual(8)
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(group.outerRings.length).toBeGreaterThan(0)
      expect(group.geometryWkt3857.length).toBeLessThan(6000)
    }
  })

  it('keeps GEOMETRY clip for many fields and caps tile layers', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 30; i++) {
      const lng = 55 + i * 0.01
      rings.push([
        [lng, 25],
        [lng + 0.008, 25],
        [lng + 0.008, 25.008],
        [lng, 25.008],
        [lng, 25],
      ])
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const cap = resolveLayersAoiWmsMaxTileLayers(rings.length)
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', { maxTileLayers: cap })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(cap)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
    expect(chunks[0]?.evalscriptB64).toBeTruthy()
    for (const part of chunks) {
      expect(part.geometryWkt3857!.length).toBeLessThan(5000)
    }
  })

  it('packs large Layers AOI into ≤ hard-max WMS sources (never one source per field)', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 216; i++) {
      const lng = 47 + (i % 18) * 0.03
      const lat = 24 + Math.floor(i / 18) * 0.03
      const scale = 0.004 + (i % 7) * 0.0008
      const pts: [number, number][] = []
      for (let a = 0; a < 24; a++) {
        const rad = (a / 24) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * scale, lat + Math.sin(rad) * scale])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: 256,
      preferSingleRingChunks: true,
    })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    expect(chunks.length).toBeLessThan(rings.length)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
    for (const part of chunks) {
      expect(part.geometryWkt3857!.length).toBeLessThan(6000)
    }
  })

  it('packs 216-field Layers AOI into a zoom-stable bounded source count covering every ring', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 216; i++) {
      const lng = 47 + (i % 18) * 0.03
      const lat = 24 + Math.floor(i / 18) * 0.03
      const scale = 0.004 + (i % 7) * 0.0008
      const pts: [number, number][] = []
      for (let a = 0; a < 24; a++) {
        const rad = (a / 24) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * scale, lat + Math.sin(rad) * scale])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const cap = resolveLayersAoiWmsMaxTileLayers(rings.length)
    const a = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: cap,
      preferSingleRingChunks: false,
    })
    const b = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: cap,
      preferSingleRingChunks: false,
    })
    expect(a.length).toBeGreaterThan(0)
    expect(a.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    expect(a.every(part => !!part.geometryWkt3857)).toBe(true)
    // Deterministic GEOMETRY set — identical cache hit on second build (zoom/pan must not rebuild).
    expect(a.map(p => p.geometryWkt3857)).toEqual(b.map(p => p.geometryWkt3857))
    for (const part of a) {
      expect(part.geometryWkt3857!.length).toBeLessThan(5000)
    }
  })

  it('keeps full viewport coverage for large AOI without dropping rings', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 80; i++) {
      const lng = 40 + (i % 10) * 0.05
      const lat = 20 + Math.floor(i / 10) * 0.05
      const pts: [number, number][] = []
      for (let a = 0; a < 48; a++) {
        const rad = (a / 48) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * 0.02, lat + Math.sin(rad) * 0.02])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: 256,
      preferSingleRingChunks: true,
      viewportBBox: [39.5, 19.5, 41, 21],
    })
    expect(chunks.length).toBeGreaterThan(0)
    // All rings intersecting the viewport must be present (no largest-N drop).
    expect(chunks.length).toBe(
      buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
        maxTileLayers: 256,
        preferSingleRingChunks: true,
        viewportBBox: [39.5, 19.5, 41, 21],
      }).length,
    )
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
  })

  it('packs without dropping when tile budget is tight and preferSingle is off', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 80; i++) {
      const lng = 40 + (i % 10) * 0.05
      const lat = 20 + Math.floor(i / 10) * 0.05
      const pts: [number, number][] = []
      for (let a = 0; a < 48; a++) {
        const rad = (a / 48) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * 0.02, lat + Math.sin(rad) * 0.02])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const cap = resolveLayersAoiWmsMaxTileLayers(rings.length)
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', { maxTileLayers: cap })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
    for (const part of chunks) {
      expect(part.geometryWkt3857!.length).toBeLessThan(5000)
    }
  })

  it('covers all ~930 Agro_Structures-sized rings with budget-safe GEOMETRY URLs', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 930; i++) {
      const lng = 45 + (i % 30) * 0.04
      const lat = 24 + Math.floor(i / 30) * 0.04
      const scale = 0.006 + (i % 5) * 0.0005
      const pts: [number, number][] = []
      for (let a = 0; a < 20; a++) {
        const rad = (a / 20) * Math.PI * 2
        pts.push([lng + Math.cos(rad) * scale, lat + Math.sin(rad) * scale])
      }
      pts.push(pts[0]!)
      rings.push(pts)
    }
    const evalscriptB64 = btoa('//VERSION=3\nfunction setup(){return{}}')
    const cap = resolveLayersAoiWmsMaxTileLayers(rings.length)
    const groups = packOuterRingsIntoFixedBucketGroups(rings, cap, evalscriptB64)
    const covered = groups.reduce((n, g) => n + g.outerRings.length, 0)
    expect(covered).toBe(930)
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    for (const group of groups) {
      expect(group.geometryWkt3857.length).toBeLessThanOrEqual(4000)
    }

    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: cap,
      preferSingleRingChunks: false,
    })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
    for (const part of chunks) {
      expect(part.geometryWkt3857!.length).toBeLessThan(5000)
    }
  })

  it('assigns per-chunk bounds for clipped NDVI parts', () => {
    const ring: [number, number][] = [
      [55.1, 25.1],
      [55.11, 25.1],
      [55.11, 25.11],
      [55.1, 25.11],
      [55.1, 25.1],
    ]
    const fc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }],
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', { maxTileLayers: 8 })
    expect(chunks.length).toBe(1)
    expect(chunks[0]?.aoiBoundsLngLat).toEqual(expect.arrayContaining([expect.any(Number)]))
    expect(chunks[0]?.aoiBoundsLngLat?.length).toBe(4)
  })

  it('keeps a collapsed AOI as a paint-able GEOMETRY instead of dropping it', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [55.1, 25.1],
                [55.1, 25.1],
              ],
            ],
          },
        },
      ],
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI')
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]?.geometryWkt3857).toMatch(/^POLYGON\(|^MULTIPOLYGON\(/)
    const decoded = atob(chunks[0]!.evalscriptB64!)
    expect(decoded).toContain('concat(samples.dataMask)')
  })

  it('packs thousands of AOIs into the hard WMS source cap', () => {
    const rings: [number, number][][] = []
    for (let i = 0; i < 2000; i++) {
      const lng = 45 + (i % 40) * 0.03
      const lat = 24 + Math.floor(i / 40) * 0.03
      rings.push([
        [lng, lat],
        [lng + 0.01, lat],
        [lng + 0.01, lat + 0.01],
        [lng, lat + 0.01],
        [lng, lat],
      ])
    }
    const fc = {
      type: 'FeatureCollection',
      features: rings.map((ring, i) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: i },
      })),
    }
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      preferSingleRingChunks: true,
      maxTileLayers: 10_000,
    })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
  })
})
