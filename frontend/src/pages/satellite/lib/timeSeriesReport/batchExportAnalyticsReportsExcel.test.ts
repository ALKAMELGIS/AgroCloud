import { describe, expect, it, vi } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import {
  batchExportAnalyticsReportsExcel,
  resolveBatchPlotDisplayName,
} from './batchExportAnalyticsReportsExcel'
import {
  BATCH_EXPORT_CANCELLED,
  BATCH_EXPORT_FOLDER_REQUIRED,
  isBatchDirectoryPickerSupported,
  pickBatchExportDirectory,
} from './batchExportDirectory'
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
const stubDir = {} as FileSystemDirectoryHandle

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

describe('batchExportDirectory', () => {
  it('reports support from showDirectoryPicker presence', () => {
    const w = window as Window & { showDirectoryPicker?: unknown }
    const prev = w.showDirectoryPicker
    try {
      w.showDirectoryPicker = vi.fn()
      expect(isBatchDirectoryPickerSupported()).toBe(true)
      delete w.showDirectoryPicker
      expect(isBatchDirectoryPickerSupported()).toBe(false)
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })

  it('throws Folder selection is required when picker API is missing', async () => {
    const w = window as Window & { showDirectoryPicker?: unknown }
    const prev = w.showDirectoryPicker
    try {
      delete w.showDirectoryPicker
      await expect(pickBatchExportDirectory()).rejects.toThrow(BATCH_EXPORT_FOLDER_REQUIRED)
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })

  it('maps user cancel of the picker to Batch export cancelled', async () => {
    const w = window as Window & { showDirectoryPicker?: unknown }
    const prev = w.showDirectoryPicker
    try {
      w.showDirectoryPicker = vi.fn(async () => {
        throw new DOMException('The user aborted a request.', 'AbortError')
      })
      await expect(pickBatchExportDirectory()).rejects.toMatchObject({
        name: 'AbortError',
        message: BATCH_EXPORT_CANCELLED,
      })
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })
})

describe('batchExportAnalyticsReportsExcel', () => {
  it('picks a folder once, writes N blobs, and never triggers anchor downloads', async () => {
    const withGeomA = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    const noGeom = makePlot({ fieldKey: 'skip', farmName: 'NoGeom' })
    const withGeomB = makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })
    const withGeomFail = makePlot({ fieldKey: 'fail', farmName: 'Broken', geometry: poly })

    const fetchDaily = vi.fn(async (plot: CropAlertFieldInput) => {
      if (plot.fieldKey === 'fail') throw new Error('fetch boom')
      return [{ date: '2024-06-01', ndvi: 0.55 }]
    })
    const buildPayload = vi.fn(async () => stubPayload)
    const pickDirectory = vi.fn(async () => stubDir)
    const writeBlob = vi.fn(async () => undefined)
    const buildBlob = vi.fn(async () => new Blob(['xlsx'], { type: 'application/octet-stream' }))
    const createElement = vi.spyOn(document, 'createElement')
    const onProgress = vi.fn()

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots: [withGeomA, noGeom, withGeomFail, withGeomB],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        onProgress,
      },
      { fetchDaily, buildPayload, pickDirectory, writeBlob, buildBlob },
    )

    expect(pickDirectory).toHaveBeenCalledTimes(1)
    expect(fetchDaily).toHaveBeenCalledTimes(3)
    expect(fetchDaily.mock.calls.map(c => c[0].fieldKey)).toEqual(['a', 'fail', 'b'])
    expect(buildBlob).toHaveBeenCalledTimes(2)
    expect(writeBlob).toHaveBeenCalledTimes(2)
    expect(writeBlob.mock.calls.map(c => [c[0], c[1]])).toEqual([
      [stubDir, 'T-100 SC0175.xlsx'],
      [stubDir, 'T-101.xlsx'],
    ])
    expect(createElement).not.toHaveBeenCalledWith('a')
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.aborted).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.fieldKey).toBe('fail')
    expect(onProgress).toHaveBeenCalled()

    createElement.mockRestore()
  })

  it('stops the batch when aborted mid-run with no further writes', async () => {
    const controller = new AbortController()
    const plots = [
      makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly }),
      makePlot({ fieldKey: 'b', farmName: 'B', geometry: poly }),
    ]
    const fetchDaily = vi.fn(async () => {
      controller.abort()
      return [{ date: '2024-06-01', ndvi: 0.4 }]
    })
    const writeBlob = vi.fn(async () => undefined)
    const buildBlob = vi.fn(async () => new Blob(['xlsx']))

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots,
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        signal: controller.signal,
      },
      {
        fetchDaily,
        buildPayload: async () => stubPayload,
        pickDirectory: async () => stubDir,
        writeBlob,
        buildBlob,
      },
    )

    expect(result.aborted).toBe(true)
    expect(writeBlob).toHaveBeenCalledTimes(0)
    expect(result.succeeded + result.failed).toBeLessThanOrEqual(1)
  })

  it('propagates picker cancel before any field work or writes', async () => {
    const fetchDaily = vi.fn(async () => [{ date: '2024-06-01', ndvi: 0.4 }])
    const writeBlob = vi.fn(async () => undefined)
    const buildBlob = vi.fn(async () => new Blob(['xlsx']))

    await expect(
      batchExportAnalyticsReportsExcel(
        {
          plots: [makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly })],
          layerIds: ['NDVI'],
          fromDate: '2024-06-01',
          toDate: '2024-06-30',
        },
        {
          fetchDaily,
          buildPayload: async () => stubPayload,
          pickDirectory: async () => {
            throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
          },
          writeBlob,
          buildBlob,
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError', message: BATCH_EXPORT_CANCELLED })

    expect(fetchDaily).not.toHaveBeenCalled()
    expect(writeBlob).not.toHaveBeenCalled()
    expect(buildBlob).not.toHaveBeenCalled()
  })

  it('fails before the loop when the directory picker API is unsupported', async () => {
    const fetchDaily = vi.fn(async () => [{ date: '2024-06-01', ndvi: 0.4 }])
    const writeBlob = vi.fn(async () => undefined)

    await expect(
      batchExportAnalyticsReportsExcel(
        {
          plots: [makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly })],
          layerIds: ['NDVI'],
          fromDate: '2024-06-01',
          toDate: '2024-06-30',
        },
        {
          fetchDaily,
          buildPayload: async () => stubPayload,
          pickDirectory: async () => {
            throw new Error(BATCH_EXPORT_FOLDER_REQUIRED)
          },
          writeBlob,
          buildBlob: async () => new Blob(['xlsx']),
        },
      ),
    ).rejects.toThrow(BATCH_EXPORT_FOLDER_REQUIRED)

    expect(fetchDaily).not.toHaveBeenCalled()
    expect(writeBlob).not.toHaveBeenCalled()
  })
})
