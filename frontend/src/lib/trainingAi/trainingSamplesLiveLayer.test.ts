import { describe, expect, it } from 'vitest'
import {
  buildTrainingSamplesLiveGeojson,
  trainingSamplesLiveLayerTitle,
} from './trainingSamplesLiveLayer'
import { DEFAULT_TRAINING_CLASSES } from './trainingSampleStore'

describe('trainingSamplesLiveLayer', () => {
  it('marks features as training-sample live (not model inference)', () => {
    const fc = buildTrainingSamplesLiveGeojson(
      [
        {
          sample_id: 's1',
          class_id: 6,
          class_name: 'Tree',
          geometry: { type: 'Point', coordinates: [55, 25] },
          geometry_type: 'Point',
          image_id: 'map',
          source: 'digitize',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      DEFAULT_TRAINING_CLASSES,
      's1',
    )
    expect(fc.features).toHaveLength(1)
    const p = fc.features[0]!.properties as Record<string, unknown>
    expect(p.result_kind).toBe('training_sample_live')
    expect(p.is_model_inference).toBe(false)
    expect(p.selected).toBe(true)
    expect(trainingSamplesLiveLayerTitle(3)).toContain('(3)')
  })
})
