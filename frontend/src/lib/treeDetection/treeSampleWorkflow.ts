/**
 * Tree Training Samples helpers — Tree / Non-Tree counts, fingerprint for
 * model freshness, and a transparent sample spatial adapter used after
 * pretrained inference when workflow mode is "train-from-samples".
 *
 * Never invents tree polygons. Adapter only filters/suppresses detections
 * using the user's samples; full YOLO weight updates go through the
 * tree-detection /finetune endpoint when available.
 */

import type { TrainingSample } from '../trainingAi/trainingSampleStore'
import type { TreeDetection } from './treeDetectionEngine'

export const TREE_CLASS_ID = 6
export const NON_TREE_CLASS_ID = 10
export const TREE_CLASS_NAME = 'Tree'
export const NON_TREE_CLASS_NAME = 'Non-Tree'

export type TreeWorkflowMode = 'pretrained' | 'train-from-samples'

export type TreeOutputGeometry = 'crown-square' | 'point'

export type TreeModelTrainStatus =
  | 'pretrained'
  | 'trained'
  | 'samples-changed'
  | 'never-trained'

export type TreeSampleCounts = {
  tree: number
  nonTree: number
  total: number
}

export type TreeModelRecord = {
  modelName: string
  modelVersion: string
  sampleFingerprint: string
  treeCount: number
  nonTreeCount: number
  trainedAt: string | null
  lastInferenceAt: string | null
  /** ultralytics checkpoint id when server fine-tune succeeded */
  checkpointId: string | null
  trainKind: 'none' | 'sample-adapter' | 'yolo-finetune'
}

const EARTH_RADIUS_M = 6378137

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function isTreeClassName(name: string | null | undefined): boolean {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return false
  if (/non[-_\s]?tree/.test(n)) return false
  return n === 'tree' || n === 'trees' || /(^|[\s_-])tree([\s_-]|$)/.test(n)
}

export function isNonTreeClassName(name: string | null | undefined): boolean {
  const n = String(name || '').trim().toLowerCase()
  return /non[-_\s]?tree/.test(n) || n === 'background' || n === 'not tree'
}

export function countTreeTrainingSamples(samples: TrainingSample[]): TreeSampleCounts {
  let tree = 0
  let nonTree = 0
  for (const s of samples) {
    if (isNonTreeClassName(s.class_name) || s.class_id === NON_TREE_CLASS_ID) nonTree += 1
    else if (isTreeClassName(s.class_name) || s.class_id === TREE_CLASS_ID) tree += 1
  }
  return { tree, nonTree, total: tree + nonTree }
}

/** Stable fingerprint of Tree / Non-Tree geometries + class for staleness checks. */
export function fingerprintTreeSamples(samples: TrainingSample[]): string {
  const rows = samples
    .filter(
      s =>
        isTreeClassName(s.class_name) ||
        isNonTreeClassName(s.class_name) ||
        s.class_id === TREE_CLASS_ID ||
        s.class_id === NON_TREE_CLASS_ID,
    )
    .map(s => {
      let geomKey = ''
      try {
        geomKey = JSON.stringify(s.geometry, (_k, v) =>
          typeof v === 'number' ? Number(v.toFixed(6)) : v,
        )
      } catch {
        geomKey = s.sample_id
      }
      return `${s.sample_id}|${s.class_id}|${s.class_name}|${geomKey}`
    })
    .sort()
  // Lightweight FNV-1a style hash
  let h = 2166136261
  const str = rows.join('\n')
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `ts-${(h >>> 0).toString(16)}-${rows.length}`
}

export function resolveTrainStatus(
  mode: TreeWorkflowMode,
  model: TreeModelRecord | null,
  currentFingerprint: string,
): TreeModelTrainStatus {
  if (mode === 'pretrained') return 'pretrained'
  if (!model || model.trainKind === 'none' || !model.trainedAt) return 'never-trained'
  if (model.sampleFingerprint !== currentFingerprint) return 'samples-changed'
  return 'trained'
}

export function canRunSampleTrainedDetect(status: TreeModelTrainStatus): boolean {
  return status === 'trained'
}

/** Minimum Tree samples required before Train Model is enabled. */
export const MIN_TREE_SAMPLES_TO_TRAIN = 5

export function canTrainFromSamples(counts: TreeSampleCounts): boolean {
  return counts.tree >= MIN_TREE_SAMPLES_TO_TRAIN
}

function sampleCentroid(s: TrainingSample): [number, number] | null {
  const g = s.geometry
  if (!g) return null
  if (g.type === 'Point') {
    return [g.coordinates[0] as number, g.coordinates[1] as number]
  }
  if (g.type === 'Polygon' && g.coordinates[0]?.length) {
    const ring = g.coordinates[0]
    let sx = 0
    let sy = 0
    const n = Math.max(1, ring.length - 1)
    for (let i = 0; i < n; i += 1) {
      sx += ring[i]![0]!
      sy += ring[i]![1]!
    }
    return [sx / n, sy / n]
  }
  if (g.type === 'MultiPolygon' && g.coordinates[0]?.[0]?.length) {
    const ring = g.coordinates[0][0]
    let sx = 0
    let sy = 0
    const n = Math.max(1, ring.length - 1)
    for (let i = 0; i < n; i += 1) {
      sx += ring[i]![0]!
      sy += ring[i]![1]!
    }
    return [sx / n, sy / n]
  }
  return null
}

/**
 * After pretrained/YOLO inference, suppress detections that sit on Non-Tree
 * samples and prefer keeping those near Tree samples. Does not invent features.
 */
export function applySampleSpatialAdapter(
  detections: TreeDetection[],
  samples: TrainingSample[],
  opts?: { nonTreeSuppressM?: number },
): TreeDetection[] {
  const suppressM = opts?.nonTreeSuppressM ?? 4
  const nonTreePts: Array<[number, number]> = []
  for (const s of samples) {
    if (!(isNonTreeClassName(s.class_name) || s.class_id === NON_TREE_CLASS_ID)) continue
    const c = sampleCentroid(s)
    if (c) nonTreePts.push(c)
  }
  if (!nonTreePts.length) return detections
  return detections.filter(d => {
    for (const [lng, lat] of nonTreePts) {
      if (haversineM(d.lng, d.lat, lng, lat) <= suppressM) return false
    }
    return true
  })
}

export function nextModelVersion(prev: string | null | undefined): string {
  const m = String(prev || '').match(/v(\d+)/i)
  const n = m ? Number(m[1]) + 1 : 1
  return `v${String(Math.max(1, n)).padStart(2, '0')}`
}
