/**
 * Evapotranspiration (ET) proxy for AgroCloud irrigation monitoring (mm/day).
 *
 * Sentinel-2 alone does not provide physical ET; AgroCloud estimates crop water
 * demand from moisture, canopy stage (Kc), and seasonal climate energy:
 *
 *   Moisture demand = clamp(1 − (0.6×NDMI + 0.4×NDWI), 0, 1)
 *   Season factor   = f(day-of-year) ≈ 0.45 (winter NH) → 1.0 (peak summer)
 *   Kc (crop stage) = clamp(0.15 + 1.25×NDVI, 0.15, 1.25)
 *   ET (mm/day)     = Moisture × Season × Kc × ET_REF_MM_DAY
 *
 * Volume: Water Loss (m³/day) = ET × Area(ha) × 10
 *
 * Map / legend classes for ET use AOI-relative percentiles (deciles), not fixed
 * 0–10 mm bins — so each date’s distribution fills all 10 classes when variance exists.
 */

export const ET_REF_MM_DAY = 10

/** Fallback absolute breaks (mm/day) when percentile edges cannot be derived. */
export const SENTINEL_ET_10_CLASS_BREAKS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const SENTINEL_ET_10_CLASS_LABELS = [
  'Extremely Low ET',
  'Very Low ET',
  'Low ET',
  'Slightly Low ET',
  'Moderate ET',
  'Moderately High ET',
  'High ET',
  'Very High ET',
  'Extremely High ET',
  'Exceptional ET',
] as const

/** Representative class centers for ColorRampVisualizer (absolute fallback ramp). */
export const SENTINEL_ET_10_CLASS_VALUES: readonly number[] = [
  0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5,
]

/** Cool (low ET) → warm (high ET) palette — irrigation demand visualization. */
export const SENTINEL_ET_10_CLASS_COLORS: readonly number[] = [
  0x1e3a8a, // Extremely Low — deep blue
  0x1d4ed8, // Very Low
  0x0284c7, // Low
  0x0ea5e9, // Slightly Low
  0x22c55e, // Moderate — green
  0xa3e635, // Moderately High
  0xfde047, // High — yellow
  0xfbbf24, // Very High
  0xf97316, // Extremely High — orange
  0xdc2626, // Exceptional — red
]

type RampStop = [number, number]

export const SENTINEL_ET_RAMP: RampStop[] = SENTINEL_ET_10_CLASS_VALUES.map((v, i) => [
  v,
  SENTINEL_ET_10_CLASS_COLORS[i]!,
])

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** Day-of-year 1…366 from YYYY-MM-DD (UTC noon). */
export function dayOfYearFromIso(isoDate?: string | null): number {
  const day = String(isoDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    // Mid-year default when date unknown (avoids permanent winter bias).
    return 180
  }
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return 180
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.round((d.getTime() - start) / 86_400_000)
}

/**
 * Northern-hemisphere seasonal energy factor for reference ET demand.
 * Peak (~1.0) near DOY 172 (late June); trough (~0.45) near DOY 355 (late Dec).
 */
export function etSeasonFactor(doyOrIso?: number | string | null): number {
  const doy =
    typeof doyOrIso === 'number' && Number.isFinite(doyOrIso)
      ? Math.max(1, Math.min(366, Math.round(doyOrIso)))
      : dayOfYearFromIso(typeof doyOrIso === 'string' ? doyOrIso : null)
  const phase = Math.sin((2 * Math.PI * (doy - 80)) / 365)
  return Number((0.45 + 0.55 * (0.5 + 0.5 * phase)).toFixed(4))
}

/**
 * Crop coefficient proxy from canopy vigor (NDVI).
 * Bare / early growth → ~0.15–0.4 · peak canopy → ~1.0–1.25
 */
export function etCropCoefficientFromNdvi(ndvi: number | null | undefined): number {
  if (ndvi == null || !Number.isFinite(ndvi)) return 0.85
  return Number(clamp(0.15 + 1.25 * ndvi, 0.15, 1.25).toFixed(4))
}

export function computeEtMoistureScore(ndmi: number, ndwi: number): number {
  return 0.6 * ndmi + 0.4 * ndwi
}

/** Moisture-driven demand fraction in [0, 1] (1 = dry / high demand). */
export function computeEtWaterLossIndexFraction(ndmi: number, ndwi: number): number {
  return clamp01(1 - computeEtMoistureScore(ndmi, ndwi))
}

export type EstimateEtOptions = {
  /** Scene / acquisition date (drives season factor). */
  sceneDate?: string | null
  /** Canopy vigor for Kc; defaults to mid-season crop when omitted. */
  ndvi?: number | null
  /** Override season factor (tests / external climate). */
  seasonFactor?: number | null
  /** Override Kc. */
  kc?: number | null
}

/**
 * Estimated ET (mm/day) from NDMI/NDWI + seasonal climate energy + crop stage (Kc).
 * Values typically vary ~1–12 mm/day across seasons and canopy stages.
 */
export function estimateEtMmDayFromMoisture(
  ndmi: number,
  ndwi: number,
  options?: EstimateEtOptions,
): number {
  const demand = computeEtWaterLossIndexFraction(ndmi, ndwi)
  const season =
    options?.seasonFactor != null && Number.isFinite(options.seasonFactor)
      ? clamp(options.seasonFactor, 0.35, 1.15)
      : etSeasonFactor(options?.sceneDate)
  const kc =
    options?.kc != null && Number.isFinite(options.kc)
      ? clamp(options.kc, 0.15, 1.35)
      : etCropCoefficientFromNdvi(options?.ndvi)
  return Number((demand * season * kc * ET_REF_MM_DAY).toFixed(3))
}

/** Total Water Loss (m³/day) = ET (mm/day) × AOI (ha) × 10 */
export function etWaterLossM3Day(etMmDay: number, aoiAreaHa: number): number {
  if (!Number.isFinite(etMmDay) || !Number.isFinite(aoiAreaHa) || aoiAreaHa <= 0) return 0
  return Number((etMmDay * aoiAreaHa * 10).toFixed(2))
}

/** Water Loss (m³/ha/day) = ET (mm/day) × 10 */
export function etWaterLossM3HaDay(etMmDay: number): number {
  if (!Number.isFinite(etMmDay)) return 0
  return Number((etMmDay * 10).toFixed(2))
}

/**
 * Evalscript index expression (CORE_INDICES_BLOCK: ndmi, ndwi, ndvi).
 * Inject `ET_SEASON` / optional override before evaluatePixel when date is known.
 */
export function buildEtIndexExpr(seasonFactor = 0.85): string {
  const s = Number(seasonFactor.toFixed(4))
  return `Math.max(0, Math.min(15, Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi))) * ${s} * Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi)) * ${ET_REF_MM_DAY}))`
}

/** Default mid-season expr (Statistical API when no scene date is injected). */
export const ET_INDEX_EXPR = buildEtIndexExpr(0.85)

/** Inline band math for WMS ColorRampVisualizer (season plugged at build time). */
export function buildEtWmsIndexSetup(seasonFactor = 0.85): string {
  const s = Number(seasonFactor.toFixed(4))
  return `let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndvi = index(samples.B08, samples.B04);
  let demand = Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)));
  let kc = Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi));
  let et = Math.max(0, Math.min(15, demand * ${s} * kc * ${ET_REF_MM_DAY}));`
}

/** @deprecated Prefer buildEtWmsIndexSetup(scene season). */
export const ET_WMS_INDEX_SETUP = buildEtWmsIndexSetup(0.85)

/** Fine absolute histogram edges for deriving AOI percentile classes. */
export function etFineHistogramEdges(maxMm = 15, step = 0.25): number[] {
  const edges: number[] = []
  for (let v = 0; v <= maxMm + 1e-9; v += step) {
    edges.push(Number(v.toFixed(4)))
  }
  return edges
}

/**
 * Build 10 AOI-relative ET class edges from a sorted ascending fine histogram.
 * Deciles of the cumulative pixel mass → Very Low (0–10%) … Exceptional (90–100%).
 * Returns `edges` length 11, or null when sample mass is too small / degenerate.
 */
export function etPercentileClassEdgesFromFineBins(
  bins: Array<{ lowEdge: number; highEdge: number; count: number }>,
  classCount = 10,
): number[] | null {
  if (!bins.length || classCount < 2) return null
  const sorted = [...bins].sort((a, b) => a.lowEdge - b.lowEdge)
  const total = sorted.reduce((s, b) => s + Math.max(0, b.count || 0), 0)
  if (total < classCount) return null

  const edges: number[] = [sorted[0]!.lowEdge]
  let cumulative = 0
  let nextTarget = 1

  for (const bin of sorted) {
    cumulative += Math.max(0, bin.count || 0)
    while (nextTarget < classCount && cumulative / total >= nextTarget / classCount) {
      const edge = Number(bin.highEdge.toFixed(4))
      if (edge > edges[edges.length - 1]!) edges.push(edge)
      nextTarget += 1
    }
  }

  const lastHigh = sorted[sorted.length - 1]!.highEdge
  while (edges.length < classCount) {
    edges.push(Number(lastHigh.toFixed(4)))
  }
  edges.push(Number(Math.max(lastHigh, edges[edges.length - 1]!).toFixed(4)))

  // Ensure strictly increasing edges (collapse plateaus by tiny epsilon).
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i]! <= edges[i - 1]!) {
      edges[i] = Number((edges[i - 1]! + 0.001).toFixed(4))
    }
  }
  return edges.length === classCount + 1 ? edges : null
}

/** Aggregate fine-bin counts into per-class counts for ascending `edges` (len = classes+1). */
export function rebinFineHistogramToClassCounts(
  bins: Array<{ lowEdge: number; highEdge: number; count: number }>,
  edges: number[],
): number[] {
  const n = Math.max(0, edges.length - 1)
  const counts = new Array<number>(n).fill(0)
  if (n < 1) return counts

  for (const bin of bins) {
    const c = Math.max(0, bin.count || 0)
    if (!c) continue
    const mid = (bin.lowEdge + bin.highEdge) / 2
    let bi = n - 1
    for (let i = 0; i < n; i += 1) {
      if (mid >= edges[i]! && mid < edges[i + 1]!) {
        bi = i
        break
      }
      if (mid < edges[0]!) {
        bi = 0
        break
      }
    }
    counts[bi]! += c
  }
  return counts
}

/** Mid-values for ColorRampVisualizer given ascending edges. */
export function etClassCenterValues(edges: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    out.push(Number(((edges[i]! + edges[i + 1]!) / 2).toFixed(4)))
  }
  return out
}
