import { describe, expect, it } from 'vitest'
import {
  fitLngLatBboxToMapAspect,
  mapLngLatToMercatorBox,
  resolveTimeSeriesSnapshotLayout,
  type LngLatBbox,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesMapSnapshot'
import { HYDRO_REPORT_MAP_H, HYDRO_REPORT_MAP_W } from './hydroReportMapSnapshots'

describe('mapLngLatToMercatorBox', () => {
  const bbox: LngLatBbox = {
    minLng: 45.34,
    minLat: 9.31,
    maxLng: 45.54,
    maxLat: 9.5,
  }

  it('places north at the top of the map frame', () => {
    const [, northY] = mapLngLatToMercatorBox(45.44, bbox.maxLat, bbox, 0, 0, 600, 400)
    const [, southY] = mapLngLatToMercatorBox(45.44, bbox.minLat, bbox, 0, 0, 600, 400)
    expect(northY).toBeLessThan(southY)
  })

  it('maps west/east to left/right respectively', () => {
    const [westX] = mapLngLatToMercatorBox(bbox.minLng, 9.4, bbox, 0, 0, 600, 400)
    const [eastX] = mapLngLatToMercatorBox(bbox.maxLng, 9.4, bbox, 0, 0, 600, 400)
    expect(westX).toBeLessThan(eastX)
  })

  it('keeps a square AOI square on screen (no shear from linear lat mapping)', () => {
    const tl = mapLngLatToMercatorBox(45.4, bbox.maxLat, bbox, 0, 0, 600, 400)
    const tr = mapLngLatToMercatorBox(45.5, bbox.maxLat, bbox, 0, 0, 600, 400)
    const bl = mapLngLatToMercatorBox(45.4, bbox.minLat, bbox, 0, 0, 600, 400)
    const topWidth = Math.abs(tr[0] - tl[0])
    const bottomWidth = Math.abs(
      mapLngLatToMercatorBox(45.5, bbox.minLat, bbox, 0, 0, 600, 400)[0] - bl[0],
    )
    expect(Math.abs(topWidth - bottomWidth)).toBeLessThan(0.5)
  })
})

describe('fitLngLatBboxToMapAspect', () => {
  it('preserves circular AOI diameter in x and y after aspect fit', () => {
    // Matches SiMapDrawWidget circle construction (cos-lat compensated ring)
    const cx = 33.00991
    const cy = 13.13305
    const cosLat = Math.max(0.2, Math.cos((cy * Math.PI) / 180))
    const rDeg = 0.045
    const circleBbox: LngLatBbox = {
      minLng: cx - rDeg / cosLat,
      minLat: cy - rDeg,
      maxLng: cx + rDeg / cosLat,
      maxLat: cy + rDeg,
    }
    const fitted = fitLngLatBboxToMapAspect(circleBbox, HYDRO_REPORT_MAP_W, HYDRO_REPORT_MAP_H)
    const mapW = HYDRO_REPORT_MAP_W
    const mapH = HYDRO_REPORT_MAP_H

    const east = mapLngLatToMercatorBox(cx + rDeg / cosLat, cy, fitted, 0, 0, mapW, mapH)
    const west = mapLngLatToMercatorBox(cx - rDeg / cosLat, cy, fitted, 0, 0, mapW, mapH)
    const north = mapLngLatToMercatorBox(cx, cy + rDeg, fitted, 0, 0, mapW, mapH)
    const south = mapLngLatToMercatorBox(cx, cy - rDeg, fitted, 0, 0, mapW, mapH)

    const widthPx = Math.abs(east[0] - west[0])
    const heightPx = Math.abs(south[1] - north[1])
    expect(Math.abs(widthPx - heightPx) / Math.max(widthPx, heightPx)).toBeLessThan(0.03)

    const midX = (east[0] + west[0]) / 2
    const midY = (north[1] + south[1]) / 2
    expect(Math.abs(midX - mapW / 2)).toBeLessThan(3)
    expect(Math.abs(midY - mapH / 2)).toBeLessThan(3)
  })

  it('expands a square geographic bbox to match a wide map frame', () => {
    const square: LngLatBbox = {
      minLng: 45.4,
      minLat: 9.4,
      maxLng: 45.5,
      maxLat: 9.5,
    }
    const fitted = fitLngLatBboxToMapAspect(square, 800, 400)
    const lonSpan = fitted.maxLng - fitted.minLng
    const latSpan = fitted.maxLat - fitted.minLat
    expect(lonSpan / latSpan).toBeGreaterThan(1.5)
  })
})

describe('resolveTimeSeriesSnapshotLayout', () => {
  it('places legend strip below the map frame (no overlap)', () => {
    const layout = resolveTimeSeriesSnapshotLayout(520, 390)
    expect(layout.legendY).toBeGreaterThan(layout.mapY + layout.mapH)
    expect(layout.legendX).toBe(layout.mapX)
    expect(layout.mapW / layout.mapH).toBeGreaterThan(1)
  })
})
