import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import { fetchWaporAetBatch, type WaporAetBatchEntry } from '../../../../lib/waporAetApi'
import { resolvePlotCentroidLonLat } from './waterRequirementEt0'

export type FieldAetEntry = {
  fieldKey: string
  plot: CropAlertFieldInput
  observationDate: string
}

/**
 * Batch WaPOR AET fetch — deduplicated on server by lon/lat/date.
 */
export async function fetchBatchAetByField(
  entries: FieldAetEntry[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const batch: WaporAetBatchEntry[] = []
  for (const entry of entries) {
    const point = resolvePlotCentroidLonLat(entry.plot)
    const obs = entry.observationDate.trim().slice(0, 10)
    if (!point || !obs) continue
    batch.push({
      fieldKey: entry.fieldKey,
      lon: point.lon,
      lat: point.lat,
      observationDate: obs,
    })
  }
  if (!batch.length) return new Map()
  try {
    return await fetchWaporAetBatch(batch, signal)
  } catch {
    return new Map()
  }
}
