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
  type ImageryChartType,
  type ImageryCorrelationScatterAnalysis,
  type ImageryTimeAggregation,
  type ImageryTimeSeriesLayerSeries,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { AcpImageryLayerMultiSelect } from '../../dashboards/agroCloudPlatform/map/AcpImageryLayerMultiSelect'
import {
  buildSiImageryFieldOptions,
  resolveSiImageryField,
  SI_IMAGERY_COMMITTED_AOI_KEY,
} from '../utils/siImageryTimeSeriesFields'
import { TimeSeriesExportManager } from './timeSeriesReport/ExportManager'
import { SiDynamicMapSnapshotsPanel } from './SiDynamicMapSnapshotsPanel'
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
  onMapDateFromChart: (iso: string) => void
  selectedFieldKey?: string | null
  onSelectedFieldKeyChange?: (fieldKey: string) => void
  chartLookbackDays?: number
  mapboxToken?: string
  projectName?: string
  generatedBy?: string
}

export function SiImageryTimeSeriesPanel({
  agroStructuresMask,
  aoiFields,
  committedAoiGeometry,
  defaultLayerId,
  analysisDate,
  onMapDateFromChart,
  selectedFieldKey: selectedFieldKeyProp,
  onSelectedFieldKeyChange,
  chartLookbackDays = 90,
  mapboxToken,
  projectName,
  generatedBy,
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
  /** Chart workspace tab — Interpretation reuses the chart area (no extra vertical stack). */
  const [chartWorkspaceTab, setChartWorkspaceTab] = useState<'chart' | 'interpretation'>('chart')
  const [mapSnapshotsOpen, setMapSnapshotsOpen] = useState(false)
  const interpretationOpen = chartWorkspaceTab === 'interpretation'
  const [vegTimeline, setVegTimeline] = useState<
    import('../lib/timeSeriesReport/vegetationCoverageTimeline').VegetationCoveragePoint[]
  >([])
  const [waterLossTimeline, setWaterLossTimeline] = useState<
    import('../lib/timeSeriesReport/estimatedWaterLossTimeline').EstimatedWaterLossPoint[]
  >([])
  const [waterLossLoading, setWaterLossLoading] = useState(false)

  /** ET chart/KPI appear only when ET is selected like any other layer — never as a permanent overlay. */
  const etLayerSelected = useMemo(
    () => selectedLayerIds.some(id => String(id || '').trim().toUpperCase() === 'ET'),
    [selectedLayerIds],
  )
  const runAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const autoRunReadyRef = useRef(false)
  const prevAutoRunDatesRef = useRef({ from: '', to: '' })
  const prevDrawnAoiKeyRef = useRef('')

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

  const aggregatedChart = useMemo(
    () => aggregateImageryChartByTimePeriod(rawLabels, rawLayerSeries, timeAggregation),
    [rawLabels, rawLayerSeries, timeAggregation],
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
          dailyRows,
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
          dailyRows,
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
    dailyRows,
    layerSeries,
  ])

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
    }
    const mapDay = referenceDate.trim().slice(0, 10)
    if (mapDay && rawLabels.includes(mapDay)) return mapDay
    const lastKey = labels[labels.length - 1]
    return lastKey ? resolvePeriodMapDate(lastKey) : ''
  }, [selectedChartDate, referenceDate, labels, rawLabels, resolvePeriodMapDate])

  const interpretationSupported =
    hasRun && labels.length > 0 && chartType !== 'scatter' && chartType !== 'pie'

  const { interpretation, loadingAreas } = useImageryIndexInterpretation({
    field: resolvedField,
    layerId: primaryLayerId,
    sceneDate: interpretSceneDate,
    dailyRows,
    chartLabels: chartLabels,
    chartValues: primaryChartValues,
    enabled: interpretationOpen && interpretationSupported,
  })

  const handleInterpretationAction = useCallback(
    (actionId: ImageryInterpretationActionId) => {
      const scene = interpretation?.sceneDate?.trim().slice(0, 10)
      if (scene) onMapDateFromChart(scene)
      if (actionId === 'inspect-stress' || actionId === 'scout-moderate') {
        setChartWorkspaceTab('interpretation')
      }
    },
    [interpretation?.sceneDate, onMapDateFromChart],
  )

  const handleInvalidate = useCallback(() => {
    invalidateResults()
    autoRunReadyRef.current = false
    setDateError(null)
    setSelectedChartDate(null)
    setChartWorkspaceTab('chart')
  }, [invalidateResults])

  const openInterpretationTab = useCallback(() => {
    if (!interpretationSupported) return
    setChartWorkspaceTab(prev => (prev === 'interpretation' ? 'chart' : 'interpretation'))
  }, [interpretationSupported])

  useEffect(() => {
    if (!interpretationSupported && chartWorkspaceTab === 'interpretation') {
      setChartWorkspaceTab('chart')
    }
  }, [interpretationSupported, chartWorkspaceTab])

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
    await runAnalysis()
    autoRunReadyRef.current = true
    prevAutoRunDatesRef.current = { from: fromDate, to: toDate }
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
    if (!autoRunReadyRef.current || !selectedFieldKey || (loading && !hasChartData)) return
    if (!fromDate || !toDate || fromDate >= toDate) return
    const prev = prevAutoRunDatesRef.current
    if (prev.from === fromDate && prev.to === toDate) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 650)
    return () => window.clearTimeout(id)
  }, [fromDate, toDate, selectedFieldKey, loading, hasChartData])

  const chartDateClickHandler = useCallback(
    (_event: unknown, elements: Array<{ index: number; datasetIndex?: number }>) => {
      if (!elements.length) return
      const el = elements[0]!
      if (el.datasetIndex != null && el.datasetIndex > 0) return
      const periodKey = labels[el.index]
      if (periodKey) {
        setSelectedChartDate(periodKey)
        syncMapToChartDate(resolvePeriodMapDate(periodKey))
      }
    },
    [labels, syncMapToChartDate, resolvePeriodMapDate],
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
        ...layerSeries.map((entry, index) => {
          const color = imageryLayerChartColor(index)
          const isEt = String(entry.layerId || '').toUpperCase() === 'ET'
          return {
            label: isEt ? 'ET (mm/day)' : entry.layerId,
            data: entry.values,
            borderColor: color,
            backgroundColor: chartType === 'area' ? `${color}33` : chartType === 'bar' ? `${color}88` : color,
            fill: chartType === 'area',
            tension: 0.25,
            pointRadius: 2,
            borderWidth: 1.5,
            yAxisID: isEt && layerSeries.length > 1 ? 'yET' : 'y',
          }
        }),
      ],
    }
  }, [chartLabels, labels, layerSeries, splitByYears, chartType, timeAggregation])

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

  const etWithOtherLayers =
    etLayerSelected && layerSeries.some(s => String(s.layerId || '').toUpperCase() !== 'ET')
  const hasSecondaryOverlays = etWithOtherLayers

  const cartesianChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartReady ? 280 : 0 },
      layout: {
        padding: {
          top: hasSecondaryOverlays ? 18 : 14,
          right: hasSecondaryOverlays ? 6 : 10,
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
            afterBody: () => ['Click point to set map date'],
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
        ...(etWithOtherLayers
          ? {
              yET: {
                position: 'right' as const,
                beginAtZero: true,
                grace: '12%',
                ticks: {
                  color: '#38bdf8',
                  font: { size: 9 },
                  padding: 8,
                  maxTicksLimit: 6,
                  callback: (v: string | number) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    if (!Number.isFinite(n)) return `${v}`
                    return n >= 10 ? n.toFixed(1) : n.toFixed(2)
                  },
                },
                grid: { drawOnChartArea: false },
                title: {
                  display: true,
                  text: 'ET mm/d',
                  color: '#38bdf8',
                  font: { size: 9 },
                  padding: { top: 2, bottom: 2 },
                },
              },
            }
          : {}),
      },
    }),
    [
      chartReady,
      splitByYears,
      layerSeries.length,
      hasRun,
      chartDateClickHandler,
      chartLabels.length,
      etWithOtherLayers,
      hasSecondaryOverlays,
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
          <label className="acp-ts__field acp-ts__field--grow">
            <span>Field Name</span>
            <select
              value={selectedFieldKey}
              onChange={e => {
                handleInvalidate()
                const key = e.target.value
                setSelectedFieldKey(key)
                if (key) onSelectedFieldKeyChange?.(key)
              }}
              disabled={!fieldOptions.length}
            >
              {!fieldOptions.length ? (
                <option value="">No Agro Structures fields</option>
              ) : (
                fieldOptions.map(opt => (
                  <option key={opt.fieldKey} value={opt.fieldKey}>
                    {opt.displayName}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="acp-ts__field acp-ts__field--layer acp-ts__field--grow">
            <AcpImageryLayerMultiSelect
              groups={layerGroups}
              selectedIds={selectedLayerIds}
              onSelectedIdsChange={ids => {
                handleInvalidate()
                setSelectedLayerIds(ids)
              }}
            />
          </div>
          <div className="acp-ts__date-range">
            <label className="acp-ts__field acp-ts__field--date">
              <span>Start Date</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={e => {
                  const next = e.target.value
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
                  setToDate(next)
                  if (fromDate && next && fromDate >= next) {
                    setDateError('End Date must be after Start Date.')
                  } else {
                    setDateError(null)
                  }
                }}
              />
            </label>
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
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
          <button
            type="button"
            className="acp-ts__apply"
            onClick={() => void runAnalysisWrapped()}
            disabled={(loading && !hasChartData) || !selectedFieldKey}
          >
            {loading && !hasChartData ? 'Running…' : refreshing ? 'Updating…' : 'Apply'}
          </button>
        </div>

        {hasRun && chartReady ? (
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

        {hasRun && chartReady && latestWaterPoint ? (
          <div
            className={
              'acp-ts__water-summary' +
              (latestWaterPoint.highWaterLoss ? ' acp-ts__water-summary--alert' : '')
            }
            aria-label="Estimated water loss snapshot"
          >
            <div className="acp-ts__water-summary-main">
              <strong>Estimated Water Loss</strong>
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
            <div className="acp-ts__water-summary-kpis">
              <div>
                <em>Loss index</em>
                <strong>{latestWaterPoint.waterLossIndexPct.toFixed(0)}%</strong>
              </div>
              <div>
                <em>m³/day</em>
                <strong>
                  {latestWaterPoint.waterLossM3Day >= 1000
                    ? `${(latestWaterPoint.waterLossM3Day / 1000).toFixed(1)}k`
                    : latestWaterPoint.waterLossM3Day.toFixed(0)}
                </strong>
              </div>
              <div>
                <em>m³/ha/day</em>
                <strong>{latestWaterPoint.waterLossM3HaDay.toFixed(1)}</strong>
              </div>
              <div>
                <em>NDMI</em>
                <strong>
                  {latestWaterPoint.ndmi != null ? latestWaterPoint.ndmi.toFixed(3) : '—'}
                </strong>
              </div>
              <div>
                <em>NDWI</em>
                <strong>
                  {latestWaterPoint.ndwi != null
                    ? `${latestWaterPoint.ndwi.toFixed(3)}${latestWaterPoint.ndwiEstimated ? '*' : ''}`
                    : '—'}
                </strong>
              </div>
              <div>
                <em>Trend</em>
                <strong>{latestWaterPoint.trend}</strong>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={
            'acp-ts__chart-wrap' +
            (hasSecondaryOverlays && chartWorkspaceTab === 'chart' ? ' acp-ts__chart-wrap--overlays' : '') +
            (chartWorkspaceTab === 'interpretation' ? ' acp-ts__chart-wrap--interpret-tab' : '')
          }
          ref={chartWrapRef}
        >
          {interpretationSupported ? (
            <div className="acp-ts__workspace-tabs" role="tablist" aria-label="Time series workspace">
              <button
                type="button"
                role="tab"
                className={
                  'acp-ts__workspace-tab' + (chartWorkspaceTab === 'chart' ? ' is-active' : '')
                }
                aria-selected={chartWorkspaceTab === 'chart'}
                onClick={() => setChartWorkspaceTab('chart')}
              >
                <i className="fa-solid fa-chart-line" aria-hidden="true" /> Chart
              </button>
              <button
                type="button"
                role="tab"
                className={
                  'acp-ts__workspace-tab' +
                  (chartWorkspaceTab === 'interpretation' ? ' is-active' : '')
                }
                aria-selected={chartWorkspaceTab === 'interpretation'}
                onClick={() => setChartWorkspaceTab('interpretation')}
              >
                <i className="fa-solid fa-lightbulb" aria-hidden="true" /> Interpretation
              </button>
            </div>
          ) : null}

          {chartWorkspaceTab === 'interpretation' && interpretationSupported ? (
            <div className="acp-ts__workspace-pane acp-ts__workspace-pane--interpret" role="tabpanel">
              <SiImageryIndexInterpretationCard
                interpretation={interpretation}
                loadingAreas={loadingAreas}
                onAction={handleInterpretationAction}
              />
            </div>
          ) : hasRun && chartReady ? (
            <div className="acp-ts__workspace-pane acp-ts__workspace-pane--chart" role="tabpanel">
              {chartType === 'bar' ? (
                <Bar ref={chartRef as never} data={chartData as ChartData<'bar'>} options={cartesianChartOptions} />
              ) : chartType === 'pie' ? (
                <Pie ref={chartRef as never} data={pieChartData} options={pieChartOptions} />
              ) : chartType === 'scatter' ? (
                <Scatter ref={chartRef as never} data={scatterChartData} options={scatterChartOptions} />
              ) : (
                <Line ref={chartRef as never} data={chartData as ChartData<'line'>} options={cartesianChartOptions} />
              )}
            </div>
          ) : loading && !hasChartData ? (
            <div className="acp-ts__skeleton acp-ts__skeleton--atomic" role="status" aria-live="polite" aria-busy="true">
              <div className="acp-ts__skeleton-spinner" aria-hidden="true">
                <i className="fa-solid fa-spinner fa-spin" />
              </div>
              <p className="acp-ts__skeleton-status">Loading imagery…</p>
              {selectedFieldLabel !== '—' ? (
                <p className="acp-ts__skeleton-context">
                  {selectedFieldLabel}
                  {selectedLayerIds.length ? ` · ${selectedLayerIds.join(', ')}` : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="acp-ts__placeholder">
              {hasRun && displayError
                ? displayError
                : 'Set Start Date and End Date, then click Apply — the chart updates automatically when dates change.'}
            </div>
          )}
        </div>

        {hasRun && chartReady && chartWorkspaceTab === 'chart' ? (
          <p className="acp-ts__chart-hint">
            <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click any point to set the map
            analysis date · Map date: <strong>{analysisDate}</strong>
            {interpretSceneDate ? (
              <>
                {' '}
                · Interpret: <strong>{interpretSceneDate}</strong>
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

        <SiDynamicMapSnapshotsPanel
          open={mapSnapshotsOpen}
          geometry={resolvedField?.geometry ?? committedAoiGeometry}
          layerIds={selectedLayerIds}
          sceneDate={interpretSceneDate || referenceDate}
          fieldName={selectedFieldLabel}
          dailyRows={dailyRows}
          layerSeries={layerSeries}
          mapboxToken={mapboxToken}
          enabled={hasRun && !!selectedLayerIds.length}
        />

        <div className="acp-ts__foot">
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
              className={'acp-ts__exports-interpret' + (interpretationOpen ? ' is-on' : '')}
              title="Open Interpretation in the chart area"
              aria-label="Interpretation"
              aria-pressed={interpretationOpen}
              disabled={!interpretationSupported}
              onClick={openInterpretationTab}
            >
              <i className="fa-solid fa-lightbulb" aria-hidden="true" /> Interpretation
            </button>
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
              dailyRows={dailyRows}
              chartRef={chartRef}
              chartType={chartType}
              mapboxToken={mapboxToken}
              periodAnchorDates={periodAnchorDates}
              projectName={projectName}
              generatedBy={generatedBy}
            />
          </div>
        </div>
    </div>
  )
}
