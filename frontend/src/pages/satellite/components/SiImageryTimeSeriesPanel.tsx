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
import { useImageryIndexInterpretation } from '../hooks/useImageryIndexInterpretation'
import { SiImageryIndexInterpretationCard, type ImageryInterpretationActionId } from './SiImageryIndexInterpretationCard'
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields'
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
import { AcpImageryLayerMultiSelect } from '../../dashboards/agroCloudPlatform/map/AcpImageryLayerMultiSelect'
import { SiAoiFieldMultiSelect } from '../../dashboards/agroCloudPlatform/map/SiAoiFieldMultiSelect'
import { SiAoiFieldSelect } from '../../dashboards/agroCloudPlatform/map/SiAoiFieldSelect'
import { SiMultiLayerAoiTrendView } from './SiMultiLayerAoiTrendView'
import type { SiImageryAnalysisMode } from '../../../lib/siMultiLayerAoiTrendAnalysis'
import {
  buildSiImageryFieldOptions,
  resolveSiImageryField,
  SI_IMAGERY_COMMITTED_AOI_KEY,
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
)

export type SiImageryTimeSeriesPanelProps = {
  agroStructuresMask: GeoJSON.FeatureCollection | null
  aoiFields: SiAoiFieldRecord[]
  committedAoiGeometry: GeoJSON.Geometry | null
  defaultLayerId: string
  analysisDate: string
  /** When true, end/start dates track latest scene (`analysisDate`) until the user edits them. */
  imageryDateAutoFollow?: boolean
  onMapDateFromChart: (iso: string) => void
  selectedFieldKey?: string | null
  onSelectedFieldKeyChange?: (fieldKey: string) => void
  onHighlightFieldKeysChange?: (fieldKeys: string[]) => void
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

  const fieldOptions = useMemo(
    () => buildSiImageryFieldOptions(agroStructuresMask, aoiFields, committedAoiGeometry),
    [agroStructuresMask, aoiFields, committedAoiGeometry],
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
  const prevLayerIdsRef = useRef<string[]>(selectedLayerIds)
  const prevDrawnAoiKeyRef = useRef('')
  const datesManuallyEditedRef = useRef(false)

  useEffect(() => {
    if (imageryDateAutoFollow) datesManuallyEditedRef.current = false
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
        .map(key => resolveSiImageryField(agroStructuresMask, aoiFields, committedAoiGeometry, key))
        .filter((f): f is NonNullable<typeof f> => f != null),
    [agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKeys],
  )

  const {
    results: multiAoiResults,
    loading: multiAoiLoading,
    refreshing: multiAoiRefreshing,
    error: multiAoiError,
    hasRun: multiAoiHasRun,
    analysisDurationMs: multiAoiDurationMs,
    hasChartData: multiAoiHasChartData,
    run: runMultiAoiAnalysis,
    invalidateResults: invalidateMultiAoiResults,
  } = useMultiLayerAoiTrendStream({
    fields: resolvedFields,
    layerIds: selectedLayerIds,
    sceneDate: multiSceneDate,
  })

  const resolvedField = useMemo(
    () =>
      selectedFieldKey
        ? resolveSiImageryField(agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKey)
        : null,
    [agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKey],
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
    const series = layerSeries.find(s => s.layerId.toUpperCase() === primaryLayerId.toUpperCase())
    return series?.values ?? layerSeries[0]?.values ?? []
  }, [layerSeries, primaryLayerId])

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
    autoRunReadyRef.current = false
    setDateError(null)
    setSelectedChartDate(null)
    setActivePanelTab('chart')
  }, [invalidateResults, invalidateMultiAoiResults])

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
      return fieldOptions.slice(0, Math.min(3, fieldOptions.length)).map(o => o.fieldKey)
    })
  }, [fieldOptions])

  const runMultiAoiWrapped = useCallback(async () => {
    autoRunReadyRef.current = true
    await runMultiAoiAnalysis()
  }, [runMultiAoiAnalysis])

  const handleMultiAoiHighlight = useCallback(
    (fieldKey: string) => {
      onSelectedFieldKeyChange?.(fieldKey)
      onHighlightFieldKeysChange?.([fieldKey])
    },
    [onSelectedFieldKeyChange, onHighlightFieldKeysChange],
  )

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (!multiAoiHasRun || multiAoiLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !multiSceneDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runMultiAoiWrapped(), 650)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    resolvedFields,
    multiAoiHasRun,
    multiAoiLoading,
    runMultiAoiWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (multiAoiHasRun || multiAoiLoading) return
    if (!selectedFieldKeys.length || !selectedLayerIds.length || !multiSceneDate) return
    if (!resolvedFields.length) return
    const id = window.setTimeout(() => void runMultiAoiWrapped(), 500)
    return () => window.clearTimeout(id)
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    resolvedFields,
    multiAoiHasRun,
    multiAoiLoading,
    runMultiAoiWrapped,
  ])

  useEffect(() => {
    if (analysisMode !== 'multi-layer-aoi-comparison') return
    if (selectedFieldKeys.length && selectedLayerIds.length && multiSceneDate && resolvedFields.length) return
    invalidateMultiAoiResults()
  }, [
    analysisMode,
    selectedFieldKeys,
    selectedLayerIds,
    multiSceneDate,
    resolvedFields,
    invalidateMultiAoiResults,
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

  const runAnalysisWrapped = useCallback(async () => {
    prevAutoRunDatesRef.current = { from: fromDate, to: toDate }
    autoRunReadyRef.current = true
    await runAnalysis()
  }, [runAnalysis, fromDate, toDate])

  runAnalysisRef.current = runAnalysisWrapped

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
    if (!hasRun || !selectedFieldKey || dateError) return
    if (!fromDate || !toDate || fromDate >= toDate) return
    const prev = prevAutoRunDatesRef.current
    if (prev.from === fromDate && prev.to === toDate) return
    setSelectedChartDate(null)
    const id = window.setTimeout(() => void runAnalysisRef.current(), 650)
    return () => window.clearTimeout(id)
  }, [fromDate, toDate, selectedFieldKey, hasRun, dateError, analysisMode])

  useEffect(() => {
    if (analysisMode !== 'single-layer-trend') return
    if (hasRun || loading) return
    if (!selectedFieldKey || !fromDate || !toDate || fromDate >= toDate || dateError) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 500)
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
    if (!hasRun || loading || labels.length > 0 || error) return
    if (!selectedFieldKey || !fromDate || !toDate || fromDate >= toDate || dateError) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 600)
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
    if (!chartLabels.length || !layerSeries.length) {
      return { labels: [], datasets: [] }
    }
    if (splitByYears && layerSeries.length === 1 && timeAggregation === 'day') {
      const values = layerSeries[0]!.values
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
        ...layerSeries.flatMap((entry, index) => {
          const color = imageryLayerChartColor(index)
          const isNdsiLayer = entry.layerId.trim().toUpperCase() === 'NDSI'
          const datasets: Array<Record<string, unknown>> = [
            {
              label: isNdsiLayer ? 'NDSI mean' : entry.layerId,
              data: entry.values,
              borderColor: color,
              backgroundColor: chartType === 'area' ? `${color}33` : chartType === 'bar' ? `${color}88` : color,
              fill: chartType === 'area',
              tension: 0.25,
              pointRadius: 2,
              borderWidth: isNdsiLayer ? 2.25 : 1.5,
              yAxisID: 'y',
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
  }, [chartLabels, labels, layerSeries, splitByYears, chartType, timeAggregation, ndsiZonalBands])

  const pieChartData = useMemo((): ChartData<'pie'> => {
    if (!chartLabels.length || !layerSeries.length) return { labels: [], datasets: [] }
    if (layerSeries.length === 1 && timeAggregation !== 'day') {
      const values = layerSeries[0]!.values
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
    const slices = buildImageryPieChartSlices(labels, layerSeries)
    if (!slices.labels.length) return { labels: [], datasets: [] }
    return {
      labels: slices.labels,
      datasets: [
        {
          label: layerSeries.length > 1 ? 'Layer mean' : 'Monthly mean',
          data: slices.values,
          backgroundColor: slices.labels.map((_, i) => `${imageryLayerChartColor(i)}cc`),
          borderColor: '#0a0a0a',
          borderWidth: 1,
        },
      ],
    }
  }, [chartLabels, labels, layerSeries, timeAggregation])

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
      const pointColor = imageryLayerChartColor(0)
      return {
        datasets: [
          {
            type: 'scatter' as const,
            label: `${scatterCorrelation.xLayerId} vs ${scatterCorrelation.yLayerId}`,
            data: scatterCorrelation.points.map(point => ({ x: point.x, y: point.y })),
            borderColor: pointColor,
            backgroundColor: `${pointColor}cc`,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            type: 'line' as const,
            label: `Regression · R²=${scatterCorrelation.regression.r2.toFixed(3)}`,
            data: scatterCorrelation.regressionLine,
            borderColor: '#f97316',
            backgroundColor: '#f97316',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
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
          top: 14,
          right: 10,
          bottom: 8,
          left: 6,
        },
      },
      onClick: chartDateClickHandler,
      plugins: {
        legend: {
          display: splitByYears || layerSeries.length > 1 || hasRun,
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
        tooltip: {
          bodyFont: { size: 10 },
          titleFont: { size: 10 },
          callbacks: {
            afterBody: (items: Array<{ parsed: { y: number | null } }>) => {
              const lines = ['Click point to set map date']
              const ys = items.map(item => item.parsed.y).filter(v => v != null && Number.isFinite(v)) as number[]
              if (ys.length >= 2) {
                const spread = Math.max(...ys) - Math.min(...ys)
                if (spread > 0.0001) lines.push(`Range spread: ${spread.toFixed(3)}`)
              }
              return lines
            },
            label(ctx: { dataset: { label?: string }; parsed: { y: number | null } }) {
              const v = ctx.parsed.y
              if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label ?? 'Value'}: —`
              return `${ctx.dataset.label ?? 'Value'}: ${v.toFixed(4)}`
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: Math.min(12, Math.max(chartLabels.length, 4)),
            autoSkip: chartLabels.length > 12,
            maxRotation: chartLabels.length > 8 ? 40 : 0,
            minRotation: chartLabels.length > 8 ? 25 : 0,
            font: { size: 9 },
            padding: 6,
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          grace: '8%',
          ticks: { color: '#94a3b8', font: { size: 9 }, padding: 6 },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    }),
    [chartReady, splitByYears, layerSeries.length, hasRun, chartDateClickHandler, chartLabels.length],
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
        tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
      },
    }),
    [chartReady, hasChartData],
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
                  invalidateMultiAoiResults()
                }}
              >
                Multi-Layer AOI Comparison
              </button>
            </div>
          </div>

          {analysisMode === 'single-layer-trend' ? (
          <div className="acp-ts__field acp-ts__field--grow">
            <span className="acp-ts__field-label">Field Name</span>
            <SiAoiFieldSelect
              options={fieldOptions}
              value={selectedFieldKey}
              onChange={key => {
                handleInvalidate()
                setSelectedFieldKey(key)
                if (key) onSelectedFieldKeyChange?.(key)
              }}
              disabled={!fieldOptions.length}
              emptyLabel="No Agro Structures fields"
              searchPlaceholder="Search fields…"
              aria-label="Field name"
            />
          </div>
          ) : (
          <div className="acp-ts__field acp-ts__field--grow">
            <span className="acp-ts__field-label">AOI Layers</span>
            <SiAoiFieldMultiSelect
              options={fieldOptions}
              selectedKeys={selectedFieldKeys}
              onSelectedKeysChange={setSelectedFieldKeys}
              disabled={!fieldOptions.length}
              aria-label="AOI layers for comparison"
            />
          </div>
          )}
          <div className="acp-ts__field acp-ts__field--layer acp-ts__field--grow">
            <AcpImageryLayerMultiSelect
              groups={layerGroups}
              selectedIds={selectedLayerIds}
              onSelectedIdsChange={ids => {
                setSelectedChartDate(null)
                setSelectedLayerIds(ids)
              }}
            />
          </div>
          <div className="acp-ts__date-range">
            {analysisMode === 'single-layer-trend' ? (
            <>
            <label className="acp-ts__field acp-ts__field--date">
              <span>Start Date</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={e => {
                  const next = e.target.value
                  datesManuallyEditedRef.current = true
                  setFromDate(next)
                  if (next && toDate && next >= toDate) {
                    setDateError('Start Date must be before End Date.')
                  } else {
                    setDateError(null)
                  }
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
                  const next = e.target.value
                  datesManuallyEditedRef.current = true
                  setToDate(next)
                  if (fromDate && next && fromDate >= next) {
                    setDateError('End Date must be after Start Date.')
                  } else {
                    setDateError(null)
                  }
                }}
              />
            </label>
            </>
            ) : (
            <label className="acp-ts__field acp-ts__field--date">
              <span>Acquisition Date</span>
              <input
                type="date"
                value={multiSceneDate}
                onChange={e => {
                  handleInvalidate()
                  setMultiSceneDate(e.target.value)
                }}
              />
            </label>
            )}
          </div>
          {analysisMode === 'single-layer-trend' ? (
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
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          ) : null}
          {analysisMode === 'single-layer-trend' ? (
          <label className="acp-ts__field">
            <span>Chart</span>
            <select
              value={chartType}
              onChange={e => setChartType(e.target.value as ImageryChartType)}
            >
              <option value="line">Line</option>
              <option value="area">Area</option>
              <option value="bar">Bar</option>
              <option value="pie">Pie</option>
              <option value="scatter">Scatter</option>
            </select>
          </label>
          ) : null}
          <button
            type="button"
            className="acp-ts__apply"
            onClick={() =>
              analysisMode === 'multi-layer-aoi-comparison'
                ? void runMultiAoiWrapped()
                : void runAnalysisWrapped()
            }
            disabled={
              analysisMode === 'multi-layer-aoi-comparison'
                ? (multiAoiLoading && !multiAoiHasChartData) ||
                  !selectedFieldKeys.length ||
                  !selectedLayerIds.length
                : (loading && !hasChartData) || !selectedFieldKey
            }
          >
            {analysisMode === 'multi-layer-aoi-comparison'
              ? multiAoiLoading && !multiAoiHasChartData
                ? 'Running…'
                : multiAoiRefreshing
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
            results={multiAoiResults}
            layerIds={selectedLayerIds}
            sceneDate={multiSceneDate}
            loading={multiAoiLoading}
            refreshing={multiAoiRefreshing}
            hasRun={multiAoiHasRun}
            hasChartData={multiAoiHasChartData}
            error={multiAoiError}
            analysisDurationMs={multiAoiDurationMs}
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
                    ? `No ${layerSummary || 'layer'} observations in this date range — try widening dates or check Sentinel coverage.`
                    : 'Select a field and date range — analysis starts automatically.'}
            </div>
          )}
        </div>

        {chartVisible ? (
          <p className="acp-ts__chart-hint">
            <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click any point to set the map
            analysis date and open <strong>Interpretation</strong> · Map date: <strong>{analysisDate}</strong>
            {interpretSceneDate ? (
              <>
                {' '}
                · Scene: <strong>{interpretSceneDate}</strong>
              </>
            ) : null}
          </p>
        ) : null}

        {chartType === 'scatter' && scatterCorrelation ? (
          <div className="acp-ts__scatter-insight">
            <div className="acp-ts__scatter-head">
              <span className="acp-ts__scatter-r2">
                R² = <strong>{scatterCorrelation.regression.r2.toFixed(3)}</strong>
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
            <p className="acp-ts__scatter-gis">{scatterCorrelation.gisInsight}</p>
            <p className="acp-ts__scatter-agro">{scatterCorrelation.agroInsight}</p>
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
              disabled={!labels.length || !hasRun}
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
            />
          </div>
          </>
          ) : null}
        </div>
    </div>
  )
}
