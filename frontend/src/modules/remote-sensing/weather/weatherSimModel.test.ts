import { describe, expect, it } from 'vitest'
import {
  rainMotionFromIntensity,
  resolveMapCanvasContainer,
  resolveWeatherVizOverlayHost,
} from './weatherSimModel'

describe('resolveWeatherVizOverlayHost', () => {
  it('returns the map viewport root', () => {
    const root = document.createElement('div')
    expect(resolveWeatherVizOverlayHost(root)).toBe(root)
  })
})

describe('resolveMapCanvasContainer', () => {
  it('prefers getCanvasContainer from the map instance', () => {
    const inner = document.createElement('div')
    const map = { getCanvasContainer: () => inner }
    expect(resolveMapCanvasContainer(document.createElement('div'), map)).toBe(inner)
  })

  it('falls back to mapbox canvas container inside the root', () => {
    const root = document.createElement('div')
    const box = document.createElement('div')
    box.className = 'mapboxgl-canvas-container'
    root.appendChild(box)
    expect(resolveMapCanvasContainer(root, null)).toBe(box)
  })

  it('uses the map root when no GL container is present yet', () => {
    const root = document.createElement('div')
    expect(resolveMapCanvasContainer(root, null)).toBe(root)
  })
})

describe('rainMotionFromIntensity', () => {
  it('draws no drops at 0%', () => {
    expect(rainMotionFromIntensity(0).dropCount).toBe(0)
  })

  it('raises density and fall speed as intensity goes from light rain to a downpour', () => {
    const low = rainMotionFromIntensity(10)
    const mid = rainMotionFromIntensity(50)
    const high = rainMotionFromIntensity(100)
    expect(low.dropCount).toBeGreaterThan(0)
    expect(mid.dropCount).toBeGreaterThan(low.dropCount)
    expect(high.dropCount).toBeGreaterThan(mid.dropCount)
    expect(mid.fallSpeedPx).toBeGreaterThan(low.fallSpeedPx)
    expect(high.fallSpeedPx).toBeGreaterThan(mid.fallSpeedPx)
    expect(low.fallSpeedPx).toBeLessThan(400)
    expect(high.fallSpeedPx).toBeGreaterThan(1000)
    expect(high.streakScale).toBeGreaterThan(low.streakScale)
  })
})