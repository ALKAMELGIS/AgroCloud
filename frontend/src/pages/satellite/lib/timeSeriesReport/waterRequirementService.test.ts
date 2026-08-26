import { describe, expect, it } from 'vitest'
import { kcForGrowthStage, normalizeCropKey } from './cropCoefficients'
import {
  calculateETc,
  calculateEtConsumptionPercent,
  calculateFieldWaterRequirement,
  calculateGrossIrrigationRequirementMmDay,
  calculateNetWaterRequirementMmDay,
  calculateWaterStressPercent,
  calculateWaterVolumeM3,
  inferGrowthStage,
} from './waterRequirementService'

describe('waterRequirementService', () => {
  it('resolves crop keys and Kc by growth stage', () => {
    expect(normalizeCropKey('Potato')).toBe('potato')
    expect(kcForGrowthStage('potato', 'Mid-season')).toBe(1.15)
    expect(kcForGrowthStage('wheat', 'Initial')).toBe(0.3)
  })

  it('computes ETc = Kc × ET0', () => {
    expect(calculateETc(1.15, 5)).toBe(5.75)
    expect(calculateETc(null, 5)).toBeNull()
  })

  it('computes water stress only when AET and ETc are available', () => {
    expect(calculateWaterStressPercent(3, 5)).toBe(40)
    expect(calculateWaterStressPercent(6, 5)).toBe(0)
    expect(calculateWaterStressPercent(null, 5)).toBeNull()
  })

  it('computes ET consumption with bounds', () => {
    expect(calculateEtConsumptionPercent(4, 5)).toBe(80)
    expect(calculateEtConsumptionPercent(null, 5)).toBeNull()
  })

  it('computes net and gross irrigation with zero rainfall', () => {
    const net = calculateNetWaterRequirementMmDay({ etcMmDay: 5, effectiveRainfallMmDay: 0 })
    expect(net).toBe(5)
    const gross = calculateGrossIrrigationRequirementMmDay(net, 0.8)
    expect(gross).toBe(6.25)
  })

  it('converts mm/day to m³/day (1 mm × 1 ha = 10 m³)', () => {
    expect(calculateWaterVolumeM3(6.25, 10)).toBe(625)
  })

  it('infers growth stage from NDVI when planting date unknown', () => {
    expect(inferGrowthStage({ cropType: 'potato', observationDate: '2024-06-15', ndvi: 0.55 })).toBe(
      'Mid-season',
    )
    expect(inferGrowthStage({ cropType: 'potato', observationDate: '2024-06-15', ndvi: null })).toBe(
      'Unknown',
    )
  })

  it('builds full field water requirement with partial status when AET missing', () => {
    const result = calculateFieldWaterRequirement({
      fieldId: 'F-1',
      cropType: 'Potato',
      areaHa: 10,
      irrigationType: 'Pivot',
      observationDate: '2024-06-15',
      ndvi: 0.55,
      ndwi: 0.1,
      ndmi: 0.15,
      ndii: 0.15,
      et0MmDay: 5,
      effectiveRainfallMmDay: 0,
      periodDays: 90,
    })
    expect(result.etcMmDay).toBeCloseTo(1.15 * 5, 2)
    expect(result.aetMmDay).toBeNull()
    expect(result.waterStressPercent).toBeNull()
    expect(result.waterRequirementM3Day).toBeGreaterThan(0)
    expect(result.waterRequirementM3Week).toBeCloseTo((result.waterRequirementM3Day ?? 0) * 7, 0)
    expect(result.calculationStatus).toBe('partial')
    expect(result.sources.etSource).toContain('FAO-56')
  })

  it('sets complete status when AET satellite product is provided', () => {
    const result = calculateFieldWaterRequirement({
      fieldId: 'F-2',
      cropType: 'Maize',
      areaHa: 5,
      observationDate: '2024-07-01',
      ndvi: 0.55,
      ndwi: 0.05,
      ndmi: 0.1,
      ndii: 0.1,
      et0MmDay: 6,
      aetMmDay: 4,
      effectiveRainfallMmDay: 0,
    })
    expect(result.aetMmDay).toBe(4)
    expect(result.etConsumptionPercent).toBeCloseTo(55.6, 0)
    expect(result.calculationStatus).toBe('complete')
  })
})
