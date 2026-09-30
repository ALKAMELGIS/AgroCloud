import { describe, expect, it } from 'vitest'
import { DEFAULT_CROP_ALERT_ENGINE_SETTINGS } from './siCropAlertEngine'
import type { NdviSceneSeriesAnalysis } from './siCropAlertNdviTimeSeries'
import {
  decideChangeDetectionStatus,
  decideCurrentPlantHealthStatus,
  decideNdviAlertStatus,
} from './siCropAlertNdviDecision'

const changeSettings = {
  ...DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
  analysisMode: 'change-detection' as const,
}

const watchSeries: NdviSceneSeriesAnalysis = {
  scenes: [
    { date: '2026-06-03', ndvi: 0.78, ndwi: 0.18, ndmi: 0.28 },
    { date: '2026-05-27', ndvi: 0.86, ndwi: 0.19, ndmi: 0.29 },
    { date: '2026-05-20', ndvi: 0.88, ndwi: 0.2, ndmi: 0.3 },
  ],
  currentDate: '2026-06-03',
  ndviCurrent: 0.78,
  ndviMean3: 0.84,
  ndviDelta2: -0.08,
  ndviChangePct2: -9.3,
  ndwiCurrent: 0.18,
  ndmiCurrent: 0.28,
  anchorDate: '2026-06-08',
  requestedDate: '2026-06-08',
  fallbackUsed: false,
}

const criticalSeries: NdviSceneSeriesAnalysis = {
  scenes: [
    { date: '2026-06-03', ndvi: 0.58, ndwi: 0.04, ndmi: 0.08 },
    { date: '2026-05-27', ndvi: 0.78, ndwi: 0.06, ndmi: 0.11 },
    { date: '2026-05-20', ndvi: 0.82, ndwi: 0.05, ndmi: 0.1 },
  ],
  currentDate: '2026-06-03',
  ndviCurrent: 0.58,
  ndviMean3: 0.73,
  ndviDelta2: -0.2,
  ndviChangePct2: -25.6,
  ndwiCurrent: 0.04,
  ndmiCurrent: 0.08,
  anchorDate: '2026-06-08',
  requestedDate: '2026-06-08',
  fallbackUsed: false,
}

const growingSeries: NdviSceneSeriesAnalysis = {
  scenes: [
    { date: '2026-06-03', ndvi: 0.52, ndwi: 0.35, ndmi: 0.39 },
    { date: '2026-05-27', ndvi: 0.46, ndwi: 0.33, ndmi: 0.37 },
    { date: '2026-05-20', ndvi: 0.41, ndwi: 0.31, ndmi: 0.35 },
  ],
  currentDate: '2026-06-03',
  ndviCurrent: 0.52,
  ndviMean3: 0.46,
  ndviDelta2: 0.06,
  ndviChangePct2: 13,
  ndwiCurrent: 0.35,
  ndmiCurrent: 0.39,
  anchorDate: '2026-06-08',
  requestedDate: '2026-06-08',
  fallbackUsed: false,
}

const harvestGrowthSeries: NdviSceneSeriesAnalysis = {
  ...watchSeries,
  scenes: [
    { date: '2026-06-03', ndvi: 0.78, ndwi: 0.18, ndmi: 0.28 },
    { date: '2026-05-27', ndvi: 0.72, ndwi: 0.19, ndmi: 0.29 },
    { date: '2026-05-20', ndvi: 0.66, ndwi: 0.2, ndmi: 0.3 },
  ],
}

describe('siCropAlertNdviDecision', () => {
  it('change mode: Watch at -9.3% vs prior scene', () => {
    const decision = decideChangeDetectionStatus({
      current: { ndvi: 0.78, ndwi: 0.18, ndmi: 0.28, evi: 0 },
      trend: 'decreasing',
      seasonalPeakNdvi: 0.88,
      series: watchSeries,
      settings: changeSettings,
    })

    expect(decision.status).toBe('watch')
    expect(decision.ndviChangePct2).toBeCloseTo(-9.3, 1)
  })

  it('current health mode: harvest ready only with growth pattern', () => {
    const decision = decideCurrentPlantHealthStatus({
      current: { ndvi: 0.78, ndwi: 0.18, ndmi: 0.28, evi: 0 },
      trend: 'increasing',
      seasonalPeakNdvi: 0.88,
      series: harvestGrowthSeries,
      settings: DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    })

    expect(decision.status).toBe('harvest-approaching')
  })

  it('current health mode: high NDVI without growth pattern downgrades to watch', () => {
    const decision = decideCurrentPlantHealthStatus({
      current: { ndvi: 0.78, ndwi: 0.18, ndmi: 0.28, evi: 0 },
      trend: 'decreasing',
      seasonalPeakNdvi: 0.88,
      series: watchSeries,
      settings: DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    })

    expect(decision.status).toBe('watch')
  })

  it('current health: PIVOT-2 moderate NDVI 0.52 → Healthy with growth scenes', () => {
    const decision = decideCurrentPlantHealthStatus({
      current: { ndvi: 0.52, ndwi: 0.35, ndmi: 0.39, evi: 0 },
      trend: 'increasing',
      seasonalPeakNdvi: 0.52,
      series: growingSeries,
      settings: DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    })
    expect(decision.status).toBe('healthy')
  })

  it('returns no-crop-activity for bare unplanted land', () => {
    const decision = decideCurrentPlantHealthStatus({
      current: { ndvi: 0.06, ndwi: 0.01, ndmi: 0.02, evi: 0 },
      trend: 'stable',
      seasonalPeakNdvi: 0.06,
      series: {
        ...growingSeries,
        scenes: [
          { date: '2026-06-03', ndvi: 0.06, ndwi: 0.01, ndmi: 0.02 },
          { date: '2026-05-27', ndvi: 0.05, ndwi: 0.0, ndmi: 0.01 },
          { date: '2026-05-20', ndvi: 0.05, ndwi: 0.0, ndmi: 0.0 },
        ],
        ndviCurrent: 0.06,
      },
      settings: DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    })
    expect(decision.status).toBe('no-crop-activity')
  })

  it('change mode: Critical when drop exceeds 20%', () => {
    const decision = decideChangeDetectionStatus({
      current: { ndvi: 0.58, ndwi: 0.04, ndmi: 0.08, evi: 0 },
      trend: 'decreasing',
      seasonalPeakNdvi: 0.82,
      series: criticalSeries,
      settings: changeSettings,
    })

    expect(decision.status).toBe('critical')
  })

  it('decideNdviAlertStatus routes by analysisMode', () => {
    const input = {
      current: { ndvi: 0.52, ndwi: 0.35, ndmi: 0.39, evi: 0 },
      trend: 'increasing' as const,
      seasonalPeakNdvi: 0.52,
      series: growingSeries,
      settings: DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    }
    expect(decideNdviAlertStatus(input).status).toBe('healthy')
    expect(
      decideNdviAlertStatus({ ...input, settings: changeSettings }).status,
    ).toBe('growing')
  })
})
