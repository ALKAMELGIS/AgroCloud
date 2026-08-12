import {
  ANALYSIS_IMAGERY_OPTIONS,
  TRAINING_MODEL_REGISTRY,
  type AnalysisImageryKind,
  type ModelCompatibilityStatus,
  type ModelTaskCategory,
  type TrainingModelEntry,
} from './modelRegistry'

export type CompatibilityResult = {
  status: ModelCompatibilityStatus
  score: number
  reasons: string[]
  recommended: boolean
}

function imageryMeta(kind: AnalysisImageryKind) {
  return ANALYSIS_IMAGERY_OPTIONS.find(o => o.id === kind) || ANALYSIS_IMAGERY_OPTIONS[0]
}

export function evaluateModelCompatibility(
  model: TrainingModelEntry,
  imagery: AnalysisImageryKind,
): CompatibilityResult {
  const meta = imageryMeta(imagery)
  const modality = meta.modality
  const reasons: string[] = []
  let status: ModelCompatibilityStatus = 'compatible'
  let score = 50

  const isEoMs =
    model.recommendedSentinel2 ||
    model.categories.includes('multispectral') ||
    model.categories.includes('foundation')
  const isRgbModel =
    model.categories.includes('rgb') ||
    model.requiredBands.every(b => ['R', 'G', 'B'].includes(b))

  if (imagery === 'sentinel2' || imagery === 'landsat') {
    if (model.recommendedSentinel2 || model.id.startsWith('hf-prithvi') || model.id.startsWith('hf-terramind') || model.id === 'agro-ftw-live') {
      status = 'compatible'
      score = 95
      reasons.push('Native / strong fit for Sentinel-class multispectral EO.')
    } else if (isRgbModel && model.trainableOnAgroCloud) {
      status = 'requires_preprocessing'
      score = 55
      reasons.push('RGB SegFormer needs band mapping / RGB composite from S2 — not native multispectral.')
    } else if (model.id.includes('sam') || model.id.includes('yolo') || model.id.includes('mask2former') || model.id.includes('dinov2') || model.id.includes('delineate')) {
      status = 'requires_preprocessing'
      score = 40
      reasons.push('RGB-only CV model on Sentinel-2 — requires RGB composite / not native multispectral.')
    } else {
      status = 'partially_compatible'
      score = 50
      reasons.push('May work with preprocessing; verify bands.')
    }
  } else if (
    imagery === 'drone_rgb' ||
    imagery === 'orthophoto' ||
    imagery === 'hires_satellite' ||
    imagery === 'rgb_capture' ||
    imagery === 'basemap_esri' ||
    imagery === 'geotiff'
  ) {
    if (isEoMs && !isRgbModel) {
      status = 'not_compatible'
      score = 15
      reasons.push('EO multispectral foundation models are not directly compatible with RGB drone/ortho without preprocessing.')
    } else if (model.recommendedDrone || isRgbModel || model.inferEngine === 'delineate-fbis' || model.inferEngine === 'yolo-trees') {
      status = 'compatible'
      score = 92
      reasons.push('Strong fit for high-resolution RGB agriculture workflows.')
    } else {
      status = 'partially_compatible'
      score = 55
      reasons.push('Possible with adaptation.')
    }
  } else if (imagery === 'drone_multispectral') {
    if (isEoMs) {
      status = 'requires_preprocessing'
      score = 60
      reasons.push('Potentially compatible with Prithvi-style band remapping — verify Input vs Required bands.')
    } else if (isRgbModel) {
      status = 'requires_preprocessing'
      score = 45
      reasons.push('RGB-only model — do not use without selecting RGB subset / preprocessing.')
    } else {
      status = 'partially_compatible'
      score = 50
      reasons.push('Check available vs required bands.')
    }
  } else if (imagery === 'sentinel1') {
    if (model.categories.includes('change_detection') || model.name.toLowerCase().includes('sar')) {
      status = 'partially_compatible'
      score = 50
      reasons.push('SAR workflows are specialized; limited registry support.')
    } else {
      status = 'not_compatible'
      score = 10
      reasons.push('Model expects optical bands, not Sentinel-1 SAR.')
    }
  }

  if (model.requiresFineTuning && !model.canRunWithoutTraining) {
    if (status === 'compatible') status = 'requires_fine_tuning'
    reasons.push('Fine-tuning recommended for specific agricultural classes.')
    score = Math.min(score, model.trainableOnAgroCloud ? score : score - 10)
  }

  if (modality === 'multispectral' && isRgbModel && !model.recommendedSentinel2) {
    reasons.push(`Available bands (hint): ${meta.bandsHint.join(', ')}`)
    reasons.push(`Required bands: ${model.requiredBands.join(', ')}`)
  }

  const recommended =
    status === 'compatible' ||
    status === 'requires_fine_tuning' ||
    (status === 'requires_preprocessing' && model.trainableOnAgroCloud)

  return { status, score, reasons, recommended }
}

export function recommendModelsForImagery(
  imagery: AnalysisImageryKind,
  limit = 6,
): TrainingModelEntry[] {
  return [...TRAINING_MODEL_REGISTRY]
    .map(m => ({ m, c: evaluateModelCompatibility(m, imagery) }))
    .filter(x => x.c.status !== 'not_compatible')
    .sort((a, b) => b.c.score - a.c.score)
    .slice(0, limit)
    .map(x => x.m)
}

export function autoSelectModelId(
  imagery: AnalysisImageryKind,
  opts?: { preferTrainable?: boolean },
): string {
  const ranked = recommendModelsForImagery(imagery, 12)
  if (opts?.preferTrainable) {
    const trainable = ranked.find(m => m.trainableOnAgroCloud)
    if (trainable) return trainable.id
  }
  if (ranked[0]) return ranked[0].id
  return 'agro-segformer-b2'
}

export function filterModels(opts: {
  query?: string
  category?: 'all' | ModelTaskCategory
  imagery?: AnalysisImageryKind
  recommendedOnly?: boolean
}): Array<TrainingModelEntry & { compatibility: CompatibilityResult }> {
  const q = String(opts.query || '')
    .trim()
    .toLowerCase()
  const cat = opts.category || 'all'
  const imagery = opts.imagery || 'sentinel2'

  return TRAINING_MODEL_REGISTRY.map(m => ({
    ...m,
    compatibility: evaluateModelCompatibility(m, imagery),
  }))
    .filter(m => {
      if (cat !== 'all' && !m.categories.includes(cat)) return false
      if (opts.recommendedOnly && !m.compatibility.recommended && m.compatibility.score < 70) {
        return false
      }
      if (!q) return true
      const blob = [
        m.name,
        m.modelType,
        m.task,
        m.hfModelId || '',
        m.inputDataType,
        m.categories.join(' '),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
    .sort((a, b) => b.compatibility.score - a.compatibility.score)
}

export function compatibilityLabel(status: ModelCompatibilityStatus): string {
  switch (status) {
    case 'compatible':
      return 'COMPATIBLE'
    case 'partially_compatible':
      return 'PARTIALLY COMPATIBLE'
    case 'requires_preprocessing':
      return 'REQUIRES PREPROCESSING'
    case 'requires_fine_tuning':
      return 'REQUIRES FINE-TUNING'
    case 'not_compatible':
      return 'NOT COMPATIBLE'
    default:
      return status
  }
}
