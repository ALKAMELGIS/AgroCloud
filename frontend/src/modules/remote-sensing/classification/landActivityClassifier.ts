/**
 * Agricultural Context Model — planted vs bare / fallow land.
 * Prevents low-NDVI bare fields from receiving crop-health (green) alerts.
 */

export type LandActivityState =
  | 'BARE_SOIL_UNPLANTED'
  | 'NON_CULTIVATED_STABLE'
  | 'ACTIVE_CROP_ESTABLISHED'
  | 'ACTIVE_CROP_ONGOING'

export type LandActivityIndexTriplet = {
  NDVI: number
  NDMI: number
  NDWI: number
}

export type LandActivityHistory = {
  current: LandActivityIndexTriplet
  prev1: LandActivityIndexTriplet
  prev2: LandActivityIndexTriplet
}

export const LAND_ACTIVITY_NEAR_ZERO = 0.05
export const LAND_ACTIVITY_FLAT_NDVI_DELTA = 0.02
export const LAND_ACTIVITY_LOW_BASELINE_NDVI = 0.15
export const LAND_ACTIVITY_CROP_ESTABLISHED_NDVI = 0.2
export const LAND_ACTIVITY_HEALTHY_MIN_NDVI = 0.4

export const NO_CROP_ACTIVITY_STATES: ReadonlySet<LandActivityState> = new Set([
  'BARE_SOIL_UNPLANTED',
  'NON_CULTIVATED_STABLE',
])

export function isNearZero(value: number, threshold = LAND_ACTIVITY_NEAR_ZERO): boolean {
  return Number.isFinite(value) && Math.abs(value) <= threshold
}

export function isNoCropActivity(state: LandActivityState): boolean {
  return NO_CROP_ACTIVITY_STATES.has(state)
}

/** At least one positive ΔNDVI across the last 3 observations. */
export function hasActiveVegetationGrowthPattern(history: LandActivityHistory): boolean {
  const d1 = history.current.NDVI - history.prev1.NDVI
  const d2 = history.prev1.NDVI - history.prev2.NDVI
  return d1 > 0 || d2 > 0
}

export function buildLandActivityHistoryFromScenes(
  current: LandActivityIndexTriplet,
  ndviScenes: number[],
): LandActivityHistory {
  return {
    current,
    prev1: {
      NDVI: ndviScenes[1] ?? current.NDVI,
      NDMI: current.NDMI,
      NDWI: current.NDWI,
    },
    prev2: {
      NDVI: ndviScenes[2] ?? ndviScenes[1] ?? current.NDVI,
      NDMI: current.NDMI,
      NDWI: current.NDWI,
    },
  }
}

export function classifyLandActivity(history: LandActivityHistory): LandActivityState {
  const { current, prev1, prev2 } = history

  if (current.NDVI < 0.1) {
    return 'BARE_SOIL_UNPLANTED'
  }

  if (
    current.NDVI < 0.12 &&
    isNearZero(current.NDMI, 0.08) &&
    isNearZero(current.NDWI, 0.08)
  ) {
    return 'BARE_SOIL_UNPLANTED'
  }

  const deltaCurrent = current.NDVI - prev1.NDVI
  const deltaPrev = prev1.NDVI - prev2.NDVI
  if (
    current.NDVI < 0.15 &&
    Math.abs(deltaCurrent) <= LAND_ACTIVITY_FLAT_NDVI_DELTA &&
    Math.abs(deltaPrev) <= LAND_ACTIVITY_FLAT_NDVI_DELTA
  ) {
    return 'NON_CULTIVATED_STABLE'
  }

  const hadLowBaseline =
    prev1.NDVI < LAND_ACTIVITY_LOW_BASELINE_NDVI ||
    prev2.NDVI < LAND_ACTIVITY_LOW_BASELINE_NDVI
  if (current.NDVI > LAND_ACTIVITY_CROP_ESTABLISHED_NDVI && hadLowBaseline) {
    return 'ACTIVE_CROP_ESTABLISHED'
  }

  if (current.NDVI >= LAND_ACTIVITY_CROP_ESTABLISHED_NDVI) {
    return 'ACTIVE_CROP_ONGOING'
  }

  const hadActiveCanopy =
    prev1.NDVI >= LAND_ACTIVITY_CROP_ESTABLISHED_NDVI ||
    prev2.NDVI >= LAND_ACTIVITY_CROP_ESTABLISHED_NDVI
  if (hadActiveCanopy) return 'ACTIVE_CROP_ONGOING'

  return 'NON_CULTIVATED_STABLE'
}

/** CRITICAL: block HEALTHY unless NDVI > 0.4 and growth pattern exists. */
export function qualifiesForCropHealthLabel(
  ndvi: number,
  history: LandActivityHistory,
  landState: LandActivityState,
): boolean {
  if (isNoCropActivity(landState)) return false
  if (ndvi <= LAND_ACTIVITY_HEALTHY_MIN_NDVI) return false
  return hasActiveVegetationGrowthPattern(history)
}

export function landActivityPresentation(state: LandActivityState): {
  label: string
  interpretation: string
  color: string
  icon: string
  showCropHealthAlert: boolean
} {
  switch (state) {
    case 'BARE_SOIL_UNPLANTED':
      return {
        label: 'UNPLANTED / BARE SOIL',
        interpretation: 'No active crop detected — bare or unplanted land.',
        color: '#90a4ae',
        icon: 'fa-mound',
        showCropHealthAlert: false,
      }
    case 'NON_CULTIVATED_STABLE':
      return {
        label: 'NON-CULTIVATED / FALLOW',
        interpretation: 'Low stable NDVI with no crop establishment pattern.',
        color: '#78909c',
        icon: 'fa-ban',
        showCropHealthAlert: false,
      }
    case 'ACTIVE_CROP_ESTABLISHED':
      return {
        label: 'CROP ESTABLISHED',
        interpretation: 'Vegetation emergence detected after low baseline.',
        color: '',
        icon: 'fa-seedling',
        showCropHealthAlert: true,
      }
    case 'ACTIVE_CROP_ONGOING':
    default:
      return {
        label: 'ACTIVE CROP',
        interpretation: 'Active vegetation canopy present.',
        color: '',
        icon: 'fa-leaf',
        showCropHealthAlert: true,
      }
  }
}
