import { describe, expect, it } from 'vitest'
import { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import { classifySeriesTrend, computeLayerStatistics } from './buildTimeSeriesReportPayload'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

function samplePayload(): TimeSeriesReportPayload {
  const executive = buildTimeSeriesExecutiveSummary({
    primary: {
      layerId: 'NDVI',
      sceneDate: '2026-07-05',
      mean: 0.48,
      meanLabel: 'Moderate vigor',
      meanTier: 'moderate',
      min: 0.2,
      max: 0.7,
      stdDev: 0.1,
      meanColor: '#eab308',
      totalAreaHa: 100,
      totalAreaM2: 1_000_000,
      coverage: [
        { tier: 'healthy', label: 'Healthy vegetation', pct: 49.4, color: '#22c55e', areaHa: 49.4, areaM2: 494000 },
        { tier: 'moderate', label: 'Moderate vigor', pct: 14.6, color: '#eab308', areaHa: 14.6, areaM2: 146000 },
        { tier: 'stress', label: 'Stressed vegetation', pct: 26.2, color: '#f97316', areaHa: 26.2, areaM2: 262000 },
        { tier: 'critical', label: 'Bare / no cover', pct: 9.7, color: '#ef4444', areaHa: 9.7, areaM2: 97000 },
      ],
      summaryLine: 'Summary',
      coverageLine: 'Coverage line',
      actionsLine: 'Actions',
      actions: [],
      lines: [],
      areasFromHistogram: false,
    },
    ndviMean: 0.48,
    ndmiMean: 0.12,
    ndwiMean: 0.1,
    saviMean: 0.41,
    ndwiEstimated: true,
    saviEstimated: true,
    acquisitionDate: '2026-07-05',
    ndviStats: { layerId: 'NDVI', mean: 0.48, min: 0.39, max: 0.69, trend: 'Stable' },
    ndmiStats: { layerId: 'NDMI', mean: 0.12, min: -0.05, max: 0.3, trend: 'Stable' },
  })
  return {
    projectName: 'AgroCloud Satellite Intelligence',
    generatedAt: '2026-07-08T06:39:39.000Z',
    generatedBy: 'AgroCloud',
    location: { fieldName: 'Drawn AOI', fieldKey: 'aoi', areaHa: 1836.1, centroidLng: null, centroidLat: null },
    period: { from: '2021-01-01', to: '2026-07-08', acquisitionDate: '2026-07-05' },
    layerIds: ['NDVI', 'NDMI', 'NDWI', 'SAVI'],
    charts: {
      labels: ['2026-W16', '2026-W28'],
      displayLabels: ['2026-W16', '2026-W28'],
      periodAnchorDates: {
        '2026-W16': '2026-04-16',
        '2026-W28': '2026-07-09',
      },
      series: [
        { layerId: 'NDVI', values: [0.5, 0.39] },
        { layerId: 'NDMI', values: [0.08, -0.01] },
        { layerId: 'NDWI', values: [-0.53, -0.42] },
        { layerId: 'SAVI', values: [0.5, 0.39] },
      ],
    },
    statistics: [
      { layerId: 'NDVI', mean: 0.445, min: 0.39, max: 0.5, trend: 'Decreasing' },
      { layerId: 'NDMI', mean: 0.035, min: -0.01, max: 0.08, trend: 'Decreasing' },
    ],
    interpretations: [],
    primaryInterpretation: {
      layerId: 'NDVI',
      sceneDate: '2026-07-05',
      mean: 0.48,
      meanLabel: 'Moderate vigor',
      meanTier: 'moderate',
      min: 0.2,
      max: 0.7,
      stdDev: 0.1,
      meanColor: '#eab308',
      totalAreaHa: 100,
      totalAreaM2: 1_000_000,
      coverage: [
        { tier: 'healthy', label: 'Healthy vegetation', pct: 49.4, color: '#22c55e', areaHa: 49.4, areaM2: 494000 },
        { tier: 'moderate', label: 'Moderate vigor', pct: 14.6, color: '#eab308', areaHa: 14.6, areaM2: 146000 },
        { tier: 'stress', label: 'Stressed vegetation', pct: 26.2, color: '#f97316', areaHa: 26.2, areaM2: 262000 },
        { tier: 'critical', label: 'Bare / no cover', pct: 9.7, color: '#ef4444', areaHa: 9.7, areaM2: 97000 },
      ],
      summaryLine: 'Summary',
      coverageLine: 'Coverage line',
      actionsLine: 'Actions',
      actions: [],
      lines: [],
      areasFromHistogram: false,
    },
    executive,
    geometry: null,
    mapImageDataUrl: null,
    mapSnapshotGroups: [],
    cumulativeMapSnapshotGroups: [],
    lulcMapSnapshotGroups: [],
    lulcYearCompositions: [],
    lulcChangeCompositions: [],
    changeDetectionMapSnapshotGroups: [],
    vegetationCoverageTimeline: [
      {
        date: '2026-07-05',
        periodLabel: '2026-W28',
        ndviMean: 0.48,
        ndviMin: 0.2,
        ndviMax: 0.7,
        vegetationCoveragePct: 74,
        vegetationAreaHa: 71.7,
        vegetationAreaM2: 717000,
        bareCoveragePct: 26,
        bareAreaHa: 25.1,
        aoiAreaHa: 96.8,
        aoiAreaM2: 968000,
        dominantClass: 'Moderate vigor',
        dominantTier: 'moderate',
        classes: [
          { tier: 'healthy', label: 'Healthy vegetation', color: '#22c55e', pct: 40, areaHa: 38.7, areaM2: 387000 },
          { tier: 'moderate', label: 'Moderate vigor', color: '#eab308', pct: 34, areaHa: 32.9, areaM2: 329000 },
          { tier: 'stress', label: 'Stressed vegetation', color: '#f97316', pct: 18, areaHa: 17.4, areaM2: 174000 },
          { tier: 'critical', label: 'Bare / no cover', color: '#ef4444', pct: 8, areaHa: 7.7, areaM2: 77000 },
        ],
        source: 'mean-estimate',
        trend: 'Stable',
      },
    ],
    estimatedWaterLossTimeline: [
      {
        date: '2026-07-05',
        periodLabel: '2026-W28',
        moistureScore: 0.16,
        waterLossIndexPct: 84,
        etMmDay: 5.04,
        waterLossM3Day: 4878.7,
        waterLossM3HaDay: 50.4,
        ndmi: 0.12,
        ndwi: 0.1,
        ndwiEstimated: false,
        vegetationCoveragePct: 74,
        vegetationAreaHa: 71.7,
        aoiAreaHa: 96.8,
        waterStressLevel: 'Critical',
        source: 'satellite-index',
        highWaterLoss: true,
        trend: 'Stable',
      },
    ],
    weatherTimeline: null,
    correlationBlocks: [],
    cropRecommendations: [],
  }
}

describe('timeSeriesReport', () => {
  it('classifies increasing trend', () => {
    const values = [0.2, 0.22, 0.25, 0.3, 0.35, 0.4]
    expect(classifySeriesTrend(values)).toBe('Increasing')
  })

  it('classifies stable trend for small changes', () => {
    const values = [0.4, 0.41, 0.39, 0.4, 0.41, 0.4]
    expect(classifySeriesTrend(values)).toBe('Stable')
  })

  it('computes layer statistics', () => {
    const stats = computeLayerStatistics('NDVI', ['a', 'b'], [0.3, 0.5])
    expect(stats.mean).toBeCloseTo(0.4)
    expect(stats.min).toBe(0.3)
    expect(stats.max).toBe(0.5)
  })

  it('builds executive summary narrative', () => {
    const summary = buildTimeSeriesExecutiveSummary({
      primary: {
        layerId: 'NDVI',
        sceneDate: '2025-06-01',
        mean: 0.52,
        meanLabel: 'Moderate vigor',
        meanTier: 'moderate',
        min: 0.2,
        max: 0.7,
        stdDev: 0.1,
        meanColor: '#eab308',
        totalAreaHa: 10,
        totalAreaM2: 100000,
        coverage: [
          { tier: 'healthy', label: 'Healthy vegetation', pct: 45, color: '#22c55e', areaHa: 4.5, areaM2: 45000 },
          { tier: 'moderate', label: 'Moderate vigor', pct: 40, color: '#eab308', areaHa: 4, areaM2: 40000 },
          { tier: 'stress', label: 'Stressed vegetation', pct: 10, color: '#f97316', areaHa: 1, areaM2: 10000 },
          { tier: 'critical', label: 'Bare / no cover', pct: 5, color: '#ef4444', areaHa: 0.5, areaM2: 5000 },
        ],
        summaryLine: 'Summary',
        coverageLine: 'Coverage line',
        actionsLine: 'Actions',
        actions: [{ tone: 'warn', text: 'Scout stressed zones' }],
        lines: ['Line 1'],
        areasFromHistogram: false,
      },
      ndviMean: 0.48,
      ndmiMean: 0.12,
      ndwiMean: 0.1,
      saviMean: 0.41,
      ndwiEstimated: true,
      saviEstimated: true,
      acquisitionDate: '2026-07-05',
      ndviStats: { layerId: 'NDVI', mean: 0.5, min: 0.3, max: 0.6, trend: 'Stable' },
      ndmiStats: { layerId: 'NDMI', mean: 0.3, min: 0.2, max: 0.35, trend: 'Increasing' },
    })
    expect(summary.headline).toBe('Agricultural Satellite Intelligence Report')
    expect(summary.indexKpis).toHaveLength(5)
    expect(summary.indexOverview).toHaveLength(4)
    expect(summary.narrative.length).toBeGreaterThan(20)
    expect(summary.recommendations.length).toBeGreaterThan(0)
    expect(summary.moistureStatus).toContain('NDMI')
  })

  it('builds excel workbook with summary, data, veg coverage, map snapshots, and analysis sheets', async () => {
    const { buildTimeSeriesReportWorkbookSync } = await import('./generateTimeSeriesReportExcel')
    const wb = buildTimeSeriesReportWorkbookSync(samplePayload())
    const names = wb.worksheets.map(w => w.name)
    expect(names[0]).toBe('Analytics Summary')
    expect(names[1]).toBe('Time Series Data')
    expect(names).toContain('NDVI Data')
    expect(names).toContain('NDMI Data')
    expect(names).toContain('Vegetation Coverage Timeline')
    expect(names).toContain('Estimated Water Loss Timeline')
    expect(names).toContain('Map Snapshots')
    expect(names).toContain('Analysis & Recommendations')

    const dataSheet = wb.getWorksheet('Time Series Data')!
    expect(dataSheet.getRow(1).getCell(1).value).toBe('Date')
    expect(dataSheet.getRow(1).getCell(3).value).toBe('NDVI')
    expect(dataSheet.getRow(2).getCell(1).value).toBe('2026-04-16')
    expect(dataSheet.getRow(2).getCell(3).value).toBe(0.5)

    const ndviSheet = wb.getWorksheet('NDVI Data')!
    expect(ndviSheet.getRow(2).getCell(1).value).toBe('Date')
    expect(ndviSheet.getRow(2).getCell(2).value).toBe('NDVI mean')
    expect(ndviSheet.getRow(3).getCell(1).value).toBe('2026-04-16')
    expect(ndviSheet.getRow(3).getCell(2).value).toBe(0.5)
    expect(ndviSheet.getRow(4).getCell(1).value).toBe('2026-07-09')
    expect(ndviSheet.getRow(4).getCell(2).value).toBe(0.39)

    const vegSheet = wb.getWorksheet('Vegetation Coverage Timeline')!
    const header = vegSheet.getRow(4)
    expect(header.getCell(8).value).toBe('Class distribution (%)')
    expect(header.getCell(9).value).toBe('Healthy (ha)')
    expect(header.getCell(10).value).toMatch(/Healthy \(m[²2]\)/)
    expect(header.getCell(16).value).toMatch(/Bare \(m[²2]\)/)

    const dataRow = vegSheet.getRow(5)
    expect(dataRow.getCell(9).value).toBe(38.7)
    expect(dataRow.getCell(10).value).toBe(387000)
    expect(dataRow.getCell(15).value).toBe(7.7)
    expect(dataRow.getCell(16).value).toBe(77000)

    const waterSheet = wb.getWorksheet('Estimated Water Loss Timeline')!
    const waterHeader = waterSheet.getRow(4)
    expect(waterHeader.getCell(1).value).toBe('Acquisition Date')
    expect(waterHeader.getCell(2).value).toBe('Estimated Water Loss Index (%)')
    expect(String(waterHeader.getCell(3).value)).toMatch(/Estimated Water Loss \(m/)
    expect(waterHeader.getCell(9).value).toBe('Water Stress Level')
    const waterRow = waterSheet.getRow(5)
    expect(waterRow.getCell(2).value).toBe(84)
    expect(waterRow.getCell(9).value).toBe('Critical')
  })

  it('exports only selected layer raw data when layerIds is a subset', async () => {
    const { buildTimeSeriesReportWorkbookSync } = await import('./generateTimeSeriesReportExcel')
    const payload = samplePayload()
    payload.layerIds = ['NDVI']
    const wb = buildTimeSeriesReportWorkbookSync(payload)
    expect(wb.getWorksheet('NDVI Data')).toBeTruthy()
    expect(wb.getWorksheet('NDMI Data')).toBeUndefined()
    const data = wb.getWorksheet('Time Series Data')!
    expect(data.getRow(1).getCell(3).value).toBe('NDVI')
    expect(data.getRow(1).getCell(4).value).toBe('Vigor Class')
  })
})
