import { describe, expect, it } from 'vitest'
import {
  aggregateTopShareCategories,
  buildDocxChartXml,
  buildPerLayerNativeChartSpecs,
  buildVegetationCoverageChartInterpretation,
  buildVegetationCoverageTimelineChartSpecs,
  buildWeatherNativeChartSpecs,
} from './timeSeriesDocxNativeCharts'
import { lulcReportYears, lulcYearSceneDate } from './timeSeriesLulcChangeMaps'
import {
  MAPS_PER_PAGE,
  MAPS_PER_ROW,
  MAP_IMAGE_CX,
  MAP_IMAGE_CY,
  docxMapGrid,
  docxTableOfContentsPage,
} from './timeSeriesDocxXml'

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

  it('builds Temp Max·Mean·Min day/month/year, cumulative rain, humidity, share bar, and index comparisons', () => {
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
          label: '2025',
          tempMeanC: 19,
          tempMinC: 12,
          tempMaxC: 26,
          humidityPct: 53,
          rainfallMm: 80,
        },
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
    expect(titles.some(t => t.includes('Daily'))).toBe(false)
    expect(titles.some(t => t.includes('Monthly') && t.includes('Temperature'))).toBe(true)
    expect(titles.some(t => t.includes('Yearly'))).toBe(true)
    expect(titles.some(t => t.includes('Cumulative Rainfall'))).toBe(false)
    expect(titles.some(t => t.includes('Monthly Rainfall Total'))).toBe(true)
    expect(titles.some(t => t.includes('Humidity'))).toBe(true)
    expect(titles.some(t => t.includes('Top Months') && t.includes('Share'))).toBe(true)
    expect(titles.some(t => t.includes('Annual Rainfall Share'))).toBe(true)
    expect(titles.some(t => t.includes('vs NDVI'))).toBe(true)
    expect(titles.some(t => t.includes('Rainfall vs'))).toBe(true)
    expect(titles.some(t => t.includes('Humidity vs'))).toBe(true)
    const rainBar = specs.find(s => s.title.includes('Monthly Rainfall Total'))
    expect(rainBar?.xAxisLabel).toBe('Month')
    expect(rainBar?.yAxisLabel).toBe('Rainfall (mm)')
    const rainXml = buildDocxChartXml(rainBar!)
    expect(rainXml).toContain('<c:overlay val="0"/>')
    expect(rainXml).toContain('<c:manualLayout>')
    expect(rainXml).toContain('Rainfall (mm)')
    expect(rainXml).toContain('Month')
    const shareBar = specs.find(s => s.title.includes('Top Months'))
    expect(shareBar?.kind).toBe('bar')
    expect(shareBar?.barDir).toBe('bar')
    const shareXml = buildDocxChartXml(shareBar!)
    expect(shareXml).toContain('<c:barDir val="bar"/>')
    expect(shareXml).not.toContain('<c:legend>')
    const pie = specs.find(s => s.kind === 'pie')
    expect(pie?.title).toContain('Annual Rainfall Share')
    const pieXml = buildDocxChartXml(pie!)
    expect(pieXml).toContain('<c:pieChart>')
    expect(pieXml).toContain('showPercent')
    expect(pieXml).toContain('<c:showCatName val="0"/>')
    expect(pieXml).toContain('<c:legendPos val="r"/>')
  })

  it('aggregates long rainfall share series into top-N + Other', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      label: `M${i + 1}`,
      value: 20 - i,
    }))
    const capped = aggregateTopShareCategories(rows, 8)
    expect(capped.labels).toHaveLength(8)
    expect(capped.labels[capped.labels.length - 1]).toBe('Other')
    expect(capped.values.reduce((a, b) => a + b, 0)).toBe(rows.reduce((a, b) => a + b.value, 0))
  })

  it('builds vegetation coverage statistical timeline charts', () => {
    const timeline = [
      {
        date: '2025-01-15',
        ndviMean: 0.32,
        vegetationCoveragePct: 55,
        bareCoveragePct: 45,
        classes: [
          { tier: 'healthy', pct: 20 },
          { tier: 'moderate', pct: 25 },
          { tier: 'stress', pct: 10 },
          { tier: 'critical', pct: 45 },
        ],
      },
      {
        date: '2025-06-15',
        ndviMean: 0.48,
        vegetationCoveragePct: 72,
        bareCoveragePct: 28,
        classes: [
          { tier: 'healthy', pct: 40 },
          { tier: 'moderate', pct: 22 },
          { tier: 'stress', pct: 10 },
          { tier: 'critical', pct: 28 },
        ],
      },
    ]
    const specs = buildVegetationCoverageTimelineChartSpecs({ timeline, startIndex: 10 })
    expect(specs).toHaveLength(1)
    expect(specs[0]?.title).toContain('Statistical Chart')
    expect(specs[0]?.kind).toBe('combo')
    expect(specs[0]?.rId).toBe('rIdChart11')
    expect(specs.some(s => s.title.includes('Class Share'))).toBe(false)
    const xml = buildDocxChartXml(specs[0]!)
    expect(xml).toContain('<c:barChart>')
    expect(xml).toContain('<c:lineChart>')
    expect(xml).toContain('Vegetation Coverage')
    const note = buildVegetationCoverageChartInterpretation(timeline)
    expect(note).toMatch(/increased|72\.0%/)
  })
})

describe('lulc five-year helpers', () => {
  it('returns 2021–2025 mid-season dates', () => {
    expect(lulcReportYears()).toEqual([2021, 2022, 2023, 2024, 2025])
    expect(lulcYearSceneDate(2021)).toBe('2021-07-15')
  })
})

describe('docxMapGrid layout', () => {
  it('uses 3×4 grid (12 maps per page) like the T-23 atlas', () => {
    expect(MAPS_PER_ROW).toBe(3)
    expect(MAPS_PER_PAGE).toBe(12)
    expect(MAP_IMAGE_CX).toBe(2057400)
    expect(MAP_IMAGE_CY).toBe(1543050)
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      rId: `rIdImg${i + 1}`,
      date: `2022-0${(i % 9) + 1}-01`,
      label: `NDVI 0.4${i}`,
    }))
    const xmlPage = docxMapGrid(twelve)
    expect(xmlPage).not.toContain('w:br w:type="page"')
    expect((xmlPage.match(/<w:tr>/g) ?? []).length).toBe(4)

    const thirteen = [...twelve, { rId: 'rIdImg13', date: '2023-01-01', label: 'NDVI 0.5' }]
    const xmlNext = docxMapGrid(thirteen)
    expect(xmlNext).toContain('w:br w:type="page"')
    expect((xmlNext.match(/<w:gridCol /g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('docxChangePairMaps layout', () => {
  it('uses two equal side-by-side map cards (no empty third column)', async () => {
    const { docxChangePairMaps, PAIR_MAP_IMAGE_CX, PAIR_MAP_IMAGE_CY } = await import(
      './timeSeriesDocxXml'
    )
    expect(PAIR_MAP_IMAGE_CX).toBeGreaterThan(MAP_IMAGE_CX)
    expect(PAIR_MAP_IMAGE_CY).toBeGreaterThan(MAP_IMAGE_CY)
    const xml = docxChangePairMaps([
      { rId: 'rIdT0', date: '2025-02-21', label: 'NDVI 0.4057' },
      { rId: 'rIdT1', date: '2025-03-03', label: 'NDVI 0.3882' },
    ])
    expect((xml.match(/<w:gridCol /g) ?? []).length).toBe(2)
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(1)
    expect(xml).toContain('rIdT0')
    expect(xml).toContain('rIdT1')
    expect(xml).toContain('2025-02-21 NDVI 0.4057')
    expect(xml).not.toContain('w:br w:type="page"')
  })
})

describe('docxTableOfContentsPage', () => {
  it('lists main headings only with Word TOC outline 1-1 and page leader', () => {
    const xml = docxTableOfContentsPage([
      'Field Summary',
      'Executive Summary',
      'Annex A — Correlation Analysis',
      'Annex B — Paired Values Tables',
    ])
    expect(xml).toContain('TOC \\o "1-1"')
    expect(xml).not.toContain('TOC \\o "1-2"')
    expect(xml).toContain('Field Summary')
    expect(xml).toContain('Executive Summary')
    expect(xml).toContain('Annex A — Correlation Analysis')
    expect(xml).toContain('Annex B — Paired Values Tables')
    expect(xml).toContain('w:tab w:val="right" w:leader="dot"')
    expect(xml).toContain('Main section titles only')
  })
})

describe('resolveIndexChartColor', () => {
  it('uses analysis-based palette by index family', async () => {
    const { resolveIndexChartColor } = await import('./timeSeriesDocxNativeCharts')
    expect(resolveIndexChartColor('NDVI')).toBe('047857')
    expect(resolveIndexChartColor('SAVI')).toBe('047857')
    expect(resolveIndexChartColor('NDWI')).toBe('2563EB')
    expect(resolveIndexChartColor('NDMI')).toBe('0D9488')
    expect(resolveIndexChartColor('LST')).toBe('DC2626')
    expect(resolveIndexChartColor('STRESS_ZONES')).toBe('CA8A04')
  })
})
