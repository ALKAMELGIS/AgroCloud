import { describe, expect, it } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import {
  buildPlotLayerAttributesMap,
  readPlotLayerAttributesFromProps,
  resolveExportFieldId,
  resolveExportFieldName,
  resolvePlotLayerAttributesForExport,
} from './plotLayerAttributes'

function makePlot(
  partial: Partial<CropAlertFieldInput> & { fieldKey: string },
): CropAlertFieldInput {
  return {
    fieldKey: partial.fieldKey,
    objectId: partial.objectId ?? 'Plot_1',
    farmName: partial.farmName ?? 'Plot',
    farmCode: partial.farmCode ?? '',
    structureType: partial.structureType ?? 'AOI',
    country: partial.country ?? '',
    city: partial.city ?? '',
    centroid: partial.centroid ?? [0, 0],
    geometry: partial.geometry,
  }
}

describe('readPlotLayerAttributesFromProps', () => {
  it('reads uppercase GIS keys from the AOI popup (FIELD_ID, CROP_TYPE, IRRIGATION)', () => {
    expect(
      readPlotLayerAttributesFromProps({
        FIELD_ID: '503 - KL-233S',
        CROP_TYPE: 'Not Available',
        IRRIGATION: 'Irrigated',
        HARVEST_ST: 'Harvested',
        AREA: 74.537,
      }),
    ).toEqual({
      fieldId: '503 - KL-233S',
      fieldName: '—',
      cropType: '—',
      irrigationType: 'Irrigated',
    })
  })
})

describe('resolveExportFieldName', () => {
  it('uses Field_ID as Field Name when Field_Name is missing', () => {
    const attrs = readPlotLayerAttributesFromProps({
      FIELD_ID: '503 - KL-233S',
      IRRIGATION: 'Irrigated',
    })
    expect(resolveExportFieldName(attrs, 'Plot_1', 'Plot_1')).toBe('503 - KL-233S')
    expect(resolveExportFieldId(attrs, 'Plot_1')).toBe('503 - KL-233S')
  })
})

describe('resolvePlotLayerAttributesForExport', () => {
  it('indexes attributes by fieldKey from objectLayerFeatures', () => {
    const plot = makePlot({ fieldKey: 'vl:AOI_Farm:12', objectId: 'Plot_13' })
    const attrs = resolvePlotLayerAttributesForExport(plot, [
      {
        fieldKey: 'vl:AOI_Farm:12',
        feature: {
          type: 'Feature',
          properties: {
            Field_ID: '503 - KL-233S',
            Field_Name: '503 - KL-233S',
            Irrigation: 'Irrigated',
          },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      },
    ])
    expect(attrs.fieldId).toBe('503 - KL-233S')
    expect(attrs.fieldName).toBe('503 - KL-233S')
    expect(attrs.irrigationType).toBe('Irrigated')
  })
})

describe('buildPlotLayerAttributesMap', () => {
  it('indexes attributes by fieldKey', () => {
    const map = buildPlotLayerAttributesMap([
      {
        fieldKey: 'vl:layer#0',
        feature: {
          type: 'Feature',
          properties: { Field_ID: 'Plot_1', Field_Name: '501a KL-0231' },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      },
    ])
    expect(map.get('vl:layer#0')?.fieldName).toBe('501a KL-0231')
  })
})
