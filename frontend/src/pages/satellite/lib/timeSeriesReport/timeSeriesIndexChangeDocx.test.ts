import { describe, expect, it } from 'vitest'
import { collectIndexChangePairs } from './timeSeriesLulcChangeMaps'
import { buildTimeSeriesDocxDocumentXml } from './buildTimeSeriesDocxDocument'
import { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import { buildTimeSeriesDocxModel } from './timeSeriesReportDocxModel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

describe('collectIndexChangePairs', () => {
  it('builds consecutive pairs for every adjacent period', () => {
    const valid = [
      { i: 0, date: '2023-07-01', label: '2023', mean: 0.4 },
      { i: 1, date: '2024-07-01', label: '2024', mean: 0.5 },
      { i: 2, date: '2025-07-01', label: '2025', mean: 0.45 },
    ]
    const pairs = collectIndexChangePairs(valid)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]?.from.label).toBe('2023')
    expect(pairs[0]?.to.label).toBe('2024')
    expect(pairs[1]?.from.label).toBe('2024')
    expect(pairs[1]?.to.label).toBe('2025')
  })

  it('soft-caps long day series to maxPairs', () => {
    const valid = Array.from({ length: 40 }, (_, i) => ({
      i,
      date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      label: `d${i}`,
      mean: 0.3 + i * 0.01,
    }))
    const pairs = collectIndexChangePairs(valid, { maxPairs: 12 })
    expect(pairs.length).toBeLessThanOrEqual(12)
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs[0]?.from.i).toBe(0)
  })
})

function tinyPngBase64(): string {
  // 1x1 PNG
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
}

function indexChangePayload(): TimeSeriesReportPayload {
  const executive = buildTimeSeriesExecutiveSummary({
    primary: {
      layerId: 'NDVI',
      sceneDate: '2025-07-15',
      mean: 0.5,
      meanLabel: 'Moderate vigor',
      meanTier: 'moderate',
      min: 0.2,
      max: 0.7,
      stdDev: 0.1,
      meanColor: '#eab308',
      totalAreaHa: 10,
      totalAreaM2: 100_000,
      coverage: [
        { tier: 'healthy', label: 'Healthy vegetation', pct: 50, color: '#22c55e', areaHa: 5, areaM2: 50000 },
        { tier: 'moderate', label: 'Moderate vigor', pct: 20, color: '#eab308', areaHa: 2, areaM2: 20000 },
        { tier: 'stress', label: 'Stressed vegetation', pct: 20, color: '#f97316', areaHa: 2, areaM2: 20000 },
        { tier: 'critical', label: 'Bare / no cover', pct: 10, color: '#ef4444', areaHa: 1, areaM2: 10000 },
      ],
      summaryLine: 'Summary',
      coverageLine: 'Coverage',
      actionsLine: 'Actions',
      actions: [],
      lines: [],
      areasFromHistogram: false,
    },
    ndviMean: 0.5,
    ndmiMean: 0.12,
    ndwiMean: 0.1,
    saviMean: 0.41,
    ndwiEstimated: false,
    saviEstimated: false,
    acquisitionDate: '2025-07-15',
  })

  const png = tinyPngBase64()
  return {
    projectName: 'Test',
    generatedAt: '2026-07-24T00:00:00.000Z',
    generatedBy: 'test',
    location: {
      fieldName: 'Field',
      fieldKey: 'f1',
      areaHa: 10,
      centroidLng: 46.6,
      centroidLat: 24.7,
    },
    period: { from: '2024-01-01', to: '2025-12-31', acquisitionDate: '2025-07-15' },
    layerIds: ['NDVI'],
    charts: {
      labels: ['2024', '2025'],
      displayLabels: ['2024', '2025'],
      series: [{ layerId: 'NDVI', values: [0.4, 0.55], label: 'NDVI', color: '#22c55e' }],
      periodAnchorDates: { '2024': '2024-07-15', '2025': '2025-07-15' },
    },
    statistics: [],
    interpretations: [],
    primaryInterpretation: null,
    executive,
    geometry: null,
    mapImageDataUrl: null,
    mapSnapshotGroups: [],
    cumulativeMapSnapshotGroups: [],
    lulcMapSnapshotGroups: [],
    lulcYearCompositions: [],
    lulcChangeCompositions: [],
    changeDetectionMapSnapshotGroups: [
      {
        layerId: 'CHANGE_NDVI_0_1',
        title: 'Change Detection — NDVI (2024 → 2025)',
        snapshots: [
          {
            layerId: 'NDVI',
            layerLabel: 'NDVI T0',
            sceneDate: '2024-07-15',
            periodLabel: '2024 (T0)',
            imageBase64: png,
            dataSource: 'test',
            mean: 0.4,
            min: 0.4,
            max: 0.4,
            areaHa: 10,
            legendText: 'NDVI',
            notes: 'ΔNDVI = +0.1500',
          },
          {
            layerId: 'NDVI',
            layerLabel: 'NDVI T1',
            sceneDate: '2025-07-15',
            periodLabel: '2025 (T1)',
            imageBase64: png,
            dataSource: 'test',
            mean: 0.55,
            min: 0.55,
            max: 0.55,
            areaHa: 10,
            legendText: 'NDVI',
            notes: 'ΔNDVI = +0.1500',
          },
        ],
      },
    ],
    vegetationCoverageTimeline: [],
    estimatedWaterLossTimeline: [],
    estimatedYieldTimeline: [],
    weatherTimeline: null,
    correlationBlocks: [],
    cropRecommendations: [],
  }
}

describe('Index Change Detection charts (Word)', () => {
  it('adds comparison and delta charts under each change pair', async () => {
    const { model } = await buildTimeSeriesDocxModel(indexChangePayload())
    expect(model.indexChangeBlocks).toHaveLength(1)
    const block = model.indexChangeBlocks[0]!
    expect(block.compareChartRId).toBeTruthy()
    expect(block.deltaChartRId).toBeTruthy()
    expect(block.tableRows).toHaveLength(2)
    expect(model.nativeCharts.some(c => c.title.includes('Change Detection'))).toBe(true)
    expect(model.nativeCharts.some(c => c.title.includes('Δ Change'))).toBe(true)

    const xml = buildTimeSeriesDocxDocumentXml(model)
    expect(xml).toContain('Index Change Detection')
    expect(xml).toContain('Index Change Table')
    expect(xml).toContain(block.compareChartRId!)
    expect(xml).toContain(block.deltaChartRId!)
    // Pair layout: exactly two map columns (T0 | T1), not the 3-col atlas grid.
    const pairTitleAt = xml.indexOf(block.title)
    const tableAt = xml.indexOf('Index Change Table', pairTitleAt)
    const pairSlice = xml.slice(pairTitleAt, tableAt)
    expect((pairSlice.match(/<w:gridCol /g) ?? []).length).toBe(2)
    expect(block.compareChartTitle).toContain('(T0)')
    expect(block.compareChartTitle).toContain('(T1)')
  })
})
