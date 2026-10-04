import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartData,
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import type { DevelopEliteChartsConfig } from './developEliteChartsConfig'
import { prepareDevelopEliteChartSlices } from './developEliteChartSlices'
import { createDevelopEliteBarValuePlugin, createDevelopElitePieCalloutPlugin } from './developEliteChartPlugins'
import type { DevelopEliteChartSlice } from './useDevelopEliteDashboardData'
import { DevelopEliteResizeHandle, DevelopEliteResizeHost } from './DevelopEliteResizeHandle'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

type ChartPart = 'all' | 'pie' | 'bar' | 'table'

type Props = {
  slices: DevelopEliteChartSlice[]
  tableRows: Record<string, string>[]
  tableColumns: string[]
  charts: DevelopEliteChartsConfig
  part?: ChartPart
  onResizePieBar?: (deltaX: number) => void
  onResizeBarTable?: (deltaX: number) => void
  onResizeChartsHeight?: (deltaY: number) => void
  onResizeEnd?: () => void
  tableHighlightRowId?: string | null
  selectedFieldKey?: string | null
  onTableRowClick?: (rowId: string) => void
  onTableRowDoubleClick?: (fieldKey: string | null) => void
}

function DevelopEliteChartsInner({
  slices,
  tableRows,
  tableColumns,
  charts,
  part = 'all',
  onResizePieBar,
  onResizeBarTable,
  onResizeChartsHeight,
  onResizeEnd,
  tableHighlightRowId,
  selectedFieldKey,
  onTableRowClick,
  onTableRowDoubleClick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => {
      requestAnimationFrame(() => {
        const root = rootRef.current
        if (!root) return
        root.querySelectorAll('canvas').forEach(canvas => {
          const chart = ChartJS.getChart(canvas)
          chart?.resize()
        })
      })
    }
    window.addEventListener('develop-elite-layout-changed', refresh)
    return () => window.removeEventListener('develop-elite-layout-changed', refresh)
  }, [])

  const pieSlices = useMemo(() => prepareDevelopEliteChartSlices(slices, charts, 'pie'), [charts, slices])
  const barSlices = useMemo(() => prepareDevelopEliteChartSlices(slices, charts, 'bar'), [charts, slices])

  const tableStyle = useMemo(
    (): CSSProperties =>
      ({
        ['--de-chart-table-fs' as string]: `${charts.tableFontPx}px`,
        ['--de-chart-table-header-bg' as string]: charts.tableHeaderBg,
        ['--de-chart-table-font' as string]: charts.fontFamily,
        ['--de-chart-label-color' as string]: charts.labelColor,
      }) as CSSProperties,
    [charts],
  )

  const pieData = useMemo((): ChartData<'pie'> => {
    return {
      labels: pieSlices.map(s => s.label),
      datasets: [
        {
          data: pieSlices.map(s => s.value),
          backgroundColor: pieSlices.map(s => s.color),
          borderWidth: 1,
          borderColor: 'rgba(10, 26, 16, 0.85)',
          spacing: 2,
          hoverBorderColor: charts.axisColor,
          hoverBorderWidth: 1,
        },
      ],
    }
  }, [pieSlices])

  const barData = useMemo((): ChartData<'bar'> => {
    return {
      labels: barSlices.map(s => s.label),
      datasets: [
        {
          data: barSlices.map(s => s.value),
          backgroundColor: barSlices.map(s => s.color),
          borderWidth: 0,
          borderRadius: 3,
          borderSkipped: false,
        },
      ],
    }
  }, [barSlices])

  const pieTotal = useMemo(
    () => pieSlices.reduce((sum, s) => sum + (Number(s.value) || 0), 0),
    [pieSlices],
  )

  const barSuggestedMax = useMemo(() => {
    const max = barSlices.reduce((m, s) => Math.max(m, Number(s.value) || 0), 0)
    return max > 0 ? max * 1.06 : undefined
  }, [barSlices])

  const pieCalloutPlugin = useMemo(() => createDevelopElitePieCalloutPlugin(charts), [charts])
  const barValuePlugin = useMemo(() => createDevelopEliteBarValuePlugin(charts), [charts])

  const pieOptions = useMemo(
    () => ({
      animation: false as const,
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 16, right: 16, top: 64, bottom: 64 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyColor: charts.tickColor,
          titleColor: charts.axisColor,
          bodyFont: { family: charts.fontFamily, size: charts.axisFontPx },
          titleFont: { family: charts.fontFamily, size: charts.axisFontPx },
          callbacks: {
            label(context) {
              const raw = context.parsed
              const value = typeof raw === 'number' ? raw : 0
              const dataPoints = context.dataset.data as number[]
              const total = dataPoints.reduce((a, b) => a + (Number(b) || 0), 0)
              const pct = total > 0 ? ((value / total) * 100).toFixed(2) : '0'
              return `${context.label ?? ''}: ${value} (${pct}%)`
            },
          },
        },
      },
    }),
    [charts],
  )

  const barOptions = useMemo(
    () => ({
      animation: false as const,
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      datasets: {
        bar: {
          barThickness: 'flex' as const,
          maxBarThickness: 22,
          categoryPercentage: 0.82,
          barPercentage: 0.9,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: barSuggestedMax,
          border: { display: false },
          ticks: {
            color: charts.axisColor,
            font: { size: charts.axisFontPx, family: charts.fontFamily },
            maxTicksLimit: 5,
            callback(value: string | number) {
              const n = Number(value)
              if (!Number.isFinite(n)) return String(value)
              if (n >= 1_000_000) {
                const m = n / 1_000_000
                return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
              }
              if (n >= 1000) {
                const k = n / 1000
                return k % 1 === 0 ? `${k}k` : `${k.toFixed(0)}k`
              }
              return n
            },
          },
          grid: { color: charts.gridColor, drawTicks: false },
        },
        y: {
          border: { display: false },
          ticks: {
            color: charts.tickColor,
            font: { size: charts.axisFontPx, family: charts.fontFamily },
            padding: 4,
          },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyColor: charts.tickColor,
          titleColor: charts.axisColor,
          bodyFont: { family: charts.fontFamily, size: charts.axisFontPx },
          titleFont: { family: charts.fontFamily, size: charts.axisFontPx },
        },
      },
    }),
    [barSuggestedMax, charts],
  )

  const rootClass =
    part === 'all' ? 'develop-elite-charts' : 'develop-elite-charts develop-elite-charts--single'

  const pieBlock =
    part === 'all' || part === 'pie' ? (
      <DevelopEliteResizeHost className="develop-elite-charts__pie develop-elite-resize-host">
        {pieSlices.length === 0 || pieTotal <= 0 ? (
          <p className="develop-elite-charts__empty develop-elite-charts__empty--chart">No chart data in scope</p>
        ) : (
          <Pie data={pieData} options={pieOptions} plugins={[pieCalloutPlugin]} />
        )}
        {part === 'all' && onResizePieBar ? (
          <>
            <DevelopEliteResizeHandle
              edge="left"
              label="Resize pie chart (left)"
              onDrag={dx => onResizePieBar(-dx)}
              onDragEnd={onResizeEnd}
            />
            <DevelopEliteResizeHandle
              edge="right"
              label="Resize pie chart (right)"
              onDrag={dx => onResizePieBar(dx)}
              onDragEnd={onResizeEnd}
            />
          </>
        ) : null}
        {part === 'all' && onResizeChartsHeight ? (
          <>
            <DevelopEliteResizeHandle
              edge="top"
              label="Resize chart height (top)"
              onDrag={(_, dy) => onResizeChartsHeight(-dy)}
              onDragEnd={onResizeEnd}
            />
            <DevelopEliteResizeHandle
              edge="bottom"
              label="Resize chart height (bottom)"
              onDrag={(_, dy) => onResizeChartsHeight(dy)}
              onDragEnd={onResizeEnd}
            />
          </>
        ) : null}
      </DevelopEliteResizeHost>
    ) : null

  const barBlock =
    part === 'all' || part === 'bar' ? (
      <DevelopEliteResizeHost className="develop-elite-charts__bar develop-elite-resize-host">
        <Bar data={barData} options={barOptions} plugins={[barValuePlugin]} />
        {part === 'all' && onResizeBarTable ? (
          <>
            <DevelopEliteResizeHandle
              edge="left"
              label="Resize bar chart (left)"
              onDrag={dx => onResizeBarTable(-dx)}
              onDragEnd={onResizeEnd}
            />
            <DevelopEliteResizeHandle
              edge="right"
              label="Resize bar chart (right)"
              onDrag={dx => onResizeBarTable(dx)}
              onDragEnd={onResizeEnd}
            />
          </>
        ) : null}
      </DevelopEliteResizeHost>
    ) : null

  const tableBlock =
    part === 'all' || part === 'table' ? (
      <div className="develop-elite-charts__table-wrap" style={tableStyle}>
        <table className="develop-elite-charts__table">
          <thead>
            <tr>
              {tableColumns.map(col => (
                <th key={col}>{col === 'OBJECTID' ? 'ID' : col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} className="develop-elite-charts__empty">
                  No crop records in scope
                </td>
              </tr>
            ) : (
              tableRows.map(row => {
                const mapLinked = Boolean(selectedFieldKey && row._fieldKey === selectedFieldKey)
                const rowFocused = tableHighlightRowId === row._rowId
                const rowClass = [
                  rowFocused ? 'is-table-row-focus' : '',
                  mapLinked ? 'is-table-row-map-selected' : '',
                  row._fieldKey ? 'is-table-row-clickable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                <tr
                  key={row._rowId}
                  className={rowClass || undefined}
                  onClick={() => onTableRowClick?.(row._rowId)}
                  onDoubleClick={() => onTableRowDoubleClick?.(row._fieldKey || null)}
                >
                  {tableColumns.map(col => {
                    const text = row[col] ?? ''
                    return (
                      <td
                        key={col}
                        className={col === 'Crop_Type' ? 'develop-elite-charts__table-crop' : undefined}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    ) : null

  return (
    <div ref={rootRef} className={rootClass} style={tableStyle}>
      {pieBlock}
      {barBlock}
      {tableBlock}
    </div>
  )
}

export const DevelopEliteCharts = memo(DevelopEliteChartsInner)
