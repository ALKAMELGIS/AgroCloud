import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INFERENCE_ARGUMENTS,
  maxPaddingForTile,
  normalizeInferenceArguments,
  serializeInferenceArguments,
  summarizeInferenceArguments,
} from './inferenceArguments'

describe('inferenceArguments', () => {
  it('keeps ArcGIS-style defaults', () => {
    const a = normalizeInferenceArguments(null)
    expect(a).toEqual(DEFAULT_INFERENCE_ARGUMENTS)
  })

  it('caps padding at half of the tile size', () => {
    expect(maxPaddingForTile(224)).toBe(112)
    const a = normalizeInferenceArguments({ tileSize: 128, padding: 400 })
    expect(a.padding).toBe(64)
  })

  it('re-clamps padding when tile size shrinks', () => {
    const wide = normalizeInferenceArguments({ tileSize: 512, padding: 200 })
    expect(wide.padding).toBe(200)
    const narrow = normalizeInferenceArguments({ ...wide, tileSize: 224 })
    expect(narrow.padding).toBe(112)
  })

  it('clamps ratios and rejects invalid numbers', () => {
    const a = normalizeInferenceArguments({
      threshold: 4,
      batchSize: 0,
      nms: { enabled: true, confidenceScoreField: '  ', classValueField: 'Class', maxOverlapRatio: -3 },
    })
    expect(a.threshold).toBe(1)
    expect(a.batchSize).toBe(1)
    expect(a.nms.maxOverlapRatio).toBe(0)
    expect(a.nms.confidenceScoreField).toBe('Confidence')

    expect(normalizeInferenceArguments({ threshold: Number.NaN }).threshold).toBe(0.5)
  })

  it('falls back to mean merge policy for unknown values', () => {
    expect(normalizeInferenceArguments({ mergePolicy: 'nope' as never }).mergePolicy).toBe('mean')
    expect(normalizeInferenceArguments({ mergePolicy: 'nms' }).mergePolicy).toBe('nms')
  })

  it('serializes to snake_case and omits NMS fields when disabled', () => {
    const on = serializeInferenceArguments(DEFAULT_INFERENCE_ARGUMENTS)
    expect(on).toMatchObject({
      padding: 56,
      batch_size: 4,
      return_bboxes: false,
      merge_policy: 'mean',
      tile_size: 224,
      radiometric_offset_correction: false,
      threshold: 0.5,
      test_time_augmentation: true,
      non_maximum_suppression: true,
      confidence_score_field: 'Confidence',
      class_value_field: 'Class',
      max_overlap_ratio: 0.1,
    })

    const off = serializeInferenceArguments({
      ...DEFAULT_INFERENCE_ARGUMENTS,
      nms: { ...DEFAULT_INFERENCE_ARGUMENTS.nms, enabled: false },
    })
    expect(off.non_maximum_suppression).toBe(false)
    expect(off.confidence_score_field).toBeUndefined()
    expect(off.max_overlap_ratio).toBeUndefined()
  })

  it('summarizes the active arguments for the collapsed header', () => {
    expect(summarizeInferenceArguments(DEFAULT_INFERENCE_ARGUMENTS)).toBe(
      'tile 224 · pad 56 · thr 0.50 · TTA mean · NMS 0.10',
    )
    expect(
      summarizeInferenceArguments({
        ...DEFAULT_INFERENCE_ARGUMENTS,
        testTimeAugmentation: false,
        nms: { ...DEFAULT_INFERENCE_ARGUMENTS.nms, enabled: false },
      }),
    ).toBe('tile 224 · pad 56 · thr 0.50')
  })
})
