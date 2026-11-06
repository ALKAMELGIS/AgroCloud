import { describe, expect, it } from 'vitest'
import {
  developEliteMapNavigatorPickZone,
  developEliteMapNavigatorSnapCardinalBearing,
} from './developEliteMapNavigatorGestures'

describe('developEliteMapNavigatorPickZone', () => {
  it('uses pan on outer ring in 2D', () => {
    expect(developEliteMapNavigatorPickZone(0.8, false)).toBe('pan')
    expect(developEliteMapNavigatorPickZone(0.55, false)).toBe('rotate')
  })

  it('adds look zone at center in 3D', () => {
    expect(developEliteMapNavigatorPickZone(0.2, true)).toBe('look')
  })
})

describe('developEliteMapNavigatorSnapCardinalBearing', () => {
  it('snaps near north to 0', () => {
    expect(developEliteMapNavigatorSnapCardinalBearing(355)).toBe(0)
  })
})
