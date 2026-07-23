import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { injectNativeMeteoCharts } from '../weatherClimateReport/meteoNativeExcelCharts'
import { buildTimeSeriesWeatherWorkbook } from './generateTimeSeriesWeatherReportExcel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

function payload(): TimeSeriesReportPayload {
  return {
    projectName: 'AgroCloud',
    generatedAt: '2026-07-15T00:00:00.000Z',
    generatedBy: 'AgroCloud',
    location: {
      fieldName: 'Weather Test AOI',
      fieldKey: 'weather-test',
      areaHa: 10,
      centroidLng: 45.4,
      centroidLat: 9.4,
    },
    period: { from: '2026-07-01', to: '2026-07-03', acquisitionDate: '2026-07-03' },
    layerIds: ['NDVI'],
    charts: {
      labels: ['2026-07-01', '2026-07-02', '2026-07-03'],
      displayLabels: ['01 Jul', '02 Jul', '03 Jul'],
      series: [{ layerId: 'NDVI', values: [0.31, 0.38, 0.44] }],
    },
    statistics: [],
    interpretations: [],
    primaryInterpretation: null,
    executive: {} as TimeSeriesReportPayload['executive'],
    geometry: null,
    mapImageDataUrl: null,
    mapSnapshotGroups: [],
    cumulativeMapSnapshotGroups: [],
    lulcMapSnapshotGroups: [],
    lulcYearCompositions: [],
    lulcChangeCompositions: [],
    changeDetectionMapSnapshotGroups: [],
    vegetationCoverageTimeline: [],
    estimatedWaterLossTimeline: [],
    weatherTimeline: {
      timezone: 'UTC',
      lat: 9.4,
      lng: 45.4,
      aggregation: 'day',
      dataSource: 'Open-Meteo ERA5 archive (AOI centroid)',
      points: [
        { periodKey: '2026-07-01', displayLabel: '01 Jul', temperatureC: 24, humidityPct: 55, rainfallMm: 0, windSpeedMs: 2.1 },
        { periodKey: '2026-07-02', displayLabel: '02 Jul', temperatureC: 25, humidityPct: 52, rainfallMm: 4, windSpeedMs: 2.4 },
        { periodKey: '2026-07-03', displayLabel: '03 Jul', temperatureC: 26, humidityPct: 50, rainfallMm: 1, windSpeedMs: 2.8 },
      ],
      hourlyPoints: [
        {
          time: '2026-07-01T12:00',
          temperatureC: 24,
          weatherCode: 1,
          precipitationMm: 0,
          snowfallCm: 0,
          humidityPct: 55,
          windSpeedKmh: 7.5,
          windDirectionDeg: 90,
          pressureHpa: 1012,
          et0Mm: 0.2,
          shortwaveRadiationWm2: 500,
        },
      ],
      summary: {
        avgTemperatureC: 25,
        totalRainfallMm: 5,
        avgHumidityPct: 52.3,
        avgWindSpeedMs: 2.43,
      },
      correlationNotes: ['vegetation vigor (NDVI) shows a positive association with temperature.'],
    },
    correlationBlocks: [],
    cropRecommendations: [],
  }
}

describe('time-series weather Excel report', () => {
  it('builds linked data, analysis, hourly data, and native charts without pictures', async () => {
    const wb = await buildTimeSeriesWeatherWorkbook(payload())
    expect(wb.worksheets.map(sheet => sheet.name)).toEqual([
      'Weather & Indices',
      'Hourly Weather',
      'Analysis',
      'Native Charts',
    ])
    expect(wb.__weatherChartSpecs).toHaveLength(4)
    expect(wb.getWorksheet('Analysis')?.getCell('C13').value).toMatchObject({
      formula: expect.stringContaining('CORREL'),
    })

    const raw = await wb.xlsx.writeBuffer()
    const output = await injectNativeMeteoCharts(
      raw as ArrayBuffer,
      wb.__weatherChartSpecs ?? [],
      'Native Charts',
    )
    const zip = await JSZip.loadAsync(output)
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy()
    const chartXml = await zip.file('xl/charts/chart1.xml')!.async('string')
    expect(chartXml).toContain("'Weather &amp; Indices'!")
    expect(Object.keys(zip.files).filter(path => path.startsWith('xl/media/'))).toHaveLength(0)
  })
})
