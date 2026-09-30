import { describe, expect, it } from 'vitest'
import { mergeTemporalCropProps } from './temporalClassifyClient'
import {
  buildSegFormerFeatureProps,
  buildSegFormerFieldFeatureClassName,
  SEGFORMER_FEATURE_SCHEMA_KEYS,
} from './segformerFeatureNormalize'

describe('temporal crop prop merge', () => {
  const baseFc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'SF-00001',
        properties: {
          Feature_ID: 'SF-00001',
          Class_Name: 'Agricultural Field',
          Confidence: 0.7,
          Area_m2: 5000,
          Area_Hectare: 0.5,
          Perimeter: 280,
          Date: '2024-06-15',
          Provider: 'Sentinel Hub',
        },
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
  }

  it('attaches Crop_Type / Crop_Confidence from majority class', () => {
    const merged = mergeTemporalCropProps(baseFc, {
      majorityClassName: 'Wheat',
      majorityConfidence: 0.72,
      dates: ['2024-04-10', '2024-05-12', '2024-06-15'],
    })
    const p = merged.features[0]!.properties as Record<string, unknown>
    expect(p.Crop_Type).toBe('Wheat')
    expect(p.Crop_Confidence).toBe(0.72)
    expect(p.cropType).toBe('Wheat')
    expect(String(p.Temporal_Dates)).toContain('2024-04-10')
  })

  it('prefers per-feature crop hints over majority', () => {
    const merged = mergeTemporalCropProps(baseFc, {
      majorityClassName: 'Corn',
      cropByFeatureId: { 'SF-00001': { cropType: 'Rice', confidence: 0.9 } },
    })
    const p = merged.features[0]!.properties as Record<string, unknown>
    expect(p.Crop_Type).toBe('Rice')
    expect(p.Crop_Confidence).toBe(0.9)
  })

  it('keeps Crop_* in normalized GIS schema keys', () => {
    expect(SEGFORMER_FEATURE_SCHEMA_KEYS).toContain('Crop_Type')
    expect(SEGFORMER_FEATURE_SCHEMA_KEYS).toContain('Crop_Confidence')
    const props = buildSegFormerFeatureProps(
      { Feature_ID: 'SF-00002', Crop_Type: 'Soybeans', Crop_Confidence: 0.6 },
      { classId: 1, className: 'Agricultural Field', index: 0 },
    )
    expect(props.Crop_Type).toBe('Soybeans')
    expect(props.Crop_Confidence).toBe(0.6)
    expect(buildSegFormerFieldFeatureClassName({ withCropType: true })).toContain('Crop')
  })
})
