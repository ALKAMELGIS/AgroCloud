export type AiDlTaskType =
  | 'object-detection'
  | 'pixel-classification'
  | 'instance-segmentation'
  | 'image-classification'

export type AiDlObjectDetectionArch = 'ssd' | 'yolo' | 'faster-rcnn' | 'retinanet' | 'mask-rcnn'

export type AiDlBackbone =
  | 'resnet-18'
  | 'resnet-34'
  | 'resnet-50'
  | 'resnet-101'
  | 'vgg16'
  | 'efficientnet'
  | 'mobilenet'

export type AiDlArgRow = { id: string; name: string; value: string }

export type AiDlTrainingDataKind =
  | 'image-chips'
  | 'raster'
  | 'training-samples'
  | 'feature-class'
  | 'image-folder'
  | 'unknown'

export type AiDlDatasetInfo = {
  imageCount: number
  classes: string[]
  imageSize: string
  bands: string
  spatialResolution: string
  trainingSamples: boolean
  sourceType: string
  sourceLabel: string
}

export type AiDlTrainConfig = {
  trainingDataPath: string
  trainingDataKind: AiDlTrainingDataKind
  outputModelPath: string
  taskType: AiDlTaskType
  architecture: AiDlObjectDetectionArch
  batchSize: number
  modelArgs: AiDlArgRow[]
  maxEpochs: number
  learningRate: string
  backbone: AiDlBackbone
  pretrainedModelPath: string
  validationPct: number
  stopWhenImprovingStalls: boolean
  freezeModel: boolean
}

export type AiDlTrainJob = {
  status: 'idle' | 'preparing' | 'training' | 'done' | 'error' | 'cancelled'
  phase: string
  phasePct: number
  epoch: number
  maxEpochs: number
  trainLoss: number
  valLoss: number
  accuracy: number
  message: string
  error?: string | null
  outputDlpk?: string
  outputEmd?: string
}

export type AiDlModelLibraryEntry = {
  id: string
  name: string
  framework: string
  date: string
  accuracy: number
  classes: string[]
  inputSize: string
  outputPath: string
  taskType: AiDlTaskType
  architecture: string
}

export const AI_DL_TASK_OPTIONS: Array<{ id: AiDlTaskType; label: string }> = [
  { id: 'object-detection', label: 'Object Detection' },
  { id: 'pixel-classification', label: 'Pixel Classification' },
  { id: 'instance-segmentation', label: 'Instance Segmentation' },
  { id: 'image-classification', label: 'Image Classification' },
]

export const AI_DL_OBJECT_DETECTION_ARCHS: Array<{ id: AiDlObjectDetectionArch; label: string }> = [
  { id: 'ssd', label: 'Single Shot Detector (SSD)' },
  { id: 'yolo', label: 'YOLO' },
  { id: 'faster-rcnn', label: 'Faster R-CNN' },
  { id: 'retinanet', label: 'RetinaNet' },
  { id: 'mask-rcnn', label: 'Mask R-CNN' },
]

export const AI_DL_BACKBONE_OPTIONS: Array<{ id: AiDlBackbone; label: string }> = [
  { id: 'resnet-18', label: 'ResNet-18' },
  { id: 'resnet-34', label: 'ResNet-34' },
  { id: 'resnet-50', label: 'ResNet-50' },
  { id: 'resnet-101', label: 'ResNet-101' },
  { id: 'vgg16', label: 'VGG16' },
  { id: 'efficientnet', label: 'EfficientNet' },
  { id: 'mobilenet', label: 'MobileNet' },
]

export const AI_DL_BATCH_SIZE_OPTIONS = [1, 2, 4, 8, 16, 32] as const

const LS_MODEL_LIBRARY = 'si-ai-dl-model-library-v1'

export function defaultAiDlTrainConfig(): AiDlTrainConfig {
  return {
    trainingDataPath: '',
    trainingDataKind: 'unknown',
    outputModelPath: '',
    taskType: 'object-detection',
    architecture: 'ssd',
    batchSize: 8,
    modelArgs: defaultArgsForArchitecture('ssd'),
    maxEpochs: 50,
    learningRate: 'Auto',
    backbone: 'resnet-50',
    pretrainedModelPath: '',
    validationPct: 10,
    stopWhenImprovingStalls: true,
    freezeModel: true,
  }
}

export function defaultArgsForArchitecture(arch: AiDlObjectDetectionArch): AiDlArgRow[] {
  const base: AiDlArgRow[] = [
    { id: 'grids', name: 'grids', value: '' },
    { id: 'zoom', name: 'zoom', value: '1.0' },
    { id: 'ratios', name: 'ratios', value: '[1.0,1.0]' },
    { id: 'chip_size', name: 'chip_size', value: '224' },
    { id: 'resize_to', name: 'resize_to', value: '' },
    { id: 'monitor', name: 'monitor', value: 'valid_loss' },
  ]
  if (arch === 'yolo') {
    return [
      ...base,
      { id: 'text_prompt', name: 'Text Prompt', value: '' },
      { id: 'padding', name: 'Padding', value: '256' },
      { id: 'box_threshold', name: 'Box Threshold', value: '0.2' },
      { id: 'text_threshold', name: 'Text Threshold', value: '0.1' },
      { id: 'tta_scales', name: 'TTA Scales', value: '1' },
      { id: 'nms_overlap', name: 'NMS Overlap', value: '0.5' },
    ]
  }
  if (arch === 'mask-rcnn' || arch === 'faster-rcnn') {
    return [
      ...base,
      { id: 'rpn_nms_thresh', name: 'rpn_nms_thresh', value: '0.7' },
      { id: 'box_score_thresh', name: 'box_score_thresh', value: '0.05' },
    ]
  }
  return base
}

export function architecturesForTask(task: AiDlTaskType): AiDlObjectDetectionArch[] {
  if (task === 'object-detection') return ['ssd', 'yolo', 'faster-rcnn', 'retinanet']
  if (task === 'instance-segmentation') return ['mask-rcnn']
  if (task === 'pixel-classification') return ['ssd']
  return ['ssd']
}

export function inferTrainingDataKind(fileName: string): AiDlTrainingDataKind {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'training-samples'
  if (lower.endsWith('.shp') || lower.endsWith('.gdb') || lower.endsWith('.gpkg')) return 'feature-class'
  if (lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.jp2') || lower.endsWith('.cog'))
    return 'raster'
  if (lower.endsWith('.zip') || lower.endsWith('.dlpk')) return 'image-chips'
  return 'image-folder'
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const k = v.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(v.trim())
  }
  return out
}

export function analyzeTrainingDataFromGeoJson(
  raw: unknown,
  fileName: string,
): AiDlDatasetInfo {
  const fc = raw as { features?: Array<{ properties?: Record<string, unknown> }> }
  const features = Array.isArray(fc?.features) ? fc.features : []
  const classKeys = ['class', 'Class', 'class_name', 'label', 'crop', 'type', 'category']
  const classes: string[] = []
  for (const ft of features) {
    const props = ft?.properties ?? {}
    for (const key of classKeys) {
      const val = props[key]
      if (typeof val === 'string' && val.trim()) classes.push(val.trim())
    }
  }
  const resolved = uniqueStrings(classes)
  return {
    imageCount: Math.max(features.length, 1),
    classes: resolved.length ? resolved : ['Tree', 'Building', 'Vehicle'],
    imageSize: '224 x 224',
    bands: 'RGB',
    spatialResolution: '0.5 m',
    trainingSamples: true,
    sourceType: inferTrainingDataKind(fileName),
    sourceLabel: fileName,
  }
}

export function analyzeTrainingDataFromPath(path: string, kind: AiDlTrainingDataKind): AiDlDatasetInfo {
  const base = path.split(/[/\\]/).pop() || path
  if (kind === 'training-samples' || kind === 'feature-class') {
    return {
      imageCount: 1250,
      classes: ['Tree', 'Building', 'Vehicle'],
      imageSize: '224 x 224',
      bands: 'RGB',
      spatialResolution: '0.5 m',
      trainingSamples: true,
      sourceType: kind,
      sourceLabel: base,
    }
  }
  if (kind === 'raster') {
    return {
      imageCount: 1,
      classes: ['Background', 'Target'],
      imageSize: '512 x 512',
      bands: 'RGB',
      spatialResolution: '0.3 m',
      trainingSamples: false,
      sourceType: kind,
      sourceLabel: base,
    }
  }
  return {
    imageCount: 1250,
    classes: ['Tree', 'Building', 'Vehicle'],
    imageSize: '224 x 224',
    bands: 'RGB',
    spatialResolution: '0.5 m',
    trainingSamples: kind === 'image-chips',
    sourceType: kind,
    sourceLabel: base,
  }
}

export function loadAiDlModelLibrary(): AiDlModelLibraryEntry[] {
  try {
    const raw = localStorage.getItem(LS_MODEL_LIBRARY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AiDlModelLibraryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAiDlModelLibrary(entries: AiDlModelLibraryEntry[]): void {
  try {
    localStorage.setItem(LS_MODEL_LIBRARY, JSON.stringify(entries))
  } catch {
    /* ignore */
  }
}

export function validateAiDlTrainConfig(
  config: AiDlTrainConfig,
  dataset: AiDlDatasetInfo | null,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!config.trainingDataPath.trim()) errors.push('Input Training Data is required.')
  if (!config.outputModelPath.trim()) errors.push('Output Model path is required.')
  if (!dataset) errors.push('Analyze training data before running.')
  return { valid: errors.length === 0, errors }
}
