import { describe, expect, it } from 'vitest'
import type { FieldSummaryModel } from './buildFieldSummaryModel'
import {
  NDVI_VEGETATION_THRESHOLD,
  buildProductionEstimationRow,
  classifyNdviStressLevel,
  computeFieldWaterLossMetrics,
  estimateHarvestProductionTons,
  estimateNdviVegetatedAreas,
  ndviHealthFactor,
  resolveEffectiveAetMmDay,
  sumProductionEstimationTotals,
  sumWaterLossTotals,
  sumWaterRequirementTotals,
} from './productionEstimationSheet'

function baseSummary(partial: Partial<FieldSummaryModel> = {}): FieldSummaryModel {
  return {
    fieldName: 'Farm A',
    plotId: 'F-001',
    layerFieldId: 'F-001',
    originalFieldName: 'Farm A',
    cropType: 'Potato',
    layerIrrigationType: 'Pivot',
    areaHa: 100,
    vegetationHealthScore: 0.5,
    moistureScore: 0.2,
    waterStatus: 'Low',
    ndvi: 0.52,
    ndwi: 0.1,
    ndmi: 0.2,
    ndii: 0.2,
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
    phenologyPlantingDate: null,
    phenologyHarvestDate: null,
    periodDays: 30,
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
    const row = buildProductionEstimationRow(baseSummary(), { et0MmDay: 5, aetMmDay: 3.5 })
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
    expect(row.growthStage).toBe('Mid-season')
    expect(row.et0MmDay).toBe(5)
    expect(row.etcMmDay).toBeGreaterThan(0)
    expect(row.aetMmDay).not.toBeNull()
    expect(row.etConsumptionPercent).not.toBeNull()
    expect(row.waterStressPercent).not.toBeNull()
    expect(row.waterRequirementM3Day).toBeGreaterThan(0)
    expect(row.waterLossIndexPct).not.toBeNull()
    expect(row.waterLossIndexPct!).toBeLessThanOrEqual(100)
    expect(row.waterLossM3Day).toBeGreaterThan(0)
    expect(row.waterLossM3HaDay).toBeGreaterThan(0)
    expect(row.observationDate).toBe('2024-06-15')
  })

  it('derives water loss index from per-ha loss over ETc demand (no applied water)', () => {
    const metrics = computeFieldWaterLossMetrics({
      areaHa: 100,
      etcMmDay: 5,
      aetMmDay: 3.5,
    })
    expect(metrics.waterLossM3HaDay).toBeCloseTo(15, 0)
    expect(metrics.waterLossM3Day).toBeCloseTo(1500, 0)
    expect(metrics.waterLossIndexPct).toBeCloseTo(30, 0)
  })

  it('matches ET deficit loss example (20% index)', () => {
    const metrics = computeFieldWaterLossMetrics({
      areaHa: 100,
      etcMmDay: 5,
      aetMmDay: 4,
    })
    expect(metrics.waterLossM3HaDay).toBeCloseTo(10, 0)
    expect(metrics.waterLossM3Day).toBeCloseTo(1000, 0)
    expect(metrics.waterLossIndexPct).toBeCloseTo(20, 0)
  })

  it('does not force 100% from moisture indices when AET is available', () => {
    const row = buildProductionEstimationRow(
      baseSummary({ ndmi: -0.1, ndwi: -0.2 }),
      { et0MmDay: 5, aetMmDay: 4 },
    )
    expect(row.waterLossIndexPct).not.toBeNull()
    expect(row.waterLossIndexPct!).toBeLessThan(100)
    expect(row.waterLossIndexPct!).toBeGreaterThan(0)
  })

  it('estimates AET from NDMI/NDWI and ETc when satellite AET is missing', () => {
    const resolved = resolveEffectiveAetMmDay({
      etcMmDay: 5,
      ndmi: 0.2,
      ndwi: 0.1,
      ndvi: 0.52,
      sceneDate: '2024-06-15',
    })
    expect(resolved.aetMmDay).not.toBeNull()
    expect(resolved.aetMmDay!).toBeGreaterThan(0)
    expect(resolved.aetMmDay!).toBeLessThan(5)
    expect(resolved.fromSatellite).toBe(false)
  })

  it('derives water loss from NDMI/NDWI layer indices when satellite AET is not used', () => {
    const row = buildProductionEstimationRow(baseSummary({ ndmi: 0.2, ndwi: 0.1 }), { et0MmDay: 5 })
    expect(row.waterLossIndexPct).not.toBeNull()
    expect(row.waterLossIndexPct!).toBeGreaterThan(0)
    expect(row.waterLossIndexPct!).toBeLessThan(100)
    expect(row.waterLossM3Day).toBeGreaterThan(0)
    expect(row.waterLossM3HaDay).toBeGreaterThan(0)
    expect(row.aetMmDay).not.toBeNull()
    expect(row.etConsumptionPercent).not.toBeNull()
    expect(row.waterStressPercent).not.toBeNull()
    expect(row.etConsumptionPercent! + row.waterStressPercent!).toBeCloseTo(100, 0)
  })

  it('returns zero loss when satellite AET meets or exceeds ETc', () => {
    const row = buildProductionEstimationRow(baseSummary(), { et0MmDay: 5, aetMmDay: 50 })
    expect(row.waterLossIndexPct).toBe(0)
    expect(row.waterLossM3Day).toBe(0)
  })

  it('computes portfolio water loss index as total loss over total ETc volume', () => {
    const a = buildProductionEstimationRow(baseSummary({ plotId: 'F-001' }), {
      et0MmDay: 5,
      aetMmDay: 3.5,
    })
    const b = buildProductionEstimationRow(baseSummary({ plotId: 'F-002', areaHa: 50 }), {
      et0MmDay: 5,
      aetMmDay: 3.5,
    })
    const loss = sumWaterLossTotals([a, b])
    const totalEtcVolume =
      (a.etcMmDay ?? 0) * (a.totalAreaHa ?? 0) * 10 + (b.etcMmDay ?? 0) * (b.totalAreaHa ?? 0) * 10
    expect(loss.totalWaterLossM3Day).toBeGreaterThan(0)
    expect(totalEtcVolume).toBeGreaterThan(0)
    const expected = Number(((loss.totalWaterLossM3Day! / totalEtcVolume) * 100).toFixed(1))
    expect(loss.totalWaterLossIndexPct).toBe(expected)
    expect(loss.totalWaterLossIndexPct).toBeLessThan(100)
    expect(loss.totalWaterLossM3HaDay).toBeGreaterThan(0)
    expect(loss.meanWaterLossM3HaDay).toBeGreaterThan(0)
  })

  it('sums water portfolio totals from computed row values', () => {
    const a = buildProductionEstimationRow(baseSummary({ plotId: 'F-001' }), { et0MmDay: 5 })
    const b = buildProductionEstimationRow(baseSummary({ plotId: 'F-002', areaHa: 50 }), { et0MmDay: 5 })
    const totals = sumWaterRequirementTotals([a, b])
    expect(totals.totalFields).toBe(2)
    expect(totals.totalDailyWaterM3).toBeGreaterThan(0)
    expect(totals.totalWeeklyWaterM3).toBeGreaterThan(0)
    expect(totals.totalMonthlyWaterM3).toBeGreaterThan(0)
    expect(totals.averageEtConsumptionPct).not.toBeNull()
    expect(totals.averageWaterStressPct).not.toBeNull()
    expect(totals.averageEtConsumptionPct! + totals.averageWaterStressPct!).toBeCloseTo(100, 0)
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
