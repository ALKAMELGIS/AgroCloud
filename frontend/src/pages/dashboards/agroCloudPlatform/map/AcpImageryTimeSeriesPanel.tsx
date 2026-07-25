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
import { fetchCropAlertSentinelHistoryExtension, buildDailySeriesFromEngineScenes } from '../../../../lib/siCropAlertSentinelLive'
import {
  fetchChirpsPrecipForImageryChart,
  mergeOpticalAndChirpsChart,
  partitionImageryTimeSeriesLayerIds,
} from '../../../../lib/chirpsRainfall/chirpsImageryTimeSeries'
import { acpDefaultLayerIdsFromChartSeries } from '../acpSettingsBundle'
import { useAcpPlatform } from '../acpPlatformContext'
import {
  aggregateImageryTimeSeries,
  aggregateImageryTimeSeriesMulti,
  buildImageryCorrelationScatterAnalysis,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  buildImageryTimeSeriesLayerGroups,
  defaultImageryDateRange,
  flattenImageryTimeSeriesLayerOptions,
  imageryLayerChartColor,
  pruneImageryTimeSeriesToObservations,
  pruneSingleLayerImagerySeries,
  splitSeriesByYear,
  yearSplitChartColors,
  type ImageryChartType,
  type ImageryCorrelationScatterAnalysis,
  type ImageryTimeSeriesLayerSeries,
} from '../acpImageryTimeSeries'
import { buildCorrelationInterpretation } from '../../../satellite/lib/timeSeriesReport/timeSeriesScatterChartRenderer'
import {
  buildAgroStructureFieldOptions,
  resolveAgroStructureFieldByKey,
} from '../acpMapSpatial'
import { AcpImageryLayerMultiSelect } from './AcpImageryLayerMultiSelect'
import { AcpMapPanel } from './AcpMapPanel'

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

type Props = { onClose: () => void }

export function AcpImageryTimeSeriesPanel({ onClose }: Props) {
  const acp = useAcpPlatform()
  const chartRef = useRef<ChartJS | null>(null)
  const referenceDate = acp.autoFollowDate ? new Date().toISOString().slice(0, 10) : acp.analysisDate
  const defaultRange = useMemo(
    () => defaultImageryDateRange(referenceDate, acp.config.chartLookbackDays),
    [referenceDate, acp.config.chartLookbackDays],
  )

  const fieldOptions = useMemo(
    () => buildAgroStructureFieldOptions(acp.aoiMask),
    [acp.aoiMask],
  )

  const layerGroups = useMemo(() => buildImageryTimeSeriesLayerGroups(), [])
  const allLayerOptions = useMemo(() => flattenImageryTimeSeriesLayerOptions(), [])
  const chartSeriesLayerIds = useMemo(
    () => new Set(acpDefaultLayerIdsFromChartSeries(acp.config.chartSeries).map(id => id.toUpperCase())),
    [acp.config.chartSeries],
  )
  const layerOptions = useMemo(() => {
    if (!acp.config.chartSeries.length) return allLayerOptions
    const filtered = allLayerOptions.filter(opt =>
      chartSeriesLayerIds.has(opt.id.trim().toUpperCase()),
    )
    return filtered.length ? filtered : allLayerOptions
  }, [allLayerOptions, chartSeriesLayerIds, acp.config.chartSeries.length])

  const [selectedFieldKey, setSelectedFieldKey] = useState('')
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [chartType, setChartType] = useState<ImageryChartType>('line')
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [splitByYears, setSplitByYears] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [layerSeries, setLayerSeries] = useState<ImageryTimeSeriesLayerSeries[]>([])
  const [hasRun, setHasRun] = useState(false)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0)
  const runAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const autoRunReadyRef = useRef(false)
  const prevAutoRunDatesRef = useRef({ from: '', to: '' })

  useEffect(() => {
    if (!fieldOptions.length) {
      setSelectedFieldKey('')
      return
    }
    const mapSelected = acp.selectedFieldKey
    if (mapSelected && fieldOptions.some(o => o.fieldKey === mapSelected)) {
      setSelectedFieldKey(mapSelected)
      return
    }
    setSelectedFieldKey(prev =>
      prev && fieldOptions.some(o => o.fieldKey === prev) ? prev : fieldOptions[0]!.fieldKey,
    )
  }, [fieldOptions, acp.selectedFieldKey])

  useEffect(() => {
    if (selectedLayerIds.length > 1 && splitByYears) setSplitByYears(false)
  }, [selectedLayerIds.length, splitByYears])

  useEffect(() => {
    if ((chartType === 'pie' || chartType === 'scatter') && splitByYears) setSplitByYears(false)
  }, [chartType, splitByYears])

  const invalidateResults = useCallback(() => {
    setHasRun(false)
    setLabels([])
    setLayerSeries([])
    setError(null)
    setAnalysisDurationMs(null)
    autoRunReadyRef.current = false
  }, [])

  const syncMapToChartDate = useCallback(
    (isoDate: string) => {
      const day = isoDate.trim().slice(0, 10)
      if (!day || day.length < 10) return
      acp.setAutoFollowDate(false)
      acp.setAnalysisDate(day)
    },
    [acp],
  )

  const selectedFieldLabel =
    fieldOptions.find(o => o.fieldKey === selectedFieldKey)?.displayName ?? '—'

  const runAnalysis = useCallback(async () => {
    setHasRun(true)
    setError(null)
    setLabels([])
    setLayerSeries([])

    if (!selectedFieldKey) {
      setError('Select a field from Agro Structures.')
      return
    }
    const field = resolveAgroStructureFieldByKey(acp.aoiMask, selectedFieldKey)
    if (!field) {
      setError('Selected field is no longer available.')
      return
    }
    if (!fromDate || !toDate || fromDate >= toDate) {
      setError('Invalid date range.')
      return
    }
    if (!selectedLayerIds.length) {
      setError('Select at least one layer.')
      return
    }

    const layerIds = selectedLayerIds
    const { precipLayerIds, opticalLayerIds } = partitionImageryTimeSeriesLayerIds(layerIds)

    const startedAt = performance.now()
    setAnalysisElapsedMs(0)
    setLoading(true)
    try {
      let opticalLabels: string[] = []
      let opticalSeries: ImageryTimeSeriesLayerSeries[] = []

      if (opticalLayerIds.length) {
        let historyMap = await fetchCropAlertSentinelHistoryExtension([field], {
          fromIso: fromDate,
          toIso: toDate,
          concurrency: 4,
        })

        if (!historyMap.get(field.fieldKey)?.length) {
          const engineHit = acp.allResults.find(r => r.fieldKey === field.fieldKey)
          if (engineHit) {
            const fallbackDaily = buildDailySeriesFromEngineScenes(engineHit, fromDate, toDate)
            if (fallbackDaily.length) {
              historyMap = new Map(historyMap)
              historyMap.set(field.fieldKey, fallbackDaily)
            }
          }
        }

        if (opticalLayerIds.length === 1) {
          const raw = aggregateImageryTimeSeries(historyMap, [field.fieldKey], opticalLayerIds[0]!)
          const single = pruneSingleLayerImagerySeries(raw.labels, raw.values)
          opticalLabels = single.labels
          opticalSeries = [{ layerId: opticalLayerIds[0]!, values: single.values }]
        } else {
          const raw = aggregateImageryTimeSeriesMulti(historyMap, [field.fieldKey], opticalLayerIds)
          const multi = pruneImageryTimeSeriesToObservations(raw.labels, raw.series)
          opticalLabels = multi.labels
          opticalSeries = multi.series
        }
      }

      let chirpsPoints = null as Awaited<ReturnType<typeof fetchChirpsPrecipForImageryChart>> | null
      if (precipLayerIds.length) {
        chirpsPoints = await fetchChirpsPrecipForImageryChart({
          geometry: field.geometry,
          start: fromDate,
          end: toDate,
        })
      }

      if (precipLayerIds.length) {
        const merged = mergeOpticalAndChirpsChart({
          layerIds,
          opticalLabels,
          opticalSeries,
          chirpsPoints,
        })
        setLabels(merged.labels)
        setLayerSeries(merged.series)
        if (!merged.labels.length) {
          setError(
            precipLayerIds.length && !opticalLayerIds.length
              ? 'No CHIRPS rainfall observations in this date range — try widening dates.'
              : 'No observations in this date range — try widening dates or check Sentinel / CHIRPS coverage.',
          )
        } else {
          setError(null)
        }
      } else if (layerIds.length === 1) {
        setLabels(opticalLabels)
        setLayerSeries(opticalSeries)
        if (!opticalLabels.length) {
          setError('No observations in this date range — try widening dates or check Sentinel coverage.')
        } else {
          setError(null)
        }
      } else {
        setLabels(opticalLabels)
        setLayerSeries(opticalSeries)
        if (!opticalLabels.length) {
          setError('No observations in this date range — try widening dates or check Sentinel coverage.')
        } else {
          setError(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setLabels([])
      setLayerSeries([])
    } finally {
      setAnalysisDurationMs(Math.max(0, Math.round(performance.now() - startedAt)))
      setLoading(false)
      autoRunReadyRef.current = true
      prevAutoRunDatesRef.current = { from: fromDate, to: toDate }
    }
  }, [
    acp.aoiMask,
    acp.allResults,
    selectedFieldKey,
    fromDate,
    toDate,
    selectedLayerIds,
  ])

  runAnalysisRef.current = runAnalysis

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
      const date = labels[el.index]
      if (date) syncMapToChartDate(date)
    },
    [labels, syncMapToChartDate],
  )

  const chartData = useMemo((): ChartData<'line' | 'bar'> => {
    if (!labels.length || !layerSeries.length) {
      return { labels: [], datasets: [] }
    }
    if (splitByYears && layerSeries.length === 1) {
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
      labels,
      datasets: layerSeries.map((entry, index) => {
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
  }, [labels, layerSeries, splitByYears, chartType])

  const pieChartData = useMemo((): ChartData<'pie'> => {
    if (!labels.length || !layerSeries.length) return { labels: [], datasets: [] }
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
  }, [labels, layerSeries])

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
          display: splitByYears || layerSeries.length > 1 || hasRun,
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
    [loading, splitByYears, layerSeries.length, hasRun, chartDateClickHandler],
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

  const observationCount = labels.length

  const layerSummary = selectedLayerIds.join(', ')

  const exportTable = useCallback(() => {
    if (!labels.length || !layerSeries.length) return
    const header = ['date', ...layerSeries.map(s => s.layerId)].join(',')
    const rows = labels.map((date, rowIndex) =>
      [date, ...layerSeries.map(s => s.values[rowIndex] ?? '')].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `imagery-timeseries-${layerSeries.map(s => s.layerId.toLowerCase()).join('-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [labels, layerSeries])

  const exportFigure = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    const url = chart.toBase64Image('image/png', 1)
    const a = document.createElement('a')
    a.href = url
    a.download = `imagery-timeseries-${layerSeries.map(s => s.layerId.toLowerCase()).join('-')}.png`
    a.click()
  }, [layerSeries])

  return (
    <AcpMapPanel title="Imagery Time Series" onClose={onClose} className="acp-map-panel--timeseries">
      <div className="acp-ts">
        <div className="acp-ts__toolbar">
          <label className="acp-ts__field acp-ts__field--grow">
            <span>Field Name</span>
            <select
              value={selectedFieldKey}
              onChange={e => {
                invalidateResults()
                const key = e.target.value
                setSelectedFieldKey(key)
                if (key) acp.bindMapFieldSelection(key)
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
                invalidateResults()
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
                    setError('Start Date must be before End Date.')
                  } else {
                    setError(null)
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
                    setError('End Date must be after Start Date.')
                  } else {
                    setError(null)
                  }
                }}
              />
            </label>
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
            onClick={() => void runAnalysis()}
            disabled={loading || !selectedFieldKey || !selectedLayerIds.length}
          >
            {loading ? 'Running…' : 'Apply'}
          </button>
        </div>

        {hasRun ? (
          <div className="acp-ts__meta">
            <span>
              {layerSummary}
              {chartType === 'scatter' && layerSeries.length >= 2
                ? ` · correlation ${layerSeries[0]?.layerId} → ${layerSeries[1]?.layerId}`
                : ` · ${fromDate} → ${toDate}`}
              {observationCount ? ` · ${observationCount} obs` : ''}
              {analysisDurationMs != null ? ` · ${formatAnalysisSpeed(analysisDurationMs)}` : ''}
            </span>
            <span>{selectedFieldLabel}</span>
          </div>
        ) : null}

        <div className="acp-ts__chart-wrap">
          {loading ? (
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
                Fetching Sentinel history for <strong>{selectedFieldLabel}</strong>
                {selectedLayerIds.length ? ` · ${selectedLayerIds.join(', ')}` : ''}
              </p>
              <div className="acp-ts__skeleton-bar" />
              <div className="acp-ts__skeleton-bar acp-ts__skeleton-bar--short" />
              <div className="acp-ts__skeleton-chart" />
            </div>
          ) : hasRun && labels.length ? (
            chartType === 'bar' ? (
              <Bar ref={chartRef as never} data={chartData as ChartData<'bar'>} options={cartesianChartOptions} />
            ) : chartType === 'pie' ? (
              <Pie ref={chartRef as never} data={pieChartData} options={pieChartOptions} />
            ) : chartType === 'scatter' ? (
              <Scatter ref={chartRef as never} data={scatterChartData} options={scatterChartOptions} />
            ) : (
              <Line ref={chartRef as never} data={chartData as ChartData<'line'>} options={cartesianChartOptions} />
            )
          ) : (
            <div className="acp-ts__placeholder">
              {hasRun && error
                ? error
                : 'Select at least one layer, set dates, then click Apply — the chart updates when dates change after the first run.'}
            </div>
          )}
        </div>

        {hasRun && labels.length && !loading ? (
          <p className="acp-ts__chart-hint">
            <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click any point to set the map
            analysis date · Map date: <strong>{acp.analysisDate}</strong>
          </p>
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

        {error && hasRun && labels.length ? <p className="acp-ts__error">{error}</p> : null}

        <div className="acp-ts__foot">
          <label className="acp-ts__toggle">
            <input
              type="checkbox"
              checked={splitByYears}
              disabled={selectedLayerIds.length > 1 || chartType === 'pie' || chartType === 'scatter'}
              onChange={e => setSplitByYears(e.target.checked)}
            />
            Split by years
            {selectedLayerIds.length > 1 || chartType === 'pie' || chartType === 'scatter' ? (
              <span className="acp-ts__toggle-hint">
                {chartType === 'pie' || chartType === 'scatter'
                  ? ' (cartesian charts only)'
                  : ' (single layer only)'}
              </span>
            ) : null}
          </label>
          <div className="acp-ts__exports">
            <button type="button" onClick={exportFigure} disabled={!labels.length}>
              <i className="fa-solid fa-download" aria-hidden="true" /> Figure
            </button>
            <button type="button" onClick={exportTable} disabled={!labels.length}>
              <i className="fa-solid fa-download" aria-hidden="true" /> Table
            </button>
          </div>
        </div>
      </div>
    </AcpMapPanel>
  )
}
