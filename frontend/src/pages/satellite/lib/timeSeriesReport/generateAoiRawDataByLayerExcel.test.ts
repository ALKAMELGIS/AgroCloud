import { describe, expect, it } from 'vitest'
import {
  aoiHealthScore,
  classifyAoiVegetationStatus,
  cleanAoiPlotDisplayId,
  buildAoiRawObservations,
} from './generateAoiRawDataByLayerExcel'
import { AOI_EXCEL_NO_DATA, collectMasterAcquisitionDates, excelMissing } from './aoiExcelExportShared'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'

describe('cleanAoiPlotDisplayId', () => {
  it('strips AOI: and layer-name prefixes', () => {
    expect(cleanAoiPlotDisplayId('AOI: T-32')).toBe('T-32')
    expect(cleanAoiPlotDisplayId('Potato_Plots: T-100 SC0175')).toBe('T-100 SC0175')
  })

  it('rejects zip / custom upload ids', () => {
    expect(cleanAoiPlotDisplayId('custom-1785144098362-AOI.zip-14')).toBe('Plot 14')
    expect(cleanAoiPlotDisplayId('custom-1785144098362-AOI.zip')).toBe('Plot')
  })
})

describe('classifyAoiVegetationStatus', () => {
  it('classifies healthy / moderate / stress', () => {
    expect(classifyAoiVegetationStatus(0.72, 0.05)).toBe('Healthy')
    expect(classifyAoiVegetationStatus(0.5, -0.05)).toBe('Moderate')
    expect(classifyAoiVegetationStatus(0.25, -0.25)).toBe('Stress')
  })
})

describe('aoiHealthScore', () => {
  it('scores healthy plots higher than stressed', () => {
    expect(
      aoiHealthScore({ ndvi: 0.7, ndmi: 0.1, savi: 0.5, ndwi: 0.2 }),
    ).toBeGreaterThan(aoiHealthScore({ ndvi: 0.2, ndmi: -0.3, savi: 0.15, ndwi: -0.1 }))
  })
})

describe('excelMissing', () => {
  it('writes No Data for nulls', () => {
    expect(excelMissing(null)).toBe(AOI_EXCEL_NO_DATA)
    expect(excelMissing(0.45)).toBe(0.45)
  })
})

describe('buildAoiRawObservations', () => {
  it('aligns all plots to a shared master date timeline', () => {
    const poly = {
      type: 'Polygon' as const,
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
    const plots: CropAlertFieldInput[] = [
      {
        fieldKey: 'vl:a:0',
        objectId: '1',
        farmName: 'AOI: T-32',
        farmCode: '',
        structureType: 'AOI',
        country: '',
        city: '',
        centroid: [0, 0],
        geometry: poly,
      },
      {
        fieldKey: 'vl:a:1',
        objectId: '2',
        farmName: 'AOI: T-33',
        farmCode: '',
        structureType: 'AOI',
        country: '',
        city: '',
        centroid: [0, 0],
        geometry: poly,
      },
    ]
    const daily = new Map<string, SentinelHubDailyIndexMeans[]>([
      [
        'vl:a:0',
        [
          {
            date: '2026-01-01',
            ndvi: 0.45,
            ndmi: -0.12,
            ndwi: 0.21,
            evi: 0.38,
            savi: 0.31,
            ciRe: null,
          },
          {
            date: '2026-01-08',
            ndvi: 0.51,
            ndmi: -0.08,
            ndwi: 0.24,
            evi: 0.42,
            savi: 0.36,
            ciRe: null,
          },
        ],
      ],
      [
        'vl:a:1',
        [
          {
            date: '2026-01-01',
            ndvi: 0.4,
            ndmi: -0.18,
            ndwi: 0.15,
            evi: 0.3,
            savi: 0.28,
            ciRe: null,
          },
        ],
      ],
    ])
    const { observations, dates } = buildAoiRawObservations(
      plots,
      ['NDVI', 'NDMI'],
      daily,
      '2026-01-01',
      '2026-01-31',
    )
    expect(dates).toEqual(['2026-01-01', '2026-01-08'])
    expect(observations).toHaveLength(4)
    const t33Missing = observations.find(o => o.plotId === 'T-33' && o.date === '2026-01-08')
    expect(t33Missing?.values.NDVI).toBeNull()
    expect(
      collectMasterAcquisitionDates(daily.values(), '2026-01-01', '2026-01-31', row => {
        const r = row as SentinelHubDailyIndexMeans
        return r.ndvi != null
      }),
    ).toEqual(['2026-01-01', '2026-01-08'])
  })
})
