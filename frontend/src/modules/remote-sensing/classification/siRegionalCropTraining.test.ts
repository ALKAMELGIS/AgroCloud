import { describe, expect, it } from 'vitest'
import {
  assignFeaturesToCrop,
  buildClassCentroids,
  calibrateRegionalCrops,
  DEFAULT_REGIONAL_CROP_CATALOG,
  type RegionalTrainingSample,
  type SpectralFeatureVector,
} from './siRegionalCropTraining'

const vec = (ndvi: number, amp = 0.2): SpectralFeatureVector => ({
  ndviMean: ndvi,
  ndwiMean: 0.05,
  ndmiMean: 0.1,
  eviMean: ndvi * 0.9,
  saviMean: ndvi * 0.85,
  ndviAmp: amp,
  sceneCount: 4,
})

describe('siRegionalCropTraining', () => {
  it('builds centroids and assigns nearest crop', () => {
    const samples: RegionalTrainingSample[] = [
      {
        id: 'a',
        cropId: 'wheat',
        cropLabel: 'Wheat',
        color: '#b8860b',
        geometry: { type: 'Point', coordinates: [0, 0] },
        features: vec(0.42, 0.15),
        createdAt: 1,
      },
      {
        id: 'b',
        cropId: 'corn',
        cropLabel: 'Corn',
        color: '#facc15',
        geometry: { type: 'Point', coordinates: [1, 1] },
        features: vec(0.78, 0.35),
        createdAt: 2,
      },
    ]
    const centroids = buildClassCentroids(samples)
    expect(centroids.wheat?.ndviMean).toBeCloseTo(0.42)
    const hit = assignFeaturesToCrop(vec(0.75, 0.32), centroids, {
      ...DEFAULT_REGIONAL_CROP_CATALOG,
      enabledCropIds: ['wheat', 'corn'],
    })
    expect(hit?.cropId).toBe('corn')
  })

  it('calibrates unlabeled fields from training samples', () => {
    const samples: RegionalTrainingSample[] = [
      {
        id: 's1',
        cropId: 'wheat',
        cropLabel: 'Wheat',
        color: '#b8860b',
        geometry: { type: 'Point', coordinates: [0, 0] },
        fieldId: 'f1',
        fieldName: 'North',
        features: vec(0.4, 0.12),
        createdAt: 1,
      },
      {
        id: 's2',
        cropId: 'corn',
        cropLabel: 'Corn',
        color: '#facc15',
        geometry: { type: 'Point', coordinates: [1, 1] },
        fieldId: 'f2',
        fieldName: 'South',
        features: vec(0.8, 0.3),
        createdAt: 2,
      },
    ]
    const fieldFeatures = new Map<string, SpectralFeatureVector | null>([
      ['f1', vec(0.41, 0.13)],
      ['f2', vec(0.79, 0.28)],
      ['f3', vec(0.77, 0.31)],
    ])
    const result = calibrateRegionalCrops({
      samples,
      catalog: { ...DEFAULT_REGIONAL_CROP_CATALOG, enabledCropIds: ['wheat', 'corn'] },
      fields: [
        { id: 'f1', name: 'North', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
        { id: 'f2', name: 'South', geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } },
        { id: 'f3', name: 'East', geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] } },
      ],
      fieldFeatures,
      seasonStart: '2025-03-01',
      seasonEnd: '2025-08-01',
    })
    expect(result.assignments.length).toBe(3)
    expect(result.assignments.find(a => a.fieldId === 'f3')?.cropId).toBe('corn')
  })
})
