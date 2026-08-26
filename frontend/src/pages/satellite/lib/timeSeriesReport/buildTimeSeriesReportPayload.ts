import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  aggregateImageryChartByTimePeriod,
  aggregateImageryTimeSeriesMulti,
  filterImageryTimeSeriesByDateRange,
  pruneImageryTimeSeriesToObservations,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { buildImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import { estimateSaviFromNdvi } from '../../../../lib/chasIndex'
import { fetchLayerClassAreas, layerSupportsClassArea } from '../../../../lib/siLayerClassAreaEngine'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import { geometryMetrics } from '../../../../lib/geoAiLiveMapContext'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { fetchFieldMapSnapshot } from './timeSeriesMapSnapshot'
import { buildTimeSeriesMapSnapshotGroups } from './timeSeriesExcelMapSnapshots'
import { buildCumulativeMapSnapshotGroups } from './timeSeriesCumulativeMaps'
import {
  buildIndexChangeDetectionMapGroups,
  buildLulcFiveYearMapGroups,
} from './timeSeriesLulcChangeMaps'
import { buildEstimatedWaterLossTimeline } from './estimatedWaterLossTimeline'
import { fetchWaterLossEt0ByDateForField, buildWaterLossEtByDateMaps } from './waterLossEtByDate'
import { buildEstimatedYieldTimeline } from './estimatedYieldTimeline'
import { buildVegetationCoverageTimeline } from './vegetationCoverageTimeline'
import { buildTimeSeriesWeatherTimeline } from './timeSeriesWeatherTimeline'
import { buildTimeSeriesCorrelationBlocks } from './timeSeriesScatterChartRenderer'
import {
  buildCropPlantingRecommendations,
  resolveSalinityMeanFromStats,
} from './timeSeriesCropRecommendations'
import {
  buildTimeSeriesExecutiveSummary,
  computeLayerMedian,
  estimateNdwiFromNdmi,
  type TimeSeriesExecutiveSummary,
} from './timeSeriesReportExecutive'
import type {
  TimeSeriesLayerStatistics,
  TimeSeriesReportPayload,
  TimeSeriesTrendLabel,
} from './timeSeriesReportTypes'

export function classifySeriesTrend(values: number[]): TimeSeriesTrendLabel {
  const nums = values.filter(v => Number.isFinite(v))
  if (nums.length < 4) return 'Stable'
  const first = computeLayerMedian(nums.slice(0, Math.ceil(nums.length / 3))) ?? nums[0]!
  const last = computeLayerMedian(nums.slice(-Math.ceil(nums.length / 3))) ?? nums[nums.length - 1]!
  const delta = last - first
  if (delta > 0.03) return 'Increasing'
  if (delta < -0.03) return 'Decreasing'
  return 'Stable'
}

export function computeLayerStatistics(
  layerId: string,
  labels: string[],
  values: Array<number | null>,
): TimeSeriesLayerStatistics {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  return {
    layerId,
    mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    trend: classifySeriesTrend(nums),
  }
}

export type BuildTimeSeriesReportPayloadInput = {
  projectName?: string
  generatedBy?: string
  field: CropAlertFieldInput | null
  fieldName: string
  fieldKey: string
  fromDate: string
  toDate: string
  acquisitionDate: string
  layerIds: string[]
  chartLabels: string[]
  displayLabels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  dailyRows: SentinelHubDailyIndexMeans[]
  mapboxToken?: string
  includeMap?: boolean
  includeMapSnapshots?: boolean
  /**
   * When set, overrides whether LULC five-year atlas / change maps are built.
   * Defaults to the same as `includeMapSnapshots` (true unless snapshots are disabled).
   */
  includeLulcMapSnapshots?: boolean
  includeVegetationCoverageTimeline?: boolean
  /** When false, skip per-scene NDVI histogram API calls (faster batch). Default true. */
  enrichVegetationHistograms?: boolean
  /** When false, skip Open-Meteo weather timeline (faster batch exports). Default true. */
  includeWeatherTimeline?: boolean
  /**
   * Batch Analytics fast path — skips static map PNG, histogram class areas, vegetation histogram
   * enrichment, weather timeline, and per-scene ET0 Open-Meteo fetches unless overridden.
   * Set {@link includeMapSnapshots} to true to keep the index Map Snapshots atlas in batch Excel.
   */
  batchExportFastPath?: boolean
  periodAnchorDates?: Record<string, string>
  timeAggregation?: ImageryTimeAggregation
  /**
   * Aggregation for Map Snapshots (defaults to `timeAggregation`).
   * Word / Excel Intelligence exports force `'day'` for the classic daily atlas.
   */
  mapSnapshotAggregation?: ImageryTimeAggregation
  /** When false, skip cumulative peak-of-period maps (Excel Map Snapshots only needs index atlas). */
  includeCumulativeMapSnapshots?: boolean
  /** When false, skip index change-detection map pairs. */
  includeChangeDetectionMapSnapshots?: boolean
  /** Soft cap for Day atlas cards per layer (even sampling). */
  mapSnapshotMaxPerLayer?: number
  /** Parallel WMS snapshot fetches per layer (default 2). */
  mapSnapshotConcurrency?: number
  signal?: AbortSignal
  onMapSnapshotProgress?: (completed: number, total: number) => void
}

/** Build a day-level chart axis from raw daily rows for selected layers. */
export function buildDayChartFromDailyRows(
  layerIds: string[],
  dailyRows: SentinelHubDailyIndexMeans[],
  fromDate?: string,
  toDate?: string,
): {
  labels: string[]
  displayLabels: string[]
  series: ImageryTimeSeriesLayerSeries[]
  periodAnchorDates: Record<string, string>
} {
  const from = (fromDate ?? '').trim().slice(0, 10)
  const to = (toDate ?? '').trim().slice(0, 10)
  const ids = [...new Set(layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))]
  const dateSet = new Set<string>()
  for (const row of dailyRows) {
    const d = row.date?.trim().slice(0, 10)
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (from && d < from) continue
    if (to && d > to) continue
    const hasValue = ids.some(id => {
      const v = evaluateImageryLayerDailyValue(id, row)
      return v != null && Number.isFinite(v)
    })
    if (hasValue) dateSet.add(d)
  }
  const labels = [...dateSet].sort()
  const series: ImageryTimeSeriesLayerSeries[] = ids.map(layerId => ({
    layerId,
    values: labels.map(date => {
      const row = dailyRows.find(r => r.date?.slice(0, 10) === date)
      if (!row) return null
      const v = evaluateImageryLayerDailyValue(layerId, row)
      return v != null && Number.isFinite(v) ? v : null
    }),
  }))
  return {
    labels,
    displayLabels: [...labels],
    series,
    periodAnchorDates: Object.fromEntries(labels.map(d => [d, d])),
  }
}

/**
 * Build chart axis for batch/single export from raw daily rows — same pipeline as
 * SiImageryTimeSeriesPanel (multi-layer daily → date clip → week/month/year aggregate).
 */
export function buildAnalyticsChartFromDailyRows(
  fieldKey: string,
  layerIds: string[],
  dailyRows: SentinelHubDailyIndexMeans[],
  fromDate: string,
  toDate: string,
  timeAggregation: ImageryTimeAggregation = 'day',
): {
  labels: string[]
  displayLabels: string[]
  series: ImageryTimeSeriesLayerSeries[]
  periodAnchorDates: Record<string, string>
} {
  const ids = [...new Set(layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))]
  if (!ids.length || !dailyRows.length) {
    return { labels: [], displayLabels: [], series: [], periodAnchorDates: {} }
  }

  const dailyMaps = new Map<string, SentinelHubDailyIndexMeans[]>()
  dailyMaps.set(fieldKey, dailyRows)
  const multi = aggregateImageryTimeSeriesMulti(dailyMaps, [fieldKey], ids)
  const filtered = filterImageryTimeSeriesByDateRange(
    multi.labels,
    multi.series,
    fromDate,
    toDate,
  )
  const pruned = pruneImageryTimeSeriesToObservations(filtered.labels, filtered.series)
  const aggregated = aggregateImageryChartByTimePeriod(
    pruned.labels,
    pruned.series,
    timeAggregation,
  )
  const periodAnchorDates = Object.fromEntries(aggregated.periodAnchorDate.entries())
  const series = aggregated.series.map(s => ({
    ...s,
    values: s.values.map(v => (v != null && Number.isFinite(v) ? v : null)),
  }))
  return {
    labels: aggregated.labels,
    displayLabels: aggregated.displayLabels,
    series,
    periodAnchorDates,
  }
}

function resolveDailyMean(rows: SentinelHubDailyIndexMeans[], layerId: string, date: string): number | null {
  const row = rows.find(r => r.date?.slice(0, 10) === date.slice(0, 10))
  if (!row) return null
  return evaluateImageryLayerDailyValue(layerId, row)
}

function createMapProgress(onProgress?: (completed: number, total: number) => void) {
  const phases = [0, 0, 0, 0]
  const phaseTotals = [0, 0, 0, 0]
  const emit = () => {
    const done = phases.reduce((a, b) => a + b, 0)
    const total = Math.max(1, phaseTotals.reduce((a, b) => a + b, 0))
    onProgress?.(done, total)
  }
  return (phase: number) => (completed: number, total: number) => {
    phases[phase] = completed
    phaseTotals[phase] = Math.max(total, completed)
    emit()
  }
}

export async function buildTimeSeriesReportPayload(
  input: BuildTimeSeriesReportPayloadInput,
): Promise<TimeSeriesReportPayload> {
  const fastBatch = input.batchExportFastPath === true
  const acquisitionDate = input.acquisitionDate.trim().slice(0, 10)
  const geometry = input.field?.geometry ?? null
  const areaHa = geometry ? geodesicAreaM2(geometry) / 10_000 : 0
  const metrics = geometry ? geometryMetrics(geometry) : null
  const centroidLng = metrics?.centroid?.[0] ?? null
  const centroidLat = metrics?.centroid?.[1] ?? null
  const timeAggregation = input.timeAggregation ?? 'day'
  const mapSnapshotAggregation = input.mapSnapshotAggregation ?? timeAggregation
  const periodAnchorDates = input.periodAnchorDates ?? {}

  const statistics = input.layerSeries.map(s =>
    computeLayerStatistics(s.layerId, input.chartLabels, s.values),
  )

  const interpretations = await Promise.all(
    input.layerIds.map(async layerId => {
      const series =
        input.layerSeries.find(ls => ls.layerId.toUpperCase() === layerId.toUpperCase())?.values ?? []
      let histogram = null
      if (!fastBatch && geometry && layerSupportsClassArea(layerId)) {
        try {
          histogram = await fetchLayerClassAreas({
            geometry,
            layerId,
            sceneDate: acquisitionDate,
          })
        } catch {
          histogram = null
        }
      }
      return buildImageryIndexInterpretation({
        layerId,
        sceneDate: acquisitionDate,
        geometry,
        dailyRows: input.dailyRows,
        chartLabels: input.displayLabels,
        chartValues: series,
        histogram,
      })
    }),
  ).then(rows => rows.filter((x): x is NonNullable<typeof x> => x != null))

  const primaryInterpretation =
    interpretations.find(i => i.layerId === input.layerIds[0]?.toUpperCase()) ?? interpretations[0] ?? null

  const ndviStats = statistics.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null
  const ndmiStats = statistics.find(s => s.layerId.toUpperCase() === 'NDMI') ?? null
  const ndviMean = resolveDailyMean(input.dailyRows, 'NDVI', acquisitionDate)
  const ndmiMean = resolveDailyMean(input.dailyRows, 'NDMI', acquisitionDate)
  let ndwiMean = resolveDailyMean(input.dailyRows, 'NDWI', acquisitionDate)
  let ndwiEstimated = ndwiMean == null
  if (ndwiEstimated && ndmiMean != null) ndwiMean = estimateNdwiFromNdmi(ndmiMean)
  let saviMean = resolveDailyMean(input.dailyRows, 'SAVI', acquisitionDate)
  let saviEstimated = false
  if (saviMean == null && ndviMean != null) {
    saviMean = estimateSaviFromNdvi(ndviMean)
    saviEstimated = true
  }

  const executive: TimeSeriesExecutiveSummary = buildTimeSeriesExecutiveSummary({
    primary: primaryInterpretation,
    ndviMean,
    ndmiMean,
    ndwiMean,
    saviMean,
    ndwiEstimated,
    saviEstimated,
    acquisitionDate,
    ndviStats,
    ndmiStats,
  })

  const mapImageDataUrl =
    !fastBatch && input.includeMap !== false
      ? await fetchFieldMapSnapshot(geometry, input.mapboxToken, 520, 360)
      : null

  const onPhase = createMapProgress(input.onMapSnapshotProgress)

  const wantIndexMaps =
    input.includeMapSnapshots === true ||
    (!fastBatch && input.includeMapSnapshots !== false)
  const wantLulcMaps =
    !fastBatch &&
    (input.includeLulcMapSnapshots ?? (input.includeMapSnapshots !== false))

  // When the panel is already Day, keep its chart axis (proven finite means).
  // Rebuild from dailyRows only when forcing Day over Week/Month/Year aggregation.
  const wantDayMaps = mapSnapshotAggregation === 'day'
  const dayChartForMaps =
    wantDayMaps && timeAggregation !== 'day' && input.dailyRows.length
      ? buildDayChartFromDailyRows(input.layerIds, input.dailyRows, input.fromDate, input.toDate)
      : null
  // Only keep forced Day when the day rebuild actually produced ISO acquisition dates.
  // Otherwise keep panel aggregation aligned with panel chartLabels (avoids week keys + day WMS).
  const dayRebuildOk = Boolean(dayChartForMaps?.labels.length)
  const effectiveMapAggregation: ImageryTimeAggregation = dayRebuildOk ? 'day' : timeAggregation
  const mapChartLabels = dayRebuildOk ? dayChartForMaps!.labels : input.chartLabels
  const mapDisplayLabels = dayRebuildOk ? dayChartForMaps!.displayLabels : input.displayLabels
  const mapLayerSeries = dayRebuildOk ? dayChartForMaps!.series : input.layerSeries
  const mapPeriodAnchors = dayRebuildOk ? dayChartForMaps!.periodAnchorDates : periodAnchorDates

  const snapshotGeometry = geometry ?? input.field?.geometry ?? null
  const wantCumulative = input.includeCumulativeMapSnapshots !== false
  const wantChangeMaps = input.includeChangeDetectionMapSnapshots !== false

  let mapSnapshotGroups =
    wantIndexMaps && snapshotGeometry
      ? await buildTimeSeriesMapSnapshotGroups({
          geometry: snapshotGeometry,
          layerIds: input.layerIds,
          chartLabels: mapChartLabels,
          displayLabels: mapDisplayLabels,
          layerSeries: mapLayerSeries,
          dailyRows: input.dailyRows,
          periodAnchorDates: mapPeriodAnchors,
          areaHa,
          interpretations,
          timeAggregation: effectiveMapAggregation,
          maxDaySnapshots: input.mapSnapshotMaxPerLayer,
          snapshotConcurrency: input.mapSnapshotConcurrency,
          allowBasemapFallback: true,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(0),
        })
      : []

  // If forced-day rebuild produced no cards, retry with the panel chart axis (Week/Month/Day as shown).
  if (
    wantIndexMaps &&
    snapshotGeometry &&
    !mapSnapshotGroups.length &&
    (dayRebuildOk || mapChartLabels !== input.chartLabels)
  ) {
    mapSnapshotGroups = await buildTimeSeriesMapSnapshotGroups({
      geometry: snapshotGeometry,
      layerIds: input.layerIds,
      chartLabels: input.chartLabels,
      displayLabels: input.displayLabels,
      layerSeries: input.layerSeries,
      dailyRows: input.dailyRows,
      periodAnchorDates: periodAnchorDates,
      areaHa,
      interpretations,
      timeAggregation,
      maxDaySnapshots: input.mapSnapshotMaxPerLayer,
      snapshotConcurrency: input.mapSnapshotConcurrency,
      allowBasemapFallback: true,
      mapboxToken: input.mapboxToken,
      signal: input.signal,
      onProgress: onPhase(0),
    })
  }

  // Fill any selected layers that still have no atlas section (e.g. ISS when series matching failed).
  if (wantIndexMaps && snapshotGeometry && input.layerIds.length) {
    const have = new Set(mapSnapshotGroups.map(g => g.layerId.trim().toUpperCase()))
    const missing = input.layerIds
      .map(id => id.trim().toUpperCase())
      .filter(id => id && !have.has(id))
    if (missing.length) {
      const extra = await buildTimeSeriesMapSnapshotGroups({
        geometry: snapshotGeometry,
        layerIds: missing,
        chartLabels: input.chartLabels,
        displayLabels: input.displayLabels,
        layerSeries: input.layerSeries,
        dailyRows: input.dailyRows,
        periodAnchorDates: periodAnchorDates,
        areaHa,
        interpretations,
        timeAggregation: effectiveMapAggregation,
        maxDaySnapshots: input.mapSnapshotMaxPerLayer ?? 12,
        snapshotConcurrency: input.mapSnapshotConcurrency,
        allowBasemapFallback: true,
        mapboxToken: input.mapboxToken,
        signal: input.signal,
        onProgress: onPhase(0),
      })
      if (extra.length) mapSnapshotGroups = [...mapSnapshotGroups, ...extra]
    }
  }

  const cumulativeMapSnapshotGroups =
    wantIndexMaps && wantCumulative && geometry
      ? await buildCumulativeMapSnapshotGroups({
          geometry,
          layerIds: input.layerIds,
          dailyRows: input.dailyRows,
          timeAggregation,
          areaHa,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(1),
        })
      : []

  const lulcBuild =
    wantLulcMaps && geometry
      ? await buildLulcFiveYearMapGroups({
          geometry,
          areaHa,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(2),
        })
      : { groups: [], yearCompositions: [], changeCompositions: [] }
  const lulcMapSnapshotGroups = lulcBuild.groups
  const lulcYearCompositions = lulcBuild.yearCompositions
  const lulcChangeCompositions = lulcBuild.changeCompositions

  const changeDetectionMapSnapshotGroups =
    wantIndexMaps && wantChangeMaps && snapshotGeometry
      ? await buildIndexChangeDetectionMapGroups({
          geometry: snapshotGeometry,
          layerIds: input.layerIds,
          chartLabels: mapChartLabels,
          displayLabels: mapDisplayLabels,
          layerSeries: mapLayerSeries,
          periodAnchorDates: mapPeriodAnchors,
          areaHa,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(3),
        })
      : []

  const ndviSeries =
    input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null

  const vegetationCoverageTimeline =
    !fastBatch && geometry && input.includeVegetationCoverageTimeline !== false
      ? await buildVegetationCoverageTimeline({
          geometry,
          chartLabels: input.chartLabels,
          displayLabels: input.displayLabels,
          periodAnchorDates,
          dailyRows: input.dailyRows,
          ndviSeries,
          enrichWithHistograms: input.enrichVegetationHistograms !== false,
          signal: input.signal,
        })
      : []

  const estimatedWaterLossTimeline = geometry
    ? await (async () => {
        const periodMetaByDate = new Map<string, { seriesIndex: number }>()
        const sceneDates: string[] = []
        for (let i = 0; i < input.chartLabels.length; i += 1) {
          const periodKey = input.chartLabels[i]!
          const sceneDate = (periodAnchorDates?.[periodKey] ?? periodKey).trim().slice(0, 10)
          if (!sceneDate) continue
          sceneDates.push(sceneDate)
          periodMetaByDate.set(sceneDate, { seriesIndex: i })
        }
        const et0MmDayByDate = fastBatch
          ? {}
          : await fetchWaterLossEt0ByDateForField({
              field: input.field,
              fromDate: input.fromDate,
              toDate: input.toDate,
              sceneDates,
              signal: input.signal,
            })
        const { etMmDayByDate, etcMmDayByDate } = buildWaterLossEtByDateMaps({
          sceneDates,
          dailyRows: input.dailyRows,
          layerSeries: input.layerSeries,
          periodMetaByDate,
          et0MmDayByDate,
        })
        return buildEstimatedWaterLossTimeline({
          geometry,
          chartLabels: input.chartLabels,
          displayLabels: input.displayLabels,
          periodAnchorDates,
          dailyRows: input.dailyRows,
          layerSeries: input.layerSeries,
          vegetationCoverageTimeline,
          etMmDayByDate,
          etcMmDayByDate,
          signal: input.signal,
        })
      })()
    : []

  const estimatedYieldTimeline = geometry
    ? buildEstimatedYieldTimeline({
        geometry,
        chartLabels: input.chartLabels,
        displayLabels: input.displayLabels,
        periodAnchorDates,
        dailyRows: input.dailyRows,
        layerSeries: input.layerSeries,
        primaryInterpretation,
        signal: input.signal,
      })
    : []

  const weatherTimeline =
    fastBatch || input.includeWeatherTimeline === false
      ? null
      : await buildTimeSeriesWeatherTimeline({
          geometry,
          fromDate: input.fromDate,
          toDate: input.toDate,
          chartLabels: input.chartLabels,
          displayLabels: input.displayLabels,
          timeAggregation,
          layerSeries: input.layerSeries,
        })

  const correlationBlocks = buildTimeSeriesCorrelationBlocks({
    labels: input.chartLabels,
    displayLabels: input.displayLabels,
    series: input.layerSeries,
    layerIds: input.layerIds,
    // Word uses native ChartML scatter — skip dark/PNG render during export.
    includePng: false,
  })

  const cropRec = buildCropPlantingRecommendations({
    centroidLat,
    centroidLng,
    areaHa,
    weather: weatherTimeline,
    statistics,
    salinityMean: resolveSalinityMeanFromStats(statistics),
    ndviMean: ndviStats?.mean ?? ndviMean,
    ndmiMean: ndmiStats?.mean ?? ndmiMean,
  })

  return {
    projectName: input.projectName?.trim() || 'AgroCloud Satellite Intelligence',
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy?.trim() || 'AgroCloud',
    location: {
      fieldName: input.fieldName,
      fieldKey: input.fieldKey,
      areaHa,
      centroidLng,
      centroidLat,
    },
    period: {
      from: input.fromDate,
      to: input.toDate,
      acquisitionDate,
      timeAggregation,
    },
    layerIds: input.layerIds,
    charts: {
      labels: input.chartLabels,
      displayLabels: input.displayLabels,
      series: input.layerSeries,
      periodAnchorDates,
    },
    statistics,
    interpretations,
    primaryInterpretation,
    executive,
    geometry,
    mapImageDataUrl,
    mapSnapshotGroups,
    cumulativeMapSnapshotGroups,
    lulcMapSnapshotGroups,
    lulcYearCompositions,
    lulcChangeCompositions,
    changeDetectionMapSnapshotGroups,
    vegetationCoverageTimeline,
    estimatedWaterLossTimeline,
    estimatedYieldTimeline,
    weatherTimeline,
    correlationBlocks,
    cropRecommendations: cropRec.bullets,
  }
}
