import type { CropClassLegendItem } from '../siPrithviCropPipeline'

import type { CropDataProviderId } from './cropDataProvider'

export type CropTrainingSample = {
  id: string
  className: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point
  sourceFile?: string
}

export type TrainingSampleValidation = {
  valid: boolean
  errors: string[]
  warnings: string[]
  classCounts: Record<string, number>
  totalSamples: number
}

export type SpectralSignature = {
  className: string
  sampleId: string
  features: Float32Array
  pixelCount: number
}

export type SupervisedClassDef = {
  name: string
  color: string
  index: number
}

export type ConfusionMatrixResult = {
  labels: string[]
  matrix: number[][]
}

export type PerClassMetrics = {
  name: string
  precision: number
  recall: number
  f1: number
  support: number
}

export type SupervisedAccuracyReport = {
  overallAccuracy: number
  holdoutFraction: number
  trainSamples: number
  testSamples: number
  confusionMatrix: ConfusionMatrixResult
  perClass: PerClassMetrics[]
}

export type SupervisedClassificationOutput = {
  legend: CropClassLegendItem[]
  prediction: { url: string; bounds: [number, number, number, number] }
  confidence: { url: string; bounds: [number, number, number, number] }
  classStats: Array<{ id: string; name: string; pct: number }>
  accuracy: SupervisedAccuracyReport
  signatures: Array<{ className: string; meanFeatures: number[]; sampleCount: number }>
}

export type RunSupervisedInput = {
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon
  season: { start: string; end: string }
  samples: CropTrainingSample[]
  timesteps?: number
  holdoutFraction?: number
  dataProvider?: CropDataProviderId
}
