/**
 * FoW / FTW dataset as automatic validation reference for field-boundary Results.
 * Detection (FTW live, Delineate, …) is compared against FoW catalog polygons
 * for the same AOI — without requiring hand-drawn Training & AI samples.
 */

import { fetchFowFieldBoundaries } from './fieldBoundaryClient'
import { isFowCatalogMissing } from './fowCountryOptions'
import { polygonFeaturesFromCollection } from './fieldValidationMetrics'

export type FowValidationReferenceRequest = {
  bbox: [number, number, number, number]
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Feature | GeoJSON.FeatureCollection
  minAreaM2?: number
  adminIso?: string
  signal?: AbortSignal
}

export type FowValidationReferenceResult = {
  geojson: GeoJSON.FeatureCollection | null
  label: string | null
  notice: string | null
}

/** True when the detection itself came from FoW — self-compare would be meaningless. */
export function detectionIsFowCatalog(engine: string | null | undefined, source?: string | null): boolean {
  const e = String(engine || '').toLowerCase()
  const s = String(source || '').toLowerCase()
  return (
    e === 'fow' ||
    e.includes('fields-of-the-world') ||
    s === 'fow' ||
    s === 'fields-of-the-world'
  )
}

export function shouldFetchFowValidationReference(opts: {
  engine?: string | null
  source?: string | null
  adminIso?: string | null
  hasDetection: boolean
}): { ok: boolean; notice: string | null } {
  if (!opts.hasDetection) {
    return { ok: false, notice: null }
  }
  if (detectionIsFowCatalog(opts.engine, opts.source)) {
    return {
      ok: false,
      notice:
        'Detection already used FoW catalog — pick FTW live / Delineate Anything to validate against FoW, or upload a reference.',
    }
  }
  if (isFowCatalogMissing(opts.adminIso)) {
    const iso = String(opts.adminIso || '').toUpperCase()
    return {
      ok: false,
      notice: `FoW / FTW dataset has no catalog for ${iso || 'this country'} — upload a reference GeoJSON for Validation Detection.`,
    }
  }
  return { ok: true, notice: null }
}

/** Fetch FoW parcels for the AOI and return a polygon-only FeatureCollection for metrics. */
export async function fetchFowValidationReference(
  req: FowValidationReferenceRequest,
): Promise<FowValidationReferenceResult> {
  const gate = shouldFetchFowValidationReference({
    hasDetection: true,
    adminIso: req.adminIso,
  })
  if (!gate.ok) {
    return { geojson: null, label: null, notice: gate.notice }
  }

  try {
    const out = await fetchFowFieldBoundaries({
      bbox: req.bbox,
      aoi: req.aoi,
      minAreaM2: req.minAreaM2,
      adminIso: req.adminIso,
      signal: req.signal,
    })
    const polys = polygonFeaturesFromCollection(out.geojson)
    if (!polys?.features?.length) {
      return {
        geojson: null,
        label: null,
        notice: 'FoW / FTW dataset returned no field polygons in this AOI.',
      }
    }
    const n = polys.features.length
    return {
      geojson: polys,
      label: `FoW / FTW dataset · ${n} polygon${n === 1 ? '' : 's'}`,
      notice: null,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return {
      geojson: null,
      label: null,
      notice: `FoW reference unavailable — ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
