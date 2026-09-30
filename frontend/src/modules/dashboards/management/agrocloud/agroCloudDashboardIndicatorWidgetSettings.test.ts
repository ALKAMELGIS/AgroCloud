import { describe, expect, it } from 'vitest'
import { DEFAULT_AGROCLOUD_DASHBOARD_CONFIG } from './agroCloudDashboardData'
import {
  defaultIndicatorWidgetSettings,
  indicatorSettingsFromElement,
  normalizeIndicatorFilters,
  resolveIndicatorCalculatedValue,
  resolveIndicatorDisplayText,
} from './agroCloudDashboardIndicatorWidgetSettings'

describe('agroCloudDashboardIndicatorWidgetSettings', () => {
  it('resolves count preview as 930', () => {
    const el = {
      id: '1',
      kind: 'indicator' as const,
      label: 'Indicator',
      field: 'OBJECTID',
      aggregation: 'count' as const,
    }
    const settings = indicatorSettingsFromElement(el)
    expect(resolveIndicatorCalculatedValue(el, settings, DEFAULT_AGROCLOUD_DASHBOARD_CONFIG)).toBe('930')
  })

  it('substitutes calculated value token in middle text', () => {
    expect(resolveIndicatorDisplayText('{calculatedValue}', '930')).toBe('930')
    expect(resolveIndicatorDisplayText('Total: {calculatedValue}', '930')).toBe('Total: 930')
  })

  it('returns empty string for blank top/bottom text', () => {
    expect(resolveIndicatorDisplayText('', '930')).toBe('')
    expect(resolveIndicatorDisplayText('   ', '930')).toBe('')
  })

  it('normalizes legacy filterEnabled into filter conditions', () => {
    const normalized = normalizeIndicatorFilters({
      ...defaultIndicatorWidgetSettings('Indicator'),
      filterEnabled: true,
      filters: [],
      filterLogics: [],
    })
    expect(normalized.filters).toHaveLength(1)
    expect(normalized.filters[0]?.field).toBe('')
  })
})
