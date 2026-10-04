import { describe, expect, it } from 'vitest'
import { buildDevelopEliteStructureFeatureMeta } from './developEliteMapStructureMeta'

describe('developEliteMapStructureMeta', () => {
  it('indexes features without scanning the collection per lookup', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { OBJECTID: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { OBJECTID: 2 }, geometry: { type: 'Point', coordinates: [1, 1] } },
      ],
    }
    const meta = buildDevelopEliteStructureFeatureMeta(geojson)
    expect(meta.get(geojson.features[0])?.key).toBeTruthy()
    expect(meta.get(geojson.features[1])?.key).toBeTruthy()
    expect(meta.get(geojson.features[0])?.key).not.toBe(meta.get(geojson.features[1])?.key)
  })
})
