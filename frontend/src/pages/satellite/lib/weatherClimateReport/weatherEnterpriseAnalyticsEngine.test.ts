import { describe, expect, it } from 'vitest'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { buildEnterpriseWeatherModel, buildStatusMap, classifyScore } from './weatherEnterpriseAnalyticsEngine'

function minimalPayload(): WeatherClimateReportPayload {
  return {
    aoiName: 'Enterprise Field',
    aoiLocation: 'Hargeisa',
    lat: 9.56,
    lng: 44.06,
    timezone: 'Africa/Mogadishu',
    elevationM: 1200,
    analysisStart: '2024-06-01',
    analysisEnd: '2024-06-30',
    loadedStart: '2024-06-01',
    loadedEnd: '2024-06-30',
    extractionDate: new Date().toISOString(),
    dataSource: 'Open-Meteo ERA5',
    climateClassification: 'Semi-arid',
    historicalCoverageYears: 0.1,
    executiveSummary: { mainFindings: [], environmentalRiskSummary: '', forecastHorizon: '' },
    timeAggregation: 'day',
    hourlyRecords: Array.from({ length: 48 }, (_, i) => ({
      time: `2024-06-${String(1 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`,
      temperatureC: 22 + (i % 8),
      weatherCode: 1,
      precipitationMm: i % 12 === 0 ? 2 : 0,
      snowfallCm: null,
      humidityPct: 50,
      windSpeedKmh: 14,
      windDirectionDeg: 180,
      pressureHpa: 1012,
      et0Mm: 0.3,
      shortwaveRadiationWm2: 300,
    })),
    dailyRecords: [],
    temperatureStats: {},
    rainfallStats: {},
    extremeEvents: [],
    temperatureTrend: { slopePerDecadeC: null, annualChangePct: null, regressionR2: null, narrative: '' },
    rainfallTrend: { slopeMmPerDecade: null, annualChangePct: null, regressionR2: null, narrative: '' },
    annualSeries: [],
    climateRisks: [],
    monthlyCalendar: [],
    forecastRows: [],
    impactAssessment: {
      overallImpact: 'Low',
      temperatureIncreaseC: null,
      rainfallChangePct: null,
      droughtProbabilityPct: 15,
      waterStressLevel: 'Low',
      agriculturalImpact: 'Stable',
      bullets: [],
    },
  }
}

describe('weatherEnterpriseAnalyticsEngine', () => {
  it('builds 8-sheet enterprise model with status maps', () => {
    const model = buildEnterpriseWeatherModel(minimalPayload())
    expect(model.hourlyRaw.length).toBe(48)
    expect(model.dailySummary.length).toBeGreaterThan(0)
    expect(model.monthlySummary.length).toBeGreaterThan(0)
    expect(model.statistics.length).toBeGreaterThan(0)
    expect(model.comparisons.length).toBeGreaterThan(0)
    expect(model.indicators.length).toBeGreaterThan(0)
    expect(model.executiveKpis.length).toBeGreaterThanOrEqual(10)
    expect(model.dailySummary[0]?.statusMap).toMatch(/[█░]+/)
  })

  it('classifies scores and builds status maps', () => {
    expect(classifyScore(85)).toBe('Excellent')
    expect(buildStatusMap(50)).toContain('█')
  })
})
