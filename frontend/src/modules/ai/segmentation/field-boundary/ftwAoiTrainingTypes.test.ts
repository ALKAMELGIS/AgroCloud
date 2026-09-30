import { describe, expect, it } from 'vitest'
import { emptyFtwAoiSession, isFtwAoiSessionChartable } from './ftwAoiTrainingTypes'

describe('isFtwAoiSessionChartable', () => {
  it('rejects idle AOI stubs with only area metadata', () => {
    const stub = emptyFtwAoiSession('draw:poly123', 'Active AOI (Edit)')
    stub.areaHa = 43.1
    expect(isFtwAoiSessionChartable(stub)).toBe(false)
  })

  it('accepts sessions with a built dataset', () => {
    const session = emptyFtwAoiSession('aoi-1', 'North')
    session.datasetId = 'ds-1'
    session.dataset = { train: 70, validation: 20, test: 10, total: 100 }
    expect(isFtwAoiSessionChartable(session)).toBe(true)
  })

  it('accepts sessions with LR finder or training history', () => {
    const lr = emptyFtwAoiSession('aoi-2', 'South')
    lr.lrFinder = { lrs: [1e-4], losses: [0.5], optimal_lr: 1e-4, status: 'done' }
    expect(isFtwAoiSessionChartable(lr)).toBe(true)

    const train = emptyFtwAoiSession('aoi-3', 'East')
    train.lossHistory = [{ epoch: 1, train_loss: 0.4, val_loss: 0.5 }]
    expect(isFtwAoiSessionChartable(train)).toBe(true)
  })
})
