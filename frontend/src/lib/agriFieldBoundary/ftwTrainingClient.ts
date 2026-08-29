/**
 * FTW AOI-scoped training — dataset sample, LR finder, train, export.
 */

import { apiUrl } from '../apiOrigin'
import type {
  FtwDatasetSampleResponse,
  FtwLrFinderResult,
  FtwTrainingModelInfo,
} from './ftwAoiTrainingTypes'
import type { TrainingEpochRecord } from '../trainingAi/trainingAiClient'

const BASE = () => apiUrl('/api/ftw-training')

export type FtwTrainingHealth = {
  available: boolean
  training: boolean
  engine?: string
  builtin_fallback?: boolean
}

export type FtwTrainingJobResponse = {
  job_id: string
  status: string
  progress?: number
  epoch?: number
  epochs?: number
  train_loss?: number | null
  val_loss?: number | null
  stage?: string
  error?: string | null
  loss_history?: TrainingEpochRecord[]
  metrics?: {
    iou?: number
    f1?: number
    accuracy?: number
  } | null
  optimal_lr?: number
  lrs?: number[]
  losses?: number[]
  model?: { model_id?: string; model_name?: string } | null
  dataset?: FtwDatasetSampleResponse | null
}

export class FtwTrainingServiceError extends Error {
  readonly offline: boolean
  readonly status?: number
  constructor(message: string, opts?: { offline?: boolean; status?: number }) {
    super(message)
    this.name = 'FtwTrainingServiceError'
    this.offline = Boolean(opts?.offline)
    this.status = opts?.status
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new FtwTrainingServiceError('FTW training service returned invalid JSON.', {
      status: res.status,
    })
  }
}

function offlineLike(msg: string): boolean {
  return /offline|ECONNREFUSED|Could not reach|network/i.test(msg)
}

async function postJson<T extends Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new FtwTrainingServiceError(String((err as Error)?.message || err), { offline: true })
  }
  const json = (await parseJson(res)) as T & { error?: string; detail?: string }
  if (!res.ok) {
    const msg = String(json.error || json.detail || `HTTP ${res.status}`)
    throw new FtwTrainingServiceError(msg, { offline: offlineLike(msg), status: res.status })
  }
  return json
}

async function getJson<T extends Record<string, unknown>>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE()}${path}`)
  } catch (err) {
    throw new FtwTrainingServiceError(String((err as Error)?.message || err), { offline: true })
  }
  const json = (await parseJson(res)) as T & { error?: string; detail?: string }
  if (!res.ok) {
    const msg = String(json.error || json.detail || `HTTP ${res.status}`)
    throw new FtwTrainingServiceError(msg, { offline: offlineLike(msg), status: res.status })
  }
  return json
}

export async function fetchFtwTrainingHealth(): Promise<FtwTrainingHealth> {
  const json = await getJson<FtwTrainingHealth>('/health')
  return {
    available: Boolean(json.available ?? json.training ?? true),
    training: Boolean(json.training ?? json.available ?? true),
    engine: json.engine as string | undefined,
    builtin_fallback: Boolean(json.builtin_fallback),
  }
}

export type SampleFtwDatasetRequest = {
  aoi_key: string
  aoi_label?: string
  aoi: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry
  bbox: [number, number, number, number]
  area_ha?: number
  year?: number
  val_split?: number
  test_split?: number
}

export async function sampleFtwDataset(body: SampleFtwDatasetRequest): Promise<FtwDatasetSampleResponse> {
  const json = await postJson<FtwDatasetSampleResponse>('/dataset/sample', body)
  return json
}

export type StartLrFinderRequest = {
  dataset_id: string
  aoi_key: string
  model?: FtwTrainingModelInfo
  min_lr?: number
  max_lr?: number
  batch_size?: number
}

export async function startFtwLrFinder(body: StartLrFinderRequest): Promise<{ job_id: string }> {
  return postJson<{ job_id: string }>('/lr-finder/start', body)
}

export type StartFtwTrainingRequest = {
  dataset_id: string
  aoi_key: string
  learning_rate: number
  epochs?: number
  model?: FtwTrainingModelInfo
  scheduler?: 'onecycle' | 'cosine' | 'none'
}

export async function startFtwTraining(body: StartFtwTrainingRequest): Promise<{ job_id: string }> {
  return postJson<{ job_id: string }>('/train/start', body)
}

export async function fetchFtwTrainingJob(jobId: string): Promise<FtwTrainingJobResponse> {
  return getJson<FtwTrainingJobResponse>(`/${encodeURIComponent(jobId)}`)
}

export async function cancelFtwTrainingJob(jobId: string): Promise<void> {
  await postJson('/' + encodeURIComponent(jobId) + '/cancel', {})
}

export function lrFinderFromJob(job: FtwTrainingJobResponse): FtwLrFinderResult | null {
  if (!job.lrs?.length || !job.losses?.length) return null
  return {
    lrs: job.lrs,
    losses: job.losses,
    optimal_lr: Number(job.optimal_lr ?? job.lrs[Math.floor(job.lrs.length * 0.35)] ?? 3.7e-4),
    status:
      job.status === 'done'
        ? 'done'
        : job.status === 'error'
          ? 'error'
          : job.status === 'running' || job.status === 'queued'
            ? 'running'
            : 'idle',
    error: job.error ?? null,
  }
}

export function exportFtwModelUrl(jobId: string): string {
  return `${BASE()}/${encodeURIComponent(jobId)}/export`
}
