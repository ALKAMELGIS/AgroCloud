import { describe, expect, it } from 'vitest'
import {
  buildWapiRecommendedAction,
  buildWapiAlertDataRawRows,
  classifyWapiAlertLevel,
  classifyWapiHarvestStage,
  evaluateWapiAlertField,
  extractWapiAlertFieldsFromMask,
  isWapiLayerId,
  resolveWapiPriorityRank,
  runWapiAlertEngine,
  wapiAlertLevelColor,
  type WapiAlertFieldInput,
} from './siWapiAlertEngine'
import { wapiAlertLevelFillArgb } from './siWapiAlertExcel'

describe('siWapiAlertEngine', () => {
  it('identifies WAPI layer id', () => {
    expect(isWapiLayerId('WAPI')).toBe(true)
    expect(isWapiLayerId('wapi')).toBe(true)
    expect(isWapiLayerId('NDVI')).toBe(false)
  })

  it('classifies ISS → irrigation alertLevel thresholds', () => {
    expect(classifyWapiAlertLevel(-0.4)).toBe('critical')
    expect(classifyWapiAlertLevel(-0.39)).toBe('severe')
    expect(classifyWapiAlertLevel(-0.27)).toBe('warning')
    expect(classifyWapiAlertLevel(-0.16)).toBe('watch')
    expect(classifyWapiAlertLevel(0.07)).toBe('safe')
    expect(classifyWapiAlertLevel(0.42)).toBe('safe')
    expect(classifyWapiAlertLevel(0.43)).toBe('overwatering')
  })

  it('maps alert levels to irrigation colors', () => {
    expect(wapiAlertLevelColor('critical')).toBe('#e91e63')
    expect(wapiAlertLevelColor('severe')).toBe('#ef6c00')
    expect(wapiAlertLevelColor('warning')).toBe('#fbc02d')
    expect(wapiAlertLevelColor('watch')).toBe('#26a69a')
    expect(wapiAlertLevelColor('safe')).toBe('#43a047')
    expect(wapiAlertLevelColor('overwatering')).toBe('#5c6bc0')
  })

  it('classifies harvest stages from NDVI phenology', () => {
    expect(
      classifyWapiHarvestStage({ ndvi: 0.1, seasonalPeakNdvi: 0.75, ndviChangePct2: -30 }),
    ).toBe('completed')
    expect(
      classifyWapiHarvestStage({ ndvi: 0.5, seasonalPeakNdvi: 0.7, ndviChangePct2: -18 }),
    ).toBe('detected')
    expect(
      classifyWapiHarvestStage({ ndvi: 0.78, seasonalPeakNdvi: 0.8, ndviChangePct2: -3 }),
    ).toBe('approaching')
    expect(classifyWapiHarvestStage({ ndvi: 0.55 })).toBe('pre-peak')
  })

  it('demotes irrigation rank one step after harvest completed', () => {
    expect(resolveWapiPriorityRank('critical', 'completed')).toBe(2)
    expect(resolveWapiPriorityRank('severe', 'completed')).toBe(3)
    expect(resolveWapiPriorityRank('safe', 'completed')).toBe(6)
  })

  it('keeps Critical/Severe irrigation actions with mm guidance', () => {
    expect(resolveWapiPriorityRank('critical', 'approaching')).toBe(1)
    expect(resolveWapiPriorityRank('severe', 'detected')).toBe(2)
    expect(buildWapiRecommendedAction('severe', 'approaching')).toContain('12 hrs')
    expect(buildWapiRecommendedAction('critical', 'pre-peak')).toContain('Irrigate NOW')
    expect(buildWapiRecommendedAction('safe', 'pre-peak')).toBe('No action')
    expect(buildWapiRecommendedAction('watch', 'completed')).toContain('Post-harvest')
  })

  it('sorts engine results by priorityRank ascending', () => {
    const fields: WapiAlertFieldInput[] = [
      {
        fieldKey: 'a',
        fieldId: '1',
        fieldName: 'A',
        centroid: [0, 0],
      },
      {
        fieldKey: 'b',
        fieldId: '2',
        fieldName: 'B',
        centroid: [1, 1],
      },
    ]
    const live = new Map([
      [
        'a',
        {
          current: { ndvi: 0.5, ndwi: 0.2, ndmi: 0.25, evi: 0.4 },
          previous: { ndvi: 0.5, ndwi: 0.2, ndmi: 0.25, evi: 0.4 },
        },
      ],
      [
        'b',
        {
          current: { ndvi: 0.2, ndwi: -0.3, ndmi: -0.25, evi: 0.1 },
          previous: { ndvi: 0.35, ndwi: -0.1, ndmi: -0.05, evi: 0.2 },
        },
      ],
    ])
    const results = runWapiAlertEngine(fields, '2026-07-01', live)
    expect(results[0]!.priorityRank).toBeLessThanOrEqual(results[1]!.priorityRank)
    expect(results.every(r => r.color.startsWith('#'))).toBe(true)
  })

  it('evaluateWapiAlertField computes ISS / ΔISS / irrigation alert', () => {
    const field: WapiAlertFieldInput = {
      fieldKey: 'f1',
      fieldId: '10',
      fieldName: 'Plot 10',
      centroid: [55, 25],
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
    }
    const r = evaluateWapiAlertField(
      field,
      '2026-07-01',
      {
        current: { ndvi: 0.4, ndmi: -0.1, ndwi: -0.2, evi: 0.3 },
        previous: { ndvi: 0.45, ndmi: 0.05, ndwi: -0.05, evi: 0.35 },
        sceneDate: '2026-06-28',
      },
      { periodStart: '2026-04-23', periodEnd: '2026-07-01' },
    )
    expect(r.fieldId).toBe('10')
    expect(Number.isFinite(r.iss)).toBe(true)
    expect(r.periodStart).toBe('2026-04-23')
    expect(r.periodEnd).toBe('2026-07-01')
    expect(r).not.toHaveProperty('wdsi')
    expect(r).not.toHaveProperty('wapi')
    expect(r.recommendedAction.length).toBeGreaterThan(0)
    expect(r.sceneDate).toBe('2026-06-28')
    expect(['critical', 'severe', 'warning', 'watch', 'safe', 'overwatering']).toContain(
      r.alertLevel,
    )
  })

  it('extractWapiAlertFieldsFromMask reads AOI polygons', () => {
    const fields = extractWapiAlertFieldsFromMask({
      features: [
        {
          type: 'Feature',
          properties: { Name: 'North Plot', OBJECTID: 29 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    })
    expect(fields).toHaveLength(1)
    expect(fields[0]!.fieldName).toBe('North Plot')
    expect(fields[0]!.fieldId).toBe('29')
  })

  it('builds DataRaw rows with ISS inside the analysis period', () => {
    const fields: WapiAlertFieldInput[] = [
      {
        fieldKey: 'f1',
        fieldId: '10',
        fieldName: 'T-24',
        centroid: [55, 25],
      },
    ]
    const series = new Map([
      [
        'f1',
        {
          daily: [
            { date: '2026-04-01', ndvi: 0.2, ndmi: -0.3, ndwi: -0.3, evi: 0.2, savi: 0.25, ciRe: null },
            { date: '2026-05-01', ndvi: 0.3, ndmi: -0.2, ndwi: -0.25, evi: 0.25, savi: 0.35, ciRe: null },
            { date: '2026-08-01', ndvi: 0.4, ndmi: -0.1, ndwi: -0.2, evi: 0.3, savi: 0.45, ciRe: null },
          ],
        },
      ],
    ])
    const rows = buildWapiAlertDataRawRows(fields, series, '2026-04-23', '2026-07-22')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.plot).toBe('T-24')
    expect(rows[0]!.date).toBe('2026-05-01')
    expect(Number.isFinite(rows[0]!.iss)).toBe(true)
  })
})

describe('siWapiAlertExcel', () => {
  it('paints Critical fill argb', () => {
    expect(wapiAlertLevelFillArgb('critical')).toBe('FFE91E63')
    expect(wapiAlertLevelFillArgb('critical', '#e91e63')).toBe('FFE91E63')
    expect(wapiAlertLevelFillArgb('severe')).toBe('FFEF6C00')
    expect(wapiAlertLevelFillArgb('safe', '#43a047')).toBe('FF43A047')
  })
})
