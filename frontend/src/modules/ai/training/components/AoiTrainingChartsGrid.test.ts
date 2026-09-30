import { describe, expect, it } from 'vitest'
import { buildAoiChartOptionLabel, type AoiChartBundle } from './AoiTrainingChartsGrid'

function bundle(aoiKey: string, aoiLabel: string): AoiChartBundle {
  return { aoiKey, aoiLabel }
}

describe('buildAoiChartOptionLabel', () => {
  it('uses the AOI label when it is unique', () => {
    const bundles = [bundle('aoi-a', 'North field'), bundle('aoi-b', 'South field')]
    expect(buildAoiChartOptionLabel(bundles[0]!, bundles)).toBe('North field')
  })

  it('appends a key suffix when labels duplicate', () => {
    const bundles = [
      bundle('draw:abc123def456', 'Active AOI (Edit)'),
      bundle('draw:xyz789ghi012', 'Active AOI (Edit)'),
    ]
    expect(buildAoiChartOptionLabel(bundles[0]!, bundles)).toBe('Active AOI (Edit) · abc123…f456')
    expect(buildAoiChartOptionLabel(bundles[1]!, bundles)).toBe('Active AOI (Edit) · xyz789…i012')
  })
})
