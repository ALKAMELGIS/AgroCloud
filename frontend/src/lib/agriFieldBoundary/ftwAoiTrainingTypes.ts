/**
 * AOI-scoped FTW training analytics — types shared by client, hook, and dashboard.
 */

import type { TrainingEpochRecord } from '../trainingAi/trainingAiClient'

export type FtwTrainingJobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export type FtwDatasetSplit = {
  train: number
  validation: number
  test: number
  total: number
}

export type FtwLrFinderResult = {
  lrs: number[]
  losses: number[]
  optimal_lr: number
  status: FtwTrainingJobStatus
  error?: string | null
}

export type FtwDatasetSampleResponse = {
  dataset_id: string
  aoi_key: string
  aoi_label?: string
  area_ha: number
  total_samples: number
  splits: FtwDatasetSplit
  year?: number
  engine?: string
}

export type FtwTrainingModelInfo = {
  architecture: string
  encoder: string
}

export type FtwAoiTrainingSession = {
  aoiKey: string
  aoiLabel: string
  areaHa: number
  datasetId: string | null
  dataset: FtwDatasetSplit | null
  ftwYear: number
  model: FtwTrainingModelInfo
  lrFinder: FtwLrFinderResult | null
  lrFinderJobId: string | null
  optimalLr: number | null
  trainingJobId: string | null
  trainingStatus: FtwTrainingJobStatus
  trainingError: string | null
  epoch: number
  epochs: number
  trainLoss: number | null
  valLoss: number | null
  iou: number | null
  f1: number | null
  lossHistory: TrainingEpochRecord[]
  modelExportId: string | null
  updatedAt: string
}

export const FTW_AOI_TRAINING_DEFAULT_MODEL: FtwTrainingModelInfo = {
  architecture: 'U-Net',
  encoder: 'EfficientNet-B5',
}

export function emptyFtwAoiSession(aoiKey: string, aoiLabel = 'AOI'): FtwAoiTrainingSession {
  return {
    aoiKey,
    aoiLabel,
    areaHa: 0,
    datasetId: null,
    dataset: null,
    ftwYear: 2025,
    model: { ...FTW_AOI_TRAINING_DEFAULT_MODEL },
    lrFinder: null,
    lrFinderJobId: null,
    optimalLr: null,
    trainingJobId: null,
    trainingStatus: 'idle',
    trainingError: null,
    epoch: 0,
    epochs: 100,
    trainLoss: null,
    valLoss: null,
    iou: null,
    f1: null,
    lossHistory: [],
    modelExportId: null,
    updatedAt: new Date().toISOString(),
  }
}
