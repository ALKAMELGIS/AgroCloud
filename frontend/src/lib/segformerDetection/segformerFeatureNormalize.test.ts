import { describe, expect, it } from 'vitest'
import {
  buildSegFormerFeatureProps,
  buildSegFormerPredictionLayerName,
  getSegFormerPredictionLayerStyle,
  normalizeSegFormerFeatureCollection,
  SEGFORMER_FEATURE_SCHEMA_KEYS,
} from './segformerFeatureNormalize'

describe('segformerFeatureNormalize', () => {
  it('builds Feature_ID schema props with camelCase aliases', () => {
    const props = buildSegFormerFeatureProps(
      {
        objectId: 'SF-00001',
        className: 'Agricultural Field',
        classId: 1,
        confidence: 0.88,
        areaM2: 2500,
        perimeterM: 200,
      },
      {
        classId: 1,
        className: 'Agricultural Field',
        index: 0,
        date: '2026-07-01',
        provider: 'Sentinel Hub',
      },
    )
    expect(props.Feature_ID).toBe('SF-00001')
    expect(props.Class_Name).toBe('Agricultural Field')
    expect(props.Confidence).toBe(0.88)
    expect(props.Area_m2).toBe(2500)
    expect(props.Area_Hectare).toBe(0.25)
    expect(props.Perimeter).toBe(200)
    expect(props.Date).toBe('2026-07-01')
    expect(props.Provider).toBe('Sentinel Hub')
    expect(props.objectId).toBe('SF-00001')
    expect(props.className).toBe('Agricultural Field')
    expect(props.areaHa).toBe(0.25)
  })

  it('normalizes a FeatureCollection onto the schema keys', () => {
    const fc = normalizeSegFormerFeatureCollection(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { object_id: 'x1', class_name: 'Water', confidence: 0.7, area_m2: 100 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
      { classId: 60, className: 'Water', provider: 'CDSE', date: '2026-01-15' },
    )
    const p = fc.features[0]!.properties as Record<string, unknown>
    for (const key of SEGFORMER_FEATURE_SCHEMA_KEYS) {
      expect(p).toHaveProperty(key)
    }
    expect(p.Feature_ID).toBe('x1')
    expect(p.Class_Name).toBe('Water')
    expect(p.Provider).toBe('CDSE')
    expect(p.Date).toBe('2026-01-15')
  })

  it('uses agriculture symbology for Prediction Layer styling', () => {
    const style = getSegFormerPredictionLayerStyle('agriculture')
    expect(style.fillColor).toBe('#65a30d')
    expect(buildSegFormerPredictionLayerName('Agricultural Field')).toBe(
      'SegFormer Prediction Layer · Agricultural Field',
    )
    expect(buildSegFormerPredictionLayerName(null)).toBe('SegFormer Prediction Layer')
  })
})
