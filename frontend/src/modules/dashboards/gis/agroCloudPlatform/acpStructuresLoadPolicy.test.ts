import { describe, expect, it } from 'vitest'
import {
  geojsonCollectionSignature,
  quantizeViewportBboxSignature,
  resolveAgroStructuresPortalSignature,
} from './acpStructuresLoadPolicy'

describe('geojsonCollectionSignature', () => {
  it('returns empty for missing features', () => {
    expect(geojsonCollectionSignature(null)).toBe('empty')
    expect(geojsonCollectionSignature({ type: 'FeatureCollection', features: [] })).toBe('empty')
  })

  it('includes feature count and object-id fingerprint', () => {
    const sig = geojsonCollectionSignature({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { OBJECTID: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { OBJECTID: 99 }, geometry: { type: 'Point', coordinates: [1, 1] } },
      ],
    })
    expect(sig.startsWith('2:2:1:99:')).toBe(true)
  })

  it('detects inserted features between endpoints', () => {
    const base: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { OBJECTID: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { OBJECTID: 99 }, geometry: { type: 'Point', coordinates: [1, 1] } },
      ],
    }
    const inserted: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        base.features[0]!,
        { type: 'Feature', properties: { OBJECTID: 50 }, geometry: { type: 'Point', coordinates: [0.5, 0.5] } },
        base.features[1]!,
      ],
    }
    expect(geojsonCollectionSignature(base)).not.toBe(geojsonCollectionSignature(inserted))
  })

  it('is stable for the same collection', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { objectid: 5 }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    }
    expect(geojsonCollectionSignature(fc)).toBe(geojsonCollectionSignature(fc))
  })
})

describe('quantizeViewportBboxSignature', () => {
  it('returns null for missing bbox', () => {
    expect(quantizeViewportBboxSignature(null)).toBeNull()
  })

  it('snaps nearby bboxes to the same signature', () => {
    const a: [number, number, number, number] = [10.01, 20.01, 10.019, 20.019]
    const b: [number, number, number, number] = [10.011, 20.011, 10.018, 20.018]
    expect(quantizeViewportBboxSignature(a)).toBe(quantizeViewportBboxSignature(b))
  })

  it('differs for distant bboxes', () => {
    const near: [number, number, number, number] = [10, 20, 10.1, 20.1]
    const far: [number, number, number, number] = [50, 60, 50.1, 60.1]
    expect(quantizeViewportBboxSignature(near)).not.toBe(quantizeViewportBboxSignature(far))
  })
})

describe('resolveAgroStructuresPortalSignature', () => {
  it('returns external when no portal Agro_Structures row is active', () => {
    expect(resolveAgroStructuresPortalSignature()).toBe('external')
  })
})
