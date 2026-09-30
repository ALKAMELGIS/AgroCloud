import { describe, expect, it } from 'vitest'
import {
  buildIndexSnapshot,
  classifyCropAlertFromNdviSeries,
  classifyDeltaSeverity,
  applyCropAlertEngineDefaultOperatingState,
  CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION,
  DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
  evaluateCropAlertField,
  extractCropAlertFieldsFromMask,
  isCropAlertResultsCacheFresh,
  loadCropAlertEngineSettingsForSatellitePage,
  normalizeCropAlertEngineSettings,
  runCropAlertEngine,
  sampleSentinelIndexForField,
  type CropAlertResultsCache,
} from './siCropAlertEngine'
import type { NdviSceneSeriesAnalysis } from './siCropAlertNdviTimeSeries'

describe('siCropAlertEngine', () => {
  const field = {
    fieldKey: 'f-1',
    objectId: '1',
    farmName: 'Field A',
    farmCode: 'MH101',
    structureType: 'Farm Plots',
    centroid: [55.1, 25.2] as [number, number],
  }

  it('sampleSentinelIndexForField is stable for same inputs', () => {
    const a = sampleSentinelIndexForField('f-1', 'NDVI', '2026-06-08', 'Farm Plots')
    const b = sampleSentinelIndexForField('f-1', 'NDVI', '2026-06-08', 'Farm Plots')
    expect(a).toBe(b)
  })

  it('sampleSentinelIndexForField spreads NDVI across fields for map color diversity', () => {
    const values = ['f-1', 'f-2', 'f-3', 'f-4', 'f-5'].map(key =>
      sampleSentinelIndexForField(key, 'NDVI', '2026-06-08', 'Farm Plots'),
    )
    const min = Math.min(...values)
    const max = Math.max(...values)
    expect(max - min).toBeGreaterThan(0.25)
    expect(min).toBeLessThan(0.35)
    expect(max).toBeGreaterThan(0.45)
  })

  it('classifyDeltaSeverity bands', () => {
    expect(classifyDeltaSeverity(1)).toBe('normal')
    expect(classifyDeltaSeverity(-8)).toBe('warning')
    expect(classifyDeltaSeverity(-15)).toBe('high')
    expect(classifyDeltaSeverity(-25)).toBe('critical')
  })

  it('evaluateCropAlertField returns structured result', () => {
    const r = evaluateCropAlertField(field, '2026-06-08', {
      enabled: true,
      aoiMode: 'agro-default',
      indices: { NDVI: true, NDWI: true, NDMI: true, EVI: false },
      alertTypes: {
        'crop-stress': true,
        'water-stress': true,
        'drought-risk': true,
        'disease-risk': false,
        'harvest-readiness': true,
        'irrigation-required': true,
        'vegetation-recovery': true,
      },
      notifyInApp: true,
      notifyEmail: false,
      notifySms: false,
      notifyPush: false,
      refreshMinutes: 5,
    })
    expect(r.status).toBeTruthy()
    expect(r.current.ndvi).toBeGreaterThan(0)
    expect(r.message).toContain('Field A')
    expect(r.dominantNdvi).toBeDefined()
    expect(r.dominantLevel).toBeTruthy()
    expect(r.dominantAreaPct).toBeGreaterThan(0)
    expect(r.ndviClassDistribution).toBeDefined()
  })

  it('extractCropAlertFieldsFromMask filters Farm Plots and PIVOT', () => {
    const fields = extractCropAlertFieldsFromMask({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1, Structure_Type: 1007, Farm_Name: 'A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [55, 25],
                [55.01, 25],
                [55.01, 25.01],
                [55, 25.01],
                [55, 25],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 2, Structure_Type: 1000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [56, 26],
                [56.01, 26],
                [56.01, 26.01],
                [56, 26.01],
                [56, 26],
              ],
            ],
          },
        },
      ],
    })
    expect(fields).toHaveLength(1)
    expect(fields[0]?.farmName).toBe('A')
    expect(fields[0]?.centroid[0]).toBeCloseTo(55.005, 3)
    expect(fields[0]?.centroid[1]).toBeCloseTo(25.005, 3)
  })

  it('applyCropAlertEngineDefaultOperatingState forces Layer Live defaults ON', () => {
    const migrated = applyCropAlertEngineDefaultOperatingState({ enabled: false, schemaVersion: 1 })
    expect(migrated.enabled).toBe(true)
    expect(migrated.showLegend).toBe(true)
    expect(migrated.aoiMode).toBe('agro-default')
    expect(migrated.schemaVersion).toBe(CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION)
  })

  it('loadCropAlertEngineSettingsForSatellitePage defaults layers OFF', () => {
    const key = 'test-si-crop-alert-engine'
    const migrationKey = `${key}:si-layer-defaults-v2`
    localStorage.removeItem(key)
    localStorage.removeItem(migrationKey)
    const loaded = loadCropAlertEngineSettingsForSatellitePage({ engineKey: key })
    expect(loaded.enabled).toBe(false)
    expect(loaded.showLegend).toBe(false)
    localStorage.removeItem(key)
    localStorage.removeItem(migrationKey)
  })

  it('normalizeCropAlertEngineSettings defaults enabled to ON', () => {
    expect(DEFAULT_CROP_ALERT_ENGINE_SETTINGS.enabled).toBe(true)
    expect(normalizeCropAlertEngineSettings({}).enabled).toBe(true)
    expect(normalizeCropAlertEngineSettings({ enabled: false }).enabled).toBe(false)
  })

  it('isCropAlertResultsCacheFresh respects reference date and refresh window', () => {
    const cache: CropAlertResultsCache = {
      referenceDate: '2026-06-07',
      userRequestedDate: '2026-06-07',
      imageryContext: {
        userRequestedDate: '2026-06-07',
        imageDate: '2026-06-07',
        analysisDate: '2026-06-07',
        latestSceneDate: null,
        dataSource: 'Sentinel Live',
        quality: 'verified',
        warningMessage: null,
      },
      results: [],
      lastRunAt: Date.now() - 60_000,
      liveFieldCount: 0,
    }
    expect(isCropAlertResultsCacheFresh(null, '2026-06-07', 5)).toBe(false)
    cache.results = [
      evaluateCropAlertField(field, '2026-06-07', DEFAULT_CROP_ALERT_ENGINE_SETTINGS),
    ]
    expect(isCropAlertResultsCacheFresh(cache, '2026-06-07', 5)).toBe(true)
    expect(isCropAlertResultsCacheFresh(cache, '2026-06-08', 5)).toBe(false)
  })

  it('runCropAlertEngine processes batch', () => {
    const snap = buildIndexSnapshot('x', '2026-06-08', 'PIVOT')
    expect(snap.ndvi).toBeGreaterThan(0)
    const results = runCropAlertEngine([field], '2026-06-08', {
      enabled: true,
      aoiMode: 'agro-default',
      indices: { NDVI: true, NDWI: true, NDMI: true, EVI: false },
      alertTypes: {
        'crop-stress': true,
        'water-stress': true,
        'drought-risk': true,
        'disease-risk': false,
        'harvest-readiness': true,
        'irrigation-required': true,
        'vegetation-recovery': true,
      },
      notifyInApp: true,
      notifyEmail: false,
      notifySms: false,
      notifyPush: false,
      refreshMinutes: 5,
    })
    expect(results).toHaveLength(1)
  })

  it('evaluateCropAlertField uses NDVI 3-scene series for Watch classification', () => {
    const ndviSeries: NdviSceneSeriesAnalysis = {
      scenes: [
        { date: '2026-06-05', ndvi: 0.78, ndwi: 0.18, ndmi: 0.28 },
        { date: '2026-06-01', ndvi: 0.86, ndwi: 0.21, ndmi: 0.31 },
        { date: '2026-05-28', ndvi: 0.88, ndwi: 0.22, ndmi: 0.32 },
      ],
      currentDate: '2026-06-05',
      ndviCurrent: 0.78,
      ndviMean3: 0.84,
      ndviDelta2: -0.08,
      ndviChangePct2: -9.3,
      ndwiCurrent: 0.18,
      ndmiCurrent: 0.28,
    }
    const r = evaluateCropAlertField(field, '2026-06-08', DEFAULT_CROP_ALERT_ENGINE_SETTINGS, {
      current: { ndvi: 0.78, ndwi: 0.18, ndmi: 0.28, evi: 0 },
      previous7: { ndvi: 0.86, ndwi: 0.2, ndmi: 0.3, evi: 0 },
      previous30: { ndvi: 0.82, ndwi: 0.19, ndmi: 0.29, evi: 0 },
      seasonalPeakNdvi: 0.88,
      trend: 'decreasing',
      ndviSeries,
      imagery: {
        imageDate: '2026-06-05',
        sensingDate: '2026-06-05',
        analysisDate: '2026-06-08',
        requestedDate: '2026-06-08',
        dataSource: 'Sentinel Live',
        dataQuality: 'scene-mismatch',
        liveVerified: true,
        warningMessage: null,
        dataReason: 'No Sentinel data available for current date',
      },
    })
    expect(r.status).toBe('harvest-approaching')
    expect(r.requestedDate).toBe('2026-06-08')
    expect(r.usedDate).toBe('2026-06-05')
    expect(r.dataReason).toBe('No Sentinel data available for current date')
    expect(r.ndviMean3).toBe(0.84)
    expect(r.ndviChangePct2).toBe(-9.3)
    expect(r.ndviSceneValues).toEqual([0.78, 0.86, 0.88])
  })
})
