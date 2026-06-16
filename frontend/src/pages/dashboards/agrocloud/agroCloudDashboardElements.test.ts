import { describe, expect, it } from 'vitest'
import { DEFAULT_AGROCLOUD_DASHBOARD_CONFIG } from './agroCloudDashboardData'
import { duplicateDashboardElement, resizeDashboardElement } from './agroCloudDashboardElements'

describe('agroCloudDashboardElements', () => {
  it('resizeDashboardElement stores width and height on the target element', () => {
    const config = {
      ...DEFAULT_AGROCLOUD_DASHBOARD_CONFIG,
      elements: [
        {
          id: 'gauge-1',
          kind: 'gauge' as const,
          label: 'Gauge',
          zone: 'sidebar' as const,
        },
      ],
    }

    const next = resizeDashboardElement(config, 'gauge-1', { width: 220, height: 160 })
    expect(next.elements[0]?.size).toEqual({ width: 220, height: 160 })
  })

  it('duplicateDashboardElement copies size from the source element', () => {
    const config = {
      ...DEFAULT_AGROCLOUD_DASHBOARD_CONFIG,
      elements: [
        {
          id: 'gauge-1',
          kind: 'gauge' as const,
          label: 'Gauge',
          zone: 'sidebar' as const,
          size: { width: 220, height: 160 },
        },
      ],
    }

    const next = duplicateDashboardElement(config, 'gauge-1')
    expect(next.elements).toHaveLength(2)
    expect(next.elements[1]?.size).toEqual({ width: 220, height: 160 })
  })
})
