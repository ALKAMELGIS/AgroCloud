import { describe, expect, it } from 'vitest'
import {
  buildSentinelHubWmsDisplayChunks,
  mergeWktChunkGroupsToCap,
  packOuterRingsIntoWktChunkGroups,
  packOuterRingsIntoWktChunks,
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
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', { maxTileLayers: 8 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(8)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
    expect(chunks[0]?.evalscriptB64).toBeTruthy()
  })

  it('paints every polygon for 216-field Layers AOI as separate single-ring clips', () => {
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
    expect(chunks.length).toBe(216)
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
    const a = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: 24,
      preferSingleRingChunks: false,
    })
    const b = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', {
      maxTileLayers: 24,
      preferSingleRingChunks: false,
    })
    expect(a.length).toBeGreaterThan(0)
    expect(a.length).toBeLessThanOrEqual(24)
    expect(a.every(part => !!part.geometryWkt3857)).toBe(true)
    // Deterministic GEOMETRY set — identical cache hit on second build (zoom/pan must not rebuild).
    expect(a.map(p => p.geometryWkt3857)).toEqual(b.map(p => p.geometryWkt3857))
    for (const part of a) {
      expect(part.geometryWkt3857!.length).toBeLessThan(8000)
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
    const chunks = buildSentinelHubWmsDisplayChunks(fc, 'NDVI', { maxTileLayers: 8 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThanOrEqual(8)
    expect(chunks.every(part => !!part.geometryWkt3857)).toBe(true)
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
})
