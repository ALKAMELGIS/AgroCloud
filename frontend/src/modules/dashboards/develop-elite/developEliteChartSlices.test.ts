import { describe, expect, it } from 'vitest'
import { DEFAULT_DEVELOP_ELITE_CHARTS } from './developEliteChartsConfig'
import { colorForChartValueRank } from './developEliteCropChartColors'
import {
  applyDevelopEliteChartAccentColors,
  prepareDevelopEliteChartSlices,
  resolveDevelopEliteSliceColor,
} from './developEliteChartSlices'

describe('resolveDevelopEliteSliceColor', () => {
  it('assigns palette colors by slice index', () => {
    const palette = DEFAULT_DEVELOP_ELITE_CHARTS.palette
    expect(resolveDevelopEliteSliceColor('Capsicum Red', 0, palette, 'bar')).toBe(palette[0])
    expect(resolveDevelopEliteSliceColor('Plum Tomato', 1, palette, 'pie')).toBe(palette[1])
  })
})

describe('applyDevelopEliteChartAccentColors', () => {
  it('uses orange–yellow only for accent labels', () => {
    const slices = [
      { label: 'Blue Berry', value: 10, color: '#000' },
      { label: 'Raspberry', value: 5, color: '#000' },
    ]
    const out = applyDevelopEliteChartAccentColors(
      slices,
      DEFAULT_DEVELOP_ELITE_CHARTS,
      'pie',
      new Set(['Raspberry']),
    )
    expect(out[0]?.color).toBe(DEFAULT_DEVELOP_ELITE_CHARTS.palette[0])
    expect(out[1]?.color).toBe(colorForChartValueRank(0, 1))
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
