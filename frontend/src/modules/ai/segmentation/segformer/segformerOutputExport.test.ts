import { describe, expect, it } from 'vitest'
import {
  buildSegFormerExportStem,
  forSegFormerGeoJsonExport,
  forSegFormerShapefileExport,
} from './segformerOutputExport'

describe('segformerOutputExport', () => {
  it('builds a filesystem-safe stem from the class name', () => {
    expect(buildSegFormerExportStem('Building')).toBe('segformer-building')
    expect(buildSegFormerExportStem('Tree Canopy')).toBe('segformer-tree-canopy')
    expect(buildSegFormerExportStem('')).toBe('segformer-detections')
  })

  it('maps SegFormer feature props to shapefile DBF-friendly keys plus schema names', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'sf-1',
          properties: {
            objectId: 'sf-1',
            className: 'Building',
            classId: 21,
            confidence: 0.91,
            areaM2: 1200,
            areaHa: 0.12,
            perimeterM: 140,
            date: '2026-07-01',
            provider: 'Sentinel Hub',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [55, 25],
                [55.1, 25],
                [55.1, 25.1],
                [55, 25.1],
                [55, 25],
              ],
            ],
          },
        },
      ],
    }
    const out = forSegFormerShapefileExport(fc, {
      classId: 21,
      className: 'Building',
      date: '2026-07-01',
      provider: 'Sentinel Hub',
    })
    const p = out.features[0]!.properties as Record<string, unknown>
    expect(p.field_id).toBe('sf-1')
    expect(p.Feature_ID).toBe('sf-1')
    expect(p.class_name).toBe('Building')
    expect(p.Class_Name).toBe('Building')
    expect(p.class_id).toBe(21)
    expect(p.area_m2).toBe(1200)
    expect(p.Area_Hectare).toBe(0.12)
    expect(p.perimeter_m).toBe(140)
    expect(p.Date).toBe('2026-07-01')
    expect(p.Provider).toBe('Sentinel Hub')
  })

  it('orders GeoJSON properties with schema keys first', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            objectId: 'a',
            className: 'Tree',
            classId: 4,
            confidence: 0.5,
            areaM2: 10,
            areaHa: 0.001,
            perimeterM: 12,
          },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    }
    const out = forSegFormerGeoJsonExport(fc, { classId: 4, className: 'Tree', provider: 'Mapbox' })
    const keys = Object.keys(out.features[0]!.properties || {})
    expect(keys.slice(0, 3)).toEqual(['Feature_ID', 'Class_Name', 'Confidence'])
    expect((out.features[0]!.properties as Record<string, unknown>).Provider).toBe('Mapbox')
  })
})
