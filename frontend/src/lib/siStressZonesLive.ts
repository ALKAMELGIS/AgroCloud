import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  fetchSentinelIndexClassHistogramForSceneDate,
  type SentinelHubDailyIndexMeans,
} from './sentinelHubStatisticsApi'
import { computeClassAreaRows, geodesicAreaM2, pixelAreaM2ForResolution } from './siLayerClassAreaEngine'
import { analyzeStressZone, computeStressScore, computeStressZonesChas } from './siStressZonesEngine'
import { buildStressZonesHistogramEvalscript } from './siStressZonesEvalscript'
import {
  STRESS_ZONE_COLORS,
  STRESS_ZONE_LABELS,
  STRESS_ZONE_TIER_ORDER,
  stressZoneTierFromClassIndex,
  type StressZoneTier,
} from './siStressZonesMapping'
import { estimateSaviFromNdvi } from './chasIndex'
import { addDaysToIso, subtractDaysFromIso } from './siSentinelImageryDate'

export type StressZoneAreaRow = {
  tier: StressZoneTier
  label: string
  color: string
  areaHa: number
  pct: number
}

export type StressZoneSceneResult = {
  sceneDate: string
  indices: { ndvi: number; ndmi: number; savi: number; ndwi: number }
  chas: number
  stressScore: number
  tier: StressZoneTier
  riskCause: string
  recommendation: string
  zones: StressZoneAreaRow[]
  totalAreaHa: number
}

export type StressZoneTimeSeriesPoint = {
  date: string
  chas: number | null
  stressScore: number | null
  ndvi: number | null
}

const HISTOGRAM_EDGES = [0, 1, 2, 3, 4, 5]

async function fetchStressZoneAreas(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<StressZoneAreaRow[]> {
  const evalscript = buildStressZonesHistogramEvalscript(false)
  let histogram = await fetchSentinelIndexClassHistogramForSceneDate({
    geometry,
    sceneDate,
    evalscript,
    outputId: 'idx',
    binEdges: HISTOGRAM_EDGES,
    searchWindowDays: 14,
    signal,
  })
  if (!histogram?.bins?.length) {
    histogram = await fetchSentinelIndexClassHistogramForSceneDate({
      geometry,
      sceneDate,
      evalscript: buildStressZonesHistogramEvalscript(true),
      outputId: 'idx',
      binEdges: HISTOGRAM_EDGES,
      searchWindowDays: 14,
      signal,
    })
  }
  if (!histogram) return []

  const { rows, analyzedAreaM2 } = computeClassAreaRows(histogram, 5, pixelAreaM2ForResolution(10))
  const totalHa = analyzedAreaM2 / 10_000
  return rows
    .map((row, i) => {
      const tier = stressZoneTierFromClassIndex(i)
      const pct = totalHa > 0 ? (row.areaHa / totalHa) * 100 : 0
      return {
        tier,
        label: STRESS_ZONE_LABELS[tier],
        color: STRESS_ZONE_COLORS[tier],
        areaHa: row.areaHa,
        pct,
      }
    })
    .filter(z => z.areaHa > 0)
    .sort(
      (a, b) =>
        STRESS_ZONE_TIER_ORDER.indexOf(a.tier) - STRESS_ZONE_TIER_ORDER.indexOf(b.tier),
    )
}

function resolveIndicesFromDailyRow(
  row: SentinelHubDailyIndexMeans | null | undefined,
): { ndvi: number; ndmi: number; savi: number; ndwi: number } | null {
  if (!row) return null
  const ndvi = row.ndvi
  const ndmi = row.ndmi
  const ndwi = row.ndwi
  const savi = row.savi ?? (ndvi != null && Number.isFinite(ndvi) ? estimateSaviFromNdvi(ndvi) : NaN)
  if (![ndvi, ndmi, ndwi, savi].every(v => v != null && Number.isFinite(v))) return null
  return { ndvi: ndvi!, ndmi: ndmi!, ndwi: ndwi!, savi: savi! }
}

async function fetchSceneDailyRow(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<SentinelHubDailyIndexMeans | null> {
  const rows = await fetchSentinelFieldIndexTimeSeriesForRange({
    geometry,
    fromIso: subtractDaysFromIso(sceneDate, 14),
    toIso: addDaysToIso(sceneDate, 1),
    signal,
  })
  if (!rows.length) return null
  const target = sceneDate.slice(0, 10)
  const exact = rows.find(r => r.date?.slice(0, 10) === target)
  if (exact) return exact
  return rows.reduce((best, row) => {
    if (!best) return row
    const dBest = Math.abs(new Date(best.date).getTime() - new Date(target).getTime())
    const dRow = Math.abs(new Date(row.date).getTime() - new Date(target).getTime())
    return dRow < dBest ? row : best
  }, null as SentinelHubDailyIndexMeans | null)
}

export async function runStressZonesAnalysis(options: {
  geometry: GeoJSON.Geometry
  sceneDate: string
  signal?: AbortSignal
}): Promise<StressZoneSceneResult | null> {
  const sceneDate = options.sceneDate.trim().slice(0, 10)
  if (!sceneDate) return null

  const [daily, zones] = await Promise.all([
    fetchSceneDailyRow(options.geometry, sceneDate, options.signal),
    fetchStressZoneAreas(options.geometry, sceneDate, options.signal),
  ])

  const indices = resolveIndicesFromDailyRow(daily)
  if (!indices) return null

  const analysis = analyzeStressZone(indices)

  return {
    sceneDate,
    indices,
    chas: analysis.chas,
    stressScore: analysis.stressScore,
    tier: analysis.tier,
    riskCause: analysis.riskCause,
    recommendation: analysis.recommendation,
    zones,
    totalAreaHa: geodesicAreaM2(options.geometry) / 10_000,
  }
}

export async function fetchStressZonesTimeSeries(options: {
  geometry: GeoJSON.Geometry
  sceneDate: string
  lookbackDays?: number
  signal?: AbortSignal
}): Promise<StressZoneTimeSeriesPoint[]> {
  const end = options.sceneDate.trim().slice(0, 10)
  const start = subtractDaysFromIso(end, options.lookbackDays ?? 90)
  const rows = await fetchSentinelFieldIndexTimeSeriesForRange({
    geometry: options.geometry,
    fromIso: start,
    toIso: addDaysToIso(end, 1),
    signal: options.signal,
  })

  return rows.map((row: SentinelHubDailyIndexMeans) => {
    const ndvi = row.ndvi
    const ndmi = row.ndmi
    const ndwi = row.ndwi
    const savi = row.savi ?? (ndvi != null ? estimateSaviFromNdvi(ndvi) : null)
    if (
      ndvi == null ||
      ndmi == null ||
      ndwi == null ||
      savi == null ||
      ![ndvi, ndmi, ndwi, savi].every(v => Number.isFinite(v))
    ) {
      return { date: row.date, chas: null, stressScore: null, ndvi: ndvi ?? null }
    }
    const chas = computeStressZonesChas({ ndvi, ndmi, savi, ndwi })
    return { date: row.date, chas, stressScore: computeStressScore(chas), ndvi }
  })
}
