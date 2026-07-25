import {
  buildPerLayerNativeChartSpecs,
  buildWeatherNativeChartSpecs,
  buildVegetationCoverageTimelineChartSpecs,
  buildVegetationCoverageChartInterpretation,
  resolveIndexChartColor,
  type DocxNativeChartSpec,
} from './timeSeriesDocxNativeCharts'
import { buildCorrelationScatterNativeChartSpec } from './timeSeriesScatterChartRenderer'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import type { VegetationCoveragePoint } from './vegetationCoverageTimeline'
import { latestVegetationCoverageSummary } from './vegetationCoverageTimeline'
import {
  alignIndexValuesToDates,
  aggregateTempExtremesByPeriods,
  buildDailyWeatherRichFromHourly,
  buildMonthlyWeatherRows,
  buildYearlyWeatherRows,
  fmtWeatherCell,
  sampleDailyRows,
} from './timeSeriesWeatherAnalytics'

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
  /** Native editable Word chart for this index (under the maps). */
  chartRId: string | null
  chartTitle: string | null
}

/** Per-year LULC map + composition table + native pie/bar charts. */
export type DocxLulcYearBlock = {
  year: number
  title: string
  mapRId: string | null
  mapCaption: string
  totalAreaHa: string
  tableHeaders: string[]
  tableRows: string[][]
  pieChartRId: string | null
  pieChartTitle: string | null
  barChartRId: string | null
  barChartTitle: string | null
}

/** Consecutive-year LULC change: before/after maps + Δ table + bar chart. */
export type DocxLulcChangeBlock = {
  title: string
  yearFrom: number
  yearTo: number
  mapBeforeRId: string | null
  mapAfterRId: string | null
  mapBeforeCaption: string
  mapAfterCaption: string
  tableHeaders: string[]
  tableRows: string[][]
  barChartRId: string | null
  barChartTitle: string | null
}

/** Index Change Detection pair: T0/T1 maps + comparison table + native charts. */
export type DocxIndexChangeBlock = {
  title: string
  layerId: string
  legend: string
  narrative: string
  snapshots: Array<{ date: string; label: string; rId: string }>
  tableHeaders: string[]
  tableRows: string[][]
  compareChartRId: string | null
  compareChartTitle: string | null
  deltaChartRId: string | null
  deltaChartTitle: string | null
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
  /** Native Office chart(s) under the Vegetation Coverage Timeline table. */
  vegCoverageChartRIds: Array<{ title: string; rId: string; tall?: boolean }>
  vegCoverageChartInterpretation: string
  dataQualityNotes: string
  recommendations: string[]
  mapLayers: DocxMapLayerBlock[]
  lulcMapLayers: DocxMapLayerBlock[]
  /** Rich per-year LULC blocks (map + table + pie + bar). Preferred over raw lulcMapLayers atlas. */
  lulcYearBlocks: DocxLulcYearBlock[]
  /** LULC consecutive-year change blocks with Δha table + bar chart. */
  lulcChangeBlocks: DocxLulcChangeBlock[]
  /** Cross-year class area (ha) comparison table under the LULC intro. */
  lulcMultiYearHeaders: string[]
  lulcMultiYearRows: string[][]
  lulcMultiYearBarChartRId: string | null
  lulcMultiYearBarChartTitle: string | null
  /** @deprecated Prefer indexChangeBlocks (maps + comparison charts). */
  changeDetectionMapLayers: DocxMapLayerBlock[]
  /** Index change pairs with T0/T1 comparison + Δ charts under maps. */
  indexChangeBlocks: DocxIndexChangeBlock[]
  /** @deprecated PNG charts replaced by native charts on mapLayers */
  chartImages: Array<{ title: string; rId: string }>
  nativeCharts: DocxNativeChartSpec[]
  /** Native editable weather charts (Excel-style), not PNG. */
  weatherChartRIds: Array<{ title: string; rId: string; kind?: string; tall?: boolean }>
  /** @deprecated PNG weather chart removed — use weatherChartRIds */
  weatherChartRId: string | null
  weatherSummaryRows: Array<[string, string]>
  weatherTableHeaders: string[]
  weatherTableRows: string[][]
  /** Monthly totals with rainfall share % (for tables under charts). */
  weatherMonthlyHeaders: string[]
  weatherMonthlyRows: string[][]
  weatherYearlyHeaders: string[]
  weatherYearlyRows: string[][]
  weatherCorrelationNotes: string[]
  weatherDataSource: string
  correlationBlocks: Array<{
    title: string
    xLayerId: string
    yLayerId: string
    /** Native editable Word scatter chart. */
    chartRId: string | null
    /** @deprecated PNG fallback */
    rId: string | null
    r2Label: string
    interpretation: string
    valueHeaders: string[]
    valueRows: string[][]
    gisInsight: string
    agroInsight: string
  }>
  cumulativeMapLayers: DocxMapLayerBlock[]
  cropRecommendationBullets: string[]
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
  const indexCharts = buildPerLayerNativeChartSpecs({
    labels: payload.charts.labels,
    displayLabels: labels,
    series: layers.map(s => ({ layerId: s.layerId, values: s.values as Array<number | null> })),
  })
  const chartByLayer = new Map(
    indexCharts.map(c => [(c.series[0]?.name ?? c.title).toUpperCase(), c]),
  )
  const chartImages: Array<{ title: string; rId: string }> = []

  const weatherChartRIds: Array<{ title: string; rId: string; kind?: string; tall?: boolean }> = []
  let weatherChartRId: string | null = null
  const weatherTableHeaders = [
    'Period',
    'Temp Max (°C)',
    'Temp Mean (°C)',
    'Temp Min (°C)',
    'Humidity (%)',
    'Rainfall (mm)',
    'Wind (m/s)',
  ]
  const weatherTableRows: string[][] = []
  const weatherMonthlyHeaders = [
    'Month',
    'Temp Max',
    'Temp Mean',
    'Temp Min',
    'Humidity %',
    'Rainfall mm',
    'Share %',
    'Cumulative mm',
  ]
  const weatherMonthlyRows: string[][] = []
  const weatherYearlyHeaders = [
    'Year',
    'Temp Max',
    'Temp Mean',
    'Temp Min',
    'Humidity %',
    'Rainfall mm',
  ]
  const weatherYearlyRows: string[][] = []
  const weatherSummaryRows: Array<[string, string]> = []
  const weatherCorrelationNotes: string[] = []
  let weatherDataSource = ''

  let weatherCharts: DocxNativeChartSpec[] = []
  const weather = payload.weatherTimeline
  if (weather?.points.length || weather?.hourlyPoints?.length) {
    weatherDataSource = `${weather.dataSource} · ${weather.lat.toFixed(4)}, ${weather.lng.toFixed(4)} (${weather.timezone})`

    const dailyRich = buildDailyWeatherRichFromHourly(weather.hourlyPoints ?? [])
    const monthly = buildMonthlyWeatherRows(dailyRich)
    const yearly = buildYearlyWeatherRows(dailyRich)
    const dailyForCharts = sampleDailyRows(dailyRich, 90)

    const periodExtremes = aggregateTempExtremesByPeriods(
      dailyRich,
      weather.points.map(p => p.periodKey),
      weather.points.map(p => p.displayLabel),
      weather.aggregation,
    )

    if (periodExtremes.length) {
      weatherTableRows.push(
        ...periodExtremes.map((p, i) => [
          p.displayLabel,
          fmtWeather(p.tempMaxC, 1),
          fmtWeather(p.tempMeanC, 1),
          fmtWeather(p.tempMinC, 1),
          fmtWeather(p.humidityPct, 0),
          fmtWeather(p.rainfallMm, 1),
          fmtWeather(weather.points[i]?.windSpeedMs ?? null, 2),
        ]),
      )
    } else {
      weatherTableRows.push(
        ...weather.points.map(p => [
          p.displayLabel,
          fmtWeather(p.temperatureC, 1),
          fmtWeather(p.temperatureC, 1),
          fmtWeather(p.temperatureC, 1),
          fmtWeather(p.humidityPct, 0),
          fmtWeather(p.rainfallMm, 1),
          fmtWeather(p.windSpeedMs, 2),
        ]),
      )
    }

    weatherMonthlyRows.push(
      ...monthly.map(m => [
        m.label,
        fmtWeatherCell(m.tempMaxC, 1),
        fmtWeatherCell(m.tempMeanC, 1),
        fmtWeatherCell(m.tempMinC, 1),
        fmtWeatherCell(m.humidityPct, 0),
        fmtWeatherCell(m.rainfallMm, 1),
        fmtWeatherCell(m.rainfallSharePct, 1),
        fmtWeatherCell(m.cumulativeRainfallMm, 1),
      ]),
    )
    weatherYearlyRows.push(
      ...yearly.map(y => [
        y.label,
        fmtWeatherCell(y.tempMaxC, 1),
        fmtWeatherCell(y.tempMeanC, 1),
        fmtWeatherCell(y.tempMinC, 1),
        fmtWeatherCell(y.humidityPct, 0),
        fmtWeatherCell(y.rainfallMm, 1),
      ]),
    )

    const peakMonth = monthly.reduce<(typeof monthly)[number] | null>((best, row) => {
      if (row.rainfallMm == null) return best
      if (!best || (best.rainfallMm ?? 0) < row.rainfallMm) return row
      return best
    }, null)

    weatherSummaryRows.push(
      ['Average temperature', fmtWeather(weather.summary.avgTemperatureC, 1, ' °C')],
      [
        'Temp range (daily max / min mean)',
        dailyRich.length
          ? `${fmtWeather(
              meanValue(dailyRich.map(d => d.tempMaxC)),
              1,
              ' °C',
            )} / ${fmtWeather(meanValue(dailyRich.map(d => d.tempMinC)), 1, ' °C')}`
          : '—',
      ],
      ['Total rainfall', fmtWeather(weather.summary.totalRainfallMm, 1, ' mm')],
      [
        'Peak rainfall month',
        peakMonth
          ? `${peakMonth.label} (${fmtWeatherCell(peakMonth.rainfallMm, 1)} mm · ${fmtWeatherCell(peakMonth.rainfallSharePct, 1)}%)`
          : '—',
      ],
      ['Average humidity', fmtWeather(weather.summary.avgHumidityPct, 0, ' %')],
      ['Average wind speed', fmtWeather(weather.summary.avgWindSpeedMs, 2, ' m/s')],
      ['Aggregation', aggregationLabel(weather.aggregation)],
      ['Daily / monthly / yearly rows', `${dailyRich.length} / ${monthly.length} / ${yearly.length}`],
    )
    weatherCorrelationNotes.push(...weather.correlationNotes)

    const compareSource =
      monthly.length >= 2
        ? {
            categories: monthly.map(m => m.label),
            dates: monthly.map(m => `${m.monthKey}-15`),
            tempMean: monthly.map(m => m.tempMeanC),
            tempMin: monthly.map(m => m.tempMinC),
            tempMax: monthly.map(m => m.tempMaxC),
            rainfall: monthly.map(m => m.rainfallMm),
            humidity: monthly.map(m => m.humidityPct),
          }
        : {
            categories: periodExtremes.map(p => p.displayLabel),
            dates: weather.points.map(p => (p.periodKey.match(/^\d{4}-\d{2}/) ? `${p.periodKey.slice(0, 7)}-15` : p.periodKey)),
            tempMean: periodExtremes.map(p => p.tempMeanC),
            tempMin: periodExtremes.map(p => p.tempMinC),
            tempMax: periodExtremes.map(p => p.tempMaxC),
            rainfall: periodExtremes.map(p => p.rainfallMm),
            humidity: periodExtremes.map(p => p.humidityPct),
          }

    const alignIdx = (layerId: string) =>
      alignIndexValuesToDates({
        dates: compareSource.dates,
        chartLabels: payload.charts.labels,
        periodAnchorDates: payload.charts.periodAnchorDates ?? {},
        layerSeries: layers,
        layerId,
      })

    weatherCharts = buildWeatherNativeChartSpecs({
      points: weather.points,
      aggregationLabel: aggregationLabel(weather.aggregation),
      startIndex: indexCharts.length,
      daily: dailyForCharts,
      monthly,
      yearly,
      indexCompare: compareSource.categories.length
        ? {
            categories: compareSource.categories,
            tempMean: compareSource.tempMean,
            tempMin: compareSource.tempMin,
            tempMax: compareSource.tempMax,
            rainfall: compareSource.rainfall,
            humidity: compareSource.humidity,
            ndvi: alignIdx('NDVI'),
            ndmi: alignIdx('NDMI'),
            ndwi: alignIdx('NDWI'),
            savi: alignIdx('SAVI'),
          }
        : undefined,
    })
    for (const c of weatherCharts) {
      weatherChartRIds.push({
        title: c.title,
        rId: c.rId,
        kind: c.kind,
        tall: c.kind === 'pie' || c.barDir === 'bar',
      })
    }
  }

  function pushMapGroup(
    group: NonNullable<TimeSeriesReportPayload['mapSnapshotGroups']>[number],
    titleOverride?: string,
    withChart = false,
  ): DocxMapLayerBlock | null {
    const snapshots: DocxMapLayerBlock['snapshots'] = []
    const isLulc = /lulc/i.test(group.layerId)
    for (const snap of group.snapshots) {
      if (!snap.imageBase64) continue
      // Index atlas cards must carry analyzable mean values (skip empty basemap-only leftovers).
      if (!isLulc && (snap.mean == null || !Number.isFinite(snap.mean))) continue
      const rId = nextRid(1, imageCounter)
      imageCounter++
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: snap.imageBase64 })
      snapshots.push({
        date: snap.sceneDate || snap.periodLabel || '',
        label: `${(snap.layerLabel || snap.layerId).replace(/\s+(T0|T1|start|end|cumulative)$/i, '').trim().toUpperCase()} ${fmtNum(snap.mean, 4)}`,
        rId,
      })
    }
    if (!snapshots.length) return null
    const layerKey = group.layerId.replace(/^CUMULATIVE_|^CHANGE_/, '').toUpperCase()
    const chart = withChart
      ? chartByLayer.get(layerKey) ?? chartByLayer.get(group.layerId.toUpperCase())
      : undefined
    return {
      title: titleOverride ?? layerTitle(group.layerId),
      legend: group.snapshots[0]?.legendText ?? '',
      narrative: group.snapshots[group.snapshots.length - 1]?.notes ?? exec.multiIndexNotes,
      snapshots,
      chartRId: chart?.rId ?? null,
      chartTitle: chart?.title ?? null,
    }
  }

  const mapLayers: DocxMapLayerBlock[] = []
  for (const group of payload.mapSnapshotGroups ?? []) {
    const block = pushMapGroup(group, undefined, true)
    if (block) mapLayers.push(block)
  }

  const cumulativeMapLayers: DocxMapLayerBlock[] = []
  for (const group of payload.cumulativeMapSnapshotGroups ?? []) {
    const block = pushMapGroup(group, group.title, false)
    if (block) cumulativeMapLayers.push(block)
  }

  const lulcMapLayers: DocxMapLayerBlock[] = []
  const hasLulcCompositions = (payload.lulcYearCompositions ?? []).length > 0

  const vegCoverageCharts = buildVegetationCoverageTimelineChartSpecs({
    timeline: vegTimeline,
    startIndex: indexCharts.length + weatherCharts.length,
  })
  const vegCoverageChartRIds = vegCoverageCharts.map(c => ({
    title: c.title,
    rId: c.rId,
    tall: c.kind === 'combo' || c.kind === 'line',
  }))
  const vegCoverageChartInterpretation = buildVegetationCoverageChartInterpretation(vegTimeline)

  // Build rich LULC year / change blocks with native pie + area bar charts.
  const lulcCharts: DocxNativeChartSpec[] = []
  let lulcChartN = indexCharts.length + weatherCharts.length + vegCoverageCharts.length
  const stripHex = (hex: string) =>
    hex.replace(/^#/, '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6) || '94A3B8'

  const atlasGroup = (payload.lulcMapSnapshotGroups ?? []).find(g => g.layerId === 'LULC_YEARLY')
  const mapRIdByYear = new Map<number, { rId: string; caption: string }>()
  if (atlasGroup && hasLulcCompositions) {
    for (const snap of atlasGroup.snapshots) {
      if (!snap.imageBase64) continue
      const year = Number(String(snap.periodLabel || snap.sceneDate).slice(0, 4))
      if (!Number.isFinite(year)) continue
      const rId = nextRid(1, imageCounter)
      imageCounter++
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: snap.imageBase64 })
      mapRIdByYear.set(year, {
        rId,
        caption: `${snap.layerLabel || `LULC ${year}`} · ${snap.sceneDate}`,
      })
    }
  } else {
    for (const group of payload.lulcMapSnapshotGroups ?? []) {
      const block = pushMapGroup(group, group.title, false)
      if (block) lulcMapLayers.push(block)
    }
  }

  const lulcYearBlocks: DocxLulcYearBlock[] = []
  for (const yearComp of payload.lulcYearCompositions ?? []) {
    const map = mapRIdByYear.get(yearComp.year)
    const classes = yearComp.classes.filter(c => c.areaHa > 0 || c.pct > 0)
    let pieChartRId: string | null = null
    let pieChartTitle: string | null = null
    let barChartRId: string | null = null
    let barChartTitle: string | null = null
    if (classes.length) {
      lulcChartN += 1
      const pie: DocxNativeChartSpec = {
        rId: `rIdChart${lulcChartN}`,
        fileStem: `chart${lulcChartN}`,
        title: `LULC ${yearComp.year} — Class Share (%)`,
        yAxisLabel: 'Share',
        categories: classes.map(c => c.name),
        kind: 'pie',
        sliceColors: classes.map(c => stripHex(c.color)),
        series: [{ name: 'Share %', values: classes.map(c => c.pct) }],
      }
      lulcCharts.push(pie)
      pieChartRId = pie.rId
      pieChartTitle = pie.title

      lulcChartN += 1
      const bar: DocxNativeChartSpec = {
        rId: `rIdChart${lulcChartN}`,
        fileStem: `chart${lulcChartN}`,
        title: `LULC ${yearComp.year} — Area by Class (ha)`,
        yAxisLabel: 'Area (ha)',
        yNumFmt: '0.00',
        categories: classes.map(c => c.name),
        kind: 'bar',
        series: classes.map(c => ({
          name: c.name,
          values: classes.map(x => (x.key === c.key ? c.areaHa : null)),
          color: stripHex(c.color),
          asBar: true,
        })),
      }
      // Clustered multi-series with nulls is noisy for many classes — single series is clearer.
      bar.series = [
        {
          name: 'Area (ha)',
          values: classes.map(c => c.areaHa),
          color: '047857',
          asBar: true,
        },
      ]
      lulcCharts.push(bar)
      barChartRId = bar.rId
      barChartTitle = bar.title
    }

    const tableRows = classes.map(c => [
      c.name,
      `${c.pct.toFixed(1)}%`,
      fmtHa(c.areaHa),
    ])
    if (classes.length) {
      tableRows.push(['Total', '100%', fmtHa(yearComp.totalAreaHa)])
    }

    lulcYearBlocks.push({
      year: yearComp.year,
      title: `LULC ${yearComp.year} — Mid-season Land Cover`,
      mapRId: map?.rId ?? null,
      mapCaption: map?.caption ?? `LULC ${yearComp.year}`,
      totalAreaHa: fmtHa(yearComp.totalAreaHa),
      tableHeaders: ['LULC Class', 'Share %', 'Area (ha)'],
      tableRows,
      pieChartRId,
      pieChartTitle,
      barChartRId,
      barChartTitle,
    })
  }

  // Cross-year area (ha) matrix + clustered bar for clear year-to-year contrast.
  const yearComps = payload.lulcYearCompositions ?? []
  const lulcMultiYearHeaders: string[] = ['LULC Class', ...yearComps.map(y => String(y.year)), 'Δ first→last (ha)']
  const lulcMultiYearRows: string[][] = []
  let lulcMultiYearBarChartRId: string | null = null
  let lulcMultiYearBarChartTitle: string | null = null
  if (yearComps.length >= 1) {
    const classKeys = new Map<string, { name: string; color: string }>()
    for (const y of yearComps) {
      for (const c of y.classes) {
        if (!classKeys.has(c.key)) classKeys.set(c.key, { name: c.name, color: c.color })
      }
    }
    const yearColors = ['047857', '2563EB', 'D97706', '7C3AED', 'DC2626', '0891B2']
    const ordered = [...classKeys.entries()].sort((a, b) => {
      const maxA = Math.max(...yearComps.map(y => y.classes.find(c => c.key === a[0])?.areaHa ?? 0))
      const maxB = Math.max(...yearComps.map(y => y.classes.find(c => c.key === b[0])?.areaHa ?? 0))
      return maxB - maxA
    })
    for (const [key, meta] of ordered) {
      const haByYear = yearComps.map(y => y.classes.find(c => c.key === key)?.areaHa ?? 0)
      const delta = haByYear.length >= 2 ? haByYear[haByYear.length - 1]! - haByYear[0]! : 0
      lulcMultiYearRows.push([
        meta.name,
        ...haByYear.map(h => fmtHa(h)),
        haByYear.length >= 2 ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ha` : '—',
      ])
    }
    if (ordered.length && yearComps.length) {
      lulcChartN += 1
      const multiBar: DocxNativeChartSpec = {
        rId: `rIdChart${lulcChartN}`,
        fileStem: `chart${lulcChartN}`,
        title: 'LULC Multi-Year Area Comparison (ha)',
        yAxisLabel: 'Area (ha)',
        yNumFmt: '0.00',
        categories: ordered.map(([, m]) => m.name),
        kind: 'bar',
        series: yearComps.map((y, yi) => ({
          name: String(y.year),
          values: ordered.map(([key]) => y.classes.find(c => c.key === key)?.areaHa ?? 0),
          color: yearColors[yi % yearColors.length]!,
          asBar: true,
        })),
      }
      lulcCharts.push(multiBar)
      lulcMultiYearBarChartRId = multiBar.rId
      lulcMultiYearBarChartTitle = multiBar.title
    }
  }

  const lulcChangeBlocks: DocxLulcChangeBlock[] = []
  for (const change of payload.lulcChangeCompositions ?? []) {
    const before = mapRIdByYear.get(change.yearFrom)
    const after = mapRIdByYear.get(change.yearTo)
    const classes = change.classes
    let barChartRId: string | null = null
    let barChartTitle: string | null = null
    if (classes.length) {
      lulcChartN += 1
      const bar: DocxNativeChartSpec = {
        rId: `rIdChart${lulcChartN}`,
        fileStem: `chart${lulcChartN}`,
        title: `LULC Change ${change.yearFrom}→${change.yearTo} — Δ Area (ha)`,
        yAxisLabel: 'Δ Area (ha)',
        yNumFmt: '0.00',
        categories: classes.map(c => c.name),
        kind: 'bar',
        series: [
          {
            name: 'Δ Area (ha)',
            values: classes.map(c => c.deltaHa),
            color: '2563EB',
            asBar: true,
          },
        ],
      }
      lulcCharts.push(bar)
      barChartRId = bar.rId
      barChartTitle = bar.title
    }
    const tableRows = classes.map(c => [
      c.name,
      fmtHa(c.areaHaFrom),
      fmtHa(c.areaHaTo),
      `${c.deltaHa >= 0 ? '+' : ''}${c.deltaHa.toFixed(2)} ha`,
      `${c.deltaPctPoints >= 0 ? '+' : ''}${c.deltaPctPoints.toFixed(1)} pp`,
    ])
    lulcChangeBlocks.push({
      title: `LULC Change Detection — ${change.yearFrom} → ${change.yearTo}`,
      yearFrom: change.yearFrom,
      yearTo: change.yearTo,
      mapBeforeRId: before?.rId ?? null,
      mapAfterRId: after?.rId ?? null,
      mapBeforeCaption: before?.caption ?? `LULC ${change.yearFrom} (before)`,
      mapAfterCaption: after?.caption ?? `LULC ${change.yearTo} (after)`,
      tableHeaders: [
        'Class',
        `${change.yearFrom} (ha)`,
        `${change.yearTo} (ha)`,
        'Δ Area',
        'Δ Share',
      ],
      tableRows,
      barChartRId,
      barChartTitle,
    })
  }

  const changeDetectionMapLayers: DocxMapLayerBlock[] = []
  const indexChangeBlocks: DocxIndexChangeBlock[] = []
  const indexChangeCharts: DocxNativeChartSpec[] = []
  let indexChangeChartN = indexCharts.length + weatherCharts.length + vegCoverageCharts.length + lulcCharts.length

  for (const group of payload.changeDetectionMapSnapshotGroups ?? []) {
    const snaps = group.snapshots.filter(s => !!s.imageBase64)
    if (snaps.length < 2) continue
    const t0 = snaps[0]!
    const t1 = snaps[snaps.length - 1]!
    const mean0 = t0.mean
    const mean1 = t1.mean
    const delta =
      mean0 != null && mean1 != null && Number.isFinite(mean0) && Number.isFinite(mean1)
        ? mean1 - mean0
        : null
    const layerKey = group.layerId.replace(/^CHANGE_/, '').replace(/_\d+_\d+$/, '').toUpperCase()

    const snapRefs: DocxIndexChangeBlock['snapshots'] = []
    for (const snap of snaps) {
      const rId = nextRid(1, imageCounter)
      imageCounter++
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: snap.imageBase64! })
      snapRefs.push({
        date: snap.sceneDate || snap.periodLabel || '',
        label: `${layerKey} ${fmtNum(snap.mean, 4)}`,
        rId,
      })
    }

    let compareChartRId: string | null = null
    let compareChartTitle: string | null = null
    let deltaChartRId: string | null = null
    let deltaChartTitle: string | null = null

    if (mean0 != null && mean1 != null && Number.isFinite(mean0) && Number.isFinite(mean1)) {
      indexChangeChartN += 1
      const cat0 = t0.periodLabel || `${t0.sceneDate} (T0)`
      const cat1 = t1.periodLabel || `${t1.sceneDate} (T1)`
      const compare: DocxNativeChartSpec = {
        rId: `rIdChart${indexChangeChartN}`,
        fileStem: `chart${indexChangeChartN}`,
        title: `${layerKey} Change Detection — ${cat0} vs ${cat1}`,
        yAxisLabel: `${layerKey} mean`,
        yNumFmt: '0.0000',
        categories: [cat0, cat1],
        kind: 'bar',
        hideLegend: true,
        series: [
          {
            name: `${layerKey} AOI mean`,
            values: [mean0, mean1],
            color: resolveIndexChartColor(layerKey),
            asBar: true,
          },
        ],
      }
      indexChangeCharts.push(compare)
      compareChartRId = compare.rId
      compareChartTitle = compare.title

      if (delta != null) {
        indexChangeChartN += 1
        const deltaChart: DocxNativeChartSpec = {
          rId: `rIdChart${indexChangeChartN}`,
          fileStem: `chart${indexChangeChartN}`,
          title: `${layerKey} Δ Change (${cat0} → ${cat1})`,
          yAxisLabel: `Δ ${layerKey}`,
          yNumFmt: '0.0000',
          categories: [`Δ ${layerKey}`],
          kind: 'bar',
          hideLegend: true,
          series: [
            {
              name: 'Δ mean',
              values: [delta],
              color: delta >= 0 ? '2563EB' : 'DC2626',
              asBar: true,
            },
          ],
        }
        indexChangeCharts.push(deltaChart)
        deltaChartRId = deltaChart.rId
        deltaChartTitle = deltaChart.title
      }
    }

    indexChangeBlocks.push({
      title: group.title,
      layerId: layerKey,
      legend: t0.legendText || t1.legendText || '',
      narrative: t1.notes || t0.notes || '',
      snapshots: snapRefs,
      tableHeaders: ['Period', 'Scene', 'AOI mean', 'Δ vs T0'],
      tableRows: [
        [t0.periodLabel || 'T0', t0.sceneDate, fmtNum(mean0, 4), '—'],
        [
          t1.periodLabel || 'T1',
          t1.sceneDate,
          fmtNum(mean1, 4),
          delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`,
        ],
      ],
      compareChartRId,
      compareChartTitle,
      deltaChartRId,
      deltaChartTitle,
    })
  }

  const correlationNativeCharts: DocxNativeChartSpec[] = []
  let correlationChartN =
    indexCharts.length + weatherCharts.length + vegCoverageCharts.length + lulcCharts.length + indexChangeCharts.length

  const correlationBlocks: TimeSeriesDocxModel['correlationBlocks'] = []
  const sortedCorr = [...(payload.correlationBlocks ?? [])].sort(
    (a, b) => a.xLayerId.localeCompare(b.xLayerId) || a.yLayerId.localeCompare(b.yLayerId),
  )
  for (const block of sortedCorr) {
    let chartRId: string | null = null
    let rId: string | null = null

    const points =
      block.points?.length
        ? block.points
        : (block.valueRows ?? [])
            .map(row => ({
              date: String(row[0] ?? '—'),
              x: Number(row[1]),
              y: Number(row[2]),
            }))
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    const fitLine =
      block.fitLine?.length && block.fitLine.length >= 2
        ? block.fitLine
        : points.length >= 2
          ? [
              { x: Math.min(...points.map(p => p.x)), y: block.intercept + block.slope * Math.min(...points.map(p => p.x)) },
              { x: Math.max(...points.map(p => p.x)), y: block.intercept + block.slope * Math.max(...points.map(p => p.x)) },
            ]
          : []

    if (points.length >= 2) {
      correlationChartN += 1
      const spec = buildCorrelationScatterNativeChartSpec(
        {
          xLayerId: block.xLayerId,
          yLayerId: block.yLayerId,
          r: block.r,
          r2: block.r2,
          n: block.n,
          points,
          fitLine,
          relationshipLabel: block.relationshipLabel,
        },
        correlationChartN,
      )
      correlationNativeCharts.push(spec)
      chartRId = spec.rId
    } else if (block.chartBase64) {
      rId = nextRid(1, imageCounter)
      imageCounter++
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: block.chartBase64 })
    }

    correlationBlocks.push({
      title: `${block.xLayerId} × ${block.yLayerId} · ${block.relationshipLabel}`,
      xLayerId: block.xLayerId,
      yLayerId: block.yLayerId,
      chartRId,
      rId,
      r2Label: `R²=${block.r2.toFixed(3)} · r=${block.r.toFixed(3)} · n=${block.n} · slope=${block.slope.toFixed(4)}`,
      interpretation: block.interpretation,
      valueHeaders: block.valueHeaders?.length ? block.valueHeaders : ['Date', block.xLayerId, block.yLayerId],
      valueRows: block.valueRows ?? [],
      gisInsight: block.gisInsight,
      agroInsight: block.agroInsight,
    })
  }

  const nativeCharts = [
    ...indexCharts,
    ...weatherCharts,
    ...vegCoverageCharts,
    ...lulcCharts,
    ...indexChangeCharts,
    ...correlationNativeCharts,
  ]

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
    vegCoverageChartRIds,
    vegCoverageChartInterpretation,
    dataQualityNotes: `Analysis uses ${payload.layerIds.join(', ')} indices derived from Sentinel Hub statistics. All index values are derived from source imagery statistics. Week numbers are ISO week labels parsed from the period column; gaps indicate weeks with no available scene or observation.${
      exec.ndwiEstimated || exec.saviEstimated
        ? ' NDWI and/or SAVI values marked with * are estimated from available NDVI/NDMI where raw band reflectance was not exported.'
        : ''
    }`,
    recommendations: exec.recommendations,
    mapLayers,
    lulcMapLayers,
    lulcYearBlocks,
    lulcChangeBlocks,
    lulcMultiYearHeaders,
    lulcMultiYearRows,
    lulcMultiYearBarChartRId,
    lulcMultiYearBarChartTitle,
    changeDetectionMapLayers,
    indexChangeBlocks,
    cumulativeMapLayers,
    correlationBlocks,
    cropRecommendationBullets: payload.cropRecommendations ?? [],
    chartImages,
    nativeCharts,
    weatherChartRIds,
    weatherChartRId,
    weatherSummaryRows,
    weatherTableHeaders,
    weatherTableRows,
    weatherMonthlyHeaders,
    weatherMonthlyRows,
    weatherYearlyHeaders,
    weatherYearlyRows,
    weatherCorrelationNotes,
    weatherDataSource,
    footerNote: `Generated ${payload.generatedAt.replace('T', ' ').slice(0, 19)} UTC by ${payload.projectName}. Includes Layer Live legends, editable Office charts, LULC 2021–2025 with class area tables / pie / bar charts, LULC change detection deltas, and crop recommendations.`,
  }

  return { model, images }
}

export { base64ToUint8 }
