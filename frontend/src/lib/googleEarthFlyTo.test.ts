import { describe, expect, it, vi } from 'vitest'
import {
  buildGoogleEarthFlyToOptions,
  flyToLikeGoogleEarth,
  googleEarthArrivalPitch,
  googleEarthCruiseMinZoom,
  googleEarthFlyCurve,
  googleEarthFlyEasing,
  googleEarthFlySpeed,
  haversineKm,
  zoomFromLngLatBbox,
} from './googleEarthFlyTo'

describe('googleEarthFlyTo', () => {
  it('lifts farther flights to space (low minZoom) and slows them', () => {
    expect(googleEarthCruiseMinZoom(30)).toBeGreaterThan(googleEarthCruiseMinZoom(4000))
    expect(googleEarthFlySpeed(4000)).toBeLessThan(googleEarthFlySpeed(20))
    expect(googleEarthFlyCurve(4000)).toBeGreaterThan(googleEarthFlyCurve(20))
  })

  it('tilts into landmarks but keeps country-scale views nadir', () => {
    expect(googleEarthArrivalPitch(5, true, 0)).toBe(0)
    expect(googleEarthArrivalPitch(11, true, 0)).toBe(52)
    expect(googleEarthArrivalPitch(17, false, 12)).toBe(12)
  })

  it('frames a wide bbox at a lower zoom than a city bbox', () => {
    expect(zoomFromLngLatBbox([-20, 10, 40, 40])).toBeLessThan(zoomFromLngLatBbox([55.2, 25.1, 55.4, 25.3]))
  })

  it('eases slowly at the start and end of the flight', () => {
    expect(googleEarthFlyEasing(0)).toBe(0)
    expect(googleEarthFlyEasing(1)).toBe(1)
    expect(googleEarthFlyEasing(0.25)).toBeLessThan(0.25)
    expect(googleEarthFlyEasing(0.75)).toBeGreaterThan(0.75)
  })

  it('builds a Mapbox flyTo without a short duration so curve/speed can run', () => {
    const map = {
      getCenter: () => ({ lng: 46.7, lat: 24.7 }),
      getZoom: () => 16,
      getPitch: () => 0,
      getBearing: () => 0,
    }
    const opts = buildGoogleEarthFlyToOptions(map, {
      lng: 55.27,
      lat: 25.2,
      zoom: 12,
      preferTilt: true,
    })
    expect(opts).not.toHaveProperty('duration')
    expect(opts.center).toEqual([55.27, 25.2])
    expect(opts.minZoom).toBeLessThan(8)
    expect(opts.curve).toBeGreaterThan(1.4)
    expect(opts.pitch).toBe(52)
    expect(opts.essential).toBe(true)
    expect(haversineKm([46.7, 24.7], [55.27, 25.2])).toBeGreaterThan(700)
  })

  it('calls stop then flyTo on the map', () => {
    const flyTo = vi.fn()
    const stop = vi.fn()
    const ok = flyToLikeGoogleEarth(
      {
        getCenter: () => ({ lng: 0, lat: 0 }),
        getZoom: () => 1.2,
        stop,
        flyTo,
      },
      { lng: 31.23, lat: 30.04, zoom: 12, preferTilt: true },
    )
    expect(ok).toBe(true)
    expect(stop).toHaveBeenCalledOnce()
    expect(flyTo).toHaveBeenCalledOnce()
    expect(flyTo.mock.calls[0][0].center).toEqual([31.23, 30.04])
  })
})
