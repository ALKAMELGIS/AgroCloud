/**
 * FTW export — continuous raster mosaic → vectorize from pixel boundaries → SHP/GeoJSON.
 *
 * Pipeline (NOT PMTiles → vector):
 *   Analysis tiles → union raster array → contour vectorization → min-area cleanup → export
 *
 * Preserves raster extent/resolution/classification; no smoothing, resample, or tile-edge geometry.
 */

import * as turf from '@turf/turf'
import {
  buildFtwAoiRasterMosaic,
  sampleFtwMosaicConfidence,
  vectorizeFtwMosaic,
} from './ftwAoiMosaicVectorize'
import { hideFtwTileBoundariesOnly } from './ftwHideTileBoundaries'
import { loadFtwFeaturesForBbox, pickFtwZoomForBbox, type LngLatBbox } from './ftwPmtilesFeatures'
import { clipFeatureCollectionToAoi } from '../trainingAi/clipResultsToAoi'
import { yieldToMain } from '../yieldToMain'
import type { FtwGlobalYear } from './ftwGlobalConfig'

/** FTW parcels can be smaller than map-RGB detect defaults — keep small real fields. */
const FTW_EXPORT_MAX_MIN_AREA_M2 = 150

function toAoiFeatureCollection(
  aoi: GeoJSON.FeatureCollection | GeoJSON.Geometry | GeoJSON.Feature,
): GeoJSON.FeatureCollection {
  if (aoi.type === 'FeatureCollection') return aoi
  if (aoi.type === 'Feature') {
    return { type: 'FeatureCollection', features: [aoi] }
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: aoi }],
  }
}

function padBbox(bbox: LngLatBbox, ratio = 0.06): LngLatBbox {
  const [west, south, east, north] = bbox
  const padX = (east - west) * ratio
  const padY = (north - south) * ratio
  return [west - padX, south - padY, east + padX, north + padY]
}

export type BuildFtwAoiExportGeojsonOptions = {
  aoi: GeoJSON.FeatureCollection | GeoJSON.Geometry | GeoJSON.Feature
  year: FtwGlobalYear
  thresholdPct: number
  minAreaM2?: number
  signal?: AbortSignal
  onProgress?: (message: string) => void
}

/** Direct PMTiles → clip when /ftw-mosaic-vectorize is unavailable. */
async function buildFtwAoiExportGeojsonFromFeatures(
  options: BuildFtwAoiExportGeojsonOptions,
): Promise<GeoJSON.FeatureCollection> {
  const aoiFc = toAoiFeatureCollection(options.aoi)
  const rawBbox = turf.bbox(aoiFc) as LngLatBbox
  const bbox = padBbox(rawBbox)
  const minArea = Math.min(options.minAreaM2 ?? FTW_EXPORT_MAX_MIN_AREA_M2, FTW_EXPORT_MAX_MIN_AREA_M2)

  options.onProgress?.('Loading FTW fields from global PMTiles (browser)…')
  const loaded = await loadFtwFeaturesForBbox({
    year: options.year,
    thresholdPct: options.thresholdPct,
    bbox,
    signal: options.signal,
  })
  if (!loaded.length) {
    throw new Error('No FTW fields in this AOI at the current confidence threshold.')
  }

  await yieldToMain()
  const deduped = hideFtwTileBoundariesOnly(loaded, pickFtwZoomForBbox(bbox))
  options.onProgress?.('Clipping FTW fields to AOI…')
  const clipped = clipFeatureCollectionToAoi(
    { type: 'FeatureCollection', features: deduped },
    aoiFc,
  )

  await yieldToMain()
  const features = (clipped.features ?? []).filter(f => {
    try {
      return turf.area(f as turf.AllGeoJSON) >= minArea
    } catch {
      return false
    }
  })

  if (!features.length) {
    throw new Error('No FTW fields in this AOI at the current confidence threshold.')
  }

  return normalizeFtwExportGeojson({ type: 'FeatureCollection', features }, options.year)
}

/**
 * Raster-first export: merge PMTiles into one binary mask, vectorize pixel edges only.
 * Falls back to direct PMTiles clip when the vectorize API is down.
 */
export async function buildFtwAoiExportGeojson(
  options: BuildFtwAoiExportGeojsonOptions,
): Promise<GeoJSON.FeatureCollection> {
  const aoiFc = toAoiFeatureCollection(options.aoi)
  const rawBbox = turf.bbox(aoiFc) as LngLatBbox
  const bbox = padBbox(rawBbox)
  const minArea = Math.min(options.minAreaM2 ?? FTW_EXPORT_MAX_MIN_AREA_M2, FTW_EXPORT_MAX_MIN_AREA_M2)

  try {
    options.onProgress?.('Building continuous raster mosaic (no tile grid)…')
    const { mosaic } = await buildFtwAoiRasterMosaic({
      year: options.year,
      thresholdPct: options.thresholdPct,
      bbox,
      signal: options.signal,
    })

    await yieldToMain()
    options.onProgress?.('Vectorizing from raster pixel boundaries…')
    const vectorized = await vectorizeFtwMosaic(mosaic, {
      aoi: aoiFc,
      minAreaM2: minArea,
      signal: options.signal,
      preserveGeometry: true,
    })

    const rawFc = vectorized.geojson
    if (!rawFc?.features?.length) {
      throw new Error('No FTW fields in this AOI at the current confidence threshold.')
    }

    await yieldToMain()
    options.onProgress?.('Clipping to AOI…')
    const clipped = clipFeatureCollectionToAoi(rawFc, aoiFc)

    await yieldToMain()
    options.onProgress?.('Applying minimum area filter…')
    const features = (clipped.features ?? []).filter(f => {
      try {
        return turf.area(f as turf.AllGeoJSON) >= minArea
      } catch {
        return false
      }
    })

    const withConfidence = features.map(f => {
      const sampled = sampleFtwMosaicConfidence(mosaic, f)
      const props = (f.properties ?? {}) as Record<string, unknown>
      const conf = sampled > 0 ? sampled : Number(props.confidence_mean ?? props.confidence ?? 0)
      return {
        ...f,
        properties: {
          ...props,
          confidence_mean: Number.isFinite(conf) ? conf : null,
          confidence: Number.isFinite(conf) ? conf : null,
        },
      }
    })

    return normalizeFtwExportGeojson(
      { type: 'FeatureCollection', features: withConfidence },
      options.year,
      mosaic,
    )
  } catch (primaryErr) {
    if (options.signal?.aborted) throw primaryErr
    options.onProgress?.('Vectorize API unavailable — using direct FTW PMTiles clip…')
    try {
      return await buildFtwAoiExportGeojsonFromFeatures(options)
    } catch (fallbackErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(`${fallbackMsg} (vectorize: ${primaryMsg})`)
    }
  }
}

/** Shapefile / GeoJSON export fields — geometry sourced from raster vectorization only. */
export function normalizeFtwExportGeojson(
  fc: GeoJSON.FeatureCollection,
  year: FtwGlobalYear,
  mosaic?: { width: number; height: number; bbox: LngLatBbox },
): GeoJSON.FeatureCollection {
  const features = (fc.features || []).map((f, idx) => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const conf = Number(props.confidence_mean ?? props.confidence ?? 0)
    let areaM2 = Number(props.area_m2 ?? 0)
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
      try {
        areaM2 = turf.area(f as turf.AllGeoJSON)
      } catch {
        areaM2 = 0
      }
    }
    const areaHa = areaM2 > 0 ? areaM2 / 10_000 : 0
    const fieldId = String(props.field_id ?? props.id ?? `ftw-${year}-${idx + 1}`)
    return {
      ...f,
      properties: {
        ...props,
        field_id: fieldId,
        confidence: Number.isFinite(conf) ? conf : null,
        confidence_mean: Number.isFinite(conf) ? conf : null,
        area_m2: Math.round(areaM2 * 10) / 10,
        area_ha: Math.round(areaHa * 10_000) / 10_000,
        source: 'ftw-raster-mosaic-seamless',
        engine: `ftw-global-raster-${year}`,
        provider: 'Fields of the World',
        raster_width: mosaic?.width ?? null,
        raster_height: mosaic?.height ?? null,
        raster_bbox: mosaic?.bbox ?? null,
        stroke_width: 0,
        'stroke-width': 0,
        fill_opacity: 0.35,
      },
    }
  })
  return { type: 'FeatureCollection', features }
}
