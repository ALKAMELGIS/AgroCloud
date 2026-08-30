/**
 * FTW Inference (S2) crop-calendar year — ftw-baselines rejects harvest/buffer dates in the future.
 * When the UI scene date is in the current calendar year, snap to the previous safe year.
 */

export function ftwInferenceMaxCropYear(now = new Date()): number {
  return Math.max(2017, now.getFullYear() - 1)
}

/** Default mid-season day in the latest safe crop year. */
export function ftwInferenceSafeSceneRange(now = new Date()): { from: string; to: string } {
  const y = ftwInferenceMaxCropYear(now)
  const d = `${y}-06-15`
  return { from: d, to: d }
}

/**
 * Map a UI scene day to a crop year the FTW CLI accepts (same month-day, capped year).
 */
export function ftwInferenceEffectiveSceneDate(iso: string, now = new Date()): string {
  const raw = String(iso || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return ftwInferenceSafeSceneRange(now).from
  }
  const maxYear = ftwInferenceMaxCropYear(now)
  const y = Number(raw.slice(0, 4))
  if (!Number.isFinite(y) || y < 2017) return '2017-06-15'
  if (y <= maxYear) return raw
  return `${maxYear}${raw.slice(4)}`
}

export function ftwInferenceCropYear(iso: string, now = new Date()): number {
  return Number(ftwInferenceEffectiveSceneDate(iso, now).slice(0, 4))
}

export function isFtwCropCalendarError(message: string | null | undefined): boolean {
  if (!message) return false
  return /crop calendar|harvest date|can't be in the future|cannot be in the future/i.test(message)
}
