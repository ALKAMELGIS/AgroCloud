import { describe, expect, it } from 'vitest'
import {
  formatDevelopEliteChartAxisTick,
  formatDevelopEliteChartValue,
  formatDevelopEliteChartValueWithUnit,
  resolveDevelopEliteChartValueUnit,
} from './developEliteChartFormat'

describe('developEliteChartFormat', () => {
  it('formats large axis ticks without repeating 1k', () => {
    expect(formatDevelopEliteChartAxisTick(0)).toBe('0')
    expect(formatDevelopEliteChartAxisTick(120000)).toBe('120k')
    expect(formatDevelopEliteChartAxisTick(96000)).toBe('96k')
    expect(formatDevelopEliteChartAxisTick(24000)).toBe('24k')
  })

  it('formats in-bar values', () => {
    expect(formatDevelopEliteChartValue(60000)).toBe('60k')
    expect(formatDevelopEliteChartValue(450)).toBe('450')
  })

  it('appends Tons unit and normalizes Per Tons label', () => {
    expect(formatDevelopEliteChartValueWithUnit(120000)).toBe('120k Tons')
    expect(resolveDevelopEliteChartValueUnit('Per Tons')).toBe('Tons')
  })
})
