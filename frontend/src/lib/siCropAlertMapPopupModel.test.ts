import { describe, expect, it } from 'vitest'
import {
  buildCropAlertPopupViewModel,
  estimateFieldCoverage,
  estimateNdviFieldCoverage,
  resolveFieldAreaHaFromGeometry,
} from './siCropAlertMapPopupModel'
import { computeChas, chasInputsFromSnapshot, classifyCdsiInsightTier, CDSI_INSIGHT_EMOJI } from './siCropAlertDchasBeacon'
import { deriveCoherentIndicesFromNdvi } from './siCropAlertEngine'
import type { CropAlertFieldResult } from './siCropAlertEngine'

function testSnapshot(ndvi: number, ndmi: number, ndwi: number) {
  const derived = deriveCoherentIndicesFromNdvi(ndvi, 'f1', '2026-06-10')
  return { ndvi, ndmi, ndwi, evi: derived.evi, ciRe: derived.ciRe }
}

function baseResult(overrides: Partial<CropAlertFieldResult> = {}): CropAlertFieldResult {
  const current = testSnapshot(0.81, 0.42, 0.25)
  const previous7 = testSnapshot(0.78, 0.4, 0.24)
  const chasCurrent = computeChas(chasInputsFromSnapshot(current))
  const chasPrevious = computeChas(chasInputsFromSnapshot(previous7))
  return {
    fieldKey: 'f1',
    objectId: '1349',
    farmName: 'Plot A',
    farmCode: 'P-A',
    structureType: 'pivot',
    centroid: [55.1, 25.2],
    current,
    previous7,
    previous30: testSnapshot(0.72, 0.38, 0.22),
    deltaPct: { ndvi: 2, ndwi: 1, ndmi: 1 },
    trend: 'stable',
    seasonalPeakNdvi: 0.82,
    status: 'healthy',
    severity: 'normal',
    alertTypes: [],
    title: 'Stable canopy',
    message: 'Crop vigor is stable.',
    evaluatedAt: '2026-06-10T10:00:00Z',
    imageDate: '2026-06-10',
    requestedDate: '2026-06-10',
    usedDate: '2026-06-10',
    analysisDate: '2026-06-10',
    dataSource: 'Sentinel Live',
    dataQuality: 'verified',
    dataWarning: null,
    dataReason: null,
    liveVerified: true,
    ndviMean3: 0.8,
    ndviSceneDates: ['2026-06-10', '2026-06-03', '2026-05-27'],
    ndviSceneValues: [0.81, 0.8, 0.8],
    ndmiSceneValues: [0.42, 0.4, 0.39],
    ndwiSceneValues: [0.24, 0.22, 0.21],
    ndviChangePct2: 1,
    ndviTrendLabel: 'Latest scene only',
    alertReasonLines: ['Stable / Improving · ΔCHAS +0.004 (scene change detection)', 'CHAS 0.622 · previous 0.617'],
    alertExplanation: 'Continue routine monitoring.',
    chasCurrent,
    chasPrevious,
    deltaChas: Number((chasCurrent - chasPrevious).toFixed(4)),
    ...overrides,
  }
}

describe('siCropAlertMapPopupModel', () => {
  it('builds field info line with lat/lon, name, and id', () => {
    const result = baseResult()
    const vm = buildCropAlertPopupViewModel(result)
    expect(vm.fieldInfoLine).toContain('25.200°N')
    expect(vm.fieldInfoLine).toContain('55.100°E')
    expect(vm.fieldInfoLine).toContain('Plot A')
    expect(vm.fieldInfoLine).toContain('#1349')
    expect(vm.smartCropInsight.cdsi).toBeCloseTo(result.chasCurrent!, 2)
    expect(vm.smartCropInsight.tier).toBe(classifyCdsiInsightTier(result.chasCurrent!))
    expect(vm.smartCropInsight.emoji).toBe(CDSI_INSIGHT_EMOJI[classifyCdsiInsightTier(result.chasCurrent!)])
  })

  it('derives vegetation and bare coverage from NDVI', () => {
    expect(estimateFieldCoverage(0.81)).toEqual({ vegetationPct: 81, bareAreaPct: 19 })
  })

  it('resolves index trend from newest vs previous scene', () => {
    const vm = buildCropAlertPopupViewModel(
      baseResult({
        ndviSceneValues: [0.85, 0.8, 0.78],
        ndmiSceneValues: [0.4, 0.42, 0.41],
        ndwiSceneValues: [0.22, 0.24, 0.23],
      }),
    )
    expect(vm.cropStatus.ndvi.trend).toBe('up')
    expect(vm.cropStatus.ndmi.trend).toBe('down')
    expect(vm.cropStatus.ndwi.trend).toBe('down')
  })

  it('splits field area into planted and bare hectares matching NDVI percentages', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [55.0, 25.0],
          [55.01, 25.0],
          [55.01, 25.009],
          [55.0, 25.009],
          [55.0, 25.0],
        ],
      ],
    }
    const fieldHa = resolveFieldAreaHaFromGeometry(geometry)
    expect(fieldHa).not.toBeNull()
    const coverage = estimateNdviFieldCoverage(0.92, fieldHa)
    expect(coverage.vegetationPct).toBe(92)
    expect(coverage.bareAreaPct).toBe(8)
    expect(coverage.vegetationHa).not.toBeNull()
    expect(coverage.bareAreaHa).not.toBeNull()
    expect((coverage.vegetationHa ?? 0) + (coverage.bareAreaHa ?? 0)).toBeCloseTo(fieldHa!, 2)
    expect(coverage.vegetationHa).toBeCloseTo((fieldHa! * 92) / 100, 1)
  })

  it('includes hectare split on land coverage when geometry is present', () => {
    const vm = buildCropAlertPopupViewModel(
      baseResult({
        current: { ndvi: 0.92, ndwi: 0.11, ndmi: 0.42, evi: 0.5 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [54.97, 24.71],
              [54.98, 24.71],
              [54.98, 24.72],
              [54.97, 24.72],
              [54.97, 24.71],
            ],
          ],
        },
      }),
    )
    expect(vm.coverage.vegetationPct).toBe(92)
    expect(vm.coverage.fieldAreaHa).not.toBeNull()
    expect(vm.landSplit[0]?.areaHa).not.toBeNull()
    expect(vm.landSplit[1]?.areaHa).not.toBeNull()
  })

  it('builds CHAS trend from per-scene AOI Layer Live indices', () => {
    const vm = buildCropAlertPopupViewModel(baseResult())
    expect(vm.chasTrend.values.length).toBe(3)
    expect(vm.chasTrend.labels).toEqual(['05-27', '06-03', '06-10'])
    expect(new Set(vm.chasTrend.values.map(v => v.toFixed(3))).size).toBeGreaterThan(1)
    expect(vm.chasTrend.values[0]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.8, 0.39, 0.21))),
      3,
    )
    expect(vm.chasTrend.values[1]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.8, 0.4, 0.22))),
      3,
    )
    expect(vm.chasTrend.values[2]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.81, 0.42, 0.24))),
      3,
    )
  })

  it('derives per-scene CHAS when NDMI/NDWI series are shorter than NDVI scenes', () => {
    const vm = buildCropAlertPopupViewModel(
      baseResult({
        ndmiSceneValues: [0.42],
        ndwiSceneValues: [0.24],
      }),
    )
    expect(vm.chasTrend.values[0]).not.toBe(vm.chasTrend.values[1])
    expect(vm.chasTrend.values[1]).not.toBe(vm.chasTrend.values[2])
    expect(vm.chasTrend.values[2]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.81, 0.42, 0.24))),
      3,
    )
  })

  it('builds three-point CHAS trend when only two Sentinel scenes exist', () => {
    const vm = buildCropAlertPopupViewModel(
      baseResult({
        ndviSceneDates: ['2026-05-22', '2026-05-17'],
        ndviSceneValues: [0.55, 0.62],
        ndmiSceneValues: [0.35, 0.38],
        ndwiSceneValues: [0.18, 0.2],
        usedDate: '2026-05-22',
        analysisDate: '2026-05-22',
      }),
    )
    expect(vm.chasTrend.labels).toEqual(['04-17', '05-17', '05-22'])
    expect(vm.chasTrend.values).toHaveLength(3)
    expect(vm.chasTrend.values[0]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.72, 0.38, 0.22))),
      3,
    )
    expect(vm.chasTrend.values[1]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.62, 0.38, 0.2))),
      3,
    )
    expect(vm.chasTrend.values[2]).toBeCloseTo(
      computeChas(chasInputsFromSnapshot(testSnapshot(0.55, 0.35, 0.18))),
      3,
    )
  })

  it('computes NDMI and NDWI min max mean from Layer Live zonal stats when available', () => {
    const vm = buildCropAlertPopupViewModel(
      baseResult({
        layerLiveZonal: {
          sceneDate: '2026-06-10',
          ndvi: { min: 0.61, max: 0.92, mean: 0.81 },
          ndmi: { min: 0.28, max: 0.51, mean: 0.42 },
          ndwi: { min: 0.12, max: 0.31, mean: 0.24 },
        },
      }),
    )
    expect(vm.cropStatus.ndvi.min).toBe(0.61)
    expect(vm.cropStatus.ndvi.max).toBe(0.92)
    expect(vm.cropStatus.ndvi.mean).toBe(0.81)
    expect(vm.cropStatus.ndmi.min).toBe(0.28)
    expect(vm.cropStatus.ndmi.max).toBe(0.51)
    expect(vm.cropStatus.ndmi.min).not.toBe(vm.cropStatus.ndmi.max)
  })

  it('falls back to scene series when zonal stats are unavailable', () => {
    const vm = buildCropAlertPopupViewModel(baseResult())
    expect(vm.cropStatus.ndmi.min).toBe(0.39)
    expect(vm.cropStatus.ndmi.max).toBe(0.42)
  })
})
