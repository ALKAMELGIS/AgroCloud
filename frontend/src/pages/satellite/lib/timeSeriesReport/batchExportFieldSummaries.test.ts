import { describe, expect, it, vi } from 'vitest'
import { computeImageryYieldEstimate } from '../../../../lib/imageryYieldEstimation'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { FieldSummaryModel } from './buildFieldSummaryModel'
import { batchExportFieldSummaries } from './batchExportFieldSummaries'
import {
  buildFieldSummaryWorkbook,
  sanitizeFieldSummaryExcelFilename,
} from './generateFieldSummaryExcel'

const poly: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ],
  ],
}

function makePlot(partial: Partial<CropAlertFieldInput> & { fieldKey: string }): CropAlertFieldInput {
  return {
    fieldKey: partial.fieldKey,
    objectId: partial.objectId ?? '1',
    farmName: partial.farmName ?? 'Plot',
    farmCode: partial.farmCode ?? '',
    structureType: partial.structureType ?? 'AOI',
    country: partial.country ?? '',
    city: partial.city ?? '',
    centroid: partial.centroid ?? [0, 0],
    geometry: partial.geometry,
  }
}

function stubSummary(plot: CropAlertFieldInput): FieldSummaryModel {
  return {
    fieldName: plot.farmName,
    plotId: plot.objectId,
    cropType: '—',
    areaHa: 1.2,
    vegetationHealthScore: 0.55,
    moistureScore: 0.2,
    waterStatus: 'Low',
    ndvi: 0.82,
    ndmi: 0.45,
    ndre: 0.6,
    yieldFactor: 0.687,
    maxYieldTHa: 55,
    yieldTHa: 30,
    productionTons: 36,
    harvestWindow: 'Pre-peak',
    irrigationStatus: 'Adequate',
    overallFieldHealth: 'Healthy',
    recommendation: 'Continue routine monitoring.',
    sceneDate: '2024-06-15',
    fromDate: '2024-06-01',
    toDate: '2024-06-30',
  }
}

describe('sanitizeFieldSummaryExcelFilename', () => {
  it('keeps spaces and hyphens and uses .xlsx', () => {
    expect(sanitizeFieldSummaryExcelFilename('T-100 SC0175')).toBe('T-100 SC0175.xlsx')
  })
})

describe('buildFieldSummaryWorkbook', () => {
  it('writes one Field Summaries sheet with a header row and one data row per field', () => {
    const summaries = [
      stubSummary(makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })),
      stubSummary(makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })),
    ]
    const { wb, chartSpecs } = buildFieldSummaryWorkbook({
      summaries,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      portfolio: {
        fieldCount: 2,
        totalAreaHa: 2.4,
        totalProductionTons: 72,
        avgYieldTHa: 30,
        healthyCount: 2,
        moderateCount: 0,
        stressedCount: 0,
        avgHealthScore: 0.55,
        avgMoistureScore: 0.2,
        overallPortfolioStatus: 'Healthy',
      },
    })
    expect(wb.worksheets.map(w => w.name)).toEqual(['Field Summaries', 'Formulas', 'Analysis'])
    expect(wb.worksheets[0]!.name).toBe('Field Summaries')
    expect(wb.worksheets[0]!.getRow(5).getCell(1).value).toBe('Field Name')
    expect(wb.worksheets[0]!.getRow(5).getCell(10).value).toBe('Estimated Yield (t/ha)')
    expect(wb.worksheets[0]!.getRow(5).getCell(11).value).toBe(
      'Estimated Total Production (tons)',
    )
    expect(wb.worksheets[0]!.getRow(6).getCell(1).value).toBe('T-100 SC0175')
    expect(wb.worksheets[0]!.getRow(7).getCell(1).value).toBe('T-101')
    expect(String(wb.worksheets[0]!.getCell('A3').value)).toContain('YieldFactor')
    expect(String(wb.worksheets[1]!.getCell('A5').value)).toContain('YieldFactor')
    expect(wb.getWorksheet('Analysis')!.getCell('A1').value).toContain('Executive Dashboard')
    expect(chartSpecs.length).toBeGreaterThanOrEqual(6)
    expect(chartSpecs.some(s => s.title.includes('Production'))).toBe(true)
    expect(chartSpecs.some(s => s.title.includes('VHS'))).toBe(true)
    expect(chartSpecs.some(s => s.kind === 'doughnut')).toBe(true)
  })

  it('documents AgroCloud yield formulas matching the worked potato example', () => {
    const estimate = computeImageryYieldEstimate({
      ndvi: 0.82,
      ndmi: 0.45,
      ndre: 0.6,
      areaHa: 39.26,
      maxYieldTHa: 55,
    })
    expect(estimate).not.toBeNull()
    expect(estimate!.yieldFactor).toBeCloseTo(0.665, 3)
    expect(estimate!.estimatedYieldTHa).toBeCloseTo(36.575, 2)
    expect(estimate!.totalProductionTons).toBeCloseTo(1435.9, 0)
  })
})

describe('batchExportFieldSummaries', () => {
  it('skips plots without geometry; continues after failure; saves one Excel for all successes', async () => {
    const withGeomA = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    const noGeom = makePlot({ fieldKey: 'skip', farmName: 'NoGeom' })
    const withGeomFail = makePlot({ fieldKey: 'fail', farmName: 'Broken', geometry: poly })
    const withGeomB = makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })

    const fetchDaily = vi.fn(async (plot: CropAlertFieldInput) => {
      if (plot.fieldKey === 'fail') throw new Error('fetch boom')
      return [{ date: '2024-06-01', ndvi: 0.55, ndmi: 0.2, ndwi: 0.1, evi: null, savi: null, ciRe: null }]
    })
    const buildModel = vi.fn(({ plot }: { plot: CropAlertFieldInput }) => stubSummary(plot))
    const saveExcel = vi.fn(async () => undefined)
    const onProgress = vi.fn()

    const result = await batchExportFieldSummaries(
      {
        plots: [withGeomA, noGeom, withGeomFail, withGeomB],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        onProgress,
      },
      { fetchDaily, buildModel, saveExcel },
    )

    expect(fetchDaily).toHaveBeenCalledTimes(3)
    expect(fetchDaily.mock.calls.map(c => c[0].fieldKey)).toEqual(['a', 'fail', 'b'])
    expect(saveExcel).toHaveBeenCalledTimes(1)
    expect(saveExcel.mock.calls[0]?.[0].summaries).toHaveLength(2)
    expect(saveExcel.mock.calls[0]?.[0].filename).toBe('Field_Summaries_Table.xlsx')
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.aborted).toBe(false)
    expect(result.portfolio?.fieldCount).toBe(2)
    expect(onProgress).toHaveBeenCalled()
  })

  it('stops the batch when aborted mid-run and does not save Excel', async () => {
    const controller = new AbortController()
    const plots = [
      makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly }),
      makePlot({ fieldKey: 'b', farmName: 'B', geometry: poly }),
    ]
    const fetchDaily = vi.fn(async () => {
      controller.abort()
      return [{ date: '2024-06-01', ndvi: 0.4, ndmi: null, ndwi: null, evi: null, savi: null, ciRe: null }]
    })
    const saveExcel = vi.fn(async () => undefined)

    const result = await batchExportFieldSummaries(
      {
        plots,
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        signal: controller.signal,
      },
      {
        fetchDaily,
        buildModel: ({ plot }) => stubSummary(plot),
        saveExcel,
      },
    )

    expect(result.aborted).toBe(true)
    expect(saveExcel).toHaveBeenCalledTimes(0)
    expect(result.succeeded + result.failed).toBeLessThanOrEqual(1)
  })
})
