import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteLayerLiveLayerGroups,
  buildDevelopEliteLayerLiveTileUrls,
  DEVELOP_ELITE_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE,
  DEVELOP_ELITE_LAYER_LIVE_PANE,
  developEliteDefaultImageryIsoDate,
  developEliteLayerLiveHasDrawnAoiClip,
  resolveDevelopEliteLayerLiveClipSource,
} from './developEliteMapLayerLiveCore'

describe('developEliteMapLayerLive', () => {
  it('uses an isolated Leaflet pane id', () => {
    expect(DEVELOP_ELITE_LAYER_LIVE_PANE).toBe('develop-elite-layer-live')
  })

  it('defaults cloud cover preference to 10%', () => {
    expect(DEVELOP_ELITE_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE).toBe(10)
  })

  it('default imagery date is YYYY-MM-DD', () => {
    expect(developEliteDefaultImageryIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('filters empty layer groups from catalog', () => {
    const groups = buildDevelopEliteLayerLiveLayerGroups([])
    expect(Array.isArray(groups)).toBe(true)
    expect(groups.every(g => (g.options?.length ?? 0) > 0)).toBe(true)
  })

  it('ignores portfolio fallback when no drawn AOI', () => {
    const portfolio = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [54, 24],
                [56, 24],
                [56, 26],
                [54, 26],
                [54, 24],
              ],
            ],
          },
        },
      ],
    }
    expect(resolveDevelopEliteLayerLiveClipSource(null, portfolio, 'NDVI')).toBeNull()
    expect(developEliteLayerLiveHasDrawnAoiClip(null)).toBe(false)
    expect(resolveDevelopEliteLayerLiveClipSource(portfolio, null, 'NDVI')).toBe(portfolio)
  })

  it('prefers drawn AOI over portfolio fallback when sketch has geometry', () => {
    const drawn = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { radius: 400 },
          geometry: { type: 'Point', coordinates: [55.0, 25.0] },
        },
      ],
    }
    const portfolio = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [54, 24],
                [56, 24],
                [56, 26],
                [54, 26],
                [54, 24],
              ],
            ],
          },
        },
      ],
    }
    expect(resolveDevelopEliteLayerLiveClipSource(drawn, portfolio, 'NDVI')).toBe(drawn)
  })

  it('uses drawn circle AOI for NDVI WMS clip (dataMask + GEOMETRY)', () => {
    const drawn = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { radius: 600 },
          geometry: { type: 'Point', coordinates: [55.1, 25.1] },
        },
      ],
    }
    const resolved = resolveDevelopEliteLayerLiveClipSource(drawn, null, 'NDVI')
    expect(resolved).toBe(drawn)
    const urls = buildDevelopEliteLayerLiveTileUrls({
      layerId: 'NDVI',
      isoDate: developEliteDefaultImageryIsoDate(),
      clipSource: resolved,
    })
    expect(urls.length).toBeGreaterThan(0)
    expect(urls[0]).toMatch(/GEOMETRY|EVALSCRIPT|evalscript/i)
    expect(urls[0]!.length).toBeLessThan(7800)
  })
})
