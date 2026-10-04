import { describe, expect, it } from 'vitest'
import { DEFAULT_DEVELOP_ELITE_CONFIG } from './developEliteDashboardConfig'
import {
  buildCountryListItems,
  buildFarmListItems,
  buildZoneListItems,
  compareDevelopEliteListNames,
  computeDevelopEliteKpis,
  computeDevelopEliteZoneLayerTotalAreaHa,
  filterZoneListForCountry,
  computeSideStructureCounts,
  countScopedAgriLocationFeatures,
  countScopedAgriLocationLayer,
  countScopedTreeFeatures,
  filterCropRowsForChartStats,
  filterCropRowsForStructures,
  filterStructureFeatures,
  geometryOverlapsMapView,
  sortDevelopEliteZoneListByMapView,
  normalizeStructureFeatures,
  type DevelopEliteFilters,
} from './developEliteKpiEngine'

const filters: DevelopEliteFilters = {
  country: 'all',
  zoneId: 'all',
  selectedFieldKey: null,
  locationSearch: '',
}

function polyFeature(props: Record<string, unknown>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [55.1, 25.1],
          [55.2, 25.1],
          [55.2, 25.2],
          [55.1, 25.2],
          [55.1, 25.1],
        ],
      ],
    },
  }
}

describe('developEliteKpiEngine', () => {
  it('counts PIVOT and VIP farms from structure features', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        polyFeature({ Structure_Type: 1006, Area_ha: 10, ProjectCode: 'P1' }),
        polyFeature({ Structure_Type: 1007, Area_ha: 5, Farm_Category: 'VIP FARM', ProjectCode: 'P2' }),
        polyFeature({ Structure_Type: 1006, Area_ha: 3, ProjectCode: 'Wildlife-A' }),
      ],
    }
    const features = filterStructureFeatures(normalizeStructureFeatures(fc), filters)
    const kpis = computeDevelopEliteKpis(features, [], DEFAULT_DEVELOP_ELITE_CONFIG)
    expect(kpis.cards.pivot).toBe('2')
    expect(kpis.cards['vip-farm']).toBe('1')
    expect(kpis.cards['wildfelid']).toBe('0')
    expect(kpis.heroTotalAreaHa).toBeGreaterThan(0)
    expect(kpis.heroZoneLayerTotalAreaHa).toBe(0)
  })

  it('sums Zone layer Area_Ha for the zone hero KPI', () => {
    const zoneLayer = {
      type: 'FeatureCollection' as const,
      features: [
        polyFeature({ Area_Ha: 100, ZONE_ID: 'Z1' }),
        polyFeature({ Area_Ha: 50.5, ZONE_ID: 'Z2' }),
      ],
    }
    expect(computeDevelopEliteZoneLayerTotalAreaHa(zoneLayer)).toBe(150.5)
  })

  it('uses country domain labels instead of coded values in lists', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        polyFeature({ Country: 1, Country_Name: 'Morocco', Structure_Type: 1000, Farm_Name: 'Farm A' }),
        polyFeature({ Country: 2, Country_Name: 'UAE', Structure_Type: 1001, Farm_Name: 'Farm B' }),
      ],
    }
    const features = normalizeStructureFeatures(fc)
    const labels = new Map([['1', 'Morocco'], ['2', 'United Arab Emirates']])
    const countries = buildCountryListItems(features, { countryLabels: labels })
    expect(countries.map(c => c.label)).toEqual(['Morocco', 'United Arab Emirates'])
    const farms = buildFarmListItems(features, { countryLabels: labels })
    expect(farms.map(item => item.title).sort()).toEqual(['Farm A', 'Farm B'])
  })

  it('shows Agro Structures name and Zone_ID together', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [polyFeature({ Farm_Name: 'NH 01', ZONE_ID: 'MH', Country: 1, Structure_Type: 1001 })],
    })
    const farms = buildFarmListItems(features)
    expect(farms[0]?.title).toBe('NH 01')
    expect(farms[0]?.subtitle).toBe('MH')
  })

  it('filters structures by country name through the country domain', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [
        polyFeature({ Farm_Name: 'NH 01', ZONE_ID: 'MH', Country: 1, Structure_Type: 1001 }),
        polyFeature({ Farm_Name: 'KE Plot', ZONE_ID: 'KE', Country: 3, Structure_Type: 1007 }),
      ],
    })
    const labels = new Map([
      ['1', 'UAE'],
      ['3', 'Morocco'],
    ])
    const scoped = filterStructureFeatures(
      features,
      { country: 'UAE', zoneId: 'all', selectedFieldKey: null, locationSearch: '' },
      { countryLabels: labels },
    )
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.properties?.Farm_Name).toBe('NH 01')
  })

  it('computes side structure type counts', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        polyFeature({ Structure_Type: 1000 }),
        polyFeature({ Structure_Type: 1001 }),
        polyFeature({ Structure_Type: 1002 }),
      ],
    }
    const features = normalizeStructureFeatures(fc)
    const side = computeSideStructureCounts(features)
    expect(side.greenhouse).toBe(1)
    expect(side.nethouse).toBe(1)
    expect(side.glasshouse).toBe(1)
  })

  it('scopes side structure counts by country and zone', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        polyFeature({ Country: 2, ZONE_ID: 'A', Structure_Type: 1000 }),
        polyFeature({ Country: 2, ZONE_ID: 'A', Structure_Type: 1001 }),
        polyFeature({ Country: 1, ZONE_ID: 'B', Structure_Type: 1002 }),
        polyFeature({ Country: 2, Zone_ID: 'C', Structure_Type: 1000 }),
      ],
    }
    const features = normalizeStructureFeatures(fc)
    const labels = new Map([['2', 'UAE']])
    const uae = filterStructureFeatures(
      features,
      { country: '2', zoneId: 'all', selectedFieldKey: null, locationSearch: '' },
      { countryLabels: labels },
    )
    expect(computeSideStructureCounts(uae)).toEqual({ greenhouse: 2, nethouse: 1, glasshouse: 0 })
    const zoneA = filterStructureFeatures(
      features,
      { country: 'all', zoneId: 'A', selectedFieldKey: null, locationSearch: '' },
      { activeZoneLabel: 'Zone A' },
    )
    expect(computeSideStructureCounts(zoneA).greenhouse).toBe(1)
    const zoneC = filterStructureFeatures(
      features,
      { country: 'all', zoneId: 'C', selectedFieldKey: null, locationSearch: '' },
      {},
    )
    expect(computeSideStructureCounts(zoneC).greenhouse).toBe(1)
  })

  it('uses full crop table for chart stats when country and zone are all', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [polyFeature({ Farm_Code: 'MH101', ZONE_ID: 'MH', Structure_Type: 1007, Area_ha: 1 })],
    })
    const crops = [
      { Farm_Code: 'MH101', Crop_Type: '100', Total_Tree: 50, ZONE_ID: 'MH' },
      { Farm_Code: 'MH999', Crop_Type: '200', Total_Tree: 200, ZONE_ID: 'MH' },
    ]
    const tableScope = filterCropRowsForStructures(crops, features, filters)
    expect(tableScope).toHaveLength(1)
    const chartScope = filterCropRowsForChartStats(crops, features, filters)
    expect(chartScope).toHaveLength(2)
  })

  it('joins crops to structures by Farm_Code case-insensitively', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [polyFeature({ Farm_Code: 'mh101', Structure_Type: 1007, Area_ha: 1 })],
    })
    const crops = [
      { farm_code: 'MH101', Crop_Type: 'A', Total_Tree: 10 },
      { farm_code: 'MH999', Crop_Type: 'B', Total_Tree: 99 },
    ]
    const scoped = filterCropRowsForStructures(crops, features, {
      country: 'all',
      zoneId: 'all',
      selectedFieldKey: null,
      locationSearch: '',
    })
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.Total_Tree).toBe(10)
  })

  it('counts Wildlife Project features from AgriLocation for Wildfelid KPI', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [polyFeature({ Farm_Code: 'F1', ZONE_ID: 'MH', Structure_Type: 1007, Area_ha: 1 })],
    })
    const scoped = filterStructureFeatures(features, filters)
    const agri: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: { Name: 'Site A', Subtype: 2, ZONE_ID: 'MH' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
      {
        type: 'Feature',
        properties: { Name: 'Site B', Subtype: 3, ZONE_ID: 'MH' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
      {
        type: 'Feature',
        properties: { Name: 'Other', Subtype: 1, ZONE_ID: 'UG' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]
    const drawingInfo = {
      renderer: {
        type: 'uniqueValue',
        field1: 'Subtype',
        uniqueValueInfos: [
          { value: 2, label: 'Wildlife Project', symbol: { type: 'esriSMS', color: [0, 0, 0, 255], size: 8 } },
          { value: 1, label: 'VIP Farm', symbol: { type: 'esriSMS', color: [0, 0, 0, 255], size: 8 } },
        ],
      },
    }
    const n = countScopedAgriLocationFeatures(
      agri,
      scoped,
      filters,
      'Subtype',
      'Wildlife Project',
      'equals',
      drawingInfo,
    )
    expect(n).toBe(1)
    const kpis = computeDevelopEliteKpis(scoped, [], DEFAULT_DEVELOP_ELITE_CONFIG, 0, agri, drawingInfo, filters)
    expect(kpis.cards['wildfelid']).toBe('1')
    expect(countScopedAgriLocationLayer(agri, scoped, filters)).toBe(3)
    expect(kpis.cards['total-projects']).toBe('3')
  })

  it('keeps AgroLocation KPIs when farm search filters structures to none', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [
        polyFeature({ Farm_Code: 'F1', ZONE_ID: 'MH', Structure_Type: 1007, Area_ha: 1 }),
        polyFeature({ Farm_Code: 'F2', ZONE_ID: 'UG', Structure_Type: 1007, Area_ha: 1 }),
      ],
    })
    const agri: GeoJSON.Feature[] = [
      { type: 'Feature', properties: { Subtype: 1003, ZONEID: 'MH' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { Subtype: 1001, ZONEID: 'UG' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]
    const narrowed = filterStructureFeatures(features, {
      ...filters,
      locationSearch: 'no-such-farm-xyz',
    })
    expect(narrowed).toHaveLength(0)
    const agriScope = filterStructureFeatures(features, {
      country: 'all',
      zoneId: 'all',
      selectedFieldKey: null,
      locationSearch: '',
    })
    const kpis = computeDevelopEliteKpis(
      narrowed,
      [],
      DEFAULT_DEVELOP_ELITE_CONFIG,
      0,
      agri,
      null,
      { ...filters, locationSearch: 'no-such-farm-xyz' },
      agriScope,
      { country: 'all', zoneId: 'all', selectedFieldKey: null, locationSearch: '' },
    )
    expect(kpis.cards['wildfelid']).toBe('1')
    expect(kpis.cards['total-projects']).toBe('2')
  })

  it('matches Wildlife Project by Subtype 1003 without drawingInfo', () => {
    const agri: GeoJSON.Feature[] = [
      { type: 'Feature', properties: { Subtype: 1003, ZONEID: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]
    const n = countScopedAgriLocationFeatures(
      agri,
      [],
      filters,
      'Subtype',
      'Wildlife Project',
      'equals',
      null,
    )
    expect(n).toBe(1)
  })

  it('counts tree layer points for Tree KPI', () => {
    const features = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [polyFeature({ Farm_Code: 'F1', ZONE_ID: 'MH', Structure_Type: 1007, Area_ha: 1 })],
    })
    const trees: GeoJSON.Feature[] = [
      { type: 'Feature', properties: { ZONEID: 'MH' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { ZONEID: 'MH' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { ZONEID: 'UG' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]
    const scoped = countScopedTreeFeatures(trees, features, filters)
    expect(scoped).toBe(3)
    const kpis = computeDevelopEliteKpis(features, [], DEFAULT_DEVELOP_ELITE_CONFIG, scoped)
    expect(kpis.cards.tree).toBe('3')
  })
})

describe('compareDevelopEliteListNames', () => {
  it('sorts alphanumeric farm codes naturally', () => {
    const sorted = ['FA-40', 'FA-16-A', '2B-B', '301', '3-A', 'A4'].sort(compareDevelopEliteListNames)
    expect(sorted).toEqual(['2B-B', '3-A', '301', 'A4', 'FA-16-A', 'FA-40'])
  })
})

describe('filterZoneListForCountry', () => {
  it('limits zones to those used by structures in the selected country', () => {
    const zones = buildZoneListItems(
      normalizeStructureFeatures({
        type: 'FeatureCollection',
        features: [
          polyFeature({ Name: 'UAE Zone', ZONE_ID: 'UZ', Country: 2, Structure_Type: 1000 }),
          polyFeature({ Name: 'Morocco Zone', ZONE_ID: 'MZ', Country: 1, Structure_Type: 1000 }),
        ],
      }),
    )
    const structures = normalizeStructureFeatures({
      type: 'FeatureCollection',
      features: [
        polyFeature({ Name: 'UAE Zone', ZONE_ID: 'UZ', Country: 2, Structure_Type: 1000 }),
        polyFeature({ Name: 'Morocco Zone', ZONE_ID: 'MZ', Country: 1, Structure_Type: 1000 }),
      ],
    })
    const uaeOnly = filterZoneListForCountry(zones, structures, '2')
    expect(uaeOnly.map(z => z.zoneId)).toEqual(['UZ'])
  })
})

describe('buildZoneListItems', () => {
  it('lists ArcGIS Name values (not structure type shorthand)', () => {
    const items = buildZoneListItems(
      normalizeStructureFeatures({
        type: 'FeatureCollection',
        features: [
          polyFeature({ Name: 'MH DB - Nethouse', ZONE_ID: 'MH', Structure_Type: 1001 }),
          polyFeature({ Name: 'UG DB - Greenhouse', ZONE_ID: 'UG', Structure_Type: 1000 }),
          polyFeature({ Name: 'UG DB - Greenhouse', ZONE_ID: 'UG', Structure_Type: 1000 }),
        ],
      }),
    )
    expect(items).toHaveLength(2)
    expect(items.map(i => i.label).sort()).toEqual(['MH DB - Nethouse', 'UG DB - Greenhouse'])
    expect(items.find(i => i.zoneId === 'MH')?.label).toBe('MH DB - Nethouse')
    expect(items.find(i => i.zoneId === 'UG')?.count).toBe(2)
  })

  it('lists a zone Name even when ZONE_ID is empty', () => {
    const items = buildZoneListItems(
      normalizeStructureFeatures({
        type: 'FeatureCollection',
        features: [
          polyFeature({ Name: 'Liwa' }),
          polyFeature({ Name: 'Al Foah', ZONE_ID: 'AF' }),
        ],
      }),
    )
    expect(items.map(i => i.label).sort()).toEqual(['Al Foah', 'Liwa'])
    expect(items.find(i => i.label === 'Al Foah')?.zoneId).toBe('AF')
    expect(items.find(i => i.label === 'Liwa')?.zoneId).toBe('Liwa')
  })
})

describe('sortDevelopEliteZoneListByMapView', () => {
  const view = { zoom: 7, west: 49, south: 22, east: 59, north: 27 }

  it('puts zones overlapping the map view first without removing others', () => {
    const zones = [
      { zoneId: 'far', label: 'Far Zone', count: 1 },
      { zoneId: 'near', label: 'Near Zone', count: 1 },
    ]
    const features = [
      polyFeature({ ZONE_ID: 'near', Name: 'Near Zone' }),
      {
        type: 'Feature' as const,
        properties: { ZONE_ID: 'far', Name: 'Far Zone' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [10, 10],
              [10.1, 10],
              [10.1, 10.1],
              [10, 10],
            ],
          ],
        },
      },
    ]
    const sorted = sortDevelopEliteZoneListByMapView(zones, view, features, (a, b) =>
      a.label.localeCompare(b.label),
    )
    expect(sorted.map(z => z.zoneId)).toEqual(['near', 'far'])
  })
})

describe('geometryOverlapsMapView', () => {
  const view = { zoom: 7, west: 49, south: 22, east: 59, north: 27 }

  it('matches a single-ring polygon inside the map view', () => {
    expect(geometryOverlapsMapView(polyFeature({}).geometry, view)).toBe(true)
  })

  it('rejects a single-ring polygon outside the map view', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [10.1, 10],
          [10.1, 10.1],
          [10, 10],
        ],
      ],
    }
    expect(geometryOverlapsMapView(geometry, view)).toBe(false)
  })
})
