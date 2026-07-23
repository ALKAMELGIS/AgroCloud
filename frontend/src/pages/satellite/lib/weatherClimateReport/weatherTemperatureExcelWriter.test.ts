import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import { buildWeatherClimateReportPayload } from './weatherClimateAnalysisEngine'
import {
  buildTemperatureWeatherReportWorkbook,
  TEMP_SHEET,
} from './weatherTemperatureExcelWriter'
import { buildTemperatureReportModel } from './weatherTemperatureReportModel'
import { injectNativeMeteoCharts } from './meteoNativeExcelCharts'
import { buildWeatherClimateReportWorkbook } from './generateWeatherClimateReportExcel'

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

function buildYearPoints(): OpenMeteoHourlyPoint[] {
  const points: OpenMeteoHourlyPoint[] = []
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 7; d++) {
      for (const h of [6, 14]) {
        points.push(
          hourly(
            `2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`,
            18 + m + (h === 14 ? 6 : 0),
            m === 3 ? 2 : 0,
          ),
        )
      }
    }
  }
  // Second year for YoY / anomaly charts
  for (let m = 1; m <= 6; m++) {
    for (let d = 1; d <= 3; d++) {
      points.push(
        hourly(
          `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00`,
          20 + m,
        ),
      )
    }
  }
  return points
}

function makePayload(aggregation: 'hour' | 'day' | 'week' | 'month' | 'year' = 'day') {
  const points = buildYearPoints()
  return buildWeatherClimateReportPayload({
    aoiName: 'Test AOI',
    aoiLocation: 'Burao',
    lat: 9.3867,
    lng: 45.4264,
    timezone: 'UTC',
    analysisStart: '2024-01-01',
    analysisEnd: '2025-06-30',
    loadedStart: '2024-01-01',
    loadedEnd: '2025-06-30',
    hourlyRecords: points,
    timeAggregation: aggregation,
  })
}

describe('weather temperature report model', () => {
  it('builds multi-scale temperature tables and analysis KPIs', () => {
    const model = buildTemperatureReportModel(makePayload('month'))
    expect(model.aggregationLabel).toBe('Monthly')
    expect(model.hourly.length).toBeGreaterThan(100)
    expect(model.daily.length).toBeGreaterThan(50)
    expect(model.weekly.length).toBeGreaterThan(4)
    expect(model.monthly.length).toBeGreaterThan(6)
    expect(model.yearly.length).toBeGreaterThanOrEqual(2)
    expect(model.monthlyNormals).toHaveLength(12)
    expect(model.diurnalProfile).toHaveLength(24)
    expect(model.stats.length).toBeGreaterThanOrEqual(3)
    expect(model.dataSheetOrder[0]).toBe('month')
    expect(model.yoy.some(y => y.year === 2024)).toBe(true)
  })

  it('puts primary aggregate first in dataSheetOrder', () => {
    expect(buildTemperatureReportModel(makePayload('week')).dataSheetOrder[0]).toBe('week')
    expect(buildTemperatureReportModel(makePayload('hour')).dataSheetOrder[0]).toBe('hour')
  })
})

describe('weather temperature excel workbook', () => {
  it('writes Cover, Data scales, Analysis, Charts Hourly/Daily/Monthly with native chart specs', async () => {
    const payload = makePayload('day')
    const wb = await buildTemperatureWeatherReportWorkbook(payload)
    const names = wb.worksheets.map(w => w.name)
    expect(names[0]).toBe(TEMP_SHEET.cover)
    expect(names).toContain(TEMP_SHEET.hourly)
    expect(names).toContain(TEMP_SHEET.daily)
    expect(names).toContain(TEMP_SHEET.weekly)
    expect(names).toContain(TEMP_SHEET.monthly)
    expect(names).toContain(TEMP_SHEET.yearly)
    expect(names).toContain(TEMP_SHEET.analysis)
    expect(names).toContain(TEMP_SHEET.chartsHourly)
    expect(names).toContain(TEMP_SHEET.chartsDaily)
    expect(names).toContain(TEMP_SHEET.chartsMonthly)
    expect(names).not.toContain('Charts')
    // Primary day → Data Daily immediately after Cover
    expect(names[1]).toBe(TEMP_SHEET.daily)
    expect(wb.getWorksheet(TEMP_SHEET.daily)?.getCell('A6').value).toBe('Period')
    expect(wb.getWorksheet(TEMP_SHEET.hourly)?.getCell('A6').value).toBe('Period')
    expect(wb.getWorksheet(TEMP_SHEET.hourly)?.getCell('G6').value).toBe('Precipitation mm/h')
    expect(wb.getWorksheet(TEMP_SHEET.daily)?.getCell('F6').value).toBe('Precipitation mm')
    expect(wb.getWorksheet(TEMP_SHEET.analysis)?.getCell('A1').value).toContain('Temperature Analysis')
    expect(wb.getWorksheet(TEMP_SHEET.chartsHourly)?.getCell('A1').value).toBe('Charts Hourly')
    expect(wb.getWorksheet(TEMP_SHEET.chartsDaily)?.getCell('A1').value).toBe('Charts Daily')
    expect(wb.getWorksheet(TEMP_SHEET.chartsMonthly)?.getCell('A1').value).toBe('Charts Monthly')
    expect((wb.__meteoChartSpecs ?? []).length).toBeGreaterThanOrEqual(12)
    expect((wb.__meteoChartSpecs ?? []).length).toBeLessThanOrEqual(22)
    expect(wb.__chartsSheetName).toBe(TEMP_SHEET.chartsDaily)
    const titles = (wb.__meteoChartSpecs ?? []).map(s => s.title).join(' | ')
    expect(titles).toMatch(/Temperature \(Hourly\)/)
    expect(titles).toMatch(/Precipitation \(Hourly\)/)
    expect(titles).toMatch(/Temperature/)
    expect(titles).toMatch(/Precipitation/)
    expect(titles).toMatch(/Humidity/)
    expect(titles).toMatch(/Wind/)
    expect(titles).not.toMatch(/Weekly/)
    expect(titles).not.toMatch(/Intelligence/)
    const sheets = new Set((wb.__meteoChartSpecs ?? []).map(s => s.targetSheet))
    expect(sheets.has(TEMP_SHEET.chartsHourly)).toBe(true)
    expect(sheets.has(TEMP_SHEET.chartsDaily)).toBe(true)
    expect(sheets.has(TEMP_SHEET.chartsMonthly)).toBe(true)
  })

  it('injects editable OOXML charts into the Charts sheets', async () => {
    const payload = makePayload('month')
    const wb = await buildTemperatureWeatherReportWorkbook(payload)
    const specs = wb.__meteoChartSpecs ?? []
    expect(specs.some(s => s.targetSheet === TEMP_SHEET.chartsHourly)).toBe(true)
    expect(specs[0]?.title.toLowerCase()).toMatch(/temp|hourly|monthly|tmax/)

    const raw = await wb.xlsx.writeBuffer()
    const out = await injectNativeMeteoCharts(raw as ArrayBuffer, specs, TEMP_SHEET.chartsDaily)
    const zip = await JSZip.loadAsync(out)
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy()
    expect(zip.file('xl/drawings/drawing1.xml')).toBeTruthy()
    expect(zip.file('xl/drawings/drawing2.xml')).toBeTruthy()
    expect(zip.file('xl/drawings/drawing3.xml')).toBeTruthy()
    const chart1 = await zip.file('xl/charts/chart1.xml')!.async('string')
    expect(chart1).toContain('<c:chart')
  })

  it('keeps Intelligence workbook path as enterprise multi-sheet workbook', async () => {
    const payload = makePayload('month')
    const wb = await buildWeatherClimateReportWorkbook(payload)
    const names = wb.worksheets.map(w => w.name)
    expect(names).toContain('Hourly Raw Data')
    expect(names).toContain('Charts Dashboard')
    expect(names).not.toContain(TEMP_SHEET.chartsHourly)
  })
})
