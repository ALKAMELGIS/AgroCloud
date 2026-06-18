import { describe, expect, it } from 'vitest'
import { extractCropAlertFieldsFromMask } from '../../../lib/siCropAlertEngine'
import {
  ACP_DEFAULT_MAP_CENTER,
  ACP_DEFAULT_MAP_ZOOM,
  ACP_GLOBAL_EXTENT_MAX_DEG,
  ACP_GLOBAL_FITBOUNDS_MAX_ZOOM,
  ACP_FITBOUNDS_MIN_ZOOM,
  buildFieldTableRows,
  portfolioAreaPct,
  resolveAcpMapHomeTarget,
  resolveAcpFieldLocateCenter,
  vegetationDonutFromRows,
  type AcpFieldTableRow,
} from './acpMapSpatial'

describe('resolveAcpMapHomeTarget', () => {
  it('fits full global portfolio when AOI spans continents', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Country: 'UAE' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[55, 24], [55.2, 24], [55.2, 24.2], [55, 24.2], [55, 24]]],
          },
        },
        {
          type: 'Feature',
          properties: { Country: 'Morocco' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[-6, 32], [-5.8, 32], [-5.8, 32.2], [-6, 32.2], [-6, 32]]],
          },
        },
      ],
    }
    const target = resolveAcpMapHomeTarget(fc, 'all')
    expect(target.mode).toBe('bounds')
    if (target.mode === 'bounds') {
      const [[west], [east]] = target.bounds
      expect(east - west).toBeGreaterThan(ACP_GLOBAL_EXTENT_MAX_DEG)
      expect(target.maxZoom).toBe(ACP_GLOBAL_FITBOUNDS_MAX_ZOOM)
      expect(target.minZoom).toBeNull()
    }
  })

  it('fits filtered country when country filter is set', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Country: 'UAE' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[55, 24], [55.4, 24], [55.4, 24.4], [55, 24.4], [55, 24]]],
          },
        },
        {
          type: 'Feature',
          properties: { Country: 'Morocco' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[-6, 32], [-5.6, 32], [-5.6, 32.4], [-6, 32.4], [-6, 32]]],
          },
        },
      ],
    }
    const target = resolveAcpMapHomeTarget(fc, 'UAE')
    expect(target.mode).toBe('bounds')
    if (target.mode === 'bounds') {
      const [[west]] = target.bounds
      expect(west).toBeGreaterThan(54)
      expect(target.minZoom).toBe(ACP_FITBOUNDS_MIN_ZOOM)
    }
  })

  it('uses continental default center when no features', () => {
    const target = resolveAcpMapHomeTarget({ type: 'FeatureCollection', features: [] }, 'all')
    expect(target).toEqual({
      mode: 'center',
      center: ACP_DEFAULT_MAP_CENTER,
      zoom: ACP_DEFAULT_MAP_ZOOM,
    })
  })
})

describe('buildFieldTableRows', () => {
  it('derives area (ha) from polygon geometry when Area_ha attribute is missing', () => {
    const rows = buildFieldTableRows(
      [
        {
          type: 'Feature',
          properties: { OBJECTID: 42, Farm_Name: 'Pivot A', Structure_Type: 1006 },
          geometry: {
            type: 'Polygon',
            coordinates: [[[55.1, 25.1], [55.11, 25.1], [55.11, 25.11], [55.1, 25.11], [55.1, 25.1]]],
          },
        },
      ],
      new Map(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.areaHa).toBeGreaterThan(0)
  })

  it('prefers Area_ha attribute when present', () => {
    const rows = buildFieldTableRows(
      [
        {
          type: 'Feature',
          properties: { OBJECTID: 1, Area_ha: 12.5 },
          geometry: {
            type: 'Polygon',
            coordinates: [[[55.1, 25.1], [55.11, 25.1], [55.11, 25.11], [55.1, 25.11], [55.1, 25.1]]],
          },
        },
      ],
      new Map(),
    )
    expect(rows[0]?.areaHa).toBe(12.5)
  })
})

describe('vegetationDonutFromRows', () => {
  const row = (areaHa: number, ndvi: number | null): AcpFieldTableRow => ({
    fieldKey: `field-${areaHa}-${ndvi}`,
    objectId: '1',
    displayName: 'Field',
    structureType: 'PIVOT',
    countryCode: '1',
    country: 'UAE',
    areaHa,
    chas: null,
    deltaChas: null,
    coveragePct: null,
    alertTier: 'stable',
    alertColor: '#9e9e9e',
    status: '—',
    severity: 'normal',
    imageDate: null,
    result:
      ndvi == null
        ? null
        : ({
            layerLiveZonal: { ndvi: { mean: ndvi, min: ndvi, max: ndvi } },
          } as AcpFieldTableRow['result']),
  })

  it('splits field area into vegetation and bare from NDVI mean', () => {
    const stats = vegetationDonutFromRows([row(100, 0.6)], 100)
    expect(stats.vegetationHa).toBe(60)
    expect(stats.bareHa).toBe(40)
    expect(stats.unanalyzedHa).toBe(0)
    expect(stats.vegetationPct).toBe(60)
    expect(stats.barePct).toBe(40)
    expect(stats.plantedSharePct).toBe(60)
    expect(stats.unplantedSharePct).toBe(40)
    expect(stats.unanalyzedPct).toBe(0)
  })

  it('uses total portfolio area as denominator across all total fields', () => {
    const stats = vegetationDonutFromRows([row(50, 0.8), row(50, null)], 100)
    expect(stats.vegetationHa).toBe(40)
    expect(stats.bareHa).toBe(10)
    expect(stats.unanalyzedHa).toBe(50)
    expect(stats.vegetationPct).toBe(40)
    expect(stats.barePct).toBe(10)
    expect(stats.unanalyzedPct).toBe(50)
    expect(stats.analyzedFieldCount).toBe(1)
    expect(stats.totalFieldCount).toBe(2)
  })

  it('keeps portfolio percentages consistent with hectare splits (one decimal)', () => {
    const stats = vegetationDonutFromRows([row(10863.76, 1), row(10877.16, 0)], 22619)
    expect(stats.vegetationHa).toBe(10863.76)
    expect(stats.bareHa).toBe(10877.16)
    expect(stats.unanalyzedHa).toBe(878.08)
    expect(stats.vegetationPct).toBe(48)
    expect(stats.barePct).toBe(48.1)
    expect(stats.unanalyzedPct).toBe(3.9)
  })

  it('ignores fields without NDVI instead of treating them as bare', () => {
    const stats = vegetationDonutFromRows([row(100, null)], 100)
    expect(stats.vegetationPct).toBe(0)
    expect(stats.barePct).toBe(0)
    expect(stats.unanalyzedPct).toBe(100)
    expect(stats.analyzedFieldCount).toBe(0)
  })

  it('ignores undersized portfolio override when row areas are larger', () => {
    const stats = vegetationDonutFromRows([row(100, 0.6)], 20)
    expect(stats.totalAreaHa).toBe(100)
    expect(stats.vegetationPct).toBe(60)
    expect(stats.plantedSharePct).toBe(60)
  })
})

describe('portfolioAreaPct', () => {
  it('derives one-decimal portfolio percentages from hectares', () => {
    expect(portfolioAreaPct(10863.76, 22619)).toBe(48)
    expect(portfolioAreaPct(10877.16, 22619)).toBe(48.1)
    expect(portfolioAreaPct(878.08, 22619)).toBe(3.9)
  })
})

describe('resolveAcpFieldLocateCenter', () => {
  it('falls back to AOI geometry when CHAS results are missing', () => {
    const mask: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 958, Structure_Type: 1007, Farm_Name: 'PIVOT #958' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[55.0, 24.0], [55.01, 24.0], [55.01, 24.01], [55.0, 24.01], [55.0, 24.0]]],
          },
        },
      ],
    }
    const fields = extractCropAlertFieldsFromMask(mask)
    expect(fields).toHaveLength(1)
    const center = resolveAcpFieldLocateCenter(fields[0]!.fieldKey, {
      aoiMask: mask,
      allResults: [],
      weatherPoints: [],
    })
    expect(center).not.toBeNull()
    expect(center![0]).toBeGreaterThan(55.0)
    expect(center![0]).toBeLessThan(55.01)
    expect(center![1]).toBeGreaterThan(24.0)
    expect(center![1]).toBeLessThan(24.01)
  })
})
