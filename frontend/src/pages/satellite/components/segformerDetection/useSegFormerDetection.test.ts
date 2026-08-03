import { describe, expect, it } from 'vitest'
import { getSegFormerClass } from '../../../../lib/segformerDetection/segformerCatalog'
import {
  geoAiModelTypeIdForTarget,
  resolveGeoAiTargetRoute,
} from '../../../../lib/segformerDetection/geoAiModelRouter'
import { resolveSegFormerModelTypeClassId } from '../../../../lib/segformerDetection/segformerModelPresets'
import {
  hasSegFormerDrawableResult,
  isSegFormerBusyPhase,
  normalizeSegFormerPhase,
  resolveGeoAiTargetFromModelType,
  SEGFORMER_PIPELINE_STEPS,
  shouldRunOptionalSam2Refine,
  stampSegFormerClassOntoRefined,
} from './useSegFormerDetection'

describe('hasSegFormerDrawableResult', () => {
  it('is false for null / empty results', () => {
    expect(hasSegFormerDrawableResult(null)).toBe(false)
    expect(
      hasSegFormerDrawableResult({
        geojson: { type: 'FeatureCollection', features: [] },
        maskPng: null,
      }),
    ).toBe(false)
    expect(
      hasSegFormerDrawableResult({
        geojson: { type: 'FeatureCollection', features: [] },
        maskPng: '   ',
      }),
    ).toBe(false)
  })

  it('is true when polygons exist', () => {
    expect(
      hasSegFormerDrawableResult({
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                  ],
                ],
              },
            },
          ],
        },
        maskPng: null,
      }),
    ).toBe(true)
  })

  it('is true for mask-only results (no polygons)', () => {
    expect(
      hasSegFormerDrawableResult({
        geojson: { type: 'FeatureCollection', features: [] },
        maskPng: 'data:image/png;base64,abc',
      }),
    ).toBe(true)
  })
})

describe('SegFormer pipeline phases', () => {
  it('lists staged steps ending in publishReady', () => {
    expect(SEGFORMER_PIPELINE_STEPS[0]).toBe('idle')
    expect(SEGFORMER_PIPELINE_STEPS[SEGFORMER_PIPELINE_STEPS.length - 1]).toBe('publishReady')
    expect(SEGFORMER_PIPELINE_STEPS).toContain('tile')
    expect(SEGFORMER_PIPELINE_STEPS).toContain('infer')
    expect(SEGFORMER_PIPELINE_STEPS).toContain('vectorize')
  })

  it('normalizes legacy phase aliases', () => {
    expect(normalizeSegFormerPhase('capturing')).toBe('resolveInput')
    expect(normalizeSegFormerPhase('detecting')).toBe('infer')
    expect(normalizeSegFormerPhase('done')).toBe('publishReady')
    expect(normalizeSegFormerPhase('tile')).toBe('tile')
  })

  it('marks in-flight stages as busy', () => {
    expect(isSegFormerBusyPhase('tile')).toBe(true)
    expect(isSegFormerBusyPhase('infer')).toBe(true)
    expect(isSegFormerBusyPhase('refine')).toBe(true)
    expect(isSegFormerBusyPhase('idle')).toBe(false)
    expect(isSegFormerBusyPhase('publishReady')).toBe(false)
    expect(isSegFormerBusyPhase('error')).toBe(false)
  })
})

describe('GeoAI hook routing helpers', () => {
  it('maps model types to GeoAI target chips', () => {
    expect(resolveGeoAiTargetFromModelType('tree-detection')).toBe('trees')
    expect(resolveGeoAiTargetFromModelType('crop-classification')).toBe('crops')
    expect(resolveGeoAiTargetFromModelType('building-extraction')).toBe('buildings')
    expect(resolveGeoAiTargetFromModelType('vehicle-detection')).toBe('cars')
    expect(resolveGeoAiTargetFromModelType('land-cover')).toBe('land-cover')
    expect(resolveGeoAiTargetFromModelType('agriculture-field-boundary')).toBe('field-boundary')
    // water has no GeoAI chip — fall back to crops
    expect(resolveGeoAiTargetFromModelType('water-detection')).toBe('crops')
  })

  it('routes Cars to vehicle-detection / vehicles / Car (60)', () => {
    const modelTypeId = geoAiModelTypeIdForTarget('cars')
    expect(modelTypeId).toBe('vehicle-detection')
    const route = resolveGeoAiTargetRoute('cars')
    expect(route.categoryId).toBe('vehicles')
    expect(route.detectEngine).toBe('yolo11')
    expect(route.detectUsesSegFormerFallback).toBe(true)
    expect(resolveSegFormerModelTypeClassId(modelTypeId)).toBe(60)
    expect(getSegFormerClass(60)?.categoryId).toBe('vehicles')
  })

  it('runs optional SAM2 only when boundary refine is on for non-field targets', () => {
    expect(
      shouldRunOptionalSam2Refine({
        fieldPipeline: true,
        boundaryRefine: true,
        supportsSam2Refine: true,
      }),
    ).toBe(false)
    expect(
      shouldRunOptionalSam2Refine({
        fieldPipeline: false,
        boundaryRefine: false,
        supportsSam2Refine: true,
      }),
    ).toBe(false)
    expect(
      shouldRunOptionalSam2Refine({
        fieldPipeline: false,
        boundaryRefine: true,
        supportsSam2Refine: false,
      }),
    ).toBe(false)
    expect(
      shouldRunOptionalSam2Refine({
        fieldPipeline: false,
        boundaryRefine: true,
        supportsSam2Refine: true,
      }),
    ).toBe(true)
  })

  it('stamps Detect class onto SAM2 refine polygons for non-field targets', () => {
    const stamped = stampSegFormerClassOntoRefined(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              Feature_ID: 'SF-1',
              Class_Name: 'Agricultural Field',
              classId: 1,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
      60,
      'Car',
    )
    const props = stamped.features[0]!.properties as Record<string, unknown>
    expect(props.classId).toBe(60)
    expect(props.Class_Name).toBe('Car')
    expect(props.className).toBe('Car')
  })
})
