import { describe, expect, it } from 'vitest'
import {
  buildWeatherClimateDocxAnalytics,
  buildDailyRhRich,
  reindexDocxChartSpecs,
} from './weatherClimateDocxAnalytics'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { buildDocxChartXml } from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'

function minimalPayload(overrides: Partial<WeatherClimateReportPayload> = {}): WeatherClimateReportPayload {
  const daily = Array.from({ length: 10 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return {
      date: `2024-01-${day}`,
      tempMaxC: 30 + i * 0.2,
      tempMinC: 18 + i * 0.1,
      tempAvgC: 24 + i * 0.15,
      rainfallMm: i % 3 === 0 ? 2.5 : 0,
      humidityPct: 55 + i,
      windSpeedKmh: 12,
      solarRadiationWm2: 200,
      et0Mm: 3,
      pressureHpa: 1010,
    }
  })
  const hourly = daily.flatMap(d =>
    Array.from({ length: 4 }, (_, h) => ({
      time: `${d.date}T${String(h * 6).padStart(2, '0')}:00`,
      temperatureC: (d.tempMinC! + d.tempMaxC!) / 2,
      precipitationMm: (d.rainfallMm ?? 0) / 4,
      humidityPct: (d.humidityPct ?? 50) + (h - 1.5),
      windSpeedKmh: 12,
      shortwaveRadiationWm2: 200,
      et0Mm: 0.5,
      pressureHpa: 1010,
    })),
  )
  return {
    aoiName: 'Test AOI',
    aoiLocation: '0,0',
    lat: 0,
    lng: 0,
    timezone: 'UTC',
    elevationM: null,
    analysisStart: '2024-01-01',
    analysisEnd: '2024-01-10',
    loadedStart: '2024-01-01',
    loadedEnd: '2024-01-10',
    extractionDate: new Date().toISOString(),
    dataSource: 'Test',
    climateClassification: 'Test',
    historicalCoverageYears: 1,
    executiveSummary: { mainFindings: [], environmentalRiskSummary: '', forecastHorizon: '' },
    timeAggregation: 'day',
    hourlyRecords: hourly,
    dailyRecords: daily,
    temperatureStats: {},
    rainfallStats: {},
    extremeEvents: [],
    temperatureTrend: { slopePerDecadeC: null, annualChangePct: null, regressionR2: null, narrative: '' },
    rainfallTrend: { slopeMmPerDecade: null, annualChangePct: null, regressionR2: null, narrative: '' },
    monthlyCalendar: [],
    annualSeries: [],
    forecastRows: [],
    climateRisks: [],
    overallImpact: 'Low',
    ...overrides,
  }
}

describe('weatherClimateDocxAnalytics', () => {
  it('computes summary statistics for the selected date range', () => {
    const analytics = buildWeatherClimateDocxAnalytics(minimalPayload())
    expect(analytics.calendarDays).toBe(10)
    expect(analytics.trendResolution).toBe('daily')
    expect(analytics.variableStats).toHaveLength(3)
    const temp = analytics.variableStats[0]!
    expect(temp.observations).toBe('10')
    expect(temp.missing).toBe('0')
    expect(temp.total).toBe('—')
    const rain = analytics.variableStats[2]!
    expect(Number(rain.total)).toBeGreaterThan(0)
    expect(analytics.periodTrendRows).toHaveLength(10)
    expect(analytics.nativeCharts.length).toBeGreaterThanOrEqual(4)
  })

  it('uses monthly trend resolution for long periods', () => {
    const daily = Array.from({ length: 150 }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 1 + i))
      const date = d.toISOString().slice(0, 10)
      return {
        date,
        tempMaxC: 32,
        tempMinC: 20,
        tempAvgC: 26,
        rainfallMm: 1,
        humidityPct: 60,
        windSpeedKmh: 10,
        solarRadiationWm2: 180,
        et0Mm: 2,
        pressureHpa: 1012,
      }
    })
    const analytics = buildWeatherClimateDocxAnalytics(
      minimalPayload({
        analysisStart: '2020-01-01',
        analysisEnd: '2020-05-29',
        dailyRecords: daily,
        hourlyRecords: [],
      }),
    )
    expect(analytics.trendResolution).toBe('monthly')
    expect(analytics.periodTrendRows.length).toBeGreaterThan(0)
    expect(analytics.periodTrendRows.length).toBeLessThan(daily.length)
  })

  it('builds editable chart XML for each native chart spec', () => {
    const analytics = buildWeatherClimateDocxAnalytics(minimalPayload())
    for (const chart of analytics.nativeCharts) {
      const xml = buildDocxChartXml(chart)
      expect(xml).toContain('<c:chartSpace')
      expect(xml).toContain(esc(chart.title))
    }
  })

  it('reindexes chart relationship ids to be unique and sequential', () => {
    const specs = reindexDocxChartSpecs([
      { rId: 'rIdChart1', fileStem: 'chart1', title: 'A', yAxisLabel: 'Y', categories: ['a'], series: [] },
      { rId: 'rIdChart6', fileStem: 'chart6', title: 'B', yAxisLabel: 'Y', categories: ['b'], series: [] },
    ])
    expect(specs.map(s => s.fileStem)).toEqual(['chart1', 'chart2'])
    expect(specs.map(s => s.rId)).toEqual(['rIdChart1', 'rIdChart2'])
  })

  it('derives RH min/max from hourly buckets', () => {
    const rich = buildDailyRhRich(
      minimalPayload().hourlyRecords,
      [],
      '2024-01-01',
      '2024-01-10',
    )
    expect(rich[0]?.humidityMinPct).not.toBeNull()
    expect(rich[0]?.humidityMaxPct).not.toBeNull()
    expect(rich[0]!.humidityMaxPct!).toBeGreaterThanOrEqual(rich[0]!.humidityMinPct!)
  })
})

function esc(s: string): string {
  return s.replace(/&/g, '&amp;')
}
