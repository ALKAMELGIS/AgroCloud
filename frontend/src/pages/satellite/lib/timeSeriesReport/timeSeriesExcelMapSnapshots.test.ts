import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildMapSnapshotsSheet,
  collectTimeSeriesSnapshotPeriods,
} from './timeSeriesExcelMapSnapshots'
import type { TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'

describe('timeSeriesExcelMapSnapshots', () => {
  it('collects every chart period in chronological order without an 8-snapshot cap', () => {
    const chartLabels = Array.from({ length: 20 }, (_, i) => `2026-W${String(i + 1).padStart(2, '0')}`)
    const displayLabels = chartLabels.map(k => `Week ${k.slice(-2)}`)
    const periodAnchorDates = Object.fromEntries(
      chartLabels.map((k, i) => [k, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`]),
    )
    const periods = collectTimeSeriesSnapshotPeriods({ chartLabels, displayLabels, periodAnchorDates })
    expect(periods).toHaveLength(20)
    expect(periods[0]!.sceneDate <= periods[periods.length - 1]!.sceneDate).toBe(true)
  })

  it('dedupes periods that share the same scene date', () => {
    const periods = collectTimeSeriesSnapshotPeriods({
      chartLabels: ['2026-W01', '2026-W02', '2026-W03'],
      displayLabels: ['W01', 'W02', 'W03'],
      periodAnchorDates: {
        '2026-W01': '2026-01-07',
        '2026-W02': '2026-01-07',
        '2026-W03': '2026-01-14',
      },
    })
    expect(periods).toHaveLength(2)
    expect(periods.map(p => p.sceneDate)).toEqual(['2026-01-07', '2026-01-14'])
  })

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
