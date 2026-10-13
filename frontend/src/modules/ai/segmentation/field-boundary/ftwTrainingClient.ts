/**
 * FTW AOI-scoped training — dataset sample, LR finder, train, export.
 */

import { apiUrl } from '@/core/api/apiOrigin'
import type {
  FtwDatasetSampleResponse,
  FtwLrFinderResult,
  FtwTrainingModelInfo,
} from './ftwAoiTrainingTypes'
import type { TrainingEpochRecord } from '../../training/trainingAiClient'
import {
  isFtwLocalBuiltinJobId,
  localCancelFtwTrainingJob,
  localExportFtwModel,
  localGetFtwTrainingJob,
  localSampleFtwDataset,
  localStartFtwLrFinder,
  localStartFtwTrain,
} from './ftwTrainingLocalBuiltin'

const BASE = () => apiUrl('/api/ftw-training')

/** When the remote API is missing or errors, run the same workflow in-browser. */
export function shouldFtwTrainingUseLocalFallback(err: FtwTrainingServiceError): boolean {
  if (err.offline) return true
  const s = err.status
  return s === 404 || s === 405 || s === 500 || s === 502 || s === 503
}

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
  try {
    const json = await getJson<FtwTrainingHealth>('/health')
    return {
      available: Boolean(json.available ?? json.training ?? true),
      training: Boolean(json.training ?? json.available ?? true),
      engine: json.engine as string | undefined,
      builtin_fallback: Boolean(json.builtin_fallback),
    }
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      return {
        available: true,
        training: true,
        engine: 'ftw-training-local',
        builtin_fallback: true,
      }
    }
    throw err
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
  try {
    return await postJson<FtwDatasetSampleResponse>('/dataset/sample', body)
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      return localSampleFtwDataset(body)
    }
    throw err
  }
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
  try {
    return await postJson<{ job_id: string }>('/lr-finder/start', body)
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      return { job_id: localStartFtwLrFinder(body) }
    }
    throw err
  }
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
  try {
    return await postJson<{ job_id: string }>('/train/start', body)
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      const job_id = await localStartFtwTrain(body)
      return { job_id }
    }
    throw err
  }
}

export async function fetchFtwTrainingJob(jobId: string): Promise<FtwTrainingJobResponse> {
  if (isFtwLocalBuiltinJobId(jobId)) {
    const local = localGetFtwTrainingJob(jobId)
    if (local) return local
  }
  try {
    return await getJson<FtwTrainingJobResponse>(`/${encodeURIComponent(jobId)}`)
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      const local = localGetFtwTrainingJob(jobId)
      if (local) return local
    }
    throw err
  }
}

export async function cancelFtwTrainingJob(jobId: string): Promise<void> {
  if (isFtwLocalBuiltinJobId(jobId)) {
    localCancelFtwTrainingJob(jobId)
    return
  }
  try {
    await postJson('/' + encodeURIComponent(jobId) + '/cancel', {})
  } catch (err) {
    if (err instanceof FtwTrainingServiceError && shouldFtwTrainingUseLocalFallback(err)) {
      localCancelFtwTrainingJob(jobId)
      return
    }
    throw err
  }
}

export function downloadFtwModelExport(jobId: string): boolean {
  const payload = localExportFtwModel(jobId)
  if (!payload) return false
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ftw-aoi-model-${jobId.slice(0, 16)}.json`
  a.click()
  URL.revokeObjectURL(url)
  return true
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
