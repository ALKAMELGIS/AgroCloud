import { describe, expect, it, vi } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'
import {
  batchExportAnalyticsReportsExcel,
  mergeAnalyticsReportLayerIds,
} from './batchExportAnalyticsReportsExcel'
import { resolveBatchPlotDisplayName, uniqueBatchPlotExcelFilename } from './aoiExcelExportShared'
import {
  BATCH_EXPORT_CANCELLED,
  BATCH_EXPORT_FOLDER_REQUIRED,
  BATCH_EXPORT_PICKER_BLOCKED,
  isBatchDirectoryPickerSupported,
  pickBatchExportDirectory,
  pickBatchExportDirectoryFromGesture,
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

describe('mergeAnalyticsReportLayerIds', () => {
  it('always includes NDVI/NDMI/NDWI/SAVI/ET for Serbia analytics workbooks', () => {
    expect(mergeAnalyticsReportLayerIds(['NDVI'])).toEqual([
      'NDVI',
      'NDMI',
      'NDWI',
      'SAVI',
      'ET',
    ])
  })
})

describe('batchMapSnapshotMaxPerLayer', () => {
  it('requests at least as many day maps as chart periods', async () => {
    const { batchExportAnalyticsReportsExcel } = await import('./batchExportAnalyticsReportsExcel')
    const plot = makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly })
    const buildPayload = vi.fn(async () => stubPayload)
    const daily = Array.from({ length: 18 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      ndvi: 0.4 + i * 0.01,
    }))

    await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2026-05-01',
        toDate: '2026-08-26',
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily: async () => daily,
        buildPayload,
        writeBlob: vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false })),
        buildBlob: vi.fn(async () => new Blob(['xlsx'])),
      },
    )

    const input = buildPayload.mock.calls[0]?.[0]
    expect(input?.includeMapSnapshots).toBe(true)
    expect(input?.mapSnapshotMaxPerLayer).toBeGreaterThanOrEqual(18)
    expect(input?.timeAggregation).toBe('day')
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
      const fromGesture = await pickBatchExportDirectoryFromGesture()
      expect(fromGesture).toEqual({ status: 'cancelled' })
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })

  it('surfaces NotAllowedError as picker blocked (not cancelled)', async () => {
    const w = window as Window & { showDirectoryPicker?: unknown }
    const prev = w.showDirectoryPicker
    try {
      w.showDirectoryPicker = vi.fn(async () => {
        throw new DOMException('Failed to execute showDirectoryPicker', 'NotAllowedError')
      })
      await expect(pickBatchExportDirectory()).rejects.toThrow(BATCH_EXPORT_PICKER_BLOCKED)
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })

  it('does not treat unrelated AbortError as batch cancel', async () => {
    const { isBatchExportCancelled } = await import('./batchExportDirectory')
    expect(isBatchExportCancelled(new DOMException('The operation was aborted', 'AbortError'))).toBe(
      false,
    )
  })

  it('beginBatchExportDirectoryPickFromGesture resolves null on user cancel', async () => {
    const { beginBatchExportDirectoryPickFromGesture } = await import('./batchExportDirectory')
    const w = window as Window & { showDirectoryPicker?: unknown }
    const prev = w.showDirectoryPicker
    try {
      w.showDirectoryPicker = vi.fn(async () => {
        throw new DOMException('The user aborted a request.', 'AbortError')
      })
      await expect(beginBatchExportDirectoryPickFromGesture()).resolves.toBeNull()
    } finally {
      if (prev) w.showDirectoryPicker = prev
      else delete w.showDirectoryPicker
    }
  })
})

describe('batchExportAnalyticsReportsExcel', () => {
  it('writes N blobs to a pre-picked folder and never triggers anchor downloads', async () => {
    const withGeomA = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    const noGeom = makePlot({ fieldKey: 'skip', farmName: 'NoGeom' })
    const withGeomB = makePlot({ fieldKey: 'b', farmName: 'T-101', geometry: poly })
    const withGeomFail = makePlot({ fieldKey: 'fail', farmName: 'Broken', geometry: poly })

    const fetchDaily = vi.fn(async (plot: CropAlertFieldInput) => {
      if (plot.fieldKey === 'fail') throw new Error('fetch boom')
      return [{ date: '2024-06-01', ndvi: 0.55 }]
    })
    const buildPayload = vi.fn(async () => stubPayload)
    const writeBlob = vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false }))
    const buildBlob = vi.fn(async () => new Blob(['xlsx'], { type: 'application/octet-stream' }))
    const createElement = vi.spyOn(document, 'createElement')
    const onProgress = vi.fn()

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots: [withGeomA, noGeom, withGeomFail, withGeomB],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        exportDirectory: stubDir,
        folderPickAttempted: true,
        onProgress,
      },
      { fetchDaily, buildPayload, writeBlob, buildBlob },
    )

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
    expect(result.deliveryMode).toBe('folder')
    expect(result.savedToFolderCount).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.fieldKey).toBe('fail')
    expect(onProgress).toHaveBeenCalled()

    createElement.mockRestore()
  })

  it('skips folder picker when exportDirectory is pre-selected', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'A', geometry: poly })
    const writeBlob = vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false }))
    const buildBlob = vi.fn(async () => new Blob(['xlsx']))

    await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily: async () => [{ date: '2024-06-01', ndvi: 0.4 }],
        buildPayload: async () => stubPayload,
        writeBlob,
        buildBlob,
      },
    )

    expect(writeBlob).toHaveBeenCalledTimes(1)
  })

  it('requires a pre-picked folder', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    await expect(
      batchExportAnalyticsReportsExcel({
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        folderPickAttempted: true,
      }),
    ).rejects.toThrow(/Select a folder/)
  })

  it('uses Field_ID prefix when Field_Name duplicates (501a_2_KL-0231)', () => {
    const used = new Set<string>()
    const features = [
      {
        fieldKey: 'a',
        feature: {
          type: 'Feature' as const,
          properties: { Field_ID: '501a_2', Field_Name: 'KL-0231' },
          geometry: poly,
        },
      },
      {
        fieldKey: 'b',
        feature: {
          type: 'Feature' as const,
          properties: { Field_ID: '501a_3', Field_Name: 'KL-0231' },
          geometry: poly,
        },
      },
    ]
    const first = uniqueBatchPlotExcelFilename(
      makePlot({ fieldKey: 'a', farmName: 'ignored' }),
      used,
      { plotNameField: 'Field_Name', objectLayerFeatures: features },
    )
    const second = uniqueBatchPlotExcelFilename(
      makePlot({ fieldKey: 'b', farmName: 'ignored' }),
      used,
      { plotNameField: 'Field_Name', objectLayerFeatures: features },
    )
    expect(first).toBe('KL-0231.xlsx')
    expect(second).toBe('501a_3_KL-0231.xlsx')
  })

  it('names workbooks from the Plot Label field attribute', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'ignored', geometry: poly })
    const writeBlob = vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false }))
    const buildBlob = vi.fn(async () => new Blob(['xlsx']))

    await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        exportDirectory: stubDir,
        plotNameField: 'Field_Name',
        objectLayerFeatures: [
          {
            fieldKey: 'a',
            feature: {
              type: 'Feature',
              properties: { Field_Name: 'KL-233S' },
              geometry: poly,
            },
          },
        ],
        folderPickAttempted: true,
      },
      {
        fetchDaily: async () => [{ date: '2024-06-01', ndvi: 0.4 }],
        buildPayload: async () => stubPayload,
        writeBlob,
        buildBlob,
      },
    )

    expect(writeBlob.mock.calls[0]?.[1]).toBe('KL-233S.xlsx')
  })

  it('records save failure when folder write returns false (no Downloads fallback)', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'Plot A', geometry: poly })
    const writeBlob = vi.fn(async () => ({
      savedToFolder: false,
      usedDownloadFallback: false,
    }))
    const createElement = vi.spyOn(document, 'createElement')

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily: async () => [{ date: '2024-06-01', ndvi: 0.4 }],
        buildPayload: async () => stubPayload,
        writeBlob,
        buildBlob: vi.fn(async () => new Blob(['xlsx'])),
      },
    )

    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.savedToFolderCount).toBe(0)
    expect(result.downloadedCount).toBe(0)
    expect(createElement).not.toHaveBeenCalledWith('a')
    createElement.mockRestore()
  })

  it('records save errors when folder write throws', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'Plot A', geometry: poly })
    const writeBlob = vi.fn(async () => {
      throw new Error('disk full')
    })

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily: async () => [{ date: '2024-06-01', ndvi: 0.4 }],
        buildPayload: async () => stubPayload,
        writeBlob,
        buildBlob: vi.fn(async () => new Blob(['xlsx'])),
      },
    )

    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.savedToFolderCount).toBe(0)
    expect(writeBlob).toHaveBeenCalled()
  })

  it('passes aggregated multi-date chart labels to the report payload', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'Plot A', geometry: poly })
    const buildPayload = vi.fn(async () => stubPayload)
    const fetchDaily = vi.fn(async () => [
      { date: '2026-05-03', ndvi: 0.42, ndmi: 0.2, ndwi: null, evi: null, savi: null, ciRe: null, ndre: null },
      { date: '2026-06-19', ndvi: 0.55, ndmi: 0.25, ndwi: null, evi: null, savi: null, ciRe: null, ndre: null },
      { date: '2026-07-08', ndvi: 0.48, ndmi: 0.22, ndwi: null, evi: null, savi: null, ciRe: null, ndre: null },
    ])

    await batchExportAnalyticsReportsExcel(
      {
        plots: [plot],
        layerIds: ['NDVI'],
        fromDate: '2026-05-01',
        toDate: '2026-08-16',
        timeAggregation: 'day',
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily,
        buildPayload,
        writeBlob: vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false })),
        buildBlob: vi.fn(async () => new Blob(['xlsx'])),
      },
    )

    expect(buildPayload).toHaveBeenCalledTimes(1)
    const input = buildPayload.mock.calls[0]?.[0]
    expect(input?.chartLabels).toEqual(['2026-05-03', '2026-06-19', '2026-07-08'])
    expect(input?.timeAggregation).toBe('day')
    expect(input?.fromDate).toBe('2026-05-01')
    expect(input?.toDate).toBe('2026-08-16')
    expect(input?.enrichVegetationHistograms).toBe(false)
    expect(input?.includeMap).toBe(false)
    expect(input?.includeMapSnapshots).toBe(true)
    expect(input?.mapSnapshotAggregation).toBe('day')
    expect(input?.batchExportFastPath).toBe(true)
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
    const writeBlob = vi.fn(async () => ({ savedToFolder: true, usedDownloadFallback: false }))
    const buildBlob = vi.fn(async () => new Blob(['xlsx']))

    const result = await batchExportAnalyticsReportsExcel(
      {
        plots,
        layerIds: ['NDVI'],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        signal: controller.signal,
        exportDirectory: stubDir,
        folderPickAttempted: true,
      },
      {
        fetchDaily,
        buildPayload: async () => stubPayload,
        writeBlob,
        buildBlob,
      },
    )

    expect(result.aborted).toBe(true)
    expect(writeBlob).toHaveBeenCalledTimes(0)
    expect(result.succeeded + result.failed).toBeLessThanOrEqual(1)
  })

  it('integration: builds a real Analytics workbook blob through the batch fast path', async () => {
    const plot = makePlot({ fieldKey: 'a', farmName: 'T-100 SC0175', geometry: poly })
    const daily = [
      {
        date: '2026-06-01',
        ndvi: 0.55,
        ndmi: 0.2,
        ndwi: 0.1,
        savi: 0.4,
        ndre: 0.3,
        evi: null,
        ciRe: null,
      },
    ]
    const { buildAnalyticsChartFromDailyRows, buildTimeSeriesReportPayload } = await import(
      './buildTimeSeriesReportPayload'
    )
    const { buildTimeSeriesReportExcelBlob } = await import('./generateTimeSeriesReportExcel')
    const chart = buildAnalyticsChartFromDailyRows(
      plot.fieldKey,
      ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET'],
      daily,
      '2026-05-01',
      '2026-08-26',
      'day',
    )
    const payload = await buildTimeSeriesReportPayload({
      projectName: 'AgroCloud',
      generatedBy: 'AgroCloud',
      field: plot,
      fieldName: 'T-100 SC0175',
      fieldKey: plot.fieldKey,
      fromDate: '2026-05-01',
      toDate: '2026-08-26',
      acquisitionDate: '2026-06-01',
      layerIds: ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET'],
      chartLabels: chart.labels,
      displayLabels: chart.displayLabels,
      layerSeries: chart.series,
      dailyRows: daily,
      periodAnchorDates: chart.periodAnchorDates,
      batchExportFastPath: true,
      includeMap: false,
      includeMapSnapshots: false,
      mapSnapshotAggregation: 'day',
      includeLulcMapSnapshots: false,
      includeCumulativeMapSnapshots: false,
      includeChangeDetectionMapSnapshots: false,
      includeVegetationCoverageTimeline: false,
      enrichVegetationHistograms: false,
      includeWeatherTimeline: false,
    })
    const blob = await buildTimeSeriesReportExcelBlob(payload)
    expect(blob.size).toBeGreaterThan(2000)
    expect(blob.type).toContain('spreadsheetml')
  })
})
