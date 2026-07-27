import { useMemo, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import {
  formatImageryTimeSeriesYTick,
  imageryLayerChartColor,
  type ImageryTimeAggregation,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { PlotLayerTimeSeriesResult } from '../../../lib/siPlotLayerTimeSeries'
import {
  exportChartPng,
  exportTimeSeriesCsv,
  exportTimeSeriesExcel,
} from '../lib/timeSeriesReport/timeSeriesReportExports'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export type SiPlotLayerTimeSeriesViewProps = {
  result: PlotLayerTimeSeriesResult | null
  loading: boolean
  refreshing: boolean
  hasRun: boolean
  hasChartData: boolean
  error: string | null
  warning?: string | null
  analysisDurationMs: number | null
  progress?: { done: number; total: number } | null
  onHighlightFieldKey?: (fieldKey: string) => void
}

function aggregationTitle(agg: ImageryTimeAggregation): string {
  if (agg === 'week') return 'Weekly'
  if (agg === 'month') return 'Monthly'
  if (agg === 'year') return 'Yearly'
  return 'Daily'
}

function rangeLabel(from: string, to: string): string {
  const a = from.slice(0, 7)
  const b = to.slice(0, 7)
  if (a.slice(0, 4) === b.slice(0, 4) && from.slice(5, 7) === '01' && to.slice(5, 7) >= '09') {
    return `Jan–${monthShort(to)} ${from.slice(0, 4)}`
  }
  return `${from} → ${to}`
}

function monthShort(iso: string): string {
  const m = Number(iso.slice(5, 7))
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? iso
}

export function SiPlotLayerTimeSeriesView({
  result,
  loading,
  refreshing,
  hasRun,
  hasChartData,
  error,
  warning = null,
  analysisDurationMs,
  progress,
  onHighlightFieldKey,
}: SiPlotLayerTimeSeriesViewProps) {
  const chartRef = useRef<ChartJS<'line'> | null>(null)

  const chartData = useMemo((): ChartData<'line'> => {
    if (!result?.series.length) return { labels: [], datasets: [] }
    const plotted = result.series.filter(s => s.observationCount > 0)
    const manyPeriods = result.labels.length > 40
    const isDay = result.timeAggregation === 'day'
    return {
      labels: result.displayLabels,
      datasets: plotted.map((s, idx) => ({
        label: s.plotName || s.plotId,
        // Keep nulls as gaps — never invent intermediate values across missing scenes.
        data: s.values.map(v => (v != null && Number.isFinite(v) ? v : null)),
        borderColor: imageryLayerChartColor(idx),
        backgroundColor: imageryLayerChartColor(idx) + '22',
        pointBackgroundColor: imageryLayerChartColor(idx),
        pointBorderColor: '#0f172a',
        pointRadius: manyPeriods ? (isDay ? 1.5 : 0) : isDay ? 2.5 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        // Low tension avoids curved “fake” peaks between real observations.
        tension: 0,
        spanGaps: false,
      })),
    }
  }, [result])

  const chartOptions = useMemo((): ChartOptions<'line'> => {
    const layer = result?.layerId ?? 'Index'
    return {
      responsive: true,
      maintainAspectRatio: false,
      // Same x index for every plot — tooltip lists all fields on that period.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: {
          display: true,
          text: result
            ? `${aggregationTitle(result.timeAggregation)} Mean ${layer} per Plot (${rangeLabel(result.fromDate, result.toDate)})`
            : `${layer} by Plot`,
          color: '#0f172a',
          font: { size: 13, weight: 'bold' },
          padding: { bottom: 8 },
        },
        legend: {
          display: true,
          position: 'right',
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            font: { size: 10 },
          },
          onClick: (_e, item, legend) => {
            const chart = legend.chart
            const idx = item.datasetIndex
            if (idx == null) return
            chart.setDatasetVisibility(idx, !chart.isDatasetVisible(idx))
            chart.update()
            const plotted = result?.series.filter(s => s.observationCount > 0) ?? []
            const series = plotted[idx]
            if (series) onHighlightFieldKey?.(series.fieldKey)
          },
        },
        tooltip: {
          callbacks: {
            title: items => {
              const i = items[0]?.dataIndex
              if (i == null || !result) return ''
              return result.labels[i] ?? result.displayLabels[i] ?? ''
            },
            label: item => {
              const plotted = result?.series.filter(s => s.observationCount > 0) ?? []
              const series = plotted[item.datasetIndex ?? -1]
              const v = item.parsed.y
              const name = series?.plotName ?? item.dataset.label ?? ''
              if (v == null || !Number.isFinite(v)) return `${name}: —`
              return `${name}: ${Number(v).toFixed(3)}`
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          title: {
            display: true,
            text:
              result?.timeAggregation === 'week'
                ? 'Week'
                : result?.timeAggregation === 'month'
                  ? 'Month'
                  : result?.timeAggregation === 'year'
                    ? 'Year'
                    : 'Date',
            color: '#64748b',
            font: { size: 10 },
          },
          ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 16, font: { size: 9 } },
          grid: { color: 'rgba(148,163,184,0.2)' },
        },
        y: {
          title: {
            display: true,
            text: result?.layerId ?? 'Value',
            color: '#64748b',
            font: { size: 11 },
          },
          ticks: {
            font: { size: 9 },
            callback: (value: string | number) => formatImageryTimeSeriesYTick(value),
          },
          grid: { color: 'rgba(148,163,184,0.25)' },
        },
      },
    }
  }, [result, onHighlightFieldKey])

  const exportSeries = useMemo(() => {
    if (!result) return []
    return result.series.map(s => ({
      layerId: s.plotName || s.plotId,
      values: s.values,
    }))
  }, [result])

  if (!hasRun && !loading) {
    return (
      <div className="acp-ts__empty">
        <p>
          Select AOI plots, one index layer, Start/End dates, and aggregation — then <strong>Apply</strong> for a
          multi-plot time series (e.g. weekly NDMI per pivot).
        </p>
      </div>
    )
  }

  if (loading && !hasChartData) {
    return (
      <div className="acp-ts__empty">
        <p>
          <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Fetching plot time series
          {progress ? ` (${progress.done}/${progress.total})` : ''}…
        </p>
      </div>
    )
  }

  return (
    <div className="acp-ts__multi-plot">
      <div className="acp-ts__meta">
        <span>
          {result?.layerId ?? '—'}
          {result ? ` · ${result.fromDate} → ${result.toDate}` : ''}
          {result ? ` · ${aggregationTitle(result.timeAggregation)}` : ''}
          {result ? ` · ${result.series.length} plots` : ''}
          {result?.labels.length ? ` · ${result.labels.length} periods` : ''}
          {analysisDurationMs != null ? ` · ${(analysisDurationMs / 1000).toFixed(1)} s` : ''}
          {refreshing ? ' · updating…' : ''}
        </span>
        {hasChartData ? (
          <span className="acp-ts__multi-plot-exports">
            <button
              type="button"
              className="acp-ts__exports-interpret"
              disabled={refreshing}
              onClick={() => exportTimeSeriesCsv(result!.displayLabels, exportSeries)}
            >
              CSV
            </button>
            <button
              type="button"
              className="acp-ts__exports-interpret"
              disabled={refreshing}
              onClick={() => exportTimeSeriesExcel(result!.displayLabels, exportSeries)}
            >
              Excel
            </button>
            <button
              type="button"
              className="acp-ts__exports-interpret"
              disabled={refreshing}
              onClick={() => exportChartPng(chartRef.current, exportSeries)}
            >
              PNG
            </button>
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="acp-ts__error" role="alert">
          {error}
        </div>
      ) : null}
      {warning && !error ? (
        <div className="acp-ts__warn" role="status">
          {warning}
        </div>
      ) : null}
      {hasChartData ? (
        <div className="acp-ts__chart-wrap acp-ts__chart-wrap--tall">
          <Line
            ref={chartRef}
            data={chartData}
            options={chartOptions}
          />
        </div>
      ) : hasRun ? (
        <div className="acp-ts__empty">
          <p>No chart data for the selected plots and date range.</p>
        </div>
      ) : null}
    </div>
  )
}
