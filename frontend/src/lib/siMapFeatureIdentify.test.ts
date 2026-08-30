import { describe, expect, it } from 'vitest'
import {
  dedupeOverlapHitsByFeature,
  filterMapLayerIdsThatExist,
  getFeaturePopupTitle,
  nextOverlapPickIndex,
  overlapHitsForPrimarySource,
  rankMapIdentifyHits,
} from './siMapFeatureIdentify'

describe('siMapFeatureIdentify', () => {
  it('rankMapIdentifyHits dedupes sublayers per source and prefers circle over fill', () => {
    const hits = rankMapIdentifyHits([
      { layer: { id: 'farms-fill' }, properties: { id: 1 } },
      { layer: { id: 'fields-fill' }, properties: { id: 2 } },
      { layer: { id: 'farms-circle' }, properties: { id: 1 } },
    ])
    expect(hits.map(h => h.layer?.id)).toEqual(['farms-circle', 'fields-fill'])
  })

  it('filterMapLayerIdsThatExist only returns mounted layer ids', () => {
    const map = {
      getLayer: (id: string) => (id === 'a-fill' ? {} : undefined),
    }
    expect(filterMapLayerIdsThatExist(map, ['a-fill', 'missing-line'])).toEqual(['a-fill'])
  })

  it('nextOverlapPickIndex cycles on repeated clicks at same spot', () => {
    const first = nextOverlapPickIndex(null, 55.1, 25.1, 3)
    expect(first).toBe(0)
    const second = nextOverlapPickIndex({ lng: 55.1, lat: 25.1, count: 3, index: 0 }, 55.1, 25.1, 3)
    expect(second).toBe(1)
    const third = nextOverlapPickIndex({ lng: 55.1, lat: 25.1, count: 3, index: 1 }, 55.1, 25.1, 3)
    expect(third).toBe(2)
  })

  it('dedupeOverlapHitsByFeature keeps one hit per OBJECT_ID', () => {
    const out = dedupeOverlapHitsByFeature([
      { layer: { id: 'f-fill' }, properties: { OBJECT_ID: 'OBJ-1', area: 1 } },
      { layer: { id: 'f-line' }, properties: { OBJECT_ID: 'OBJ-1', area: 1 } },
      { layer: { id: 'f-fill' }, properties: { OBJECT_ID: 'OBJ-2', area: 2 } },
    ])
    expect(out).toHaveLength(2)
  })

  it('overlapHitsForPrimarySource returns same-source overlaps only', () => {
    const all = [
      { layer: { id: 'a-fill' }, properties: { OBJECT_ID: '1' } },
      { layer: { id: 'a-fill' }, properties: { OBJECT_ID: '2' } },
      { layer: { id: 'b-fill' }, properties: { OBJECT_ID: '3' } },
    ]
    const out = overlapHitsForPrimarySource(all, all[0]!)
    expect(out.map(h => h.properties?.OBJECT_ID)).toEqual(['1', '2'])
  })

  it('getFeaturePopupTitle prefers OBJECT_NAME', () => {
    expect(getFeaturePopupTitle({ OBJECT_NAME: 'Field 12', name: 'x' }, 'Layer')).toBe('Field 12')
  })
})
