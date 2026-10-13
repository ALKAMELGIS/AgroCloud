import { describe, expect, it, beforeEach } from 'vitest'
import {
  localGetFtwTrainingJob,
  localSampleFtwDataset,
  localStartFtwLrFinder,
  resetFtwLocalBuiltinForTests,
  synthesizeFtwTrainingEpochHistory,
} from './ftwTrainingLocalBuiltin'
import { shouldFtwTrainingUseLocalFallback, FtwTrainingServiceError } from './ftwTrainingClient'

describe('ftwTrainingLocalBuiltin', () => {
  beforeEach(() => {
    resetFtwLocalBuiltinForTests()
  })

  it('samples dataset from AOI key and bbox', async () => {
    const resp = await localSampleFtwDataset({
      aoi_key: 'test:aoi-1',
      bbox: [54, 24, 55, 25],
      area_ha: 12,
    })
    expect(resp.dataset_id).toMatch(/^ftw-ds-/)
    expect(resp.splits.total).toBeGreaterThan(40)
  })

  it('completes LR finder job locally', async () => {
    const jobId = localStartFtwLrFinder({
      dataset_id: 'ftw-ds-abc',
      aoi_key: 'test:aoi-1',
    })
    await new Promise(r => setTimeout(r, 1300))
    const job = localGetFtwTrainingJob(jobId)
    expect(job?.status).toBe('done')
    expect(job?.lrs?.length).toBeGreaterThan(10)
    expect(job?.losses?.length).toBe(job?.lrs?.length)
  })
})

describe('synthesizeFtwTrainingEpochHistory', () => {
  it('builds loss, IoU, F1 and LR schedule points', () => {
    const rows = synthesizeFtwTrainingEpochHistory(3.7e-4, { epochs: 12, seedKey: 'aoi:test' })
    expect(rows).toHaveLength(12)
    expect(rows[0]?.train_loss).toBeGreaterThan(0)
    expect(rows[11]?.metrics?.iou).toBeGreaterThan(0.4)
    expect(rows[5]?.learning_rate).toBeGreaterThan(0)
  })
})

describe('shouldFtwTrainingUseLocalFallback', () => {
  it('falls back on 500 and offline', () => {
    expect(shouldFtwTrainingUseLocalFallback(new FtwTrainingServiceError('HTTP 500', { status: 500 }))).toBe(
      true,
    )
    expect(shouldFtwTrainingUseLocalFallback(new FtwTrainingServiceError('offline', { offline: true }))).toBe(
      true,
    )
    expect(shouldFtwTrainingUseLocalFallback(new FtwTrainingServiceError('bad', { status: 422 }))).toBe(false)
  })
})
