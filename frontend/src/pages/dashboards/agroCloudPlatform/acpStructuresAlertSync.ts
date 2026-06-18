import {
  extractCropAlertFieldsFromMask,
  type CropAlertFieldResult,
} from '../../../lib/siCropAlertEngine'

/** Drop alert results for fields no longer present in the Agro_Structures mask. */
export function pruneCropAlertResultsToMask(
  mask: GeoJSON.FeatureCollection | null | undefined,
  results: Map<string, CropAlertFieldResult>,
): void {
  const validKeys = new Set(extractCropAlertFieldsFromMask(mask).map(f => f.fieldKey))
  for (const key of results.keys()) {
    if (!validKeys.has(key)) results.delete(key)
  }
}

/** True when the mask contains alert-eligible fields without computed results. */
export function maskHasUncachedAlertFields(
  mask: GeoJSON.FeatureCollection | null | undefined,
  results: Map<string, CropAlertFieldResult>,
): boolean {
  const fields = extractCropAlertFieldsFromMask(mask)
  return fields.some(f => !results.has(f.fieldKey))
}
