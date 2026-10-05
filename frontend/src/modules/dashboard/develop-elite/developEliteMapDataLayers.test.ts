import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER,
  moveMapDataLayerInOrder,
  normalizeDevelopEliteMapDataLayerOrder,
  orderDevelopEliteMapDataLayerDefs,
} from './developEliteMapDataLayers'

describe('developEliteMapDataLayers', () => {
  it('defaults with Tree on top, irrigation valves, then Agri_Location', () => {
    expect(DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER[0]).toBe('trees')
    expect(DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER[1]).toBe('irrigation-valves')
    expect(DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER[2]).toBe('agri-location')
  })

  it('reorders layers by drag target', () => {
    const order = ['trees', 'agro-structures', 'world-countries']
    expect(moveMapDataLayerInOrder(order, 'world-countries', 'trees')).toEqual([
      'world-countries',
      'trees',
      'irrigation-valves',
      'agri-location',
      'irrigation-main-pipe',
      'agro-structures',
    ])
  })

  it('fills missing ids when normalizing order', () => {
    expect(normalizeDevelopEliteMapDataLayerOrder(['trees'])).toEqual([
      'trees',
      'irrigation-valves',
      'agri-location',
      'irrigation-main-pipe',
      'agro-structures',
      'world-countries',
    ])
  })

  it('maps order to layer defs', () => {
    const defs = orderDevelopEliteMapDataLayerDefs(['trees', 'agro-structures', 'world-countries'])
    expect(defs.map(d => d.id)).toEqual(['trees', 'agro-structures', 'world-countries'])
  })
})
