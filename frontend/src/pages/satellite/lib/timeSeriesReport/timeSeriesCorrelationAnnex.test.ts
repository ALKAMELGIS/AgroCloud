import { describe, expect, it } from 'vitest'
import {
  buildCorrelationInterpretation,
  buildCorrelationScatterNativeChartSpec,
  buildLayerCorrelationAnalyses,
} from './timeSeriesScatterChartRenderer'
import { buildDocxChartXml } from './timeSeriesDocxNativeCharts'
import { buildTimeSeriesDocxDocumentXml } from './buildTimeSeriesDocxDocument'
import { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import { buildTimeSeriesDocxModel } from './timeSeriesReportDocxModel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import type { ImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

describe('correlation annex charts', () => {
  it('builds native scatter ChartML with white chartSpace', () => {
    const spec = buildCorrelationScatterNativeChartSpec(
      {
        xLayerId: 'NDVI',
        yLayerId: 'LST',
        r: -0.296,
        r2: 0.088,
        n: 40,
        relationshipLabel: 'Weak Negative',
        points: [
          { date: '2026-01-01', x: 0.2, y: 38 },
          { date: '2026-02-01', x: 0.35, y: 34 },
          { date: '2026-03-01', x: 0.45, y: 30 },
        ],
        fitLine: [
          { x: 0.2, y: 38 },
          { x: 0.45, y: 30 },
        ],
      },
      42,
    )
    expect(spec.kind).toBe('scatter')
    const xml = buildDocxChartXml(spec)
    expect(xml).toContain('c:scatterChart')
    expect(xml).toContain('srgbClr val="FFFFFF"')
    expect(xml).toContain('NDVI')
    expect(xml).toContain('LST')
  })

  it('keeps interpretation to about two sentences', () => {
    const analysis = {
      xLayerId: 'NDVI',
      yLayerId: 'LST',
      points: [],
      regression: { r: -0.296, r2: 0.088, n: 40, slope: -10, intercept: 40 },
      regressionLine: [],
      relationship: { label: 'Weak Negative', strength: 'weak', direction: 'negative' },
      gisInsight: '',
      agroInsight: '',
    } as ImageryCorrelationScatterAnalysis
    const text = buildCorrelationInterpretation(analysis)
    const sentences = text.split(/(?<=\.)\s+/).filter(Boolean)
    expect(sentences.length).toBeLessThanOrEqual(2)
    expect(text).toContain('r =')
  })

  it('sorts layer pairs for annex order', () => {
    const analyses = buildLayerCorrelationAnalyses({
      labels: ['a', 'b', 'c'],
      layerIds: ['LST', 'NDVI', 'NDMI'],
      series: [
        { layerId: 'LST', values: [30, 32, 28] },
        { layerId: 'NDVI', values: [0.3, 0.4, 0.35] },
        { layerId: 'NDMI', values: [0.1, 0.12, 0.08] },
      ],
    })
    const keys = analyses.map(a => `${a.xLayerId}|${a.yLayerId}`)
    expect(keys).toEqual([...keys].sort())
  })

  it('places Correlation Analysis as Annex A at end of Word body', async () => {
    const executive = buildTimeSeriesExecutiveSummary({
      primary: {
        layerId: 'NDVI',
        sceneDate: '2026-01-01',
        mean: 0.4,
        meanLabel: 'Moderate',
        meanTier: 'moderate',
        min: 0.2,
        max: 0.6,
        stdDev: 0.1,
        meanColor: '#eab308',
        totalAreaHa: 10,
        totalAreaM2: 100000,
        coverage: [
          { tier: 'healthy', label: 'Healthy', pct: 50, color: '#22c55e', areaHa: 5, areaM2: 50000 },
          { tier: 'moderate', label: 'Moderate', pct: 20, color: '#eab308', areaHa: 2, areaM2: 20000 },
          { tier: 'stress', label: 'Stress', pct: 20, color: '#f97316', areaHa: 2, areaM2: 20000 },
          { tier: 'critical', label: 'Bare', pct: 10, color: '#ef4444', areaHa: 1, areaM2: 10000 },
        ],
        summaryLine: 's',
        coverageLine: 'c',
        actionsLine: 'a',
        actions: [],
        lines: [],
        areasFromHistogram: false,
      },
      ndviMean: 0.4,
      ndmiMean: 0.1,
      ndwiMean: 0.05,
      saviMean: 0.3,
      ndwiEstimated: false,
      saviEstimated: false,
      acquisitionDate: '2026-01-01',
    })

    const payload: TimeSeriesReportPayload = {
      projectName: 'Test',
      generatedAt: '2026-07-24T00:00:00.000Z',
      generatedBy: 'test',
      location: {
        fieldName: 'Field',
        fieldKey: 'f1',
        areaHa: 10,
        centroidLng: 46,
        centroidLat: 24,
      },
      period: { from: '2026-01-01', to: '2026-03-01', acquisitionDate: '2026-03-01' },
      layerIds: ['NDVI', 'LST'],
      charts: {
        labels: ['2026-01-01', '2026-02-01', '2026-03-01'],
        displayLabels: ['2026-01-01', '2026-02-01', '2026-03-01'],
        series: [
          { layerId: 'NDVI', values: [0.2, 0.35, 0.45], label: 'NDVI', color: '#22c55e' },
          { layerId: 'LST', values: [38, 34, 30], label: 'LST', color: '#ef4444' },
        ],
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
      changeDetectionMapSnapshotGroups: [],
      vegetationCoverageTimeline: [],
      estimatedWaterLossTimeline: [],
      weatherTimeline: null,
      correlationBlocks: [
        {
          xLayerId: 'NDVI',
          yLayerId: 'LST',
          r: -0.296,
          r2: 0.088,
          n: 3,
          slope: -20,
          intercept: 42,
          relationshipLabel: 'Weak Negative',
          gisInsight: 'g',
          agroInsight: 'a',
          interpretation: 'Weak negative link.',
          valueHeaders: ['Date', 'NDVI', 'LST'],
          valueRows: [
            ['2026-01-01', '0.2000', '38.0000'],
            ['2026-02-01', '0.3500', '34.0000'],
            ['2026-03-01', '0.4500', '30.0000'],
          ],
          points: [
            { date: '2026-01-01', x: 0.2, y: 38 },
            { date: '2026-02-01', x: 0.35, y: 34 },
            { date: '2026-03-01', x: 0.45, y: 30 },
          ],
          fitLine: [
            { x: 0.2, y: 38 },
            { x: 0.45, y: 30 },
          ],
          chartBase64: null,
        },
      ],
      cropRecommendations: [],
    }

    const { model } = await buildTimeSeriesDocxModel(payload)
    expect(model.correlationBlocks[0]?.chartRId).toBeTruthy()
    expect(model.nativeCharts.some(c => c.kind === 'scatter')).toBe(true)

    const xml = buildTimeSeriesDocxDocumentXml(model)
    expect(xml).toContain('Annex A — Correlation Analysis')
    expect(xml).toContain('Annex B — Paired Values Tables')
    const annexA = xml.indexOf('Annex A — Correlation Analysis')
    const annexB = xml.indexOf('Annex B — Paired Values Tables')
    const recAt = xml.indexOf('Recommendations')
    expect(annexA).toBeGreaterThan(recAt)
    expect(annexB).toBeGreaterThan(annexA)
    expect(xml).toContain('Paired values')
    expect(xml).toContain('Interpretation')
    expect(xml).toContain(model.correlationBlocks[0]!.chartRId!)
    // Tables live only in Annex B (after charts/interpretation).
    const pairedAt = xml.indexOf('Paired values')
    expect(pairedAt).toBeGreaterThan(annexB)
  })
})
