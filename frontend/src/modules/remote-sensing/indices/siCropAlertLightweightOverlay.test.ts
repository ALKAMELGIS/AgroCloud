import { describe, expect, it } from 'vitest'
import type { CropAlertFieldResult } from './siCropAlertEngine'
import {
  buildCropAlertLightweightOverlayGeoJson,
  CROP_ALERT_LIGHTWEIGHT_TIER,
  simplifyGeometryForCropAlertOverlay,
} from './siCropAlertLightweightOverlay'

function stubResult(
  fieldKey: string,
  lng: number,
  lat: number,
  deltaChas: number | null = -0.2,
): CropAlertFieldResult {
  return {
    fieldKey,
    objectId: fieldKey,
    farmName: fieldKey,
    farmCode: fieldKey,
    structureType: 'pivot',
    centroid: [lng, lat],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + 0.01, lat],
          [lng + 0.01, lat + 0.01],
          [lng, lat + 0.01],
          [lng, lat],
        ],
      ],
    },
    current: { ndvi: 0.4, ndwi: 0.2, ndmi: 0.3, evi: 0.35 },
    previous7: { ndvi: 0.5, ndwi: 0.2, ndmi: 0.3, evi: 0.35 },
    previous30: { ndvi: 0.5, ndwi: 0.2, ndmi: 0.3, evi: 0.35 },
    deltaPct: { ndvi: -5, ndwi: 0, ndmi: 0 },
    trend: 'down',
    seasonalPeakNdvi: 0.6,
    status: 'critical',
    severity: 'critical',
    alertTypes: ['ndvi_drop'],
    title: 'Alert',
    message: 'Test',
    evaluatedAt: '2026-06-01',
    imageDate: '2026-06-01',
    requestedDate: '2026-06-01',
    usedDate: '2026-06-01',
    analysisDate: '2026-06-01',
    dataSource: 'Sentinel-2',
    dataQuality: 'good',
    dataWarning: null,
    dataReason: null,
    liveVerified: true,
    ndviMean3: 0.4,
    ndviSceneDates: ['2026-06-01'],
    ndviSceneValues: [0.4],
    ndmiSceneValues: [0.3],
    ndwiSceneValues: [0.2],
    ndviChangePct2: -5,
    ndviTrendLabel: 'down',
    alertReasonLines: [],
    alertExplanation: null,
    chasCurrent: 0.25,
    chasPrevious: 0.55,
    deltaChas,
  }
}

describe('siCropAlertLightweightOverlay', () => {
  it('simplifyGeometryForCropAlertOverlay decimates ring vertices', () => {
    const ring: number[][] = []
    for (let i = 0; i < 40; i++) ring.push([55 + i * 0.001, 25])
    ring.push(ring[0]!)
    const simplified = simplifyGeometryForCropAlertOverlay({
      type: 'Polygon',
      coordinates: [ring],
    })
    expect(simplified?.type).toBe('Polygon')
    expect(simplified && simplified.type === 'Polygon' ? simplified.coordinates[0].length : 0).toBeLessThanOrEqual(7)
  })

  it('buildCropAlertLightweightOverlayGeoJson keeps minimal point props in viewport', () => {
    const results = [stubResult('a', 55.02, 25.02), stubResult('b', 56.5, 26.5)]
    const viewport: [number, number, number, number] = [55, 25, 55.05, 25.05]
    const fc = buildCropAlertLightweightOverlayGeoJson({
      results,
      viewportBbox: viewport,
      mapZoom: 10,
      pinKeys: new Set(),
    })
    const points = fc.features.filter(f => f.geometry.type === 'Point')
    expect(points.length).toBe(1)
    expect(points[0]?.properties).toEqual({
      fieldKey: 'a',
      tier: CROP_ALERT_LIGHTWEIGHT_TIER.critical,
    })
  })

  it('adds simplified polygons only at sufficient zoom for stress+critical', () => {
    const results = [stubResult('a', 55.02, 25.02, -0.2)]
    const viewport: [number, number, number, number] = [55, 25, 55.05, 25.05]
    const lowZoom = buildCropAlertLightweightOverlayGeoJson({
      results,
      viewportBbox: viewport,
      mapZoom: 8,
      pinKeys: new Set(),
    })
    const highZoom = buildCropAlertLightweightOverlayGeoJson({
      results,
      viewportBbox: viewport,
      mapZoom: 12,
      pinKeys: new Set(),
    })
    expect(lowZoom.features.some(f => f.geometry.type === 'Polygon')).toBe(false)
    expect(highZoom.features.some(f => f.geometry.type === 'Polygon')).toBe(true)
  })
})
