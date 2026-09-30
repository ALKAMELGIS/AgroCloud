import { describe, expect, it } from 'vitest'
import {
  estimateLstCelsius,
  lstDrynessFromNdmi,
  buildLstWmsIndexSetup,
  SENTINEL_LST_10_CLASS_BREAKS,
  SENTINEL_LST_RAMP,
} from './lstIndex'

describe('lstIndex', () => {
  it('maps moist NDMI to low dryness and dry NDMI to high dryness', () => {
    expect(lstDrynessFromNdmi(0.8)).toBeLessThan(0.2)
    expect(lstDrynessFromNdmi(-0.8)).toBeGreaterThan(0.8)
  })

  it('estimates cooler LST under dense green canopy', () => {
    const bare = estimateLstCelsius(0.1, -0.4, { seasonFactor: 1 })
    const canopy = estimateLstCelsius(0.75, 0.3, { seasonFactor: 1 })
    expect(canopy).toBeLessThan(bare)
    expect(bare).toBeGreaterThanOrEqual(5)
    expect(canopy).toBeLessThanOrEqual(55)
  })

  it('builds WMS setup with lst variable', () => {
    const setup = buildLstWmsIndexSetup(0.9)
    expect(setup).toContain('let lst =')
    expect(setup).toContain('samples.B08')
    expect(setup).toContain('samples.B11')
  })

  it('exposes 9 interior breaks and a thermal ramp', () => {
    expect(SENTINEL_LST_10_CLASS_BREAKS).toHaveLength(9)
    expect(SENTINEL_LST_RAMP.length).toBe(10)
  })
})
