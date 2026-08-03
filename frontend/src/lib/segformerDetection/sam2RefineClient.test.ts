import { describe, expect, it } from 'vitest'
import { normalizeSam2RefineResult } from './sam2RefineClient'

describe('sam2RefineClient normalize', () => {
  it('normalizes refine response into Feature_ID schema', () => {
    const out = normalizeSam2RefineResult(
      {
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                Feature_ID: 'SF-00001',
                Confidence: 0.81,
                Area_m2: 1200,
                Area_Hectare: 0.12,
                Perimeter: 140,
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
        },
        count: 1,
        score: 0.81,
        mask_png: 'data:image/png;base64,xx',
        width: 100,
        height: 80,
        engine: 'sam2',
      },
      { date: '2024-06-15', provider: 'Sentinel Hub' },
    )

    expect(out.count).toBe(1)
    expect(out.engine).toBe('sam2')
    expect(out.maskPng).toContain('data:image/png')
    const props = out.geojson.features[0]!.properties as Record<string, unknown>
    expect(props.Feature_ID).toBe('SF-00001')
    expect(props.Class_Name).toBe('Agricultural Field')
    expect(props.Confidence).toBe(0.81)
    expect(props.Date).toBe('2024-06-15')
    expect(props.Provider).toBe('Sentinel Hub')
  })
})
