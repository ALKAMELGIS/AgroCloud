/**
 * Persist last Training & AI model so Infer survives panel remount / refresh.
 * Also keeps the last epoch loss history for the Validate → Epochs Details table.
 */

import type { TrainingEpochRecord, TrainingModelInfo } from './trainingAiClient'
import { normalizeEpochHistory } from './analyzeTrainingHistory'

const STORAGE_KEY = 'agrocloud.trainingAi.lastModel.v1'
const EPOCH_HISTORY_KEY = 'agrocloud.trainingAi.lastEpochHistory.v1'
/** Same-tab signal so Validate refreshes as soon as Train finishes. */
export const EPOCH_HISTORY_CHANGED_EVENT = 'agrocloud:training-epoch-history'

export type PersistedTrainingModel = {
  model_id: string
  model_name: string
  model_version?: string
  training_date?: string
  epochs?: number
  sample_count?: number
  class_count?: number
  saved_at: string
}

export function loadPersistedTrainingModel(): PersistedTrainingModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedTrainingModel
    if (!parsed?.model_id || typeof parsed.model_id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function savePersistedTrainingModel(info: TrainingModelInfo | PersistedTrainingModel): void {
  const payload: PersistedTrainingModel = {
    model_id: info.model_id,
    model_name: info.model_name || 'SegFormer',
    model_version: info.model_version || info.model_id,
    training_date: info.training_date,
    epochs: info.epochs,
    sample_count: info.sample_count,
    class_count: info.class_count,
    saved_at: new Date().toISOString(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearPersistedTrainingModel(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function savePersistedEpochHistory(rows: TrainingEpochRecord[] | null | undefined): void {
  const normalized = normalizeEpochHistory(rows)
  if (!normalized.length) return
  try {
    const prevRaw = localStorage.getItem(EPOCH_HISTORY_KEY)
    const nextRaw = JSON.stringify({
      saved_at: new Date().toISOString(),
      rows: normalized,
    })
    // Skip no-op writes so Validate's hydrate path cannot event-loop.
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw) as { rows?: TrainingEpochRecord[] }
        const prevNorm = normalizeEpochHistory(prev?.rows)
        if (
          prevNorm.length === normalized.length &&
          JSON.stringify(prevNorm) === JSON.stringify(normalized)
        ) {
          return
        }
      } catch {
        /* replace corrupt payload */
      }
    }
    localStorage.setItem(EPOCH_HISTORY_KEY, nextRaw)
    window.dispatchEvent(
      new CustomEvent(EPOCH_HISTORY_CHANGED_EVENT, { detail: { rows: normalized } }),
    )
  } catch {
    // Quota / private mode — ignore
  }
}

export function loadPersistedEpochHistory(): TrainingEpochRecord[] {
  try {
    const raw = localStorage.getItem(EPOCH_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { rows?: TrainingEpochRecord[] }
    return normalizeEpochHistory(Array.isArray(parsed?.rows) ? parsed.rows : [])
  } catch {
    return []
  }
}
