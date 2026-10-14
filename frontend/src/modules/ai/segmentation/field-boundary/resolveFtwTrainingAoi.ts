import * as turf from '@turf/turf'
import type { SiActiveAoi } from '@/modules/remote-sensing/imagery/siAoiManager'
import { aoiSourceLabel } from '../../training/clipResultsToAoi'

const EMPTY_AOI: SiActiveAoi = { geometry: null, key: '', source: null }

export function isUsableSiActiveAoi(aoi: SiActiveAoi | null | undefined): aoi is SiActiveAoi {
  if (!aoi?.key?.trim()) return false
  const fc = aoi.geometry
  if (!fc || !Array.isArray(fc.features) || !fc.features.length) return false
  return true
}

/** FTW dataset / LR Finder — field-boundary AOI first, then map Layers mask / draw / agro. */
export function pickFtwTrainingAoi(
  ...candidates: Array<SiActiveAoi | null | undefined>
): SiActiveAoi {
  for (const candidate of candidates) {
    if (isUsableSiActiveAoi(candidate)) return candidate
  }
  return EMPTY_AOI
}

export function siActiveAoiAreaHa(aoi: SiActiveAoi | null | undefined): number {
  if (!aoi?.geometry?.features?.length) return 0
  try {
    return turf.area(aoi.geometry as turf.AllGeoJSON) / 10_000
  } catch {
    return 0
  }
}

export function siActiveAoiDisplayLabel(aoi: SiActiveAoi | null | undefined, fallback = 'AOI'): string {
  if (!aoi?.key) return fallback
  return aoiSourceLabel(aoi.source) || fallback
}

/** Unique usable AOIs for FTW chart dropdown (training AOI + layer / edit masks). */
export function listDistinctUsableSiActiveAois(
  ...candidates: Array<SiActiveAoi | null | undefined>
): SiActiveAoi[] {
  const out: SiActiveAoi[] = []
  for (const candidate of candidates) {
    if (!isUsableSiActiveAoi(candidate)) continue
    if (out.some(a => a.key === candidate.key)) continue
    out.push(candidate)
  }
  return out
}
