import { describe, expect, it } from 'vitest'
import type { FieldSummaryModel } from './buildFieldSummaryModel'
import {
  NDVI_VEGETATION_THRESHOLD,
  buildProductionEstimationRow,
  classifyNdviStressLevel,
  estimateHarvestProductionTons,
  estimateNdviVegetatedAreas,
  ndviHealthFactor,
  sumProductionEstimationTotals,
} from './productionEstimationSheet'

function baseSummary(partial: Partial<FieldSummaryModel> = {}): FieldSummaryModel {
  return {
    fieldName: 'Farm A',
    plotId: 'F-001',
    cropType: 'Potato',
    areaHa: 100,
    vegetationHealthScore: 0.5,
    moistureScore: 0.2,
    waterStatus: 'Low',
    ndvi: 0.52,
    ndmi: 0.2,
    ndre: 0.3,
    yieldFactor: 0.4,
    maxYieldTHa: 55,
    yieldTHa: 22,
    productionTons: 2200,
    harvestWindow: 'Pre-peak',
    irrigationStatus: 'Adequate',
    overallFieldHealth: 'Moderate',
    recommendation: '—',
    sceneDate: '2024-06-15',
    fromDate: '2024-06-01',
    toDate: '2024-06-30',
    ...partial,
  }
}

describe('productionEstimationSheet', () => {
  it('classifies NDVI stress bands per calculation method', () => {
    expect(classifyNdviStressLevel(0.61)).toBe('Healthy Crop')
    expect(classifyNdviStressLevel(0.52)).toBe('Moderate Crop')
    expect(classifyNdviStressLevel(0.3)).toBe('Stressed Crop')
    expect(classifyNdviStressLevel(0.1)).toBe('Non-Vegetated / Unplanned')
    expect(classifyNdviStressLevel(null)).toBe('—')
  })

  it('estimates ~85% vegetation coverage for NDVI 0.52 on a 100 ha field', () => {
    const areas = estimateNdviVegetatedAreas({ areaHa: 100, ndviMean: 0.52 })
    expect(areas.vegetationCoveragePct).toBeCloseTo(85, 0)
    expect(areas.vegetatedAreaHa).toBeCloseTo(85, 0)
    expect(areas.nonVegetatedAreaHa).toBeCloseTo(15, 0)
  })

  it('treats NDVI below vegetation threshold as fully unplanned', () => {
    const areas = estimateNdviVegetatedAreas({
      areaHa: 50,
      ndviMean: NDVI_VEGETATION_THRESHOLD - 0.01,
    })
    expect(areas.vegetationCoveragePct).toBe(0)
    expect(areas.vegetatedAreaHa).toBe(0)
    expect(areas.nonVegetatedAreaHa).toBe(50)
  })

  it('computes harvest production as vegetated area × yield × health factor', () => {
    expect(
      estimateHarvestProductionTons({
        vegetatedAreaHa: 85,
        expectedYieldTHa: 20,
        ndviHealthFactor: 0.85,
      }),
    ).toBeCloseTo(85 * 20 * 0.85, 2)
    expect(ndviHealthFactor(0.52)).toBe(0.85)
  })

  it('builds a production row matching the Excel table fields', () => {
    const row = buildProductionEstimationRow(baseSummary())
    expect(row.fieldId).toBe('F-001')
    expect(row.farmName).toBe('Farm A')
    expect(row.cropClassification).toBe('Potato')
    expect(row.totalAreaHa).toBe(100)
    expect(row.plannedCropCoverageHa).toBeCloseTo(85, 0)
    expect(row.unplannedAreaHa).toBeCloseTo(15, 0)
    expect(row.vegetationCoveragePct).toBeCloseTo(85, 0)
    expect(row.averageNdvi).toBe(0.52)
    expect(row.stressLevel).toBe('Moderate Crop')
    expect(row.expectedYieldTHa).toBe(22)
    expect(row.ndviHealthFactor).toBe(0.85)
    expect(row.estimatedHarvestProductionTons).toBeCloseTo(
      (row.plannedCropCoverageHa ?? 0) * 22 * 0.85,
      2,
    )
  })

  it('sums TOTAL columns across fields', () => {
    const a = buildProductionEstimationRow(baseSummary({ plotId: 'F-001', areaHa: 100, ndvi: 0.52 }))
    const b = buildProductionEstimationRow(
      baseSummary({
        plotId: 'F-002',
        farmName: 'Farm B',
        cropType: 'Wheat',
        areaHa: 200,
        ndvi: 0.61,
        yieldTHa: 25,
      }),
    )
    const totals = sumProductionEstimationTotals([a, b])
    expect(totals.totalAreaHa).toBeCloseTo(300, 1)
    expect(totals.plannedCropCoverageHa).toBeGreaterThan(200)
    expect(totals.estimatedHarvestProductionTons).toBeGreaterThan(0)
  })
})
