import { describe, expect, it } from 'vitest'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import {
  buildDevelopEliteStructureFieldKeyByFarmName,
  buildDevelopEliteStructureFieldKeyByJoinCode,
  findDevelopEliteAgriLocationFeatureByJoin,
  findDevelopEliteStructureFieldKey,
  resolveDevelopEliteTableRowMapFlyTarget,
} from './developEliteLayerJoin'
import type { DevelopEliteStructureFeature } from './developEliteKpiEngine'

function poly(props: Record<string, unknown>): DevelopEliteStructureFeature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  }
}

describe('developEliteLayerJoin', () => {
  it('maps Farm_Code to stable structure keys', () => {
    const features = [poly({ Farm_Code: 'AF204', OBJECTID: 1 })]
    const map = buildDevelopEliteStructureFieldKeyByJoinCode(features, 'Farm_Code')
    expect(map.get('AF204')).toBe(computeStableGisFeatureKey(features[0]!, 0))
  })

  it('falls back to Farm_Name when join code missing on structure', () => {
    const features = [poly({ Farm_Name: 'GH-A01', OBJECTID: 2 })]
    const map = buildDevelopEliteStructureFieldKeyByFarmName(features)
    expect(map.get('gh-a01')).toBe(computeStableGisFeatureKey(features[0]!, 0))
  })

  it('finds structure field key from crops table Farm_Code at activation time', () => {
    const features = [poly({ Farm_Code: 'MH102', Farm_Name: 'NH-02', OBJECTID: 3 })]
    expect(findDevelopEliteStructureFieldKey(features, 'Farm_Code', 'mh102', 'NH-02')).toBe(
      computeStableGisFeatureKey(features[0]!, 0),
    )
  })

  it('prefers agri when structure key on row is stale', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Farm_Code: 'MH103', Farm_Name: 'NH-03' },
          geometry: { type: 'Point', coordinates: [55.2, 25.3] },
        },
      ],
    }
    const target = resolveDevelopEliteTableRowMapFlyTarget([], fc, 'Farm_Code', {
      _fieldKey: 'missing-key',
      Farm_Code: 'MH103',
      Farm_Name: 'NH-03',
    })
    expect(target?.kind).toBe('agri')
  })

  it('finds agri location point by Farm_Code for table fly-to fallback', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Farm_Code: 'MH101', Farm_Name: 'NH-01' },
          geometry: { type: 'Point', coordinates: [55.1, 25.2] },
        },
      ],
    }
    const hit = findDevelopEliteAgriLocationFeatureByJoin(fc, 'Farm_Code', 'mh101')
    expect(hit?.properties?.Farm_Code).toBe('MH101')
  })
})
