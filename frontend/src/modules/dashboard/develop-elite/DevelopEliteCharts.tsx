import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

function developEliteChartTableColumnWidthPx(col: string): number {
  switch (col) {
    case 'OBJECTID':
      return 44
    case 'ZONE_ID':
      return 52
    case 'Farm_Name':
      return 92
    case 'Farm_Code':
      return 72
    case 'Crop_Type':
    case 'Variety':
      return 84
    case 'Total_Tree':
      return 68
    case 'Planting_Date':
    case 'Harvest_Date':
      return 100
    case 'Note':
      return 100
    default:
      return 68
  }
}
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
import { DEVELOP_ELITE_CHART_SURFACE_BG, type DevelopEliteChartsConfig } from './developEliteChartsConfig'
import { DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT } from './developEliteDashboardEvents'
import { prepareDevelopEliteChartSlices } from './developEliteChartSlices'
import {
  DEVELOP_ELITE_CHART_FLASH_OUTLINE,
  resolveDevelopEliteChartFlashCropLabel,
} from './developEliteChartFlash'
import {
  createDevelopEliteBarValuePlugin,
  createDevelopEliteChartCanvasBgPlugin,
  createDevelopEliteChartSliceFlashPlugin,
  createDevelopElitePieCalloutPlugin,
} from './developEliteChartPlugins'
import type { DevelopEliteChartSlice } from './useDevelopEliteDashboardData'
import { DevelopEliteResizeHandle, DevelopEliteResizeHost } from './DevelopEliteResizeHandle'
import {
  formatDevelopEliteChartAxisTick,
  formatDevelopEliteChartValueWithUnit,
  resolveDevelopEliteChartValueUnit,
} from './developEliteChartFormat'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

type ChartPart = 'all' | 'pie' | 'bar' | 'table'

type Props = {
  slices: DevelopEliteChartSlice[]
  tableRows: Record<string, string>[]
  tableColumns: string[]
  charts: DevelopEliteChartsConfig
  /** Caption for summed values (e.g. Per Tons). */
  valueLabel?: string
  part?: ChartPart
  onResizePieBar?: (deltaX: number) => void
  onResizeBarTable?: (deltaX: number) => void
  onResizeChartsHeight?: (deltaY: number) => void
  onResizeEnd?: () => void
  tableHighlightRowId?: string | null
  tableFlashRowId?: string | null
  selectedFieldKey?: string | null
  onTableRowClick?: (rowId: string) => void
  onTableRowDoubleClick?: (rowId: string) => void
}

function DevelopEliteChartsInner({
  slices,
  tableRows,
  tableColumns,
  charts,
  valueLabel = '',
  part = 'all',
  onResizePieBar,
  onResizeBarTable,
  onResizeChartsHeight,
  onResizeEnd,
  tableHighlightRowId,
  tableFlashRowId,
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
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
    return () => {
      window.removeEventListener('develop-elite-layout-changed', refresh)
      window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
    }
  }, [])

  const chartFlashCropLabel = useMemo(
    () => resolveDevelopEliteChartFlashCropLabel(tableRows, tableFlashRowId),
    [tableFlashRowId, tableRows],
  )

  const [chartFlashStartedAt, setChartFlashStartedAt] = useState(0)
  useEffect(() => {
    if (!chartFlashCropLabel) return
    setChartFlashStartedAt(performance.now())
  }, [chartFlashCropLabel, tableFlashRowId])

  const pieSlices = useMemo(
    () => prepareDevelopEliteChartSlices(slices, charts, 'pie'),
    [charts, slices],
  )
  const barSlices = useMemo(
    () => prepareDevelopEliteChartSlices(slices, charts, 'bar'),
    [charts, slices],
  )

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
    const flash = chartFlashCropLabel
    return {
      labels: pieSlices.map(s => s.label),
      datasets: [
        {
          data: pieSlices.map(s => s.value),
          backgroundColor: pieSlices.map(s => s.color),
          offset: pieSlices.map(s => (flash && s.label === flash ? 12 : 0)),
          borderWidth: pieSlices.map(s => (flash && s.label === flash ? 3 : 1)),
          borderColor: pieSlices.map(s =>
            flash && s.label === flash ? DEVELOP_ELITE_CHART_FLASH_OUTLINE : 'rgba(0, 0, 0, 0.88)',
          ),
          spacing: 1,
          hoverBorderColor: charts.axisColor,
          hoverBorderWidth: 1,
        },
      ],
    }
  }, [chartFlashCropLabel, pieSlices, charts.axisColor])

  const barData = useMemo((): ChartData<'bar'> => {
    const flash = chartFlashCropLabel
    return {
      labels: barSlices.map(s => s.label),
      datasets: [
        {
          data: barSlices.map(s => s.value),
          backgroundColor: barSlices.map(s => s.color),
          borderWidth: barSlices.map(s => (flash && s.label === flash ? 2.5 : 0)),
          borderColor: barSlices.map(s =>
            flash && s.label === flash ? DEVELOP_ELITE_CHART_FLASH_OUTLINE : 'transparent',
          ),
          borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
          borderSkipped: false,
        },
      ],
    }
  }, [barSlices, chartFlashCropLabel])

  const pieTotal = useMemo(
    () => pieSlices.reduce((sum, s) => sum + (Number(s.value) || 0), 0),
    [pieSlices],
  )

  const barSuggestedMax = useMemo(() => {
    const max = barSlices.reduce((m, s) => Math.max(m, Number(s.value) || 0), 0)
    return max > 0 ? max * 1.06 : undefined
  }, [barSlices])

  const valueUnit = useMemo(() => resolveDevelopEliteChartValueUnit(valueLabel), [valueLabel])

  const pieCalloutPlugin = useMemo(
    () => createDevelopElitePieCalloutPlugin(charts, valueUnit),
    [charts, valueUnit],
  )
  const pieCanvasBgPlugin = useMemo(
    () => createDevelopEliteChartCanvasBgPlugin(DEVELOP_ELITE_CHART_SURFACE_BG),
    [],
  )
  const barCanvasBgPlugin = useMemo(
    () => createDevelopEliteChartCanvasBgPlugin(DEVELOP_ELITE_CHART_SURFACE_BG),
    [],
  )
  const barValuePlugin = useMemo(
    () => createDevelopEliteBarValuePlugin(charts, valueUnit),
    [charts, valueUnit],
  )
  const chartSliceFlashPlugin = useMemo(
    () => createDevelopEliteChartSliceFlashPlugin(chartFlashCropLabel, chartFlashStartedAt),
    [chartFlashCropLabel, chartFlashStartedAt],
  )

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
              return `${context.label ?? ''}: ${formatDevelopEliteChartValueWithUnit(value, valueUnit)} (${pct}%)`
            },
          },
        },
      },
    }),
    [charts, valueUnit],
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
              const tick = formatDevelopEliteChartAxisTick(n)
              return tick ? `${tick} ${valueUnit}` : ''
            },
          },
          grid: { color: charts.gridColor, drawTicks: false },
          title: { display: false },
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
          callbacks: {
            label(context) {
              const raw = context.parsed.x
              const value = typeof raw === 'number' ? raw : 0
              return `${context.label ?? ''}: ${formatDevelopEliteChartValueWithUnit(value, valueUnit)}`
            },
          },
        },
      },
    }),
    [barSuggestedMax, charts, valueUnit],
  )

  const rootClass =
    part === 'all'
      ? 'develop-elite-charts'
      : part === 'table'
        ? 'develop-elite-charts develop-elite-charts--single develop-elite-charts--table-only'
        : 'develop-elite-charts develop-elite-charts--single'

  const pieBlock =
    part === 'all' || part === 'pie' ? (
      <DevelopEliteResizeHost
        className={`develop-elite-charts__pie develop-elite-resize-host${chartFlashCropLabel ? ' is-chart-crop-flash' : ''}`}
      >
        {pieSlices.length === 0 || pieTotal <= 0 ? (
          <p className="develop-elite-charts__empty develop-elite-charts__empty--chart">No chart data in scope</p>
        ) : (
          <Pie
            data={pieData}
            options={pieOptions}
            plugins={[pieCanvasBgPlugin, pieCalloutPlugin, chartSliceFlashPlugin]}
          />
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
      <DevelopEliteResizeHost
        className={`develop-elite-charts__bar develop-elite-resize-host${chartFlashCropLabel ? ' is-chart-crop-flash' : ''}`}
      >
        <Bar
          data={barData}
          options={barOptions}
          plugins={[barCanvasBgPlugin, barValuePlugin, chartSliceFlashPlugin]}
        />
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

  const tableColumnWidths = useMemo(
    () => tableColumns.map(col => developEliteChartTableColumnWidthPx(col)),
    [tableColumns],
  )

  const tableMinWidthPx = useMemo(
    () => tableColumnWidths.reduce((sum, w) => sum + w, 0),
    [tableColumnWidths],
  )

  const tableColGroup = useMemo(
    () => (
      <colgroup>
        {tableColumns.map((col, i) => {
          const w = tableColumnWidths[i] ?? 68
          return <col key={col} style={{ width: w, minWidth: w }} />
        })}
      </colgroup>
    ),
    [tableColumns, tableColumnWidths],
  )

  const tableBlock =
    part === 'all' || part === 'table' ? (
      <div className="develop-elite-charts__table-panel" style={tableStyle}>
        <div className="develop-elite-charts__table-wrap">
          <table
            className="develop-elite-charts__table"
            style={{ minWidth: Math.max(tableMinWidthPx, 100) }}
          >
            {tableColGroup}
            <thead>
              <tr>
                {tableColumns.map(col => (
                  <th
                    key={col}
                    scope="col"
                    className={
                      col === 'Total_Tree' ? 'develop-elite-charts__table-num' : undefined
                    }
                  >
                    {col === 'OBJECTID' ? 'ID' : col}
                  </th>
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
                  const rowFlashing = tableFlashRowId === row._rowId
                  const rowClass = [
                    rowFocused ? 'is-table-row-focus' : '',
                    mapLinked ? 'is-table-row-map-selected' : '',
                    rowFlashing ? 'is-table-row-flash' : '',
                    row._fieldKey ? 'is-table-row-clickable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <tr
                      key={row._rowId}
                      className={rowClass || undefined}
                      onClick={() => onTableRowClick?.(row._rowId)}
                      onDoubleClick={e => {
                        e.preventDefault()
                        if (row._fieldKey) onTableRowDoubleClick?.(row._rowId)
                      }}
                    >
                      {tableColumns.map(col => {
                        const text = row[col] ?? ''
                        const cellClass = [
                          col === 'Crop_Type' ? 'develop-elite-charts__table-crop' : '',
                          col === 'Total_Tree' ? 'develop-elite-charts__table-num' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                        return (
                          <td key={col} className={cellClass || undefined}>
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
