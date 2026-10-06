import ExcelJS from 'exceljs'
import type { OpenMeteoHourlyPoint } from '@/modules/remote-sensing/weather/openMeteoWeather'
import { buildWeatherClimateReportPayload } from '@/modules/remote-sensing/weather/weatherClimateReport/weatherClimateAnalysisEngine'
import type { ClimateExportAggregation } from '@/modules/remote-sensing/weather/weatherClimateReport/weatherClimateReportTypes'
import {
  buildMeteoDataReportWorkbook,
  meteoDataReportFilename,
} from '@/modules/remote-sensing/weather/weatherClimateReport/meteoDataReportExcelWriter'
import type { MeteoNativeChartSpec } from '@/modules/remote-sensing/weather/weatherClimateReport/meteoNativeExcelCharts'
import { fetchOpenMeteoHourlyForDateRange } from '../services/openMeteoWeatherDashboard'
import type { WeatherChartDateRange } from '../config/weatherChartDateRange'
import type { WeatherExcelExportMetricId } from './weatherExcelExportMetrics'
import type { WeatherFarmSite } from '../services/weatherFarmService'

export type WeatherExcelExportInput = {
  locationLabel: string
  lat: number
  lng: number
  startDate: string
  endDate: string
  timeAggregation: ClimateExportAggregation
  metrics: WeatherExcelExportMetricId[]
  compareSites?: WeatherFarmSite[]
  elevationM?: number | null
  signal?: AbortSignal
  onProgress?: (message: string) => void
}

function toHourlyPoints(
  rows: Awaited<ReturnType<typeof fetchOpenMeteoHourlyForDateRange>>,
): OpenMeteoHourlyPoint[] {
  return rows.map(h => ({
    time: h.time,
    temperatureC: h.temperatureC,
    weatherCode: h.weatherCode,
    precipitationMm: h.precipitationMm ?? h.rainMm,
    snowfallCm: null,
    humidityPct: h.humidityPct,
    windSpeedKmh: h.windSpeedKmh,
    windDirectionDeg: h.windDirectionDeg,
    pressureHpa: h.pressureHpa ?? null,
    et0Mm: h.et0Mm ?? null,
    shortwaveRadiationWm2: h.shortwaveRadiationWm2 ?? null,
  }))
}

function finiteMean(vals: Array<number | null | undefined>): number | null {
  const n = vals.filter((v): v is number => v != null && Number.isFinite(v))
  if (!n.length) return null
  return n.reduce((a, b) => a + b, 0) / n.length
}

function finiteSum(vals: Array<number | null | undefined>): number | null {
  const n = vals.filter((v): v is number => v != null && Number.isFinite(v))
  if (!n.length) return null
  return n.reduce((a, b) => a + b, 0)
}

async function appendLocationCompareSheet(
  wb: ExcelJS.Workbook,
  range: WeatherChartDateRange,
  metrics: WeatherExcelExportMetricId[],
  primary: { label: string; lat: number; lng: number },
  compareSites: WeatherFarmSite[],
  signal?: AbortSignal,
): Promise<MeteoNativeChartSpec[]> {
  const specs: MeteoNativeChartSpec[] = []
  const sites = [
    { id: 'primary', label: primary.label, lat: primary.lat, lng: primary.lng },
    ...compareSites.filter(s => s.id !== 'all').map(s => ({ id: s.id, label: s.label, lat: s.lat, lng: s.lng })),
  ]
  if (sites.length < 2) return specs

  const ws = wb.addWorksheet('Location Compare')
  ws.getCell(1, 1).value = 'Location comparison (period average)'
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  ws.mergeCells(1, 1, 1, 6)
  ws.getCell(2, 1).value = `${range.startDate} → ${range.endDate}`
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: 'FF64748B' } }

  const headers = ['Location', 'Avg °C', 'Min °C', 'Max °C', 'Avg RH %', 'Rain mm']
  headers.forEach((h, i) => {
    const c = ws.getCell(4, i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
  })

  let row = 5
  for (const site of sites) {
    const hourly = toHourlyPoints(
      await fetchOpenMeteoHourlyForDateRange(site.lat, site.lng, range, signal),
    )
    const temps = hourly.map(h => h.temperatureC)
    const rh = hourly.map(h => h.humidityPct)
    const rain = hourly.map(h => h.precipitationMm)
    ws.getCell(row, 1).value = site.label
    ws.getCell(row, 2).value = finiteMean(temps)
    ws.getCell(row, 3).value = temps.filter((t): t is number => t != null).length
      ? Math.min(...temps.filter((t): t is number => t != null))
      : null
    ws.getCell(row, 4).value = temps.filter((t): t is number => t != null).length
      ? Math.max(...temps.filter((t): t is number => t != null))
      : null
    ws.getCell(row, 5).value = finiteMean(rh)
    ws.getCell(row, 6).value = finiteSum(rain)
    row++
  }
  const lastRow = row - 1
  if (lastRow >= 5 && metrics.includes('temperature')) {
    specs.push({
      title: 'Average temperature by location',
      kind: 'bar',
      sectionLabel: 'Compare',
      anchorRow: lastRow + 3,
      targetSheet: 'Location Compare',
      legendPos: 'b',
      varyColors: true,
      series: [
        {
          name: 'Avg °C',
          valuesRef: `'Location Compare'!$B$5:$B$${lastRow}`,
          catsRef: `'Location Compare'!$A$5:$A$${lastRow}`,
        },
      ],
    })
  }
  if (lastRow >= 5 && metrics.includes('precipitation')) {
    specs.push({
      title: 'Total rainfall by location',
      kind: 'bar',
      sectionLabel: 'Compare Rain',
      anchorRow: lastRow + 22,
      targetSheet: 'Location Compare',
      legendPos: 'b',
      varyColors: true,
      series: [
        {
          name: 'Rain mm',
          valuesRef: `'Location Compare'!$F$5:$F$${lastRow}`,
          catsRef: `'Location Compare'!$A$5:$A$${lastRow}`,
        },
      ],
    })
  }
  if (lastRow >= 5 && metrics.includes('humidity')) {
    specs.push({
      title: 'Humidity share by location',
      kind: 'pie',
      sectionLabel: 'Compare RH',
      anchorRow: lastRow + 41,
      targetSheet: 'Location Compare',
      legendPos: 'r',
      series: [
        {
          name: 'Avg RH %',
          valuesRef: `'Location Compare'!$E$5:$E$${lastRow}`,
          catsRef: `'Location Compare'!$A$5:$A$${lastRow}`,
        },
      ],
    })
  }
  return specs
}

function writeExportParametersSheet(
  wb: ExcelJS.Workbook,
  input: WeatherExcelExportInput,
): void {
  const ws = wb.addWorksheet('Export Parameters')
  const rows: Array<[string, string]> = [
    ['Location', input.locationLabel],
    ['Latitude', String(input.lat)],
    ['Longitude', String(input.lng)],
    ['Start date', input.startDate],
    ['End date', input.endDate],
    ['Aggregation', input.timeAggregation],
    ['Metrics', input.metrics.join(', ')],
    [
      'Compare locations',
      (input.compareSites ?? []).map(s => s.label).join('; ') || '—',
    ],
    ['Generated', new Date().toISOString()],
    ['Source', 'Open-Meteo via AgroCloud Weather Intelligence'],
  ]
  ws.getCell(1, 1).value = 'Weather Excel export'
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  let r = 3
  for (const [k, v] of rows) {
    ws.getCell(r, 1).value = k
    ws.getCell(r, 1).font = { bold: true }
    ws.getCell(r, 2).value = v
    r++
  }
  ws.columns = [{ width: 22 }, { width: 48 }]
}

export async function exportWeatherIntelligenceExcel(input: WeatherExcelExportInput): Promise<void> {
  const range: WeatherChartDateRange = { startDate: input.startDate, endDate: input.endDate }
  input.onProgress?.('Fetching hourly weather for selected period…')
  const hourlyRows = await fetchOpenMeteoHourlyForDateRange(
    input.lat,
    input.lng,
    range,
    input.signal,
  )
  if (!hourlyRows.length) {
    throw new Error('No weather data for the selected date range. Try a shorter or more recent period.')
  }
  const hourlyRecords = toHourlyPoints(hourlyRows)
  const start = hourlyRecords[0].time.slice(0, 10)
  const end = hourlyRecords[hourlyRecords.length - 1].time.slice(0, 10)

  input.onProgress?.('Building climate analysis…')
  const payload = buildWeatherClimateReportPayload({
    aoiName: input.locationLabel,
    aoiLocation: input.locationLabel,
    lat: input.lat,
    lng: input.lng,
    timezone: 'auto',
    elevationM: input.elevationM ?? null,
    analysisStart: input.startDate,
    analysisEnd: input.endDate,
    loadedStart: start,
    loadedEnd: end,
    hourlyRecords,
    timeAggregation: input.timeAggregation,
  })
  payload.exportMetricFocus = input.metrics

  input.onProgress?.('Creating Excel workbook (data + chart sheets)…')
  const wb = await buildMeteoDataReportWorkbook(payload)
  writeExportParametersSheet(wb, input)

  let extraSpecs: MeteoNativeChartSpec[] = []
  if (input.compareSites?.length) {
    input.onProgress?.('Adding location comparison sheet…')
    extraSpecs = await appendLocationCompareSheet(
      wb,
      range,
      input.metrics,
      { label: input.locationLabel, lat: input.lat, lng: input.lng },
      input.compareSites,
      input.signal,
    )
  }

  const specs = [...(wb.__meteoChartSpecs ?? []), ...extraSpecs]
  const raw = await wb.xlsx.writeBuffer()
  input.onProgress?.('Embedding Excel charts…')
  const { injectNativeMeteoCharts } = await import(
    '@/modules/remote-sensing/weather/weatherClimateReport/meteoNativeExcelCharts'
  )
  const withCharts = await injectNativeMeteoCharts(
    raw as ArrayBuffer,
    specs,
    wb.__chartsSheetName ?? 'Chart Monthly',
  )
  const blob = new Blob([withCharts as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = meteoDataReportFilename(input.locationLabel, input.timeAggregation)
  a.click()
  URL.revokeObjectURL(url)
}
