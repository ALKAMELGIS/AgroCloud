import { describe, expect, it } from 'vitest'
import {
  buildDefaultUnitPrefixes,
  formatDashboardNumber,
  unitPrefixesForFormat,
} from './agroCloudDashboardTimeRegion'

describe('agroCloudDashboardTimeRegion', () => {
  it('enables large SI prefixes by default', () => {
    const defaults = buildDefaultUnitPrefixes()
    expect(defaults.kilo.enabled).toBe(true)
    expect(defaults.kilo.symbol).toBe('k')
    expect(defaults.milli.enabled).toBe(false)
  })

  it('formats numbers with international prefixes', () => {
    expect(formatDashboardNumber(1_000, { unitPrefixFormat: 'international' })).toBe('1k')
    expect(formatDashboardNumber(1_000_000, { unitPrefixFormat: 'international' })).toBe('1M')
    expect(formatDashboardNumber(1_000_000_000, { unitPrefixFormat: 'international' })).toBe('1B')
  })

  it('returns full numbers when format is full', () => {
    expect(formatDashboardNumber(1234567, { unitPrefixFormat: 'full' })).toMatch(/1,234,567/)
  })

  it('uses scientific notation when selected', () => {
    expect(formatDashboardNumber(1500, { unitPrefixFormat: 'scientific' })).toBe('1.50e+3')
  })

  it('applies custom prefix symbols', () => {
    const prefixes = unitPrefixesForFormat('international')
    prefixes.kilo.symbol = 'K'
    expect(formatDashboardNumber(1000, { unitPrefixFormat: 'custom', unitPrefixes: prefixes })).toBe('1K')
  })
})
