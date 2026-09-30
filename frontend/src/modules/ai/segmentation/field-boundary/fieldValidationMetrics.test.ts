import { describe, expect, it } from 'vitest'
import {
  buildValidationContext,
  classifyFieldShape,
  evaluateFieldBoundaries,
  metricsAtThreshold,
  summarizeFieldGeometry,
  sweepIouThresholds,
  toPolygonParts,
  validationMetricsCsv,
} from './fieldValidationMetrics'

/** Axis-aligned square parcel, size in degrees, at (lon, lat). */
function square(lon: number, lat: number, size = 0.002, props: Record<string, unknown> = {}) {
  return {
    type: 'Feature' as const,
    properties: props,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [lon, lat],
          [lon + size, lat],
          [lon + size, lat + size],
          [lon, lat + size],
          [lon, lat],
        ],
      ],
    },
  }
}

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

describe('fieldValidationMetrics', () => {
  it('splits MultiPolygons into comparable parts', () => {
    const multi: GeoJSON.Feature = {
      type: 'Feature',
      properties: { area_ha: 4 },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          square(55.0, 24.0).geometry.coordinates,
          square(55.01, 24.0).geometry.coordinates,
        ],
      },
    }
    const parts = toPolygonParts(fc([multi]))
    expect(parts).toHaveLength(2)
    expect(parts[0]!.properties?.area_ha).toBe(4)
  })

  it('scores a perfect match as precision/recall/F1 = 1', () => {
    const truth = fc([square(55.0, 24.0), square(55.01, 24.0)])
    const metrics = evaluateFieldBoundaries(truth, truth)
    expect(metrics).not.toBeNull()
    expect(metrics!.counts).toEqual({ pred: 2, gt: 2, tp: 2, fp: 0, fn: 0 })
    expect(metrics!.precision).toBeCloseTo(1, 5)
    expect(metrics!.recall).toBeCloseTo(1, 5)
    expect(metrics!.f1).toBeCloseTo(1, 5)
    expect(metrics!.iou).toBeCloseTo(1, 4)
    expect(metrics!.areaErrorPct).toBeCloseTo(0, 5)
  })

  it('counts a miss and a spurious field in the confusion matrix', () => {
    const reference = fc([square(55.0, 24.0), square(55.01, 24.0)])
    // One good match, one far-away extra, and the second reference field missed.
    const predicted = fc([square(55.0, 24.0), square(55.05, 24.05)])
    const metrics = evaluateFieldBoundaries(predicted, reference)!
    expect(metrics.counts).toEqual({ pred: 2, gt: 2, tp: 1, fp: 1, fn: 1 })
    expect(metrics.precision).toBeCloseTo(0.5, 5)
    expect(metrics.recall).toBeCloseTo(0.5, 5)
    expect(metrics.f1).toBeCloseTo(0.5, 5)
  })

  it('drops a partial overlap once the IoU threshold passes its score', () => {
    const reference = fc([square(55.0, 24.0, 0.002)])
    // Shifted by half a side → IoU = 1/3.
    const predicted = fc([square(55.001, 24.0, 0.002)])
    const ctx = buildValidationContext(predicted, reference)!
    expect(metricsAtThreshold(ctx, 0.3).counts.tp).toBe(1)
    expect(metricsAtThreshold(ctx, 0.5).counts.tp).toBe(0)
    expect(metricsAtThreshold(ctx, 0.3).meanMatchedIou).toBeCloseTo(1 / 3, 2)
  })

  it('produces a monotonically non-increasing TP curve across thresholds', () => {
    const reference = fc([square(55.0, 24.0), square(55.01, 24.0), square(55.02, 24.0)])
    const predicted = fc([
      square(55.0, 24.0),
      square(55.0105, 24.0),
      square(55.0215, 24.0),
    ])
    const ctx = buildValidationContext(predicted, reference)!
    const sweep = sweepIouThresholds(ctx)
    expect(sweep).toHaveLength(9)
    for (let i = 1; i < sweep.length; i++) {
      expect(sweep[i]!.tp).toBeLessThanOrEqual(sweep[i - 1]!.tp)
    }
    expect(sweep[0]!.threshold).toBe(0.1)
    expect(sweep[sweep.length - 1]!.threshold).toBe(0.9)
  })

  it('returns null when the reference layer has no polygons', () => {
    expect(evaluateFieldBoundaries(fc([square(55.0, 24.0)]), fc([]))).toBeNull()
  })

  it('classifies shapes from the regularizer footprint method', () => {
    expect(classifyFieldShape(square(55, 24, 0.001, { footprint_method: 'pivot-circle' }))).toBe('pivot')
    expect(classifyFieldShape(square(55, 24, 0.001, { field_shape: 'pivot' }))).toBe('pivot')
    expect(classifyFieldShape(square(55, 24, 0.001, { footprint_method: 'obb' }))).toBe('rectangle')
    expect(classifyFieldShape(square(55, 24, 0.001, { footprint_method: 'right-angles' }))).toBe(
      'right-angles',
    )
    expect(classifyFieldShape(square(55, 24, 0.001, {}))).toBe('irregular')
  })

  it('builds a shape × size matrix from the detection itself', () => {
    const summary = summarizeFieldGeometry(
      fc([
        square(55.0, 24.0, 0.001, { area_ha: 0.4, footprint_method: 'pivot-circle', footprint_regularized: true }),
        square(55.01, 24.0, 0.001, { area_ha: 3, footprint_method: 'obb', footprint_regularized: true }),
        square(55.02, 24.0, 0.001, { area_ha: 12, footprint_method: 'right-angles' }),
        square(55.03, 24.0, 0.001, { area_ha: 80 }),
      ]),
    )
    expect(summary.totalCount).toBe(4)
    expect(summary.totalAreaHa).toBeCloseTo(95.4, 5)
    expect(summary.regularizedCount).toBe(2)
    const pivot = summary.rows.find(r => r.shape === 'pivot')!
    expect(pivot.counts[0]).toBe(1)
    expect(pivot.total).toBe(1)
    const irregular = summary.rows.find(r => r.shape === 'irregular')!
    expect(irregular.counts[summary.buckets.length - 1]).toBe(1)
    expect(summary.medianAreaHa).toBeGreaterThan(0)
  })

  it('exports metrics and the sweep as CSV', () => {
    const truth = fc([square(55.0, 24.0)])
    const ctx = buildValidationContext(truth, truth)!
    const csv = validationMetricsCsv(metricsAtThreshold(ctx, 0.5), sweepIouThresholds(ctx))
    expect(csv).toContain('true_positive,1')
    expect(csv).toContain('iou_threshold,precision,recall,f1,tp,fp,fn')
    expect(csv.split('\n').length).toBeGreaterThan(15)
  })
})
