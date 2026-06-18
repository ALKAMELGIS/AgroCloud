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
import { fetchCropAlertSentinelHistoryExtension } from '../../../../lib/siCropAlertSentinelLive'
import { acpDefaultLayerIdsFromChartSeries } from '../acpSettingsBundle'
import { useAcpPlatform } from '../acpPlatformContext'
import {
  aggregateImageryTimeSeries,
  aggregateImageryTimeSeriesMulti,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  buildImageryTimeSeriesLayerGroups,
  defaultImageryDateRange,
  flattenImageryTimeSeriesLayerOptions,
  imageryLayerChartColor,
  splitSeriesByYear,
  yearSplitChartColors,
  type ImageryChartType,
  type ImageryTimeSeriesLayerSeries,
} from '../acpImageryTimeSeries'
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
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() => {
    const fromSeries = acpDefaultLayerIdsFromChartSeries(acp.config.chartSeries)
    const first = fromSeries.find(id => id === acp.selectedWmsLayer) ?? fromSeries[0] ?? acp.selectedWmsLayer
    return first ? [first] : [acp.selectedWmsLayer]
  })
  const [chartType, setChartType] = useState<ImageryChartType>('line')
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [splitByYears, setSplitByYears] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [layerSeries, setLayerSeries] = useState<ImageryTimeSeriesLayerSeries[]>([])
  const [hasRun, setHasRun] = useState(false)

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
    setSelectedLayerIds(prev => {
      const valid = prev.filter(id => layerOptions.some(o => o.id === id))
      if (valid.length) return valid
      if (layerOptions.some(o => o.id === acp.selectedWmsLayer)) return [acp.selectedWmsLayer]
      return layerOptions[0]?.id ? [layerOptions[0].id] : ['NDVI']
    })
  }, [acp.selectedWmsLayer, layerOptions])

  useEffect(() => {
    if (selectedLayerIds.length > 1 && splitByYears) setSplitByYears(false)
  }, [selectedLayerIds.length, splitByYears])

  useEffect(() => {
    if ((chartType === 'pie' || chartType === 'scatter') && splitByYears) setSplitByYears(false)
  }, [chartType, splitByYears])

  const selectedFieldLabel =
    fieldOptions.find(o => o.fieldKey === selectedFieldKey)?.displayName ?? '—'

  const runAnalysis = useCallback(async () => {
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

    const layerIds = selectedLayerIds.length ? selectedLayerIds : ['NDVI']

    setLoading(true)
    setError(null)
    setHasRun(true)
    try {
      const historyMap = await fetchCropAlertSentinelHistoryExtension([field], {
        fromIso: fromDate,
        toIso: toDate,
        concurrency: 4,
      })
      if (layerIds.length === 1) {
        const single = aggregateImageryTimeSeries(historyMap, [field.fieldKey], layerIds[0]!)
        setLabels(single.labels)
        setLayerSeries([{ layerId: layerIds[0]!, values: single.values }])
        if (!single.labels.length) setError('No observations in this date range.')
      } else {
        const multi = aggregateImageryTimeSeriesMulti(historyMap, [field.fieldKey], layerIds)
        setLabels(multi.labels)
        setLayerSeries(multi.series)
        if (!multi.labels.length) setError('No observations in this date range.')
      }
      const primary = layerIds[0]!
      if (primary !== acp.selectedWmsLayer) acp.setSelectedWmsLayer(primary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setLabels([])
      setLayerSeries([])
    } finally {
      setLoading(false)
    }
  }, [acp.aoiMask, acp.selectedWmsLayer, selectedFieldKey, fromDate, toDate, selectedLayerIds, acp])

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

  const scatterChartData = useMemo((): ChartData<'scatter'> => {
    if (!labels.length || !layerSeries.length) return { labels: [], datasets: [] }
    return {
      datasets: layerSeries.map((entry, index) => {
        const color = imageryLayerChartColor(index)
        return {
          label: entry.layerId,
          data: buildImageryScatterPoints(labels, entry.values),
          borderColor: color,
          backgroundColor: `${color}cc`,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      }),
    }
  }, [labels, layerSeries])

  const cartesianChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: loading ? 0 : 280 },
      plugins: {
        legend: {
          display: splitByYears || layerSeries.length > 1 || hasRun,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
        },
        tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
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
    [loading, splitByYears, layerSeries.length, hasRun],
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
      plugins: {
        legend: {
          display: layerSeries.length > 1 || hasRun,
          labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } },
        },
        tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
      },
      scales: {
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
    [loading, layerSeries.length, hasRun],
  )

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
              onChange={e => setSelectedFieldKey(e.target.value)}
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
              onSelectedIdsChange={setSelectedLayerIds}
            />
          </div>
          <div className="acp-ts__date-range">
            <label className="acp-ts__field acp-ts__field--date">
              <span>From</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="acp-ts__field acp-ts__field--date">
              <span>To</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
          </div>
          <label className="acp-ts__field">
            <span>Chart</span>
            <select value={chartType} onChange={e => setChartType(e.target.value as ImageryChartType)}>
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
            disabled={loading || !selectedFieldKey}
          >
            {loading ? 'Running…' : 'Apply'}
          </button>
        </div>

        <div className="acp-ts__meta">
          <span>
            {layerSummary} · {fromDate} → {toDate}
          </span>
          <span>{selectedFieldLabel}</span>
        </div>

        <div className="acp-ts__chart-wrap">
          {loading ? (
            <div className="acp-ts__skeleton" aria-hidden="true">
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
              {error ?? 'Select a field and click Apply to generate analysis.'}
            </div>
          )}
        </div>

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
