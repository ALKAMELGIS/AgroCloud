/**
 * Training & AI — job client for /api/training and /api/inference
 * (Node proxy → segformer-detection :8095).
 */

import { apiUrl } from '../apiOrigin'
import type { InferenceArgumentsPayload } from './inferenceArguments'

const TRAIN_BASE = () => apiUrl('/api/training')
const INFER_BASE = () => apiUrl('/api/inference')

export type TrainingJobStatus = {
  status: string
  progress: number
  epoch?: number
  epochs?: number
  train_loss?: number | null
  val_loss?: number | null
  stage?: string
  loss_history?: TrainingEpochRecord[]
  metrics?: TrainingMetrics | null
  model?: TrainingModelInfo | null
  error?: string | null
  result?: unknown
  transient?: boolean
}

export type TrainingEpochRecord = {
  epoch: number
  train_loss: number
  val_loss: number
  /** Wall time the epoch took, reported by the trainer. */
  seconds?: number | null
  /** Optimizer LR used for this epoch. */
  learning_rate?: number | null
  /** Pixel accuracy on the training split (when reported). */
  train_accuracy?: number | null
  /** Pixel accuracy on the validation split (when reported). */
  val_accuracy?: number | null
  /** Metric snapshot at the end of the epoch (accuracy, precision, f1, iou…). */
  metrics?: Record<string, number | string | null> | null
}

export type TrainingMetrics = {
  accuracy?: number
  precision?: number
  recall?: number
  f1?: number
  iou?: number
  confusion_matrix?: number[][]
  class_names?: string[]
}

export type TrainingModelInfo = {
  model_id: string
  model_name: string
  model_version?: string
  training_dataset?: string
  sample_count?: number
  class_count?: number
  training_date?: string
  epochs?: number
  bands?: string[]
}

export type InferenceJobStatus = {
  status: string
  progress: number
  stage?: string
  error?: string | null
  result?: InferenceResult | null
}

export type InferenceResult = {
  geojson: GeoJSON.FeatureCollection
  mask_png?: string
  geotiff_base64?: string
  crs?: string
  bounds?: number[]
  transform?: number[]
  resolution?: number[]
  model_id?: string
  class_names?: string[]
  primary_class?: string
  count?: number
  output_type?: string
}

export class TrainingAiServiceError extends Error {
  readonly offline: boolean
  readonly status?: number
  constructor(message: string, opts?: { offline?: boolean; status?: number }) {
    super(message)
    this.name = 'TrainingAiServiceError'
    this.offline = Boolean(opts?.offline)
    this.status = opts?.status
  }
}

function offlineLike(raw: string): boolean {
  // Timeouts while the GIL is busy ≠ process down.
  if (/timed out|TimeoutError|service busy|poll timed out/i.test(raw)) return false
  return /offline|ECONNREFUSED|Could not reach|network/i.test(raw)
}

function transientLike(raw: string, status?: number): boolean {
  if (status === 504) return true
  return /timed out|TimeoutError|service busy|poll timed out|transient/i.test(raw)
}

/** Prefer friendly `error` over raw upstream `detail` (e.g. undici "fetch failed"). */
function userFacingError(json: Record<string, unknown>, fallback: string): string {
  const error = String(json.error || '').trim()
  const detail = String(json.detail || '').trim()
  const raw = error || detail || fallback
  if (isOfflineDetail(detail) || (/offline|ECONNREFUSED/i.test(raw) && !transientLike(raw))) {
    if (/inference/i.test(fallback)) {
      return 'Inference service offline (port 8095). Start segformer-detection and retry.'
    }
    return 'Training service offline (port 8095). Start segformer-detection and retry.'
  }
  if (transientLike(raw) || transientLike(detail)) {
    return error || 'Training service is busy. Retrying…'
  }
  if (offlineLike(raw) || offlineLike(detail)) {
    if (/inference/i.test(fallback)) {
      return 'Inference service offline (port 8095). Start segformer-detection and retry.'
    }
    return 'Training service offline (port 8095). Start segformer-detection and retry.'
  }
  if (/entity too large|payload too large|413/i.test(raw)) {
    return 'Training image is too large. Zoom in to a smaller AOI and retry.'
  }
  return raw
}

function isOfflineDetail(detail: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|connect ECONNREFUSED|getaddrinfo/i.test(detail)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

export async function fetchTrainingHealth(signal?: AbortSignal): Promise<{
  available: boolean
  training: boolean
  onnx: boolean
  error?: string
}> {
  try {
    // Prefer dedicated training health (avoids spectral-builtin "ok" masking offline :8095).
    const res = await fetch(apiUrl('/api/training/health'), { signal })
    const json = await readJson(res)
    // SPA HTML / wrong base path must not count as healthy.
    const looksLikeHealth =
      json &&
      typeof json === 'object' &&
      ('training' in json ||
        'model_ready' in json ||
        String(json.status || '') === 'ok' ||
        String(json.status || '') === 'busy')
    if ((res.ok || res.status === 503) && looksLikeHealth) {
      const training = Boolean(json.training) || String(json.status || '') === 'busy'
      return {
        available: Boolean(json.available) || String(json.status || '') === 'ok' || training,
        training,
        onnx: Boolean(json.onnx),
        error: training
          ? undefined
          : String(json.training_error || json.error || json.detail || 'Training service not ready.'),
      }
    }
    // Older Node without /api/training/health — fall back to segformer health.
    const res2 = await fetch(apiUrl('/api/segformer-detection/health'), { signal })
    const json2 = await readJson(res2)
    if (!res2.ok) {
      return {
        available: false,
        training: false,
        onnx: false,
        error: String(json2.error || json2.detail || `HTTP ${res2.status}`),
      }
    }
    const training = Boolean(json2.training)
    return {
      available: String(json2.status || '') === 'ok' || Boolean(json2.model_ready),
      training,
      onnx: Boolean(json2.onnx),
      error: training
        ? undefined
        : json2.training_error != null
          ? String(json2.training_error)
          : 'Training service not ready on :8095 — start segformer-detection.',
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return {
      available: false,
      training: false,
      onnx: false,
      error: 'SegFormer / Training service offline (port 8095).',
    }
  }
}

export type StartTrainingRequest = {
  samples: Array<{
    sample_id: string
    class_id: number
    class_name: string
    geometry: GeoJSON.Geometry
    geometry_type: string
    image_id?: string
    source?: string
    created_at?: string
  }>
  classes: Array<{ class_id: number; class_name: string; color?: string }>
  imageDataUrl: string
  bbox: [number, number, number, number]
  epochs?: number
  batch_size?: number
  learning_rate?: number
  val_split?: number
  model?: string
  /** Hugging Face / local encoder id for SegFormer fine-tune */
  encoder?: string
  bands?: string[]
  image_id?: string
  /** Optional tiling / TTA / NMS arguments (ignored by services that do not support them). */
  arguments?: InferenceArgumentsPayload
}

export async function startTrainingJob(
  body: StartTrainingRequest,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  let res: Response
  try {
    res = await fetch(`${TRAIN_BASE()}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TrainingAiServiceError('Could not reach the training service.', { offline: true })
  }
  const json = await readJson(res)
  if (!res.ok) {
    const msg = userFacingError(json, `Training start failed (HTTP ${res.status}).`)
    throw new TrainingAiServiceError(msg, {
      offline: offlineLike(msg) || (res.status === 502 && isOfflineDetail(String(json.detail || ''))),
      status: res.status,
    })
  }
  const jobId = String(json.job_id || json.jobId || '').trim()
  if (!jobId) throw new TrainingAiServiceError('Training service did not return a job_id.')
  return { jobId }
}

export async function fetchTrainingJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<TrainingJobStatus> {
  let res: Response
  try {
    res = await fetch(`${TRAIN_BASE()}/${encodeURIComponent(jobId)}`, { signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TrainingAiServiceError('Could not poll training job.', { offline: true })
  }
  const json = await readJson(res)
  if (!res.ok) {
    const msg = userFacingError(json, `Training poll failed (HTTP ${res.status}).`)
    const err = new TrainingAiServiceError(msg, {
      status: res.status,
      offline: offlineLike(msg) && !transientLike(msg, res.status),
    })
    ;(err as TrainingAiServiceError & { transient?: boolean }).transient =
      Boolean(json.transient) || transientLike(msg, res.status)
    throw err
  }
  return {
    status: String(json.status || 'running'),
    progress: Number(json.progress) || 0,
    epoch: json.epoch != null ? Number(json.epoch) : undefined,
    epochs: json.epochs != null ? Number(json.epochs) : undefined,
    train_loss: json.train_loss == null ? null : Number(json.train_loss),
    val_loss: json.val_loss == null ? null : Number(json.val_loss),
    stage: json.stage != null ? String(json.stage) : undefined,
    loss_history: Array.isArray(json.loss_history)
      ? (json.loss_history as TrainingJobStatus['loss_history'])
      : undefined,
    metrics: (json.metrics as TrainingMetrics) || null,
    model: (json.model as TrainingModelInfo) || null,
    error: json.error != null ? String(json.error) : null,
  }
}

export async function cancelTrainingJob(jobId: string, signal?: AbortSignal): Promise<void> {
  try {
    await fetch(`${TRAIN_BASE()}/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
  }
}

export type TrainingModelDetail = TrainingModelInfo & {
  loss_history?: TrainingEpochRecord[]
  learning_rate?: number
  train_loss?: number | null
  val_loss?: number | null
  final_metrics?: TrainingMetrics | null
}

export async function fetchTrainingModel(
  modelId: string,
  signal?: AbortSignal,
): Promise<TrainingModelDetail | null> {
  const id = String(modelId || '').trim()
  if (!id) return null
  try {
    const res = await fetch(`${TRAIN_BASE()}/models/${encodeURIComponent(id)}`, { signal })
    if (res.status === 404) return null
    const json = await readJson(res)
    if (!res.ok) return null
    const mid = String(json.model_id || id).trim()
    if (!mid) return null
    return {
      model_id: mid,
      model_name: String(json.model_name || 'SegFormer'),
      model_version: json.model_version != null ? String(json.model_version) : mid,
      training_date: json.training_date != null ? String(json.training_date) : undefined,
      epochs: json.epochs != null ? Number(json.epochs) : undefined,
      sample_count: json.sample_count != null ? Number(json.sample_count) : undefined,
      class_count: json.class_count != null ? Number(json.class_count) : undefined,
      learning_rate: json.learning_rate != null ? Number(json.learning_rate) : undefined,
      train_loss: json.train_loss == null ? null : Number(json.train_loss),
      val_loss: json.val_loss == null ? null : Number(json.val_loss),
      final_metrics: (json.final_metrics as TrainingMetrics) || null,
      loss_history: Array.isArray(json.loss_history)
        ? (json.loss_history as TrainingEpochRecord[])
        : undefined,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return null
  }
}

function parseModelSummary(raw: Record<string, unknown>): TrainingModelInfo | null {
  const mid = String(raw.model_id || '').trim()
  if (!mid) return null
  return {
    model_id: mid,
    model_name: String(raw.model_name || 'SegFormer'),
    model_version: raw.model_version != null ? String(raw.model_version) : mid,
    training_date: raw.training_date != null ? String(raw.training_date) : undefined,
    epochs: raw.epochs != null ? Number(raw.epochs) : undefined,
    sample_count: raw.sample_count != null ? Number(raw.sample_count) : undefined,
    class_count: raw.class_count != null ? Number(raw.class_count) : undefined,
  }
}

/** Checkpoints on :8095 via `/api/training/models` (newest first). */
export async function fetchTrainingModelList(signal?: AbortSignal): Promise<TrainingModelInfo[]> {
  try {
    const res = await fetch(`${TRAIN_BASE()}/models`, { signal })
    const json = await readJson(res)
    if (!res.ok) return []
    const models = Array.isArray(json.models) ? json.models : []
    const out: TrainingModelInfo[] = []
    for (const raw of models) {
      if (!raw || typeof raw !== 'object') continue
      const parsed = parseModelSummary(raw as Record<string, unknown>)
      if (parsed) out.push(parsed)
    }
    return out
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return []
  }
}

/** Pick the longest epoch curve; ties keep the first (newest) entry. */
export function pickLongestEpochHistory(
  histories: Array<TrainingEpochRecord[] | null | undefined>,
): TrainingEpochRecord[] {
  let best: TrainingEpochRecord[] = []
  for (const history of histories) {
    if (Array.isArray(history) && history.length > best.length) best = history
  }
  return best
}

/**
 * Longest saved epoch curve across all SegFormer checkpoints on :8095.
 * `models[0]` is only the newest run and may have a short/empty `loss_history`.
 */
export async function fetchBestEpochHistory(signal?: AbortSignal): Promise<TrainingEpochRecord[]> {
  const models = await fetchTrainingModelList(signal)
  if (!models.length) return []
  const histories = await Promise.all(
    models.map(async model => {
      const detail = await fetchTrainingModel(model.model_id, signal)
      return Array.isArray(detail?.loss_history) ? detail.loss_history : []
    }),
  )
  return pickLongestEpochHistory(histories)
}

/** Latest trained checkpoint’s real epoch curve (disk), if the trainer saved it. */
export async function fetchLatestEpochHistory(signal?: AbortSignal): Promise<TrainingEpochRecord[]> {
  const latest = await fetchLatestTrainingModel(signal)
  if (!latest?.model_id) return []
  const detail = await fetchTrainingModel(latest.model_id, signal)
  return Array.isArray(detail?.loss_history) ? detail!.loss_history! : []
}

export async function fetchLatestTrainingModel(signal?: AbortSignal): Promise<TrainingModelInfo | null> {
  const models = await fetchTrainingModelList(signal)
  return models[0] ?? null
}

export type StartInferenceRequest = {
  model_id: string
  imageDataUrl: string
  bbox: [number, number, number, number]
  confidence?: number
  output_type?: 'segmentation' | 'classification' | 'object_detection'
  classes?: Array<{ class_id: number; class_name: string; color?: string }>
  /** Optional tiling / TTA / NMS arguments (ignored by services that do not support them). */
  arguments?: InferenceArgumentsPayload
}

export async function startInferenceJob(
  body: StartInferenceRequest,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  let res: Response
  try {
    res = await fetch(`${INFER_BASE()}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TrainingAiServiceError('Unable to run inference. Check the model and imagery.', {
      offline: true,
    })
  }
  const json = await readJson(res)
  if (!res.ok) {
    const msg = userFacingError(
      json,
      'Unable to run inference. Check the model and imagery.',
    )
    throw new TrainingAiServiceError(msg, { status: res.status, offline: offlineLike(msg) })
  }
  const jobId = String(json.job_id || json.jobId || '').trim()
  if (!jobId) throw new TrainingAiServiceError('Inference service did not return a job_id.')
  return { jobId }
}

export async function fetchInferenceJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<InferenceJobStatus> {
  let res: Response
  try {
    res = await fetch(`${INFER_BASE()}/${encodeURIComponent(jobId)}`, { signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TrainingAiServiceError('Could not poll inference job.', { offline: true })
  }
  const json = await readJson(res)
  if (!res.ok) {
    const msg = userFacingError(json, `Inference poll failed (HTTP ${res.status}).`)
    const err = new TrainingAiServiceError(msg, {
      status: res.status,
      offline: offlineLike(msg) && !transientLike(msg, res.status),
    })
    ;(err as TrainingAiServiceError & { transient?: boolean }).transient =
      Boolean(json.transient) || transientLike(msg, res.status)
    throw err
  }
  return {
    status: String(json.status || 'running'),
    progress: Number(json.progress) || 0,
    stage: json.stage != null ? String(json.stage) : undefined,
    error: json.error != null ? String(json.error) : null,
    result: (json.result as InferenceResult) || null,
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export async function pollTrainingJob(
  jobId: string,
  opts?: {
    signal?: AbortSignal
    onProgress?: (job: TrainingJobStatus) => void
    intervalMs?: number
    timeoutMs?: number
  },
): Promise<TrainingJobStatus> {
  const start = Date.now()
  const timeout = opts?.timeoutMs ?? 60 * 60 * 1000
  let consecutiveTransient = 0
  while (Date.now() - start < timeout) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const job = await fetchTrainingJob(jobId, opts?.signal)
      consecutiveTransient = 0
      opts?.onProgress?.(job)
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return job
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      const transient =
        Boolean((err as { transient?: boolean })?.transient) ||
        transientLike((err as Error)?.message || '', (err as TrainingAiServiceError).status)
      if (transient) {
        consecutiveTransient += 1
        if (consecutiveTransient <= 45) {
          opts?.onProgress?.({
            status: 'running',
            progress: 0,
            stage: 'busy',
            error: null,
          })
          await sleep(opts?.intervalMs ?? 2000, opts?.signal)
          continue
        }
      }
      throw err
    }
    await sleep(opts?.intervalMs ?? 1000, opts?.signal)
  }
  throw new TrainingAiServiceError('Timed out waiting for training job.')
}

export async function pollInferenceJob(
  jobId: string,
  opts?: {
    signal?: AbortSignal
    onProgress?: (job: InferenceJobStatus) => void
    intervalMs?: number
    timeoutMs?: number
  },
): Promise<InferenceJobStatus> {
  const start = Date.now()
  const timeout = opts?.timeoutMs ?? 30 * 60 * 1000
  let consecutiveTransient = 0
  while (Date.now() - start < timeout) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const job = await fetchInferenceJob(jobId, opts?.signal)
      consecutiveTransient = 0
      opts?.onProgress?.(job)
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return job
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      const transient =
        Boolean((err as { transient?: boolean })?.transient) ||
        transientLike((err as Error)?.message || '', (err as TrainingAiServiceError).status)
      if (transient && consecutiveTransient < 30) {
        consecutiveTransient += 1
        await sleep(opts?.intervalMs ?? 2000, opts?.signal)
        continue
      }
      throw err
    }
    await sleep(opts?.intervalMs ?? 1000, opts?.signal)
  }
  throw new TrainingAiServiceError('Timed out waiting for inference job.')
}

/** Overfitting heuristic from real loss history. */
export function detectOverfitting(
  history: Array<{ train_loss: number; val_loss: number }> | undefined,
  window = 3,
): boolean {
  if (!history || history.length < window + 1) return false
  const recent = history.slice(-window)
  const prev = history[history.length - window - 1]
  if (!prev) return false
  const trainDown = recent.every((r, i) => {
    const before = i === 0 ? prev : recent[i - 1]!
    return r.train_loss <= before.train_loss + 1e-9
  })
  const valUp =
    recent[recent.length - 1]!.val_loss > prev.val_loss * 1.08 &&
    recent[recent.length - 1]!.val_loss > recent[0]!.val_loss
  return trainDown && valUp
}
