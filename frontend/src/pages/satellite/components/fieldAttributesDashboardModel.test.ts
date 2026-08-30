import { describe, expect, it } from 'vitest'
import { buildFieldAttributesDashboardModel } from './fieldAttributesDashboardModel'

const sampleFc: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        OBJECT_NAME: 'Field A',
        AREA_HA: 2.5,
        NDVI: 0.72,
        CROP_TYPE: 'Wheat',
        HEALTH_STATUS: 'Healthy',
        INSPECT_PRI: 'Low',
      },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    },
    {
      type: 'Feature',
      properties: {
        OBJECT_NAME: 'Field B',
        AREA_HA: 1.1,
        NDVI: 0.35,
        CROP_TYPE: 'Barley',
        HEALTH_STATUS: 'Moderate stress',
        INSPECT_PRI: 'High',
      },
      geometry: { type: 'Polygon', coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] },
    },
    {
      type: 'Feature',
      properties: {
        OBJECT_NAME: 'Field C',
        AREA_HA: 0.8,
        NDVI: 0.55,
        CROP_TYPE: 'Wheat',
        HEALTH_STATUS: 'Healthy',
      },
      geometry: { type: 'Polygon', coordinates: [[[0, 1], [1, 1], [1, 2], [0, 2], [0, 1]]] },
    },
  ],
}

describe('buildFieldAttributesDashboardModel', () => {
  it('returns null for empty feature collections', () => {
    expect(buildFieldAttributesDashboardModel(null)).toBeNull()
    expect(buildFieldAttributesDashboardModel({ type: 'FeatureCollection', features: [] })).toBeNull()
  })

  it('aggregates KPIs and chart rows from enriched attributes', () => {
    const model = buildFieldAttributesDashboardModel(sampleFc, {
      engine: 'AgroDetect S2',
      sceneDate: '2024-06-15',
      provider: 'Sentinel-2 L2A',
    })
    expect(model).not.toBeNull()
    expect(model!.fieldCount).toBe(3)
    expect(model!.totalAreaHa).toBe(4.4)
    expect(model!.meanNdvi).toBeCloseTo(0.54, 2)
    expect(model!.cropTypeCount).toBe(2)
    expect(model!.highInspectCount).toBe(1)
    expect(model!.healthyPct).toBe(67)
    expect(model!.engine).toBe('AgroDetect S2')
    expect(model!.sceneDate).toBe('2024-06-15')
    expect(model!.areaByField[0].label).toBe('Field A')
    expect(model!.cropMix.find(r => r.label === 'Wheat')?.count).toBe(2)
    expect(model!.ndviByField.length).toBe(3)
    expect(model!.indexTimeSeries).toBeNull()
    expect(model!.ndviBuckets.some(r => r.count > 0)).toBe(true)
    expect(model!.attributeMixes.some(c => c.fieldName === 'INSPECT_PRI')).toBe(true)
  })

  it('builds charts for extra Example.xlsx string fields', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            OBJECT_NAME: 'Field A',
            AREA_HA: 1,
            WATER_STRESS: 'Moderate',
            AGRI_STATUS: 'Agricultural',
          },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        },
        {
          type: 'Feature',
          properties: {
            OBJECT_NAME: 'Field B',
            AREA_HA: 2,
            WATER_STRESS: 'High',
            AGRI_STATUS: 'Agricultural',
          },
          geometry: { type: 'Polygon', coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] },
        },
      ],
    }
    const model = buildFieldAttributesDashboardModel(fc)
    expect(model!.attributeMixes.some(c => c.fieldName === 'WATER_STRESS')).toBe(true)
    expect(model!.attributeMixes.some(c => c.fieldName === 'AGRI_STATUS')).toBe(true)
  })
})
