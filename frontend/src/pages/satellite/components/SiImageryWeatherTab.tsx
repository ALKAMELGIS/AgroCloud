import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { ImageryTimeAggregation, ImageryTimeSeriesLayerSeries } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  buildWeatherIndexInterpretation,
  primaryIndexSeries,
  weatherMetricDef,
  WEATHER_COMPARE_METRICS,
  type WeatherCompareMetric,
} from '../lib/imageryWeatherCompare'
import {
  buildStormAnalysis,
  buildStormMapOverlay,
  type StormAnalysisResult,
  type SiTsWeatherStormMapOverlay,
  type WeatherStormAnalysisMode,
} from '../lib/imageryStormAnalysis'
import {
  buildTimeSeriesWeatherTimeline,
  type TimeSeriesWeatherBlock,
} from '../lib/timeSeriesReport/timeSeriesWeatherTimeline'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Tooltip,
  Legend,
)

const STORM_ANALYSIS_MODES: Array<{
  id: WeatherStormAnalysisMode
  label: string
  icon: string
}> = [
  { id: 'snow_storm', label: 'Snow Storm', icon: '❄️' },
  { id: 'storm', label: 'Storm', icon: '⛈️' },
]

export type SiImageryWeatherTabProps = {
  active: boolean
  hasRun: boolean
  chartReady: boolean
  geometry: GeoJSON.Geometry | null
  fromDate: string
  toDate: string
  chartLabels: string[]
  displayLabels: string[]
  timeAggregation: ImageryTimeAggregation
  layerSeries: ImageryTimeSeriesLayerSeries[]
  primaryLayerId: string
  fieldLabel: string
  onStormMapOverlayChange?: (overlay: SiTsWeatherStormMapOverlay | null) => void
  stormOverlayDismissEpoch?: number
}

export function SiImageryWeatherTab({
  active,
  hasRun,
  chartReady,
  geometry,
  fromDate,
  toDate,
  chartLabels,
  displayLabels,
  timeAggregation,
  layerSeries,
  primaryLayerId,
  fieldLabel,
  onStormMapOverlayChange,
  stormOverlayDismissEpoch = 0,
}: SiImageryWeatherTabProps) {
  const chartRef = useRef<ChartJS | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const [weatherMetric, setWeatherMetric] = useState<WeatherCompareMetric | null>('temperature')
  const [stormMode, setStormMode] = useState<WeatherStormAnalysisMode | null>(null)

  useEffect(() => {
    if (stormOverlayDismissEpoch > 0) setStormMode(null)
  }, [stormOverlayDismissEpoch])
  const [weatherBlock, setWeatherBlock] = useState<TimeSeriesWeatherBlock | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)

  const indexSeries = useMemo(
    () => primaryIndexSeries(layerSeries, primaryLayerId),
    [layerSeries, primaryLayerId],
  )

  useEffect(() => {
    if (!active || !hasRun || !chartReady || !geometry || !chartLabels.length) {
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setWeatherLoading(true)
    setWeatherError(null)
    void (async () => {
      try {
        const block = await buildTimeSeriesWeatherTimeline({
          geometry,
          fromDate,
          toDate,
          chartLabels,
          displayLabels,
          timeAggregation,
          layerSeries,
        })
        if (cancelled || ac.signal.aborted) return
        setWeatherBlock(block)
        if (!block) setWeatherError('Weather data unavailable for this AOI and date range.')
      } catch (err) {
        if (!cancelled && !ac.signal.aborted) {
          setWeatherBlock(null)
          setWeatherError(err instanceof Error ? err.message : 'Failed to load weather data')
        }
      } finally {
        if (!cancelled) setWeatherLoading(false)
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [
    active,
    hasRun,
    chartReady,
    geometry,
    fromDate,
    toDate,
    chartLabels,
    displayLabels,
    timeAggregation,
    layerSeries,
  ])

  const stormAnalysis = useMemo((): StormAnalysisResult | null => {
    if (!stormMode || !weatherBlock?.hourlyPoints.length) return null
    return buildStormAnalysis(
      stormMode,
      weatherBlock.hourlyPoints,
      chartLabels,
      displayLabels,
      timeAggregation,
      geometry,
    )
  }, [stormMode, weatherBlock, chartLabels, displayLabels, timeAggregation, geometry])

  useEffect(() => {
    if (!active) {
      onStormMapOverlayChange?.(null)
      return
    }
    onStormMapOverlayChange?.(buildStormMapOverlay(stormAnalysis, geometry))
  }, [active, stormAnalysis, geometry, onStormMapOverlayChange])

  useEffect(() => {
    return () => onStormMapOverlayChange?.(null)
  }, [onStormMapOverlayChange])

  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => chartRef.current?.resize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [weatherMetric, stormMode, weatherBlock, chartReady, stormAnalysis])

  const toggleMetric = (id: WeatherCompareMetric) => {
    setStormMode(null)
    setWeatherMetric(prev => (prev === id ? null : id))
  }

  const toggleStormMode = (id: WeatherStormAnalysisMode) => {
    setWeatherMetric(null)
    setStormMode(prev => (prev === id ? null : id))
  }

  const interpretation = useMemo(() => {
    if (stormAnalysis) return stormAnalysis.interpretation
    if (!weatherMetric || !weatherBlock || !indexSeries) return ''
    return buildWeatherIndexInterpretation(
      weatherMetric,
      weatherBlock.points,
      indexSeries.layerId,
      indexSeries.values,
      weatherBlock.summary,
    )
  }, [stormAnalysis, weatherMetric, weatherBlock, indexSeries])

  const compareChart = useMemo((): {
    data: ChartData<'line' | 'bar'>
    options: ChartOptions<'line' | 'bar'>
  } | null => {
    if (stormAnalysis) {
      const labels = stormAnalysis.events.map(e => e.displayLabel)
      const intensities = stormAnalysis.events.map(e => (e.intensity > 0 ? e.intensity : null))
      const secondary =
        stormAnalysis.mode === 'snow_storm'
          ? stormAnalysis.events.map(e => e.snowfallMm)
          : stormAnalysis.events.map(e => e.precipitationMm)
      const hasData = intensities.some(v => v != null)
      if (!hasData) return null
      const secondaryLabel = stormAnalysis.mode === 'snow_storm' ? 'Snowfall (mm)' : 'Precipitation (mm)'
      const secondaryColor = stormAnalysis.mode === 'snow_storm' ? '#7dd3fc' : '#60a5fa'
      return {
        data: {
          labels,
          datasets: [
            {
              type: 'bar' as const,
              label: stormAnalysis.mode === 'snow_storm' ? 'Storm intensity' : 'Storm severity',
              data: intensities,
              borderColor: stormAnalysis.mapLineColor,
              backgroundColor: `${stormAnalysis.mapFillColor}aa`,
              borderWidth: 1,
              yAxisID: 'yStorm',
              order: 2,
            },
            {
              type: 'line' as const,
              label: secondaryLabel,
              data: secondary,
              borderColor: secondaryColor,
              backgroundColor: secondaryColor,
              borderWidth: 2,
              pointRadius: 2.5,
              tension: 0.25,
              yAxisID: 'ySecondary',
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 9 }, padding: 12 },
            },
            tooltip: {
              bodyFont: { size: 10 },
              titleFont: { size: 10 },
            },
          },
          scales: {
            x: {
              ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 20, font: { size: 9 } },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
            yStorm: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 100,
              title: {
                display: true,
                text: 'Intensity (0–100)',
                color: stormAnalysis.mapLineColor,
                font: { size: 10, weight: 'bold' },
              },
              ticks: { color: stormAnalysis.mapLineColor, font: { size: 9 } },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
            ySecondary: {
              type: 'linear',
              position: 'right',
              title: {
                display: true,
                text: secondaryLabel,
                color: secondaryColor,
                font: { size: 10, weight: 'bold' },
              },
              ticks: { color: secondaryColor, font: { size: 9 } },
              grid: { drawOnChartArea: false },
            },
          },
        },
      }
    }

    if (!weatherMetric || !weatherBlock || !indexSeries) return null
    const def = weatherMetricDef(weatherMetric)
    const labels = weatherBlock.points.map(p => p.displayLabel)
    const weatherValues = weatherBlock.points.map(p => {
      const v = def.pick(p)
      return v != null && Number.isFinite(v) ? v : null
    })
    const indexValues = indexSeries.values.map(v =>
      v != null && Number.isFinite(v) ? Number(v) : null,
    )
    const hasWeather = weatherValues.some(v => v != null)
    const hasIndex = indexValues.some(v => v != null)
    if (!hasWeather || !hasIndex) return null

    const useBar = weatherMetric === 'rainfall'
    const indexColor = '#6ee7b7'

    return {
      data: {
        labels,
        datasets: [
          {
            type: useBar ? 'bar' : 'line',
            label: `${def.label} (${def.unit})`,
            data: weatherValues,
            borderColor: def.color,
            backgroundColor: useBar ? `${def.color}88` : def.color,
            borderWidth: useBar ? 1 : 2,
            pointRadius: useBar ? 0 : 2.5,
            tension: 0.25,
            yAxisID: 'yWeather',
            order: 2,
          },
          {
            type: 'line' as const,
            label: `${indexSeries.layerId.toUpperCase()} index`,
            data: indexValues,
            borderColor: indexColor,
            backgroundColor: indexColor,
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.25,
            yAxisID: 'yIndex',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 9 }, padding: 12 },
          },
          tooltip: {
            bodyFont: { size: 10 },
            titleFont: { size: 10 },
            callbacks: {
              label(ctx) {
                const v = ctx.parsed.y
                if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label}: —`
                if (ctx.dataset.yAxisID === 'yIndex') {
                  return `${ctx.dataset.label}: ${v.toFixed(3)}`
                }
                return `${ctx.dataset.label}: ${v.toFixed(weatherMetric === 'humidity' ? 0 : weatherMetric === 'wind' ? 2 : 1)}${def.unit}`
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#94a3b8',
              maxRotation: 45,
              minRotation: 20,
              font: { size: 9 },
              autoSkip: true,
              maxTicksLimit: 12,
            },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          yWeather: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: `${def.label} (${def.unit})`,
              color: def.color,
              font: { size: 10, weight: 'bold' },
            },
            ticks: { color: def.color, font: { size: 9 } },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          yIndex: {
            type: 'linear',
            position: 'right',
            min: -0.2,
            max: 1,
            title: {
              display: true,
              text: `${indexSeries.layerId.toUpperCase()} (0–1)`,
              color: indexColor,
              font: { size: 10, weight: 'bold' },
            },
            ticks: { color: indexColor, font: { size: 9 } },
            grid: { drawOnChartArea: false },
          },
        },
      },
    }
  }, [stormAnalysis, weatherMetric, weatherBlock, indexSeries])

  const compareChartType: 'bar' | 'line' =
    stormAnalysis || weatherMetric === 'rainfall' ? 'bar' : 'line'

  const stormChartHasData =
    !!stormAnalysis && stormAnalysis.events.some(event => event.intensity > 0)

  if (!hasRun || !chartReady) {
    return (
      <div className="acp-ts__placeholder acp-ts__placeholder--weather">
        Run imagery analysis first — weather comparison uses the same AOI and date range as the satellite chart.
      </div>
    )
  }

  const showStormSummary =
    stormAnalysis && stormChartHasData && stormAnalysis.peakEvent && stormAnalysis.peakEvent.severity !== 'none'

  return (
    <div className="acp-ts__weather">
      <div className="acp-ts__weather-toolbar">
        <span className="acp-ts__weather-toolbar-label">Weather parameters</span>
        <div className="acp-ts__weather-toggles" role="group" aria-label="Weather parameters">
          {WEATHER_COMPARE_METRICS.map(metric => (
            <button
              key={metric.id}
              type="button"
              className={'acp-ts__weather-toggle' + (weatherMetric === metric.id ? ' is-on' : '')}
              aria-pressed={weatherMetric === metric.id}
              onClick={() => toggleMetric(metric.id)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="acp-ts__weather-toolbar acp-ts__weather-toolbar--storms">
        <span className="acp-ts__weather-toolbar-label">Storm analysis</span>
        <div className="acp-ts__weather-toggles" role="group" aria-label="Storm analysis">
          {STORM_ANALYSIS_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              className={
                'acp-ts__weather-toggle acp-ts__weather-toggle--storm' +
                (stormMode === mode.id ? ' is-on' : '') +
                (mode.id === 'snow_storm' ? ' acp-ts__weather-toggle--snow' : ' acp-ts__weather-toggle--thunder')
              }
              aria-pressed={stormMode === mode.id}
              onClick={() => toggleStormMode(mode.id)}
            >
              <span aria-hidden="true">{mode.icon}</span> {mode.label}
            </button>
          ))}
        </div>
      </div>

      {weatherBlock ? (
        <div className="acp-ts__meta acp-ts__meta--weather">
          <span>
            {fieldLabel} · {fromDate} → {toDate} · {weatherBlock.dataSource}
          </span>
          <span>
            Avg {weatherBlock.summary.avgTemperatureC?.toFixed(1) ?? '—'}°C ·{' '}
            {weatherBlock.summary.totalRainfallMm?.toFixed(1) ?? '—'} mm rain ·{' '}
            {weatherBlock.summary.avgHumidityPct?.toFixed(0) ?? '—'}% humid ·{' '}
            {weatherBlock.summary.avgWindSpeedMs?.toFixed(2) ?? '—'} m/s wind
          </span>
        </div>
      ) : null}

      {showStormSummary && stormAnalysis ? (
        <div className="acp-ts__weather-storm-summary" role="status">
          <div className="acp-ts__weather-storm-summary-head">
            <strong>
              {stormAnalysis.mode === 'snow_storm' ? '❄️ Snow Storm' : '⛈️ Storm'} — peak{' '}
              {stormAnalysis.summary.maxIntensity}/100 ({stormAnalysis.summary.peakSeverity})
            </strong>
          </div>
          <dl className="acp-ts__weather-storm-stats">
            {stormAnalysis.mode === 'snow_storm' ? (
              <>
                <div>
                  <dt>Snowfall rate</dt>
                  <dd>{stormAnalysis.peakEvent?.snowfallMm?.toFixed(1) ?? '—'} mm</dd>
                </div>
                <div>
                  <dt>Temperature</dt>
                  <dd>{stormAnalysis.peakEvent?.temperatureC?.toFixed(1) ?? '—'}°C</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Precipitation</dt>
                  <dd>{stormAnalysis.peakEvent?.precipitationMm?.toFixed(1) ?? '—'} mm</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>{stormAnalysis.summary.peakSeverity}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Wind speed</dt>
              <dd>{stormAnalysis.peakEvent?.windSpeedMs?.toFixed(2) ?? '—'} m/s</dd>
            </div>
            <div>
              <dt>Affected area</dt>
              <dd>{stormAnalysis.summary.affectedAreaHa?.toFixed(1) ?? '—'} ha</dd>
            </div>
          </dl>
          <div className="acp-ts__weather-legend" aria-label="Storm layer legend">
            <span className="acp-ts__weather-legend-title">Map layer legend</span>
            <ul className="acp-ts__weather-legend-list">
              {stormAnalysis.legend.map(item => (
                <li key={item.label}>
                  <span className="acp-ts__weather-legend-swatch" style={{ background: item.color }} />
                  <span className="acp-ts__weather-legend-label">{item.label}</span>
                  <span className="acp-ts__weather-legend-range">{item.rangeLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="acp-ts__chart-wrap acp-ts__chart-wrap--weather" ref={chartWrapRef}>
        {weatherLoading ? (
          <div className="acp-ts__skeleton acp-ts__skeleton--atomic" role="status" aria-busy="true">
            <div className="acp-ts__skeleton-spinner" aria-hidden="true">
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <p className="acp-ts__skeleton-status">Loading AOI weather…</p>
          </div>
        ) : weatherError ? (
          <div className="acp-ts__placeholder acp-ts__placeholder--weather">{weatherError}</div>
        ) : !weatherMetric && !stormMode ? (
          <div className="acp-ts__placeholder acp-ts__placeholder--weather">
            Enable a weather parameter or storm analysis above to compare with {primaryLayerId.toUpperCase()}.
          </div>
        ) : compareChart ? (
          <Chart
            key={`${stormMode ?? 'none'}-${weatherMetric ?? 'none'}-${compareChartType}`}
            ref={chartRef as never}
            type={compareChartType}
            data={compareChart.data}
            options={compareChart.options}
          />
        ) : (
          <div className="acp-ts__placeholder acp-ts__placeholder--weather">
            {stormMode
              ? `No ${stormMode === 'snow_storm' ? 'snow storm' : 'storm'} events detected for this AOI period.`
              : `No overlapping weather and ${primaryLayerId.toUpperCase()} observations for this period.`}
          </div>
        )}
      </div>

      {(weatherMetric || stormMode) && interpretation ? (
        <div className="acp-ts__weather-interpret" role="status">
          <div className="acp-ts__weather-interpret-head">
            <i
              className={
                stormMode === 'snow_storm'
                  ? 'fa-solid fa-snowflake'
                  : stormMode === 'storm'
                    ? 'fa-solid fa-cloud-bolt'
                    : 'fa-solid fa-cloud-sun-rain'
              }
              aria-hidden="true"
            />
            <strong>
              {stormMode
                ? `${stormMode === 'snow_storm' ? 'Snow Storm' : 'Storm'} analysis`
                : `Weather ↔ ${indexSeries?.layerId.toUpperCase() ?? primaryLayerId} interpretation`}
            </strong>
          </div>
          <p>{interpretation}</p>
          {!stormMode && weatherBlock?.correlationNotes.length ? (
            <ul className="acp-ts__weather-notes">
              {weatherBlock.correlationNotes.slice(0, 2).map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
