import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import {
  buildMultiLayerAoiTrendChartSeries,
  type MultiLayerAoiChartStat,
  type MultiLayerAoiTrendResult,
} from '../../../lib/siMultiLayerAoiTrendAnalysis'
import { imageryLayerChartColor } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  exportChartPng,
  exportTimeSeriesCsv,
  exportTimeSeriesExcel,
} from '../lib/timeSeriesReport/timeSeriesReportExports'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export type SiMultiLayerAoiTrendViewProps = {
  results: MultiLayerAoiTrendResult[]
  layerIds: string[]
  sceneDate: string
  loading: boolean
  refreshing: boolean
  hasRun: boolean
  hasChartData: boolean
  error: string | null
  analysisDurationMs: number | null
  onHighlightFieldKey?: (fieldKey: string) => void
}

function formatValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(3)
}

const MULTI_AOI_CHART_STATS: Array<{ id: MultiLayerAoiChartStat; label: string }> = [
  { id: 'max', label: 'Max' },
  { id: 'mean', label: 'Mean' },
  { id: 'min', label: 'Min' },
]

export function SiMultiLayerAoiTrendView({
  results,
  layerIds,
  sceneDate,
  loading,
  refreshing,
  hasRun,
  hasChartData,
  error,
  analysisDurationMs,
  onHighlightFieldKey,
}: SiMultiLayerAoiTrendViewProps) {
  const chartRef = useRef<ChartJS<'line'> | null>(null)
  const [chartStat, setChartStat] = useState<MultiLayerAoiChartStat>('mean')

  const { aoiLabels, layerSeries } = useMemo(
    () => buildMultiLayerAoiTrendChartSeries(results, layerIds, chartStat),
    [results, layerIds, chartStat],
  )

  const chartData = useMemo((): ChartData<'line'> => {
    return {
      labels: aoiLabels,
      datasets: layerSeries.map((series, idx) => ({
        label: series.layerId,
        data: series.values.map(v => (v != null && Number.isFinite(v) ? v : null)),
        borderColor: imageryLayerChartColor(idx),
        backgroundColor: imageryLayerChartColor(idx) + '33',
        pointBackgroundColor: imageryLayerChartColor(idx),
        pointBorderColor: '#0f172a',
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2,
        tension: 0.15,
        spanGaps: false,
      })),
    }
  }, [aoiLabels, layerSeries])

  const chartOptions = useMemo((): ChartOptions<'line'> => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { boxWidth: 10, usePointStyle: true },
          onClick: (_e, item, legend) => {
            const chart = legend.chart
            const idx = item.datasetIndex
            if (idx == null) return
            chart.setDatasetVisibility(idx, !chart.isDatasetVisible(idx))
            chart.update()
          },
        },
        tooltip: {
          callbacks: {
            title: items => {
              const i = items[0]?.dataIndex
              if (i == null) return ''
              return results[i]?.fieldName ?? aoiLabels[i] ?? ''
            },
            afterTitle: items => {
              const i = items[0]?.dataIndex
              const result = i != null ? results[i] : null
              if (!result) return ''
              return `Area: ${result.areaHa.toFixed(2)} ha · Date: ${sceneDate}`
            },
            label: ctx => {
              const layerId = ctx.dataset.label ?? ''
              const i = ctx.dataIndex
              const result = i != null ? results[i] : null
              const stats = result?.indices.find(s => s.layerId === layerId)
              return [
                `${layerId}: mean ${formatValue(stats?.mean)}`,
                `min ${formatValue(stats?.min)} · max ${formatValue(stats?.max)}`,
                `median ${formatValue(stats?.median)} · σ ${formatValue(stats?.stdDev)}`,
              ]
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'AOI Layer', color: '#94a3b8', font: { size: 11 } },
          ticks: { color: '#cbd5e1', maxRotation: 45, minRotation: 0, autoSkip: false },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
        y: {
          title: {
            display: true,
            text: `${chartStat === 'max' ? 'Max' : chartStat === 'min' ? 'Min' : 'Mean'} index value`,
            color: '#94a3b8',
            font: { size: 11 },
          },
          ticks: { color: '#cbd5e1' },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
      },
      onClick: (_event, elements) => {
        const el = elements[0]
        if (!el) return
        const result = results[el.index]
        if (result?.fieldKey) onHighlightFieldKey?.(result.fieldKey)
      },
    }
  }, [aoiLabels, results, sceneDate, onHighlightFieldKey, chartStat])

  const handleExportPng = useCallback(() => {
    exportChartPng(chartRef.current, layerSeries)
  }, [layerSeries])

  const handleExportCsv = useCallback(() => {
    exportTimeSeriesCsv(aoiLabels, layerSeries)
  }, [aoiLabels, layerSeries])

  const handleExportExcel = useCallback(() => {
    exportTimeSeriesExcel(aoiLabels, layerSeries)
  }, [aoiLabels, layerSeries])

  const chartVisible = hasRun && hasChartData && aoiLabels.length > 0
  const resolvedSceneDates = useMemo(
    () => [...new Set(results.map(r => r.sceneDate).filter(Boolean))].sort(),
    [results],
  )
  const sceneDateNote =
    resolvedSceneDates.length && resolvedSceneDates.some(d => d !== sceneDate.trim().slice(0, 10))
      ? ` · nearest scene${resolvedSceneDates.length > 1 ? 's' : ''} ${resolvedSceneDates.join(', ')}`
      : ''

  return (
    <>
      {chartVisible ? (
        <div className="acp-ts__meta">
          <span>
            Multi-Layer AOI Comparison · {layerIds.join(', ')} · target {sceneDate}
            {sceneDateNote}
            {analysisDurationMs != null ? ` · ${analysisDurationMs < 1000 ? `${analysisDurationMs} ms` : `${(analysisDurationMs / 1000).toFixed(1)} s`}` : ''}
          </span>
          <span>{results.length} AOI{results.length === 1 ? '' : 's'}</span>
        </div>
      ) : null}

      {chartVisible ? (
        <div className="acp-ts__field acp-ts__field--aggregate acp-ts__field--multi-aoi-stat">
          <span>Statistic</span>
          <div className="acp-ts__aggregate" role="group" aria-label="Chart zonal statistic">
            {MULTI_AOI_CHART_STATS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`acp-ts__aggregate-btn${chartStat === id ? ' is-on' : ''}`}
                aria-pressed={chartStat === id}
                onClick={() => setChartStat(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="acp-ts__chart-wrap acp-ts__chart-wrap--multi-aoi">
        {chartVisible ? (
          <Line ref={chartRef as never} data={chartData} options={chartOptions} />
        ) : loading && !hasChartData ? (
          <div className="acp-ts__skeleton acp-ts__skeleton--atomic" role="status" aria-live="polite" aria-busy="true">
            <div className="acp-ts__skeleton-spinner" aria-hidden="true">
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <p className="acp-ts__skeleton-status">Loading multi-AOI comparison…</p>
          </div>
        ) : (
          <div className="acp-ts__placeholder">
            {error
              ? error
              : hasRun
                ? 'No observations for the selected date — try another acquisition date.'
                : 'Select AOI layers, indices, and a date — then Apply.'}
          </div>
        )}
      </div>

      {chartVisible ? (
        <p className="acp-ts__chart-hint">
          <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Click a point to highlight the AOI on the map
          · Toggle index lines in the legend
        </p>
      ) : null}

      {chartVisible ? (
        <div className="acp-ts__multi-aoi-stats-wrap">
          <table className="acp-ts__multi-aoi-stats">
            <thead>
              <tr>
                <th>AOI</th>
                <th>Area (ha)</th>
                {layerIds.map(id => (
                  <th key={id} colSpan={5}>
                    {id}
                  </th>
                ))}
              </tr>
              <tr>
                <th />
                <th />
                {layerIds.flatMap(id => [
                  <th key={`${id}-mean`}>Mean</th>,
                  <th key={`${id}-min`}>Min</th>,
                  <th key={`${id}-max`}>Max</th>,
                  <th key={`${id}-med`}>Median</th>,
                  <th key={`${id}-std`}>σ</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {results.map(row => (
                <tr key={row.fieldKey}>
                  <td>{row.fieldName}</td>
                  <td>{row.areaHa.toFixed(2)}</td>
                  {layerIds.flatMap(layerId => {
                    const stats = row.indices.find(
                      i => i.layerId.trim().toUpperCase() === layerId.trim().toUpperCase(),
                    )
                    return [
                      <td key={`${row.fieldKey}-${layerId}-mean`}>{formatValue(stats?.mean)}</td>,
                      <td key={`${row.fieldKey}-${layerId}-min`}>{formatValue(stats?.min)}</td>,
                      <td key={`${row.fieldKey}-${layerId}-max`}>{formatValue(stats?.max)}</td>,
                      <td key={`${row.fieldKey}-${layerId}-med`}>{formatValue(stats?.median)}</td>,
                      <td key={`${row.fieldKey}-${layerId}-std`}>{formatValue(stats?.stdDev)}</td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error && hasRun && chartVisible ? (
        <p className="acp-ts__chart-hint acp-ts__chart-hint--warn">{error}</p>
      ) : null}

      {error && hasRun && !chartVisible ? <p className="acp-ts__error">{error}</p> : null}

      <div className="acp-ts__foot acp-ts__foot--multi-aoi">
        <div className="acp-ts__exports">
          <button type="button" className="acp-ts__exports-interpret" onClick={handleExportPng} disabled={!chartVisible || refreshing}>
            <i className="fa-solid fa-image" aria-hidden /> PNG
          </button>
          <button type="button" className="acp-ts__exports-interpret" onClick={handleExportCsv} disabled={!chartVisible || refreshing}>
            <i className="fa-solid fa-table" aria-hidden /> CSV
          </button>
          <button type="button" className="acp-ts__exports-interpret" onClick={handleExportExcel} disabled={!chartVisible || refreshing}>
            <i className="fa-solid fa-file-excel" aria-hidden /> Excel
          </button>
        </div>
      </div>
    </>
  )
}
