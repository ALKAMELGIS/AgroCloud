import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import { buildWeatherClimateReportPayload } from './weatherClimateAnalysisEngine'
import { injectNativeMeteoCharts } from './meteoNativeExcelCharts'
import { METEO_SHEET, buildMeteoDataReportWorkbook } from './meteoDataReportExcelWriter'

function hourly(time: string, temp: number, rain = 0): OpenMeteoHourlyPoint {
  return {
    time,
    temperatureC: temp,
    weatherCode: 0,
    precipitationMm: rain,
    snowfallCm: null,
    humidityPct: 45,
    windSpeedKmh: 15,
    windDirectionDeg: 90,
    pressureHpa: 1013,
    et0Mm: 0.25,
    shortwaveRadiationWm2: 400,
  }
}

function sampleYearPoints(): OpenMeteoHourlyPoint[] {
  const points: OpenMeteoHourlyPoint[] = []
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 3; d++) {
      const date = `2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      points.push(hourly(`${date}T06:00`, 18 + m, m === 3 ? 4 : 0))
      points.push(hourly(`${date}T14:00`, 28 + m, 0))
    }
  }
  return points
}

describe('meteoDataReportExcelWriter', () => {
  it('builds the Daily + Monthly + Hourly data/chart workbook', async () => {
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Burao',
      aoiLocation: 'Togdheer',
      lat: 9.3867,
      lng: 45.4264,
      timezone: 'UTC',
      analysisStart: '2024-01-01',
      analysisEnd: '2024-12-31',
      loadedStart: '2024-01-01',
      loadedEnd: '2024-12-31',
      hourlyRecords: sampleYearPoints(),
      timeAggregation: 'day',
    })

    const wb = await buildMeteoDataReportWorkbook(payload)
    expect(wb.worksheets.map(w => w.name)).toEqual([
      METEO_SHEET.dataMonthly,
      METEO_SHEET.chartMonthly,
      METEO_SHEET.dataDaily,
      METEO_SHEET.chartsDaily,
      METEO_SHEET.dataHourly,
      METEO_SHEET.chartsHourly,
    ])

    const specs = wb.__meteoChartSpecs ?? []
    expect(specs.length).toBeGreaterThan(0)
    const targets = new Set(specs.map(s => s.targetSheet))
    expect(targets.has(METEO_SHEET.chartMonthly)).toBe(true)
    expect(targets.has(METEO_SHEET.chartsDaily)).toBe(true)
    expect(targets.has(METEO_SHEET.chartsHourly)).toBe(true)
  })

  it('injects native charts onto each chart sheet (separate drawings)', async () => {
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Burao',
      aoiLocation: 'Togdheer',
      lat: 9.3867,
      lng: 45.4264,
      timezone: 'UTC',
      analysisStart: '2024-01-01',
      analysisEnd: '2024-12-31',
      loadedStart: '2024-01-01',
      loadedEnd: '2024-12-31',
      hourlyRecords: sampleYearPoints(),
      timeAggregation: 'day',
    })

    const wb = await buildMeteoDataReportWorkbook(payload)
    const specs = wb.__meteoChartSpecs ?? []
    const raw = await wb.xlsx.writeBuffer()
    const out = await injectNativeMeteoCharts(raw as ArrayBuffer, specs, METEO_SHEET.chartMonthly)
    const zip = await JSZip.loadAsync(out)

    // Every spec produced a chart part.
    expect(zip.file(`xl/charts/chart${specs.length}.xml`)).toBeTruthy()

    // One drawing per target chart sheet (3 distinct sheets used).
    const drawingCount = Object.keys(zip.files).filter(n =>
      /^xl\/drawings\/drawing\d+\.xml$/.test(n),
    ).length
    expect(drawingCount).toBe(3)

    // Content types register drawings and charts.
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('drawingml.chart+xml')
    expect(ct).toContain('/xl/drawings/drawing3.xml')
  })
})
