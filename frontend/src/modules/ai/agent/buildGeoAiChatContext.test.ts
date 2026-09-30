import { describe, expect, it } from 'vitest'
import { buildGeoAiChatContext } from './buildGeoAiChatContext'
import type { GeoAiLiveMapState } from './geoAiLiveMapContext'

const liveState: GeoAiLiveMapState = {
  camera: { longitude: 55.27, latitude: 25.2, zoom: 12 },
  basemapLabel: 'Satellite',
  aoiGeometry: {
    type: 'Polygon',
    coordinates: [[[55.27, 25.2], [55.28, 25.2], [55.28, 25.21], [55.27, 25.21], [55.27, 25.2]]],
  },
  layers: [{ name: 'NDVI', visible: true, kind: 'Raster index' }],
  activeAnalysis: {
    label: 'NDVI',
    acquisitionDate: '2026-05-01',
    resolutionMeters: 10,
    meanValue: 0.62,
  },
}

describe('buildGeoAiChatContext', () => {
  it('maps live map state to server context', () => {
    const ctx = buildGeoAiChatContext({
      liveMapState: liveState,
      aoiLabel: 'Farm 50',
      aoiId: 'aoi-1',
    })

    expect(ctx.selectedAOI?.name).toBe('Farm 50')
    expect(ctx.selectedAOI?.geometry?.type).toBe('Polygon')
    expect(ctx.activeLayer?.name).toBe('NDVI')
    expect(ctx.activeLayer?.sceneDate).toBe('2026-05-01')
    expect(ctx.map.center?.lng).toBeCloseTo(55.27, 2)
    expect(ctx.visibleLayers.length).toBeGreaterThan(0)
  })

  it('returns null AOI when geometry missing', () => {
    const ctx = buildGeoAiChatContext({ liveMapState: { ...liveState, aoiGeometry: null } })
    expect(ctx.selectedAOI).toBeNull()
  })
})
