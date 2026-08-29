/**
 * Persist per-AOI FTW training sessions in localStorage.
 */

import {
  emptyFtwAoiSession,
  type FtwAoiTrainingSession,
} from './ftwAoiTrainingTypes'

const STORAGE_KEY = 'agrocloud.ftwAoiTraining.v1'

export const FTW_AOI_TRAINING_CHANGED_EVENT = 'agrocloud:ftw-aoi-training-changed'

type Store = Record<string, FtwAoiTrainingSession>

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
    window.dispatchEvent(new CustomEvent(FTW_AOI_TRAINING_CHANGED_EVENT))
  } catch {
    /* quota */
  }
}

export function loadFtwAoiSession(aoiKey: string, aoiLabel?: string): FtwAoiTrainingSession {
  if (!aoiKey) return emptyFtwAoiSession('', aoiLabel || 'AOI')
  const store = readStore()
  const hit = store[aoiKey]
  if (!hit) return emptyFtwAoiSession(aoiKey, aoiLabel || 'AOI')
  return { ...emptyFtwAoiSession(aoiKey, aoiLabel || hit.aoiLabel), ...hit, aoiKey }
}

export function saveFtwAoiSession(session: FtwAoiTrainingSession): void {
  if (!session.aoiKey) return
  const store = readStore()
  store[session.aoiKey] = { ...session, updatedAt: new Date().toISOString() }
  writeStore(store)
}

export function listFtwAoiSessionKeys(): string[] {
  return Object.keys(readStore())
}

export function listFtwAoiSessions(): FtwAoiTrainingSession[] {
  return Object.values(readStore())
    .map(hit => ({ ...emptyFtwAoiSession(hit.aoiKey, hit.aoiLabel), ...hit, aoiKey: hit.aoiKey }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}
