import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import { buildWeatherClimateReportPayload } from './weatherClimateAnalysisEngine'
import { buildWeatherClimateReportWorkbook } from './generateWeatherClimateReportExcel'
import { injectNativeMeteoCharts } from './meteoNativeExcelCharts'

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

describe('native meteo excel charts', () => {
  it('exports the reference-style Weather-Hourly + Analysis workbook', async () => {
    const points: OpenMeteoHourlyPoint[] = []
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 2; d++) {
        points.push(
          hourly(
            `2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00`,
            20 + m,
            m === 3 ? 5 : 0,
          ),
        )
      }
    }
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Test AOI',
      aoiLocation: 'Burao',
      lat: 9.3867,
      lng: 45.4264,
      timezone: 'UTC',
      analysisStart: '2024-01-01',
      analysisEnd: '2024-12-31',
      loadedStart: '2024-01-01',
      loadedEnd: '2024-12-31',
      hourlyRecords: points,
      timeAggregation: 'month',
    })
    const wb = await buildWeatherClimateReportWorkbook(payload)
    const names = wb.worksheets.map(w => w.name)
    expect(names).toEqual(['Weather-Hourly', 'Analysis'])
    expect(wb.getWorksheet('Weather-Hourly')?.getCell('A6').value).toBe('YEAR')
    expect(wb.getWorksheet('Analysis')?.getCell('A1').value).toContain('Weather Data Analysis')
    expect(wb.__meteoChartSpecs ?? []).toHaveLength(4)
  })

  it('injects editable OOXML charts when specs are provided', async () => {
    const points: OpenMeteoHourlyPoint[] = []
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 2; d++) {
        points.push(
          hourly(
            `2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00`,
            20 + m,
            m === 3 ? 5 : 0,
          ),
        )
      }
    }
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Test AOI',
      aoiLocation: 'Burao',
      lat: 9.3867,
      lng: 45.4264,
      timezone: 'UTC',
      analysisStart: '2024-01-01',
      analysisEnd: '2024-12-31',
      loadedStart: '2024-01-01',
      loadedEnd: '2024-12-31',
      hourlyRecords: points,
      timeAggregation: 'month',
    })
    const wb = await buildWeatherClimateReportWorkbook(payload)
    const specs = wb.__meteoChartSpecs ?? []
    expect(specs[0]?.title).toContain('Temperature')

    const raw = await wb.xlsx.writeBuffer()
    const out = await injectNativeMeteoCharts(raw as ArrayBuffer, specs, 'Analysis')
    const zip = await JSZip.loadAsync(out)
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy()
    expect(zip.file('xl/drawings/drawing1.xml')).toBeTruthy()
    const chart1 = await zip.file('xl/charts/chart1.xml')!.async('string')
    expect(chart1).toContain("'Analysis'!")
    expect(chart1).toContain('<c:chart')

    const sheetXmlFiles = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    let hasDrawing = false
    for (const p of sheetXmlFiles) {
      const xml = await zip.file(p)!.async('string')
      if (xml.includes('<drawing ')) hasDrawing = true
    }
    expect(hasDrawing).toBe(true)

    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('drawingml.chart+xml')
  })
})
