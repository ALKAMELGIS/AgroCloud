import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import {
  cleanupFtwFieldFeatures,
  filterTreeFeatures,
  mergeFieldsAndTrees,
  nmsFieldFeatures,
  normalizeFtwFieldFeatures,
  polygonIou,
} from './mergeFieldsAndTrees'

/** ~square polygon covering sideMeters × sideMeters around a lon/lat, in WGS84. */
function squareAround(
  lon: number,
  lat: number,
  sideMeters: number,
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  const half = sideMeters / 2
  const poly = turf.bboxPolygon(
    turf.bbox(turf.buffer(turf.point([lon, lat]), half, { units: 'meters' })!),
  )
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: poly.geometry,
  }
}

describe('mergeFieldsAndTrees', () => {
  it('keeps FTW fields and Tree blobs only', () => {
    const fields: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { field_id: 1, confidence: 0.9, fill_color: '#eab308', area_m2: 2000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    }
    const trees: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { class_name: 'Tree', confidence: 0.7, color: '#22c55e' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0.1, 0.1],
                [0.2, 0.1],
                [0.2, 0.2],
                [0.1, 0.2],
                [0.1, 0.1],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { class_name: 'Urban', confidence: 0.8 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2, 2],
                [3, 2],
                [3, 3],
                [2, 3],
                [2, 2],
              ],
            ],
          },
        },
      ],
    }
    expect(normalizeFtwFieldFeatures(fields, false)).toHaveLength(1)
    expect(filterTreeFeatures(trees)).toHaveLength(1)
    const merged = mergeFieldsAndTrees({
      fields,
      trees,
      engine: 'ftw-live',
      fieldCleanup: false,
    })
    expect(merged.stats.fields).toBe(1)
    expect(merged.stats.trees).toBe(1)
    expect(merged.geojson.features).toHaveLength(2)
    expect(merged.primary_class).toBe('Field')
  })

  it('drops fields below min area during cleanup', () => {
    const tiny = squareAround(55.3, 24.2, 10, { confidence: 0.9, area_m2: 80 })
    const solid = squareAround(55.31, 24.2, 80, { confidence: 0.8, area_m2: 6400 })
    const cleaned = cleanupFtwFieldFeatures([tiny, solid], { minAreaM2: 400 })
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]).toBe(solid)
  })

  it('NMS keeps higher-confidence overlapping field', () => {
    // Nearly identical footprints → high IoU; slight offset still > 0.55.
    const a = squareAround(55.3, 24.2, 100, { confidence: 0.95, area_m2: 10_000 })
    const b = squareAround(55.30005, 24.20003, 100, { confidence: 0.4, area_m2: 10_000 })
    expect(polygonIou(a, b)).toBeGreaterThan(0.55)
    const kept = nmsFieldFeatures([a, b], 0.55)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.properties?.confidence).toBe(0.95)
  })

  it('prefers FTW fields near Field Boundary samples when ≥3 samples exist', () => {
    const nearLon = 55.3
    const nearLat = 24.2
    const farLon = 55.45
    const farLat = 24.35

    const nearField = squareAround(nearLon, nearLat, 90, {
      confidence: 0.7,
      area_m2: 8100,
      field_id: 1,
    })
    const farField = squareAround(farLon, farLat, 90, {
      confidence: 0.95,
      area_m2: 8100,
      field_id: 2,
    })

    const samples = [0, 1, 2].map(i => ({
      class_name: 'Field Boundaries',
      geometry: squareAround(nearLon + i * 0.0004, nearLat + i * 0.0003, 40).geometry,
    }))

    const cleaned = cleanupFtwFieldFeatures([nearField, farField], {
      fieldBoundarySamples: samples,
      minAreaM2: 400,
      sampleBufferM: 60,
      minSamplePolygons: 3,
    })
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]?.properties?.field_id).toBe(1)
  })

  it('skips sample proximity filter when fewer than 3 Field Boundary polygons', () => {
    const a = squareAround(55.3, 24.2, 90, { confidence: 0.7, area_m2: 8100, field_id: 1 })
    const b = squareAround(55.45, 24.35, 90, { confidence: 0.9, area_m2: 8100, field_id: 2 })
    const cleaned = cleanupFtwFieldFeatures([a, b], {
      fieldBoundarySamples: [
        {
          class_name: 'Field Boundaries',
          geometry: squareAround(55.3, 24.2, 40).geometry,
        },
      ],
      minSamplePolygons: 3,
    })
    expect(cleaned).toHaveLength(2)
  })

  it('mergeFieldsAndTrees applies field cleanup by default', () => {
    const fields: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        squareAround(55.3, 24.2, 5, { confidence: 0.9, area_m2: 25, field_id: 1 }),
        squareAround(55.31, 24.2, 100, { confidence: 0.85, area_m2: 10_000, field_id: 2 }),
      ],
    }
    const merged = mergeFieldsAndTrees({ fields, engine: 'ftw-live' })
    expect(merged.stats.fields).toBe(1)
    expect(merged.geojson.features[0]?.properties?.instance_id).toBe(2)
  })
})
