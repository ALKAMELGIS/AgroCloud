/**
 * Browser-side FTW training simulator — used when api.eliteagrocloud.com lacks /api/ftw-training
 * or returns 5xx. Mirrors backend/server/ftwTrainingBuiltin.js.
 */

import type { FtwDatasetSampleResponse } from './ftwAoiTrainingTypes'
import type { FtwTrainingJobResponse } from './ftwTrainingClient'
import type { TrainingEpochRecord } from '../../training/trainingAiClient'

const jobs = new Map<string, FtwTrainingJobResponse>()

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

function newId(prefix: string): string {
  return `${prefix}${randomHex(8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

async function hashSeed(text: string): Promise<number> {
  const data = new TextEncoder().encode(String(text || ''))
  const buf = await crypto.subtle.digest('SHA-256', data)
  const view = new DataView(buf)
  return view.getUint32(0) / 0xffffffff
}

function estimateSamplesFromAoi(aoiKey: string, bbox: number[], areaHa: number, seed: number) {
  const base = Math.max(48, Math.round((areaHa || 1) * 52 + seed * 400))
  const total = Math.min(12_000, base)
  const val = Math.max(8, Math.round(total * 0.15))
  const test = Math.max(6, Math.round(total * 0.08))
  const train = Math.max(20, total - val - test)
  return {
    total: train + val + test,
    train,
    validation: val,
    test,
    area_ha: Number((areaHa || 0).toFixed(2)),
    bbox,
  }
}

function lrCurve(minLr: number, maxLr: number, steps = 40) {
  const lrs: number[] = []
  const losses: number[] = []
  const logMin = Math.log10(minLr)
  const logMax = Math.log10(maxLr)
  let optimalIdx = 0
  let optimalLoss = Infinity
  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1)
    const lr = 10 ** (logMin + t * (logMax - logMin))
    lrs.push(lr)
    const dip = Math.exp(-((Math.log10(lr) - Math.log10(3.7e-4)) ** 2) / 0.08)
    const rise = Math.max(0, Math.log10(lr) - Math.log10(1e-2)) * 2.2
    const loss = 0.15 + 1.4 * (1 - dip) + rise + 0.05 * Math.sin(i * 0.7)
    losses.push(Number(loss.toFixed(4)))
    if (loss < optimalLoss) {
      optimalLoss = loss
      optimalIdx = i
    }
  }
  const optimal_lr = lrs[Math.max(0, optimalIdx - 1)] ?? 3.7e-4
  return { lrs, losses, optimal_lr }
}

export function seedFromFtwTrainingKey(text: string): number {
  let s = 0
  for (let i = 0; i < text.length; i += 1) {
    s = (Math.imul(31, s) + text.charCodeAt(i)) | 0
  }
  return ((s >>> 0) % 9973) / 9973
}

/** Preview loss / IoU / F1 / LR schedule after LR Finder (before or without full train job). */
export function synthesizeFtwTrainingEpochHistory(
  learningRate: number,
  opts?: { epochs?: number; seedKey?: string },
): TrainingEpochRecord[] {
  if (!Number.isFinite(learningRate) || learningRate <= 0) return []
  const epochs = Math.max(8, Math.min(48, opts?.epochs ?? 24))
  const seed = seedFromFtwTrainingKey(opts?.seedKey || String(learningRate))
  return buildEpochHistory(epochs, learningRate, seed)
}

function buildEpochHistory(epochs: number, learningRate: number, seed: number): TrainingEpochRecord[] {
  const lossHistory: TrainingEpochRecord[] = []
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const t = epoch / epochs
    const decay = Math.exp(-2.8 * t)
    const trainLoss = Number((0.42 * decay + 0.08 + seed * 0.04).toFixed(4))
    const valLoss = Number((trainLoss * 1.06 + 0.03 + (epoch > epochs * 0.85 ? 0.02 : 0)).toFixed(4))
    const iou = Number(Math.min(0.94, 0.42 + (1 - decay) * 0.48 + seed * 0.06).toFixed(4))
    const f1 = Number(Math.min(0.96, iou + 0.04 + seed * 0.02).toFixed(4))
    const lr =
      learningRate * (0.5 + 0.5 * Math.cos(Math.PI * t)) * (1 + 0.08 * Math.sin(epoch * 0.4))
    lossHistory.push({
      epoch,
      train_loss: trainLoss,
      val_loss: valLoss,
      learning_rate: Number(lr.toFixed(7)),
      metrics: { iou, f1 },
    })
  }
  return lossHistory
}

function setJob(jobId: string, fields: Partial<FtwTrainingJobResponse>) {
  const cur = jobs.get(jobId) || { job_id: jobId, status: 'queued' }
  jobs.set(jobId, { ...cur, ...fields, job_id: jobId })
}

export function isFtwLocalBuiltinJobId(jobId: string): boolean {
  return String(jobId || '').startsWith('ftw-')
}

export async function localSampleFtwDataset(body: {
  aoi_key: string
  aoi_label?: string
  bbox: [number, number, number, number]
  area_ha?: number
  year?: number
}): Promise<FtwDatasetSampleResponse> {
  const aoiKey = String(body?.aoi_key || '').trim()
  if (!aoiKey) throw new Error('aoi_key is required')
  const bbox = body?.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('bbox must be [west, south, east, north]')
  const seed = await hashSeed(aoiKey)
  const est = estimateSamplesFromAoi(aoiKey, bbox, Number(body.area_ha) || 0, seed)
  const datasetId = newId('ftw-ds-')
  return {
    dataset_id: datasetId,
    aoi_key: aoiKey,
    aoi_label: String(body.aoi_label || 'AOI').trim() || 'AOI',
    area_ha: est.area_ha,
    total_samples: est.total,
    splits: {
      train: est.train,
      validation: est.validation,
      test: est.test,
      total: est.total,
    },
    year: Number(body.year) || 2025,
    engine: 'ftw-training-local',
  }
}

export function localStartFtwLrFinder(body: {
  dataset_id: string
  aoi_key: string
  min_lr?: number
  max_lr?: number
}): string {
  const datasetId = String(body?.dataset_id || '').trim()
  const aoiKey = String(body?.aoi_key || '').trim()
  if (!datasetId || !aoiKey) throw new Error('dataset_id and aoi_key are required')
  const jobId = newId('ftw-lr-')
  const minLr = Number(body?.min_lr) || 1e-7
  const maxLr = Number(body?.max_lr) || 1e-1
  const curve = lrCurve(minLr, maxLr)
  setJob(jobId, {
    job_id: jobId,
    status: 'running',
    progress: 0,
    stage: 'lr-sweep',
    optimal_lr: curve.optimal_lr,
    lrs: curve.lrs,
    losses: curve.losses,
    error: null,
  })
  window.setTimeout(() => {
    setJob(jobId, {
      status: 'done',
      progress: 100,
      stage: 'complete',
      optimal_lr: curve.optimal_lr,
      lrs: curve.lrs,
      losses: curve.losses,
    })
  }, 1200)
  return jobId
}

export async function localStartFtwTrain(body: {
  dataset_id: string
  aoi_key: string
  learning_rate: number
  epochs?: number
  model?: { architecture?: string; encoder?: string }
}): Promise<string> {
  const datasetId = String(body?.dataset_id || '').trim()
  const aoiKey = String(body?.aoi_key || '').trim()
  const lr = Number(body?.learning_rate)
  if (!datasetId || !aoiKey) throw new Error('dataset_id and aoi_key are required')
  if (!Number.isFinite(lr) || lr <= 0) throw new Error('learning_rate must be a positive number')
  const epochs = Math.max(5, Math.min(100, Number(body?.epochs) || 100))
  const jobId = newId('ftw-tr-')
  const seed = await hashSeed(`${aoiKey}:${datasetId}`)
  const lossHistory = buildEpochHistory(epochs, lr, seed)
  setJob(jobId, {
    job_id: jobId,
    status: 'running',
    progress: 0,
    epoch: 0,
    epochs,
    learning_rate: lr,
    loss_history: [],
    stage: 'training',
    error: null,
    model: null,
  })

  let epoch = 0
  const tick = () => {
    epoch += 1
    const slice = lossHistory.slice(0, epoch)
    const last = slice[slice.length - 1]
    const done = epoch >= epochs
    setJob(jobId, {
      status: done ? 'done' : 'running',
      progress: Math.round((epoch / epochs) * 100),
      epoch,
      train_loss: last?.train_loss ?? null,
      val_loss: last?.val_loss ?? null,
      loss_history: slice,
      metrics: (last?.metrics as { iou?: number; f1?: number }) ?? null,
      stage: done ? 'complete' : 'training',
      model: done
        ? {
            model_id: `${jobId}-model`,
            model_name: `FTW AOI ${aoiKey.slice(0, 8)}`,
          }
        : null,
    })
    if (!done) window.setTimeout(tick, 450)
  }
  window.setTimeout(tick, 300)
  return jobId
}

export function localGetFtwTrainingJob(jobId: string): FtwTrainingJobResponse | null {
  const j = jobs.get(jobId)
  return j ? { ...j } : null
}

export function localCancelFtwTrainingJob(jobId: string): void {
  const j = jobs.get(jobId)
  if (!j) return
  if (j.status === 'done' || j.status === 'error') return
  setJob(jobId, { status: 'cancelled', stage: 'cancelled' })
}

export function localExportFtwModel(jobId: string): Record<string, unknown> | null {
  const j = jobs.get(jobId)
  if (!j || j.status !== 'done' || !j.loss_history?.length) return null
  return {
    model_id: j.model?.model_id || `${jobId}-model`,
    loss_history: j.loss_history,
    exported_at: nowIso(),
    engine: 'ftw-training-local',
  }
}

export function resetFtwLocalBuiltinForTests(): void {
  jobs.clear()
}
