import { renderExcelTrendCharts } from './timeSeriesExcelChartRenderer'
import { renderWeatherTimelineChart } from './timeSeriesWeatherChartRenderer'
import type { TimeSeriesMapSnapshot, TimeSeriesReportPayload } from './timeSeriesReportTypes'
import type { VegetationCoveragePoint } from './vegetationCoverageTimeline'
import { latestVegetationCoverageSummary } from './vegetationCoverageTimeline'

export type DocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type DocxMapLayerBlock = {
  title: string
  legend: string
  narrative: string
  snapshots: Array<{ date: string; label: string; rId: string }>
}

export type TimeSeriesDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  fieldName: string
  areaHa: string
  periodLabel: string
  obsCount: number
  totalPeriods: number
  layerIdsLabel: string
  latestAcquisition: string
  satelliteSource: string
  vigorSummary: string
  dataCompleteness: string
  executiveSummary: string
  vigorSection: string
  moistureSection: string
  healthSummary: string
  periodStatsHeaders: string[]
  periodStatsRows: string[][]
  flagsLine: string
  vegCoverageRows: string[][]
  vegCoverageNote: string
  dataQualityNotes: string
  recommendations: string[]
  mapLayers: DocxMapLayerBlock[]
  chartImages: Array<{ title: string; rId: string }>
  weatherChartRId: string | null
  weatherSummaryRows: Array<[string, string]>
  weatherTableHeaders: string[]
  weatherTableRows: string[][]
  weatherCorrelationNotes: string[]
  weatherDataSource: string
  footerNote: string
}

function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function observationCount(payload: TimeSeriesReportPayload): number {
  return payload.charts.labels.filter((_, i) =>
    payload.charts.series.some(s => {
      const v = s.values[i]
      return v != null && Number.isFinite(v)
    }),
  ).length
}

function latestValue(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

function meanValue(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const v = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
  const sd = Math.sqrt(v)
  return Number.isFinite(sd) ? sd : null
}

function linearSlope(values: Array<number | null>): number | null {
  const pts: Array<{ x: number; y: number }> = []
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) pts.push({ x: i, y: v })
  })
  if (pts.length < 2) return null
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.x, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return null
  return (n * sumXY - sumX * sumY) / denom
}

function lastFourWeekTrend(values: Array<number | null>): string {
  const tail = values.slice(-4).filter((v): v is number => v != null && Number.isFinite(v))
  if (tail.length < 2) return 'Stable'
  const slope = linearSlope(tail)
  if (slope == null) return 'Stable'
  if (slope > 0.01) return 'Increasing'
  if (slope < -0.01) return 'Decreasing'
  return 'Stable'
}

function layerTitle(layerId: string): string {
  const u = layerId.trim().toUpperCase()
  if (u === 'NDVI') return 'NDVI — Vegetation Vigor — All Acquisition Dates'
  if (u === 'NDMI') return 'NDMI — Canopy Moisture — All Acquisition Dates'
  if (u === 'NDWI') return 'NDWI — Surface Water / Moisture — All Acquisition Dates'
  if (u === 'SAVI') return 'SAVI — Soil-Adjusted Vegetation — All Acquisition Dates'
  return `${u} — All Acquisition Dates`
}

function nextRid(start: number, offset: number): string {
  return `rIdImg${start + offset}`
}

function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64.replace(/^data:image\/\w+;base64,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function aggregationLabel(agg: string): string {
  if (agg === 'week') return 'Weekly'
  if (agg === 'month') return 'Monthly'
  if (agg === 'year') return 'Yearly'
  return 'Daily'
}

function fmtWeather(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}${suffix}`
}

export async function buildTimeSeriesDocxModel(
  payload: TimeSeriesReportPayload,
): Promise<{ model: TimeSeriesDocxModel; images: DocxImageAsset[] }> {
  const exec = payload.executive
  const layers = payload.charts.series
  const obs = observationCount(payload)
  const periodLabel = `${payload.period.from} to ${payload.period.to}`
  const layerIds = layers.map(s => s.layerId.toUpperCase())
  const ndviSeries = layers.find(s => s.layerId.toUpperCase() === 'NDVI')
  const ndmiSeries = layers.find(s => s.layerId.toUpperCase() === 'NDMI')

  const statRows: Array<[string, (values: Array<number | null>) => number | null]> = [
    ['Mean', meanValue],
    ['Min', values => {
      const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
      return nums.length ? Math.min(...nums) : null
    }],
    ['Max', values => {
      const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
      return nums.length ? Math.max(...nums) : null
    }],
    ['Std Dev', values => stdDev(values.filter((v): v is number => v != null && Number.isFinite(v))),
    ],
    ['Latest (' + payload.period.acquisitionDate + ')', latestValue],
    ['Trend (slope/period)', linearSlope],
  ]

  const periodStatsRows = statRows.map(([label, fn]) => [
    label,
    ...layers.map(s => {
      const v = fn(s.values)
      return v == null ? '—' : fmtNum(v, 4)
    }),
  ])

  const ndviStat = payload.statistics.find(s => s.layerId.toUpperCase() === 'NDVI')
  const vigorFlag =
    ndviStat?.mean != null && ndviStat.mean < 0.35
      ? 'Stress Alert'
      : ndviStat?.mean != null && ndviStat.mean >= 0.55
        ? 'Healthy'
        : 'Moderate'
  const moistureFlag =
    ndmiSeries && latestValue(ndmiSeries.values) != null && latestValue(ndmiSeries.values)! < 0.15
      ? 'Water-Limited'
      : 'Adequate'

  const vegTimeline = payload.vegetationCoverageTimeline ?? []
  const latestVeg = latestVegetationCoverageSummary(vegTimeline)
  const vigorSummary =
    exec.indexKpis.find(k => k.label.includes('NDVI'))?.sublabel ??
    latestVeg?.dominantClass ??
    exec.cropHealth

  const vegCoverageRows =
    vegTimeline.length > 0
      ? vegTimeline.map((p: VegetationCoveragePoint) => [
          p.date,
          p.ndviMean != null ? fmtNum(p.ndviMean, 4) : '—',
          `${p.vegetationCoveragePct.toFixed(1)}%`,
          p.vegetationAreaHa >= 100 ? p.vegetationAreaHa.toFixed(1) : p.vegetationAreaHa.toFixed(2),
          p.dominantClass,
        ])
      : []

  const images: DocxImageAsset[] = []
  let imageCounter = 0

  const labels = payload.charts.displayLabels.length ? payload.charts.displayLabels : payload.charts.labels
  const chartPairs = await renderExcelTrendCharts(
    labels,
    layers.map(s => ({ layerId: s.layerId, values: s.values as Array<number | null> })),
  )

  const chartImages: Array<{ title: string; rId: string }> = []
  for (const chart of chartPairs) {
    const rId = nextRid(1, imageCounter)
    imageCounter++
    images.push({
      rId,
      fileName: `image${imageCounter}.png`,
      base64: chart.base64,
    })
    chartImages.push({ title: chart.title, rId })
  }

  let weatherChartRId: string | null = null
  const weatherTableHeaders = ['Period', 'Temp (°C)', 'Humidity (%)', 'Rainfall (mm)', 'Wind (m/s)']
  const weatherTableRows: string[][] = []
  const weatherSummaryRows: Array<[string, string]> = []
  const weatherCorrelationNotes: string[] = []
  let weatherDataSource = ''

  const weather = payload.weatherTimeline
  if (weather?.points.length) {
    weatherDataSource = `${weather.dataSource} · ${weather.lat.toFixed(4)}, ${weather.lng.toFixed(4)} (${weather.timezone})`
    weatherTableRows.push(
      ...weather.points.map(p => [
        p.displayLabel,
        fmtWeather(p.temperatureC, 1),
        fmtWeather(p.humidityPct, 0),
        fmtWeather(p.rainfallMm, 1),
        fmtWeather(p.windSpeedMs, 2),
      ]),
    )
    weatherSummaryRows.push(
      ['Average temperature', fmtWeather(weather.summary.avgTemperatureC, 1, ' °C')],
      ['Total rainfall', fmtWeather(weather.summary.totalRainfallMm, 1, ' mm')],
      ['Average humidity', fmtWeather(weather.summary.avgHumidityPct, 0, ' %')],
      ['Average wind speed', fmtWeather(weather.summary.avgWindSpeedMs, 2, ' m/s')],
      ['Aggregation', aggregationLabel(weather.aggregation)],
    )
    weatherCorrelationNotes.push(...weather.correlationNotes)

    const weatherBase64 = renderWeatherTimelineChart(
      weather.points,
      aggregationLabel(weather.aggregation),
    )
    if (weatherBase64) {
      weatherChartRId = nextRid(1, imageCounter)
      imageCounter++
      images.push({
        rId: weatherChartRId,
        fileName: `image${imageCounter}.png`,
        base64: weatherBase64,
      })
    }
  }

  const mapLayers: DocxMapLayerBlock[] = []
  for (const group of payload.mapSnapshotGroups ?? []) {
    const snapshots: DocxMapLayerBlock['snapshots'] = []
    for (const snap of group.snapshots) {
      if (!snap.imageBase64) continue
      const rId = nextRid(1, imageCounter)
      imageCounter++
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: snap.imageBase64 })
      snapshots.push({
        date: snap.sceneDate,
        label: `${snap.layerId.toUpperCase()} ${fmtNum(snap.mean, 4)}`,
        rId,
      })
    }
    if (!snapshots.length) continue
    const legend = group.snapshots[0]?.legendText ?? ''
    const narrative = group.snapshots[group.snapshots.length - 1]?.notes ?? exec.multiIndexNotes
    mapLayers.push({
      title: layerTitle(group.layerId),
      legend,
      narrative,
      snapshots,
    })
  }

  const model: TimeSeriesDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC',
    fieldName: payload.location.fieldName,
    areaHa: fmtHa(payload.location.areaHa),
    periodLabel,
    obsCount: obs,
    totalPeriods: payload.charts.labels.length,
    layerIdsLabel: payload.layerIds.join(', '),
    latestAcquisition: payload.period.acquisitionDate,
    satelliteSource: 'Sentinel-2 (Sentinel Hub)',
    vigorSummary,
    dataCompleteness: `${obs} of ${payload.charts.labels.length} periods`,
    executiveSummary: exec.narrative,
    vigorSection: `${exec.cropHealth} ${exec.vegetationTrend}`,
    moistureSection: exec.moistureStatus,
    healthSummary: `${exec.stressAssessment} ${exec.multiIndexNotes}`,
    periodStatsHeaders: ['Metric', ...layerIds],
    periodStatsRows,
    flagsLine: `Vigor Flag: ${vigorFlag}   ·   Moisture Flag: ${moistureFlag}   ·   NDVI Trend (last 4 weeks): ${ndviSeries ? lastFourWeekTrend(ndviSeries.values) : 'Stable'}`,
    vegCoverageRows,
    vegCoverageNote:
      'Coverage is calculated independently for each acquisition date. NDVI classification: Healthy / Moderate / Stress = Vegetation; Critical = Bare.',
    dataQualityNotes: `Analysis uses ${payload.layerIds.join(', ')} indices derived from Sentinel Hub statistics. All index values are derived from source imagery statistics. Week numbers are ISO week labels parsed from the period column; gaps indicate weeks with no available scene or observation.${
      exec.ndwiEstimated || exec.saviEstimated
        ? ' NDWI and/or SAVI values marked with * are estimated from available NDVI/NDMI where raw band reflectance was not exported.'
        : ''
    }`,
    recommendations: exec.recommendations,
    mapLayers,
    chartImages,
    weatherChartRId,
    weatherSummaryRows,
    weatherTableHeaders,
    weatherTableRows,
    weatherCorrelationNotes,
    weatherDataSource,
    footerNote: `Generated ${payload.generatedAt.replace('T', ' ').slice(0, 19)} UTC by ${payload.projectName}. Analytics Summary and Time Series Data summarize AOI statistics; Weather Timeline uses ERA5 reanalysis at the AOI centroid; Map Snapshots shows per-index timeline maps aligned with the chart.`,
  }

  return { model, images }
}

export { base64ToUint8 }
