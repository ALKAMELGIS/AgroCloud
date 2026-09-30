import { describe, expect, it } from 'vitest'
import { buildTimeSeriesDocxDocumentXml } from './buildTimeSeriesDocxDocument'
import { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import { buildTimeSeriesDocxModel } from './timeSeriesReportDocxModel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

function lulcPayload(): TimeSeriesReportPayload {
  const executive = buildTimeSeriesExecutiveSummary({
    primary: {
      layerId: 'NDVI',
      sceneDate: '2022-07-15',
      mean: 0.48,
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
    ndviMean: 0.48,
    ndmiMean: 0.12,
    ndwiMean: 0.1,
    saviMean: 0.41,
    ndwiEstimated: false,
    saviEstimated: false,
    acquisitionDate: '2022-07-15',
    ndviStats: { layerId: 'NDVI', mean: 0.48, min: 0.4, max: 0.6, trend: 'Stable' },
    ndmiStats: { layerId: 'NDMI', mean: 0.12, min: 0, max: 0.2, trend: 'Stable' },
  })

  return {
    projectName: 'AgroCloud Test',
    generatedAt: '2026-07-23T12:00:00.000Z',
    generatedBy: 'test',
    location: {
      fieldName: 'Demo Field',
      fieldKey: 'aoi',
      areaHa: 12.5,
      centroidLng: 55.3,
      centroidLat: 25.2,
    },
    period: { from: '2021-01-01', to: '2025-12-31', acquisitionDate: '2022-07-15' },
    layerIds: ['NDVI'],
    charts: {
      labels: ['2021', '2022'],
      displayLabels: ['2021', '2022'],
      series: [{ layerId: 'NDVI', values: [0.4, 0.5] }],
    },
    statistics: [{ layerId: 'NDVI', mean: 0.45, min: 0.4, max: 0.5, trend: 'Increasing' }],
    interpretations: [],
    primaryInterpretation: null,
    executive,
    geometry: null,
    mapImageDataUrl: null,
    mapSnapshotGroups: [],
    cumulativeMapSnapshotGroups: [],
    lulcMapSnapshotGroups: [
      {
        layerId: 'LULC_YEARLY',
        title: 'LULC — Five-Year Atlas (2021–2025)',
        snapshots: [
          {
            layerId: 'LULC',
            layerLabel: 'LULC 2021',
            sceneDate: '2021-07-15',
            periodLabel: '2021',
            imageBase64: 'aaa',
            dataSource: 'test',
            mean: null,
            min: null,
            max: null,
            areaHa: 10,
            legendText: 'classes',
            notes: '',
          },
          {
            layerId: 'LULC',
            layerLabel: 'LULC 2022',
            sceneDate: '2022-07-15',
            periodLabel: '2022',
            imageBase64: 'bbb',
            dataSource: 'test',
            mean: null,
            min: null,
            max: null,
            areaHa: 10,
            legendText: 'classes',
            notes: '',
          },
        ],
      },
    ],
    lulcYearCompositions: [
      {
        year: 2021,
        sceneDate: '2021-07-15',
        totalAreaHa: 10,
        classes: [
          { key: 'crop', name: 'Cropland', color: '#047857', pct: 60, areaHa: 6 },
          { key: 'bare', name: 'Bare', color: '#CA8A04', pct: 40, areaHa: 4 },
        ],
      },
      {
        year: 2022,
        sceneDate: '2022-07-15',
        totalAreaHa: 10,
        classes: [
          { key: 'crop', name: 'Cropland', color: '#047857', pct: 70, areaHa: 7 },
          { key: 'bare', name: 'Bare', color: '#CA8A04', pct: 30, areaHa: 3 },
        ],
      },
    ],
    lulcChangeCompositions: [
      {
        yearFrom: 2021,
        yearTo: 2022,
        classes: [
          {
            key: 'crop',
            name: 'Cropland',
            color: '#047857',
            areaHaFrom: 6,
            areaHaTo: 7,
            pctFrom: 60,
            pctTo: 70,
            deltaHa: 1,
            deltaPctPoints: 10,
          },
          {
            key: 'bare',
            name: 'Bare',
            color: '#CA8A04',
            areaHaFrom: 4,
            areaHaTo: 3,
            pctFrom: 40,
            pctTo: 30,
            deltaHa: -1,
            deltaPctPoints: -10,
          },
        ],
      },
    ],
    changeDetectionMapSnapshotGroups: [],
    vegetationCoverageTimeline: [],
    estimatedWaterLossTimeline: [],
    estimatedYieldTimeline: [],
    weatherTimeline: null,
    correlationBlocks: [],
    cropRecommendations: [],
  }
}

describe('LULC Intelligence Report (Word)', () => {
  it('builds year/change blocks with pie, bar, and multi-year comparison', async () => {
    const { model } = await buildTimeSeriesDocxModel(lulcPayload())
    expect(model.lulcYearBlocks).toHaveLength(2)
    expect(model.lulcYearBlocks[0]?.pieChartRId).toBeTruthy()
    expect(model.lulcYearBlocks[0]?.barChartRId).toBeTruthy()
    expect(model.lulcYearBlocks[0]?.tableRows.some(r => r[0] === 'Cropland')).toBe(true)
    expect(model.lulcYearBlocks[0]?.totalAreaHa).toContain('10')
    expect(model.lulcChangeBlocks).toHaveLength(1)
    expect(model.lulcChangeBlocks[0]?.barChartRId).toBeTruthy()
    expect(model.lulcMultiYearRows.length).toBeGreaterThan(0)
    expect(model.lulcMultiYearBarChartRId).toBeTruthy()
    expect(model.nativeCharts.some(c => c.kind === 'pie')).toBe(true)
    expect(model.nativeCharts.some(c => c.title.includes('Change'))).toBe(true)

    const lulcXml = buildTimeSeriesDocxDocumentXml(model, 'lulc')
    expect(lulcXml).toContain('LULC — Five-Year Land Cover')
    expect(lulcXml).toContain('Class Area Table')
    expect(lulcXml).toContain('Change Detection')
    expect(lulcXml).toContain('rIdChart')
    expect(lulcXml).toContain('LULC Land Cover Intelligence Report')
  })

  it('omits LULC from the main Intelligence Report', async () => {
    const { model } = await buildTimeSeriesDocxModel(lulcPayload())
    const intelXml = buildTimeSeriesDocxDocumentXml(model, 'intelligence')
    expect(intelXml).not.toContain('LULC — Five-Year Land Cover')
    expect(intelXml).not.toContain('LULC Change Detection — Consecutive Years')
    expect(intelXml).toContain('Agricultural Satellite Intelligence Report')
    expect(intelXml).toContain('Data Quality Notes')
    expect(intelXml).toContain('Recommendations')
    expect(intelXml).toContain('LULC land-cover analysis is available as a separate Word export')
  })

  it('keeps index map atlas (3×4) in the Intelligence Report', async () => {
    const payload = lulcPayload()
    payload.mapSnapshotGroups = [
      {
        layerId: 'NDVI',
        title: 'NDVI — Period Maps',
        snapshots: Array.from({ length: 13 }, (_, i) => ({
          layerId: 'NDVI',
          layerLabel: 'NDVI',
          sceneDate: `2024-0${(i % 9) + 1}-01`,
          periodLabel: `2024-0${(i % 9) + 1}`,
          imageBase64: `img${i}`,
          dataSource: 'test',
          mean: 0.4 + i * 0.01,
          min: 0.2,
          max: 0.8,
          areaHa: 10,
          legendText: 'NDVI classes',
          notes: 'Sample narrative',
        })),
      },
    ]
    const { model } = await buildTimeSeriesDocxModel(payload)
    expect(model.mapLayers).toHaveLength(1)
    expect(model.mapLayers[0]!.snapshots).toHaveLength(13)
    expect(model.mapLayers[0]!.title).toContain('NDVI')
    expect(model.mapLayers[0]!.title).toContain('All Acquisition Dates')
    const intelXml = buildTimeSeriesDocxDocumentXml(model, 'intelligence')
    expect(intelXml).toContain('Map Snapshots &amp; Index Charts')
    expect(intelXml).toContain('3×4')
    expect(intelXml).toContain('a:blip')
    expect(intelXml).toContain('NDVI Trend')
  })
})
