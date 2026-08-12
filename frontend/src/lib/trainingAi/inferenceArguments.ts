/**
 * Optional model arguments (ArcGIS-style) shared by Train and Infer.
 * Values are clamped here so the UI can never send an impossible tiling setup.
 */

export type MergePolicy = 'mean' | 'nms'

export type NonMaximumSuppression = {
  enabled: boolean
  confidenceScoreField: string
  classValueField: string
  maxOverlapRatio: number
}

export type InferenceArguments = {
  padding: number
  batchSize: number
  returnBboxes: boolean
  mergePolicy: MergePolicy
  tileSize: number
  radiometricOffsetCorrection: boolean
  threshold: number
  testTimeAugmentation: boolean
  nms: NonMaximumSuppression
}

export const DEFAULT_INFERENCE_ARGUMENTS: InferenceArguments = {
  padding: 56,
  batchSize: 4,
  returnBboxes: false,
  mergePolicy: 'mean',
  tileSize: 224,
  radiometricOffsetCorrection: false,
  threshold: 0.5,
  testTimeAugmentation: true,
  nms: {
    enabled: true,
    confidenceScoreField: 'Confidence',
    classValueField: 'Class',
    maxOverlapRatio: 0.1,
  },
}

export const TILE_SIZE_CHOICES = [128, 224, 256, 384, 512, 640, 1024] as const

export const ARGUMENT_HELP: Record<keyof InferenceArguments | 'nms', string> = {
  padding:
    'Number of pixels at the border of image tiles from which predictions are blended for adjacent tiles. Increase it to smooth the output and reduce edge artifacts. Maximum is half of tile_size.',
  batchSize:
    'Number of image tiles processed in each step of model inference. Depends on the memory of your graphics card.',
  returnBboxes: 'If True, the tool returns a bounding box around each detected feature.',
  mergePolicy:
    'Policy for merging predictions (mean or nms). Applicable only when test_time_augmentation is True.',
  tileSize: 'Width and height of the image tiles the imagery is split into for prediction.',
  radiometricOffsetCorrection:
    'Corrects the -1000 radiometric offset of Sentinel-2 L2A imagery sensed after 25 Jan 2022. Keep False for pre-2022 data and for providers that already applied it (e.g. AWS); set True for Microsoft Azure / Copernicus. For dark areas False is usually preferred.',
  threshold:
    'Detections with a confidence score above this threshold are kept (0 to 1.0). Lower values help irregular shapes or unfamiliar geographies.',
  testTimeAugmentation:
    'Performs test time augmentation while predicting — predictions of flipped and rotated variants of the input image are merged into the final output.',
  nms: 'Non-Maximum Suppression — removes duplicate detections that overlap more than the maximum overlap ratio, keeping the one with the highest confidence score.',
}

export const NMS_FIELD_HELP = {
  confidenceScoreField: 'Field in the output that holds the confidence score of each detection.',
  classValueField: 'Field in the output that holds the class value of each detection.',
  maxOverlapRatio:
    'Maximum overlap ratio for two overlapping features (intersection area over union area). Allowed values range from 0 to 1.0.',
} as const

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampRatio(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

/** Padding blends adjacent tiles, so it can never exceed half of the tile. */
export function maxPaddingForTile(tileSize: number): number {
  return Math.max(0, Math.floor(clampInt(tileSize, 32, 4096, DEFAULT_INFERENCE_ARGUMENTS.tileSize) / 2))
}

export function normalizeInferenceArguments(
  input: Partial<InferenceArguments> | null | undefined,
): InferenceArguments {
  const base = DEFAULT_INFERENCE_ARGUMENTS
  const src = input || {}
  const tileSize = clampInt(src.tileSize ?? base.tileSize, 32, 4096, base.tileSize)
  const nms = src.nms || base.nms
  return {
    padding: clampInt(src.padding ?? base.padding, 0, maxPaddingForTile(tileSize), base.padding),
    batchSize: clampInt(src.batchSize ?? base.batchSize, 1, 64, base.batchSize),
    returnBboxes: Boolean(src.returnBboxes ?? base.returnBboxes),
    mergePolicy: src.mergePolicy === 'nms' ? 'nms' : 'mean',
    tileSize,
    radiometricOffsetCorrection: Boolean(
      src.radiometricOffsetCorrection ?? base.radiometricOffsetCorrection,
    ),
    threshold: clampRatio(src.threshold ?? base.threshold, base.threshold),
    testTimeAugmentation: Boolean(src.testTimeAugmentation ?? base.testTimeAugmentation),
    nms: {
      enabled: Boolean(nms.enabled ?? base.nms.enabled),
      confidenceScoreField:
        String(nms.confidenceScoreField ?? base.nms.confidenceScoreField).trim() ||
        base.nms.confidenceScoreField,
      classValueField:
        String(nms.classValueField ?? base.nms.classValueField).trim() || base.nms.classValueField,
      maxOverlapRatio: clampRatio(nms.maxOverlapRatio ?? base.nms.maxOverlapRatio, base.nms.maxOverlapRatio),
    },
  }
}

export type InferenceArgumentsPayload = {
  padding: number
  batch_size: number
  return_bboxes: boolean
  merge_policy: MergePolicy
  tile_size: number
  radiometric_offset_correction: boolean
  threshold: number
  test_time_augmentation: boolean
  non_maximum_suppression: boolean
  confidence_score_field?: string
  class_value_field?: string
  max_overlap_ratio?: number
}

export function serializeInferenceArguments(
  args: Partial<InferenceArguments> | null | undefined,
): InferenceArgumentsPayload {
  const a = normalizeInferenceArguments(args)
  const payload: InferenceArgumentsPayload = {
    padding: a.padding,
    batch_size: a.batchSize,
    return_bboxes: a.returnBboxes,
    merge_policy: a.mergePolicy,
    tile_size: a.tileSize,
    radiometric_offset_correction: a.radiometricOffsetCorrection,
    threshold: a.threshold,
    test_time_augmentation: a.testTimeAugmentation,
    non_maximum_suppression: a.nms.enabled,
  }
  if (a.nms.enabled) {
    payload.confidence_score_field = a.nms.confidenceScoreField
    payload.class_value_field = a.nms.classValueField
    payload.max_overlap_ratio = a.nms.maxOverlapRatio
  }
  return payload
}

export function summarizeInferenceArguments(args: InferenceArguments): string {
  const parts = [`tile ${args.tileSize}`, `pad ${args.padding}`, `thr ${args.threshold.toFixed(2)}`]
  if (args.testTimeAugmentation) parts.push(`TTA ${args.mergePolicy}`)
  if (args.nms.enabled) parts.push(`NMS ${args.nms.maxOverlapRatio.toFixed(2)}`)
  return parts.join(' · ')
}
