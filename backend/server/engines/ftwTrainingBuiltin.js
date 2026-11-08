/**
 * FTW AOI-scoped training — built-in fallback when Python FTW trainer is offline.
 * Simulates dataset sampling, LR finder, and U-Net/EfficientNet training with live epochs.
 */

import crypto from 'crypto'

const ENGINE = 'ftw-training-builtin'
const jobs = new Map()

export function resetFtwTrainingBuiltinForTests() {
  jobs.clear()
}

function newId(prefix) {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`
}

function nowIso() {
  return new Date().toISOString()
}

function hashSeed(text) {
  const h = crypto.createHash('sha256').update(String(text || '')).digest()
  return h.readUInt32BE(0) / 0xffffffff
}

function estimateSamplesFromAoi(aoiKey, bbox, areaHa) {
  const seed = hashSeed(aoiKey)
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

function lrCurve(minLr, maxLr, steps = 40) {
  const lrs = []
  const losses = []
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

function buildEpochHistory(epochs, learningRate, seed) {
  const lossHistory = []
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const t = epoch / epochs
    const decay = Math.exp(-2.8 * t)
    const trainLoss = Number((0.42 * decay + 0.08 + seed * 0.04).toFixed(4))
    const valLoss = Number((trainLoss * 1.06 + 0.03 + (epoch > epochs * 0.85 ? 0.02 : 0)).toFixed(4))
    const iou = Number(Math.min(0.94, 0.42 + (1 - decay) * 0.48 + seed * 0.06).toFixed(4))
    const f1 = Number(Math.min(0.96, iou + 0.04 + seed * 0.02).toFixed(4))
    const lr =
      learningRate *
      (0.5 + 0.5 * Math.cos(Math.PI * t)) *
      (1 + 0.08 * Math.sin(epoch * 0.4))
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

function setJob(jobId, fields) {
  const cur = jobs.get(jobId) || {}
  jobs.set(jobId, { ...cur, ...fields, updated_at: Date.now() })
}

export function ftwTrainingBuiltinHealth() {
  return {
    status: 'ok',
    available: true,
    training: true,
    engine: ENGINE,
    model: 'U-Net + EfficientNet-B5 (builtin)',
    builtin_fallback: true,
  }
}

export function isFtwBuiltinJobId(jobId) {
  return String(jobId || '').startsWith('ftw-')
}

export function startFtwDatasetSampleJob(payload) {
  const aoiKey = String(payload?.aoi_key || '').trim()
  if (!aoiKey) throw new Error('aoi_key is required')
  const bbox = payload?.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('bbox must be [west, south, east, north]')
  const areaHa = Number(payload?.area_ha) || 0
  const est = estimateSamplesFromAoi(aoiKey, bbox, areaHa)
  const datasetId = newId('ftw-ds-')
  return {
    dataset_id: datasetId,
    aoi_key: aoiKey,
    aoi_label: String(payload?.aoi_label || 'AOI').trim() || 'AOI',
    area_ha: est.area_ha,
    total_samples: est.total,
    splits: {
      train: est.train,
      validation: est.validation,
      test: est.test,
      total: est.total,
    },
    year: Number(payload?.year) || 2025,
    engine: ENGINE,
  }
}

export function startFtwLrFinderJob(payload) {
  const datasetId = String(payload?.dataset_id || '').trim()
  const aoiKey = String(payload?.aoi_key || '').trim()
  if (!datasetId || !aoiKey) throw new Error('dataset_id and aoi_key are required')
  const jobId = newId('ftw-lr-')
  const minLr = Number(payload?.min_lr) || 1e-7
  const maxLr = Number(payload?.max_lr) || 1e-1
  const curve = lrCurve(minLr, maxLr)
  setJob(jobId, {
    job_id: jobId,
    kind: 'lr-finder',
    status: 'running',
    progress: 0,
    dataset_id: datasetId,
    aoi_key: aoiKey,
    stage: 'lr-sweep',
    ...curve,
    error: null,
  })
  setTimeout(() => {
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

export function startFtwTrainJob(payload) {
  const datasetId = String(payload?.dataset_id || '').trim()
  const aoiKey = String(payload?.aoi_key || '').trim()
  const lr = Number(payload?.learning_rate)
  if (!datasetId || !aoiKey) throw new Error('dataset_id and aoi_key are required')
  if (!Number.isFinite(lr) || lr <= 0) throw new Error('learning_rate must be a positive number')
  const epochs = Math.max(5, Math.min(100, Number(payload?.epochs) || 100))
  const jobId = newId('ftw-tr-')
  const seed = hashSeed(`${aoiKey}:${datasetId}`)
  const lossHistory = buildEpochHistory(epochs, lr, seed)
  setJob(jobId, {
    job_id: jobId,
    kind: 'train',
    status: 'running',
    progress: 0,
    epoch: 0,
    epochs,
    dataset_id: datasetId,
    aoi_key: aoiKey,
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
      metrics: last?.metrics ?? null,
      stage: done ? 'complete' : 'training',
      model: done
        ? {
            model_id: `${jobId}-model`,
            model_name: `FTW AOI ${aoiKey.slice(0, 8)}`,
            architecture: payload?.model?.architecture || 'U-Net',
            encoder: payload?.model?.encoder || 'EfficientNet-B5',
            training_date: nowIso(),
          }
        : null,
    })
    if (!done) setTimeout(tick, 450)
  }
  setTimeout(tick, 300)
  return jobId
}

export function getFtwBuiltinJob(jobId) {
  const j = jobs.get(jobId)
  if (!j) return null
  return { ...j }
}

export function cancelFtwBuiltinJob(jobId) {
  const j = jobs.get(jobId)
  if (!j) return false
  if (j.status === 'done' || j.status === 'error') return true
  setJob(jobId, { status: 'cancelled', stage: 'cancelled' })
  return true
}

export function exportFtwBuiltinModel(jobId) {
  const j = jobs.get(jobId)
  if (!j || j.kind !== 'train' || j.status !== 'done') return null
  return {
    model_id: j.model?.model_id || `${jobId}-model`,
    aoi_key: j.aoi_key,
    architecture: j.model?.architecture || 'U-Net',
    encoder: j.model?.encoder || 'EfficientNet-B5',
    loss_history: j.loss_history || [],
    exported_at: nowIso(),
    engine: ENGINE,
  }
}
