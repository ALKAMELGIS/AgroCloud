import { describe, expect, it } from 'vitest'
import {
  formatSen2srResultNotice,
  formatSen2srStatusLabel,
  isSentinel2L2ACollection,
} from './sen2srClient'

describe('sen2srClient helpers', () => {
  it('detects Sentinel-2 L2A collections', () => {
    expect(isSentinel2L2ACollection('sentinel-2-l2a')).toBe(true)
    expect(isSentinel2L2ACollection('SENTINEL-2-L2A')).toBe(true)
    expect(isSentinel2L2ACollection('sentinel-2_l2a')).toBe(true)
    expect(isSentinel2L2ACollection('sentinel-2-l1c')).toBe(false)
    expect(isSentinel2L2ACollection('landsat-ot-l2')).toBe(false)
  })

  it('formats status chip labels', () => {
    expect(formatSen2srStatusLabel(null)).toBe('SEN2SR ● Unavailable')
    expect(
      formatSen2srStatusLabel({ available: true, model: 'SEN2SRLite', device: 'cpu' }),
    ).toBe('SEN2SR ● Available')
    expect(formatSen2srStatusLabel({ available: false, model: 'SEN2SRLite', error: 'x' })).toBe(
      'SEN2SR ● Unavailable',
    )
  })

  it('formats enhance notices', () => {
    expect(
      formatSen2srResultNotice({
        output_path: '/cache/a_2.5m.tif',
        resolution: '2.5m',
        cached: true,
      }),
    ).toBe('SEN2SR cache hit · 2.5m')
    expect(
      formatSen2srResultNotice({
        output_path: '/cache/a_2.5m.tif',
        resolution: '2.5m',
        cached: false,
        display_1m_path: '/cache/a_1m_display.tif',
        display_label: 'AI Enhanced 1m Display',
      }),
    ).toBe('SEN2SR complete · 2.5m · AI Enhanced 1m Display')
  })
})
