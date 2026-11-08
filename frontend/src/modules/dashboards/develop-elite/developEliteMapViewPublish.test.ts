import { describe, expect, it } from 'vitest'
import {
  developEliteMapViewSignature,
  quantizeDevelopEliteMapView,
  shouldPublishDevelopEliteMapView,
} from './developEliteMapViewPublish'

describe('developEliteMapViewPublish', () => {
  it('snaps small pans to the same signature', () => {
    // Coordinates sit inside DEVELOP_ELITE_MAP_VIEW_BBOX_TILE_DEG (0.42°) cells; 55.02 is exactly a
    // grid line (131 × 0.42), so east edges are kept clear of it to test a pan *within* one cell.
    const a = { west: 54.01, south: 24.01, east: 55.12, north: 25.03, zoom: 10.4 }
    const b = { west: 54.03, south: 24.02, east: 55.14, north: 25.05, zoom: 10.4 }
    expect(developEliteMapViewSignature(quantizeDevelopEliteMapView(a))).toBe(
      developEliteMapViewSignature(quantizeDevelopEliteMapView(b)),
    )
  })

  it('changes signature when a pan crosses a tile boundary', () => {
    const a = { west: 54.01, south: 24.01, east: 55.0, north: 25.03, zoom: 10.4 }
    const b = { west: 54.01, south: 24.01, east: 55.04, north: 25.03, zoom: 10.4 }
    expect(developEliteMapViewSignature(quantizeDevelopEliteMapView(a))).not.toBe(
      developEliteMapViewSignature(quantizeDevelopEliteMapView(b)),
    )
  })

  it('skips publish when quantized view unchanged', () => {
    const prev = quantizeDevelopEliteMapView({
      west: 54,
      south: 24,
      east: 56,
      north: 26,
      zoom: 9,
    })
    const next = quantizeDevelopEliteMapView({
      west: 54.02,
      south: 24.02,
      east: 55.98,
      north: 25.98,
      zoom: 9.2,
    })
    expect(shouldPublishDevelopEliteMapView(prev, next)).toBe(false)
  })
})
