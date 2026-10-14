import { describe, expect, it } from 'vitest'
import { emptyFtwAoiSession } from './ftwAoiTrainingTypes'
import { resolveFtwSessionEpochHistory } from './FtwAoiTrainingDashboard'

describe('resolveFtwSessionEpochHistory preview', () => {
  it('synthesizes epoch curves when LR + sample count come from preview context', () => {
    const row = emptyFtwAoiSession('layers:abc', 'Layers AOI')
    const history = resolveFtwSessionEpochHistory(row, {
      optimalLr: 3.7e-4,
      datasetTotal: 240,
    })
    expect(history.length).toBeGreaterThan(8)
    expect(history[0]?.metrics?.iou).toBeGreaterThan(0)
    expect(history.at(-1)?.train_loss).toBeGreaterThan(0)
  })

  it('returns empty when preview LR is missing', () => {
    const row = emptyFtwAoiSession('draw:x', 'Active AOI (Edit)')
    expect(resolveFtwSessionEpochHistory(row, { datasetTotal: 100 })).toEqual([])
  })
})
