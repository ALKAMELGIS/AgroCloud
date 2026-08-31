/**
 * Persist per-AOI training analytics (epoch curves, LR finder, dataset split).
 * Each AOI keeps an independent chart bundle in localStorage.
 */

import type { FtwDatasetSplit } from './ftwAoiTrainingTypes'
import type { TrainingEpochRecord } from '../trainingAi/trainingAiClient'
import { normalizeEpochHistory } from '../trainingAi/analyzeTrainingHistory'

const STORAGE_KEY = 'agrocloud.aoiTrainingAnalytics.v1'

export const AOI_TRAINING_ANALYTICS_CHANGED_EVENT = 'agrocloud:aoi-training-analytics-changed'

export type AoiLrFinderSnapshot = {
  lrs: number[]
  losses: number[]
  optimal_lr: number | null
}

export type AoiTrainingAnalytics = {
  aoiKey: string
  aoiLabel: string
  epochHistory: TrainingEpochRecord[]
  lrFinder?: AoiLrFinderSnapshot | null
  dataset?: FtwDatasetSplit | null
  updatedAt: string
}

type Store = Record<string, AoiTrainingAnalytics>

function readStore(): Store {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    window.dispatchEvent(new CustomEvent(AOI_TRAINING_ANALYTICS_CHANGED_EVENT))
  } catch {
    /* quota */
  }
}

export function loadAoiTrainingAnalytics(aoiKey: string): AoiTrainingAnalytics | null {
  if (!aoiKey) return null
  const hit = readStore()[aoiKey]
  if (!hit) return null
  return {
    ...hit,
    epochHistory: normalizeEpochHistory(hit.epochHistory),
  }
}

export function saveAoiTrainingAnalytics(data: AoiTrainingAnalytics): void {
  if (!data.aoiKey) return
  const store = readStore()
  store[data.aoiKey] = {
    ...data,
    epochHistory: normalizeEpochHistory(data.epochHistory),
    updatedAt: new Date().toISOString(),
  }
  writeStore(store)
}

export function listAoiTrainingAnalytics(): AoiTrainingAnalytics[] {
  return Object.values(readStore())
    .map(row => ({
      ...row,
      epochHistory: normalizeEpochHistory(row.epochHistory),
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function isAoiTrainingAnalyticsChartable(row: AoiTrainingAnalytics): boolean {
  if (row.epochHistory?.length) return true
  if ((row.dataset?.total ?? 0) > 0) return true
  return false
}

export function pruneStaleAoiTrainingAnalytics(keepKeys: string[] = []): void {
  const store = readStore()
  const keep = new Set(keepKeys.filter(Boolean))
  let changed = false
  for (const key of Object.keys(store)) {
    if (keep.has(key)) continue
    const row = {
      ...store[key]!,
      epochHistory: normalizeEpochHistory(store[key]!.epochHistory),
    }
    if (!isAoiTrainingAnalyticsChartable(row)) {
      delete store[key]
      changed = true
    }
  }
  if (changed) writeStore(store)
}

export function listChartableAoiTrainingAnalytics(activeKey?: string): AoiTrainingAnalytics[] {
  return listAoiTrainingAnalytics().filter(
    row => isAoiTrainingAnalyticsChartable(row) || (activeKey != null && row.aoiKey === activeKey),
  )
}

export function listAoiTrainingAnalyticsKeys(): string[] {
  return Object.keys(readStore())
}
