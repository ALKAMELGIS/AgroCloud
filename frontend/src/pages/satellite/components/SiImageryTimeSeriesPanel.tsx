import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  PieController,
  ScatterController,
  type ChartData,
} from 'chart.js'
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2'
import { useImageryTimeSeriesStream } from '../hooks/useImageryTimeSeriesStream'
import { useMultiLayerAoiTrendStream } from '../hooks/useMultiLayerAoiTrendStream'
import { usePlotLayerTimeSeriesStream } from '../hooks/usePlotLayerTimeSeriesStream'
import { useImageryIndexInterpretation } from '../hooks/useImageryIndexInterpretation'
import {
  buildLulcClassCompositionStats,
  isLulcTimeSeriesSelection,
  lulcCompositionTotalPixels,
  type LulcClassCompositionStat,
} from '../../../lib/siLulcClassAreaLive'
import { isLulcClassificationLayerId } from '../../../lib/siLulcClassification'
import { lulcPctLabelsPlugin } from '../../../lib/lulcCompositionChartPlugin'
import { SiImageryIndexInterpretationCard, type ImageryInterpretationActionId } from './SiImageryIndexInterpretationCard'
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields'
import type { SiAoiMaskBuilderLayerLike } from '../../../lib/siAoiMaskBuilder'
import {
  buildImageryCorrelationScatterAnalysis,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  buildImageryTimeSeriesLayerGroups,
  defaultImageryDateRange,
  imageryLayerChartColor,
  splitSeriesByYear,
  yearSplitChartColors,
  aggregateImageryChartByTimePeriod,
  filterImageryTimeSeriesByDateRange,
  buildNdsiZonalChartBands,
  type ImageryChartType,
  type ImageryCorrelationScatterAnalysis,
  type ImageryTimeAggregation,
  type ImageryTimeSeriesLayerSeries,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { buildCorrelationInterpretation } from '../lib/timeSeriesReport/timeSeriesScatterChartRenderer'
import { AcpImageryLayerMultiSelect } from '../../dashboards/agroCloudPlatform/map/AcpImageryLayerMultiSelect'
import { SiAoiFieldMultiSelect } from '../../dashboards/agroCloudPlatform/map/SiAoiFieldMultiSelect'
import { SiAoiFieldSelect } from '../../dashboards/agroCloudPlatform/map/SiAoiFieldSelect'
import { SiMultiLayerAoiTrendView } from './SiMultiLayerAoiTrendView'
import { SiPlotLayerTimeSeriesView } from './SiPlotLayerTimeSeriesView'
import type { SiImageryAnalysisMode } from '../../../lib/siMultiLayerAoiTrendAnalysis'
import {
  buildSiImageryFieldOptions,
  listSiImageryPlotLabelAttributes,
  resolveSiImageryField,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_PLOT_LABEL_AUTO,
} from '../utils/siImageryTimeSeriesFields'
import { TimeSeriesExportManager } from './timeSeriesReport/ExportManager'
import { SiDynamicMapSnapshotsPanel } from './SiDynamicMapSnapshotsPanel'
import { SiImageryWeatherTab } from './SiImageryWeatherTab'
import '../../dashboards/agroCloudPlatform/AgroCloudPlatformDashboard.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  PieController,
  ScatterController,
  lulcPctLabelsPlugin,
)

export type SiImageryTimeSeriesPanelProps = {
  agroStructuresMask: GeoJSON.FeatureCollection | null
  aoiFields: SiAoiFieldRecord[]
  /** KMZ/KML/SHP/GeoJSON layers from the map Layers panel (polygon features → AOI pickers). */
  vectorLayers?: SiAoiMaskBuilderLayerLike[] | null
  committedAoiGeometry: GeoJSON.Geometry | null
  defaultLayerId: string
  analysisDate: string
  /** When true, end/start dates track latest scene (`analysisDate`) until the user edits them. */
  imageryDateAutoFollow?: boolean
  onMapDateFromChart: (iso: string) => void
  selectedFieldKey?: string | null
  onSelectedFieldKeyChange?: (fieldKey: string) => void
  onHighlightFieldKeysChange?: (
    fieldKeys: string[],
    opts?: { fitBounds?: boolean },
  ) => void
  chartLookbackDays?: number
  mapboxToken?: string
  projectName?: string
  generatedBy?: string
  onStormMapOverlayChange?: (overlay: import('../lib/imageryStormAnalysis').SiTsWeatherStormMapOverlay | null) => void
  stormOverlayDismissEpoch?: number
}

export function SiImageryTimeSeriesPanel({
  agroStructuresMask,
  aoiFields,
  vectorLayers = null,
  committedAoiGeometry,
  defaultLayerId,
  analysisDate,
  imageryDateAutoFollow = true,
  onMapDateFromChart,
  selectedFieldKey: selectedFieldKeyProp,
  onSelectedFieldKeyChange,
  onHighlightFieldKeysChange,
  chartLookbackDays = 90,
  mapboxToken,
  projectName,
  generatedBy,
  onStormMapOverlayChange,
  stormOverlayDismissEpoch = 0,
}: SiImageryTimeSeriesPanelProps) {
  const chartRef = useRef<ChartJS | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const referenceDate = analysisDate.trim().slice(0, 10) || new Date().toISOString().slice(0, 10)
  const defaultRange = useMemo(
    () => defaultImageryDateRange(referenceDate, chartLookbackDays),
    [referenceDate, chartLookbackDays],
  )

  const [plotLabelAttribute, setPlotLabelAttribute] = useState(SI_IMAGERY_PLOT_LABEL_AUTO)

  const plotLabelAttributes = useMemo(
    () => listSiImageryPlotLabelAttributes(vectorLayers),
    [vectorLayers],
  )

  const fieldOptions = useMemo(
    () =>
      buildSiImageryFieldOptions(
        agroStructuresMask,
        aoiFields,
        committedAoiGeometry,
        vectorLayers,
        plotLabelAttribute,
      ),
    [agroStructuresMask, aoiFields, committedAoiGeometry, vectorLayers, plotLabelAttribute],
  )

  const layerGroups = useMemo(() => buildImageryTimeSeriesLayerGroups(), [])

  const [selectedFieldKey, setSelectedFieldKey] = useState('')
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([])
  const [analysisMode, setAnalysisMode] = useState<SiImageryAnalysisMode>('single-layer-trend')
  const [multiSceneDate, setMultiSceneDate] = useState(referenceDate)
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() => {
    const id = defaultLayerId.trim()
    return id ? [id] : ['NDVI']
  })
  const [chartType, setChartType] = useState<ImageryChartType>('line')
  const [timeAggregation, setTimeAggregation] = useState<ImageryTimeAggregation>('day')
  const [areaUnit, setAreaUnit] = useState<'ha' | 'm2'>('ha')
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [splitByYears, setSplitByYears] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null)
  const [activePanelTab, setActivePanelTab] = useState<'chart' | 'interpretation' | 'weather'>('chart')
  const [mapSnapshotsOpen, setMapSnapshotsOpen] = useState(false)
  const [vegTimeline, setVegTimeline] = useState<
    import('../lib/timeSeriesReport/vegetationCoverageTimeline').VegetationCoveragePoint[]
  >([])
  const [waterLossTimeline, setWaterLossTimeline] = useState<
    import('../lib/timeSeriesReport/estimatedWaterLossTimeline').EstimatedWaterLossPoint[]
  >([])
  const [waterLossLoading, setWaterLossLoading] = useState(false)
  const runAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const autoRunReadyRef = useRef(false)
  const prevAutoRunDatesRef = useRef({ from: '', to: '' })
  const emptyChartRetryRef = useRef(0)
  const prevLayerIdsRef = useRef<string[]>(selectedLayerIds)
  const prevDrawnAoiKeyRef = useRef('')
  const datesManuallyEditedRef = useRef(false)
  const prevImageryDateAutoFollowRef = useRef(imageryDateAutoFollow)

  useEffect(() => {
    if (!plotLabelAttribute) return
    if (plotLabelAttributes.some(a => a.name === plotLabelAttribute)) return
    setPlotLabelAttribute(SI_IMAGERY_PLOT_LABEL_AUTO)
  }, [plotLabelAttribute, plotLabelAttributes])

  useEffect(() => {
    // Only clear manual Start/End when auto-follow is turned ON — not while it stays true.
    if (imageryDateAutoFollow && !prevImageryDateAutoFollowRef.current) {
      datesManuallyEditedRef.current = false
    }
    prevImageryDateAutoFollowRef.current = imageryDateAutoFollow
  }, [imageryDateAutoFollow])

  useEffect(() => {
    if (!imageryDateAutoFollow || datesManuallyEditedRef.current) return
    const next = defaultImageryDateRange(referenceDate, chartLookbackDays)
    setFromDate(next.from)
    setToDate(next.to)
    setDateError(null)
    setMultiSceneDate(referenceDate)
  }, [imageryDateAutoFollow, referenceDate, chartLookbackDays])

  const resolvedFields = useMemo(
    () =>
      selectedFieldKeys
        .map(key =>
          resolveSiImageryField(
            agroStructuresMask,
            aoiFields,
            committedAoiGeometry,
            key,
            vectorLayers,
            plotLabelAttribute,
          ),
        )
        .filter((f): f is NonNullable<typeof f> => f != null),
    [agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKeys, vectorLayers, plotLabelAttribute],
  )

  const {
    timeline: multiAoiTimeline,
    loading: multiAoiLoading,
    refreshing: multiAoiRefreshing,
    error: multiAoiError,
    hasRun: multiAoiHasRun,
    analysisDurationMs: multiAoiDurationMs,
    progress: multiAoiProgress,
    hasChartData: multiAoiHasChartData,
    run: runMultiAoiAnalysis,
    invalidateResults: invalidateMultiAoiResults,
  } = useMultiLayerAoiTrendStream({
    fields: resolvedFields,
    layerIds: selectedLayerIds,
    fromDate,
    toDate: multiSceneDate || toDate,
    timeAggregation,
    sceneDate: multiSceneDate,
  })

  const primaryLayerIdForPlots = selectedLayerIds[0]?.trim() || 'NDVI'

  const {
    result: plotLayerTsResult,
    loading: plotLayerTsLoading,
    refreshing: plotLayerTsRefreshing,
    error: plotLayerTsError,
    warning: plotLayerTsWarning,
    hasRun: plotLayerTsHasRun,
    analysisDurationMs: plotLayerTsDurationMs,
    progress: plotLayerTsProgress,
    hasChartData: plotLayerTsHasChartData,
    run: runPlotLayerTsAnalysis,
    invalidateResults: invalidatePlotLayerTsResults,
  } = usePlotLayerTimeSeriesStream({
    fields: resolvedFields,
    layerId: primaryLayerIdForPlots,
    fromDate,
    toDate,
    timeAggregation,
  })

  const resolvedField = useMemo(
    () =>
      selectedFieldKey
        ? resolveSiImageryField(
            agroStructuresMask,
            aoiFields,
            committedAoiGeometry,
            selectedFieldKey,
            vectorLayers,
            plotLabelAttribute,
          )
        : null,
    [agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKey, vectorLayers, plotLabelAttribute],
  )

  const {
    labels: rawLabels,
    layerSeries: rawLayerSeries,
    dailyRows,
    loading,
    refreshing,
    error,
    hasRun,
    analysisDurationMs,
    hasChartData,
    chartReady,
    run: runAnalysis,
    invalidateResults,
  } = useImageryTimeSeriesStream({
    field: resolvedField,
    fromDate,
    toDate,
    layerIds: selectedLayerIds,
    referenceDate,
    prefetchLookbackDays: Math.max(chartLookbackDays, 365),
  })

  const rangeFilteredChart = useMemo(
    () => filterImageryTimeSeriesByDateRange(rawLabels, rawLayerSeries, fromDate, toDate),
    [rawLabels, rawLayerSeries, fromDate, toDate],
  )

  const filteredDailyRows = useMemo(
    () =>
      dailyRows.filter(row => {
        const day = row.date.slice(0, 10)
        return day >= fromDate && day <= toDate
      }),
    [dailyRows, fromDate, toDate],
  )

  const aggregatedChart = useMemo(
    () =>
      aggregateImageryChartByTimePeriod(
        rangeFilteredChart.labels,
        rangeFilteredChart.series,
        timeAggregation,
      ),
    [rangeFilteredChart.labels, rangeFilteredChart.series, timeAggregation],
  )

  const labels = aggregatedChart.labels
  const chartLabels = aggregatedChart.displayLabels
  const layerSeries = aggregatedChart.series
  const periodAnchorDate = aggregatedChart.periodAnchorDate
  const periodAnchorDates = useMemo(
    () => Object.fromEntries(periodAnchorDate.entries()),
    [periodAnchorDate],
  )

  useEffect(() => {
    if (!hasRun || !resolvedField?.geometry || !labels.length) {
      setVegTimeline([])
      setWaterLossTimeline([])
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setWaterLossLoading(true)
    void (async () => {
      try {
        const { buildVegetationCoverageTimeline } = await import(
          '../lib/timeSeriesReport/vegetationCoverageTimeline'
        )
        const { buildEstimatedWaterLossTimeline } = await import(
          '../lib/timeSeriesReport/estimatedWaterLossTimeline'
        )
        const ndviSeries = layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null
        // Keep veg timeline internal for water-loss enrichment only — not shown on chart/UI.
        const timeline = await buildVegetationCoverageTimeline({
          geometry: resolvedField.geometry,
          chartLabels: labels,
          displayLabels: chartLabels,
          periodAnchorDates,
          dailyRows: filteredDailyRows,
          ndviSeries,
          enrichWithHistograms: false,
          signal: ac.signal,
        })
        if (cancelled || ac.signal.aborted) return
        setVegTimeline(timeline)
        const water = buildEstimatedWaterLossTimeline({
          geometry: resolvedField.geometry,
          chartLabels: labels,
          displayLabels: chartLabels,
          periodAnchorDates,
          dailyRows: filteredDailyRows,
          layerSeries,
          vegetationCoverageTimeline: timeline,
          signal: ac.signal,
        })
        if (!cancelled && !ac.signal.aborted) setWaterLossTimeline(water)
      } catch {
        if (!cancelled) {
          setVegTimeline([])
          setWaterLossTimeline([])
        }
      } finally {
        if (!cancelled) {
          setWaterLossLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [
    hasRun,
    resolvedField?.geometry,
    labels,
    chartLabels,
    periodAnchorDates,
    filteredDailyRows,
    layerSeries,
  ])

  /** ET chart series comes only from selected layers (same as NDVI/NDMI) — no permanent overlay. */
  const etLayerSelected = selectedLayerIds.some(id => id.trim().toUpperCase() === 'ET')
  const lulcAreaMode = isLulcTimeSeriesSelection(selectedLayerIds)
  /** Class-share bar/pie (% of total) — matches LULC statistics reference chart. */
  const lulcCompositionMode = lulcAreaMode && (chartType === 'bar' || chartType === 'pie')
  const areaUnitLabel = areaUnit === 'ha' ? 'ha' : 'm²'
  const areaUnitFactor = areaUnit === 'ha' ? 1 : 10_000

  const displayLayerSeries = useMemo(() => {
    if (!lulcAreaMode) return layerSeries
    return layerSeries.map(entry => ({
      ...entry,
      values: entry.values.map(v =>
        v == null || !Number.isFinite(v) ? null : Number(v) * areaUnitFactor,
      ),
    }))
  }, [layerSeries, lulcAreaMode, areaUnitFactor])

  const compositionDateIndex = useMemo(() => {
    if (!lulcAreaMode || !labels.length) return -1
    if (selectedChartDate) {
      const i = labels.indexOf(selectedChartDate)
      if (i >= 0) return i
    }
    return labels.length - 1
  }, [lulcAreaMode, labels, selectedChartDate])

  const lulcComposition = useMemo((): LulcClassCompositionStat[] => {
    if (!lulcAreaMode || compositionDateIndex < 0) return []
    // Use hectare series (not display m² conversion) for pixel-count derivation.
    return buildLulcClassCompositionStats(layerSeries, compositionDateIndex, {
      includeAllClasses: true,
    })
  }, [lulcAreaMode, layerSeries, compositionDateIndex])

  const lulcCompositionPresent = useMemo(
    () => lulcComposition.filter(r => r.pixelCount > 0),
    [lulcComposition],
  )

  const lulcTotalPixels = useMemo(
    () => lulcCompositionTotalPixels(lulcComposition),
    [lulcComposition],
  )

  const latestWaterPoint =
    etLayerSelected && waterLossTimeline.length
      ? waterLossTimeline[waterLossTimeline.length - 1]!
      : null

  const resolvePeriodMapDate = useCallback(
    (periodKey: string): string => {
      const anchor = periodAnchorDate.get(periodKey)
      return (anchor ?? periodKey).trim().slice(0, 10)
    },
    [periodAnchorDate],
  )

  const primaryLayerId = selectedLayerIds[0]?.trim() || 'NDVI'
  const ndsiSnowOnly =
    selectedLayerIds.length === 1 && selectedLayerIds[0]!.trim().toUpperCase() === 'NDSI'

  const ndsiZonalBands = useMemo(
    () => (ndsiSnowOnly ? buildNdsiZonalChartBands(labels, filteredDailyRows) : null),
    [ndsiSnowOnly, labels, filteredDailyRows],
  )

  const weatherTabSupported = hasRun && chartReady && !!resolvedField?.geometry

  const primaryChartValues = useMemo(() => {
    if (lulcAreaMode) {
      return displayLayerSeries[0]?.values ?? []
    }
    const series = displayLayerSeries.find(s => s.layerId.toUpperCase() === primaryLayerId.toUpperCase())
    return series?.values ?? displayLayerSeries[0]?.values ?? []
  }, [displayLayerSeries, primaryLayerId, lulcAreaMode])

  const interpretSceneDate = useMemo(() => {
    const picked = selectedChartDate?.trim()
    if (picked) {
      if (labels.includes(picked)) return resolvePeriodMapDate(picked)
      const day = picked.slice(0, 10)
      if (rawLabels.includes(day)) return day
      if (rangeFilteredChart.labels.some(l => l.slice(0, 10) === day)) return day
    }
    const mapDay = referenceDate.trim().slice(0, 10)
    if (mapDay && rawLabels.includes(mapDay)) return mapDay
    if (mapDay && rangeFilteredChart.labels.some(l => l.slice(0, 10) === mapDay)) return mapDay
    const lastKey = labels[labels.length - 1]
    return lastKey ? resolvePeriodMapDate(lastKey) : ''
  }, [selectedChartDate, referenceDate, labels, rawLabels, rangeFilteredChart.labels, resolvePeriodMapDate])

  const interpretationSupported =
    hasRun && labels.length > 0 && chartType !== 'scatter' && chartType !== 'pie'

  const { interpretation, loadingAreas } = useImageryIndexInterpretation({
    field: resolvedField,
    layerId: primaryLayerId,
    sceneDate: interpretSceneDate,
    dailyRows: filteredDailyRows,
    chartLabels: chartLabels,
    chartValues: primaryChartValues,
    enabled: activePanelTab === 'interpretation' && interpretationSupported,
  })

  const handleInterpretationAction = useCallback(
    (actionId: ImageryInterpretationActionId) => {
      const scene = interpretation?.sceneDate?.trim().slice(0, 10)
      if (scene) onMapDateFromChart(scene)
      if (actionId === 'inspect-stress' || actionId === 'scout-moderate') {
        setActivePanelTab('interpretation')
      }
    },
    [interpretation?.sceneDate, onMapDateFromChart],
  )

  const handleInvalidate = useCallback(() => {
    invalidateResults()
    invalidateMultiAoiResults()
    invalidatePlotLayerTsResults()
    autoRunReadyRef.current = false
    setDateError(null)
    setSelectedChartDate(null)
    setActivePanelTab('chart')
  }, [invalidateResults, invalidateMultiAoiResults, invalidatePlotLayerTsResults])

  const displayError = dateError || error

  useEffect(() => {
    if (!fieldOptions.length) {
      setSelectedFieldKey('')
      return
    }
    const external = selectedFieldKeyProp?.trim()
    if (external && fieldOptions.some(o => o.fieldKey === external)) {
      setSelectedFieldKey(external)
      return
    }
    setSelectedFieldKey(prev =>
      prev && fieldOptions.some(o => o.fieldKey === prev) ? prev : fieldOptions[0]!.fieldKey,
    )
  }, [fieldOptions, selectedFieldKeyProp])

  useEffect(() => {
    if (!fieldOptions.length) {
      setSelectedFieldKeys([])
      return
    }
    setSelectedFieldKeys(prev => {
      const kept = prev.filter(key => fieldOptions.some(o => o.fieldKey === key))
      if (kept.length) return kept
      // Plot time series benefits from more plots by default.
      const take = analysisMode === 'plot-layer-time-series' ? Math.min(12, fieldOptions.length) : Math.min(3, fieldOptions.length)
      return fieldOptions.slice(0, take).map(o => o.fieldKey)
    })
  }, [fieldOptions, analysisMode])

  const runMultiAoiWrapped = useCallback(async () => {
    autoRunReadyRef.current = true
    await runMultiAoiAnalysis()
  }, [runMultiAoiAnalysis])

  const runPlotLayerTsWrapped = useCallback(async () => {
    autoRunReadyRef.current = true
    await runPlotLayerTsAnalysis()
  }, [runPlotLayerTsAnalysis])

  const handleMultiAoiHighlight = useCallback(
    (fieldKey: string) => {
      onSelectedFieldKeyChange?.(fieldKey)
      onHighlightFieldKeysChange?.([fieldKey], { fitBounds: true })
    },
    [onSelectedFieldKeyChange, onHighlightFieldKeysChange],
  )

  const handleFieldSelectHighlight = useCallback(
    (fieldKey: string) => {
      handleInvalidate()
      setSelectedFieldKey(fieldKey)
      if (fieldKey) {
        onSelectedFieldKeyChange?.(fieldKey)
        onHighlightFieldKeysChange?.([fieldKey], { fitBounds: true })
      }
    },
    [handleInvalidate, onSelectedFieldKeyChange, onHighlightFieldKeysChange],
  )

  const handleFieldPreviewHighlight = useCallback(
    (fieldKey: string | null) => {
      if (!fieldKey) return
      onHighlightFieldKeysChange?.([fieldKey], { fitBounds: false })
    },
    [onHighlightFieldKeysChange],
  )

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (!multiAoiHasRun || multiAoiLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !multiSceneDate || !fromDate) return
    if (fromDate > multiSceneDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runMultiAoiWrapped(), 650)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    fromDate,
    resolvedFields,
    multiAoiHasRun,
    multiAoiLoading,
    runMultiAoiWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (multiAoiHasRun || multiAoiLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !multiSceneDate || !fromDate) return
    if (fromDate > multiSceneDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runMultiAoiWrapped(), 500)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    fromDate,
    resolvedFields,
    multiAoiHasRun,
    multiAoiLoading,
    runMultiAoiWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (
      selectedFieldKeys.length &&
      selectedLayerIds.length &&
      multiSceneDate &&
      fromDate &&
      fromDate <= multiSceneDate &&
      resolvedFields.length
    )
      return
    invalidateMultiAoiResults()
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    fromDate,
    resolvedFields,
    invalidateMultiAoiResults,
  ])

  useEffect(() => {
    if (analysisMode !== 'plot-layer-time-series') return
    if (!plotLayerTsHasRun || plotLayerTsLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !fromDate || !toDate || fromDate > toDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runPlotLayerTsWrapped(), 700)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    fromDate,
    toDate,
    resolvedFields,
    plotLayerTsHasRun,
    plotLayerTsLoading,
    runPlotLayerTsWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'plot-layer-time-series') return
    if (plotLayerTsHasRun || plotLayerTsLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !fromDate || !toDate || fromDate > toDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runPlotLayerTsWrapped(), 550)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    fromDate,
    toDate,
    resolvedFields,
    plotLayerTsHasRun,
    plotLayerTsLoading,
    runPlotLayerTsWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'plot-layer-time-series') return
    if (selectedFieldKeys.length && selectedLayerIds.length && fromDate && toDate && fromDate <= toDate && resolvedFields.length)
      return
    invalidatePlotLayerTsResults()
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    fromDate,
    toDate,
    resolvedFields,
    invalidatePlotLayerTsResults,
  ])

  useEffect(() => {
    if (!committedAoiGeometry) {
      prevDrawnAoiKeyRef.current = ''
      return
    }
    let geomKey = ''
    try {
      geomKey = JSON.stringify(committedAoiGeometry)
    } catch {
      return
    }
    if (!geomKey || geomKey === prevDrawnAoiKeyRef.current) return
    prevDrawnAoiKeyRef.current = geomKey
    if (!fieldOptions.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)) return
    setSelectedFieldKey(SI_IMAGERY_COMMITTED_AOI_KEY)
    onSelectedFieldKeyChange?.(SI_IMAGERY_COMMITTED_AOI_KEY)
    invalidateResults()
  }, [committedAoiGeometry, fieldOptions, onSelectedFieldKeyChange, invalidateResults])

  useEffect(() => {
    if (selectedLayerIds.length > 1 && splitByYears) setSplitByYears(false)
  }, [selectedLayerIds.length, splitByYears])

  useEffect(() => {
    if (!lulcAreaMode) return
    if (chartType === 'scatter') setChartType('bar')
  }, [lulcAreaMode, chartType])

  const wasLulcAreaModeRef = useRef(false)
  useEffect(() => {
    if (lulcAreaMode && !wasLulcAreaModeRef.current) {
      setChartType('bar')
      setAreaUnit('ha')
    }
    wasLulcAreaModeRef.current = lulcAreaMode
  }, [lulcAreaMode])

  useEffect(() => {
    if (timeAggregation !== 'day' && splitByYears) setSplitByYears(false)
  }, [timeAggregation, splitByYears])

  useEffect(() => {
    if ((chartType === 'pie' || chartType === 'scatter') && splitByYears) setSplitByYears(false)
  }, [chartType, splitByYears])

  const syncMapToChartDate = useCallback(
    (isoDate: string) => {
      const day = isoDate.trim().slice(0, 10)
      if (!day || day.length < 10) return
      onMapDateFromChart(day)
    },
    [onMapDateFromChart],
  )

  const selectedFieldLabel =
    fieldOptions.find(o => o.fieldKey === selectedFieldKey)?.displayName ?? '—'

  const exportFieldKeys = useMemo(() => {
    if (
      (analysisMode === 'multi-layer-aoi-comparison' || analysisMode === 'plot-layer-time-series') &&
      selectedFieldKeys.length
    ) {
      return selectedFieldKeys
    }
    return fieldOptions.map(o => o.fieldKey)
  }, [analysisMode, selectedFieldKeys, fieldOptions])

  const resolveExportPlotsForLabel = useCallback(
    (labelAttribute: string) =>
      exportFieldKeys
        .map(key =>
          resolveSiImageryField(
            agroStructuresMask,
            aoiFields,
            committedAoiGeometry,
            key,
            vectorLayers,
            labelAttribute,
          ),
        )
        .filter((f): f is NonNullable<typeof f> => !!f?.geometry),
    [exportFieldKeys, agroStructuresMask, aoiFields, committedAoiGeometry, vectorLayers],
  )

  const resolveExportFieldForLabel = useCallback(
    (labelAttribute: string) =>
      selectedFieldKey
        ? resolveSiImageryField(
            agroStructuresMask,
            aoiFields,
            committedAoiGeometry,
            selectedFieldKey,
            vectorLayers,
            labelAttribute,
          )
        : null,
    [selectedFieldKey, agroStructuresMask, aoiFields, committedAoiGeometry, vectorLayers],
  )

  const exportPlots = useMemo(
    () => resolveExportPlotsForLabel(plotLabelAttribute),
    [resolveExportPlotsForLabel, plotLabelAttribute],
  )

  const exportAoiName = useMemo(() => {
    if (
      (analysisMode === 'multi-layer-aoi-comparison' || analysisMode === 'plot-layer-time-series') &&
      selectedFieldKeys.length
    ) {
      return `${selectedFieldKeys.length} selected plots`
    }
    return `${exportPlots.length} plots`
  }, [analysisMode, selectedFieldKeys, exportPlots.length])

  const runAnalysisWrapped = useCallback(async () => {
    prevAutoRunDatesRef.current = { from: fromDate, to: toDate }
    autoRunReadyRef.current = true
    await runAnalysis()
  }, [runAnalysis, fromDate, toDate])

  runAnalysisRef.current = runAnalysisWrapped

  /** Date edits must immediately drive a new fetch for the selected window. */
  const applyDateChange = useCallback(
    (nextFrom: string, nextTo: string) => {
      datesManuallyEditedRef.current = true
      setSelectedChartDate(null)
      setFromDate(nextFrom)
      setToDate(nextTo)
      if (nextFrom && nextTo && nextFrom >= nextTo) {
        setDateError('Start Date must be before End Date.')
        return
      }
      setDateError(null)
      // Force the auto-run effect to treat this as a new window.
      prevAutoRunDatesRef.current = { from: '', to: '' }
      emptyChartRetryRef.current = 0
      // Drop stale series so the canvas does not keep showing the old window.
      if (analysisMode === 'single-layer-trend') {
        invalidateResults()
      }
    },
    [analysisMode, invalidateResults],
  )

  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [chartReady, chartType])

  useEffect(() => {
    if (analysisMode !== 'single-layer-trend') return
    if (!selectedFieldKey || dateError) return
    if (!fromDate || !toDate || fromDate >= toDate) return
    const prev = prevAutoRunDatesRef.current
    if (prev.from === fromDate && prev.to === toDate && hasRun) return
    // Re-run whenever the toolbar range changes (including first run after edit).
    const id = window.setTimeout(() => void runAnalysisRef.current(), 280)
    return () => window.clearTimeout(id)
  }, [fromDate, toDate, selectedFieldKey, hasRun, dateError, analysisMode])

  useEffect(() => {
    if (analysisMode !== 'single-layer-trend') return
    if (hasRun || loading) return
    if (!selectedFieldKey || !fromDate || !toDate || fromDate >= toDate || dateError) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 280)
    return () => window.clearTimeout(id)
  }, [selectedFieldKey, fromDate, toDate, selectedLayerIds, hasRun, loading, dateError, analysisMode])

  useEffect(() => {
    const id = defaultLayerId.trim()
    if (!id) return
    setSelectedLayerIds(prev => {
      if (prev.length !== 1) return prev
      if (prev[0]!.trim().toUpperCase() === id.toUpperCase()) return prev
      return [id]
    })
  }, [defaultLayerId])

  useEffect(() => {
    if (analysisMode !== 'single-layer-trend') return
    const prev = prevLayerIdsRef.current
    const same =
      prev.length === selectedLayerIds.length &&
      prev.every((layerId, index) => layerId === selectedLayerIds[index])
    prevLayerIdsRef.current = selectedLayerIds
    if (same || loading) return
    if (!selectedFieldKey || !fromDate || !toDate || fromDate >= toDate || dateError) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 400)
    return () => window.clearTimeout(id)
  }, [selectedLayerIds, hasRun, loading, selectedFieldKey, fromDate, toDate, dateError, analysisMode])

  useEffect(() => {
    if (analysisMode !== 'single-layer-trend') return
    if (labels.length > 0) {
      emptyChartRetryRef.current = 0
      return
    }
    // Retry empty/error runs a few times — abort races used to leave a permanent "No NDVI" state.
    if (!hasRun || loading) return
    if (!selectedFieldKey || !fromDate || !toDate || fromDate >= toDate || dateError) return
    if (emptyChartRetryRef.current >= 2) return
    emptyChartRetryRef.current += 1
    const id = window.setTimeout(() => void runAnalysisRef.current(), 700)
    return () => window.clearTimeout(id)
  }, [hasRun, loading, labels.length, error, selectedFieldKey, fromDate, toDate, dateError, selectedLayerIds, analysisMode])

  const chartDateClickHandler = useCallback(
    (_event: unknown, elements: Array<{ index: number; datasetIndex?: number }>) => {
      if (!elements.length) return
      const el = elements[0]!
      if (el.datasetIndex != null && el.datasetIndex > 0) return
      const periodKey = labels[el.index]
      if (periodKey) {
        setSelectedChartDate(periodKey)
        syncMapToChartDate(resolvePeriodMapDate(periodKey))
        if (chartType !== 'scatter' && chartType !== 'pie') {
          setActivePanelTab('interpretation')
        }
      }
    },
    [labels, syncMapToChartDate, resolvePeriodMapDate, chartType],
  )

  const chartData = useMemo((): ChartData<'line' | 'bar'> => {
    if (lulcCompositionMode && chartType === 'bar') {
      if (!lulcComposition.length) return { labels: [], datasets: [] }
      return {
        labels: lulcComposition.map(r => r.shortLabel),
        datasets: [
          {
            label: '% of total area',
            data: lulcComposition.map(r => Number(r.pctOfTotal.toFixed(1))),
            backgroundColor: lulcComposition.map(r => r.color),
            borderColor: lulcComposition.map(r => r.color),
            borderWidth: 0,
            borderRadius: 2,
            maxBarThickness: 56,
          },
        ],
      }
    }
    if (!chartLabels.length || !displayLayerSeries.length) {
      return { labels: [], datasets: [] }
    }
    if (splitByYears && displayLayerSeries.length === 1 && timeAggregation === 'day') {
      const values = displayLayerSeries[0]!.values.map(v =>
        v == null || !Number.isFinite(v) ? NaN : Number(v),
      )
      const splits = splitSeriesByYear(labels, values)
      const colors = yearSplitChartColors()
      return {
        labels: splits[0]?.labels ?? [],
        datasets: splits.map((s, i) => ({
          label: String(s.year),
          data: s.values,
          borderColor: colors[i % colors.length],
          backgroundColor: chartType === 'area' ? `${colors[i % colors.length]}33` : colors[i % colors.length],
          fill: chartType === 'area',
          tension: 0.25,
          pointRadius: 1.5,
          borderWidth: 1.5,
        })),
      }
    }
    return {
      labels: chartLabels,
      datasets: [
        ...displayLayerSeries.flatMap((entry, index) => {
          const color = entry.color || imageryLayerChartColor(index)
          const isNdsiLayer = entry.layerId.trim().toUpperCase() === 'NDSI'
          const seriesLabel = entry.label || (isNdsiLayer ? 'NDSI mean' : entry.layerId)
          const data = entry.values.map(v => (v == null || !Number.isFinite(v) ? NaN : Number(v)))
          const datasets: Array<Record<string, unknown>> = [
            {
              label: seriesLabel,
              data,
              borderColor: color,
              backgroundColor: chartType === 'area' ? `${color}55` : chartType === 'bar' ? `${color}88` : color,
              fill: chartType === 'area',
              tension: 0.25,
              pointRadius: lulcAreaMode ? 1.5 : 2,
              borderWidth: isNdsiLayer ? 2.25 : 1.5,
              yAxisID: 'y',
              ...(lulcAreaMode && (chartType === 'area' || chartType === 'bar')
                ? { stack: 'lulc-area' }
                : {}),
            },
          ]
          if (isNdsiLayer && ndsiZonalBands && chartType === 'line') {
            datasets.push(
              {
                label: 'NDSI min',
                data: ndsiZonalBands.min,
                borderColor: '#7dd3fc',
                backgroundColor: 'transparent',
                borderDash: [4, 3],
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 1.25,
                yAxisID: 'y',
              },
              {
                label: 'NDSI max',
                data: ndsiZonalBands.max,
                borderColor: '#e0f2fe',
                backgroundColor: 'transparent',
                borderDash: [2, 2],
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 1.25,
                yAxisID: 'y',
              },
            )
          }
          return datasets
        }),
      ],
    }
  }, [
    chartLabels,
    labels,
    displayLayerSeries,
    splitByYears,
    chartType,
    timeAggregation,
    ndsiZonalBands,
    lulcAreaMode,
    lulcCompositionMode,
    lulcComposition,
  ])

  const pieChartData = useMemo((): ChartData<'pie'> => {
    if (lulcCompositionMode && lulcComposition.length) {
      return {
        labels: lulcComposition.map(r => r.shortLabel),
        datasets: [
          {
            label: '% of total area',
            data: lulcComposition.map(r => Number(r.pctOfTotal.toFixed(1))),
            backgroundColor: lulcComposition.map(r => `${r.color}cc`),
            borderColor: '#0a0a0a',
            borderWidth: 1,
          },
        ],
      }
    }
    if (!chartLabels.length || !displayLayerSeries.length) return { labels: [], datasets: [] }
    if (displayLayerSeries.length === 1 && timeAggregation !== 'day') {
      const values = displayLayerSeries[0]!.values
      const slices = chartLabels
        .map((label, i) => ({ label, value: values[i] }))
        .filter(row => row.value != null && Number.isFinite(row.value))
      if (!slices.length) return { labels: [], datasets: [] }
      return {
        labels: slices.map(s => s.label),
        datasets: [
          {
            label: `${timeAggregation} mean`,
            data: slices.map(s => s.value as number),
            backgroundColor: slices.map((_, i) => `${imageryLayerChartColor(i)}cc`),
            borderColor: '#0a0a0a',
            borderWidth: 1,
          },
        ],
      }
    }
    const slices = buildImageryPieChartSlices(labels, displayLayerSeries)
    if (!slices.labels.length) return { labels: [], datasets: [] }
    return {
      labels: slices.labels,
      datasets: [
        {
          label: displayLayerSeries.length > 1 ? 'Layer mean' : 'Monthly mean',
          data: slices.values,
          backgroundColor: slices.labels.map((_, i) => `${imageryLayerChartColor(i)}cc`),
          borderColor: '#0a0a0a',
          borderWidth: 1,
        },
      ],
    }
  }, [chartLabels, labels, displayLayerSeries, timeAggregation, lulcCompositionMode, lulcComposition])

  const scatterAxisDates = useMemo(
    () => labels.map(key => resolvePeriodMapDate(key)),
    [labels, resolvePeriodMapDate],
  )

  const scatterCorrelation = useMemo((): ImageryCorrelationScatterAnalysis | null => {
    if (chartType !== 'scatter' || layerSeries.length < 2 || !scatterAxisDates.length) return null
    const xSeries = layerSeries[0]!
    const ySeries = layerSeries[1]!
    return buildImageryCorrelationScatterAnalysis(
      scatterAxisDates,
      xSeries.layerId,
      xSeries.values,
      ySeries.layerId,
      ySeries.values,
    )
  }, [chartType, scatterAxisDates, layerSeries])

  const scatterChartData = useMemo((): ChartData<'scatter' | 'line'> => {
    if (!scatterAxisDates.length || !layerSeries.length) return { labels: [], datasets: [] }

    if (scatterCorrelation && scatterCorrelation.points.length >= 2) {
      return {
        datasets: [
          {
            type: 'scatter' as const,
            label: 'Paired scenes',
            data: scatterCorrelation.points.map(point => ({ x: point.x, y: point.y })),
            borderColor: '#ecfeff',
            backgroundColor: 'rgba(45, 212, 191, 0.85)',
            borderWidth: 1.5,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
          {
            type: 'line' as const,
            label: `Linear fit · R²=${scatterCorrelation.regression.r2.toFixed(3)}`,
            data: scatterCorrelation.regressionLine,
            borderColor: '#fbbf24',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            tension: 0,
            showLine: true,
          },
        ],
      }
    }

    return {
      datasets: layerSeries.map((entry, index) => {
        const color = imageryLayerChartColor(index)
        return {
          type: 'scatter' as const,
          label: entry.layerId,
          data: buildImageryScatterPoints(scatterAxisDates, entry.values),
          borderColor: color,
          backgroundColor: `${color}cc`,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      }),
    }
  }, [scatterAxisDates, layerSeries, scatterCorrelation])

  const cartesianChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartReady ? 280 : 0 },
      layout: {
        padding: {
          top: lulcCompositionMode && chartType === 'bar' ? 22 : 14,
          right: 10,
          bottom: 8,
          left: 6,
        },
      },
      onClick: lulcCompositionMode ? undefined : chartDateClickHandler,
      plugins: {
        legend: {
          display: lulcCompositionMode
            ? false
            : splitByYears || layerSeries.length > 1 || hasRun,
          position: 'bottom' as const,
          align: 'center' as const,
          fullSize: true,
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            boxHeight: 8,
            padding: 16,
            font: { size: 9 },
            usePointStyle: false,
          },
        },
        lulcPctLabels: {
          enabled: lulcCompositionMode && chartType === 'bar',
          labels: lulcComposition.map(r => `${Math.round(r.pctOfTotal)}%`),
        },
        tooltip: {
          bodyFont: { size: 10 },
          titleFont: { size: 10 },
          callbacks: {
            afterBody: (items: Array<{ dataIndex?: number; parsed: { y: number | null } }>) => {
              if (lulcCompositionMode) {
                const idx = items[0]?.dataIndex ?? -1
                const row = idx >= 0 ? lulcComposition[idx] : null
                if (!row) return []
                const area =
                  areaUnit === 'ha'
                    ? `${row.areaHa.toFixed(2)} ha`
                    : `${Math.round(row.areaM2).toLocaleString('en-US')} m²`
                return [
                  `Pixels: ${row.pixelCount.toLocaleString('en-US')}`,
                  `Area: ${area}`,
                  `% of total: ${row.pctOfTotal.toFixed(1)}%`,
                ]
              }
              const lines = ['Click point to set map date']
              const ys = items.map(item => item.parsed.y).filter(v => v != null && Number.isFinite(v)) as number[]
              if (ys.length >= 2) {
                const spread = Math.max(...ys) - Math.min(...ys)
                if (spread > 0.0001) lines.push(`Range spread: ${spread.toFixed(3)}`)
              }
              return lines
            },
            label(ctx: {
              dataset: { label?: string }
              parsed: { y: number | null }
              dataIndex?: number
            }) {
              const v = ctx.parsed.y
              if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label ?? 'Value'}: —`
              if (lulcCompositionMode) {
                const row = lulcComposition[ctx.dataIndex ?? -1]
                const name = row?.name ?? ctx.dataset.label ?? 'Class'
                return `${name}: ${v.toFixed(1)}% of total area`
              }
              if (lulcAreaMode) {
                const digits = areaUnit === 'ha' ? 2 : 0
                return `${ctx.dataset.label ?? 'Class'}: ${v.toFixed(digits)} ${areaUnitLabel}`
              }
              const label = String(ctx.dataset.label ?? 'Value')
              const upper = label.toUpperCase()
              if (upper.includes('LST')) return `${label}: ${v.toFixed(2)} °C`
              if (upper === 'ET' || upper.startsWith('ET ')) return `${label}: ${v.toFixed(2)} mm/day`
              return `${label}: ${v.toFixed(4)}`
            },
          },
        },
      },
      scales: {
        x: {
          stacked: !lulcCompositionMode && lulcAreaMode && (chartType === 'area' || chartType === 'bar'),
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: lulcCompositionMode
              ? Math.max(lulcComposition.length, 4)
              : Math.min(12, Math.max(chartLabels.length, 4)),
            autoSkip: !lulcCompositionMode && chartLabels.length > 12,
            maxRotation: lulcCompositionMode || chartLabels.length > 8 ? 40 : 0,
            minRotation: lulcCompositionMode || chartLabels.length > 8 ? 25 : 0,
            font: { size: 9 },
            padding: 6,
          },
          grid: {
            color: lulcCompositionMode ? 'transparent' : 'rgba(255,255,255,0.06)',
            drawBorder: true,
          },
        },
        y: {
          grace: lulcCompositionMode ? '12%' : '8%',
          beginAtZero: true,
          max: lulcCompositionMode && chartType === 'bar' ? 100 : undefined,
          title: lulcCompositionMode
            ? {
                display: true,
                text: '% of total area',
                color: 'rgba(255,255,255,0.72)',
                font: { size: 9, weight: 600 },
              }
            : lulcAreaMode
              ? {
                  display: true,
                  text: `Class area (${areaUnitLabel})`,
                  color: 'rgba(255,255,255,0.72)',
                  font: { size: 9, weight: 600 },
                }
              : layerSeries.some(s => s.layerId.trim().toUpperCase() === 'LST') &&
                  layerSeries.every(s => {
                    const u = s.layerId.trim().toUpperCase()
                    return u === 'LST' || u === 'ET'
                  })
                ? {
                    display: true,
                    text: layerSeries.every(s => s.layerId.trim().toUpperCase() === 'LST')
                      ? 'LST (°C)'
                      : 'LST (°C) / ET (mm/day)',
                    color: 'rgba(255,255,255,0.72)',
                    font: { size: 9, weight: 600 },
                  }
                : undefined,
          stacked: !lulcCompositionMode && lulcAreaMode && (chartType === 'area' || chartType === 'bar'),
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            padding: 6,
            callback: (value: string | number) => {
              const n = typeof value === 'number' ? value : Number(value)
              if (!Number.isFinite(n)) return value
              if (lulcCompositionMode) return `${n}%`
              if (!lulcAreaMode) return value
              return areaUnit === 'ha' ? n.toFixed(1) : Math.round(n).toLocaleString('en-US')
            },
          },
          grid: {
            color: lulcCompositionMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
          },
        },
      },
    }),
    [
      chartReady,
      splitByYears,
      layerSeries.length,
      hasRun,
      chartDateClickHandler,
      chartLabels.length,
      lulcAreaMode,
      lulcCompositionMode,
      lulcComposition,
      areaUnit,
      areaUnitLabel,
      chartType,
    ],
  )

  const pieChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartReady ? 280 : 0 },
      plugins: {
        legend: {
          display: true,
          position: 'right' as const,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
        },
        tooltip: {
          bodyFont: { size: 10 },
          titleFont: { size: 10 },
          callbacks: lulcCompositionMode
            ? {
                label(ctx: { dataIndex?: number; parsed?: number | null; label?: string }) {
                  const row = lulcComposition[ctx.dataIndex ?? -1]
                  if (!row) return `${ctx.label ?? 'Class'}: —`
                  const area =
                    areaUnit === 'ha'
                      ? `${row.areaHa.toFixed(2)} ha`
                      : `${Math.round(row.areaM2).toLocaleString('en-US')} m²`
                  return [
                    `${row.name}: ${row.pctOfTotal.toFixed(1)}%`,
                    `Pixels: ${row.pixelCount.toLocaleString('en-US')}`,
                    `Area: ${area}`,
                  ]
                },
              }
            : undefined,
        },
      },
    }),
    [chartReady, hasChartData, lulcCompositionMode, lulcComposition, areaUnit],
  )

  const scatterChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartReady ? 280 : 0 },
      onClick: chartDateClickHandler,
      plugins: {
        legend: {
          display: layerSeries.length > 0 || hasRun,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
        },
        tooltip: {
          bodyFont: { size: 10 },
          titleFont: { size: 10 },
          callbacks: scatterCorrelation
            ? {
                label(context: { datasetIndex: number; dataIndex: number; parsed: { x: number; y: number } }) {
                  if (context.datasetIndex !== 0) {
                    return `y = ${context.parsed.y.toFixed(3)}`
                  }
                  const point = scatterCorrelation.points[context.dataIndex]
                  const date = point?.date ?? ''
                  return date
                    ? `${date} · ${scatterCorrelation.xLayerId}=${context.parsed.x.toFixed(3)} · ${scatterCorrelation.yLayerId}=${context.parsed.y.toFixed(3)}`
                    : `${scatterCorrelation.xLayerId}=${context.parsed.x.toFixed(3)} · ${scatterCorrelation.yLayerId}=${context.parsed.y.toFixed(3)}`
                },
              }
            : undefined,
        },
      },
      scales: scatterCorrelation
        ? {
            x: {
              type: 'linear' as const,
              title: {
                display: true,
                text: scatterCorrelation.xLayerId,
                color: '#94a3b8',
                font: { size: 10, weight: '600' as const },
              },
              ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 9 } },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
            y: {
              title: {
                display: true,
                text: scatterCorrelation.yLayerId,
                color: '#94a3b8',
                font: { size: 10, weight: '600' as const },
              },
              ticks: { color: '#94a3b8', font: { size: 9 } },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
          }
        : {
            x: {
              type: 'linear' as const,
              ticks: {
                color: '#94a3b8',
                maxTicksLimit: 10,
                font: { size: 9 },
                callback: (value: string | number) => {
                  const ms = typeof value === 'number' ? value : Number(value)
                  if (!Number.isFinite(ms)) return ''
                  return new Date(ms).toISOString().slice(0, 10)
                },
              },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
            y: {
              ticks: { color: '#94a3b8', font: { size: 9 } },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
          },
    }),
    [chartReady, layerSeries.length, hasRun, scatterCorrelation, chartDateClickHandler],
  )

  const formatAnalysisSpeed = (ms: number) => {
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(1)} s`
  }

  const observationCount = labels.length

  const chartVisible = hasRun && labels.length > 0 && !loading

  const layerSummary = selectedLayerIds.join(', ')

  const aggregationLabel =
    timeAggregation === 'day'
      ? 'Daily'
      : timeAggregation === 'week'
        ? 'Weekly'
        : timeAggregation === 'month'
          ? 'Monthly'
          : 'Yearly'

  return (
    <div className="acp-ts">
        <div className="acp-ts__toolbar">
          <div className="acp-ts__field acp-ts__field--analysis-mode">
            <span>Analysis</span>
            <div className="acp-ts__aggregate" role="group" aria-label="Analysis mode">
              <button
                type="button"
                className={`acp-ts__aggregate-btn${analysisMode === 'single-layer-trend' ? ' is-on' : ''}`}
                aria-pressed={analysisMode === 'single-layer-trend'}
                title="Current Single Layer Trend Analysis"
                onClick={() => {
                  if (analysisMode === 'single-layer-trend') return
                  setAnalysisMode('single-layer-trend')
                  setActivePanelTab('chart')
                }}
              >
                Single Layer Trend
              </button>
              <button
                type="button"
                className={`acp-ts__aggregate-btn${analysisMode === 'multi-layer-aoi-comparison' ? ' is-on' : ''}`}
                aria-pressed={analysisMode === 'multi-layer-aoi-comparison'}
                title="Multi-Layer Trend Analysis (AOI Comparison)"
                onClick={() => {
                  if (analysisMode === 'multi-layer-aoi-comparison') return
                  setAnalysisMode('multi-layer-aoi-comparison')
                  setActivePanelTab('chart')
                  setToDate(multiSceneDate || toDate)
                  if (fromDate && multiSceneDate && fromDate > multiSceneDate) {
                    const next = defaultImageryDateRange(multiSceneDate, chartLookbackDays)
                    setFromDate(next.from)
                  }
                  invalidateMultiAoiResults()
                }}
              >
                Multi-Layer AOI Comparison
              </button>
              <button
                type="button"
                className={`acp-ts__aggregate-btn${analysisMode === 'plot-layer-time-series' ? ' is-on' : ''}`}
                aria-pressed={analysisMode === 'plot-layer-time-series'}
                title="Weekly / daily time series — one layer, many plots as lines"
                onClick={() => {
                  if (analysisMode === 'plot-layer-time-series') return
                  setAnalysisMode('plot-layer-time-series')
                  setActivePanelTab('chart')
                  setTimeAggregation(prev => (prev === 'day' ? 'week' : prev))
                  setChartType('line')
                  invalidatePlotLayerTsResults()
                }}
              >
                Time Series by Plot
              </button>
            </div>
          </div>

          {analysisMode === 'single-layer-trend' ? (
          <div className="acp-ts__field acp-ts__field--grow">
            <span className="acp-ts__field-label">Field Name</span>
            <SiAoiFieldSelect
              options={fieldOptions}
              value={selectedFieldKey}
              onChange={handleFieldSelectHighlight}
              onPreviewFieldKey={handleFieldPreviewHighlight}
              onSelectAll={keys => {
                if (!keys.length) return
                setSelectedFieldKeys(keys)
                setSelectedFieldKey(keys[0]!)
                if (keys[0]) {
                  onSelectedFieldKeyChange?.(keys[0])
                  onHighlightFieldKeysChange?.([keys[0]], { fitBounds: true })
                }
                setAnalysisMode('multi-layer-aoi-comparison')
                invalidateMultiAoiResults()
              }}
              disabled={!fieldOptions.length}
              emptyLabel="No Agro Structures fields"
              searchPlaceholder="Search fields…"
              aria-label="Field name"
            />
          </div>
          ) : (
          <div className="acp-ts__field acp-ts__field--grow">
            <span className="acp-ts__field-label">
              {analysisMode === 'plot-layer-time-series' ? 'Plots' : 'AOI Layers'}
            </span>
            <SiAoiFieldMultiSelect
              options={fieldOptions}
              selectedKeys={selectedFieldKeys}
              onSelectedKeysChange={keys => {
                setSelectedFieldKeys(keys)
                if (analysisMode === 'plot-layer-time-series') invalidatePlotLayerTsResults()
                else invalidateMultiAoiResults()
              }}
              disabled={!fieldOptions.length}
              aria-label={
                analysisMode === 'plot-layer-time-series'
                  ? 'Plots for time series'
                  : 'AOI layers for comparison'
              }
            />
          </div>
          )}
          {plotLabelAttributes.length > 0 ? (
            <div className="acp-ts__field acp-ts__field--plot-label">
              <span className="acp-ts__field-label">Label field</span>
              <select
                value={plotLabelAttribute}
                onChange={e => {
                  const next = e.target.value
                  setPlotLabelAttribute(next)
                  if (analysisMode === 'single-layer-trend') handleInvalidate()
                  else if (analysisMode === 'plot-layer-time-series') invalidatePlotLayerTsResults()
                  else invalidateMultiAoiResults()
                }}
                aria-label="Plot label attribute field"
                title="Choose which layer attribute to show as the plot name (e.g. Name, OBJECTID)"
              >
                <option value={SI_IMAGERY_PLOT_LABEL_AUTO}>Auto (Name / ID)</option>
                {plotLabelAttributes.map(attr => (
                  <option key={attr.name} value={attr.name}>
                    {attr.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="acp-ts__field acp-ts__field--layer acp-ts__field--grow">
            <AcpImageryLayerMultiSelect
              groups={layerGroups}
              selectedIds={selectedLayerIds}
              onSelectedIdsChange={ids => {
                setSelectedChartDate(null)
                const hadLulc = selectedLayerIds.some(id => isLulcClassificationLayerId(id))
                const hasLulc = ids.some(id => isLulcClassificationLayerId(id))
                if (hasLulc && !hadLulc) {
                  // LULC is exclusive — drop index layers so analysis stays fast.
                  setSelectedLayerIds(['LULC'])
                  return
                }
                if (hasLulc && ids.length > 1) {
                  // User picked another layer while LULC was on — leave LULC mode.
                  setSelectedLayerIds(ids.filter(id => !isLulcClassificationLayerId(id)))
                  return
                }
                setSelectedLayerIds(ids)
              }}
            />
          </div>
          <div className="acp-ts__date-range">
            {analysisMode === 'multi-layer-aoi-comparison' ? (
            <>
            <label className="acp-ts__field acp-ts__field--date">
              <span>Start Date</span>
              <input
                type="date"
                value={fromDate}
                max={multiSceneDate || undefined}
                onChange={e => {
                  const next = e.target.value
                  datesManuallyEditedRef.current = true
                  setDateError(null)
                  setFromDate(next)
                  if (multiSceneDate && next && next > multiSceneDate) {
                    setMultiSceneDate(next)
                    setToDate(next)
                  } else {
                    setToDate(multiSceneDate || next)
                  }
                  invalidateMultiAoiResults()
                }}
              />
            </label>
            <label className="acp-ts__field acp-ts__field--date">
              <span>Acquisition Date</span>
              <input
                type="date"
                value={multiSceneDate}
                min={fromDate || undefined}
                onChange={e => {
                  const next = e.target.value
                  datesManuallyEditedRef.current = true
                  handleInvalidate()
                  setMultiSceneDate(next)
                  setToDate(next)
                  if (fromDate && next && fromDate > next) {
                    setFromDate(next)
                  }
                  invalidateMultiAoiResults()
                }}
              />
            </label>
            </>
            ) : (
            <>
            <label className="acp-ts__field acp-ts__field--date">
              <span>Start Date</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={e => {
                  applyDateChange(e.target.value, toDate)
                  if (analysisMode === 'plot-layer-time-series') invalidatePlotLayerTsResults()
                }}
              />
            </label>
            <label className="acp-ts__field acp-ts__field--date">
              <span>End Date</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={e => {
                  applyDateChange(fromDate, e.target.value)
                  if (analysisMode === 'plot-layer-time-series') invalidatePlotLayerTsResults()
                }}
              />
            </label>
            </>
            )}
          </div>
          <div className="acp-ts__field acp-ts__field--aggregate">
            <span>Aggregate</span>
            <div className="acp-ts__aggregate" role="group" aria-label="Time aggregation">
              {(
                [
                  ['day', 'Day'],
                  ['week', 'Week'],
                  ['month', 'Month'],
                  ['year', 'Year'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`acp-ts__aggregate-btn${timeAggregation === value ? ' is-on' : ''}`}
                  aria-pressed={timeAggregation === value}
                  onClick={() => {
                    setTimeAggregation(value)
                    setSelectedChartDate(null)
                    // Cached daily rows re-bucket instantly for plot / multi-AOI timelines.
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {analysisMode === 'single-layer-trend' ? (
          <label className="acp-ts__field">
            <span>Chart</span>
            <select
              value={chartType}
              onChange={e => setChartType(e.target.value as ImageryChartType)}
            >
              {lulcAreaMode ? (
                <>
                  <option value="bar">Class share (%)</option>
                  <option value="pie">Class pie (%)</option>
                  <option value="area">Area trend (ha)</option>
                  <option value="line">Line trend (ha)</option>
                </>
              ) : (
                <>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="bar">Bar</option>
                  <option value="pie">Pie</option>
                  <option value="scatter">Scatter</option>
                </>
              )}
            </select>
          </label>
          ) : null}
          {analysisMode === 'single-layer-trend' && lulcAreaMode ? (
            <div className="acp-ts__field acp-ts__field--aggregate">
              <span className="acp-ts__field-label">Area unit</span>
              <div className="acp-ts__aggregate" role="group" aria-label="LULC area output unit">
                {(
                  [
                    ['ha', 'ha'],
                    ['m2', 'm²'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`acp-ts__aggregate-btn${areaUnit === value ? ' is-on' : ''}`}
                    aria-pressed={areaUnit === value}
                    title={
                      value === 'ha'
                        ? 'Class area in hectares (pixel count × 10 m × 10 m ÷ 10 000)'
                        : 'Class area in square metres (pixel count × 10 m × 10 m)'
                    }
                    onClick={() => setAreaUnit(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="acp-ts__apply"
            onClick={() => {
              if (analysisMode === 'multi-layer-aoi-comparison') void runMultiAoiWrapped()
              else if (analysisMode === 'plot-layer-time-series') void runPlotLayerTsWrapped()
              else void runAnalysisWrapped()
            }}
            disabled={
              analysisMode === 'multi-layer-aoi-comparison'
                ? (multiAoiLoading && !multiAoiHasChartData) ||
                  !selectedFieldKeys.length ||
                  !selectedLayerIds.length ||
                  !fromDate ||
                  !multiSceneDate ||
                  fromDate > multiSceneDate
                : analysisMode === 'plot-layer-time-series'
                  ? (plotLayerTsLoading && !plotLayerTsHasChartData) ||
                    !selectedFieldKeys.length ||
                    !selectedLayerIds.length ||
                    !fromDate ||
                    !toDate ||
                    fromDate > toDate
                  : (loading && !hasChartData) || !selectedFieldKey
            }
          >
            {analysisMode === 'multi-layer-aoi-comparison'
              ? multiAoiLoading && !multiAoiHasChartData
                ? multiAoiProgress
                  ? `Plots ${multiAoiProgress.done}/${multiAoiProgress.total}…`
                  : 'Running…'
                : multiAoiRefreshing
                  ? 'Updating…'
                  : 'Apply'
              : analysisMode === 'plot-layer-time-series'
                ? plotLayerTsLoading && !plotLayerTsHasChartData
                  ? plotLayerTsProgress
                    ? `Plots ${plotLayerTsProgress.done}/${plotLayerTsProgress.total}…`
                    : 'Running…'
                  : plotLayerTsRefreshing
                    ? 'Updating…'
                    : 'Apply'
                : loading && !hasChartData
                  ? 'Running…'
                  : refreshing
                    ? 'Updating…'
                    : 'Apply'}
          </button>
        </div>

        <div className="acp-ts__tabs" role="tablist" aria-label="Time series views">
          <button
            type="button"
            role="tab"
            id="acp-ts-tab-chart"
            className={'acp-ts__tab' + (activePanelTab === 'chart' ? ' is-active' : '')}
            aria-selected={activePanelTab === 'chart'}
            aria-controls="acp-ts-panel-chart"
            onClick={() => setActivePanelTab('chart')}
          >
            <i className="fa-solid fa-chart-line" aria-hidden="true" /> Chart
          </button>
          <button
            type="button"
            role="tab"
            id="acp-ts-tab-interpretation"
            className={'acp-ts__tab' + (activePanelTab === 'interpretation' ? ' is-active' : '')}
            aria-selected={activePanelTab === 'interpretation'}
            aria-controls="acp-ts-panel-interpretation"
            disabled={analysisMode !== 'single-layer-trend' || !interpretationSupported}
            title={
              analysisMode !== 'single-layer-trend'
                ? 'Interpretation is available in Single Layer Trend mode'
                : interpretationSupported
                ? 'Index interpretation for the selected chart date'
                : 'Interpretation is available for line, area, and bar charts'
            }
            onClick={() => setActivePanelTab('interpretation')}
          >
            <i className="fa-solid fa-lightbulb" aria-hidden="true" /> Interpretation
          </button>
          <button
            type="button"
            role="tab"
            id="acp-ts-tab-weather"
            className={'acp-ts__tab' + (activePanelTab === 'weather' ? ' is-active' : '')}
            aria-selected={activePanelTab === 'weather'}
            aria-controls="acp-ts-panel-weather"
            disabled={analysisMode !== 'single-layer-trend' || !weatherTabSupported}
            title={
              analysisMode !== 'single-layer-trend'
                ? 'Weather comparison is available in Single Layer Trend mode'
                : weatherTabSupported
                ? 'Compare AOI weather with vegetation indices'
                : 'Run analysis to enable weather comparison'
            }
            onClick={() => setActivePanelTab('weather')}
          >
            <i className="fa-solid fa-cloud-sun-rain" aria-hidden="true" /> Weather
          </button>
        </div>

        <div className="acp-ts__panels">
          <div
            id="acp-ts-panel-chart"
            role="tabpanel"
            aria-labelledby="acp-ts-tab-chart"
            className="acp-ts__panel acp-ts__panel--chart"
            hidden={activePanelTab !== 'chart'}
          >
        {analysisMode === 'multi-layer-aoi-comparison' ? (
          <SiMultiLayerAoiTrendView
            timeline={multiAoiTimeline}
            loading={multiAoiLoading}
            refreshing={multiAoiRefreshing}
            hasRun={multiAoiHasRun}
            hasChartData={multiAoiHasChartData}
            error={multiAoiError}
            analysisDurationMs={multiAoiDurationMs}
            progress={multiAoiProgress}
            onHighlightFieldKey={handleMultiAoiHighlight}
          />
        ) : analysisMode === 'plot-layer-time-series' ? (
          <SiPlotLayerTimeSeriesView
            result={plotLayerTsResult}
            loading={plotLayerTsLoading}
            refreshing={plotLayerTsRefreshing}
            hasRun={plotLayerTsHasRun}
            hasChartData={plotLayerTsHasChartData}
            error={plotLayerTsError}
            warning={plotLayerTsWarning}
            analysisDurationMs={plotLayerTsDurationMs}
            progress={plotLayerTsProgress}
            onHighlightFieldKey={handleMultiAoiHighlight}
          />
        ) : (
        <>
        {chartVisible ? (
          <div className="acp-ts__meta">
            <span>
              {layerSummary}
              {chartType === 'scatter' && layerSeries.length >= 2
                ? ` · correlation ${layerSeries[0]?.layerId} → ${layerSeries[1]?.layerId}`
                : ` · ${fromDate} → ${toDate}`}
              {observationCount ? ` · ${observationCount} pts` : ''}
              {hasRun ? ` · ${aggregationLabel}` : ''}
              {analysisDurationMs != null ? ` · ${formatAnalysisSpeed(analysisDurationMs)}` : ''}
            </span>
            <span>{selectedFieldLabel}</span>
          </div>
        ) : null}

        {chartVisible && latestWaterPoint ? (
          <div
            className={
              'acp-ts__water-summary' +
              (latestWaterPoint.highWaterLoss ? ' acp-ts__water-summary--alert' : '')
            }
            aria-label="Estimated water loss snapshot"
          >
            <div className="acp-ts__water-summary-head">
              <span className="acp-ts__water-summary-icon" aria-hidden>
                <i className="fa-solid fa-droplet" />
              </span>
              <span className="acp-ts__water-summary-label">Water Loss</span>
              <span className="acp-ts__water-summary-date">{latestWaterPoint.date}</span>
              <span
                className={
                  'acp-ts__water-stress acp-ts__water-stress--' +
                  latestWaterPoint.waterStressLevel.toLowerCase()
                }
              >
                {latestWaterPoint.waterStressLevel}
              </span>
              {waterLossLoading ? (
                <span className="acp-ts__water-summary-busy">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                </span>
              ) : null}
            </div>
            <div className="acp-ts__water-summary-body">
              <div className="acp-ts__water-summary-hero" aria-label="Loss index">
                <strong>{latestWaterPoint.waterLossIndexPct.toFixed(0)}%</strong>
                <em>loss index</em>
              </div>
              <span className="acp-ts__water-summary-vrule" aria-hidden />
              <div className="acp-ts__water-summary-strip">
                <span className="acp-ts__water-summary-stat">
                  <em>m³/day</em>
                  <strong>
                    {latestWaterPoint.waterLossM3Day >= 1000
                      ? `${(latestWaterPoint.waterLossM3Day / 1000).toFixed(1)}k`
                      : latestWaterPoint.waterLossM3Day.toFixed(0)}
                  </strong>
                </span>
                <span className="acp-ts__water-summary-sep" aria-hidden>
                  ·
                </span>
                <span className="acp-ts__water-summary-stat">
                  <em>m³/ha/day</em>
                  <strong>{latestWaterPoint.waterLossM3HaDay.toFixed(1)}</strong>
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="acp-ts__chart-wrap" ref={chartWrapRef}>
          {chartVisible ? (
            <>
              {chartType === 'bar' ? (
                <Bar ref={chartRef as never} data={chartData as ChartData<'bar'>} options={cartesianChartOptions} />
              ) : chartType === 'pie' ? (
                <Pie ref={chartRef as never} data={pieChartData} options={pieChartOptions} />
              ) : chartType === 'scatter' ? (
                <Scatter ref={chartRef as never} data={scatterChartData} options={scatterChartOptions} />
              ) : (
                <Line ref={chartRef as never} data={chartData as ChartData<'line'>} options={cartesianChartOptions} />
              )}
            </>
          ) : (loading && !hasChartData) || (refreshing && hasRun && !chartVisible) ? (
            <div className="acp-ts__skeleton acp-ts__skeleton--atomic" role="status" aria-live="polite" aria-busy="true">
              <div className="acp-ts__skeleton-spinner" aria-hidden="true">
                <i className="fa-solid fa-spinner fa-spin" />
              </div>
              <p className="acp-ts__skeleton-status">
                {refreshing ? `Updating ${layerSummary || 'layer'}…` : 'Loading imagery…'}
              </p>
              {selectedFieldLabel !== '—' ? (
                <p className="acp-ts__skeleton-context">
                  {selectedFieldLabel}
                  {selectedLayerIds.length ? ` · ${selectedLayerIds.join(', ')}` : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="acp-ts__placeholder">
              {displayError
                ? displayError
                : hasRun && (loading || refreshing)
                  ? `Loading ${layerSummary || 'layer'} analysis…`
                  : hasRun && !labels.length
                    ? `No data available for ${layerSummary || 'selected layer'} in this date range — try widening dates or check Sentinel coverage.`
                    : !fieldOptions.length
                      ? 'Load or draw a field (Agro Structures / AOI) — analysis starts automatically.'
                      : 'Select a field and date range — analysis starts automatically.'}
            </div>
          )}
        </div>

        {chartVisible ? (
          <p className="acp-ts__chart-hint">
            {lulcCompositionMode ? (
              <>
                <i className="fa-solid fa-chart-column" aria-hidden="true" /> LULC class share ·{' '}
                <strong>{lulcTotalPixels.toLocaleString('en-US')}</strong> pixels · Scene:{' '}
                <strong>
                  {compositionDateIndex >= 0 ? labels[compositionDateIndex] : analysisDate}
                </strong>
                {' · '}
                hover a class for pixel count, area ({areaUnitLabel}), and % of total
              </>
            ) : (
              <>
                <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click any point to set the map
                analysis date and open <strong>Interpretation</strong> · Map date:{' '}
                <strong>{analysisDate}</strong>
                {interpretSceneDate ? (
                  <>
                    {' '}
                    · Scene: <strong>{interpretSceneDate}</strong>
                  </>
                ) : null}
                {lulcAreaMode ? (
                  <>
                    {' '}
                    · Class areas from pixel counts × 10 m × 10 m ({areaUnitLabel})
                  </>
                ) : null}
              </>
            )}
          </p>
        ) : null}
        {chartVisible && lulcCompositionMode && lulcComposition.length ? (
          <>
            <div className="acp-ts__lulc-legend" role="list" aria-label="LULC class legend">
              {lulcComposition.map(row => (
                <span
                  key={row.key}
                  className={`acp-ts__lulc-legend-item${row.pixelCount > 0 ? '' : ' is-empty'}`}
                  role="listitem"
                  title={`${row.name}: ${row.pctOfTotal.toFixed(1)}% · ${row.pixelCount.toLocaleString('en-US')} px`}
                >
                  <i style={{ background: row.color }} aria-hidden />
                  {row.shortLabel}
                </span>
              ))}
            </div>
            {lulcCompositionPresent.length ? (
              <div className="acp-ts__lulc-stats" aria-label="LULC class statistics">
                {lulcCompositionPresent.map(row => (
                  <span key={row.key} className="acp-ts__lulc-stats-chip" title={row.name}>
                    <i style={{ background: row.color }} aria-hidden />
                    <strong>{row.shortLabel}</strong>
                    <em>{Math.round(row.pctOfTotal)}%</em>
                    <span>{row.pixelCount.toLocaleString('en-US')} px</span>
                    <span>
                      {areaUnit === 'ha'
                        ? `${row.areaHa.toFixed(1)} ha`
                        : `${Math.round(row.areaM2).toLocaleString('en-US')} m²`}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {chartType === 'scatter' && scatterCorrelation ? (
          <div className="acp-ts__scatter-insight">
            <div className="acp-ts__scatter-head">
              <span className="acp-ts__scatter-r2">
                r = <strong>{scatterCorrelation.regression.r.toFixed(3)}</strong>
                {' · '}
                R² = <strong>{scatterCorrelation.regression.r2.toFixed(3)}</strong>
                {' · '}
                n = <strong>{scatterCorrelation.regression.n}</strong>
              </span>
              <span
                className={[
                  'acp-ts__scatter-rel',
                  `acp-ts__scatter-rel--${scatterCorrelation.relationship.strength}`,
                  scatterCorrelation.relationship.direction !== 'none'
                    ? `acp-ts__scatter-rel--${scatterCorrelation.relationship.direction}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {scatterCorrelation.relationship.label}
              </span>
            </div>
            {scatterCorrelation.points.length ? (
              <div className="acp-ts__scatter-table-wrap">
                <table className="acp-ts__scatter-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{scatterCorrelation.xLayerId}</th>
                      <th>{scatterCorrelation.yLayerId}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scatterCorrelation.points.map(p => (
                      <tr key={`${p.date}-${p.x}-${p.y}`}>
                        <td>{p.date || '—'}</td>
                        <td>{p.x.toFixed(4)}</td>
                        <td>{p.y.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="acp-ts__scatter-interpret">
              <strong>Interpretation:</strong> {buildCorrelationInterpretation(scatterCorrelation)}
            </p>
          </div>
        ) : chartType === 'scatter' && hasRun && labels.length && layerSeries.length < 2 ? (
          <p className="acp-ts__scatter-hint">Select two layers to run correlation scatter with regression and R².</p>
        ) : null}

        {displayError && hasRun && labels.length ? <p className="acp-ts__error">{displayError}</p> : null}
        </>
        )}

          </div>

          <div
            id="acp-ts-panel-interpretation"
            role="tabpanel"
            aria-labelledby="acp-ts-tab-interpretation"
            className="acp-ts__panel acp-ts__panel--interpret"
            hidden={activePanelTab !== 'interpretation'}
          >
            {interpretationSupported ? (
              <>
                <p className="acp-ts__interpret-tab-hint">
                  {interpretSceneDate ? (
                    <>
                      Scene <strong>{interpretSceneDate}</strong> · {primaryLayerId.toUpperCase()} · click chart
                      points on the Chart tab to change date
                    </>
                  ) : (
                    'Run analysis and select a chart point to interpret index values for that date.'
                  )}
                </p>
                <SiImageryIndexInterpretationCard
                  interpretation={interpretation}
                  loadingAreas={loadingAreas}
                  onAction={handleInterpretationAction}
                />
              </>
            ) : (
              <div className="acp-ts__interpret acp-ts__interpret--empty" role="status">
                Interpretation is available for line, area, and bar charts after analysis completes.
              </div>
            )}
          </div>

          <div
            id="acp-ts-panel-weather"
            role="tabpanel"
            aria-labelledby="acp-ts-tab-weather"
            className="acp-ts__panel acp-ts__panel--weather"
            hidden={activePanelTab !== 'weather'}
          >
            <SiImageryWeatherTab
              active={activePanelTab === 'weather'}
              hasRun={hasRun}
              chartReady={chartReady}
              geometry={resolvedField?.geometry ?? null}
              fromDate={fromDate}
              toDate={toDate}
              chartLabels={labels}
              displayLabels={chartLabels}
              timeAggregation={timeAggregation}
              layerSeries={layerSeries}
              primaryLayerId={primaryLayerId}
              fieldLabel={selectedFieldLabel}
              onStormMapOverlayChange={onStormMapOverlayChange}
              stormOverlayDismissEpoch={stormOverlayDismissEpoch}
            />
          </div>
        </div>

        <SiDynamicMapSnapshotsPanel
          open={mapSnapshotsOpen}
          geometry={resolvedField?.geometry ?? committedAoiGeometry}
          layerIds={selectedLayerIds}
          sceneDate={interpretSceneDate || referenceDate}
          fieldName={selectedFieldLabel}
          dailyRows={filteredDailyRows}
          layerSeries={layerSeries}
          mapboxToken={mapboxToken}
          enabled={hasRun && !!selectedLayerIds.length}
        />

        <div className="acp-ts__foot">
          {analysisMode === 'single-layer-trend' ? (
          <>
          <label className="acp-ts__toggle">
            <input
              type="checkbox"
              checked={splitByYears}
              disabled={selectedLayerIds.length > 1 || chartType === 'pie' || chartType === 'scatter' || timeAggregation !== 'day'}
              onChange={e => setSplitByYears(e.target.checked)}
            />
            Split by years
            {selectedLayerIds.length > 1 || chartType === 'pie' || chartType === 'scatter' || timeAggregation !== 'day' ? (
              <span className="acp-ts__toggle-hint">
                {timeAggregation !== 'day'
                  ? ' (daily only)'
                  : chartType === 'pie' || chartType === 'scatter'
                    ? ' (cartesian charts only)'
                    : ' (single layer only)'}
              </span>
            ) : null}
          </label>
          <div className="acp-ts__exports">
            <button
              type="button"
              className={'acp-ts__exports-interpret' + (mapSnapshotsOpen ? ' is-on' : '')}
              title="Dynamic Map Snapshots for selected layers"
              aria-label="Dynamic Map Snapshots"
              aria-pressed={mapSnapshotsOpen}
              disabled={!hasRun || !selectedLayerIds.length}
              onClick={() => setMapSnapshotsOpen(open => !open)}
            >
              <i className="fa-solid fa-map" aria-hidden="true" /> Map Snapshots
            </button>
            <TimeSeriesExportManager
              disabled={(!labels.length || !hasRun) && exportPlots.length < 1}
              field={resolvedField}
              fieldName={selectedFieldLabel}
              fieldKey={selectedFieldKey}
              fromDate={fromDate}
              toDate={toDate}
              acquisitionDate={interpretSceneDate}
              layerIds={selectedLayerIds}
              chartLabels={labels}
              displayLabels={chartLabels}
              layerSeries={layerSeries}
              dailyRows={filteredDailyRows}
              chartRef={chartRef}
              chartType={chartType}
              mapboxToken={mapboxToken}
              periodAnchorDates={periodAnchorDates}
              timeAggregation={timeAggregation}
              projectName={projectName}
              generatedBy={generatedBy}
              plots={exportPlots}
              farmName={resolvedField?.farmName || selectedFieldLabel}
              aoiName={exportAoiName}
              labelAttributes={plotLabelAttributes}
              labelAttribute={plotLabelAttribute}
              onLabelAttributeChange={setPlotLabelAttribute}
              resolvePlotsForLabel={resolveExportPlotsForLabel}
              resolveFieldForLabel={resolveExportFieldForLabel}
            />
          </div>
          </>
          ) : (
          <div className="acp-ts__exports">
            <TimeSeriesExportManager
              disabled={exportPlots.length < 1 || !selectedLayerIds.length}
              field={resolvedFields[0] ?? null}
              fieldName={resolvedFields[0]?.farmName || 'Multi AOI'}
              fieldKey={resolvedFields[0]?.fieldKey || ''}
              fromDate={fromDate}
              toDate={
                analysisMode === 'multi-layer-aoi-comparison' ? multiSceneDate || toDate : toDate
              }
              acquisitionDate={
                analysisMode === 'multi-layer-aoi-comparison'
                  ? multiSceneDate || referenceDate
                  : toDate || referenceDate
              }
              layerIds={selectedLayerIds}
              chartLabels={[]}
              displayLabels={[]}
              layerSeries={[]}
              dailyRows={[]}
              chartRef={chartRef}
              chartType={chartType}
              mapboxToken={mapboxToken}
              timeAggregation={timeAggregation}
              projectName={projectName}
              generatedBy={generatedBy}
              plots={exportPlots}
              farmName={resolvedFields[0]?.farmName || 'Farm'}
              aoiName={exportAoiName}
              labelAttributes={plotLabelAttributes}
              labelAttribute={plotLabelAttribute}
              onLabelAttributeChange={setPlotLabelAttribute}
              resolvePlotsForLabel={resolveExportPlotsForLabel}
              resolveFieldForLabel={resolveExportFieldForLabel}
            />
          </div>
          )}
        </div>
    </div>
  )
}
