import { useCallback, useMemo, useRef } from 'react'
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
import { formatImageryTimeSeriesYTick, imageryLayerChartColor } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { MultiAoiTimelineResult } from '../../../lib/siMultiAoiTimeline'
import { multiAoiTimelineToLayerSeries } from '../../../lib/siMultiAoiTimeline'
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

function aggregationLabel(agg: MultiAoiTimelineResult['timeAggregation']): string {
  if (agg === 'week') return 'Weekly'
  if (agg === 'month') return 'Monthly'
  if (agg === 'year') return 'Yearly'
  return 'Daily'
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

  const exportSeries = useMemo(
    () => (timeline ? multiAoiTimelineToLayerSeries(timeline) : []),
    [timeline],
  )

  const chartData = useMemo((): ChartData<'line'> => {
    if (!timeline?.series.length) return { labels: [], datasets: [] }
    return {
      labels: timeline.displayLabels,
      datasets: timeline.series.map((s, idx) => ({
        label: s.label,
        data: s.values.map(v => (v != null && Number.isFinite(v) ? v : null)),
        borderColor: imageryLayerChartColor(idx),
        backgroundColor: imageryLayerChartColor(idx) + '33',
        pointBackgroundColor: imageryLayerChartColor(idx),
        pointBorderColor: '#0f172a',
        pointRadius: timeline.labels.length > 36 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0,
        spanGaps: false,
      })),
    }
  }, [timeline])

  const chartOptions = useMemo((): ChartOptions<'line'> => {
    const title =
      timeline == null
        ? 'AOI timeline'
        : timeline.plotCount === 1
          ? `${timeline.layerIds.join(', ')} · ${timeline.fromDate} → ${timeline.toDate}`
          : `${timeline.plotCount} plots · ${timeline.layerIds.join(', ')} · ${timeline.fromDate} → ${timeline.toDate}`
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: {
          display: true,
          text: title,
          color: '#e2e8f0',
          font: { size: 12, weight: 'bold' },
          padding: { bottom: 6 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 10, usePointStyle: true, color: '#cbd5e1', font: { size: 10 } },
          onClick: (_e, item, legend) => {
            const chart = legend.chart
            const idx = item.datasetIndex
            if (idx == null) return
            chart.setDatasetVisibility(idx, !chart.isDatasetVisible(idx))
            chart.update()
            const series = timeline?.series[idx]
            if (series?.fieldKey) onHighlightFieldKey?.(series.fieldKey)
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
              const v = item.parsed.y
              const name = item.dataset.label ?? ''
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
              timeline?.timeAggregation === 'week'
                ? 'Week'
                : timeline?.timeAggregation === 'month'
                  ? 'Month'
                  : timeline?.timeAggregation === 'year'
                    ? 'Year'
                    : 'Date',
            color: '#94a3b8',
            font: { size: 11 },
          },
          ticks: {
            color: '#cbd5e1',
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 14,
            font: { size: 9 },
          },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
        y: {
          title: {
            display: true,
            text: 'Index value',
            color: '#94a3b8',
            font: { size: 11 },
          },
          ticks: {
            color: '#cbd5e1',
            callback: (value: string | number) => formatImageryTimeSeriesYTick(value),
          },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
      },
    }
  }, [timeline, onHighlightFieldKey])

  const handleExportPng = useCallback(() => {
    exportChartPng(chartRef.current, exportSeries)
  }, [exportSeries])

  const handleExportCsv = useCallback(() => {
    if (!timeline) return
    exportTimeSeriesCsv(timeline.displayLabels, exportSeries)
  }, [timeline, exportSeries])

  const handleExportExcel = useCallback(() => {
    if (!timeline) return
    exportTimeSeriesExcel(timeline.displayLabels, exportSeries)
  }, [timeline, exportSeries])

  if (!hasRun && !loading) {
    return (
      <div className="acp-ts__empty">
        <p>
          Select plot AOIs from a layer, choose index layers (NDVI, NDMI, …), set <strong>Start Date</strong> →{' '}
          <strong>Acquisition Date</strong>, then <strong>Apply</strong> for a timeline like Single Layer Trend.
        </p>
      </div>
    )
  }

  if (loading && !hasChartData) {
    return (
      <div className="acp-ts__empty">
        <p>
          <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Building AOI timeline
          {progress ? ` (${progress.done}/${progress.total})` : ''}…
        </p>
      </div>
    )
  }

  const chartVisible = hasRun && hasChartData && !!timeline?.labels.length

  return (
    <>
      {chartVisible && timeline ? (
        <div className="acp-ts__meta">
          <span>
            {timeline.layerIds.join(', ')} · {timeline.fromDate} → {timeline.toDate} ·{' '}
            {timeline.labels.length} pts · {aggregationLabel(timeline.timeAggregation)}
            {analysisDurationMs != null
              ? ` · ${analysisDurationMs < 1000 ? `${analysisDurationMs} ms` : `${(analysisDurationMs / 1000).toFixed(1)} s`}`
              : ''}
            {refreshing ? ' · updating…' : ''}
          </span>
          <span>
            {timeline.plotCount} plot{timeline.plotCount === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="acp-ts__error" role="status">
          {error}
        </div>
      ) : null}

      {chartVisible ? (
        <div className="acp-ts__chart-wrap acp-ts__chart-wrap--multi-aoi">
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>
      ) : hasRun ? (
        <div className="acp-ts__empty">
          <p>No timeline data for the selected plots and date range.</p>
        </div>
      ) : null}

      {chartVisible ? (
        <div className="acp-ts__foot acp-ts__foot--multi-aoi">
          <button type="button" className="acp-ts__exports-interpret" disabled={refreshing} onClick={handleExportCsv}>
            CSV
          </button>
          <button type="button" className="acp-ts__exports-interpret" disabled={refreshing} onClick={handleExportExcel}>
            Excel
          </button>
          <button type="button" className="acp-ts__exports-interpret" disabled={refreshing} onClick={handleExportPng}>
            PNG
          </button>
        </div>
      ) : null}
    </>
  )
}
