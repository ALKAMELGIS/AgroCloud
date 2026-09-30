import { describe, expect, it } from 'vitest'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import {
  buildWeatherIntelligenceExecutive,
  weatherRiskBandFromScore,
} from './weatherIntelligenceExecutive'

function minimalPayload(): WeatherClimateReportPayload {
  return {
    aoiName: 'Test Field',
    aoiLocation: 'Hargeisa',
    lat: 9.56,
    lng: 44.06,
    timezone: 'Africa/Mogadishu',
    elevationM: 1200,
    analysisStart: '2024-01-01',
    analysisEnd: '2024-12-31',
    loadedStart: '2024-01-01',
    loadedEnd: '2024-12-31',
    extractionDate: new Date().toISOString(),
    dataSource: 'Open-Meteo ERA5',
    climateClassification: 'Semi-arid',
    historicalCoverageYears: 1,
    executiveSummary: {
      mainFindings: ['Stable temperatures.'],
      environmentalRiskSummary: 'Heat Stress: Low',
      forecastHorizon: '2026 – 2050',
    },
    timeAggregation: 'day',
    hourlyRecords: [],
    dailyRecords: Array.from({ length: 30 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      return {
        date: `2024-01-${day}`,
        tempMaxC: 28 + (i % 5),
        tempMinC: 16,
        tempAvgC: 22,
        rainfallMm: i % 7 === 0 ? 12 : 0,
        humidityPct: 45,
        windSpeedKmh: 12,
        solarRadiationWm2: 220,
        et0Mm: 4.5,
        pressureHpa: 1010,
      }
    }),
    temperatureStats: {},
    rainfallStats: {},
    extremeEvents: [],
    temperatureTrend: { slopePerDecadeC: 0.1, annualChangePct: null, regressionR2: 0.2, narrative: 'Slight warming.' },
    rainfallTrend: { slopeMmPerDecade: -5, annualChangePct: -2, regressionR2: 0.1, narrative: 'Slight drying.' },
    annualSeries: [{ year: 2024, avgTempC: 22, totalRainfallMm: 120, tempAnomalyC: 0, rainfallAnomalyPct: 0 }],
    climateRisks: [{ riskType: 'Heat Stress', level: 'Low', description: 'Stable' }],
    monthlyCalendar: [],
    forecastRows: [{ year: 2050, predictedTempC: 24, tempChangeC: 2, predictedRainfallMm: 100, rainfallChangePct: -10, confidence: 'Moderate' }],
    impactAssessment: {
      overallImpact: 'Low',
      temperatureIncreaseC: 2,
      rainfallChangePct: -10,
      droughtProbabilityPct: 15,
      waterStressLevel: 'Low',
      agriculturalImpact: 'Routine monitoring advised.',
      bullets: ['Projected +2 °C by 2050.'],
    },
  }
}

describe('weatherIntelligenceExecutive', () => {
  it('maps risk score bands', () => {
    expect(weatherRiskBandFromScore(85)).toBe('Excellent')
    expect(weatherRiskBandFromScore(65)).toBe('Good')
    expect(weatherRiskBandFromScore(45)).toBe('Moderate Risk')
    expect(weatherRiskBandFromScore(25)).toBe('High Risk')
    expect(weatherRiskBandFromScore(10)).toBe('Critical')
  })

  it('builds KPIs and agricultural indicators', () => {
    const ex = buildWeatherIntelligenceExecutive(minimalPayload())
    expect(ex.kpis.length).toBeGreaterThanOrEqual(10)
    expect(ex.agriculturalIndicators.length).toBe(9)
    expect(ex.weatherRiskScore).toBeGreaterThanOrEqual(0)
    expect(ex.weatherRiskScore).toBeLessThanOrEqual(100)
    expect(ex.executiveNarrative).toContain('Test Field')
  })
})
