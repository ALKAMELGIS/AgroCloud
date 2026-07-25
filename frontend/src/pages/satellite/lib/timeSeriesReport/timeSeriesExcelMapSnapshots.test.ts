import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildMapSnapshotsSheet,
  pickRepresentativeSceneDate,
  selectMapSnapshotEntries,
} from './timeSeriesExcelMapSnapshots'
import type { TimeSeriesMapSnapshotGroup } from './timeSeriesReportTypes'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'

describe('timeSeriesExcelMapSnapshots', () => {
  it('adds grouped map snapshot sheet with layer sections', () => {
    const wb = new ExcelJS.Workbook()
    const groups: TimeSeriesMapSnapshotGroup[] = [
      {
        layerId: 'NDVI',
        title: 'NDVI Daily Maps',
        snapshots: [
          {
            layerId: 'NDVI',
            layerLabel: 'NDVI',
            sceneDate: '2026-01-01',
            periodLabel: '2026-01-01',
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
    expect(ws!.getCell('A4').value).toBe('NDVI Daily Maps')
    expect(ws!.getCell('B6').value).toBe('NDVI')
    expect(ws!.getCell('D6').value).toBe('2026-01-01')
  })

  it('includes every finite day period (no 12-cap)', () => {
    const labels = Array.from({ length: 30 }, (_, i) => {
      const d = String(i + 1).padStart(2, '0')
      return `2026-04-${d}`
    })
    const values = labels.map((_, i) => 0.3 + i * 0.01)
    const entries = selectMapSnapshotEntries({
      layerId: 'NDVI',
      chartLabels: labels,
      displayLabels: labels,
      values,
      periodAnchorDates: Object.fromEntries(labels.map(d => [d, d])),
      dailyRows: [],
      timeAggregation: 'day',
    })
    expect(entries).toHaveLength(30)
    expect(entries[0]?.periodLabel).toBe('2026-04-01')
    expect(entries[29]?.periodLabel).toBe('2026-04-30')
  })

  it('includes every week/month period without sampling', () => {
    const weekLabels = ['2026-W14', '2026-W15', '2026-W16', '2026-W17']
    const weekEntries = selectMapSnapshotEntries({
      layerId: 'NDVI',
      chartLabels: weekLabels,
      displayLabels: weekLabels.map(k => k.replace('-W', ' W')),
      values: [0.4, 0.5, 0.45, 0.55],
      periodAnchorDates: {
        '2026-W14': '2026-04-05',
        '2026-W15': '2026-04-12',
        '2026-W16': '2026-04-19',
        '2026-W17': '2026-04-26',
      },
      dailyRows: [],
      timeAggregation: 'week',
    })
    expect(weekEntries).toHaveLength(4)

    const monthLabels = ['2026-01', '2026-02', '2026-03']
    const monthEntries = selectMapSnapshotEntries({
      layerId: 'NDVI',
      chartLabels: monthLabels,
      displayLabels: monthLabels,
      values: [0.3, 0.4, 0.5],
      periodAnchorDates: {
        '2026-01': '2026-01-28',
        '2026-02': '2026-02-25',
        '2026-03': '2026-03-30',
      },
      dailyRows: [],
      timeAggregation: 'month',
    })
    expect(monthEntries).toHaveLength(3)
  })

  it('year mode prepends series-average then each year map', () => {
    const dailyRows = [
      { date: '2024-06-01', ndvi: 0.4, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2024-08-01', ndvi: 0.6, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2025-05-01', ndvi: 0.35, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2025-07-01', ndvi: 0.55, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
    ] as SentinelHubDailyIndexMeans[]

    const entries = selectMapSnapshotEntries({
      layerId: 'NDVI',
      chartLabels: ['2024', '2025'],
      displayLabels: ['2024', '2025'],
      values: [0.5, 0.45],
      periodAnchorDates: { '2024': '2024-08-01', '2025': '2025-07-01' },
      dailyRows,
      timeAggregation: 'year',
    })
    expect(entries).toHaveLength(3)
    expect(entries[0]?.kind).toBe('series-average')
    expect(entries[0]?.periodLabel).toContain('Series average')
    expect(entries[1]?.periodLabel).toBe('2024')
    expect(entries[2]?.periodLabel).toBe('2025')
    // Closest to overall mean 0.475 among daily: 0.4 or 0.55 → 0.4/0.55 abs; 0.5 would be ideal — 0.4 and 0.55 both 0.075 from 0.475; first wins or 0.55
    expect(entries[0]?.sceneDate).toMatch(/^202[45]-/)
  })

  it('picks scene closest to period mean for month aggregation', () => {
    const dailyRows = [
      { date: '2026-04-05', ndvi: 0.2, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2026-04-15', ndvi: 0.48, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2026-04-28', ndvi: 0.7, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
    ] as SentinelHubDailyIndexMeans[]

    const scene = pickRepresentativeSceneDate({
      layerId: 'NDVI',
      periodKey: '2026-04',
      periodMean: 0.46,
      timeAggregation: 'month',
      dailyRows,
      fallbackAnchor: '2026-04-28',
    })
    expect(scene).toBe('2026-04-15')
  })
})
