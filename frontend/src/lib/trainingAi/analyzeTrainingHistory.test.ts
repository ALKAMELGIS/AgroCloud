import { describe, expect, it } from 'vitest'
import { analyzeTrainingHistory, normalizeEpochHistory } from './analyzeTrainingHistory'

describe('analyzeTrainingHistory', () => {
  it('normalizes trainer rows and finds the best validation epoch', () => {
    const rows = normalizeEpochHistory([
      {
        epoch: 1,
        train_loss: 1.2,
        val_loss: 1.0,
        seconds: 5,
        learning_rate: 6e-5,
        metrics: { accuracy: 0.4, train_accuracy: 0.45 },
      },
      {
        epoch: 2,
        train_loss: 0.9,
        val_loss: 0.7,
        seconds: 5,
        learning_rate: 6e-5,
        train_accuracy: 0.55,
        val_accuracy: 0.62,
      },
      {
        epoch: 3,
        train_loss: 0.7,
        val_loss: 0.85,
        seconds: 6,
        learning_rate: 6e-5,
        metrics: { accuracy: 0.5, train_accuracy: 0.7 },
      },
    ])
    expect(rows).toHaveLength(3)
    expect(rows[1]?.val_accuracy).toBe(0.62)
    const analysis = analyzeTrainingHistory(rows)!
    expect(analysis.bestEpoch).toBe(2)
    expect(analysis.lowestValLoss).toBe(0.7)
    expect(analysis.highestValAccuracy).toBe(0.62)
    expect(analysis.finalTrainLoss).toBe(0.7)
    expect(analysis.finalValLoss).toBe(0.85)
  })

  it('flags overfitting when train keeps dropping and val rises', () => {
    const analysis = analyzeTrainingHistory([
      { epoch: 1, train_loss: 1.0, val_loss: 1.0 },
      { epoch: 2, train_loss: 0.8, val_loss: 1.05 },
      { epoch: 3, train_loss: 0.6, val_loss: 1.2 },
      { epoch: 4, train_loss: 0.4, val_loss: 1.4 },
    ])
    expect(analysis?.trend).toBe('overfitting')
  })
})
