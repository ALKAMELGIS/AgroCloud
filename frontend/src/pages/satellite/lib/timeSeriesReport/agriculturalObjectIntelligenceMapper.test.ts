import { describe, expect, it, vi } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  activeStatusFromTemporal,
  agriculturalStatusFromEvidence,
  classifyNdviChange,
  cropGrowthStageFromNdvi,
  cropTypeSpectralProxy,
  estimateActualEtMm,
  estimateYieldTHa,
  geometryToWkt,
  landCoverFromSpectralIndices,
  mapLayerAttributesToAgriFields,
  mappedFieldsToRecord,
} from './agriculturalObjectIntelligenceMapper'
import { NOT_AVAILABLE, AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS } from './agriculturalObjectIntelligenceSchema'
import { buildAgriculturalObjectIntelligenceModel } from './buildAgriculturalObjectIntelligenceModel'

vi.mock('../../../../lib/openMeteoWeather', () => ({
  fetchOpenMeteoHistoryRange: vi.fn(async () => ({
    timezone: 'UTC',
    startDate: '2024-01-01',
    endDate: '2024-03-31',
    points: [
      {
        time: '2024-01-15T12:00',
        temperatureC: 22,
        weatherCode: 0,
        precipitationMm: 0,
        snowfallCm: null,
        humidityPct: 40,
        windSpeedKmh: 10,
        windDirectionDeg: 90,
        pressureHpa: 1012,
        et0Mm: 0.25,
        shortwaveRadiationWm2: 400,
      },
      {
        time: '2024-02-15T12:00',
        temperatureC: 24,
        weatherCode: 0,
        precipitationMm: 1,
        snowfallCm: null,
        humidityPct: 35,
        windSpeedKmh: 12,
        windDirectionDeg: 100,
        pressureHpa: 1010,
        et0Mm: 0.3,
        shortwaveRadiationWm2: 450,
      },
      {
        time: '2024-03-15T12:00',
        temperatureC: 26,
        weatherCode: 1,
        precipitationMm: 0,
        snowfallCm: null,
        humidityPct: 30,
        windSpeedKmh: 8,
        windDirectionDeg: 80,
        pressureHpa: 1008,
        et0Mm: 0.35,
        shortwaveRadiationWm2: 500,
      },
    ],
  })),
}))

const poly: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [55.0, 24.0],
      [55.001, 24.0],
      [55.001, 24.001],
      [55.0, 24.001],
      [55.0, 24.0],
    ],
  ],
}

describe('mapLayerAttributesToAgriFields', () => {
  it('maps Plot_ID / Crop_Type aliases and leaves missing keys as Not Available', () => {
    const mapped = mapLayerAttributesToAgriFields({
      props: {
        Plot_ID: 'P-17',
        Crop_Type: 'Date Palm',
        Farm_Name: 'Al Ain Block A',
      },
      geometry: poly,
      fallbackObjectId: 'fallback',
      fallbackName: 'fallback-name',
    })
    const rec = mappedFieldsToRecord(mapped)
    expect(rec.objectId).toBe('P-17')
    expect(rec.cropType).toBe('Date Palm')
    expect(rec.objectName).toBe('Al Ain Block A')
    expect(rec.cropGrowthStage).toBe(NOT_AVAILABLE)
    expect(rec.actualEt).toBe(NOT_AVAILABLE)
    expect(typeof rec.estimatedAreaHa).toBe('number')
    expect(rec.centroidLatitude).not.toBe(NOT_AVAILABLE)
  })

  it('does not invent crop type when property is absent', () => {
    const mapped = mapLayerAttributesToAgriFields({
      props: { OBJECTID: 42 },
      geometry: poly,
    })
    const crop = mapped.find(m => m.key === 'cropType')
    expect(crop?.value).toBe(NOT_AVAILABLE)
    expect(crop?.source).toBe('missing')
  })
})

describe('classifyNdviChange', () => {
  it('labels improving / declining / stable / insufficient / cultivated / abandoned', () => {
    expect(classifyNdviChange(0.3, 0.4, 4)).toBe('Improving')
    expect(classifyNdviChange(0.4, 0.3, 4)).toBe('Declining')
    expect(classifyNdviChange(0.35, 0.36, 4)).toBe('Stable')
    expect(classifyNdviChange(0.3, 0.4, 1)).toBe('Insufficient historical data')
    expect(classifyNdviChange(0.1, 0.4, 5)).toBe('Newly cultivated')
    expect(classifyNdviChange(0.45, 0.1, 5)).toBe('Potentially abandoned')
  })
})

describe('landCover / agricultural / active status from S2', () => {
  it('classifies land cover from NDVI/NDWI proxies', () => {
    expect(landCoverFromSpectralIndices({ ndvi: 0.5 })).toMatch(/Cropland|Vegetated/i)
    expect(landCoverFromSpectralIndices({ ndvi: 0.05 })).toMatch(/Bare/i)
    expect(landCoverFromSpectralIndices({ ndvi: 0.2, ndwi: 0.35 })).toMatch(/Water/i)
    expect(landCoverFromSpectralIndices({ ndvi: null })).toBe(NOT_AVAILABLE)
  })

  it('labels agricultural status from vegetation or object type', () => {
    expect(agriculturalStatusFromEvidence({ ndvi: 0.4 })).toBe('Agricultural')
    expect(agriculturalStatusFromEvidence({ ndvi: 0.05, ndwi: 0.4 })).toBe('Non-Agricultural')
    expect(agriculturalStatusFromEvidence({ ndvi: null, objectType: 'Farm plot' })).toBe(
      'Agricultural',
    )
  })

  it('labels active/inactive from temporal change', () => {
    expect(activeStatusFromTemporal({ change: 'Newly cultivated', lateNdvi: 0.4 })).toBe('Active')
    expect(activeStatusFromTemporal({ change: 'Potentially abandoned', lateNdvi: 0.1 })).toBe(
      'Inactive',
    )
    expect(activeStatusFromTemporal({ change: 'Stable', lateNdvi: 0.4 })).toBe('Active')
    expect(
      activeStatusFromTemporal({ change: 'Insufficient historical data', lateNdvi: 0.08 }),
    ).toBe('Inactive')
  })

  it('estimates growth-stage proxy and WKT boundary', () => {
    expect(cropGrowthStageFromNdvi({ lateNdvi: 0.58, earlyNdvi: 0.4, observationCount: 4 })).toMatch(
      /Flowering|Peak/i,
    )
    expect(geometryToWkt(poly)).toMatch(/^POLYGON\(\(/)
  })

  it('answers crop / ET / yield proxies without Not Available', () => {
    expect(cropTypeSpectralProxy({ ndvi: 0.45 })).toMatch(/cropland/i)
    expect(estimateYieldTHa(0.5)).toBeGreaterThan(1)
    const et = estimateActualEtMm({ et0TotalMm: 120, ndvi: 0.45, periodDays: 90 })
    expect(et?.formula).toMatch(/ETa|ET₀|Kc/i)
    expect(et?.etaMm).toBeGreaterThan(0)
  })
})

describe('buildAgriculturalObjectIntelligenceModel honesty', () => {
  const plot: CropAlertFieldInput = {
    fieldKey: 'vl:layer1:0',
    objectId: '42',
    farmName: 'Plot 42',
    farmCode: '',
    structureType: 'Field',
    country: '',
    city: '',
    centroid: [55.0005, 24.0005],
    geometry: poly,
  }

  function daily(date: string, ndvi: number, ndmi = 0.05): SentinelHubDailyIndexMeans {
    return {
      date,
      ndvi,
      ndmi,
      evi: ndvi * 0.9,
      savi: ndvi * 0.85,
      ndre: ndvi * 0.8,
      ndwi: -0.1,
      msavi: ndvi * 0.88,
      nbr: 0.2,
    }
  }

  it('answers ET / crop / yield columns with labeled estimates (no Not Available)', async () => {
    const model = await buildAgriculturalObjectIntelligenceModel({
      plots: [plot],
      features: [
        {
          fieldKey: plot.fieldKey,
          feature: {
            type: 'Feature',
            properties: { OBJECTID: 42, Name: 'Plot 42' },
            geometry: poly,
          },
        },
      ],
      layerName: 'Test Layer',
      fromDate: '2024-01-01',
      toDate: '2024-03-31',
      acquisitionDate: '2024-03-15',
      layerIds: ['NDVI', 'NDMI'],
      dailyByFieldKey: new Map([
        [
          plot.fieldKey,
          [daily('2024-01-10', 0.35), daily('2024-02-10', 0.32), daily('2024-03-10', 0.28)],
        ],
      ]),
    })

    const row = model.objects[0]!
    expect(String(row.cropType)).toMatch(/cropland|fallow|bare|tree|water|Unknown/i)
    expect(String(row.cropType)).not.toMatch(/^Not Available/i)
    expect(typeof row.actualEt === 'number' || String(row.actualEt)).toBeTruthy()
    expect(String(row.actualEt)).not.toMatch(/^Not Available/i)
    expect(typeof row.estimatedYield === 'number').toBe(true)
    expect(String(row.landCropSuitability)).toMatch(/suitable|Limited|Unknown|Poor|Marginal|High|Moderate/i)
    expect(String(row.landCropSuitability)).not.toMatch(/^Not Available/i)
    expect(row.landCoverType).not.toBe(NOT_AVAILABLE)
    expect(String(row.landCoverType)).toMatch(/Cropland|Fallow|Bare|Vegetat|Tree|Water/i)
    expect(row.agriculturalStatus).toBe('Agricultural')
    expect(row.activeStatus).toMatch(/Active|Inactive/)
    expect(typeof row.ndvi === 'number' || row.ndvi === NOT_AVAILABLE).toBe(true)
    expect(String(row.cropGrowthStage)).toMatch(/Growth|Flowering|Peak|Senescence|Dormant|Sparse|Mid|Insufficient/i)
    expect(String(row.boundaryCoordinates)).toMatch(/^POLYGON\(\(/)
    expect(String(row.capabilityStatus)).toMatch(/Available/i)
    expect(AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS).toHaveLength(46)
    expect(row.anomalyDetected === 'No' || String(row.anomalyDetected).startsWith('Yes')).toBe(true)
    expect(String(row.satelliteDataUsed)).toMatch(/Sentinel-2|NDVI/i)
    expect(String(row.expectedAccuracy)).toMatch(/%/)
    expect(model.equations.length).toBeGreaterThan(0)
    expect(model.meta.layerIndexLabel).toMatch(/NDVI/i)

    const exportKeys = AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS.map(c => c.key)
    for (const key of exportKeys) {
      const v = row[key]
      expect(v == null || v === '' || /^Not Available/i.test(String(v))).toBe(false)
    }

    const etMethod = model.methods.find(m => /Actual ET/i.test(m.field))
    expect(etMethod?.capabilityStatus).toMatch(/SENTINEL|AVAILABLE/i)

    const cropMethod = model.methods.find(m => m.field === 'Crop Type')
    expect(cropMethod?.capabilityStatus).toMatch(/SENTINEL|AVAILABLE/i)
  })

  it('keeps layer Crop_Type and does not invent MSAVI gap when zonal value exists', async () => {
    const model = await buildAgriculturalObjectIntelligenceModel({
      plots: [plot],
      features: [
        {
          fieldKey: plot.fieldKey,
          feature: {
            type: 'Feature',
            properties: { Plot_ID: 'P-9', Crop_Type: 'Wheat' },
            geometry: poly,
          },
        },
      ],
      layerName: 'Wheat Layer',
      fromDate: '2024-01-01',
      toDate: '2024-02-28',
      acquisitionDate: '2024-02-20',
      dailyByFieldKey: new Map([
        [plot.fieldKey, [daily('2024-01-15', 0.4), daily('2024-02-15', 0.45)]],
      ]),
    })

    expect(model.objects[0]!.cropType).toBe('Wheat')
    const cropGap = model.gaps.find(g => g.field === 'Crop Type')
    expect(cropGap).toBeFalsy()
    const msaviGap = model.gaps.find(g => /MSAVI/i.test(g.field))
    expect(msaviGap).toBeFalsy()
    expect(model.sentinel2[0]!.msavi).not.toBe(NOT_AVAILABLE)
  })
})
