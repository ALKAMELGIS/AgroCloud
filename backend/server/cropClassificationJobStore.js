/**
 * Disk-backed crop-classification job snapshots.
 *
 * In-memory JOBS maps are lost on process restart and are not shared across
 * multiple Node workers — both cause "Job not found or expired" on production.
 * Each update is written here so any worker can serve GET /jobs/:id and the
 * classified prediction PNG.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, '..')
export const CROP_JOB_ROOT = path.join(BACKEND_ROOT, 'data', 'crop-classification-jobs')

function jobJsonPath(jobId) {
  return path.join(CROP_JOB_ROOT, `${jobId}.json`)
}

function predictionPngPath(jobId) {
  return path.join(CROP_JOB_ROOT, `${jobId}-prediction.png`)
}

export function cropJobPredictionApiPath(jobId) {
  return `/api/crop-classification/jobs/${jobId}/prediction.png`
}

export function ensureCropJobDirs() {
  fs.mkdirSync(CROP_JOB_ROOT, { recursive: true })
}

/** @param {string} dataUrl base64 PNG data URL */
export function persistCropJobPredictionPng(jobId, dataUrl) {
  ensureCropJobDirs()
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i)
  if (!m) return null
  try {
    const buf = Buffer.from(m[1], 'base64')
    if (!buf.length) return null
    fs.writeFileSync(predictionPngPath(jobId), buf)
    return cropJobPredictionApiPath(jobId)
  } catch {
    return null
  }
}

export function readCropJobPredictionPng(jobId) {
  const fp = predictionPngPath(jobId)
  if (!fs.existsSync(fp)) return null
  try {
    return fs.readFileSync(fp)
  } catch {
    return null
  }
}

/** @param {Record<string, unknown>} job */
export function persistCropJobSnapshot(job) {
  if (!job?.id) return
  ensureCropJobDirs()
  const snapshot = { ...job }
  // Never persist multi-MB inline PNG payloads in JSON — file asset holds the bytes.
  const predUrl = snapshot?.result?.prediction?.url
  if (typeof predUrl === 'string' && predUrl.startsWith('data:image/')) {
    const apiPath = persistCropJobPredictionPng(job.id, predUrl)
    if (apiPath) {
      snapshot.result = {
        ...snapshot.result,
        prediction: { ...snapshot.result.prediction, url: apiPath },
      }
      job.result = snapshot.result
    }
  }
  try {
    fs.writeFileSync(jobJsonPath(job.id), JSON.stringify(snapshot), 'utf8')
  } catch {
    /* best-effort */
  }
}

/** @returns {Record<string, unknown> | null} */
export function loadCropJobSnapshot(jobId) {
  const fp = jobJsonPath(jobId)
  if (!fs.existsSync(fp)) return null
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch {
    return null
  }
}

export function deleteCropJobSnapshot(jobId) {
  try {
    fs.unlinkSync(jobJsonPath(jobId))
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(predictionPngPath(jobId))
  } catch {
    /* ignore */
  }
}

export function pruneCropJobSnapshots(maxAgeMs) {
  ensureCropJobDirs()
  const now = Date.now()
  let entries = []
  try {
    entries = fs.readdirSync(CROP_JOB_ROOT)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const fp = path.join(CROP_JOB_ROOT, name)
    try {
      const st = fs.statSync(fp)
      if (now - st.mtimeMs <= maxAgeMs) continue
      const jobId = name.replace(/\.json$/, '')
      deleteCropJobSnapshot(jobId)
    } catch {
      /* ignore */
    }
  }
}
