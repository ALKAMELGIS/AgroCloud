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
 * Build 10 AOI-relative ET class edges from a fine histogram via CDF interpolation.
 * Equal-mass deciles → Extremely Low (0–10%) … Exceptional (90–100%).
 * Interpolates *inside* wide bins so a skewed AOI still gets 10 distinct edges
 * across the actual data range (avoids collapsing empty high classes to maxMm).
 * Returns `edges` length 11, or null when sample mass is too small / degenerate.
 */
export function etPercentileClassEdgesFromFineBins(
  bins: Array<{ lowEdge: number; highEdge: number; count: number }>,
  classCount = 10,
): number[] | null {
  if (!bins.length || classCount < 2) return null
  const sorted = [...bins]
    .filter(b => Number.isFinite(b.lowEdge) && Number.isFinite(b.highEdge))
    .sort((a, b) => a.lowEdge - b.lowEdge)
  const total = sorted.reduce((s, b) => s + Math.max(0, b.count || 0), 0)
  if (total < classCount) return null

  // Empirical CDF nodes: (value, cumulative fraction) at each bin boundary.
  // Skip empty fine bins so the data max is the last *populated* edge — not the
  // absolute histogram ceiling (e.g. 15 mm) which caused collapsed high classes.
  const cdfX: number[] = []
  const cdfY: number[] = []
  let cumulative = 0
  for (const bin of sorted) {
    const c = Math.max(0, bin.count || 0)
    if (c <= 0) continue
    if (cdfX.length === 0) {
      cdfX.push(Number(bin.lowEdge.toFixed(6)))
      cdfY.push(0)
    }
    cumulative += c
    const x = Number(bin.highEdge.toFixed(6))
    if (x <= cdfX[cdfX.length - 1]!) {
      cdfY[cdfY.length - 1] = cumulative / total
      continue
    }
    cdfX.push(x)
    cdfY.push(cumulative / total)
  }
  if (cdfX.length < 2 || cdfY[cdfY.length - 1]! < 0.999) return null

  const quantileAt = (p: number): number => {
    const target = Math.max(0, Math.min(1, p))
    if (target <= 0) return cdfX[0]!
    if (target >= 1) return cdfX[cdfX.length - 1]!
    for (let i = 1; i < cdfX.length; i += 1) {
      const y0 = cdfY[i - 1]!
      const y1 = cdfY[i]!
      if (target > y1) continue
      if (y1 <= y0) return cdfX[i]!
      const t = (target - y0) / (y1 - y0)
      return Number((cdfX[i - 1]! + t * (cdfX[i]! - cdfX[i - 1]!)).toFixed(6))
    }
    return cdfX[cdfX.length - 1]!
  }

  const edges: number[] = [Number(cdfX[0]!.toFixed(6))]
  for (let k = 1; k < classCount; k += 1) {
    edges.push(quantileAt(k / classCount))
  }
  edges.push(Number(cdfX[cdfX.length - 1]!.toFixed(6)))

  // Enforce strictly increasing edges; if the distribution is nearly flat, spread
  // leftover width evenly so every class keeps a usable interval for legend labels.
  const span = Math.max(1e-6, edges[edges.length - 1]! - edges[0]!)
  const minStep = Math.max(1e-4, span / (classCount * 50))
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i]! <= edges[i - 1]!) {
      edges[i] = Number((edges[i - 1]! + minStep).toFixed(6))
    }
  }
  // Keep the final edge at least as high as the data max (after epsilon bumps).
  const dataMax = cdfX[cdfX.length - 1]!
  if (edges[edges.length - 1]! < dataMax) {
    edges[edges.length - 1] = Number(dataMax.toFixed(6))
  }
  return edges.length === classCount + 1 ? edges : null
}

/**
 * Aggregate fine-bin counts into per-class counts for ascending `edges` (len = classes+1).
 * Splits each fine bin *proportionally by overlap* across class intervals so a bin that
 * straddles several percentile classes contributes to each — no empty classes from
 * midpoint-only assignment when mass is concentrated in a few fine bins.
 */
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
    const lo = bin.lowEdge
    const hi = bin.highEdge
    const width = hi - lo
    if (!(width > 0)) {
      // Degenerate bin → nearest class by midpoint.
      const mid = (lo + hi) / 2
      let bi = n - 1
      for (let i = 0; i < n; i += 1) {
        if (mid >= edges[i]! && (i === n - 1 || mid < edges[i + 1]!)) {
          bi = i
          break
        }
      }
      counts[bi]! += c
      continue
    }

    let assigned = 0
    for (let i = 0; i < n; i += 1) {
      const clo = edges[i]!
      const chi = edges[i + 1]!
      const overlap = Math.max(0, Math.min(hi, chi) - Math.max(lo, clo))
      if (overlap <= 0) continue
      const share = (overlap / width) * c
      counts[i]! += share
      assigned += share
    }
    // Residual (bin outside all edges) → clamp to nearest extreme class.
    const residual = c - assigned
    if (residual > 1e-9) {
      if (hi <= edges[0]!) counts[0]! += residual
      else counts[n - 1]! += residual
    }
  }

  // Round to whole pixels while preserving total mass.
  const rawTotal = counts.reduce((s, v) => s + v, 0)
  if (rawTotal <= 0) return counts.map(() => 0)
  const rounded = counts.map(v => Math.floor(v))
  let left = Math.round(rawTotal) - rounded.reduce((s, v) => s + v, 0)
  // Largest-remainder method for fairness across classes.
  const fracOrder = counts
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of fracOrder) {
    if (left <= 0) break
    rounded[i]! += 1
    left -= 1
  }
  return rounded
}

/** Mid-values for ColorRampVisualizer given ascending edges. */
export function etClassCenterValues(edges: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    out.push(Number(((edges[i]! + edges[i + 1]!) / 2).toFixed(4)))
  }
  return out
}
