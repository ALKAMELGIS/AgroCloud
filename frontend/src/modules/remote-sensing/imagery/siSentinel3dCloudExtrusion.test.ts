import { describe, expect, it } from 'vitest'
import {
  buildSiSentinel3dCloudExtrusionGeoJson,
  cloudDeckExtrusionRelativeToTerrain,
  SI_CLOUD_DECK_ASL_M,
} from './siSentinel3dCloudExtrusion'

describe('cloudDeckExtrusionRelativeToTerrain', () => {
  it('places a thin deck at 6 km ASL above local terrain', () => {
    const terrain = 1200
    const { baseM, topM } = cloudDeckExtrusionRelativeToTerrain(terrain, 0.5)
    const baseAsl = terrain + baseM
    const topAsl = terrain + topM
    expect(baseAsl).toBeCloseTo(SI_CLOUD_DECK_ASL_M, 0)
    expect(topAsl - baseAsl).toBeLessThanOrEqual(200)
    expect(topAsl - baseAsl).toBeGreaterThan(50)
    expect(topM).toBeGreaterThan(baseM)
  })
})

describe('buildSiSentinel3dCloudExtrusionGeoJson', () => {
  it('sets baseM/topM on cloud cells instead of a single ground height', () => {
    const w = 6
    const h = 6
    const rgba = new Uint8ClampedArray(w * h * 4)
    rgba[0] = 220
    rgba[1] = 220
    rgba[2] = 220
    rgba[3] = 255
    const bbox: [number, number, number, number] = [0, 0, 1000, 1000]
    const fc = buildSiSentinel3dCloudExtrusionGeoJson(rgba, w, h, bbox, null)
    expect(fc.features.length).toBeGreaterThan(0)
    const props = fc.features[0]!.properties as { baseM: number; topM: number }
    expect(props.topM).toBeGreaterThan(props.baseM)
    expect(props.topM - props.baseM).toBeLessThan(250)
  })
})
