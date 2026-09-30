import { describe, expect, it } from 'vitest'
import {
  countFieldTrainingByStatus,
  downloadApprovedFieldTrainingSamples,
  predictionsToDraftSamples,
} from './fieldBoundaryTrainingSamples'

const fc: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'f1',
      properties: { confidence: 0.8, area_m2: 12_000 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55, 24],
            [55.01, 24],
            [55.01, 24.01],
            [55, 24.01],
            [55, 24],
          ],
        ],
      },
    },
  ],
}

describe('fieldBoundaryTrainingSamples', () => {
  it('generates draft samples only from predictions', () => {
    const drafts = predictionsToDraftSamples(fc, { engine: 'afd', acquisitionDate: '2024-06-01' })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.status).toBe('draft')
    expect(drafts[0]!.detection_engine).toBe('afd')
    expect(drafts[0]!.acquisition_date).toBe('2024-06-01')
    expect(drafts[0]!.approved_at).toBeUndefined()
  })

  it('refuses Save when nothing is approved', () => {
    const drafts = predictionsToDraftSamples(fc)
    const result = downloadApprovedFieldTrainingSamples(drafts)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/No approved/i)
  })

  it('counts statuses', () => {
    const drafts = predictionsToDraftSamples(fc)
    const approved = [{ ...drafts[0]!, status: 'approved' as const, approved_at: new Date().toISOString() }]
    expect(countFieldTrainingByStatus(approved)).toEqual({
      draft: 0,
      approved: 1,
      rejected: 0,
      total: 1,
    })
  })
})
