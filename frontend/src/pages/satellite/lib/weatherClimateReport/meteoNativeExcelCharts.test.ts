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

  it('does not overwrite existing Map Snapshot image drawings when injecting charts', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const mapWs = wb.addWorksheet('Map Snapshots')
    mapWs.getCell('A1').value = 'Maps'
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const imageId = wb.addImage({ base64: tinyPng, extension: 'png' })
    mapWs.addImage(imageId, { tl: { col: 0, row: 1 }, ext: { width: 80, height: 60 } })

    const chartsWs = wb.addWorksheet('Charts')
    chartsWs.getCell('A1').value = 'Period'
    chartsWs.getCell('B1').value = 'NDVI'
    chartsWs.getCell('A2').value = '2026-01-01'
    chartsWs.getCell('B2').value = 0.4
    chartsWs.getCell('A3').value = '2026-01-02'
    chartsWs.getCell('B3').value = 0.5

    const raw = await wb.xlsx.writeBuffer()
    const before = await JSZip.loadAsync(raw as ArrayBuffer)
    const preexisting = Object.keys(before.files).filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))
    expect(preexisting.length).toBeGreaterThanOrEqual(1)
    const mapDrawingBefore = await before.file(preexisting[0]!)!.async('string')

    const out = await injectNativeMeteoCharts(
      raw as ArrayBuffer,
      [
        {
          title: 'NDVI Trend',
          kind: 'line',
          series: [
            {
              name: 'NDVI',
              valuesRef: 'Charts!$B$2:$B$3',
              catsRef: 'Charts!$A$2:$A$3',
            },
          ],
          anchorRow: 4,
          sectionLabel: 'NDVI',
          targetSheet: 'Charts',
          smooth: true,
        },
      ],
      'Charts',
    )
    const zip = await JSZip.loadAsync(out)
    const mapDrawingAfter = await zip.file(preexisting[0]!)!.async('string')
    expect(mapDrawingAfter).toBe(mapDrawingBefore)
    expect(mapDrawingAfter).not.toContain('chart')

    const allDrawings = Object.keys(zip.files).filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))
    expect(allDrawings.length).toBeGreaterThan(preexisting.length)
    const chartDrawing = allDrawings.find(n => n !== preexisting[0])!
    const chartXml = await zip.file(chartDrawing)!.async('string')
    expect(chartXml).toContain('chart')
  })

  it('injects charts into worksheets whose names contain ampersands', async () => {
    const ExcelJS = (await import('exceljs')).default
    const sheetName = 'Area & Coverage Analysis'
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(sheetName)
    ws.getCell('A13').value = 'Field A'
    ws.getCell('B13').value = 12
    ws.getCell('A14').value = 'Field B'
    ws.getCell('B14').value = 8

    const raw = await wb.xlsx.writeBuffer()
    const out = await injectNativeMeteoCharts(
      raw as ArrayBuffer,
      [
        {
          title: 'Planned Crop Coverage by Field',
          kind: 'bar',
          barDir: 'col',
          series: [
            {
              name: 'Planned (ha)',
              catsRef: `'${sheetName}'!$A$13:$A$14`,
              valuesRef: `'${sheetName}'!$B$13:$B$14`,
            },
          ],
          anchorRow: 4,
          sectionLabel: 'Per-Field',
          targetSheet: sheetName,
        },
      ],
      sheetName,
    )

    const zip = await JSZip.loadAsync(out)
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy()
    const chart1 = await zip.file('xl/charts/chart1.xml')!.async('string')
    expect(chart1).toContain("'Area &amp; Coverage Analysis'!")
  })
})
