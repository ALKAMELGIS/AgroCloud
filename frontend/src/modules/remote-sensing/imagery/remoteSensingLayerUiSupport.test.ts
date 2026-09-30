import { describe, expect, it } from 'vitest'
import {
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
} from '../indices/agroCompositeIndices'
import {
  filterRemoteSensingLayerSelectGroupsForAoiWms,
  isRemoteSensingLayerSupportedOnAoiWms,
} from './remoteSensingLayerUiSupport'

describe('remoteSensingLayerUiSupport', () => {
  it('keeps NDVI and composite layers with AOI WMS evalscripts', () => {
    expect(isRemoteSensingLayerSupportedOnAoiWms('NDVI')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('VHS')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('LULC')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('CHAS')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('ADI')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('NCADI')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('MVI')).toBe(true)
    expect(isRemoteSensingLayerSupportedOnAoiWms('REMI')).toBe(true)
  })

  it('filters layer select groups to AOI-supported ids only', () => {
    const full = buildRemoteSensingLayerSelectGroups([])
    const filtered = filterRemoteSensingLayerSelectGroupsForAoiWms(full)
    const flat = flattenRemoteSensingLayerSelectGroups(filtered)
    expect(flat.length).toBeGreaterThan(0)
    expect(flat.length).toBeLessThanOrEqual(flattenRemoteSensingLayerSelectGroups(full).length)
    for (const opt of flat) {
      expect(isRemoteSensingLayerSupportedOnAoiWms(opt.id)).toBe(true)
    }
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
  })
})
