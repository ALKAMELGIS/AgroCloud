import ExcelJS from 'exceljs'
import {
  WEATHER_COMPARE_METRICS,
  buildWeatherIndexInterpretation,
} from '../imageryWeatherCompare'
import {
  injectNativeMeteoCharts,
  type MeteoNativeChartSpec,
} from '../weatherClimateReport/meteoNativeExcelCharts'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

const SHEET = {
  data: 'Weather & Indices',
  hourly: 'Hourly Weather',
  analysis: 'Analysis',
  charts: 'Native Charts',
} as const

const HEADER_FILL = 'FF065F46'
const SECTION_FILL = 'FFDBEAFE'
const ALT_FILL = 'FFF8FAFC'
const BORDER = 'FFD1D5DB'

function colLetter(col: number): string {
  let n = col
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER } },
      bottom: { style: 'thin', color: { argb: BORDER } },
      left: { style: 'thin', color: { argb: BORDER } },
      right: { style: 'thin', color: { argb: BORDER } },
    }
  })
  row.height = 28
}

function styleRows(ws: ExcelJS.Worksheet, fromRow: number, toRow: number): void {
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r)
    row.eachCell(cell => {
      if ((r - fromRow) % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_FILL } }
      }
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  }
}

function autoWidth(ws: ExcelJS.Worksheet, maxCol: number, cap = 42): void {
  for (let c = 1; c <= maxCol; c++) {
    let width = 11
    ws.eachRow(row => {
      const value = row.getCell(c).value
      const len = value == null ? 0 : String(value).length
      width = Math.min(cap, Math.max(width, len + 2))
    })
    ws.getColumn(c).width = width
  }
}

function numeric(value: number | null | undefined, digits = 3): number | '' {
  return value != null && Number.isFinite(value) ? Number(value.toFixed(digits)) : ''
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 50) || 'AOI'
}

function downloadWorkbook(bytes: Uint8Array, filename: string): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function buildTimeSeriesWeatherWorkbook(
  payload: TimeSeriesReportPayload,
): Promise<ExcelJS.Workbook & { __weatherChartSpecs?: MeteoNativeChartSpec[] }> {
  if (!payload.weatherTimeline) {
    throw new Error('Weather data is unavailable for this AOI and date range.')
  }

  const weather = payload.weatherTimeline
  const wb = new ExcelJS.Workbook() as ExcelJS.Workbook & {
    __weatherChartSpecs?: MeteoNativeChartSpec[]
  }
  wb.creator = payload.generatedBy
  wb.company = payload.projectName
  wb.created = new Date()
  wb.title = `Weather and vegetation-index analysis — ${payload.location.fieldName}`

  const dataWs = wb.addWorksheet(SHEET.data, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const indexSeries = payload.charts.series.filter(series =>
    series.values.some(value => value != null && Number.isFinite(value)),
  )
  const dataHeaders = [
    'Period Key',
    'Period',
    'Temperature (°C)',
    'Humidity (%)',
    'Rainfall (mm)',
    'Wind Speed (m/s)',
    ...indexSeries.map(series => `${series.layerId.toUpperCase()} Index`),
  ]
  const dataHeader = dataWs.addRow(dataHeaders)
  styleHeader(dataHeader)
  weather.points.forEach((point, i) => {
    dataWs.addRow([
      point.periodKey,
      point.displayLabel,
      numeric(point.temperatureC, 2),
      numeric(point.humidityPct, 2),
      numeric(point.rainfallMm, 2),
      numeric(point.windSpeedMs, 3),
      ...indexSeries.map(series => numeric(series.values[i], 4)),
    ])
  })
  const dataLastRow = weather.points.length + 1
  styleRows(dataWs, 2, dataLastRow)
  if (weather.points.length) {
    dataWs.addTable({
      name: 'WeatherIndexData',
      ref: `A1:${colLetter(dataHeaders.length)}${dataLastRow}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: dataHeaders.map(name => ({ name, filterButton: true })),
      rows: [],
    })
  }
  autoWidth(dataWs, dataHeaders.length)

  const hourlyWs = wb.addWorksheet(SHEET.hourly, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const hourlyHeaders = [
    'Date/Time',
    'Temperature (°C)',
    'Humidity (%)',
    'Precipitation (mm)',
    'Snowfall (cm)',
    'Wind Speed (km/h)',
    'Wind Direction (°)',
    'Pressure (hPa)',
    'ET₀ (mm)',
    'Solar Radiation (W/m²)',
    'Weather Code',
  ]
  styleHeader(hourlyWs.addRow(hourlyHeaders))
  weather.hourlyPoints.forEach(point => {
    hourlyWs.addRow([
      point.time,
      numeric(point.temperatureC, 2),
      numeric(point.humidityPct, 2),
      numeric(point.precipitationMm, 2),
      numeric(point.snowfallCm, 2),
      numeric(point.windSpeedKmh, 2),
      numeric(point.windDirectionDeg, 1),
      numeric(point.pressureHpa, 2),
      numeric(point.et0Mm, 3),
      numeric(point.shortwaveRadiationWm2, 1),
      point.weatherCode,
    ])
  })
  styleRows(hourlyWs, 2, weather.hourlyPoints.length + 1)
  if (weather.hourlyPoints.length) {
    hourlyWs.addTable({
      name: 'HourlyWeatherData',
      ref: `A1:K${weather.hourlyPoints.length + 1}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: hourlyHeaders.map(name => ({ name, filterButton: true })),
      rows: [],
    })
  }
  autoWidth(hourlyWs, hourlyHeaders.length)

  const analysisWs = wb.addWorksheet(SHEET.analysis, {
    views: [{ state: 'frozen', ySplit: 5 }],
  })
  analysisWs.mergeCells('A1:F1')
  analysisWs.getCell('A1').value = 'WEATHER ↔ VEGETATION INDEX ANALYSIS'
  analysisWs.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  analysisWs.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF064E3B' },
  }
  analysisWs.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  analysisWs.getCell('A2').value = 'AOI'
  analysisWs.getCell('B2').value = payload.location.fieldName
  analysisWs.getCell('A3').value = 'Period'
  analysisWs.getCell('B3').value = `${payload.period.from} → ${payload.period.to}`
  analysisWs.getCell('D2').value = 'Source'
  analysisWs.getCell('E2').value = weather.dataSource
  analysisWs.getCell('D3').value = 'Aggregation'
  analysisWs.getCell('E3').value = weather.aggregation

  const summaryRow = analysisWs.getRow(5)
  ;['Metric', 'Value', 'Unit', 'Data Source', 'Latitude', 'Longitude'].forEach((value, i) => {
    summaryRow.getCell(i + 1).value = value
  })
  styleHeader(summaryRow)
  const summary = [
    ['Average Temperature', numeric(weather.summary.avgTemperatureC, 2), '°C'],
    ['Total Rainfall', numeric(weather.summary.totalRainfallMm, 2), 'mm'],
    ['Average Humidity', numeric(weather.summary.avgHumidityPct, 2), '%'],
    ['Average Wind Speed', numeric(weather.summary.avgWindSpeedMs, 3), 'm/s'],
  ]
  summary.forEach((row, i) => {
    analysisWs.addRow([
      ...row,
      weather.dataSource,
      numeric(weather.lat, 5),
      numeric(weather.lng, 5),
    ])
  })
  styleRows(analysisWs, 6, 9)

  const analysisStart = 12
  const analysisHeader = analysisWs.getRow(analysisStart)
  ;['Weather Parameter', 'Vegetation Index', 'Pearson r', 'R²', 'Interpretation', 'Correlation Note'].forEach(
    (value, i) => {
      analysisHeader.getCell(i + 1).value = value
    },
  )
  styleHeader(analysisHeader)

  let analysisRow = analysisStart + 1
  for (const metric of WEATHER_COMPARE_METRICS) {
    const weatherCol = {
      temperature: 3,
      humidity: 4,
      rainfall: 5,
      wind: 6,
    }[metric.id]
    for (let index = 0; index < indexSeries.length; index++) {
      const series = indexSeries[index]!
      const indexCol = 7 + index
      const interpretation = buildWeatherIndexInterpretation(
        metric.id,
        weather.points,
        series.layerId,
        series.values,
        weather.summary,
      )
      const note =
        weather.correlationNotes.find(item =>
          item.toUpperCase().includes(series.layerId.toUpperCase()),
        ) ?? 'Interpret correlation together with field observations and crop stage.'
      const weatherRange = `'${SHEET.data}'!$${colLetter(weatherCol)}$2:$${colLetter(weatherCol)}$${dataLastRow}`
      const indexRange = `'${SHEET.data}'!$${colLetter(indexCol)}$2:$${colLetter(indexCol)}$${dataLastRow}`
      analysisWs.getCell(analysisRow, 1).value = `${metric.label} (${metric.unit})`
      analysisWs.getCell(analysisRow, 2).value = series.layerId.toUpperCase()
      analysisWs.getCell(analysisRow, 3).value = {
        formula: `IFERROR(CORREL(${weatherRange},${indexRange}),"")`,
        result: undefined,
      }
      analysisWs.getCell(analysisRow, 4).value = {
        formula: `IF(C${analysisRow}="","",C${analysisRow}^2)`,
        result: undefined,
      }
      analysisWs.getCell(analysisRow, 5).value = interpretation
      analysisWs.getCell(analysisRow, 6).value = note
      analysisRow++
    }
  }
  styleRows(analysisWs, analysisStart + 1, analysisRow - 1)
  analysisWs.getColumn(5).width = 72
  analysisWs.getColumn(6).width = 72
  for (let c = 1; c <= 4; c++) analysisWs.getColumn(c).width = c <= 2 ? 22 : 14

  const chartWs = wb.addWorksheet(SHEET.charts)
  chartWs.getColumn(1).width = 24
  chartWs.getCell('A1').value = 'Native editable charts linked to Weather & Indices data'
  chartWs.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF064E3B' } }
  chartWs.getCell('A2').value =
    'Charts are generated as native Excel OOXML objects. Edit the source table to refresh them.'
  chartWs.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }

  const chartSpecs: MeteoNativeChartSpec[] = WEATHER_COMPARE_METRICS.map((metric, i) => {
    const weatherCol = {
      temperature: 3,
      humidity: 4,
      rainfall: 5,
      wind: 6,
    }[metric.id]
    const series = [
      {
        nameRef: `'${SHEET.data}'!$${colLetter(weatherCol)}$1`,
        valuesRef: `'${SHEET.data}'!$${colLetter(weatherCol)}$2:$${colLetter(weatherCol)}$${dataLastRow}`,
        catsRef: `'${SHEET.data}'!$B$2:$B$${dataLastRow}`,
      },
      ...indexSeries.map((indexSeriesItem, index) => {
        const indexCol = 7 + index
        return {
          nameRef: `'${SHEET.data}'!$${colLetter(indexCol)}$1`,
          valuesRef: `'${SHEET.data}'!$${colLetter(indexCol)}$2:$${colLetter(indexCol)}$${dataLastRow}`,
          catsRef: `'${SHEET.data}'!$B$2:$B$${dataLastRow}`,
        }
      }),
    ]
    return {
      title: `${metric.label} vs ${indexSeries.map(item => item.layerId.toUpperCase()).join(', ')}`,
      kind: 'combo',
      series,
      lineSeriesIndexes: indexSeries.map((_, index) => index + 1),
      anchorRow: i < 2 ? 3 : 21,
      anchorCol: i % 2 === 0 ? 0 : 10,
      sectionLabel: `${metric.label} comparison`,
      varyColors: false,
      legendPos: 'b',
    }
  })
  wb.__weatherChartSpecs = chartSpecs
  return wb
}

export async function generateTimeSeriesWeatherReportExcel(
  payload: TimeSeriesReportPayload,
): Promise<void> {
  const wb = await buildTimeSeriesWeatherWorkbook(payload)
  const raw = await wb.xlsx.writeBuffer()
  const output = await injectNativeMeteoCharts(
    raw as ArrayBuffer,
    wb.__weatherChartSpecs ?? [],
    SHEET.charts,
  )
  const date = new Date().toISOString().slice(0, 10)
  downloadWorkbook(
    output,
    `${safeFilename(payload.location.fieldName)}-Weather-Index-Analysis-${date}.xlsx`,
  )
}
