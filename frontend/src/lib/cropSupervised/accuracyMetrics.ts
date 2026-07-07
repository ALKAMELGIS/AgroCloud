import type { ConfusionMatrixResult, PerClassMetrics, SupervisedAccuracyReport } from './types'

export function buildConfusionMatrix(
  yTrue: number[],
  yPred: number[],
  labelNames: string[],
): ConfusionMatrixResult {
  const n = labelNames.length
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < yTrue.length; i += 1) {
    const t = yTrue[i]!
    const p = yPred[i]!
    if (t >= 0 && t < n && p >= 0 && p < n) matrix[t]![p]! += 1
  }
  return { labels: labelNames, matrix }
}

export function metricsFromConfusionMatrix(cm: ConfusionMatrixResult): {
  overallAccuracy: number
  perClass: PerClassMetrics[]
} {
  const { labels, matrix } = cm
  const n = labels.length
  let correct = 0
  let total = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      total += matrix[i]![j]!
      if (i === j) correct += matrix[i]![j]!
    }
  }
  const overallAccuracy = total ? correct / total : 0

  const perClass: PerClassMetrics[] = labels.map((name, i) => {
    let tp = matrix[i]![i]!
    let fp = 0
    let fn = 0
    for (let j = 0; j < n; j += 1) {
      if (j !== i) {
        fp += matrix[j]![i]!
        fn += matrix[i]![j]!
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    const support = matrix[i]!.reduce((a, b) => a + b, 0)
    return {
      name,
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
      f1: Number(f1.toFixed(3)),
      support,
    }
  })

  return { overallAccuracy: Number(overallAccuracy.toFixed(3)), perClass }
}

export function buildAccuracyReport(
  yTrue: number[],
  yPred: number[],
  labelNames: string[],
  holdoutFraction: number,
  trainSamples: number,
  testSamples: number,
): SupervisedAccuracyReport {
  const confusionMatrix = buildConfusionMatrix(yTrue, yPred, labelNames)
  const { overallAccuracy, perClass } = metricsFromConfusionMatrix(confusionMatrix)
  return {
    overallAccuracy,
    holdoutFraction,
    trainSamples,
    testSamples,
    confusionMatrix,
    perClass,
  }
}
