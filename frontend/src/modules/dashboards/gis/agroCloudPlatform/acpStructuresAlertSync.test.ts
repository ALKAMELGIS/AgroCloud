import { describe, expect, it } from 'vitest'
import { extractCropAlertFieldsFromMask, type CropAlertFieldResult } from '@/modules/remote-sensing/indices/siCropAlertEngine'
import {
  maskHasUncachedAlertFields,
  pruneCropAlertResultsToMask,
} from './acpStructuresAlertSync'

const mask: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { OBJECTID: 1, Structure_Type: 1007, Farm_Name: 'A' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[55, 24], [55.1, 24], [55.1, 24.1], [55, 24.1], [55, 24]]],
      },
    },
    {
      type: 'Feature',
      properties: { OBJECTID: 2, Structure_Type: 1006, Farm_Name: 'B' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[20, 44], [20.1, 44], [20.1, 44.1], [20, 44.1], [20, 44]]],
      },
    },
  ],
}

/** Minimal stub — sync helpers only read map keys (fieldKey). */
function resultFor(objectId: string, fieldKey: string): CropAlertFieldResult {
  const stub: Partial<CropAlertFieldResult> = {
    fieldKey,
    objectId,
    farmName: 'Field',
    farmCode: objectId,
    structureType: 'PIVOT',
    centroid: [55, 24],
    severity: 'normal',
    chasCurrent: 0.5,
    chasPrevious: 0.48,
    deltaChas: 0.02,
    ndviChangePct2: 1,
    ndviTrendLabel: 'Stable',
    alertReasonLines: [],
    alertExplanation: '',
  }
  return stub as CropAlertFieldResult
}

describe('acpStructuresAlertSync', () => {
  it('prunes alert results removed from the mask', () => {
    const [fieldA] = extractCropAlertFieldsFromMask(mask)
    expect(fieldA).toBeTruthy()
    const results = new Map<string, CropAlertFieldResult>([
      [fieldA!.fieldKey, resultFor('1', fieldA!.fieldKey)],
      ['drop', resultFor('9', 'drop')],
    ])
    pruneCropAlertResultsToMask(mask, results)
    expect(results.has('drop')).toBe(false)
    expect(results.has(fieldA!.fieldKey)).toBe(true)
  })

  it('detects uncached alert fields in the mask', () => {
    const results = new Map<string, CropAlertFieldResult>()
    expect(maskHasUncachedAlertFields(mask, results)).toBe(true)
  })
})
