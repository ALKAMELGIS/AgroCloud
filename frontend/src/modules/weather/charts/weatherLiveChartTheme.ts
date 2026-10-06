import type { ChartOptions } from 'chart.js'
import type { AgroThemeMode } from '@/theme/createAgroTheme'
import { readDocumentThemeMode } from '@/theme/createAgroTheme'

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

function arcgisDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function arcgisTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** ArcGIS X axis: show calendar date on day changes; same-day ticks show HH:mm on the hour. */
export function formatArcgisAxisTick(iso: string, prevIso?: string): string {
  const d = parseChartAxisIso(iso)
  if (Number.isNaN(d.getTime())) return ''

  const dateLabel = arcgisDateLabel(d)
  const prev = prevIso ? parseChartAxisIso(prevIso) : null
  const prevDate =
    prev && !Number.isNaN(prev.getTime()) ? arcgisDateLabel(prev) : null
  const dayChanged = !prevDate || dateLabel !== prevDate

  if (dayChanged) {
    if (d.getHours() === 0 && d.getMinutes() === 0) return dateLabel
    return `${dateLabel} ${arcgisTimeLabel(d)}`
  }

  if (d.getMinutes() !== 0) return ''
  return arcgisTimeLabel(d)
}

function resolveCategoryAxisIso(
  chart: { data: { labels?: unknown[] } },
  value: string | number,
  index: number,
): { iso: string; prevIso?: string } | null {
  const labels = chart.data.labels
  let idx = index
  if (typeof value === 'number' && Number.isFinite(value)) idx = value
  let raw = labels?.[idx]
  if (typeof raw !== 'string') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) raw = value
    else return null
  }
  const prev = idx > 0 && typeof labels?.[idx - 1] === 'string' ? (labels[idx - 1] as string) : undefined
  return { iso: raw, prevIso: prev }
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

function arcgisAxisTickColor(mode: AgroThemeMode): string {
  return mode === 'light' ? 'rgba(51, 65, 85, 0.88)' : 'rgba(203, 213, 225, 0.82)'
}

function arcgisGridColor(mode: AgroThemeMode): string {
  return mode === 'light' ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.1)'
}

function arcgisXTicks(mode: AgroThemeMode) {
  return {
    color: arcgisAxisTickColor(mode),
    font: { size: 9, weight: 'normal' as const },
    maxTicksLimit: 16,
    maxRotation: 0,
    minRotation: 0,
    autoSkip: true,
    autoSkipPadding: 8,
    padding: 6,
    callback(value: string | number, index: number) {
      const hit = resolveCategoryAxisIso(this.chart, value, index)
      if (!hit) return ''
      return formatArcgisAxisTick(hit.iso, hit.prevIso)
    },
  }
}

function arcgisYTicks(mode: AgroThemeMode) {
  return {
    color: arcgisAxisTickColor(mode),
    font: { size: 9, weight: 'normal' as const },
    padding: 6,
  }
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

export function arcgisLineDatasetStyle(mode: AgroThemeMode = readDocumentThemeMode()) {
  return {
    borderColor: mode === 'light' ? '#1e293b' : '#ffffff',
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
}

/** @deprecated Use arcgisLineDatasetStyle() for theme-aware stroke color. */
export const ARCGIS_LINE_DATASET_STYLE = arcgisLineDatasetStyle('dark')

export function arcgisStackChartOptions(
  title: string,
  extra?: Partial<ChartOptions>,
  mode: AgroThemeMode = readDocumentThemeMode(),
): ChartOptions {
  const xTicks = arcgisXTicks(mode)
  const yTicks = arcgisYTicks(mode)
  const gridColor = arcgisGridColor(mode)
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
        color: mode === 'light' ? '#0f172a' : '#f1f5f9',
        align: 'start',
        font: { size: 12, weight: 'bold' },
        padding: { top: 2, bottom: 8 },
      },
      tooltip: {
        backgroundColor: mode === 'light' ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 15, 18, 0.92)',
        titleColor: mode === 'light' ? '#0f172a' : '#f8fafc',
        bodyColor: mode === 'light' ? '#334155' : '#e2e8f0',
        borderColor: mode === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.12)',
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
        ticks: xTicks,
        border: { display: false },
        grid: {
          display: true,
          color: gridColor,
          drawTicks: true,
          tickLength: 4,
        },
      },
      y: {
        ticks: yTicks,
        border: { display: false },
        grid: {
          color: gridColor,
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
        ticks: { ...xTicks, ...extra.scales?.x?.ticks },
      },
      y: {
        ...base.scales?.y,
        ...extra.scales?.y,
        ticks: { ...yTicks, ...extra.scales?.y?.ticks },
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
