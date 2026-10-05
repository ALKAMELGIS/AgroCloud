import { describe, expect, it, vi, afterEach } from 'vitest'
import { getWeatherMapLayer } from '../config/weatherLayerCatalog'
import { buildViewportGrid, fetchOpenMeteoFieldGrid } from './weatherFieldGrid'

describe('buildViewportGrid', () => {
  it('stays within 120 points and respects aspect ratio', () => {
    const pts = buildViewportGrid({ west: 50, south: 20, east: 60, north: 30 }, 12)
    expect(pts.length).toBeGreaterThanOrEqual(16)
    expect(pts.length).toBeLessThanOrEqual(120)
  })
})

describe('fetchOpenMeteoFieldGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses multi-location array responses from Open-Meteo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            latitude: 25,
            longitude: 55,
            hourly: {
              time: ['2026-10-05T12:00'],
              temperature_2m: [31.2],
            },
          },
          {
            latitude: 25.5,
            longitude: 55.5,
            hourly: {
              time: ['2026-10-05T12:00'],
              temperature_2m: [29.8],
            },
          },
        ],
      }),
    )

    const layer = getWeatherMapLayer('temperature')
    const rows = await fetchOpenMeteoFieldGrid(
      [{ lat: 25, lng: 55 }, { lat: 25.5, lng: 55.5 }],
      layer,
      '2026-10-05T12:00',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].value).toBe(31.2)
    expect(rows[1].value).toBe(29.8)
  })
})
