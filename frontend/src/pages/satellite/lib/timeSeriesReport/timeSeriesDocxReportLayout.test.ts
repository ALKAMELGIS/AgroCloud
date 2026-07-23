import { describe, expect, it } from 'vitest'
import {
  buildDocxChartXml,
  buildPerLayerNativeChartSpecs,
  buildWeatherNativeChartSpecs,
} from './timeSeriesDocxNativeCharts'
import { lulcReportYears, lulcYearSceneDate } from './timeSeriesLulcChangeMaps'
import { MAPS_PER_PAGE, MAPS_PER_ROW, docxMapGrid } from './timeSeriesDocxXml'

describe('timeSeriesDocxNativeCharts', () => {
  it('builds one chart per layer with data', () => {
    const specs = buildPerLayerNativeChartSpecs({
      labels: ['2026-04-27', '2026-05-09'],
      displayLabels: ['27 Apr', '09 May'],
      series: [
        { layerId: 'NDVI', values: [0.4, 0.35] },
        { layerId: 'ET', values: [4.9, 4.5] },
        { layerId: 'EMPTY', values: [null, null] },
      ],
    })
    expect(specs).toHaveLength(2)
    expect(specs[0]?.title).toBe('NDVI Trend')
    expect(specs[1]?.rId).toBe('rIdChart2')
    const xml = buildDocxChartXml(specs[0]!)
    expect(xml).toContain('<c:chartSpace')
    expect(xml).toContain('NDVI')
    expect(xml).toContain('<c:numLit>')
  })

  it('builds Excel-style dual weather charts (not a 4-axis PNG)', () => {
    const specs = buildWeatherNativeChartSpecs({
      aggregationLabel: 'Weekly',
      startIndex: 2,
      points: [
        {
          displayLabel: '2026 W14',
          temperatureC: 24,
          humidityPct: 55,
          rainfallMm: 0.4,
          windSpeedMs: 2.1,
        },
        {
          displayLabel: '2026 W15',
          temperatureC: 26,
          humidityPct: 48,
          rainfallMm: 0.7,
          windSpeedMs: 2.4,
        },
      ],
    })
    expect(specs).toHaveLength(2)
    expect(specs[0]?.rId).toBe('rIdChart3')
    expect(specs[0]?.title).toContain('Temperature')
    expect(specs[0]?.series.some(s => s.secondaryAxis)).toBe(true)
    expect(specs[1]?.kind).toBe('combo')
    const comboXml = buildDocxChartXml(specs[1]!)
    expect(comboXml).toContain('<c:barChart>')
    expect(comboXml).toContain('<c:lineChart>')
    expect(comboXml).toContain('Rainfall')
  })

  it('builds Temp Max·Mean·Min day/month/year, cumulative rain, humidity, pie, and index comparisons', () => {
    const specs = buildWeatherNativeChartSpecs({
      aggregationLabel: 'Daily',
      startIndex: 0,
      points: [],
      daily: [
        { date: '2026-01-01', tempMeanC: 18, tempMinC: 12, tempMaxC: 24, humidityPct: 50, rainfallMm: 2 },
        { date: '2026-01-02', tempMeanC: 19, tempMinC: 13, tempMaxC: 25, humidityPct: 52, rainfallMm: 0 },
        { date: '2026-02-01', tempMeanC: 20, tempMinC: 14, tempMaxC: 26, humidityPct: 55, rainfallMm: 5 },
      ],
      monthly: [
        {
          label: 'Jan 2026',
          tempMeanC: 18.5,
          tempMinC: 12,
          tempMaxC: 25,
          humidityPct: 51,
          rainfallMm: 40,
          rainfallSharePct: 40,
          cumulativeRainfallMm: 40,
        },
        {
          label: 'Feb 2026',
          tempMeanC: 20,
          tempMinC: 14,
          tempMaxC: 26,
          humidityPct: 55,
          rainfallMm: 60,
          rainfallSharePct: 60,
          cumulativeRainfallMm: 100,
        },
      ],
      yearly: [
        {
          label: '2026',
          tempMeanC: 19,
          tempMinC: 12,
          tempMaxC: 26,
          humidityPct: 53,
          rainfallMm: 100,
        },
      ],
      indexCompare: {
        categories: ['Jan 2026', 'Feb 2026'],
        tempMean: [18.5, 20],
        tempMin: [12, 14],
        tempMax: [25, 26],
        rainfall: [40, 60],
        humidity: [51, 55],
        ndvi: [0.4, 0.45],
        ndmi: [0.2, 0.22],
        ndwi: [0.1, 0.12],
        savi: [0.35, 0.38],
      },
    })
    const titles = specs.map(s => s.title)
    expect(titles.some(t => t.includes('Daily'))).toBe(true)
    expect(titles.some(t => t.includes('Monthly') && t.includes('Temperature'))).toBe(true)
    expect(titles.some(t => t.includes('Yearly'))).toBe(true)
    expect(titles.some(t => t.includes('Cumulative Rainfall'))).toBe(true)
    expect(titles.some(t => t.includes('Humidity'))).toBe(true)
    expect(titles.some(t => t.includes('Share'))).toBe(true)
    expect(titles.some(t => t.includes('vs NDVI'))).toBe(true)
    expect(titles.some(t => t.includes('Rainfall vs'))).toBe(true)
    expect(titles.some(t => t.includes('Humidity vs'))).toBe(true)
    const pie = specs.find(s => s.kind === 'pie')
    expect(pie).toBeTruthy()
    const pieXml = buildDocxChartXml(pie!)
    expect(pieXml).toContain('<c:pieChart>')
    expect(pieXml).toContain('showPercent')
  })
})

describe('lulc five-year helpers', () => {
  it('returns 2021–2025 mid-season dates', () => {
    expect(lulcReportYears()).toEqual([2021, 2022, 2023, 2024, 2025])
    expect(lulcYearSceneDate(2021)).toBe('2021-07-15')
  })
})

describe('docxMapGrid layout', () => {
  it('uses 2 maps per row and page-breaks after 4', () => {
    expect(MAPS_PER_ROW).toBe(2)
    expect(MAPS_PER_PAGE).toBe(4)
    const xml = docxMapGrid([
      { rId: 'rIdImg1', date: 'd1', label: 'a' },
      { rId: 'rIdImg2', date: 'd2', label: 'b' },
      { rId: 'rIdImg3', date: 'd3', label: 'c' },
      { rId: 'rIdImg4', date: 'd4', label: 'd' },
      { rId: 'rIdImg5', date: 'd5', label: 'e' },
    ])
    expect(xml).toContain('w:br w:type="page"')
    expect((xml.match(/<w:tbl>/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
