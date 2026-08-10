import { describe, expect, it } from 'vitest'
import {
  normalizeGeoAiToolboxPanelId,
  parseGeoAiMapCommands,
  parseGeoAiRsIndexId,
} from './geoAiCommandExecutor'

describe('normalizeGeoAiToolboxPanelId', () => {
  it('maps aliases to dock / float panels', () => {
    expect(normalizeGeoAiToolboxPanelId('NDVI')).toBe('remote-sensing')
    expect(normalizeGeoAiToolboxPanelId('time series')).toBe('imagery-time-series')
    expect(normalizeGeoAiToolboxPanelId('map swipe')).toBe('map-swipe')
    expect(normalizeGeoAiToolboxPanelId('compare')).toBe('map-swipe')
    expect(normalizeGeoAiToolboxPanelId('flood')).toBe('flood-monitoring')
    expect(normalizeGeoAiToolboxPanelId('well')).toBe('well-site')
    expect(normalizeGeoAiToolboxPanelId('draw')).toBe('aoi-edit')
  })
})

describe('parseGeoAiRsIndexId', () => {
  it('extracts index ids from free text', () => {
    expect(parseGeoAiRsIndexId('ndvi')).toBe('NDVI')
    expect(parseGeoAiRsIndexId('Show NDWI on map')).toBe('NDWI')
    expect(parseGeoAiRsIndexId('remote-sensing')).toBeNull()
  })
})

describe('parseGeoAiMapCommands openToolboxPanel / runRsIndex', () => {
  it('coerces NDVI panel alias to runRsIndex (show on map)', () => {
    const cmds = parseGeoAiMapCommands(
      'Opening remote sensing.\nMAP_ACTION:{"op":"openToolboxPanel","panel":"ndvi"}\n',
    )
    expect(cmds).toEqual([{ op: 'runRsIndex', index: 'NDVI' }])
  })

  it('keeps plain remote-sensing as openToolboxPanel', () => {
    const cmds = parseGeoAiMapCommands(
      'MAP_ACTION:{"op":"openToolboxPanel","panel":"remote-sensing"}',
    )
    expect(cmds).toEqual([{ op: 'openToolboxPanel', panel: 'remote-sensing' }])
  })

  it('parses runRsIndex and showNdvi aliases', () => {
    expect(parseGeoAiMapCommands('MAP_ACTION:{"op":"runRsIndex","index":"NDWI"}')).toEqual([
      { op: 'runRsIndex', index: 'NDWI' },
    ])
    expect(parseGeoAiMapCommands('MAP_ACTION:{"op":"showNdvi"}')).toEqual([
      { op: 'runRsIndex', index: 'NDVI' },
    ])
  })
})

describe('parseGeoAiMapCommands gis ops', () => {
  it('parses gisBuffer and gisOp MAP_ACTION lines', () => {
    const cmds = parseGeoAiMapCommands(
      [
        'MAP_ACTION:{"op":"gisBuffer","layer":"Farms","distance":500,"unit":"meters"}',
        'MAP_ACTION:{"op":"gisOp","tool":"dissolve","layer":"Fields","field":"Crop"}',
      ].join('\n'),
    )
    expect(cmds[0]).toMatchObject({
      op: 'gisOp',
      tool: 'buffer',
      args: expect.objectContaining({ layer: 'Farms', distance: 500 }),
    })
    expect(cmds[1]).toMatchObject({
      op: 'gisOp',
      tool: 'dissolve',
      args: expect.objectContaining({ layer: 'Fields', field: 'Crop' }),
    })
  })
})
