import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
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
  includeVegetationCoverageTimeline?: boolean
  periodAnchorDates?: Record<string, string>
  timeAggregation?: ImageryTimeAggregation
  signal?: AbortSignal
  onMapSnapshotProgress?: (completed: number, total: number) => void
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
  const acquisitionDate = input.acquisitionDate.trim().slice(0, 10)
  const geometry = input.field?.geometry ?? null
  const areaHa = geometry ? geodesicAreaM2(geometry) / 10_000 : 0
  const metrics = geometry ? geometryMetrics(geometry) : null
  const centroidLng = metrics?.centroid?.[0] ?? null
  const centroidLat = metrics?.centroid?.[1] ?? null
  const timeAggregation = input.timeAggregation ?? 'day'
  const periodAnchorDates = input.periodAnchorDates ?? {}

  const statistics = input.layerSeries.map(s =>
    computeLayerStatistics(s.layerId, input.chartLabels, s.values),
  )

  const interpretations = await Promise.all(
    input.layerIds.map(async layerId => {
      const series =
        input.layerSeries.find(ls => ls.layerId.toUpperCase() === layerId.toUpperCase())?.values ?? []
      let histogram = null
      if (geometry && layerSupportsClassArea(layerId)) {
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
    input.includeMap !== false
      ? await fetchFieldMapSnapshot(geometry, input.mapboxToken, 520, 360)
      : null

  const onPhase = createMapProgress(input.onMapSnapshotProgress)

  const mapSnapshotGroups =
    input.includeMapSnapshots !== false && geometry
      ? await buildTimeSeriesMapSnapshotGroups({
          geometry,
          layerIds: input.layerIds,
          chartLabels: input.chartLabels,
          displayLabels: input.displayLabels,
          layerSeries: input.layerSeries,
          dailyRows: input.dailyRows,
          periodAnchorDates,
          areaHa,
          interpretations,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(0),
        })
      : []

  const cumulativeMapSnapshotGroups =
    input.includeMapSnapshots !== false && geometry
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
    input.includeMapSnapshots !== false && geometry
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
    input.includeMapSnapshots !== false && geometry
      ? await buildIndexChangeDetectionMapGroups({
          geometry,
          layerIds: input.layerIds,
          chartLabels: input.chartLabels,
          displayLabels: input.displayLabels,
          layerSeries: input.layerSeries,
          periodAnchorDates,
          areaHa,
          mapboxToken: input.mapboxToken,
          signal: input.signal,
          onProgress: onPhase(3),
        })
      : []

  const ndviSeries =
    input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null

  const vegetationCoverageTimeline = geometry
    ? await buildVegetationCoverageTimeline({
        geometry,
        chartLabels: input.chartLabels,
        displayLabels: input.displayLabels,
        periodAnchorDates,
        dailyRows: input.dailyRows,
        ndviSeries,
        enrichWithHistograms: input.includeVegetationCoverageTimeline !== false,
        signal: input.signal,
      })
    : []

  const estimatedWaterLossTimeline = geometry
    ? buildEstimatedWaterLossTimeline({
        geometry,
        chartLabels: input.chartLabels,
        displayLabels: input.displayLabels,
        periodAnchorDates,
        dailyRows: input.dailyRows,
        layerSeries: input.layerSeries,
        vegetationCoverageTimeline,
        signal: input.signal,
      })
    : []

  const weatherTimeline = await buildTimeSeriesWeatherTimeline({
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
    weatherTimeline,
    correlationBlocks,
    cropRecommendations: cropRec.bullets,
  }
}
