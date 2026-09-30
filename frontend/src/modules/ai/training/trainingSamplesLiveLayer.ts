/**
 * Build a live map FeatureCollection from training samples (all classes).
 * This is sample-derived preview — never labeled as model inference.
 */

import {
  samplesToFeatureCollection,
  type TrainingClass,
  type TrainingSample,
} from './trainingSampleStore'

export const TRAINING_AI_LIVE_LAYER_ID = 'training-ai-live-samples'
export const TRAINING_AI_LIVE_LAYER_NAME = 'Training Samples · Live Results'

export function buildTrainingSamplesLiveGeojson(
  samples: TrainingSample[],
  classes: TrainingClass[],
  selectedSampleId: string | null = null,
): GeoJSON.FeatureCollection {
  const selected = selectedSampleId ? new Set([selectedSampleId]) : new Set<string>()
  const base = samplesToFeatureCollection(samples, classes, selected)
  return {
    type: 'FeatureCollection',
    features: base.features.map(f => {
      const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<
        string,
        unknown
      >
      return {
        ...f,
        properties: {
          ...props,
          kind: 'training_sample',
          result_layer: 'training-samples-live',
          result_kind: 'training_sample_live',
          // Explicit so UI/popups never imply YOLO/SegFormer inference.
          is_model_inference: false,
          source_label: 'Training Sample',
        },
      }
    }),
  }
}

export function trainingSamplesLiveLayerTitle(sampleCount: number): string {
  const n = Math.max(0, Math.trunc(sampleCount))
  return n > 0 ? `${TRAINING_AI_LIVE_LAYER_NAME} (${n})` : TRAINING_AI_LIVE_LAYER_NAME
}
