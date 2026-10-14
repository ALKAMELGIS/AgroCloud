import { Chart as ChartJS, type Chart, type Plugin } from 'chart.js'
import type { AgroThemeMode } from '@/theme/createAgroTheme'
import {
  computeWeatherChartNowIndex,
  floorToOpenMeteoHourIso,
  interpolateWeatherChartValue,
  parseWeatherChartAxisTime,
  type WeatherArcgisChartGuideSet,
  type WeatherChartHorizontalGuide,
} from './weatherArcgisChartLive'

/** ArcGIS-style live segment — indicates the current hourly update window. */
export const WEATHER_CHART_LIVE_RANGE_LINE = '#eab308'

export type WeatherArcgisGuidesPluginOptions = WeatherArcgisChartGuideSet & {
  showNowLine?: boolean
  /** Yellow line segment along the series for the live update window (line charts only). */
  showLiveRangeLine?: boolean
  themeMode?: AgroThemeMode
  /** Recompute NOW position every frame from wall clock (smooth second-by-second motion). */
  liveMotion?: boolean
  /** ISO hourly keys aligned with chart labels (Open-Meteo `time`). */
  isoLabels?: string[]
  /** Values for animated live dot at NOW (same length as isoLabels). */
  liveSeries?: Array<number | null | undefined>
  /** Use circular interpolation (wind direction °). */
  liveSeriesCircular?: boolean
}

const liveMotionRafByChart = new WeakMap<Chart, number>()

function stopLiveMotionLoop(chart: Chart) {
  const id = liveMotionRafByChart.get(chart)
  if (id != null) {
    cancelAnimationFrame(id)
    liveMotionRafByChart.delete(chart)
  }
}

function syncLiveMotionLoop(chart: Chart) {
  const opts = chart.options.plugins?.weatherArcgisGuides
  const enabled = Boolean(
    opts?.liveMotion && (opts.showLiveRangeLine || opts.showNowLine !== false),
  )
  if (!enabled) {
    stopLiveMotionLoop(chart)
    return
  }
  if (liveMotionRafByChart.has(chart)) return
  const loop = () => {
    if (!chart.ctx || chart.canvas.offsetParent === null) {
      stopLiveMotionLoop(chart)
      return
    }
    const motionOn = chart.options.plugins?.weatherArcgisGuides?.liveMotion
    if (!motionOn) {
      stopLiveMotionLoop(chart)
      return
    }
    chart.draw()
    liveMotionRafByChart.set(chart, requestAnimationFrame(loop))
  }
  liveMotionRafByChart.set(chart, requestAnimationFrame(loop))
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType> {
    weatherArcgisGuides?: WeatherArcgisGuidesPluginOptions
  }
}

function drawHorizontalGuide(chart: Chart, guide: WeatherChartHorizontalGuide, mode: AgroThemeMode) {
  const yScale = chart.scales.y
  if (!yScale) return
  const y = yScale.getPixelForValue(guide.value)
  if (!Number.isFinite(y)) return
  const { left, right } = chart.chartArea
  if (!left || !right) return

  const ctx = chart.ctx
  ctx.save()
  ctx.strokeStyle = guide.color
  ctx.lineWidth = 1
  ctx.setLineDash(guide.dash ?? [5, 4])
  ctx.beginPath()
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()

  if (guide.label) {
    ctx.setLineDash([])
    ctx.fillStyle = mode === 'light' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(241, 245, 249, 0.78)'
    ctx.font = '9px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(guide.label, right - 4, y - 3)
  }
  ctx.restore()
}

function drawNowLine(chart: Chart, nowIndex: number, mode: AgroThemeMode) {
  const xScale = chart.scales.x
  if (!xScale) return
  const x = xScale.getPixelForValue(nowIndex)
  if (!Number.isFinite(x)) return
  const { top, bottom } = chart.chartArea
  if (!top || !bottom) return

  const ctx = chart.ctx
  ctx.save()
  ctx.strokeStyle = mode === 'light' ? 'rgba(220, 38, 38, 0.9)' : 'rgba(248, 113, 113, 0.95)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(x, bottom)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.fillStyle = mode === 'light' ? 'rgba(220, 38, 38, 0.92)' : 'rgba(254, 202, 202, 0.95)'
  ctx.font = 'bold 9px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('NOW', x, top + 2)
  ctx.restore()
}

function drawLiveRangeSegment(
  chart: Chart,
  isoLabels: string[],
  liveSeries: Array<number | null | undefined>,
  nowMs: number,
  circular: boolean,
) {
  if (!isoLabels.length || !liveSeries.length) return
  const xScale = chart.scales.x
  const yScale = chart.scales.y
  if (!xScale || !yScale) return
  const { left, right, top, bottom } = chart.chartArea
  if (!left || !right || !top || !bottom) return

  const rangeStartMs = parseWeatherChartAxisTime(floorToOpenMeteoHourIso(nowMs))
  const startIdx = computeWeatherChartNowIndex(isoLabels, rangeStartMs)
  const endIdx = computeWeatherChartNowIndex(isoLabels, nowMs)
  if (startIdx == null || endIdx == null || endIdx <= startIdx) return

  const steps = Math.max(12, Math.ceil((endIdx - startIdx) * 6))

  const ctx = chart.ctx
  ctx.save()
  ctx.beginPath()
  ctx.strokeStyle = WEATHER_CHART_LIVE_RANGE_LINE
  ctx.lineWidth = 2.75
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  let started = false
  for (let s = 0; s <= steps; s++) {
    const idx = startIdx + ((endIdx - startIdx) * s) / steps
    const i0 = Math.min(Math.max(0, Math.floor(idx)), isoLabels.length - 1)
    const i1 = Math.min(i0 + 1, isoLabels.length - 1)
    const frac = idx - i0
    const t0 = parseWeatherChartAxisTime(isoLabels[i0]!)
    const t1 = parseWeatherChartAxisTime(isoLabels[i1]!)
    const sampleMs = Math.min(nowMs, Math.max(rangeStartMs, t0 + (t1 - t0) * frac))
    const val = interpolateWeatherChartValue(isoLabels, liveSeries, sampleMs, { circular })
    if (val == null) continue
    const x = xScale.getPixelForValue(idx)
    const y = yScale.getPixelForValue(val)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  if (started) ctx.stroke()
  ctx.restore()
}

function drawLiveNowDot(chart: Chart, nowIndex: number, value: number, mode: AgroThemeMode) {
  const xScale = chart.scales.x
  const yScale = chart.scales.y
  if (!xScale || !yScale) return
  const x = xScale.getPixelForValue(nowIndex)
  const y = yScale.getPixelForValue(value)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 280)
  const ctx = chart.ctx
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 5 + pulse * 2, 0, Math.PI * 2)
  ctx.fillStyle =
    mode === 'light' ? `rgba(220, 38, 38, ${0.12 + pulse * 0.1})` : `rgba(248, 113, 113, ${0.14 + pulse * 0.12})`
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fillStyle = mode === 'light' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(254, 202, 202, 0.98)'
  ctx.strokeStyle = mode === 'light' ? '#fff' : 'rgba(15, 23, 42, 0.85)'
  ctx.lineWidth = 1.25
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export const weatherArcgisGuidesPlugin: Plugin = {
  id: 'weatherArcgisGuides',
  afterInit(chart) {
    syncLiveMotionLoop(chart)
  },
  beforeUpdate(chart) {
    syncLiveMotionLoop(chart)
  },
  beforeDestroy(chart) {
    stopLiveMotionLoop(chart)
  },
  afterDraw(chart) {
    const opts = chart.options.plugins?.weatherArcgisGuides
    if (!opts) return
    const mode = opts.themeMode ?? 'dark'

    for (const guide of opts.horizontal ?? []) {
      drawHorizontalGuide(chart, guide, mode)
    }

    const isoLabels =
      opts.isoLabels ??
      (chart.data.labels?.filter((l): l is string => typeof l === 'string') ?? [])
    const nowMs = Date.now()
    const nowIndex = opts.liveMotion
      ? computeWeatherChartNowIndex(isoLabels, nowMs)
      : opts.nowIndex

    if (
      opts.showLiveRangeLine &&
      opts.liveMotion &&
      opts.liveSeries?.length &&
      nowIndex != null &&
      Number.isFinite(nowIndex)
    ) {
      drawLiveRangeSegment(chart, isoLabels, opts.liveSeries, nowMs, Boolean(opts.liveSeriesCircular))
    } else {
      if (opts.showNowLine !== false && nowIndex != null && Number.isFinite(nowIndex)) {
        drawNowLine(chart, nowIndex, mode)
      }
      if (opts.liveMotion && opts.liveSeries?.length && nowIndex != null && Number.isFinite(nowIndex)) {
        const liveVal = interpolateWeatherChartValue(isoLabels, opts.liveSeries, nowMs, {
          circular: opts.liveSeriesCircular,
        })
        if (liveVal != null) drawLiveNowDot(chart, nowIndex, liveVal, mode)
      }
    }
  },
}

let registered = false

export function ensureWeatherArcgisGuidesPluginRegistered() {
  if (registered) return
  ChartJS.register(weatherArcgisGuidesPlugin)
  registered = true
}
