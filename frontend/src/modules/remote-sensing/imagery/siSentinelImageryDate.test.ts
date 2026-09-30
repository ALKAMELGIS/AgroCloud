import { describe, expect, it } from 'vitest'
import {
  computeAutoSentinelImageryIso,
  dateFromLocalIso,
  getDefaultSentinelImageryDate,
  getDefaultSentinelTimeSeriesRange,
  localIsoDate,
  resolveAutoLiveScenePair,
  resolveSentinelFetchDate,
  subtractDaysFromIso,
} from './siSentinelImageryDate'
import {
  parseSentinelSceneCatalogFromStacFeatures,
  buildStacSearchBodyForAoi,
} from './siSentinelLatestScene'

describe('siSentinelImageryDate', () => {
  it('localIsoDate uses local calendar day', () => {
    const d = new Date(2026, 5, 8, 23, 30, 0)
    expect(localIsoDate(d)).toBe('2026-06-08')
  })

  it('computeAutoSentinelImageryIso uses catalog latest when provided', () => {
    const now = new Date(2026, 5, 8, 12, 0, 0)
    expect(computeAutoSentinelImageryIso('2026-06-06', now)).toBe('2026-06-06')
    expect(computeAutoSentinelImageryIso(null, now)).toBe('2026-06-08')
  })

  it('resolveSentinelFetchDate in auto mode returns latest valid scene', () => {
    const available = ['2026-06-06', '2026-05-30', '2026-05-20']
    expect(resolveSentinelFetchDate('', available, { autoMode: true })).toBe('2026-06-06')
  })

  it('resolveSentinelFetchDate in manual mode falls back to nearest available scene', () => {
    const available = ['2026-06-05', '2026-06-03', '2026-06-01']
    expect(resolveSentinelFetchDate('2026-06-06', available)).toBe('2026-06-05')
    expect(resolveSentinelFetchDate('2026-06-05', available)).toBe('2026-06-05')
    expect(resolveSentinelFetchDate('2026-05-30', available)).toBe('2026-06-01')
  })

  it('resolveAutoLiveScenePair exported from sentinel imagery date module', () => {
    const pair = resolveAutoLiveScenePair(['2026-06-06', '2026-05-30'], new Date(2026, 5, 8))
    expect(pair.currentSceneDate).toBe('2026-06-06')
    expect(pair.previousSceneDate).toBe('2026-05-30')
  })

  it('getDefaultSentinelTimeSeriesRange ends at auto target', () => {
    const now = new Date(2026, 5, 8, 9, 0, 0)
    const range = getDefaultSentinelTimeSeriesRange(now, '2026-06-06')
    expect(range.end).toBe('2026-06-06')
    expect(range.start).toBe('2026-03-08')
  })

  it('getDefaultSentinelImageryDate matches auto target', () => {
    const now = new Date(2026, 5, 8, 15, 0, 0)
    expect(localIsoDate(getDefaultSentinelImageryDate(now))).toBe('2026-06-08')
  })

  it('subtractDaysFromIso', () => {
    expect(subtractDaysFromIso('2026-06-08', 1)).toBe('2026-06-07')
  })
})

describe('siSentinelLatestScene', () => {
  it('parseSentinelSceneCatalogFromStacFeatures dedupes and sorts', () => {
    const catalog = parseSentinelSceneCatalogFromStacFeatures([
      { properties: { datetime: '2026-06-08T10:11:00Z' } },
      { properties: { datetime: '2026-06-08T08:00:00Z' } },
      { properties: { datetime: '2026-06-05T08:00:00Z' } },
    ])
    expect(catalog.latestSceneIso).toBe('2026-06-08')
    expect(catalog.sceneIsos).toEqual(['2026-06-08', '2026-06-05'])
  })

  it('buildStacSearchBodyForAoi includes intersects for polygon AOI', () => {
    const body = buildStacSearchBodyForAoi({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [55.0, 25.0],
                [55.1, 25.0],
                [55.1, 25.1],
                [55.0, 25.1],
                [55.0, 25.0],
              ],
            ],
          },
        },
      ],
    })
    expect(body?.collections).toEqual(['sentinel-2-l2a'])
    expect(body?.intersects).toBeTruthy()
  })
})
