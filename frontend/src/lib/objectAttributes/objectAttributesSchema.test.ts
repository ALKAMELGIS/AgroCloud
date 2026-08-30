import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  FALLBACK_OBJECT_ATTRIBUTES_SCHEMA,
  parseObjectAttributesWorkbook,
  orderedObjectAttributePropertyKeys,
  objectAttributeTableColumns,
} from './objectAttributesSchema'
import { mapReportRowToObjectAttributes } from './objectAttributesMapper'
import type { AgriObjectReportRow } from '../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'

describe('objectAttributesSchema', () => {
  it('parses Example.xlsx from public/schemas', () => {
    const xlsxPath = path.resolve(__dirname, '../../../public/schemas/Example.xlsx')
    const buf = fs.readFileSync(xlsxPath)
    const schema = parseObjectAttributesWorkbook(buf)
    expect(schema.fields).toHaveLength(20)
    expect(schema.fields[0]?.name).toBe('OBJECT_ID')
    expect(schema.fields[19]?.name).toBe('INSPECT_PRI')
  })

  it('orders keys with schema columns first', () => {
    const keys = orderedObjectAttributePropertyKeys({ OBJECT_ID: 'OBJ-001', extra: 1 })
    expect(keys.slice(0, 20)).toEqual(FALLBACK_OBJECT_ATTRIBUTES_SCHEMA.fields.map(f => f.name))
  })

  it('orders table columns like Example.xlsx and hides internal keys', () => {
    const cols = objectAttributeTableColumns([
      'area_ha',
      'confidence',
      'OBJECT_ID',
      'NDVI',
      'CROP_TYPE',
      'engine',
    ])
    expect(cols.slice(0, 3)).toEqual(['OBJECT_ID', 'CROP_TYPE', 'NDVI'])
    expect(cols).not.toContain('area_ha')
    expect(cols).not.toContain('confidence')
  })
})

describe('objectAttributesMapper', () => {
  it('maps model row to Example.xlsx columns with real values', () => {
    const row = {
      fieldKey: 'afb-1',
      objectId: '1',
      objectName: 'Field B',
      objectType: 'Field',
      estimatedAreaHa: 45.2,
      agriculturalStatus: 'Agricultural',
      activeStatus: 'Active',
      landCoverType: 'Cropland',
      cropType: 'Wheat',
      cropTypeConfidencePct: 88,
      cropHealthStatus: 'Moderate',
      ndvi: 0.54,
      ndmi: 0.05,
      waterStressIndicator: 'Moderate',
      soilMoistureIndicator: 'Moderate',
      actualEt: 459,
      cropWaterRequirement: 630,
      estimatedYield: 6.8,
      estimatedTotalProduction: 307,
      changeFromPreviousPeriod: -0.08,
      anomalyDetected: 'Moderate vegetation stress signals',
      priorityForFieldInspection: 'HIGH',
    } as AgriObjectReportRow

    const attrs = mapReportRowToObjectAttributes(row, { index: 1, periodDays: 90 })
    expect(attrs.OBJECT_ID).toBe('OBJ-002')
    expect(attrs.OBJECT_TYPE).toBe('Field')
    expect(attrs.AREA_HA).toBe(45.2)
    expect(attrs.CROP_TYPE).toBe('Wheat')
    expect(attrs.CROP_CONF).toBe(88)
    expect(attrs.HEALTH_STATUS).toBe('Moderate Stress')
    expect(attrs.NDVI).toBe(0.54)
    expect(attrs.WATER_STRESS).toBe('Moderate')
    expect(typeof attrs.SOIL_MOIST).toBe('number')
    expect(attrs.ANOMALY).toBe('Water Stress')
    expect(attrs.INSPECT_PRI).toBe('High')
  })
})
