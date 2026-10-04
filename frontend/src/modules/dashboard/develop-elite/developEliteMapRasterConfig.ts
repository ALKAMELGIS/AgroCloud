export type DevelopEliteRasterClipSubtype = 'farm' | 'pivot' | 'both'

export type DevelopEliteMapRasterSlot = {
  layerId: string
  showOnMap: boolean
  opacity: number
  clipmask: boolean
  clipSubtype: DevelopEliteRasterClipSubtype
}

export type DevelopEliteAgroStructuresSubtypes = {
  farmPlots: boolean
  pivot: boolean
}

export type DevelopEliteMapLayerOptions = {
  agroStructuresSubtypes: DevelopEliteAgroStructuresSubtypes
  /** Shared scene date (YYYY-MM-DD) for raster WMS slots. */
  rasterImageryDate: string
  rasterSlots: [DevelopEliteMapRasterSlot, DevelopEliteMapRasterSlot]
}

export const DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE = 1007
export const DEVELOP_ELITE_PIVOT_STRUCTURE_CODE = 1006

export const DEVELOP_ELITE_RASTER_SLOT_NDVI_LAYER = 'NDVI'
export const DEVELOP_ELITE_RASTER_SLOT_INDEX_LAYER = 'NDMI'

function clampOpacity(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.85
  return Math.min(1, Math.max(0, n))
}

function normalizeClipSubtype(raw: unknown): DevelopEliteRasterClipSubtype {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'farm' || s === 'pivot') return s
  return 'both'
}

function normalizeRasterSlot(raw: unknown, fallback: DevelopEliteMapRasterSlot): DevelopEliteMapRasterSlot {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    layerId: String(o.layerId || fallback.layerId).trim() || fallback.layerId,
    showOnMap: Boolean(o.showOnMap),
    opacity: clampOpacity(o.opacity ?? fallback.opacity),
    clipmask: o.clipmask !== false,
    clipSubtype: normalizeClipSubtype(o.clipSubtype ?? fallback.clipSubtype),
  }
}

export function defaultDevelopEliteRasterSlot(layerId: string): DevelopEliteMapRasterSlot {
  return {
    layerId,
    showOnMap: false,
    opacity: 0.85,
    clipmask: true,
    clipSubtype: 'both',
  }
}

export const DEFAULT_DEVELOP_ELITE_MAP_LAYER_OPTIONS: DevelopEliteMapLayerOptions = {
  agroStructuresSubtypes: { farmPlots: true, pivot: true },
  rasterImageryDate: '',
  rasterSlots: [
    defaultDevelopEliteRasterSlot(DEVELOP_ELITE_RASTER_SLOT_NDVI_LAYER),
    defaultDevelopEliteRasterSlot(DEVELOP_ELITE_RASTER_SLOT_INDEX_LAYER),
  ],
}

export function normalizeDevelopEliteMapLayerOptions(
  raw: unknown,
): DevelopEliteMapLayerOptions {
  const base = DEFAULT_DEVELOP_ELITE_MAP_LAYER_OPTIONS
  if (!raw || typeof raw !== 'object') return { ...base, rasterSlots: [...base.rasterSlots] }
  const o = raw as Record<string, unknown>
  const sub = o.agroStructuresSubtypes
  const farmPlots =
    sub && typeof sub === 'object' && 'farmPlots' in sub
      ? (sub as { farmPlots?: boolean }).farmPlots !== false
      : base.agroStructuresSubtypes.farmPlots
  const pivot =
    sub && typeof sub === 'object' && 'pivot' in sub
      ? (sub as { pivot?: boolean }).pivot !== false
      : base.agroStructuresSubtypes.pivot

  const slotsRaw = Array.isArray(o.rasterSlots) ? o.rasterSlots : []
  const slot0 = normalizeRasterSlot(slotsRaw[0], base.rasterSlots[0])
  const slot1 = normalizeRasterSlot(slotsRaw[1], base.rasterSlots[1])

  return {
    agroStructuresSubtypes: { farmPlots, pivot },
    rasterImageryDate: String(o.rasterImageryDate ?? base.rasterImageryDate).trim().slice(0, 10),
    rasterSlots: [slot0, slot1],
  }
}

/** Fallback when config has no explicit scene date. */
export function resolveDevelopEliteRasterImageryDate(configured: string): string {
  const trimmed = String(configured || '').trim().slice(0, 10)
  if (trimmed) return trimmed
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 5)
  return d.toISOString().slice(0, 10)
}
