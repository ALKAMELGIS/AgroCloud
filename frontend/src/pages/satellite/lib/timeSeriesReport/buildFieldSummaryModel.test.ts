import { describe, expect, it } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  aggregateFieldSummaryPortfolio,
  buildFieldSummaryModel,
  computeVegetationHealthScore,
  mapWaterStressToIrrigationStatus,
  resolveFieldHarvestWindow,
} from './buildFieldSummaryModel'
import { sanitizeFieldSummaryExcelFilename } from './generateFieldSummaryExcel'

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

function makePlot(
  partial: Partial<CropAlertFieldInput> & { fieldKey: string } & {
    cropType?: string
    Crop_Type?: string
  },
): CropAlertFieldInput {
  return {
    fieldKey: partial.fieldKey,
    objectId: partial.objectId ?? '17',
    farmName: partial.farmName ?? 'Plot',
    farmCode: partial.farmCode ?? '',
    structureType: partial.structureType ?? 'AOI',
    country: partial.country ?? '',
    city: partial.city ?? '',
    centroid: partial.centroid ?? [0, 0],
    geometry: partial.geometry ?? poly,
    ...(partial.cropType != null ? { cropType: partial.cropType } : {}),
    ...(partial.Crop_Type != null ? { Crop_Type: partial.Crop_Type } : {}),
  } as CropAlertFieldInput
}

function daily(
  date: string,
  values: {
    ndvi?: number | null
    ndmi?: number | null
    ndwi?: number | null
    ndre?: number | null
    savi?: number | null
  },
): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi: values.ndvi ?? null,
    ndwi: values.ndwi ?? null,
    ndmi: values.ndmi ?? null,
    evi: null,
    savi: values.savi ?? null,
    ciRe: null,
    ndre: values.ndre ?? null,
  }
}

describe('sanitizeFieldSummaryExcelFilename', () => {
  it('keeps spaces and hyphens for plot labels like T-100 SC0175', () => {
    expect(sanitizeFieldSummaryExcelFilename('T-100 SC0175')).toBe('T-100 SC0175.xlsx')
    expect(sanitizeFieldSummaryExcelFilename('Potato_Plots: T-100 SC0175')).toBe('T-100 SC0175.xlsx')
  })
})

describe('computeVegetationHealthScore', () => {
  it('computes VHS as (NDVI + SAVI) / 2', () => {
    expect(computeVegetationHealthScore(daily('2024-06-01', { ndvi: 0.6, savi: 0.4 }))).toBe(0.5)
  })

  it('estimates SAVI when missing and returns null without NDVI', () => {
    const score = computeVegetationHealthScore(daily('2024-06-01', { ndvi: 0.6, ndmi: 0.2 }))
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThan(0.4)
    expect(score!).toBeLessThan(0.8)
    expect(computeVegetationHealthScore(daily('2024-06-01', { ndmi: 0.2 }))).toBeNull()
  })
})

describe('resolveFieldHarvestWindow', () => {
  it('returns Insufficient data for empty series', () => {
    expect(resolveFieldHarvestWindow([])).toBe('Insufficient data')
  })

  it('classifies approaching harvest for high stable NDVI', () => {
    expect(
      resolveFieldHarvestWindow([
        daily('2024-06-01', { ndvi: 0.74 }),
        daily('2024-06-10', { ndvi: 0.73 }),
        daily('2024-06-20', { ndvi: 0.72 }),
      ]),
    ).toBe('Approaching harvest')
  })

  it('classifies harvest completed for sharp post-peak drop', () => {
    expect(
      resolveFieldHarvestWindow([
        daily('2024-05-01', { ndvi: 0.75 }),
        daily('2024-07-01', { ndvi: 0.1 }),
      ]),
    ).toBe('Harvest completed')
  })
})

describe('mapWaterStressToIrrigationStatus', () => {
  it('maps water stress levels to irrigation phrases', () => {
    expect(mapWaterStressToIrrigationStatus('Low')).toBe('Adequate')
    expect(mapWaterStressToIrrigationStatus('Moderate')).toBe('Monitor')
    expect(mapWaterStressToIrrigationStatus('High')).toBe('Irrigation advised')
    expect(mapWaterStressToIrrigationStatus('Critical')).toBe('Urgent irrigation')
  })
})

describe('buildFieldSummaryModel', () => {
  it('builds VHS, moisture, yield, and harvest metrics from daily rows', () => {
    const model = buildFieldSummaryModel({
      plot: makePlot({
        fieldKey: 'a',
        farmName: 'AOI: T-100 SC0175',
        objectId: '100',
        cropType: 'Potato',
      }),
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      dailyRows: [
        daily('2024-06-01', { ndvi: 0.55, ndmi: 0.2, ndwi: 0.15, ndre: 0.4 }),
        daily('2024-06-15', { ndvi: 0.72, ndmi: 0.25, ndwi: 0.18, ndre: 0.45, savi: 0.68 }),
      ],
    })

    expect(model.fieldName).toBe('T-100 SC0175')
    expect(model.plotId).toBe('100')
    expect(model.cropType).toBe('Potato')
    expect(model.vegetationHealthScore).toBeCloseTo((0.72 + 0.68) / 2, 3)
    expect(model.moistureScore).not.toBeNull()
    expect(model.waterStatus).not.toBe('—')
    expect(model.yieldTHa).not.toBeNull()
    expect(model.productionTons).not.toBeNull()
    expect(model.ndvi).toBeCloseTo(0.72, 2)
    expect(model.ndmi).toBeCloseTo(0.25, 2)
    expect(model.ndre).toBeCloseTo(0.45, 2)
    expect(model.yieldFactor).not.toBeNull()
    expect(model.maxYieldTHa).toBe(55)
    expect(model.harvestWindow).not.toBe('Insufficient data')
    expect(model.irrigationStatus).not.toBe('—')
    expect(model.recommendation.length).toBeGreaterThan(0)
    expect(model.sceneDate).toBe('2024-06-15')
  })

  it('uses — when crop type is missing', () => {
    const model = buildFieldSummaryModel({
      plot: makePlot({ fieldKey: 'no-crop', farmName: 'Field A' }),
      fromDate: '2024-06-01',
      toDate: '2024-06-01',
      dailyRows: [daily('2024-06-01', { ndvi: 0.5, ndmi: 0.2, ndwi: 0.1, ndre: 0.3 })],
    })
    expect(model.cropType).toBe('—')
  })
})

describe('aggregateFieldSummaryPortfolio', () => {
  it('aggregates healthy / moderate / stressed counts', () => {
    const base = buildFieldSummaryModel({
      plot: makePlot({ fieldKey: 'a', farmName: 'A' }),
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      dailyRows: [daily('2024-06-15', { ndvi: 0.7, ndmi: 0.2, ndwi: 0.15, ndre: 0.4 })],
    })
    const stressed = {
      ...base,
      fieldName: 'B',
      overallFieldHealth: 'Stress' as const,
      yieldTHa: 20,
      productionTons: 10,
      vegetationHealthScore: 0.3,
      moistureScore: 0.1,
    }
    const portfolio = aggregateFieldSummaryPortfolio([base, stressed])
    expect(portfolio.fieldCount).toBe(2)
    expect(portfolio.stressedCount).toBe(1)
    expect(portfolio.healthyCount + portfolio.moderateCount + portfolio.stressedCount).toBe(2)
    expect(portfolio.totalProductionTons).toBeGreaterThan(0)
  })
})
