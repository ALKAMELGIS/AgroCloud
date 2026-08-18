import type { FieldBoundaryHealth } from './fieldBoundaryClient'

/** Sensible minimum parcel size on Hostinger / GitHub Pages (builtin spectral detect). */
export const PRODUCTION_MAP_RGB_MIN_AREA_M2 = 200

export function isBuiltinFieldEngine(engine: string | null | undefined): boolean {
  return /spectral-builtin|builtin/i.test(String(engine || ''))
}

/** Python FTW/FoW/Delineate are unavailable — only map RGB + Node builtin remain. */
export function isMapRgbOnlyProductionHost(health: FieldBoundaryHealth | null | undefined): boolean {
  if (!health || health.offline) return false
  if (health.python === true && health.ftw_live === true) return false
  if (health.ftw_live === true || health.ftw_infer === true) return false
  return health.python !== true
}

export function shouldSkipFootprintRegularize(engine: string | null | undefined): boolean {
  return isBuiltinFieldEngine(engine)
}

export function productionMapRgbNotice(): string {
  return 'Production mode: Map RGB detect — draw a rectangle on cropland, wait for Esri/Google tiles, then Detect.'
}
