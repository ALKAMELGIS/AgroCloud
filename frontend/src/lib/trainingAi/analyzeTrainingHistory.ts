/**
 * Summarize real SegFormer / Training AI epoch curves for Validate → Epochs Details.
 */

import type { TrainingEpochRecord } from './trainingAiClient'
import { detectOverfitting } from './trainingAiClient'

export type TrainingTrend = 'improving' | 'stable' | 'overfitting' | 'degrading' | 'insufficient'

export type TrainingHistoryAnalysis = {
  epochCount: number
  bestEpoch: number | null
  lowestValLoss: number | null
  highestValAccuracy: number | null
  finalTrainLoss: number | null
  finalValLoss: number | null
  finalTrainAccuracy: number | null
  finalValAccuracy: number | null
  trend: TrainingTrend
  trendLabel: string
  gapLabel: string
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function readEpochTrainAccuracy(row: TrainingEpochRecord): number | null {
  return (
    num(row.train_accuracy) ??
    num(row.metrics?.train_accuracy) ??
    null
  )
}

export function readEpochValAccuracy(row: TrainingEpochRecord): number | null {
  return (
    num(row.val_accuracy) ??
    num(row.metrics?.val_accuracy) ??
    num(row.metrics?.accuracy) ??
    null
  )
}

export function readEpochLearningRate(row: TrainingEpochRecord): number | null {
  return num(row.learning_rate) ?? num(row.metrics?.learning_rate) ?? null
}

/** Normalize trainer payloads into a stable row shape for the table. */
export function normalizeEpochHistory(
  rows: TrainingEpochRecord[] | null | undefined,
): TrainingEpochRecord[] {
  if (!Array.isArray(rows) || !rows.length) return []
  return rows
    .map((raw, idx) => {
      const epoch = num(raw?.epoch) ?? idx + 1
      const train_loss = num(raw?.train_loss) ?? 0
      const val_loss = num(raw?.val_loss) ?? 0
      const seconds = num(raw?.seconds)
      const metrics =
        raw?.metrics && typeof raw.metrics === 'object'
          ? { ...(raw.metrics as Record<string, number | string | null>) }
          : {}
      const train_accuracy = readEpochTrainAccuracy({ ...raw, metrics })
      const val_accuracy = readEpochValAccuracy({ ...raw, metrics })
      const learning_rate = readEpochLearningRate({ ...raw, metrics })
      if (train_accuracy != null) metrics.train_accuracy = train_accuracy
      if (val_accuracy != null) {
        metrics.val_accuracy = val_accuracy
        if (metrics.accuracy == null) metrics.accuracy = val_accuracy
      }
      if (learning_rate != null) metrics.learning_rate = learning_rate
      return {
        epoch,
        train_loss,
        val_loss,
        seconds,
        learning_rate,
        train_accuracy: train_accuracy ?? undefined,
        val_accuracy: val_accuracy ?? undefined,
        metrics,
      } satisfies TrainingEpochRecord
    })
    .filter(r => Number.isFinite(r.epoch))
    .sort((a, b) => a.epoch - b.epoch)
}

export function analyzeTrainingHistory(
  rows: TrainingEpochRecord[] | null | undefined,
): TrainingHistoryAnalysis | null {
  const list = normalizeEpochHistory(rows)
  if (!list.length) return null

  let bestEpoch: number | null = null
  let lowestValLoss: number | null = null
  let highestValAccuracy: number | null = null

  for (const row of list) {
    if (lowestValLoss == null || row.val_loss < lowestValLoss) {
      lowestValLoss = row.val_loss
      bestEpoch = row.epoch
    }
    const va = readEpochValAccuracy(row)
    if (va != null && (highestValAccuracy == null || va > highestValAccuracy)) {
      highestValAccuracy = va
    }
  }

  const last = list[list.length - 1]!
  const first = list[0]!
  const overfitting = detectOverfitting(list)
  let trend: TrainingTrend = 'insufficient'
  if (list.length >= 3) {
    const earlyVal = list.slice(0, Math.min(3, list.length)).map(r => r.val_loss)
    const lateVal = list.slice(-Math.min(3, list.length)).map(r => r.val_loss)
    const earlyMean = earlyVal.reduce((a, b) => a + b, 0) / earlyVal.length
    const lateMean = lateVal.reduce((a, b) => a + b, 0) / lateVal.length
    const rel = (lateMean - earlyMean) / Math.max(Math.abs(earlyMean), 1e-9)
    if (overfitting) trend = 'overfitting'
    else if (rel <= -0.05) trend = 'improving'
    else if (rel >= 0.08) trend = 'degrading'
    else trend = 'stable'
  } else if (list.length === 2) {
    if (overfitting) trend = 'overfitting'
    else if (last.val_loss < first.val_loss * 0.97) trend = 'improving'
    else if (last.val_loss > first.val_loss * 1.05) trend = 'degrading'
    else trend = 'stable'
  }

  const trendLabel =
    trend === 'improving'
      ? 'Improving — validation loss is trending down'
      : trend === 'stable'
        ? 'Stable — validation loss is roughly flat'
        : trend === 'overfitting'
          ? 'Overfitting — train loss falling while validation worsens'
          : trend === 'degrading'
            ? 'Degrading — validation loss is rising'
            : 'Need more epochs for a reliable trend'

  const finalTrainAcc = readEpochTrainAccuracy(last)
  const finalValAcc = readEpochValAccuracy(last)
  const gap =
    finalTrainAcc != null && finalValAcc != null
      ? finalTrainAcc - finalValAcc
      : last.val_loss - last.train_loss
  const gapLabel =
    finalTrainAcc != null && finalValAcc != null
      ? `Final train acc ${(finalTrainAcc * 100).toFixed(1)}% vs val ${(finalValAcc * 100).toFixed(1)}% (gap ${(gap * 100).toFixed(1)} pts)`
      : `Final train loss ${last.train_loss.toFixed(4)} vs val ${last.val_loss.toFixed(4)}`

  return {
    epochCount: list.length,
    bestEpoch,
    lowestValLoss,
    highestValAccuracy,
    finalTrainLoss: last.train_loss,
    finalValLoss: last.val_loss,
    finalTrainAccuracy: finalTrainAcc,
    finalValAccuracy: finalValAcc,
    trend,
    trendLabel,
    gapLabel,
  }
}
