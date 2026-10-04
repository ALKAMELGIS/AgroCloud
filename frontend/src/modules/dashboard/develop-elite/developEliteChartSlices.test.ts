import { describe, expect, it } from 'vitest'
import { DEFAULT_DEVELOP_ELITE_CHARTS } from './developEliteChartsConfig'
import { prepareDevelopEliteChartSlices, resolveDevelopEliteSliceColor } from './developEliteChartSlices'

describe('resolveDevelopEliteSliceColor', () => {
  it('assigns palette colors by slice index', () => {
    const palette = DEFAULT_DEVELOP_ELITE_CHARTS.palette
    expect(resolveDevelopEliteSliceColor('Capsicum Red', 0, palette, 'bar')).toBe(palette[0])
    expect(resolveDevelopEliteSliceColor('Plum Tomato', 1, palette, 'pie')).toBe(palette[1])
  })
})

describe('prepareDevelopEliteChartSlices', () => {
  it('groups tail into Other when enabled', () => {
    const slices = Array.from({ length: 12 }, (_, i) => ({
      label: `C${i}`,
      value: 12 - i,
      color: '#000',
    }))
    const out = prepareDevelopEliteChartSlices(slices, { ...DEFAULT_DEVELOP_ELITE_CHARTS, pieMaxSlices: 5 }, 'pie')
    expect(out.some(s => s.label === 'Other')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(5)
  })
})
