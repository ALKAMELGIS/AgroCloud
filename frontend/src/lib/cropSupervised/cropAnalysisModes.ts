import type { CropClassificationMode } from '../siPrithviCropPipeline'

/** Expanded analysis modes for the Crop AI toolbox. */
export type CropAnalysisModeId =
  | 'supervised'
  | 'unsupervised'
  | 'ai-deep-learning'
  | 'object-based'

export type CropAnalysisModeDef = {
  id: CropAnalysisModeId
  label: string
  shortLabel: string
  description: string
  needsTrainingSamples: boolean
  supportsClassCount: boolean
}

export const CROP_ANALYSIS_MODES: CropAnalysisModeDef[] = [
  {
    id: 'supervised',
    label: 'Supervised Classification',
    shortLabel: 'Supervised',
    description: 'Train from labelled polygons or points (SHP, GeoJSON, KML, CSV, raster labels).',
    needsTrainingSamples: true,
    supportsClassCount: false,
  },
  {
    id: 'unsupervised',
    label: 'Unsupervised Classification',
    shortLabel: 'Unsupervised',
    description: 'Automatic clustering — define 2–15 classes without training samples.',
    needsTrainingSamples: false,
    supportsClassCount: true,
  },
  {
    id: 'ai-deep-learning',
    label: 'AI Deep Learning',
    shortLabel: 'AI / Prithvi',
    description: 'Foundation-model inference (Prithvi) for satellite/HLS or high-res drone orthomosaics.',
    needsTrainingSamples: false,
    supportsClassCount: false,
  },
  {
    id: 'object-based',
    label: 'Object-Based Crop Analysis',
    shortLabel: 'Object-Based',
    description: 'Segment field objects, detect crop patterns, and derive canopy characteristics.',
    needsTrainingSamples: false,
    supportsClassCount: true,
  },
]

const MODE_BY_ID = new Map(CROP_ANALYSIS_MODES.map(m => [m.id, m]))

export function cropAnalysisModeDef(id: CropAnalysisModeId): CropAnalysisModeDef {
  return MODE_BY_ID.get(id) ?? CROP_ANALYSIS_MODES[2]!
}

export const DEFAULT_CROP_ANALYSIS_MODE: CropAnalysisModeId = 'ai-deep-learning'

/** Map to legacy pipeline mode used by existing job runners. */
export function toLegacyClassificationMode(id: CropAnalysisModeId): CropClassificationMode {
  return id === 'supervised' ? 'supervised-ground-truth' : 'ai-prithvi'
}

/** Reverse map from legacy mode (for persisted prefs). */
export function fromLegacyClassificationMode(mode: CropClassificationMode): CropAnalysisModeId {
  return mode === 'supervised-ground-truth' ? 'supervised' : 'ai-deep-learning'
}

export const MIN_UNSUPERVISED_CLASSES = 2
export const MAX_UNSUPERVISED_CLASSES = 15
export const DEFAULT_UNSUPERVISED_CLASS_COUNT = 6
