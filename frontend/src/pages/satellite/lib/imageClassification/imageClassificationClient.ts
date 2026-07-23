/**
 * Client for the Image Classification Wizard backend (Node proxy → FastAPI ML service).
 *
 * Step 1 only surfaces the `/config` endpoint (health + supported classifiers/segmenters).
 * ML endpoints (segment / train / classify / accuracy) are added in later steps.
 */
import { apiUrl } from '@/lib/apiOrigin'

export type ImageClassificationClassifier = {
  id: string
  label: string
  /** True when the classifier requires labelled training samples. */
  supervised: boolean
}

export type ImageClassificationConfig = {
  /** True when the FastAPI ML service is reachable and ready. */
  configured: boolean
  service: string
  version?: string | null
  classifiers: ImageClassificationClassifier[]
  segmenters: string[]
  /** Human-readable reason shown when the service is offline / misconfigured. */
  hint?: string | null
}

/** Fetch the ML service capabilities. Throws on network/HTTP error so callers can mark "offline". */
export async function fetchImageClassificationConfig(
  signal?: AbortSignal,
): Promise<ImageClassificationConfig> {
  const res = await fetch(apiUrl('/api/image-classification/config'), { signal })
  if (!res.ok) throw new Error(`Image classification config failed (${res.status})`)
  return (await res.json()) as ImageClassificationConfig
}

// ── Segmentation (Step 2) ─────────────────────────────────────────────────────
export type SegmentationAlgorithm = 'slic' | 'felzenszwalb'

export type SegmentationParams = {
  rasterId: string
  algorithm: SegmentationAlgorithm
  /** 1–20 — higher follows spectral edges more closely. */
  spectralDetail: number
  /** 1–20 — higher yields more, smaller segments. */
  spatialDetail: number
  /** Minimum segment size in pixels. */
  minSegmentSize: number
}

/** Result payload returned by the FastAPI `/segment` endpoint (snake_case from Python). */
export type SegmentationResult = {
  segmentation_id: string
  algorithm: SegmentationAlgorithm
  segment_count: number
  boundary_count: number
  boundaries: GeoJSON.FeatureCollection
  bounds: [number, number, number, number]
  labeled_raster_path: string | null
  preview_size: { width: number; height: number }
  params: { spectral_detail: number; spatial_detail: number; min_segment_size: number }
}

export type ImageClassificationJob = {
  id: string
  kind: string
  status: 'queued' | 'running' | 'pending' | 'done' | 'error' | string
  progress: number
  message: string
  result: unknown
  error: string | null
}

const JOB_POLL_MS = 1200
const JOB_TIMEOUT_MS = 5 * 60 * 1000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Kick off a segmentation job; returns the job id to poll. */
export async function startSegmentation(params: SegmentationParams): Promise<string> {
  const res = await fetch(apiUrl('/api/image-classification/segment'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (res.status !== 202) {
    let detail = `Failed to start segmentation (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const body = (await res.json()) as { jobId: string }
  if (!body.jobId) throw new Error('Segmentation job id missing from response.')
  return body.jobId
}

export async function fetchImageClassificationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<ImageClassificationJob> {
  const res = await fetch(apiUrl(`/api/image-classification/jobs/${jobId}`), { signal })
  if (!res.ok) throw new Error(`Job status failed (${res.status})`)
  return (await res.json()) as ImageClassificationJob
}

/** Start a segmentation job and poll until it finishes; resolves with the segmentation result. */
export async function runSegmentation(
  params: SegmentationParams,
  opts?: { signal?: AbortSignal; onStatus?: (message: string, progress: number) => void },
): Promise<SegmentationResult> {
  const jobId = await startSegmentation(params)
  return pollJobResult<SegmentationResult>(jobId, 'Segmentation', opts)
}

// ── Train + Classify (Steps 4-5) ─────────────────────────────────────────────
export type IcwClassifier = 'random_forest' | 'knn' | 'svm_rbf' | 'gaussian_nb' | 'kmeans'

/** Training sample in the shape the FastAPI service expects (snake_case). */
export type TrainingSamplePayload = {
  class_name: string
  class_value: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/** Class schema item in the shape the FastAPI service expects (snake_case). */
export type ClassSchemaPayload = {
  class_name: string
  class_value: number
  color?: string
}

export type TrainParams = {
  rasterId: string
  classifier: IcwClassifier
  nEstimators?: number
  nClusters?: number
  maxSamplesPerClass?: number
  samples: TrainingSamplePayload[]
  classes: ClassSchemaPayload[]
}

export type TrainResult = {
  model_id: string
  classifier: IcwClassifier
  band_count: number
  n_training_pixels: number
  class_counts: Record<string, number>
  train_accuracy: number | null
  feature_importances: number[] | null
}

export type ClassifyParams = {
  rasterId: string
  modelId: string
  classes: ClassSchemaPayload[]
  maxPreviewDim?: number
}

export type ClassDistributionItem = {
  value: number
  name: string
  color: string
  count: number
  pct: number
}

export type ClassifyResult = {
  model_id: string
  image_base64: string
  bounds: [number, number, number, number]
  width: number
  height: number
  class_distribution: ClassDistributionItem[]
  labeled_raster_path: string | null
}

/** Generic: poll a started job until it resolves, throwing on error/timeout. */
async function pollJobResult<T>(
  jobId: string,
  label: string,
  opts?: { signal?: AbortSignal; onStatus?: (message: string, progress: number) => void },
): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < JOB_TIMEOUT_MS) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await fetchImageClassificationJob(jobId, opts?.signal)
    opts?.onStatus?.(job.message, job.progress)
    if (job.status === 'done') return job.result as T
    if (job.status === 'error') throw new Error(job.error || job.message || `${label} failed`)
    await sleep(JOB_POLL_MS)
  }
  throw new Error(`Timed out waiting for ${label.toLowerCase()} to complete`)
}

async function startJob(path: string, params: unknown, label: string): Promise<string> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (res.status !== 202) {
    let detail = `Failed to start ${label.toLowerCase()} (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const body = (await res.json()) as { jobId: string }
  if (!body.jobId) throw new Error(`${label} job id missing from response.`)
  return body.jobId
}

/** Fit a classifier from training samples and poll until the model is ready. */
export async function runTraining(
  params: TrainParams,
  opts?: { signal?: AbortSignal; onStatus?: (message: string, progress: number) => void },
): Promise<TrainResult> {
  const jobId = await startJob('/api/image-classification/train', params, 'Training')
  return pollJobResult<TrainResult>(jobId, 'Training', opts)
}

/** Classify the full raster with a trained model; resolves with the overlay + stats. */
export async function runClassification(
  params: ClassifyParams,
  opts?: { signal?: AbortSignal; onStatus?: (message: string, progress: number) => void },
): Promise<ClassifyResult> {
  const jobId = await startJob('/api/image-classification/classify', params, 'Classification')
  return pollJobResult<ClassifyResult>(jobId, 'Classification', opts)
}

// ── Assign / merge clusters (Step 6, unsupervised) ───────────────────────────
export type ClassAssignment = {
  from: number
  to: number
  name: string
  color?: string
}

export type AssignParams = {
  rasterId: string
  modelId: string
  assignments: ClassAssignment[]
}

/** Remap unsupervised cluster ids to named classes (shared target = merge). */
export async function runAssignClasses(params: AssignParams): Promise<ClassifyResult> {
  return postJson<ClassifyResult>('/api/image-classification/assign', params, 'Class assignment')
}

// ── Accuracy assessment (Step 7) ─────────────────────────────────────────────
export type AccuracyClassLabel = { value: number; name: string; color: string }

export type AccuracyPerClass = {
  value: number
  name: string
  color: string
  reference_total: number
  classified_total: number
  correct: number
  producers_accuracy: number
  users_accuracy: number
}

export type AccuracyReport = {
  labels: AccuracyClassLabel[]
  matrix: number[][]
  overall_accuracy: number
  kappa: number | null
  n_points: number
  n_used: number
  per_class: AccuracyPerClass[]
}

export type CheckPointsResult = GeoJSON.FeatureCollection & { count: number; method: string }

export type AccuracyParams = {
  rasterId: string
  modelId: string
  referencePoints: GeoJSON.Feature[]
  classes: ClassSchemaPayload[]
}

export type CheckPointsParams = {
  rasterId: string
  modelId: string
  method: 'stratified' | 'equalized'
  count: number
  classes: ClassSchemaPayload[]
}

/** POST helper for the synchronous accuracy endpoints (returns JSON directly, no polling). */
async function postJson<T>(path: string, params: unknown, label: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    let detail = `${label} failed (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

/** Compare ground-truth reference points to the classified raster → confusion matrix + kappa. */
export async function runAccuracy(params: AccuracyParams): Promise<AccuracyReport> {
  return postJson<AccuracyReport>('/api/image-classification/accuracy', params, 'Accuracy assessment')
}

/** Generate stratified/equalized random verification points over the classified raster. */
export async function generateCheckPoints(params: CheckPointsParams): Promise<CheckPointsResult> {
  return postJson<CheckPointsResult>(
    '/api/image-classification/accuracy/points',
    params,
    'Check-point generation',
  )
}
