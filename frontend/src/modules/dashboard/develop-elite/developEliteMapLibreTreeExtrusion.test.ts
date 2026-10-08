import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteTreeExtrusionGeoJson,
  DEVELOP_ELITE_PALM_TREE_EXTRUSION_HEIGHT_M,
  developEliteTreeFeatureIsPalm,
  developEliteTreeFeatureKind,
} from './developEliteMapLibreTreeExtrusion'

describe('developEliteTreeFeatureKind', () => {
  it('detects date palm labels from attributes', () => {
    expect(developEliteTreeFeatureKind({ Tree_Type: 'Date Tree' })).toBe('palm')
    expect(developEliteTreeFeatureKind({ Species: 'Date Palm' })).toBe('palm')
    expect(developEliteTreeFeatureIsPalm({ Tree_Type: 'Date Tree' })).toBe(true)
  })

  it('classifies fruit and citrus', () => {
    expect(developEliteTreeFeatureKind({ Tree_Type: 'Mango' })).toBe('fruit')
    expect(developEliteTreeFeatureKind({ Tree_Type: 'Orange' })).toBe('citrus')
    expect(developEliteTreeFeatureKind({ Tree_Type: 'Grape' })).toBe('vine')
  })

  it('detects palm classes from unique-value drawingInfo', () => {
    const drawingInfo = {
      renderer: {
        type: 'uniqueValue',
        field1: 'Tree_Type',
        uniqueValueInfos: [{ value: '200', label: 'Date Tree', symbol: { type: 'esriPMS', color: [180, 120, 40, 255] } }],
      },
    }
    expect(developEliteTreeFeatureKind({ Tree_Type: 200 }, drawingInfo)).toBe('palm')
  })
})

describe('buildDevelopEliteTreeExtrusionGeoJson', () => {
  it('builds simple 3D columns for every tree point with type-specific height', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Tree_Type: 'Date Tree' },
          geometry: { type: 'Point', coordinates: [55.1, 25.2] },
        },
        {
          type: 'Feature',
          properties: { Tree_Type: 'Mango' },
          geometry: { type: 'Point', coordinates: [55.2, 25.2] },
        },
        {
          type: 'Feature',
          properties: { Tree_Type: 'Orange' },
          geometry: { type: 'Point', coordinates: [55.3, 25.2] },
        },
      ],
    }
    const out = buildDevelopEliteTreeExtrusionGeoJson(fc, null)
    expect(out.features).toHaveLength(3)
    const palm = out.features.find(f => f.properties?.de_tree_kind === 'palm')
    const fruit = out.features.find(f => f.properties?.de_tree_kind === 'fruit')
    const citrus = out.features.find(f => f.properties?.de_tree_kind === 'citrus')
    expect(palm?.properties?.de_extrude_h).toBe(DEVELOP_ELITE_PALM_TREE_EXTRUSION_HEIGHT_M)
    expect(fruit?.properties?.de_extrude_h).toBe(5.2)
    expect(citrus?.properties?.de_extrude_h).toBe(4.6)
    expect(palm?.geometry.type).toBe('Polygon')
  })
})
