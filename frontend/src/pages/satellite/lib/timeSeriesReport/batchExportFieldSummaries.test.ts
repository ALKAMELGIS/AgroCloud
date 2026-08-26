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
    layerFieldId: plot.objectId,
    originalFieldName: plot.farmName,
    cropType: 'Potato',
    layerIrrigationType: 'Pivot',
    areaHa: 1.2,
    vegetationHealthScore: 0.55,
    moistureScore: 0.2,
    waterStatus: 'Low',
    ndvi: 0.82,
    ndwi: 0.15,
    ndmi: 0.45,
    ndii: 0.45,
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
    phenologyPlantingDate: null,
    phenologyHarvestDate: null,
    periodDays: 30,
  }
}

describe('sanitizeFieldSummaryExcelFilename', () => {
  it('keeps spaces and hyphens and uses .xlsx', () => {
    expect(sanitizeFieldSummaryExcelFilename('T-100 SC0175')).toBe('T-100 SC0175.xlsx')
  })
})

describe('buildFieldSummaryWorkbook', () => {
  it('writes executive report sheets matching the Serbia field report layout', () => {
    const summaries = [
      stubSummary(makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })),
      stubSummary(makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })),
    ]
    const { wb, chartSpecs } = buildFieldSummaryWorkbook({
      summaries,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      aoiName: 'Serbia',
      et0ByFieldKey: new Map([
        ['a', 5],
        ['b', 5],
      ]),
      fieldKeys: ['a', 'b'],
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
    expect(wb.worksheets.map(w => w.name)).toEqual([
      'Executive Summary',
      'Area & Coverage Analysis',
      'Formulas',
      'Production Estimation',
    ])
    const exec = wb.worksheets[0]!
    expect(String(exec.getCell('A1').value)).toContain('Serbia')
    expect(String(exec.getCell('A1').value)).toContain('Executive Summary')
    expect(exec.getRow(5).getCell(2).value).toBe('Serbia — Batch Field Summaries')
    expect(exec.getRow(6).getCell(2).value).toBe('2024-06-01 to 2024-06-30')
    expect(exec.getRow(7).getCell(2).value).toBe(2)
    expect(String(exec.getRow(8).getCell(2).value)).toContain('Potato')
    expect(wb.worksheets[1]!.getCell('A1').value).toBe('Area & Coverage Analysis')
    const area = wb.worksheets[1]!
    expect(area.getRow(5).getCell(2).value).toBe(2.4)
    expect(area.getRow(6).getCell(2).value).toBe(2.4)
    expect(typeof area.getRow(7).getCell(2).value).toBe('number')
    expect(typeof area.getRow(8).getCell(2).value).toBe('number')
    expect(area.getRow(12).getCell(1).value).toBe('Field ID')
    expect(area.getRow(12).getCell(2).value).toBe('Field Name')
    expect(area.getRow(12).getCell(3).value).toBe('Crop Classification')
    expect(area.getRow(12).getCell(4).value).toBe('Irrigation Type')
    expect(area.getRow(12).getCell(5).value).toBe('Planned Crop Coverage (ha)')
    expect(area.getRow(12).getCell(6).value).toBe('Unplanned Area (ha)')
    expect(area.getRow(12).getCell(7).value).toBe('Total Area (ha)')
    expect(area.getRow(12).getCell(8).value).toBe('Water Loss Index %')
    expect(area.getRow(12).getCell(9).value).toBe('Category')
    expect(area.getRow(12).getCell(10).value).toBe('Area (ha)')
    expect(area.getRow(13).getCell(2).value).toBe('T-100 SC0175')
    expect(area.getRow(13).getCell(3).value).toBe('Potato')
    expect(area.getRow(13).getCell(4).value).toBe('Pivot')
    expect(typeof area.getRow(13).getCell(8).value).toBe('number')

    expect(exec.getRow(20).getCell(1).value).toBe('Total Water Loss Index %')
    expect(typeof exec.getRow(20).getCell(2).value).toBe('number')
    expect(exec.getRow(21).getCell(1).value).toBe('Total Loss (m3/day)')
    expect(typeof exec.getRow(21).getCell(2).value).toBe('number')
    expect(exec.getRow(22).getCell(1).value).toBe('Total Loss (m3/ha/day)')
    expect(typeof exec.getRow(22).getCell(2).value).toBe('number')
    expect(String(wb.worksheets[0]!.getCell('A1').fill?.fgColor?.argb)).toBe('FF1A4E26')
    expect(String(wb.worksheets[2]!.getCell('A5').value)).toContain('YieldFactor')

    const prod = wb.getWorksheet('Production Estimation')!
    expect(prod.getCell('A1').value).toBe('Production Estimation Sheet')
    expect(prod.getRow(13).getCell(1).value).toBe('Field ID')
    expect(prod.getRow(13).getCell(13).value).toBe('Water Loss Index %')
    expect(prod.getRow(13).getCell(14).value).toBe('Loss (m3/day)')
    expect(prod.getRow(13).getCell(16).value).toBe('Growth Stage')
    expect(prod.getRow(13).getCell(17).value).toBe('ET0 (mm/day)')
    expect(prod.getRow(13).getCell(29).value).toBe('Water Requirement (m³/day)')
    expect(String(prod.getCell('A4').value)).toContain('Water Requirement')
    expect(prod.getRow(14).getCell(1).value).toBe('1')
    expect(prod.getRow(16).getCell(1).value).toBe('TOTAL')
    expect(typeof prod.getRow(14).getCell(13).value).toBe('number')
    expect(typeof prod.getRow(16).getCell(13).value).toBe('number')
    expect(String(prod.getRow(14).getCell(10).fill?.fgColor?.argb)).toBe('FFD1FAE5')

    expect(chartSpecs.some(s => s.title === 'Area (ha)')).toBe(true)
    expect(chartSpecs.some(s => s.title.includes('Planned vs Unplanned Area by Field'))).toBe(true)
    expect(chartSpecs.some(s => s.kind === 'pie' && s.sliceColors?.length)).toBe(true)
    expect(chartSpecs.some(s => s.grouping === 'stacked' && s.series.some(ser => ser.color === '2E7D32'))).toBe(
      true,
    )
    expect(chartSpecs.every(s => s.targetSheet === 'Area & Coverage Analysis')).toBe(true)
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
        aoiName: 'Serbia',
        onProgress,
      },
      { fetchDaily, buildModel, saveExcel },
    )

    expect(fetchDaily).toHaveBeenCalledTimes(3)
    expect(fetchDaily.mock.calls.map(c => c[0].fieldKey)).toEqual(['a', 'fail', 'b'])
    expect(saveExcel).toHaveBeenCalledTimes(1)
    expect(saveExcel.mock.calls[0]?.[0].summaries).toHaveLength(2)
    expect(saveExcel.mock.calls[0]?.[0].filename).toBe('Serbia_Field_Report__2024-06-30.xlsx')
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.aborted).toBe(false)
    expect(result.portfolio?.fieldCount).toBe(2)
    expect(onProgress).toHaveBeenCalled()
  })

  it('passes a pre-picked save target to the Excel writer', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'T-100', geometry: poly })
    const saveTarget = {
      kind: 'file' as const,
      handle: {} as FileSystemFileHandle,
      filename: 'Serbia_Field_Report__2024-06-30.xlsx',
    }
    const saveExcel = vi.fn(async () => ({
      filename: saveTarget.filename,
      deliveryMode: 'file' as const,
      locationLabel: saveTarget.filename,
    }))

    const result = await batchExportFieldSummaries(
      {
        plots: [plot],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        aoiName: 'Serbia',
        saveTarget,
      },
      {
        fetchDaily: async () => [
          { date: '2024-06-01', ndvi: 0.55, ndmi: 0.2, ndwi: 0.1, evi: null, savi: null, ciRe: null },
        ],
        buildModel: ({ plot: p }) => stubSummary(p),
        saveExcel,
      },
    )

    expect(saveExcel).toHaveBeenCalledTimes(1)
    expect(saveExcel.mock.calls[0]?.[0].saveTarget).toEqual(saveTarget)
    expect(result.delivery?.deliveryMode).toBe('file')
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
