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
  DoughnutController,
  type ChartData,
} from 'chart.js'

export type ImageryTimeSeriesPanelTab = 'chart' | 'statistics' | 'interpretation' | 'coverage'
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2'
import { useImageryTimeSeriesStream } from '../hooks/useImageryTimeSeriesStream'
import { useImageryIndexInterpretation } from '../hooks/useImageryIndexInterpretation'
import { useImageryVegetationCoverage } from '../hooks/useImageryVegetationCoverage'
import { SiImageryIndexInterpretationCard } from './SiImageryIndexInterpretationCard'
import { SiImageryStatisticsTab } from './time-series/SiImageryStatisticsTab'
import { SiImageryVegetationCoverageTab } from './time-series/SiImageryVegetationCoverageTab'
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields'
import {
  buildImageryCorrelationScatterAnalysis,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  buildImageryTimeSeriesLayerGroups,
  defaultImageryDateRange,
  aggregateImagerySeriesByPeriod,
  IMAGERY_TIME_AGGREGATION_OPTIONS,
  imageryLayerChartColor,
  splitSeriesByYear,
  yearSplitChartColors,
  type ImageryChartType,
  type ImageryCorrelationScatterAnalysis,
  type ImageryTimeAggregation,
  type ImageryTimeSeriesLayerSeries,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { AcpImageryLayerMultiSelect } from '../../dashboards/agroCloudPlatform/map/AcpImageryLayerMultiSelect'
import { SiImageryFieldAoiSelect } from './SiImageryFieldAoiSelect'
import { SiImageryPeriodSelect } from './SiImageryPeriodSelect'
import {
  buildSiImageryFieldAoiOptionGroups,
  flattenImageryFieldAoiOptions,
  isImageryFieldAoiActionKey,
  SI_IMAGERY_COMMITTED_AOI_KEY,
} from '../utils/siImageryTimeSeriesAoi'
import { resolveSiImageryField } from '../utils/siImageryTimeSeriesFields'
import { TimeSeriesExportMenu } from './timeSeriesReport/ExportManager'
import { TimeSeriesReportConfigModal } from './timeSeriesReport/TimeSeriesReportConfigModal'
import {
  generateFullTimeSeriesReport,
  runTimeSeriesExport,
} from '../lib/timeSeriesReport/exportManager'
import type { TimeSeriesExportKind, TimeSeriesReportConfig } from '../lib/timeSeriesReport/timeSeriesReportTypes'
import { appAlert } from '../../../lib/appDialog'
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
  DoughnutController,
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
  onRequestDrawAoi?: () => void
  chartLookbackDays?: number
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
  onRequestDrawAoi,
  chartLookbackDays = 90,
}: SiImageryTimeSeriesPanelProps) {
  const chartRef = useRef<ChartJS | null>(null)
  const referenceDate = analysisDate.trim().slice(0, 10) || new Date().toISOString().slice(0, 10)
  const defaultRange = useMemo(
    () => defaultImageryDateRange(referenceDate, chartLookbackDays),
    [referenceDate, chartLookbackDays],
  )

  const fieldAoiGroups = useMemo(
    () => buildSiImageryFieldAoiOptionGroups(agroStructuresMask, aoiFields, committedAoiGeometry),
    [agroStructuresMask, aoiFields, committedAoiGeometry],
  )

  const fieldOptions = useMemo(
    () => flattenImageryFieldAoiOptions(fieldAoiGroups),
    [fieldAoiGroups],
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
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0)
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ImageryTimeSeriesPanelTab>('chart')
  const [reportOpen, setReportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [reportGenerating, setReportGenerating] = useState(false)
  const runAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const autoRunReadyRef = useRef(false)
  const prevAutoRunDatesRef = useRef({ from: '', to: '' })

  const resolvedField = useMemo(
    () =>
      selectedFieldKey
        ? resolveSiImageryField(agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKey)
        : null,
    [agroStructuresMask, aoiFields, committedAoiGeometry, selectedFieldKey],
  )

  const {
    labels,
    layerSeries,
    dailyRows,
    loading,
    refreshing,
    progress,
    error,
    hasRun,
    analysisDurationMs,
    run: runAnalysis,
    invalidateResults,
  } = useImageryTimeSeriesStream({
    field: resolvedField,
    fromDate,
    toDate,
    layerIds: selectedLayerIds,
    referenceDate,
    prefetchLookbackDays: chartLookbackDays,
  })

  const primaryLayerId = selectedLayerIds[0]?.trim() || 'NDVI'

  const chartAggregation = chartType === 'scatter' ? 'day' : timeAggregation

  const {
    labels: displayLabels,
    layerSeries: displayLayerSeries,
    anchorDates: chartAnchorDates,
  } = useMemo(
    () => aggregateImagerySeriesByPeriod(labels, layerSeries, chartAggregation),
    [labels, layerSeries, chartAggregation],
  )

  const primaryChartValues = useMemo(() => {
    const series = layerSeries.find(s => s.layerId.toUpperCase() === primaryLayerId.toUpperCase())
    return series?.values ?? layerSeries[0]?.values ?? []
  }, [layerSeries, primaryLayerId])

  const interpretSceneDate = useMemo(() => {
    const picked = selectedChartDate?.trim().slice(0, 10)
    if (picked && labels.includes(picked)) return picked
    const mapDay = referenceDate.trim().slice(0, 10)
    if (mapDay && labels.includes(mapDay)) return mapDay
    return labels[labels.length - 1] ?? ''
  }, [selectedChartDate, referenceDate, labels])

  const interpretationSupported =
    hasRun && labels.length > 0 && chartType !== 'scatter' && chartType !== 'pie'

  const interpretationEnabled = activeTab === 'interpretation' && interpretationSupported

  const { interpretation, loadingAreas } = useImageryIndexInterpretation({
    field: resolvedField,
    layerId: primaryLayerId,
    sceneDate: interpretSceneDate,
    dailyRows,
    chartLabels: labels,
    chartValues: primaryChartValues,
    enabled: interpretationEnabled,
  })

  const coverageEnabled = activeTab === 'coverage' && hasRun && labels.length > 0

  const {
    summary: coverageSummary,
    comparison: coverageComparison,
    trend: coverageTrend,
    insights: coverageInsights,
    loading: coverageLoading,
    supported: coverageSupported,
  } = useImageryVegetationCoverage({
    field: resolvedField,
    layerId: primaryLayerId,
    sceneDate: interpretSceneDate,
    chartLabels: labels,
    chartValues: primaryChartValues,
    enabled: coverageEnabled,
  })

  const handleInvalidate = useCallback(() => {
    invalidateResults()
    autoRunReadyRef.current = false
    setDateError(null)
    setSelectedChartDate(null)
    setActiveTab('chart')
  }, [invalidateResults])

  const displayError = dateError || error

  useEffect(() => {
    const selectable = fieldOptions.filter(o => !o.disabled)
    if (!selectable.length) {
      setSelectedFieldKey('')
      return
    }
    const external = selectedFieldKeyProp?.trim()
    if (external && !isImageryFieldAoiActionKey(external) && selectable.some(o => o.fieldKey === external)) {
      setSelectedFieldKey(external)
      return
    }
    setSelectedFieldKey(prev =>
      prev && selectable.some(o => o.fieldKey === prev) ? prev : selectable[0]!.fieldKey,
    )
  }, [fieldOptions, selectedFieldKeyProp])

  useEffect(() => {
    if (!committedAoiGeometry || !selectedFieldKey) return
    if (selectedFieldKey !== SI_IMAGERY_COMMITTED_AOI_KEY) return
    if (fieldOptions.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY && !o.disabled)) return
    const fallback = fieldOptions.find(o => o.fieldKey !== SI_IMAGERY_COMMITTED_AOI_KEY && !o.disabled)
    if (fallback) setSelectedFieldKey(fallback.fieldKey)
  }, [committedAoiGeometry, selectedFieldKey, fieldOptions])

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
    setAnalysisElapsedMs(0)
    await runAnalysis()
    autoRunReadyRef.current = true
    prevAutoRunDatesRef.current = { from: fromDate, to: toDate }
  }, [runAnalysis, fromDate, toDate])

  const handleAnalyze = useCallback(async () => {
    if (!selectedFieldKey || dateError) return
    await runAnalysisWrapped()
    setActiveTab('interpretation')
  }, [selectedFieldKey, dateError, runAnalysisWrapped])

  const exportInputBase = useMemo(
    () => ({
      title: `Agro Intelligence Report — ${selectedFieldLabel}`,
      projectName: 'AgroCloud Satellite Intelligence',
      field: resolvedField,
      fieldName: selectedFieldLabel,
      fieldKey: selectedFieldKey,
      layerIds: selectedLayerIds,
      fromDate,
      toDate,
      aggregation: timeAggregation,
      labels,
      layerSeries,
      dailyRows,
      referenceDate,
      selectedChartDate,
      chartType,
    }),
    [
      selectedFieldLabel,
      resolvedField,
      selectedFieldKey,
      selectedLayerIds,
      fromDate,
      toDate,
      timeAggregation,
      labels,
      layerSeries,
      dailyRows,
      referenceDate,
      selectedChartDate,
      chartType,
    ],
  )

  const handleExport = useCallback(
    async (kind: TimeSeriesExportKind) => {
      if (!hasRun || !labels.length) {
        await appAlert('Run analysis first to export results.')
        return
      }
      setExportBusy(true)
      try {
        const ok = await runTimeSeriesExport(kind, {
          ...exportInputBase,
          chartRef: chartRef.current,
        })
        if (!ok) await appAlert('Export could not be completed. Check field geometry and data.')
      } finally {
        setExportBusy(false)
      }
    },
    [exportInputBase, hasRun, labels.length],
  )

  const handleGenerateReport = useCallback(
    async (config: TimeSeriesReportConfig) => {
      if (!hasRun || !labels.length) {
        await appAlert('Run analysis first to generate a report.')
        return
      }
      setReportGenerating(true)
      try {
        const ok = await generateFullTimeSeriesReport(
          {
            ...exportInputBase,
            chartRef: chartRef.current,
          },
          config,
        )
        if (ok) {
          setReportOpen(false)
        } else {
          await appAlert('Report generation failed. Check field geometry and analysis data.')
        }
      } finally {
        setReportGenerating(false)
      }
    },
    [exportInputBase, hasRun, labels.length],
  )

  runAnalysisRef.current = runAnalysisWrapped

  useEffect(() => {
    if (!loading) return
    const tick = () => setAnalysisElapsedMs(ms => ms + 100)
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!autoRunReadyRef.current || !selectedFieldKey || loading) return
    if (!fromDate || !toDate || fromDate >= toDate) return
    const prev = prevAutoRunDatesRef.current
    if (prev.from === fromDate && prev.to === toDate) return
    const id = window.setTimeout(() => void runAnalysisRef.current(), 650)
    return () => window.clearTimeout(id)
  }, [fromDate, toDate, selectedFieldKey, loading])

  const chartDateClickHandler = useCallback(
    (_event: unknown, elements: Array<{ index: number; datasetIndex?: number }>) => {
      if (!elements.length) return
      const el = elements[0]!
      if (el.datasetIndex != null && el.datasetIndex > 0) return
      const date = chartAnchorDates[el.index] ?? displayLabels[el.index]
      if (date) {
        setSelectedChartDate(date)
        syncMapToChartDate(date)
      }
    },
    [chartAnchorDates, displayLabels, syncMapToChartDate],
  )

  const chartData = useMemo((): ChartData<'line' | 'bar'> => {
    if (!displayLabels.length || !displayLayerSeries.length) {
      return { labels: [], datasets: [] }
    }
    if (splitByYears && displayLayerSeries.length === 1 && chartAggregation === 'day') {
      const values = displayLayerSeries[0]!.values
      const splits = splitSeriesByYear(displayLabels, values)
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
      labels: displayLabels,
      datasets: displayLayerSeries.map((entry, index) => {
        const color = imageryLayerChartColor(index)
        return {
          label: entry.layerId,
          data: entry.values,
          borderColor: color,
          backgroundColor: chartType === 'area' ? `${color}33` : chartType === 'bar' ? `${color}88` : color,
          fill: chartType === 'area',
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 1.5,
        }
      }),
    }
  }, [displayLabels, displayLayerSeries, splitByYears, chartType, chartAggregation])

  const pieChartData = useMemo((): ChartData<'pie'> => {
    if (!displayLabels.length || !displayLayerSeries.length) return { labels: [], datasets: [] }
    const slices = buildImageryPieChartSlices(displayLabels, displayLayerSeries)
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
  }, [displayLabels, displayLayerSeries])

  const scatterCorrelation = useMemo((): ImageryCorrelationScatterAnalysis | null => {
    if (chartType !== 'scatter' || layerSeries.length < 2 || !labels.length) return null
    const xSeries = layerSeries[0]!
    const ySeries = layerSeries[1]!
    return buildImageryCorrelationScatterAnalysis(
      labels,
      xSeries.layerId,
      xSeries.values,
      ySeries.layerId,
      ySeries.values,
    )
  }, [chartType, labels, layerSeries])

  const scatterChartData = useMemo((): ChartData<'scatter' | 'line'> => {
    if (!labels.length || !layerSeries.length) return { labels: [], datasets: [] }

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
          data: buildImageryScatterPoints(labels, entry.values),
          borderColor: color,
          backgroundColor: `${color}cc`,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      }),
    }
  }, [labels, layerSeries, scatterCorrelation])

  const cartesianChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: loading ? 0 : 280 },
      onClick: chartDateClickHandler,
      plugins: {
        legend: {
          display: splitByYears || displayLayerSeries.length > 1 || hasRun,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
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
          ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 9 } },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          ticks: { color: '#94a3b8', font: { size: 9 } },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    }),
    [loading, splitByYears, displayLayerSeries.length, hasRun, chartDateClickHandler],
  )

  const pieChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: loading ? 0 : 280 },
      plugins: {
        legend: {
          display: true,
          position: 'right' as const,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
        },
        tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
      },
    }),
    [loading],
  )

  const scatterChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: loading ? 0 : 280 },
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
    [loading, layerSeries.length, hasRun, scatterCorrelation, chartDateClickHandler],
  )

  const formatAnalysisSpeed = (ms: number) => {
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(1)} s`
  }

  const observationCount = displayLabels.length

  const aggregationLabel =
    IMAGERY_TIME_AGGREGATION_OPTIONS.find(o => o.id === chartAggregation)?.label ?? 'Day'

  const layerSummary = selectedLayerIds.join(', ')

  return (
    <div className="acp-ts">
        <div className="acp-ts__toolbar">
          <SiImageryFieldAoiSelect
            groups={fieldAoiGroups}
            value={selectedFieldKey}
            onRequestDrawAoi={onRequestDrawAoi}
            onChange={key => {
              handleInvalidate()
              setSelectedFieldKey(key)
              onSelectedFieldKeyChange?.(key)
            }}
          />
          <div className="acp-ts__field acp-ts__field--layer acp-ts__field--grow">
            <span className="acp-ts__field-label">Layer</span>
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
          <SiImageryPeriodSelect
            value={timeAggregation}
            disabled={chartType === 'scatter'}
            disabledTitle="Scatter correlation uses daily scenes"
            onChange={setTimeAggregation}
          />
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
        </div>

        <div className="acp-ts__actions">
          <button
            type="button"
            className="acp-ts__analyze"
            onClick={() => void handleAnalyze()}
            disabled={loading || !selectedFieldKey || Boolean(dateError)}
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button
            type="button"
            className="acp-ts__report"
            onClick={() => setReportOpen(true)}
            disabled={!selectedFieldKey}
          >
            Generate Full Report
          </button>
          <TimeSeriesExportMenu
            disabled={!hasRun || !displayLabels.length}
            busy={exportBusy}
            onExport={handleExport}
          />
        </div>

        <TimeSeriesReportConfigModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          onGenerate={handleGenerateReport}
          fieldName={selectedFieldLabel}
          layerIds={selectedLayerIds}
          fromDate={fromDate}
          toDate={toDate}
          aggregation={timeAggregation}
          generating={reportGenerating}
        />

        {hasRun ? (
          <div className="acp-ts__meta">
            <span>
              {layerSummary}
              {chartType === 'scatter' && layerSeries.length >= 2
                ? ` · correlation ${layerSeries[0]?.layerId} → ${layerSeries[1]?.layerId}`
                : ` · ${fromDate} → ${toDate}`}
              {chartType !== 'scatter' ? ` · ${aggregationLabel}` : ''}
              {observationCount ? ` · ${observationCount} obs` : ''}
              {analysisDurationMs != null ? ` · ${formatAnalysisSpeed(analysisDurationMs)}` : ''}
            </span>
            <span>{selectedFieldLabel}</span>
          </div>
        ) : null}

        {hasRun && labels.length ? (
          <div className="acp-ts__view-tabs" role="tablist" aria-label="Time series views">
            {(
              [
                { id: 'chart' as const, label: 'Chart', icon: 'fa-chart-line' },
                { id: 'statistics' as const, label: 'Statistics', icon: 'fa-table' },
                { id: 'interpretation' as const, label: 'Interpretation', icon: 'fa-lightbulb', disabled: !interpretationSupported },
                { id: 'coverage' as const, label: 'Vegetation Coverage', icon: 'fa-leaf', emoji: '🌿' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`acp-ts-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`acp-ts-panel-${tab.id}`}
                className={'acp-ts__view-tab' + (activeTab === tab.id ? ' is-active' : '')}
                disabled={'disabled' in tab && tab.disabled}
                onClick={() => setActiveTab(tab.id)}
              >
                {'emoji' in tab && tab.emoji ? (
                  <span className="acp-ts__view-tab-emoji" aria-hidden="true">
                    {tab.emoji}
                  </span>
                ) : (
                  <i className={'fa-solid ' + tab.icon} aria-hidden="true" />
                )}
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === 'chart' ? (
        <div className="acp-ts__chart-wrap" id="acp-ts-panel-chart" role="tabpanel" aria-labelledby="acp-ts-tab-chart">
          {hasRun && displayLabels.length ? (
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
              {loading || refreshing ? (
                <div
                  className="acp-ts__progress"
                  role="status"
                  aria-live="polite"
                  aria-busy={loading || refreshing}
                >
                  <div className="acp-ts__progress-head">
                    <span>{progress.message || 'Loading imagery…'}</span>
                    <span className="acp-ts__progress-speed">
                      <i className="fa-solid fa-bolt" aria-hidden="true" />
                      {formatAnalysisSpeed(analysisElapsedMs)}
                    </span>
                  </div>
                  {progress.chunksTotal > 0 ? (
                    <div
                      className="acp-ts__progress-bar"
                      role="progressbar"
                      aria-valuenow={progress.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : loading ? (
            <div className="acp-ts__skeleton" role="status" aria-live="polite" aria-busy="true">
              <div className="acp-ts__skeleton-head">
                <span className="acp-ts__skeleton-range">
                  {fromDate} → {toDate}
                </span>
                <span className="acp-ts__skeleton-speed">
                  <i className="fa-solid fa-bolt" aria-hidden="true" />
                  {formatAnalysisSpeed(analysisElapsedMs)}
                </span>
              </div>
              <p className="acp-ts__skeleton-status">
                {progress.message || 'Preparing chart…'}
                {selectedFieldLabel !== '—' ? (
                  <>
                    {' '}
                    for <strong>{selectedFieldLabel}</strong>
                  </>
                ) : null}
                {selectedLayerIds.length ? ` · ${selectedLayerIds.join(', ')}` : ''}
              </p>
              {progress.chunksTotal > 0 ? (
                <div
                  className="acp-ts__progress-bar acp-ts__progress-bar--skeleton"
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${Math.max(progress.percent, 8)}%` }} />
                </div>
              ) : (
                <>
                  <div className="acp-ts__skeleton-bar" />
                  <div className="acp-ts__skeleton-bar acp-ts__skeleton-bar--short" />
                </>
              )}
              <div className="acp-ts__skeleton-chart" />
            </div>
          ) : (
            <div className="acp-ts__placeholder">
              {hasRun && displayError
                ? displayError
                : 'Set Start Date and End Date, then click Apply — the chart updates automatically when dates change.'}
            </div>
          )}
        </div>
        ) : null}

        {activeTab === 'chart' && hasRun && displayLabels.length ? (
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

        {activeTab === 'chart' && chartType === 'scatter' && scatterCorrelation ? (
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
        ) : activeTab === 'chart' && chartType === 'scatter' && hasRun && labels.length && layerSeries.length < 2 ? (
          <p className="acp-ts__scatter-hint">Select two layers to run correlation scatter with regression and R².</p>
        ) : null}

        {activeTab === 'chart' && displayError && hasRun && labels.length ? (
          <p className="acp-ts__error">{displayError}</p>
        ) : null}

        {activeTab === 'statistics' ? (
          <div id="acp-ts-panel-statistics" role="tabpanel" aria-labelledby="acp-ts-tab-statistics">
            <SiImageryStatisticsTab layerSeries={layerSeries} labels={labels} />
          </div>
        ) : null}

        {activeTab === 'interpretation' ? (
          <div id="acp-ts-panel-interpretation" role="tabpanel" aria-labelledby="acp-ts-tab-interpretation">
            {interpretationSupported ? (
              <SiImageryIndexInterpretationCard
                interpretation={interpretation}
                loadingAreas={loadingAreas}
              />
            ) : (
              <div className="acp-ts__interpret acp-ts__interpret--empty" role="status">
                Interpretation is available for line and bar charts with a single time series.
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'coverage' ? (
          <div id="acp-ts-panel-coverage" role="tabpanel" aria-labelledby="acp-ts-tab-coverage">
            <SiImageryVegetationCoverageTab
              summary={coverageSummary}
              comparison={coverageComparison}
              trend={coverageTrend}
              insights={coverageInsights}
              loading={coverageLoading}
              supported={coverageSupported}
              geometry={resolvedField?.geometry ?? null}
              layerId={primaryLayerId}
              sceneDate={interpretSceneDate}
            />
          </div>
        ) : null}

        <div className="acp-ts__foot">
          {activeTab === 'chart' ? (
          <label className="acp-ts__toggle">
            <input
              type="checkbox"
              checked={splitByYears}
              disabled={
                selectedLayerIds.length > 1 ||
                chartType === 'pie' ||
                chartType === 'scatter' ||
                timeAggregation !== 'day'
              }
              onChange={e => setSplitByYears(e.target.checked)}
            />
            Split by years
            {selectedLayerIds.length > 1 ||
            chartType === 'pie' ||
            chartType === 'scatter' ||
            timeAggregation !== 'day' ? (
              <span className="acp-ts__toggle-hint">
                {timeAggregation !== 'day'
                  ? ' (daily view only)'
                  : chartType === 'pie' || chartType === 'scatter'
                    ? ' (cartesian charts only)'
                    : ' (single layer only)'}
              </span>
            ) : null}
          </label>
          ) : (
            <span className="acp-ts__foot-spacer" />
          )}
        </div>
    </div>
  )
}
