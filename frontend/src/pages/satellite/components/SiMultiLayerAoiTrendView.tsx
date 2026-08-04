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
import {
  multiAoiTimelineToLayerSeries,
  type MultiAoiTimelineResult,
} from '../../../lib/siMultiAoiTimeline'
import {
  exportChartPng,
  exportTimeSeriesCsv,
  exportTimeSeriesExcel,
} from '../lib/timeSeriesReport/timeSeriesReportExports'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export type SiMultiLayerAoiTrendViewProps = {
  timeline: MultiAoiTimelineResult | null
  loading: boolean
  refreshing: boolean
  hasRun: boolean
  hasChartData: boolean
  error: string | null
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
  return `${from} → ${to}`
}

export function SiMultiLayerAoiTrendView({
  timeline,
  loading,
  refreshing,
  hasRun,
  hasChartData,
  error,
  analysisDurationMs,
  progress,
  onHighlightFieldKey,
}: SiMultiLayerAoiTrendViewProps) {
  const chartRef = useRef<ChartJS<'line'> | null>(null)

  const plottedSeries = useMemo(
    () => (Array.isArray(timeline?.series) ? timeline.series.filter(s => s.values.some(v => v != null)) : []),
    [timeline],
  )

  const chartData = useMemo((): ChartData<'line'> => {
    if (!timeline?.series.length || !plottedSeries.length) return { labels: [], datasets: [] }
    const manyPeriods = timeline.labels.length > 40
    const isDay = timeline.timeAggregation === 'day'
    return {
      labels: timeline.displayLabels,
      datasets: plottedSeries.map((s, idx) => ({
        label: s.label,
        data: s.values.map(v => (v != null && Number.isFinite(v) ? v : null)),
        borderColor: imageryLayerChartColor(idx),
        backgroundColor: imageryLayerChartColor(idx) + '22',
        pointBackgroundColor: imageryLayerChartColor(idx),
        pointBorderColor: '#0f172a',
        pointRadius: manyPeriods ? (isDay ? 1.5 : 0) : isDay ? 2.5 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0,
        spanGaps: false,
      })),
    }
  }, [timeline, plottedSeries])

  const chartOptions = useMemo((): ChartOptions<'line'> => {
    const layers = Array.isArray(timeline?.layerIds) ? timeline.layerIds.join(', ') : 'Index'
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: {
          display: true,
          text: timeline
            ? `${aggregationTitle(timeline.timeAggregation)} Multi-Layer AOI (${rangeLabel(timeline.fromDate, timeline.toDate)})`
            : 'Multi-Layer AOI Comparison',
          color: '#0f172a',
          font: { size: 13, weight: 'bold' },
          padding: { bottom: 8 },
        },
        legend: {
          display: true,
          position: plottedSeries.length > 8 ? 'right' : 'top',
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
            const series = plottedSeries[idx]
            if (series) onHighlightFieldKey?.(series.fieldKey)
          },
        },
        tooltip: {
          callbacks: {
            title: items => {
              const i = items[0]?.dataIndex
              if (i == null || !timeline) return ''
              return timeline.labels[i] ?? timeline.displayLabels[i] ?? ''
            },
            label: item => {
              const series = plottedSeries[item.datasetIndex ?? -1]
              const v = item.parsed.y
              const name = series?.label ?? item.dataset.label ?? ''
              if (v == null || !Number.isFinite(v)) return `${name}: —`
              const area =
                series?.areaHa != null && Number.isFinite(series.areaHa)
                  ? ` · ${series.areaHa.toFixed(2)} ha`
                  : ''
              return `${name}: ${Number(v).toFixed(3)}${area}`
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
              timeline?.timeAggregation === 'week'
                ? 'Week'
                : timeline?.timeAggregation === 'month'
                  ? 'Month'
                  : timeline?.timeAggregation === 'year'
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
            text: layers,
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
      onClick: (_event, elements) => {
        const el = elements[0]
        if (!el) return
        const series = plottedSeries[el.datasetIndex]
        if (series?.fieldKey) onHighlightFieldKey?.(series.fieldKey)
      },
    }
  }, [timeline, plottedSeries, onHighlightFieldKey])

  const exportSeries = useMemo(
    () => (timeline ? multiAoiTimelineToLayerSeries(timeline) : []),
    [timeline],
  )

  if (!hasRun && !loading) {
    return (
      <div className="acp-ts__empty">
        <p>
          Select AOI plots, one or more index layers, Start/End dates, and aggregation — then{' '}
          <strong>Apply</strong> for a multi-layer AOI comparison over time.
        </p>
      </div>
    )
  }

  if (loading && !hasChartData) {
    return (
      <div className="acp-ts__empty">
        <p>
          <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Loading multi-AOI comparison
          {progress ? ` (${progress.done}/${progress.total})` : ''}…
        </p>
      </div>
    )
  }

  return (
    <div className="acp-ts__multi-plot">
      <div className="acp-ts__meta">
        <span>
          Multi-Layer AOI Comparison
          {timeline ? ` · ${(timeline.layerIds ?? []).join(', ')}` : ''}
          {timeline ? ` · ${timeline.fromDate} → ${timeline.toDate}` : ''}
          {timeline ? ` · ${aggregationTitle(timeline.timeAggregation)}` : ''}
          {timeline ? ` · ${timeline.plotCount} AOI${timeline.plotCount === 1 ? '' : 's'}` : ''}
          {timeline?.labels.length ? ` · ${timeline.labels.length} periods` : ''}
          {analysisDurationMs != null
            ? ` · ${analysisDurationMs < 1000 ? `${analysisDurationMs} ms` : `${(analysisDurationMs / 1000).toFixed(1)} s`}`
            : ''}
          {refreshing ? ' · updating…' : ''}
        </span>
        {hasChartData ? (
          <span className="acp-ts__multi-plot-exports">
            <button
              type="button"
              className="acp-ts__exports-interpret"
              disabled={refreshing}
              onClick={() => exportTimeSeriesCsv(timeline!.displayLabels, exportSeries)}
            >
              CSV
            </button>
            <button
              type="button"
              className="acp-ts__exports-interpret"
              disabled={refreshing}
              onClick={() => exportTimeSeriesExcel(timeline!.displayLabels, exportSeries)}
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
      {hasChartData ? (
        <>
          <div className="acp-ts__chart-wrap acp-ts__chart-wrap--tall acp-ts__chart-wrap--multi-aoi">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>
          <p className="acp-ts__chart-hint">
            <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click a series or legend item to
            highlight the AOI on the map
          </p>
        </>
      ) : hasRun ? (
        <div className="acp-ts__placeholder">
          {error
            ? error
            : 'No observations for the selected range — try a wider Start → End window.'}
        </div>
      ) : null}
    </div>
  )
}
