import { describe, expect, it } from 'vitest'
import {
  buildCropRecommendations,
  enrichCropClassRows,
} from './cropClassificationReportExecutive'
import { buildCropClassificationDocxModel } from './cropClassificationReportDocxModel'
import { buildCropClassificationDocxDocumentXml } from './buildCropClassificationDocxDocument'
import type { CropClassificationReportPayload } from './cropClassificationReportTypes'
import { buildDocxChartXml } from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxNativeCharts'

describe('cropClassificationReport', () => {
  it('enriches class rows with AOI-derived hectares', () => {
    const rows = enrichCropClassRows(
      {
        classStats: [
          { name: 'Corn', pct: 40 },
          { name: 'Soybeans', pct: 60, areaHa: 12 },
        ],
        legend: [
          { id: 1, name: 'Corn', color: '#f6e700' },
          { id: 2, name: 'Soybeans', color: '#1f7a1f' },
        ],
      },
      100,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.name).toBe('Soybeans')
    expect(rows[0]?.areaHa).toBe(12)
    expect(rows[1]?.areaHa).toBe(40)
  })

  it('builds recommendations and DOCX with pie + bar charts', () => {
    const payload: CropClassificationReportPayload = {
      projectName: 'Test',
      generatedAt: '2026-07-23T10:00:00.000Z',
      generatedBy: 'AgroCloud',
      aoiName: 'Field A',
      areaHa: 50,
      centroidLabel: '25.00000°, 55.00000°',
      seasonStart: '2026-03-01',
      seasonEnd: '2026-06-30',
      engine: 'Prithvi',
      countryLabel: 'UAE',
      resolutionLabel: '10 m/px',
      cloudLabel: '≤ 5%',
      datesLabel: '2026-03-15 · 2026-05-01 · 2026-06-20',
      classes: [
        { id: '1', name: 'Corn', color: '#f6e700', pct: 55, areaHa: 27.5 },
        { id: '2', name: 'Soybeans', color: '#1f7a1f', pct: 45, areaHa: 22.5 },
      ],
      maps: [
        { title: 'AOI Overview', subtitle: 'Field A', imageBase64: 'AAAA' },
        { title: 'Crop Type', subtitle: 'Prithvi', imageBase64: null },
      ],
      executive: {
        overview: 'Overview text.',
        composition: 'Composition text.',
        methodology: 'Methodology text.',
        conclusion: 'Conclusion text.',
        narrative: 'Overview text.',
      },
      recommendations: buildCropRecommendations({
        classes: [
          { id: '1', name: 'Corn', color: '#f6e700', pct: 55, areaHa: 27.5 },
          { id: '2', name: 'Soybeans', color: '#1f7a1f', pct: 45, areaHa: 22.5 },
        ],
        areaHa: 50,
        seasonStart: '2026-03-01',
        seasonEnd: '2026-06-30',
        countryName: 'UAE',
      }),
      methodologyNotes: ['m1'],
      dataQualityNotes: ['q1'],
    }

    const { model, images } = buildCropClassificationDocxModel(payload)
    expect(images).toHaveLength(1)
    expect(model.nativeCharts.length).toBeGreaterThanOrEqual(2)
    expect(model.nativeCharts[0]?.kind).toBe('pie')
    expect(model.recommendations.length).toBeGreaterThan(2)

    const pieXml = buildDocxChartXml(model.nativeCharts[0]!)
    expect(pieXml).toContain('<c:pieChart>')
    expect(pieXml).toContain('showPercent')

    const xml = buildCropClassificationDocxDocumentXml(model)
    expect(xml).toContain('Executive Summary')
    expect(xml).toContain('Crop Composition')
    expect(xml).toContain('Recommendations')
    expect(xml).toContain('Table of Contents')
    expect(xml).toContain('rIdChart1')
  })
})
