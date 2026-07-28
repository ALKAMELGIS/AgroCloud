import { describe, expect, it } from 'vitest'
import { shouldPaintImportedLayerCircles } from './SiImportedCustomLayersOverlay'

describe('shouldPaintImportedLayerCircles', () => {
  it('paints circles only for point layers', () => {
    expect(shouldPaintImportedLayerCircles('point')).toBe(true)
  })

  it('hides circles for polygon, line, mixed, raster, and unknown', () => {
    expect(shouldPaintImportedLayerCircles('polygon')).toBe(false)
    expect(shouldPaintImportedLayerCircles('line')).toBe(false)
    expect(shouldPaintImportedLayerCircles('mixed')).toBe(false)
    expect(shouldPaintImportedLayerCircles('raster')).toBe(false)
    expect(shouldPaintImportedLayerCircles('unknown')).toBe(false)
    expect(shouldPaintImportedLayerCircles(null)).toBe(false)
    expect(shouldPaintImportedLayerCircles(undefined)).toBe(false)
  })
})
