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
  colorForRsClass,
  type NeighborhoodAgentRsLift,
} from '../../../../lib/neighborhoodAgentRsViz'
import {
  currentTableToHumidityPie,
  forecastTableToFeelsChartTable,
  forecastTableToSkyPieTable,
  forecastTableToTempChartTable,
  formatMetricDisplay,
  metricIconForLabel,
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
  accent?: 'flat' | 'weather' | 'rs'
  /** Optional per-slice colors (RS class spectrum). */
  sliceColors?: string[]
  /** Raise row cap when forcing rich breakdowns (NDVI classes). */
  maxRows?: number
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
const PIE_COLORS_RS = [
  '#1e4d6b',
  '#7f1d1d',
  '#b91c1c',
  '#c2410c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#16a34a',
  '#15803d',
  '#14532d',
  '#0f766e',
  '#0e7490',
]

function preferPie(table: GeoExplorerDataTablePayload, seriesValues: number[]): boolean {
  if (seriesValues.length < 2 || seriesValues.length > 12) return false
  const title = `${table.title || ''} ${table.columns.map(c => c.label).join(' ')}`.toLowerCase()
  if (!/(share|%|percent|نسبة|حصة|mix|nationalit|humidity|ndvi|ndwi|class)/i.test(title)) return false
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
  sliceColors,
  maxRows = 12,
}: NeighborhoodAgentStatsChartProps) {
  const series = useMemo(() => {
    if (!force && !shouldAutoChartNeighborhoodAgentTable(table)) return null
    return buildNeighborhoodAgentChartSeries(table, { maxRows })
  }, [table, force, maxRows])

  const kind = useMemo(() => {
    if (!series) return null
    if (preferredKind === 'bar' || preferredKind === 'pie') return preferredKind
    return preferPie(table, series.values) ? 'pie' : 'bar'
  }, [preferredKind, series, table])

  const barFill = accent === 'weather' ? WX_BAR : accent === 'rs' ? undefined : FLAT_BAR
  const pieColors =
    accent === 'weather' ? PIE_COLORS_WX : accent === 'rs' ? PIE_COLORS_RS : PIE_COLORS_FLAT

  const resolvedSliceColors = useMemo(() => {
    if (!series) return [] as string[]
    // Prefer name-matched palette so pie / bar / legend stay in sync.
    if (accent === 'rs' || sliceColors?.length) {
      return series.labels.map((lb, i) => colorForRsClass(lb, i))
    }
    return series.labels.map((_, i) => pieColors[i % pieColors.length]!)
  }, [series, sliceColors, accent, pieColors])

  const barData: ChartData<'bar'> | null = useMemo(() => {
    if (!series || kind !== 'bar') return null
    return {
      labels: series.labels,
      datasets: [
        {
          label: series.valueLabel,
          data: series.values,
          borderWidth: 0,
          borderRadius: accent === 'rs' ? 4 : 2,
          borderSkipped: false,
          maxBarThickness: accent === 'rs' ? 20 : 28,
          backgroundColor:
            accent === 'rs' || sliceColors?.length
              ? resolvedSliceColors
              : barFill || FLAT_BAR,
        },
      ],
    }
  }, [series, kind, barFill, accent, sliceColors, resolvedSliceColors])

  const pieData: ChartData<'pie'> | null = useMemo(() => {
    if (!series || kind !== 'pie') return null
    return {
      labels: series.labels,
      datasets: [
        {
          data: series.values,
          backgroundColor: resolvedSliceColors,
          borderWidth: accent === 'rs' ? 1 : 0,
          borderColor: accent === 'rs' ? 'rgba(15, 23, 42, 0.55)' : undefined,
          hoverOffset: accent === 'rs' ? 4 : 0,
        },
      ],
    }
  }, [series, kind, resolvedSliceColors, accent])

  const barOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: accent === 'rs' ? { duration: 550, easing: 'easeOutQuart' } : false,
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderWidth: 0,
          padding: 10,
          displayColors: accent === 'rs',
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxRotation: 40,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          beginAtZero,
          grid: { color: 'rgba(148, 163, 184, 0.12)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 5, padding: 4 },
        },
      },
    }),
    [beginAtZero, accent],
  )

  const pieOptions: ChartOptions<'pie'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: accent === 'rs' ? { duration: 550, easing: 'easeOutQuart' } : false,
      plugins: {
        // Shared external legend on RS card — avoid a second boxed legend under the pie.
        legend: {
          display: accent !== 'rs',
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            boxWidth: 8,
            font: { size: 10 },
            padding: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderWidth: 0,
          callbacks:
            accent === 'rs'
              ? {
                  label(ctx) {
                    const v = typeof ctx.parsed === 'number' ? ctx.parsed : 0
                    const label = ctx.label || ''
                    return ` ${label}: ${v}%`
                  },
                }
              : undefined,
        },
      },
    }),
    [accent],
  )

  if (!series) return null
  const showCaption = accent === 'weather' || accent === 'rs' || force
  if (kind === 'pie' && pieData) {
    return (
      <div className={`nac-stats-chart nac-stats-chart--pie${accent === 'rs' ? ' nac-stats-chart--rs' : ''}`} aria-label={series.title}>
        {showCaption ? <div className="nac-stats-chart-caption">{accent === 'rs' ? 'Composition' : 'Pie'} · {series.title}</div> : null}
        <div className="nac-stats-chart-canvas nac-stats-chart-canvas--pie">
          <Pie data={pieData} options={pieOptions} />
        </div>
      </div>
    )
  }
  if (!barData) return null

  return (
    <div className={`nac-stats-chart${accent === 'rs' ? ' nac-stats-chart--rs' : ''}`} aria-label={series.title}>
      {showCaption ? (
        <div className="nac-stats-chart-caption">{accent === 'rs' ? 'Area' : 'Bar'} · {series.title}</div>
      ) : null}
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
  climateLine?: string
  currentTable?: GeoExplorerDataTablePayload | null
  forecastTable?: GeoExplorerDataTablePayload | null
  monthOutlookTable?: GeoExplorerDataTablePayload | null
  weekOutlookTable?: GeoExplorerDataTablePayload | null
}

/** Weather block: icons + colored charts/tables + month outlook. */
export function NeighborhoodAgentWeatherCard({
  location,
  condition = 'unknown',
  conditionLabel,
  climateLine,
  currentTable,
  forecastTable,
  monthOutlookTable,
  weekOutlookTable,
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
  const monthTempChart = useMemo(
    () => (monthOutlookTable ? forecastTableToTempChartTable(monthOutlookTable) : null),
    [monthOutlookTable],
  )
  const weekBar = useMemo(
    () => (weekOutlookTable ? forecastTableToTempChartTable(weekOutlookTable) : null),
    [weekOutlookTable],
  )

  const metricRows = currentTable?.rows?.length
    ? currentTable.rows.map(row => {
        const metric = String(row.values.metric ?? row.values.Metric ?? '').trim()
        const value = row.values.value ?? row.values.Value
        return { metric, value, icon: metricIconForLabel(metric) }
      })
    : []

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
        title: !forecastTable.title || /^forecast/i.test(forecastTable.title) ? 'Short forecast' : forecastTable.title,
      }
    : null

  const monthTable = monthOutlookTable?.rows?.length
    ? {
        ...monthOutlookTable,
        title: monthOutlookTable.title || 'Month outlook',
      }
    : null

  const interpretation =
    climateLine?.trim() ||
    [conditionLabel, location].filter(Boolean).join(' · ') ||
    'Weather'

  return (
    <div className={`nac-weather-card nac-weather-card--${condition}`}>
      <div className="nac-weather-hero">
        <div className={`nac-weather-hero-icon nac-weather-hero-icon--${condition}`} aria-hidden>
          <i className={weatherConditionIcon(condition)} />
        </div>
        <div className="nac-weather-hero-copy">
          <div className="nac-weather-hero-title">
            {conditionLabel || 'Current climate'}
            {location ? <span className="nac-weather-hero-place"> · {location}</span> : null}
          </div>
          <p className="nac-weather-climate-line">{interpretation}</p>
        </div>
      </div>

      {metricRows.length ? (
        <div className="nac-weather-metric-chips" role="list">
          {metricRows.map((m, i) => (
            <div key={`${m.metric}-${i}`} className="nac-weather-chip" role="listitem">
              <i className={m.icon} aria-hidden />
              <span className="nac-weather-chip-label">{m.metric || 'Metric'}</span>
              <span className="nac-weather-chip-value">{formatMetricDisplay(m.metric, m.value)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="nac-weather-charts nac-weather-charts--grid">
        {humidityPie ? (
          <NeighborhoodAgentStatsChart table={humidityPie} preferredKind="pie" force accent="weather" />
        ) : null}
        {skyPie ? (
          <NeighborhoodAgentStatsChart table={skyPie} preferredKind="pie" force accent="weather" />
        ) : null}
        {forecastTable ? <NeighborhoodAgentForecastTempBar forecast={forecastTable} /> : null}
        {tempChart ? <NeighborhoodAgentLineChart table={tempChart} beginAtZero={false} /> : null}
        {weekBar ? (
          <NeighborhoodAgentStatsChart table={weekBar} preferredKind="bar" force accent="weather" beginAtZero={false} />
        ) : null}
        {monthTempChart ? <NeighborhoodAgentLineChart table={monthTempChart} beginAtZero={false} /> : null}
      </div>

      {nowTable ? <NeighborhoodAgentCompactTable table={nowTable} maxRows={8} /> : null}
      {fcTable ? <NeighborhoodAgentCompactTable table={fcTable} maxRows={8} /> : null}
      {monthTable ? <NeighborhoodAgentCompactTable table={monthTable} maxRows={16} /> : null}
      {weekOutlookTable?.rows?.length ? (
        <NeighborhoodAgentCompactTable
          table={{ ...weekOutlookTable, title: weekOutlookTable.title || 'Weekly outlook' }}
          maxRows={6}
        />
      ) : null}
    </div>
  )
}

/** NDVI / RS analysis: flat pie + bar + shared legend (no nested card chrome). */
export function NeighborhoodAgentRsCard({ analysis }: { analysis: NeighborhoodAgentRsLift }) {
  const legendItems = useMemo(
    () =>
      analysis.classes.map((c, i) => ({
        name: c.name,
        color: colorForRsClass(c.name, i),
        pct: c.pct,
        areaHa: c.areaHa,
      })),
    [analysis.classes],
  )

  const totalHa = useMemo(() => {
    return analysis.classes.reduce((s, c) => s + (c.areaHa != null && c.areaHa > 0 ? c.areaHa : 0), 0)
  }, [analysis.classes])

  const metaBits = [
    analysis.sceneDate ? `Scene ${analysis.sceneDate}` : null,
    analysis.resolutionMeters != null ? `${analysis.resolutionMeters} m` : null,
    analysis.meanValue != null ? `Mean ${analysis.meanValue.toFixed(3)}` : null,
    totalHa > 0 ? `${totalHa.toFixed(1)} ha` : null,
  ].filter(Boolean)

  return (
    <div className="nac-rs-block">
      <div className="nac-rs-title-row">
        <span className="nac-rs-title">{analysis.indexLabel}</span>
        {analysis.sceneDate ? <span className="nac-rs-title-meta">{analysis.sceneDate}</span> : null}
      </div>
      <p className="nac-rs-lead">{analysis.lead}</p>
      {metaBits.length ? <p className="nac-rs-meta-line">{metaBits.join(' · ')}</p> : null}

      <div className="nac-rs-charts">
        {analysis.shareTable ? (
          <NeighborhoodAgentStatsChart
            table={analysis.shareTable}
            preferredKind="pie"
            force
            accent="rs"
            maxRows={12}
          />
        ) : null}
        {analysis.areaTable ? (
          <NeighborhoodAgentStatsChart
            table={analysis.areaTable}
            preferredKind="bar"
            force
            accent="rs"
            maxRows={12}
          />
        ) : null}
      </div>

      {legendItems.length ? (
        <ul className="nac-rs-legend" aria-label={`${analysis.indexLabel} legend`}>
          {legendItems.map(item => (
            <li key={item.name} className="nac-rs-legend-item">
              <span className="nac-rs-legend-swatch" style={{ background: item.color }} aria-hidden />
              <span className="nac-rs-legend-name">{item.name}</span>
              <span className="nac-rs-legend-vals">
                {item.areaHa != null ? `${item.areaHa.toFixed(2)} ha` : '—'}
                {item.pct != null ? ` · ${item.pct.toFixed(1)}%` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
