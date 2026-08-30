import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const buildModel = vi.fn()
const classifyParcels = vi.fn()

vi.mock('./fieldParcelCropTypingClient', () => ({
  classifyFieldParcelsCropTypes: (...args: unknown[]) => classifyParcels(...args),
  cropHintsMapFromParcelResults: (parcels: Array<{ fieldKey: string; cropType: string | null; confidencePct: number | null; engine: string | null }>) => {
    const out = new Map<string, { cropType: string; confidencePct: number; engine: string }>()
    for (const p of parcels) {
      if (!p.fieldKey || !p.cropType) continue
      out.set(p.fieldKey, {
        cropType: p.cropType,
        confidencePct: p.confidencePct ?? 0,
        engine: p.engine || 'prithvi',
      })
    }
    return out
  },
}))

vi.mock('../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel', () => ({
  buildAgriculturalObjectIntelligenceModel: (...args: unknown[]) => buildModel(...args),
}))

import {
  FIELD_ATTRIBUTE_LAYER_IDS,
  defaultAttributeWindow,
  orderedFieldAttributePropertyKeys,
  enrichFieldAttributesFromSentinel2,
  fieldAttributesNeedRefresh,
  hasFieldAttributes,
  preloadObjectAttributesSchema,
} from './fieldAttributeEnrichment'
import {
  FALLBACK_OBJECT_ATTRIBUTES_SCHEMA,
  OBJECT_ATTRIBUTES_STAMP,
  parseObjectAttributesWorkbook,
  resetObjectAttributesSchemaCache,
} from '../objectAttributes/objectAttributesSchema'

const EXAMPLE_COLUMNS = FALLBACK_OBJECT_ATTRIBUTES_SCHEMA.fields.map(f => f.name)

function square(id: number, offset: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { field_id: id, area_ha: 1.5 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [offset, 0],
          [offset + 0.01, 0],
          [offset + 0.01, 0.01],
          [offset, 0.01],
          [offset, 0],
        ],
      ],
    },
  }
}

describe('fieldAttributeEnrichment', () => {
  beforeEach(async () => {
    resetObjectAttributesSchemaCache()
    await preloadObjectAttributesSchema()
    classifyParcels.mockResolvedValue({
      engine: 'prithvi',
      parcels: [
        { fieldKey: 'afb-1', cropType: 'Wheat', confidencePct: 82, engine: 'prithvi' },
        { fieldKey: 'afb-2', cropType: null, confidencePct: null, engine: null },
      ],
    })
  })

  it('loads Example.xlsx schema with exact column order', () => {
    const xlsxPath = path.resolve(__dirname, '../../../public/schemas/Example.xlsx')
    const buf = fs.readFileSync(xlsxPath)
    const schema = parseObjectAttributesWorkbook(buf)
    expect(schema.fields.map(f => f.name)).toEqual(EXAMPLE_COLUMNS)
  })

  it('matches Example.xlsx columns exactly, in template order', () => {
    expect(EXAMPLE_COLUMNS).toEqual([
      'OBJECT_ID',
      'OBJECT_TYPE',
      'OBJECT_NAME',
      'AREA_HA',
      'AGRI_STATUS',
      'ACTIVE_STATUS',
      'LAND_COVER',
      'CROP_TYPE',
      'CROP_CONF',
      'HEALTH_STATUS',
      'NDVI',
      'WATER_STRESS',
      'SOIL_MOIST',
      'ET_MM_DAY',
      'WATER_REQ',
      'EST_YIELD',
      'TOTAL_PROD',
      'CHANGE',
      'ANOMALY',
      'INSPECT_PRI',
    ])
  })

  it('stamps Example.xlsx rows onto matching features', async () => {
    buildModel.mockResolvedValueOnce({
      objects: [
        {
          fieldKey: 'afb-1',
          objectId: '1',
          objectName: 'Field 1',
          objectType: 'Field',
          estimatedAreaHa: 1.5,
          agriculturalStatus: 'Agricultural',
          activeStatus: 'Active',
          landCoverType: 'Cropland',
          ndvi: '0.49',
          ndre: '0.33',
          ndmi: '0.21',
          cropType: 'Wheat',
          cropTypeConfidencePct: 82,
          cropHealthStatus: 'Healthy',
          waterStressIndicator: 'Low',
          soilMoistureIndicator: 'Moist',
          actualEt: 144,
          cropWaterRequirement: 186,
          estimatedYield: 6.8,
          estimatedTotalProduction: 10.2,
          changeFromPreviousPeriod: 0.12,
          anomalyDetected: 'No significant anomaly',
          priorityForFieldInspection: 'LOW',
        },
        {
          fieldKey: 'afb-2',
          objectId: '2',
          objectName: 'Field 2',
          ndvi: 0.52,
          cropType: 'Herbaceous cropland',
        },
      ],
    })

    const enriched = await enrichFieldAttributesFromSentinel2(
      { type: 'FeatureCollection', features: [square(1, 55.9), square(2, 55.92)] },
      { fromDate: '2026-05-13', toDate: '2026-08-11' },
    )

    expect(buildModel).toHaveBeenCalledWith(
      expect.objectContaining({
        layerIds: [...FIELD_ATTRIBUTE_LAYER_IDS],
        fromDate: '2026-05-13',
        toDate: '2026-08-11',
        cropByFieldKey: expect.any(Map),
        cropEngineLabel: 'HLS Prithvi (18 ch)',
      }),
    )

    expect(classifyParcels).toHaveBeenCalled()

    const first = enriched.features[0]!.properties as Record<string, unknown>
    expect(first.OBJECT_ID).toBe('OBJ-001')
    expect(first.CROP_TYPE).toBe('Wheat')
    expect(first.CROP_CONF).toBe(82)
    expect(first.NDVI).toBe(0.49)
    expect(first.WATER_STRESS).toBe('Low')
    expect(Object.keys(first).slice(0, EXAMPLE_COLUMNS.length)).toEqual(EXAMPLE_COLUMNS)
    expect(first.area_ha).toBe(1.5)
    expect(String(first[OBJECT_ATTRIBUTES_STAMP])).toContain('HLS Prithvi')
    expect(first.attributes_period).toBe('2026-05-13 → 2026-08-11')
    expect(fieldAttributesNeedRefresh(enriched)).toBe(false)

    const second = enriched.features[1]!.properties as Record<string, unknown>
    expect(second.NDVI).toBe(0.52)
    expect(hasFieldAttributes(enriched)).toBe(true)
  })

  it('uses Example empty formats when model returns no values', async () => {
    buildModel.mockResolvedValueOnce({
      objects: [
        {
          fieldKey: 'afb-1',
          objectId: '1',
          objectName: 'Field 1',
          ndvi: 'Not Available',
          cropType: 'Not Available',
        },
      ],
    })

    const enriched = await enrichFieldAttributesFromSentinel2(
      { type: 'FeatureCollection', features: [square(1, 55.9)] },
      { fromDate: '2026-08-11', toDate: '2026-08-11' },
    )

    const props = enriched.features[0]!.properties as Record<string, unknown>
    expect(props.CROP_TYPE).toBe('None')
    expect(props.CROP_CONF).toBe(0)
    expect(props.NDVI).toBe(0)
    expect(props.WATER_STRESS).toBe('Unknown')
  })

  it('leaves the collection untouched when there is nothing to enrich', async () => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    await expect(
      enrichFieldAttributesFromSentinel2(empty, { fromDate: '2026-01-01', toDate: '2026-02-01' }),
    ).resolves.toBe(empty)
    expect(hasFieldAttributes(empty)).toBe(false)
  })

  it('defaults to the 90 days before the scene date', () => {
    expect(defaultAttributeWindow('2026-08-11')).toEqual({
      fromDate: '2026-05-13',
      toDate: '2026-08-11',
    })
  })

  it('orders property keys like Example.xlsx', () => {
    const keys = orderedFieldAttributePropertyKeys({
      NDVI: 0.5,
      OBJECT_ID: 'OBJ-001',
      area_ha: 2,
      z_extra: 'x',
    })
    expect(keys.slice(0, EXAMPLE_COLUMNS.length)).toEqual(EXAMPLE_COLUMNS)
    expect(keys).toContain('area_ha')
    expect(keys.indexOf('z_extra')).toBeGreaterThan(keys.indexOf('area_ha'))
  })
})
