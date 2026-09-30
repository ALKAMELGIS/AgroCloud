import { describe, expect, it } from 'vitest'
import {
  computeDroughtAreaFromClassRows,
  computeDsiFromCore,
  computeNdmiNormalized,
  computeSmciFromCore,
  computeVciFromNdvi,
  DSI_CLASS_COLORS,
  DSI_CLASS_LABELS,
  DSI_STATIC_EXPR,
} from './dsiIndex'

describe('dsiIndex', () => {
  it('maps healthy vegetation to low drought severity', () => {
    const dsi = computeDsiFromCore({ ndvi: 0.75, ndmi: 0.35, ndwi: 0.15 })
    expect(dsi).toBeLessThan(0.25)
  })

  it('maps dry stressed pixels to high drought severity', () => {
    const dsi = computeDsiFromCore({ ndvi: 0.15, ndmi: -0.25, ndwi: -0.15 })
    expect(dsi).toBeGreaterThan(0.55)
  })

  it('normalizes VCI, SMCI, and NDMI to [0, 1]', () => {
    expect(computeVciFromNdvi(-1)).toBe(0)
    expect(computeVciFromNdvi(0.85)).toBeCloseTo(1, 5)
    expect(computeSmciFromCore({ ndvi: 0, ndmi: -0.3, ndwi: -0.3 })).toBe(0)
    expect(computeNdmiNormalized(-0.8)).toBe(0)
    expect(computeNdmiNormalized(0.8)).toBe(1)
  })

  it('exports 10 drought classes with user palette', () => {
    expect(DSI_CLASS_LABELS).toHaveLength(10)
    expect(DSI_CLASS_LABELS[0]).toBe('No Drought')
    expect(DSI_CLASS_LABELS[9]).toBe('Extreme Drought')
    expect(DSI_CLASS_COLORS[0]).toBe(0x006837)
    expect(DSI_CLASS_COLORS[9]).toBe(0x7f0000)
  })

  it('embeds drought formula in static expr', () => {
    expect(DSI_STATIC_EXPR).toContain('0.50 * (1 -')
    expect(DSI_STATIC_EXPR).toContain('0.30 * (1 -')
    expect(DSI_STATIC_EXPR).toContain('0.20 * (1 -')
  })

  it('sums drought area from class rows at the mild threshold', () => {
    const rows = Array.from({ length: 10 }, (_, classIndex) => ({
      classIndex,
      count: 10,
      areaM2: 1000,
      areaHa: 0.1,
      areaKm2: 0.0001,
      pctOfAoi: 10,
    }))
    const summary = computeDroughtAreaFromClassRows(rows, 0.3)
    expect(summary.threshold).toBe(0.3)
    expect(summary.areaM2).toBe(7000)
    expect(summary.pctOfAoi).toBe(70)
  })
})
