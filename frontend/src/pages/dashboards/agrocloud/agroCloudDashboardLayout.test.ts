import { describe, expect, it } from 'vitest'
import {
  getBodyElements,
  getHeaderWidgetElements,
  getSidebarElements,
  patchDashboardHeader,
  resolveDashboardHeaderTitle,
} from './agroCloudDashboardLayout'
import { DEFAULT_AGROCLOUD_DASHBOARD_CONFIG } from './agroCloudDashboardData'

describe('agroCloudDashboardLayout', () => {
  it('resolves item title tokens in header templates', () => {
    expect(resolveDashboardHeaderTitle('{{Item Title}}', 'Farm NDVI')).toBe('Farm NDVI')
    expect(resolveDashboardHeaderTitle('Report — {{Item Title}}', 'Farm NDVI')).toBe('Report — Farm NDVI')
  })

  it('classifies elements into body, header widgets, and sidebar', () => {
    const elements = [
      { id: '1', kind: 'map' as const, label: 'Map' },
      { id: '2', kind: 'indicator' as const, label: 'KPI' },
      { id: '3', kind: 'list' as const, label: 'List' },
    ]
    expect(getBodyElements(elements).map(e => e.id)).toEqual(['1'])
    expect(getHeaderWidgetElements(elements).map(e => e.id)).toEqual(['2'])
    expect(getSidebarElements(elements).map(e => e.id)).toEqual(['3'])
  })

  it('enables header layout when patching header config', () => {
    const next = patchDashboardHeader(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG, { title: 'Custom title' })
    expect(next.header?.enabled).toBe(true)
    expect(next.header?.title).toBe('Custom title')
  })
})
