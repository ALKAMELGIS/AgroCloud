import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildMapSnapshotsSheet } from './timeSeriesExcelMapSnapshots'
import type { TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'

describe('timeSeriesExcelMapSnapshots', () => {
  it('adds grouped map snapshot sheet with layer sections', () => {
    const wb = new ExcelJS.Workbook()
    const groups: TimeSeriesMapSnapshotGroup[] = [
      {
        layerId: 'NDVI',
        title: 'NDVI Snapshots',
        snapshots: [
          {
            layerId: 'NDVI',
            layerLabel: 'NDVI',
            sceneDate: '2026-01-01',
            periodLabel: '2026-W01',
            imageBase64: null,
            dataSource: 'Sentinel-2 L2A (Sentinel Hub WMS)',
            mean: 0.52,
            min: 0.31,
            max: 0.68,
            areaHa: 120.5,
            legendText: 'Healthy · Moderate · Stress',
            notes: 'Moderate vigor across the AOI.',
          },
        ],
      },
    ]
    buildMapSnapshotsSheet(wb, groups)
    const ws = wb.getWorksheet('Map Snapshots')
    expect(ws).toBeTruthy()
    expect(ws!.getCell('A1').value).toContain('Map Snapshots')
    expect(ws!.getCell('A4').value).toBe('NDVI Snapshots')
    expect(ws!.getCell('B6').value).toBe('NDVI')
    expect(ws!.getCell('D6').value).toBe('2026-01-01')
  })
})
