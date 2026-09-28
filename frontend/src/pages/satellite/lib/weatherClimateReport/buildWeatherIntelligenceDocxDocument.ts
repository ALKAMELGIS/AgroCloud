import {
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  docxBodyParagraph,
  docxBulletList,
  docxInlineChart,
  docxItalicNote,
  docxMetaLine,
  docxPageBreak,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from '../timeSeriesReport/timeSeriesDocxXml'
import type { WeatherIntelligenceDocxModel } from './weatherIntelligenceDocxModel'

const KPI_COLS = [2200, 2600, 4500]

export function buildWeatherIntelligenceDocxDocumentXml(model: WeatherIntelligenceDocxModel): string {
  const parts: string[] = []
  const ex = model.executive

  // ── Page 1: Executive Summary ──
  parts.push(docxTitle(model.title))
  parts.push(docxSubtitle(model.subtitle))
  parts.push(
    docxMetaLine([
      { text: model.aoiName },
      { text: `  ·  ${model.aoiLocation}` },
      { text: `  ·  ${model.periodLabel}` },
    ]),
  )
  parts.push(
    docxMetaLine([
      { text: `${model.aggregationLabel} aggregation  ·  ${model.dataSource}` },
      { text: `  ·  Generated ${model.generatedStamp.slice(0, 10)}` },
    ]),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(ex.executiveNarrative))

  parts.push(docxSectionHeading('Executive KPIs'))
  parts.push(
    docxTable(
      ['Indicator', 'Value', 'Notes'],
      ex.kpis.map(k => [k.label, k.value, 'Key decision metric']),
      KPI_COLS,
    ),
  )

  parts.push(docxSectionHeading('AI Weather Risk Dashboard'))
  parts.push(docxBodyParagraph(ex.weatherRiskLabel))
  parts.push(
    docxItalicNote(
      'Score bands: 80–100 Excellent · 60–79 Good · 40–59 Moderate Risk · 20–39 High Risk · 0–19 Critical',
    ),
  )
  parts.push(
    docxTable(
      ['Index', 'Score', 'Status'],
      [
        ['Weather Risk Score', `${ex.weatherRiskScore}/100`, ex.weatherRiskBand],
        ['Crop Stress Index', `${ex.cropStressIndex}/100`, ex.cropStressBand],
      ],
      [3600, 1800, 3900],
    ),
  )

  parts.push(docxPageBreak())

  // ── Statistical analysis (user-selected date range) ──
  const stats = model.statisticalAnalysis
  parts.push(docxSectionHeading('Statistical Analysis — Selected Period'))
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
        'Observations',
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
      [2200, 900, 900, 900, 900, 900, 1100, 900],
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
          ? 'One row per calendar day in the selected range.'
          : 'Monthly aggregates derived from daily observations in the selected range.',
      ),
    )
    parts.push(docxTable(stats.periodTrendHeaders, stats.periodTrendRows, [
      1400, 1100, 1100, 1100, 1000, 900, 900, 1200,
    ]))
  }

  parts.push(docxPageBreak())

  // ── Current conditions & trends ──
  parts.push(docxSectionHeading('Current Weather Conditions'))
  parts.push(docxTable(['Parameter', 'Value'], ex.currentConditions, [3600, 5700]))

  parts.push(docxSectionHeading('Climate Trends Overview'))
  parts.push(docxTable(['Trend', 'Summary'], model.trendSummaryRows, [2800, 6500]))
  parts.push(
    docxItalicNote(
      'Full hourly and multi-scale tables are available in the Weather Intelligence Excel export.',
    ),
  )

  parts.push(docxPageBreak())

  // ── Page 3: Anomalies & agricultural impact ──
  parts.push(docxSectionHeading('Climate Anomalies & Agricultural Indicators'))
  parts.push(docxBodyParagraph(ex.forecastSummary))

  parts.push(docxSectionHeading('Agricultural Impact Assessment'))
  parts.push(
    docxTable(
      ['Indicator', 'Value', 'Interpretation'],
      ex.agriculturalIndicators.map(r => [r.indicator, r.value, r.interpretation]),
      [3200, 1800, 4300],
    ),
  )

  parts.push(docxSectionHeading('Climate Anomaly Indicators'))
  parts.push(
    docxTable(
      ['Indicator', 'Value', 'Interpretation'],
      ex.agriculturalIndicators
        .filter(r => /anomaly|drought|stress|GDD|ET/i.test(r.indicator))
        .slice(0, 6)
        .map(r => [r.indicator, r.value, r.interpretation]),
      [3200, 1800, 4300],
    ),
  )

  if (model.extremeEventRows.length) {
    parts.push(docxSectionHeading('Extreme Weather Events Timeline'))
    parts.push(
      docxTable(
        ['Event', 'Start', 'End', 'Days', 'Description'],
        model.extremeEventRows,
        [1600, 1400, 1400, 900, 4000],
      ),
    )
  }

  parts.push(docxPageBreak())

  // ── Page 4: Forecast, alerts, recommendations ──
  parts.push(docxSectionHeading('Forecast (2026 – 2050)'))
  parts.push(docxItalicNote('Trend-based climate projection from historical regression. Not a substitute for dynamical climate models.'))
  if (model.forecastRows.length) {
    parts.push(
      docxTable(
        ['Year', 'Temp °C', 'Δ Temp', 'Rain mm', 'Δ Rain', 'Confidence'],
        model.forecastRows,
        [1200, 1400, 1200, 1400, 1400, 2700],
      ),
    )
  }

  parts.push(docxSectionHeading('Weather Risk Alerts'))
  parts.push(docxBulletList(ex.riskAlerts.length ? ex.riskAlerts : ['No elevated alerts in selected period.']))

  parts.push(docxSectionHeading('AI Recommendations'))
  parts.push(docxBulletList(ex.aiRecommendations))

  parts.push(docxSectionHeading('Historical Comparison & Key Insights'))
  parts.push(docxBulletList(ex.keyInsights))

  parts.push(docxSectionHeading('Key Insights & Decision Support'))
  parts.push(
    docxBodyParagraph(
      'This Weather Intelligence Report summarizes trends, risks, and anomalies for agricultural and environmental decision-makers. Open the companion Weather Intelligence Excel workbook for hourly, daily, and monthly data tables.',
    ),
  )
  parts.push(
    docxItalicNote(
      `Generated ${model.generatedStamp} by ${model.generatedBy}. AgroCloud / GeoSyntra Weather Intelligence.`,
    ),
  )

  return wrapDocumentBody(parts.join(''))
}
