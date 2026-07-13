import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'

export type ClimateRiskLevel = 'Low' | 'Moderate' | 'High' | 'Extreme'

export type WeatherDailyRecord = {
  date: string
  tempMaxC: number | null
  tempMinC: number | null
  tempAvgC: number | null
  rainfallMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  solarRadiationWm2: number | null
  et0Mm: number | null
  pressureHpa: number | null
}

export type ClimateExtremeEvent = {
  type: 'Heat wave' | 'Extreme rainfall' | 'Drought' | 'Long dry period'
  startDate: string
  endDate: string
  durationDays: number
  description: string
}

export type ClimateRiskRow = {
  riskType: string
  level: ClimateRiskLevel
  description: string
}

export type MonthlyClimateRow = {
  month: number
  monthLabel: string
  avgTempC: number | null
  rainfallMm: number | null
  humidityPct: number | null
  climateRisk: ClimateRiskLevel
  seasonLabel: string
}

export type AnnualClimateRow = {
  year: number
  avgTempC: number | null
  totalRainfallMm: number | null
  tempAnomalyC: number | null
  rainfallAnomalyPct: number | null
}

export type ClimateForecastRow = {
  year: number
  predictedTempC: number | null
  tempChangeC: number | null
  predictedRainfallMm: number | null
  rainfallChangePct: number | null
  confidence: 'Low' | 'Moderate' | 'High'
}

export type WeatherClimateReportPayload = {
  aoiName: string
  aoiLocation: string
  lat: number
  lng: number
  timezone: string
  elevationM: number | null
  analysisStart: string
  analysisEnd: string
  loadedStart: string
  loadedEnd: string
  extractionDate: string
  dataSource: string
  climateClassification: string
  historicalCoverageYears: number
  executiveSummary: {
    mainFindings: string[]
    environmentalRiskSummary: string
    forecastHorizon: string
  }
  hourlyRecords: OpenMeteoHourlyPoint[]
  dailyRecords: WeatherDailyRecord[]
  temperatureStats: Record<string, number | string | null>
  rainfallStats: Record<string, number | string | null>
  extremeEvents: ClimateExtremeEvent[]
  temperatureTrend: {
    slopePerDecadeC: number | null
    annualChangePct: number | null
    regressionR2: number | null
    narrative: string
  }
  rainfallTrend: {
    slopeMmPerDecade: number | null
    annualChangePct: number | null
    regressionR2: number | null
    narrative: string
  }
  annualSeries: AnnualClimateRow[]
  climateRisks: ClimateRiskRow[]
  monthlyCalendar: MonthlyClimateRow[]
  forecastRows: ClimateForecastRow[]
  impactAssessment: {
    overallImpact: 'Low' | 'Medium' | 'High'
    temperatureIncreaseC: number | null
    rainfallChangePct: number | null
    droughtProbabilityPct: number | null
    waterStressLevel: ClimateRiskLevel
    agriculturalImpact: string
    bullets: string[]
  }
}
