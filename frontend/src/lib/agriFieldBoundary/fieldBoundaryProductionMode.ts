import type { FieldBoundaryHealth } from './fieldBoundaryClient'

/** Sensible minimum parcel size on Hostinger / GitHub Pages (builtin spectral detect). */
export const PRODUCTION_MAP_RGB_MIN_AREA_M2 = 200

export function isBuiltinFieldEngine(engine: string | null | undefined): boolean {
  return /spectral-builtin|builtin/i.test(String(engine || ''))
}

/** Python field engines unavailable — only map RGB + Node builtin remain. */
export function isMapRgbOnlyProductionHost(health: FieldBoundaryHealth | null | undefined): boolean {
  if (!health || health.offline) return false
  if (health.python === true) return false
  return true
}

export function shouldSkipFootprintRegularize(engine: string | null | undefined): boolean {
  return isBuiltinFieldEngine(engine)
}
