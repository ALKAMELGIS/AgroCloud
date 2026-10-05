import type { ChartOptions } from 'chart.js'

export const WEATHER_CHART_COLORS = {
  temp: '#f97316',
  tempMin: '#38bdf8',
  tempMax: '#ef4444',
  precip: '#3b82f6',
  precipCum: '#22d3ee',
  wind: '#a78bfa',
  humidity: '#34d399',
  et0: '#fbbf24',
  deficit: '#f472b6',
  grid: 'rgba(255,255,255,0.06)',
  tick: '#94a3b8',
  legend: '#cbd5e1',
}

function parseChartAxisIso(iso: string): Date {
  const normalized = iso.trim().replace(' ', 'T')
  const d = new Date(normalized.length >= 16 ? normalized.slice(0, 16) : normalized)
  return d
}

/** ArcGIS dashboard axis: midnight → "Jan 21", noon → "12:00". */
export function formatArcgisAxisTick(iso: string): string | undefined {
  const d = parseChartAxisIso(iso)
  if (Number.isNaN(d.getTime())) return undefined
  if (d.getMinutes() !== 0) return undefined
  const h = d.getHours()
  if (h === 0) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (h === 12) return '12:00'
  return undefined
}

function formatArcgisTooltipTitle(iso: string): string {
  const d = parseChartAxisIso(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ARCGIS_AXIS_TICK_COLOR = 'rgba(203, 213, 225, 0.82)'
const ARCGIS_GRID_COLOR = 'rgba(255, 255, 255, 0.1)'

const ARCGIS_X_TICKS = {
  color: ARCGIS_AXIS_TICK_COLOR,
  font: { size: 9, weight: 'normal' as const },
  maxTicksLimit: 18,
  maxRotation: 0,
  minRotation: 0,
  autoSkip: true,
  padding: 6,
  callback(value: string | number) {
    const idx = typeof value === 'number' ? value : Number(value)
    const labels = this.chart.data.labels
    const raw = labels?.[idx]
    if (typeof raw !== 'string') return ''
    const tick = formatArcgisAxisTick(raw)
    return tick ?? ''
  },
}

const ARCGIS_Y_TICKS = {
  color: ARCGIS_AXIS_TICK_COLOR,
  font: { size: 9, weight: 'normal' as const },
  padding: 6,
}

/** Orange line + soft fill — ArcGIS humidity / accent forecast series. */
export const ARCGIS_ORANGE_AREA_LINE_STYLE = {
  borderColor: '#f97316',
  backgroundColor: 'rgba(249, 115, 22, 0.18)',
  fill: true,
  tension: 0.42,
  cubicInterpolationMode: 'monotone' as const,
  pointRadius: 0,
  pointHoverRadius: 3,
  borderWidth: 2,
  borderCapStyle: 'round' as const,
  borderJoinStyle: 'round' as const,
  spanGaps: true,
}

export const ARCGIS_LINE_DATASET_STYLE = {
  borderColor: '#ffffff',
  backgroundColor: 'transparent',
  fill: false,
  tension: 0.42,
  cubicInterpolationMode: 'monotone' as const,
  pointRadius: 0,
  pointHoverRadius: 3,
  borderWidth: 2,
  borderCapStyle: 'round' as const,
  borderJoinStyle: 'round' as const,
  spanGaps: true,
}

export function arcgisStackChartOptions(title: string, extra?: Partial<ChartOptions>): ChartOptions {
  const base = baseLiveChartOptions({
    animation: { duration: 280 },
    elements: {
      line: {
        tension: 0.42,
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
      },
      point: { radius: 0, hoverRadius: 3 },
    },
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: title,
        color: '#f1f5f9',
        align: 'start',
        font: { size: 12, weight: 'bold' },
        padding: { top: 2, bottom: 8 },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 15, 18, 0.92)',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        callbacks: {
          title(items) {
            const raw = items[0]?.label
            return typeof raw === 'string' ? formatArcgisTooltipTitle(raw) : ''
          },
        },
      },
    },
    scales: {
      x: {
        ticks: ARCGIS_X_TICKS,
        border: { display: false },
        grid: {
          display: true,
          color: ARCGIS_GRID_COLOR,
          drawTicks: true,
          tickLength: 4,
        },
      },
      y: {
        ticks: ARCGIS_Y_TICKS,
        border: { display: false },
        grid: {
          color: ARCGIS_GRID_COLOR,
          drawTicks: true,
          tickLength: 4,
        },
      },
    },
  })

  if (!extra) return base

  return {
    ...base,
    ...extra,
    plugins: { ...base.plugins, ...extra.plugins },
    scales: {
      x: {
        ...base.scales?.x,
        ...extra.scales?.x,
        ticks: { ...ARCGIS_X_TICKS, ...extra.scales?.x?.ticks },
      },
      y: {
        ...base.scales?.y,
        ...extra.scales?.y,
        ticks: { ...base.scales?.y?.ticks, ...extra.scales?.y?.ticks },
      },
    },
  }
}

export function baseLiveChartOptions(extra?: Partial<ChartOptions>): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: WEATHER_CHART_COLORS.legend, boxWidth: 8, font: { size: 10 } },
      },
    },
    scales: {
      x: {
        ticks: { color: WEATHER_CHART_COLORS.tick, maxTicksLimit: 12, font: { size: 8 }, maxRotation: 0 },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: { color: WEATHER_CHART_COLORS.tick, font: { size: 9 } },
        grid: { color: WEATHER_CHART_COLORS.grid },
      },
    },
    ...extra,
  }
}
