import type { SiActiveAoi } from '@/modules/remote-sensing/imagery/siAoiManager'

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
