import { describe, expect, it } from 'vitest'
import { mapAttributesProgressPct, mapExportProgressPct } from './afbOperationProgress'

describe('afbOperationProgress', () => {
  it('maps FTW export stages to increasing percentages', () => {
    expect(mapExportProgressPct('Export — Building continuous raster mosaic (no tile grid)…')).toBe(18)
    expect(mapExportProgressPct('Export — Vectorizing from raster pixel boundaries…')).toBe(42)
    expect(mapExportProgressPct('Attributes — NDVI (3/10)')).toBeGreaterThan(75)
  })

  it('maps attribute enrichment done/total to percentage', () => {
    expect(mapAttributesProgressPct('NDVI (5/10)', 5, 10)).toBe(54)
  })
})
