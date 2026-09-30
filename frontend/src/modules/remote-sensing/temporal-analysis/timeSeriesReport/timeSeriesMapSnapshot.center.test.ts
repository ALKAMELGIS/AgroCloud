import { describe, expect, it } from 'vitest'
import {
  fitLngLatBboxToMapAspect,
  resolveTimeSeriesSnapshotExtent,
} from './timeSeriesMapSnapshot'

function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const y = Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180)
  return (y * 20037508.34) / 180
}

function mercatorX(lng: number): number {
  return (lng * 20037508.34) / 180
}

describe('resolveTimeSeriesSnapshotExtent centering', () => {
  it('keeps AOI Mercator bbox center at the map frame center', () => {
    // Mid-latitude AOI (UAE-like) — degree padding previously skewed Mercator center.
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [54.2, 24.3],
          [54.35, 24.3],
          [54.35, 24.42],
          [54.2, 24.42],
          [54.2, 24.3],
        ],
      ],
    }

    const mapW = 624
    const mapH = 400
    const extent = resolveTimeSeriesSnapshotExtent(geometry, mapW, mapH, 0.14)
    expect(extent).toBeTruthy()

    const aoiCx = (mercatorX(54.2) + mercatorX(54.35)) / 2
    const aoiCy = (mercatorY(24.3) + mercatorY(24.42)) / 2
    const frameCx = (mercatorX(extent!.minLng) + mercatorX(extent!.maxLng)) / 2
    const frameCy = (mercatorY(extent!.minLat) + mercatorY(extent!.maxLat)) / 2

    expect(Math.abs(frameCx - aoiCx)).toBeLessThan(1e-3)
    expect(Math.abs(frameCy - aoiCy)).toBeLessThan(1e-3)

    const frameAspect =
      (mercatorX(extent!.maxLng) - mercatorX(extent!.minLng)) /
      (mercatorY(extent!.maxLat) - mercatorY(extent!.minLat))
    expect(frameAspect).toBeCloseTo(mapW / mapH, 5)
  })

  it('accepts ArcGIS Z/M positions so Layers AOI map atlas is not skipped', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [20.1, 45.2, 0],
          [20.12, 45.2, 0],
          [20.12, 45.22, 0],
          [20.1, 45.22, 0],
          [20.1, 45.2, 0],
        ],
      ],
    }
    const extent = resolveTimeSeriesSnapshotExtent(geometry, 624, 400)
    expect(extent).toBeTruthy()
    expect(extent!.minLng).toBeLessThan(20.1)
    expect(extent!.maxLng).toBeGreaterThan(20.12)
    expect(extent!.minLat).toBeLessThan(45.2)
    expect(extent!.maxLat).toBeGreaterThan(45.22)
  })

  it('fitLngLatBboxToMapAspect with padRatio expands around Mercator center', () => {
    const bbox = { minLng: 10, minLat: 50, maxLng: 10.1, maxLat: 50.05 }
    const fitted = fitLngLatBboxToMapAspect(bbox, 800, 400, 0.2)
    const cx0 = (mercatorX(bbox.minLng) + mercatorX(bbox.maxLng)) / 2
    const cy0 = (mercatorY(bbox.minLat) + mercatorY(bbox.maxLat)) / 2
    const cx1 = (mercatorX(fitted.minLng) + mercatorX(fitted.maxLng)) / 2
    const cy1 = (mercatorY(fitted.minLat) + mercatorY(fitted.maxLat)) / 2
    expect(Math.abs(cx1 - cx0)).toBeLessThan(1e-3)
    expect(Math.abs(cy1 - cy0)).toBeLessThan(1e-3)
  })
})
