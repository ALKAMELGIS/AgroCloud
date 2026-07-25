/**
 * UCSB CHIRPS precipitation indices & colour ramp for AgroCloud.
 *
 *   P   = Σ Rainfall(mm)
 *   RAI = ((Current − HistoricalMean) / HistoricalMean) × 100
 *   SPI = (P − Pmean) / Pstd
 *   RTI = LinearTrend(Rainfall_TimeSeries)  → slope mm / period
 *   RDI = CurrentSeasonRainfall / HistoricalAverageRainfall
 *   WAI = 0.5·RainfallIndex + 0.3·NDMI + 0.2·NDWI
 */

export const CHIRPS_LAYER_ID = 'PRECIP'
export const CHIRPS_LAYER_LABEL = 'Precipitation / Rainfall Analysis'
export const CHIRPS_SCIENTIFIC_NAME =
  'UCSB CHIRPS Daily Rainfall (Climate Hazards Group InfraRed Precipitation with Station data)'

export const CHIRPS_NODATA = -9999

/** Brown-dry → white → deep blue wet (mm). */
export const CHIRPS_PRECIP_RAMP: Array<[number, number]> = [
  [0, 0xc4a484],
  [2, 0xf5f0e6],
  [5, 0xc8e0f4],
  [15, 0x6baed6],
  [30, 0x2171b5],
  [60, 0x08306b],
  [100, 0x041e42],
]

export const CHIRPS_PRECIP_CLASS_BREAKS = [2, 5, 10, 20, 40, 60, 80, 100, 150] as const
export const CHIRPS_PRECIP_CLASS_LABELS = [
  'Trace',
  'Very light',
  'Light',
  'Moderate',
  'Wet',
  'Heavy',
  'Very heavy',
  'Extreme',
  'Exceptional',
  'Catastrophic',
] as const
export const CHIRPS_PRECIP_CLASS_COLORS = [
  0xc4a484, 0xf5f0e6, 0xc8e0f4, 0x9ecae1, 0x6baed6, 0x4292c6, 0x2171b5, 0x08519c, 0x08306b, 0x041e42,
] as const

export type ChirpsAggregation = 'daily' | 'monthly' | 'seasonal' | 'annual'

export type ChirpsSeriesPoint = {
  date: string
  period?: string
  rainfallMm: number | null
}

export function totalPrecipitation(points: ChirpsSeriesPoint[]): number | null {
  const vals = points.map(p => p.rainfallMm).filter((v): v is number => v != null && Number.isFinite(v))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0)
}

/** Rainfall Anomaly Index (%). */
export function rainfallAnomalyIndex(currentMm: number, historicalMeanMm: number): number | null {
  if (!Number.isFinite(currentMm) || !Number.isFinite(historicalMeanMm) || historicalMeanMm === 0) {
    return null
  }
  return ((currentMm - historicalMeanMm) / historicalMeanMm) * 100
}

/** Standardized Precipitation Index (simplified z-score). */
export function standardizedPrecipitationIndex(p: number, pMean: number, pStd: number): number | null {
  if (![p, pMean, pStd].every(Number.isFinite) || pStd === 0) return null
  return (p - pMean) / pStd
}

/** Linear trend slope (mm per step) via least squares. */
export function rainfallTrendIndex(points: ChirpsSeriesPoint[]): number | null {
  const pairs: Array<[number, number]> = []
  points.forEach((p, i) => {
    if (p.rainfallMm != null && Number.isFinite(p.rainfallMm)) pairs.push([i, p.rainfallMm])
  })
  if (pairs.length < 3) return null
  const n = pairs.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const [x, y] of pairs) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
  }
  const den = n * sumXX - sumX * sumX
  if (den === 0) return null
  return (n * sumXY - sumX * sumY) / den
}

/** Rainfall Distribution Index. */
export function rainfallDistributionIndex(currentSeasonMm: number, historicalAvgMm: number): number | null {
  if (!Number.isFinite(currentSeasonMm) || !Number.isFinite(historicalAvgMm) || historicalAvgMm === 0) {
    return null
  }
  return currentSeasonMm / historicalAvgMm
}

/**
 * Water Availability Index.
 * RainfallIndex = clamp(current / ref, 0, 1) with ref ≈ 50 mm (daily) or configurable.
 */
export function waterAvailabilityIndex(opts: {
  rainfallMm: number | null
  ndmi: number | null
  ndwi: number | null
  rainfallRefMm?: number
}): number | null {
  const { rainfallMm, ndmi, ndwi, rainfallRefMm = 50 } = opts
  if (rainfallMm == null || !Number.isFinite(rainfallMm)) return null
  const rainIdx = Math.max(0, Math.min(1, rainfallMm / Math.max(1, rainfallRefMm)))
  const ndmiN =
    ndmi != null && Number.isFinite(ndmi) ? Math.max(0, Math.min(1, (ndmi + 1) / 2)) : 0.5
  const ndwiN =
    ndwi != null && Number.isFinite(ndwi) ? Math.max(0, Math.min(1, (ndwi + 1) / 2)) : 0.5
  return 0.5 * rainIdx + 0.3 * ndmiN + 0.2 * ndwiN
}

export function spiDroughtLabel(spi: number | null): string {
  if (spi == null || !Number.isFinite(spi)) return '—'
  if (spi >= 2) return 'Extremely wet'
  if (spi >= 1.5) return 'Very wet'
  if (spi >= 1) return 'Moderately wet'
  if (spi > -1) return 'Near normal'
  if (spi > -1.5) return 'Moderately dry'
  if (spi > -2) return 'Severely dry'
  return 'Extremely dry'
}

export type ChirpsAnalytics = {
  totalMm: number | null
  meanMm: number | null
  stdMm: number | null
  rai: number | null
  spi: number | null
  spiLabel: string
  rti: number | null
  rdi: number | null
  wai: number | null
}

export function buildChirpsAnalytics(
  points: ChirpsSeriesPoint[],
  opts?: { ndmi?: number | null; ndwi?: number | null; historicalMeanMm?: number | null },
): ChirpsAnalytics {
  const vals = points.map(p => p.rainfallMm).filter((v): v is number => v != null && Number.isFinite(v))
  const totalMm = vals.length ? vals.reduce((a, b) => a + b, 0) : null
  const meanMm = vals.length ? totalMm! / vals.length : null
  const variance =
    vals.length > 1 && meanMm != null
      ? vals.reduce((a, b) => a + (b - meanMm) ** 2, 0) / vals.length
      : 0
  const stdMm = Math.sqrt(variance)
  const hist = opts?.historicalMeanMm ?? meanMm
  const current = vals.length ? vals[vals.length - 1]! : null
  const spi =
    current != null && meanMm != null ? standardizedPrecipitationIndex(current, meanMm, stdMm) : null
  return {
    totalMm,
    meanMm,
    stdMm: vals.length > 1 ? stdMm : null,
    rai: current != null && hist != null ? rainfallAnomalyIndex(current, hist) : null,
    spi,
    spiLabel: spiDroughtLabel(spi),
    rti: rainfallTrendIndex(points),
    rdi:
      totalMm != null && hist != null
        ? rainfallDistributionIndex(totalMm, hist * Math.max(1, vals.length))
        : null,
    wai: waterAvailabilityIndex({
      rainfallMm: current,
      ndmi: opts?.ndmi ?? null,
      ndwi: opts?.ndwi ?? null,
    }),
  }
}
