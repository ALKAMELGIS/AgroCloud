import {
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  wrapDocumentBody,
} from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxXml'
import type { WeatherIntelligenceDocxModel } from './weatherIntelligenceDocxModel'
import {
  docxBodyParagraph,
  docxBulletList,
  docxInlineChart,
  docxItalicNote,
  docxPageBreak,
  docxSectionHeading,
  docxTable,
  docxWeatherCurrentSnapshot,
  docxWeatherExecutiveKpiGrid,
  docxWeatherIntelligenceCover,
  docxWeatherKeyFindings,
  docxWeatherNumberedHeading,
  docxWeatherScoreBandsTable,
  formatWeatherRiskBandShort,
} from './weatherIntelligenceDocxLayout'

const STAT_COLS = [2000, 750, 750, 750, 750, 750, 850, 750]

const CURRENT_CONDITION_META_KEYS = new Set(['Location', 'Coordinates', 'Climate zone', 'Latest record'])

export function buildWeatherIntelligenceDocxDocumentXml(model: WeatherIntelligenceDocxModel): string {
  const parts: string[] = []
  const ex = model.executive
  const stats = model.statisticalAnalysis

  parts.push(
    docxWeatherIntelligenceCover({
      seriesYear: model.seriesYear,
      subtitle: model.subtitle,
      siteName: model.aoiName,
      siteLocationLine: model.siteLocationLine,
      periodLabel: model.formattedPeriodLabel,
      dailyRecordCount: model.dailyRecordCount,
      climateZone: model.climateClassification,
      issueDateLabel: model.issueDateLabel,
      preparedBy: model.generatedBy,
    }),
  )

  // 01 Executive Summary
  parts.push(docxWeatherNumberedHeading('01', 'Executive Summary'))
  parts.push(docxBodyParagraph(model.docxExecutiveOpening))
  parts.push(docxWeatherKeyFindings(model.keyFindings))
  parts.push(docxSectionHeading('Executive KPIs'))
  parts.push(docxWeatherExecutiveKpiGrid(model.executiveKpiCards))

  // 02 AI Weather Risk Dashboard
  parts.push(docxWeatherNumberedHeading('02', 'AI Weather Risk Dashboard'))
  parts.push(
    docxTable(
      ['Index', 'Score', 'Status'],
      [
        [
          'Weather Risk Score',
          `${ex.weatherRiskScore} / 100`,
          `Status: ${formatWeatherRiskBandShort(ex.weatherRiskBand)}`,
        ],
        [
          'Crop Stress Index',
          `${ex.cropStressIndex} / 100`,
          `Status: ${formatWeatherRiskBandShort(ex.cropStressBand)}`,
        ],
      ],
      [3600, 1800, 3900],
    ),
  )
  parts.push(docxWeatherScoreBandsTable())

  // 03 Statistical Analysis — Selected Period
  parts.push(docxWeatherNumberedHeading('03', 'Statistical Analysis — Selected Period'))
  parts.push(docxBodyParagraph(stats.methodologyNote))
  parts.push(docxSectionHeading('Summary Statistics', true, 2))
  parts.push(
    docxTable(
      [
        'Variable',
        'Minimum',
        'Maximum',
        'Average',
        'Total',
        'Std. dev.',
        'Obs.',
        'Missing',
      ],
      stats.variableStats.map(r => [
        r.variable,
        r.minimum,
        r.maximum,
        r.average,
        r.total,
        r.stdDev,
        r.observations,
        r.missing,
      ]),
      STAT_COLS,
    ),
  )

  if (model.nativeCharts.length) {
    parts.push(docxSectionHeading('Climate Charts — Temperature · Humidity · Rainfall', true, 2))
    parts.push(
      docxItalicNote(
        'Native Office charts (editable in Word): temperature and relative humidity extremes, rainfall totals, temperature–humidity relationship, and dual-axis time series for the selected analysis window.',
      ),
    )
    for (const chart of model.nativeCharts) {
      parts.push(docxInlineChart(chart.rId, CHART_IMAGE_CX, CHART_IMAGE_CY))
    }
  }

  if (stats.periodTrendRows.length) {
    const trendTitle =
      stats.trendResolution === 'daily' ? 'Daily Trend Table' : 'Monthly Trend Table'
    parts.push(docxSectionHeading(trendTitle, true, 2))
    parts.push(
      docxItalicNote(
        stats.trendResolution === 'daily'
          ? 'One row per calendar day in the selected range (includes wind speed, wind direction, and sunlight).'
          : 'Monthly aggregates derived from daily observations in the selected range (includes wind speed, wind direction, and sunlight).',
      ),
    )
    parts.push(docxTable(stats.periodTrendHeaders, stats.periodTrendRows, [
      1100, 850, 850, 850, 750, 700, 700, 800, 750, 900, 850,
    ]))
  }

  parts.push(docxPageBreak())

  // 04 Current Weather Conditions
  parts.push(docxWeatherNumberedHeading('04', 'Current Weather Conditions'))
  parts.push(docxWeatherCurrentSnapshot(model.currentSnapshotMetrics))
  parts.push(
    docxTable(
      ['Parameter', 'Value'],
      ex.currentConditions.filter(([k]) => CURRENT_CONDITION_META_KEYS.has(k)),
      [3600, 5700],
    ),
  )

  // 05 Climate Trends Overview
  parts.push(docxWeatherNumberedHeading('05', 'Climate Trends Overview'))
  parts.push(docxTable(['Trend', 'Summary'], model.trendSummaryRows, [2800, 6500]))
  parts.push(
    docxItalicNote('Full hourly and multi-scale tables are available in the Weather Intelligence Excel export.'),
  )
  parts.push(docxSectionHeading('Climate Anomalies & Agricultural Indicators'))
  parts.push(docxBodyParagraph(ex.forecastSummary))

  // 06 Agricultural Impact Assessment
  parts.push(docxWeatherNumberedHeading('06', 'Agricultural Impact Assessment'))
  parts.push(
    docxTable(
      ['Indicator', 'Value', 'Interpretation'],
      ex.agriculturalIndicators.map(r => [r.indicator, r.value, r.interpretation]),
      [3200, 1800, 4300],
    ),
  )
  parts.push(
    docxItalicNote(
      'Climate anomaly indicators (GDD, ET₀, SPI proxy, heat-stress days, CWD) are included in the table above for the selected analysis window.',
    ),
  )

  // 07 Extreme Weather Events Timeline
  if (model.extremeEventRows.length) {
    parts.push(docxWeatherNumberedHeading('07', 'Extreme Weather Events Timeline'))
    parts.push(
      docxTable(
        ['Event', 'Start', 'End', 'Days', 'Description'],
        model.extremeEventRows,
        [1600, 1400, 1400, 900, 4000],
      ),
    )
  }

  // 08 Forecast (2026 – 2050)
  parts.push(docxWeatherNumberedHeading('08', 'Forecast (2026 – 2050)'))
  parts.push(
    docxItalicNote(
      'Trend-based climate projection from historical regression. Not a substitute for dynamical climate models.',
    ),
  )
  if (model.forecastRows.length) {
    parts.push(
      docxTable(
        ['Year', 'Temp °C', 'Δ Temp', 'Rain mm', 'Δ Rain', 'Confidence'],
        model.forecastRows,
        [1200, 1400, 1200, 1400, 1400, 2700],
      ),
    )
  }

  // 09 Weather Risk Alerts
  parts.push(docxWeatherNumberedHeading('09', 'Weather Risk Alerts'))
  parts.push(docxBulletList(ex.riskAlerts.length ? ex.riskAlerts : ['No elevated alerts in selected period.']))

  // 10 Recommendations
  parts.push(docxWeatherNumberedHeading('10', 'Recommendations'))
  parts.push(docxSectionHeading('Risk outlook', true, 2))
  const riskOutlook = ex.aiRecommendations.slice(0, Math.min(5, ex.aiRecommendations.length))
  riskOutlook.forEach(line => parts.push(docxBodyParagraph(line)))
  parts.push(docxSectionHeading('Recommended actions', true, 2))
  ex.aiRecommendations.slice(riskOutlook.length).forEach(line => parts.push(docxBodyParagraph(line)))

  // 11 Historical Comparison & Key Insights
  parts.push(docxWeatherNumberedHeading('11', 'Historical Comparison & Key Insights'))
  parts.push(docxBulletList(ex.keyInsights))

  // 12 Key Insights & Decision Support
  parts.push(docxWeatherNumberedHeading('12', 'Key Insights & Decision Support'))
  parts.push(
    docxBodyParagraph(
      'This Weather Intelligence Report summarizes trends, risks, and anomalies for agricultural and environmental decision-makers. Open the companion Weather Intelligence Excel workbook for hourly, daily, and monthly data tables including wind speed, wind direction, and sunlight (shortwave radiation).',
    ),
  )
  parts.push(
    docxItalicNote(
      `Generated ${model.generatedStamp.slice(0, 10)} by ${model.generatedBy}. AgroCloud / GeoSyntra Weather Intelligence.`,
    ),
  )

  return wrapDocumentBody(parts.join(''))
}
