import { describe, expect, it } from 'vitest'
import {
  buildSentinelHubWmsDisplayChunks,
  packOuterRingsIntoWktChunkGroups,
  packOuterRingsIntoWktChunks,
} from './sentinelHubWmsAoiClip'

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
