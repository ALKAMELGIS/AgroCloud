import { describe, expect, it, vi } from 'vitest'

const buildModel = vi.fn()
vi.mock('../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel', () => ({
  buildAgriculturalObjectIntelligenceModel: (...args: unknown[]) => buildModel(...args),
}))

import {
  FIELD_ATTRIBUTE_COLUMNS,
  FIELD_ATTRIBUTE_LAYER_IDS,
  FIELD_ATTRIBUTES_STAMP,
  defaultAttributeWindow,
  enrichFieldAttributesFromSentinel2,
  fieldAttributesNeedRefresh,
  hasFieldAttributes,
} from './fieldAttributeEnrichment'

function square(id: number, offset: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { field_id: id, area_ha: 1.5 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [offset, 0],
          [offset + 0.01, 0],
          [offset + 0.01, 0.01],
          [offset, 0.01],
          [offset, 0],
        ],
      ],
    },
  }
}

/** The report deliverable, column for column (Excel row 5). */
const REPORT_COLUMNS = [
  'Object ID',
  'Object Type',
  'Object Name / Label',
  'Boundary / Polygon Coordinates',
  'Centroid Latitude',
  'Centroid Longitude',
  'Estimated Area (ha)',
  'Agricultural / Non-Agricultural',
  'Active / Inactive Status',
  'Land-Cover Type',
  'Vegetation Coverage (%)',
  'Crop Type',
  'Crop Confidence (%)',
  'Crop Growth Stage',
  'Crop Health',
  'NDVI',
  'NDRE',
  'NDMI',
  'Water Stress',
  'Soil Moisture Proxy',
  'Actual ET (ETa)',
  'Crop Water Requirement (ETc)',
  'Irrigation Performance',
  'Estimated Water Use',
  'Water Productivity',
  'Soil-Salinity Indicator',
  'Land-Degradation Indicator',
  'Land / Crop Suitability',
  'Estimated Yield',
  'Estimated Total Production',
  'Yield / Production Confidence',
  'Change from Previous Period',
  'Newly Cultivated / Abandoned',
  'Anomaly Detected',
  'Priority for Field Inspection',
  'Recommended Action / Insight',
  'Time-Series Data Available',
  'AI / Analytical Method Used (see Note)',
  'Capability Status',
  'Expected Accuracy',
  'Data Coverage',
  'Additional Observations / Recommendations',
]

describe('fieldAttributeEnrichment', () => {
  it('matches the report columns exactly, in report order', () => {
    expect(FIELD_ATTRIBUTE_COLUMNS.map(c => c.prop)).toEqual(REPORT_COLUMNS)
  })

  it('keeps DBF column names shapefile-legal and unique', () => {
    const names = FIELD_ATTRIBUTE_COLUMNS.map(c => c.dbf)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(10)
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  it('stamps report rows onto matching features and coerces numeric cells', async () => {
    buildModel.mockResolvedValueOnce({
      objects: [
        {
          fieldKey: 'afb-1',
          ndvi: '0.49',
          ndre: '0.33',
          ndmi: '0.21',
          treeVegetationCoveragePct: '57.5',
          cropType: 'Dense herbaceous cropland',
          timeSeriesDataAvailable: 'Yes (15 Sentinel-2 scenes, 2026-05-13 to 2026-08-11)',
        },
        { fieldKey: 'afb-2', ndvi: 0.52, cropType: 'Herbaceous cropland' },
      ],
    })

    const enriched = await enrichFieldAttributesFromSentinel2(
      { type: 'FeatureCollection', features: [square(1, 55.9), square(2, 55.92)] },
      { fromDate: '2026-05-13', toDate: '2026-08-11' },
    )

    expect(buildModel).toHaveBeenCalledWith(
      expect.objectContaining({
        layerIds: [...FIELD_ATTRIBUTE_LAYER_IDS],
        fromDate: '2026-05-13',
        toDate: '2026-08-11',
      }),
    )

    const first = enriched.features[0]!.properties as Record<string, unknown>
    expect(first.NDVI).toBe(0.49)
    expect(first.NDRE).toBe(0.33)
    expect(first.NDMI).toBe(0.21)
    expect(first['Vegetation Coverage (%)']).toBe(57.5)
    expect(first['Crop Type']).toBe('Dense herbaceous cropland')
    expect(first['Data Coverage']).toBe('Standard multi-scene coverage')
    expect(first['Water Stress']).toBe('Not Available')
    expect(Object.keys(first).slice(0, REPORT_COLUMNS.length)).toEqual(REPORT_COLUMNS)
    expect(first.area_ha).toBe(1.5)
    expect(first[FIELD_ATTRIBUTES_STAMP]).toContain('Sentinel-2')
    expect(first.attributes_period).toBe('2026-05-13 → 2026-08-11')
    expect(fieldAttributesNeedRefresh(enriched)).toBe(false)

    const second = enriched.features[1]!.properties as Record<string, unknown>
    expect(second.NDVI).toBe(0.52)
    expect(second['Data Coverage']).toBe('Sparse / single-date coverage')
    expect(hasFieldAttributes(enriched)).toBe(true)
  })

  it('keeps Not Available for numeric cells instead of coercing to 0', async () => {
    buildModel.mockResolvedValueOnce({
      objects: [
        {
          fieldKey: 'afb-1',
          ndvi: 'Not Available',
          ndre: 'Not Available',
          ndmi: 'Not Available',
          treeVegetationCoveragePct: 'Not Available',
          timeSeriesDataAvailable: 'No',
        },
      ],
    })

    const enriched = await enrichFieldAttributesFromSentinel2(
      { type: 'FeatureCollection', features: [square(1, 55.9)] },
      { fromDate: '2026-08-11', toDate: '2026-08-11' },
    )

    const props = enriched.features[0]!.properties as Record<string, unknown>
    expect(props.NDVI).toBe('Not Available')
    expect(props.NDRE).toBe('Not Available')
    expect(props.NDMI).toBe('Not Available')
    expect(props['Vegetation Coverage (%)']).toBe('Not Available')
    expect(props['Time-Series Data Available']).toBe('No')
    expect(fieldAttributesNeedRefresh(enriched)).toBe(true)
  })

  it('leaves the collection untouched when there is nothing to enrich', async () => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    await expect(
      enrichFieldAttributesFromSentinel2(empty, { fromDate: '2026-01-01', toDate: '2026-02-01' }),
    ).resolves.toBe(empty)
    expect(hasFieldAttributes(empty)).toBe(false)
  })

  it('defaults to the 90 days before the scene date', () => {
    expect(defaultAttributeWindow('2026-08-11')).toEqual({
      fromDate: '2026-05-13',
      toDate: '2026-08-11',
    })
  })

  it('exposes the full multi-index Layer index set', () => {
    expect(FIELD_ATTRIBUTE_LAYER_IDS).toEqual(
      expect.arrayContaining(['NDVI', 'NDRE', 'NDMI', 'EVI', 'SAVI', 'NDWI', 'NBR']),
    )
  })
})
