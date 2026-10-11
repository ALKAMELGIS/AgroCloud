import { describe, expect, it } from 'vitest'
import { shallowWaterStep, type ShallowWaterState } from './shallowWaterStep'

describe('shallowWaterStep', () => {
  it('accumulates rainfall on a flat masked cell', () => {
    const state: ShallowWaterState = {
      width: 3,
      height: 3,
      cellSizeM: 5,
      elevation: new Float32Array(9).fill(10),
      mask: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
      depth: new Float32Array(9).fill(0),
      vx: new Float32Array(9).fill(0),
      vy: new Float32Array(9).fill(0),
      manningN: 0.035,
    }
    shallowWaterStep(state, 10, 0.001)
    expect(state.depth[4]).toBeGreaterThan(0)
    expect(state.depth[0]).toBe(0)
  })
})
