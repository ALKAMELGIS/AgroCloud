import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { useMemo } from 'react'
import { Bar, Line, Pie } from 'react-chartjs-2'
import type { GeoExplorerDataTablePayload } from '../../../../lib/geoExplorerGemini'
import {
  buildNeighborhoodAgentChartSeries,
  shouldAutoChartNeighborhoodAgentTable,
} from '../../../../lib/neighborhoodAgentStatsViz'
import {
  currentTableToHumidityPie,
  forecastTableToFeelsChartTable,
  forecastTableToSkyPieTable,
  forecastTableToTempChartTable,
  weatherConditionIcon,
  type NeighborhoodAgentWeatherCondition,
} from '../../../../lib/neighborhoodAgentWeatherViz'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
)

export type NeighborhoodAgentStatsChartProps = {
  table: GeoExplorerDataTablePayload
  beginAtZero?: boolean
  preferredKind?: 'bar' | 'pie' | 'auto'
  /** Skip auto-chart row/column gates (weather analysis). */
  force?: boolean
  accent?: 'flat' | 'weather'
}

const FLAT_BAR = 'rgba(148, 163, 184, 0.55)'
const WX_BAR = 'rgba(45, 212, 191, 0.78)'
const WX_BAR_FEELS = 'rgba(251, 191, 36, 0.72)'
const WX_LINE = '#38bdf8'
const PIE_COLORS_FLAT = [
  'rgba(148, 163, 184, 0.75)',
  'rgba(100, 116, 139, 0.75)',
  'rgba(71, 85, 105, 0.8)',
  'rgba(51, 65, 85, 0.85)',
  'rgba(226, 232, 240, 0.35)',
  'rgba(203, 213, 225, 0.45)',
  'rgba(148, 163, 184, 0.5)',
  'rgba(100, 116, 139, 0.6)',
]
const PIE_COLORS_WX = ['#2dd4bf', '#38bdf8', '#fbbf24', '#4ade80', '#fb7185', '#a78bfa']

function preferPie(table: GeoExplorerDataTablePayload, seriesValues: number[]): boolean {
  if (seriesValues.length < 2 || seriesValues.length > 8) return false
  const title = `${table.title || ''} ${table.columns.map(c => c.label).join(' ')}`.toLowerCase()
  if (!/(share|%|percent|نسبة|حصة|mix|nationalit|humidity)/i.test(title)) return false
  const sum = seriesValues.reduce((a, b) => a + b, 0)
  return sum >= 90 && sum <= 110
}

/** Plain in-chat chart — no card chrome / AI-style headers. */
export function NeighborhoodAgentStatsChart({
  table,
  beginAtZero = true,
  preferredKind = 'auto',
  force = false,
  accent = 'flat',
}: NeighborhoodAgentStatsChartProps) {
  const series = useMemo(() => {
    if (!force && !shouldAutoChartNeighborhoodAgentTable(table)) return null
    return buildNeighborhoodAgentChartSeries(table)
  }, [table, force])

  const kind = useMemo(() => {
    if (!series) return null
    if (preferredKind === 'bar' || preferredKind === 'pie') return preferredKind
    return preferPie(table, series.values) ? 'pie' : 'bar'
  }, [preferredKind, series, table])

  const barFill = accent === 'weather' ? WX_BAR : FLAT_BAR
  const pieColors = accent === 'weather' ? PIE_COLORS_WX : PIE_COLORS_FLAT

  const barData: ChartData<'bar'> | null = useMemo(() => {
    if (!series || kind !== 'bar') return null
    return {
      labels: series.labels,
      datasets: [
        {
          label: series.valueLabel,
          data: series.values,
          borderWidth: 0,
          borderRadius: 2,
          borderSkipped: false,
          maxBarThickness: 28,
          backgroundColor: barFill,
        },
      ],
    }
  }, [series, kind, barFill])

  const pieData: ChartData<'pie'> | null = useMemo(() => {
    if (!series || kind !== 'pie') return null
    return {
      labels: series.labels,
      datasets: [
        {
          data: series.values,
          backgroundColor: series.labels.map((_, i) => pieColors[i % pieColors.length]!),
          borderWidth: 0,
        },
      ],
    }
  }, [series, kind, pieColors])

  const barOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderWidth: 0,
          padding: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxRotation: 35,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero,
          grid: { color: 'rgba(148, 163, 184, 0.1)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 4, padding: 4 },
        },
      },
    }),
    [beginAtZero],
  )

  const pieOptions: ChartOptions<'pie'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', boxWidth: 8, font: { size: 10 }, padding: 8 },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderWidth: 0,
        },
      },
    }),
    [],
  )

  if (!series) return null
  const showCaption = accent === 'weather' || force
  if (kind === 'pie' && pieData) {
    return (
      <div className="nac-stats-chart nac-stats-chart--pie" aria-label={series.title}>
        {showCaption ? <div className="nac-stats-chart-caption">Pie · {series.title}</div> : null}
        <div className="nac-stats-chart-canvas nac-stats-chart-canvas--pie">
          <Pie data={pieData} options={pieOptions} />
        </div>
      </div>
    )
  }
  if (!barData) return null

  return (
    <div className="nac-stats-chart" aria-label={series.title}>
      {showCaption ? <div className="nac-stats-chart-caption">Bar · {series.title}</div> : null}
      <div className="nac-stats-chart-canvas">
        <Bar data={barData} options={barOptions} />
      </div>
    </div>
  )
}

/** Timeline (line) chart for forecast temps. */
export function NeighborhoodAgentLineChart({
  table,
  beginAtZero = false,
}: {
  table: GeoExplorerDataTablePayload
  beginAtZero?: boolean
}) {
  const series = useMemo(() => buildNeighborhoodAgentChartSeries(table), [table])

  const data: ChartData<'line'> | null = useMemo(() => {
    if (!series) return null
    return {
      labels: series.labels,
      datasets: [
        {
          label: series.valueLabel,
          data: series.values,
          borderColor: WX_LINE,
          backgroundColor: 'rgba(56, 189, 248, 0.16)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: WX_LINE,
          pointBorderWidth: 0,
          tension: 0.35,
          fill: true,
        },
      ],
    }
  }, [series])

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderWidth: 0,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxRotation: 35,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero,
          grid: { color: 'rgba(148, 163, 184, 0.1)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 4, padding: 4 },
        },
      },
    }),
    [beginAtZero],
  )

  if (!data || !series) return null
  return (
    <div className="nac-stats-chart" aria-label={`${series.title} timeline`}>
      <div className="nac-stats-chart-caption">Timeline · {series.title}</div>
      <div className="nac-stats-chart-canvas">
        <Line data={data} options={options} />
      </div>
    </div>
  )
}

/** Grouped bar: Temp + Feels across forecast slots. */
export function NeighborhoodAgentForecastTempBar({ forecast }: { forecast: GeoExplorerDataTablePayload }) {
  const tempTable = useMemo(() => forecastTableToTempChartTable(forecast), [forecast])
  const feelsTable = useMemo(() => forecastTableToFeelsChartTable(forecast), [forecast])

  const data: ChartData<'bar'> | null = useMemo(() => {
    if (!tempTable) return null
    const labels = tempTable.rows.map(r => String(r.values.when ?? ''))
    const temps = tempTable.rows.map(r => Number(r.values.temp))
    const datasets: ChartData<'bar'>['datasets'] = [
      {
        label: 'Temp °C',
        data: temps,
        backgroundColor: WX_BAR,
        borderWidth: 0,
        borderRadius: 2,
        maxBarThickness: 18,
      },
    ]
    if (feelsTable && feelsTable.rows.length === tempTable.rows.length) {
      datasets.push({
        label: 'Feels °C',
        data: feelsTable.rows.map(r => Number(r.values.feels)),
        backgroundColor: WX_BAR_FEELS,
        borderWidth: 0,
        borderRadius: 2,
        maxBarThickness: 18,
      })
    }
    return { labels, datasets }
  }, [tempTable, feelsTable])

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#94a3b8', boxWidth: 8, font: { size: 10 }, padding: 8 },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderWidth: 0,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxRotation: 35,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(148, 163, 184, 0.1)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 4, padding: 4 },
        },
      },
    }),
    [],
  )

  if (!data) return null
  return (
    <div className="nac-stats-chart" aria-label="Forecast temperature bar">
      <div className="nac-stats-chart-caption">Bar · Temp vs Feels</div>
      <div className="nac-stats-chart-canvas">
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

/** Plain chat table — flat Metric/Value style, no toolbars or nested chrome. */
export function NeighborhoodAgentCompactTable({
  table,
  maxRows = 25,
  onMapAction,
}: {
  table: GeoExplorerDataTablePayload
  maxRows?: number
  onMapAction?: (
    action: 'zoom' | 'highlight' | 'focus' | 'openTable',
    link: NonNullable<GeoExplorerDataTablePayload['rows'][number]['mapLink']>,
  ) => void
}) {
  const cols = table.columns.filter(c => c.defaultVisible !== false)
  if (!cols.length || !table.rows.length) return null
  const rows = table.rows.slice(0, maxRows)
  const truncated = table.rows.length > maxRows

  return (
    <div className="nac-compact-table-wrap">
      {table.title && table.title !== 'Summary table' ? (
        <div className="nac-compact-table-title">{table.title}</div>
      ) : null}
      <div className="nac-compact-table-scroll">
        <table className="nac-compact-table">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} className={c.align === 'right' ? 'nac-compact-table-num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const link = row.mapLink
              const clickable = Boolean(link && onMapAction)
              return (
                <tr
                  key={i}
                  className={clickable ? 'nac-compact-table-row--link' : undefined}
                  onClick={
                    clickable && link
                      ? () => {
                          onMapAction?.('focus', link)
                          onMapAction?.('highlight', link)
                        }
                      : undefined
                  }
                  title={clickable ? 'Show on map' : undefined}
                >
                  {cols.map(c => {
                    const v = row.values[c.key]
                    const text = v == null ? '—' : String(v)
                    return (
                      <td key={c.key} className={c.align === 'right' ? 'nac-compact-table-num' : undefined}>
                        {text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <p className="nac-compact-table-more">+{table.rows.length - maxRows} more</p>
      ) : null}
    </div>
  )
}

export type NeighborhoodAgentWeatherCardProps = {
  location?: string
  condition?: NeighborhoodAgentWeatherCondition
  conditionLabel?: string
  currentTable?: GeoExplorerDataTablePayload | null
  forecastTable?: GeoExplorerDataTablePayload | null
}

/** Weather block: charts + flat Now/Forecast tables (no nested chrome). */
export function NeighborhoodAgentWeatherCard({
  location,
  condition = 'unknown',
  conditionLabel,
  currentTable,
  forecastTable,
}: NeighborhoodAgentWeatherCardProps) {
  const tempChart = useMemo(
    () => (forecastTable ? forecastTableToTempChartTable(forecastTable) : null),
    [forecastTable],
  )
  const humidityPie = useMemo(
    () => (currentTable ? currentTableToHumidityPie(currentTable) : null),
    [currentTable],
  )
  const skyPie = useMemo(
    () => (forecastTable ? forecastTableToSkyPieTable(forecastTable) : null),
    [forecastTable],
  )
  const pieTable = humidityPie || skyPie

  const nowTable = currentTable?.rows?.length
    ? {
        ...currentTable,
        title:
          !currentTable.title || /^(now|current)\b/i.test(currentTable.title)
            ? 'Current Weather'
            : currentTable.title,
      }
    : null

  const fcTable = forecastTable?.rows?.length
    ? {
        ...forecastTable,
        title: !forecastTable.title || /^forecast/i.test(forecastTable.title) ? 'Forecast' : forecastTable.title,
      }
    : null

  return (
    <div className="nac-weather-card">
      <p className="nac-weather-card-line">
        <i className={weatherConditionIcon(condition)} aria-hidden />{' '}
        {[conditionLabel, location].filter(Boolean).join(' · ') || 'Weather'}
      </p>

      {(pieTable || forecastTable || tempChart) && (
        <div className="nac-weather-charts">
          {pieTable ? (
            <NeighborhoodAgentStatsChart
              table={pieTable}
              preferredKind="pie"
              force
              accent="weather"
            />
          ) : null}
          {forecastTable ? <NeighborhoodAgentForecastTempBar forecast={forecastTable} /> : null}
          {tempChart ? <NeighborhoodAgentLineChart table={tempChart} beginAtZero={false} /> : null}
        </div>
      )}

      {nowTable ? <NeighborhoodAgentCompactTable table={nowTable} /> : null}
      {fcTable ? <NeighborhoodAgentCompactTable table={fcTable} /> : null}
    </div>
  )
}
