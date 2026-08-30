/**
 * Unified object attribute enrichment for any detected / exported GeoJSON layer.
 */

import {
  enrichFieldAttributesFromSentinel2,
  defaultAttributeWindow,
  type EnrichFieldAttributesOptions,
} from '../agriFieldBoundary/fieldAttributeEnrichment'
import { loadObjectAttributesSchema } from './objectAttributesSchema'

export type EnrichObjectAttributesOptions = {
  fromDate?: string
  toDate?: string
  sceneDate?: string | null
  layerName?: string
  layerIds?: string[]
  signal?: AbortSignal
  onProgress?: EnrichFieldAttributesOptions['onProgress']
}

/**
 * Enrich a feature collection with Example.xlsx attributes.
 * Uses a 90-day window ending on sceneDate when from/to not supplied.
 */
export async function enrichObjectAttributes(
  fc: GeoJSON.FeatureCollection,
  opts?: EnrichObjectAttributesOptions,
): Promise<GeoJSON.FeatureCollection> {
  const schema = await loadObjectAttributesSchema()
  const window =
    opts?.fromDate && opts?.toDate
      ? { fromDate: opts.fromDate, toDate: opts.toDate }
      : defaultAttributeWindow(opts?.sceneDate)
  return enrichFieldAttributesFromSentinel2(fc, {
    ...window,
    layerName: opts?.layerName,
    layerIds: opts?.layerIds,
    signal: opts?.signal,
    onProgress: opts?.onProgress,
    schema,
  })
}
