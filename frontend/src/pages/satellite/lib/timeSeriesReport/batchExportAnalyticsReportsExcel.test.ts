import { describe, expect, it, vi } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import {
  batchExportAnalyticsReportsExcel,
  resolveBatchPlotDisplayName,
} from './batchExportAnalyticsReportsExcel'
import { sanitizeTimeSeriesReportExcelFilename } from './generateTimeSeriesReportExcel'

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

const stubPayload = { location: { fieldName: 'x', fieldKey: 'x' } } as TimeSeriesReportPayload

describe('sanitizeTimeSeriesReportExcelFilename', () => {
  it('keeps spaces and hyphens for plot labels like T-100 SC0175', () => {
    expect(sanitizeTimeSeriesReportExcelFilename('T-100 SC0175')).toBe('T-100 SC0175.xlsx')
    expect(sanitizeTimeSeriesReportExcelFilename('Potato_Plots: T-100 SC0175')).toBe('T-100 SC0175.xlsx')
  })
})

describe('resolveBatchPlotDisplayName', () => {
  it('uses cleaned farmName from Plot Label', () => {
    expect(
      resolveBatchPlotDisplayName(makePlot({ fieldKey: 'a', farmName: 'AOI: T-100 SC0175' })),
    ).toBe('T-100 SC0175')
  })
})

describe('batchExportAnalyticsReportsExcel', () => {
  it('skips plots without geometry; continues after a per-field failure; downloads once per success', async () => {
    const withGeomA = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    const noGeom = makePlot({ fieldKey: 'skip', farmName: 'NoGeom' })
    const withGeomB = makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })
    const withGeomFail = makePlot({ fieldKey: 'fail', farmName: 'Broken', geometry: poly })

    const fetchDaily = vi.fn(async (plot: CropAlertFieldInput) => {
      if (plot.fieldKey === 'fail') throw new Error('fetch boom')
      return [{ date: '2024-06-01', ndvi: 0.55 }]
    })
    const buildPayload = vi.fn(async () => stubPayload)
    const generateExcel = vi.fn(async () => undefined)
    const sleep = vi.fn(async () => undefined)
    const onProgress = vi.fn()

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots: [withGeomA, noGeom, withGeomFail, withGeomB],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        downloadGapMs: 0,
        onProgress,
      },
      { fetchDaily, buildPayload, generateExcel, sleep },
    )

    expect(fetchDaily).toHaveBeenCalledTimes(3)
    expect(fetchDaily.mock.calls.map(c => c[0].fieldKey)).toEqual(['a', 'fail', 'b'])
    expect(generateExcel).toHaveBeenCalledTimes(2)
    expect(generateExcel.mock.calls.map(c => c[1]?.filename)).toEqual([
      'T-100 SC0175.xlsx',
      'T-101.xlsx',
    ])
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.aborted).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.fieldKey).toBe('fail')
    expect(onProgress).toHaveBeenCalled()
  })

  it('stops the batch when aborted mid-run', async () => {
    const controller = new AbortController()
    const plots = [
      makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly }),
      makePlot({ fieldKey: 'b', farmName: 'B', geometry: poly }),
    ]
    const fetchDaily = vi.fn(async () => {
      controller.abort()
      return [{ date: '2024-06-01', ndvi: 0.4 }]
    })
    const generateExcel = vi.fn(async () => undefined)

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots,
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        signal: controller.signal,
        downloadGapMs: 0,
      },
      {
        fetchDaily,
        buildPayload: async () => stubPayload,
        generateExcel,
        sleep: async () => undefined,
      },
    )

    expect(result.aborted).toBe(true)
    expect(generateExcel).toHaveBeenCalledTimes(0)
    expect(result.succeeded + result.failed).toBeLessThanOrEqual(1)
  })
})
