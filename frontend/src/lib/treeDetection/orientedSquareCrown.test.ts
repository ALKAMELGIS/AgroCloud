import { describe, expect, it } from 'vitest'
import { orientedSquareFromRing, axisSquareFromCentre } from './orientedSquareCrown'
import {
  applySampleSpatialAdapter,
  countTreeTrainingSamples,
  fingerprintTreeSamples,
  isNonTreeClassName,
  isTreeClassName,
  resolveTrainStatus,
} from './treeSampleWorkflow'
import type { TrainingSample } from '../trainingAi/trainingSampleStore'
import type { TreeDetection } from './treeDetectionEngine'

describe('orientedSquareFromRing', () => {
  it('returns closed oriented square around elongated crown', () => {
    const ring: [number, number][] = [
      [55.0, 25.0],
      [55.0004, 25.0],
      [55.0004, 25.0001],
      [55.0, 25.0001],
      [55.0, 25.0],
    ]
    const sq = orientedSquareFromRing(ring)
    expect(sq).not.toBeNull()
    expect(sq!.length).toBe(5)
    expect(sq![0]).toEqual(sq![4])
  })

  it('axisSquareFromCentre closes', () => {
    const sq = axisSquareFromCentre(55, 25, 10)
    expect(sq).toHaveLength(5)
    expect(sq[0]).toEqual(sq[4])
  })
})

describe('treeSampleWorkflow', () => {
  const samples: TrainingSample[] = [
    {
      sample_id: 'a',
      class_id: 6,
      class_name: 'Tree',
      geometry: { type: 'Point', coordinates: [55, 25] },
      geometry_type: 'Point',
      image_id: 'img',
      source: 'map',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      sample_id: 'b',
      class_id: 10,
      class_name: 'Non-Tree',
      geometry: { type: 'Point', coordinates: [55.001, 25] },
      geometry_type: 'Point',
      image_id: 'img',
      source: 'map',
      created_at: '2026-01-01T00:00:00Z',
    },
  ]

  it('classifies Tree / Non-Tree names', () => {
    expect(isTreeClassName('Tree')).toBe(true)
    expect(isTreeClassName('Non-Tree')).toBe(false)
    expect(isNonTreeClassName('Non-Tree')).toBe(true)
  })

  it('counts and fingerprints', () => {
    const c = countTreeTrainingSamples(samples)
    expect(c).toEqual({ tree: 1, nonTree: 1, total: 2 })
    const fp = fingerprintTreeSamples(samples)
    expect(fp).toMatch(/^ts-/)
    expect(fingerprintTreeSamples(samples)).toBe(fp)
  })

  it('status transitions', () => {
    expect(resolveTrainStatus('pretrained', null, 'x')).toBe('pretrained')
    expect(resolveTrainStatus('train-from-samples', null, 'x')).toBe('never-trained')
    expect(
      resolveTrainStatus(
        'train-from-samples',
        {
          modelName: 'YOLO Tree',
          modelVersion: 'v01',
          sampleFingerprint: 'ts-a',
          treeCount: 5,
          nonTreeCount: 2,
          trainedAt: '2026-08-11T00:00:00Z',
          lastInferenceAt: null,
          checkpointId: null,
          trainKind: 'sample-adapter',
        },
        'ts-b',
      ),
    ).toBe('samples-changed')
  })

  it('suppresses detections on Non-Tree samples', () => {
    const dets: TreeDetection[] = [
      {
        id: 't1',
        lng: 55.001,
        lat: 25,
        confidence: 0.9,
        crownDiameterM: 4,
        crownAreaM2: 12,
        sizeClass: 'medium',
        vigor: 'healthy',
      },
      {
        id: 't2',
        lng: 55.01,
        lat: 25,
        confidence: 0.8,
        crownDiameterM: 4,
        crownAreaM2: 12,
        sizeClass: 'medium',
        vigor: 'healthy',
      },
    ]
    const out = applySampleSpatialAdapter(dets, samples, { nonTreeSuppressM: 20 })
    expect(out.map(d => d.id)).toEqual(['t2'])
  })
})
