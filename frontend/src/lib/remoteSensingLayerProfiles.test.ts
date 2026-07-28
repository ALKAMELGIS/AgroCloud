import { describe, expect, it } from 'vitest'
import { buildRemoteSensingLayerSelectGroups, flattenRemoteSensingLayerSelectGroups } from './agroCompositeIndices'
import {
  filterRemoteSensingLayerSelectGroupsForProvider,
  pickDefaultLayerForProviderProfile,
  resolveRemoteSensingLayerProfile,
} from './remoteSensingLayerProfiles'

const CAP_LAYERS = [
  { name: 'NDVI', title: 'NDVI' },
  { name: '1_TRUE_COLOR', title: 'True Color' },
  { name: '2_FALSE_COLOR', title: 'False Color' },
  { name: 'S1_VV', title: 'Sentinel-1 VV' },
]

describe('remoteSensingLayerProfiles', () => {
  it('maps ESA collections to optical vs SAR vs OLCI profiles', () => {
    expect(resolveRemoteSensingLayerProfile('esa-sentinel', 'sentinel-2-l2a')).toBe('s2-optical')
    expect(resolveRemoteSensingLayerProfile('esa-sentinel', 'sentinel-1-grd')).toBe('sar')
    expect(resolveRemoteSensingLayerProfile('esa-sentinel', 'sentinel-3-olci')).toBe('s3-optical')
    expect(resolveRemoteSensingLayerProfile('sentinel-hub', 'sentinel-2-l2a')).toBe('s2-optical')
    expect(resolveRemoteSensingLayerProfile('maxar', 'worldview-3')).toBe('vhr-optical')
    expect(resolveRemoteSensingLayerProfile('nasa-landsat', 'landsat-8-9')).toBe('landsat-optical')
    expect(resolveRemoteSensingLayerProfile('aster', 'aster-l1t')).toBe('aster-optical')
  })

  it('replaces Layer dropdown with ASTER L1T environmental indices', () => {
    const all = buildRemoteSensingLayerSelectGroups(CAP_LAYERS)
    const filtered = filterRemoteSensingLayerSelectGroupsForProvider(all, 'aster', 'aster-l1t')
    const flat = flattenRemoteSensingLayerSelectGroups(filtered)
    expect(filtered.some(g => g.id === 'aster-bands')).toBe(true)
    expect(filtered.some(g => g.id === 'aster-vegetation')).toBe(true)
    expect(filtered.some(g => g.id === 'aster-mineral')).toBe(true)
    expect(flat.some(o => o.id === 'VNIR')).toBe(true)
    expect(flat.some(o => o.id === 'SWIR')).toBe(true)
    expect(flat.some(o => o.id === 'TIR')).toBe(true)
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
    expect(flat.some(o => o.id === 'IOI')).toBe(true)
    expect(flat.some(o => o.id === 'CSI')).toBe(true)
    expect(flat.some(o => o.id === 'CAI2')).toBe(true)
    expect(flat.some(o => o.id === 'NDMI_M')).toBe(true)
    expect(flat.some(o => o.id === 'ISS')).toBe(false)
    expect(flat.some(o => o.id === '1_TRUE_COLOR')).toBe(false)
  })

  it('keeps full agro indices for Sentinel Hub / ESA S2', () => {
    const all = buildRemoteSensingLayerSelectGroups(CAP_LAYERS)
    const filtered = filterRemoteSensingLayerSelectGroupsForProvider(all, 'sentinel-hub', 'sentinel-2-l2a')
    const flat = flattenRemoteSensingLayerSelectGroups(filtered)
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
    expect(flat.some(o => o.id === 'LULC')).toBe(true)
    expect(flat.some(o => o.id === 'ISS')).toBe(true)
    expect(flat.some(o => o.id === '1_TRUE_COLOR')).toBe(true)
  })

  it('limits ESA S1 GRD to SAR/visual layers (no NDVI composites)', () => {
    const all = buildRemoteSensingLayerSelectGroups(CAP_LAYERS)
    const filtered = filterRemoteSensingLayerSelectGroupsForProvider(all, 'esa-sentinel', 'sentinel-1-grd')
    const flat = flattenRemoteSensingLayerSelectGroups(filtered)
    expect(flat.some(o => o.id === 'NDVI')).toBe(false)
    expect(flat.some(o => o.id === 'ISS')).toBe(false)
    expect(flat.some(o => o.id === 'LULC')).toBe(false)
    expect(flat.some(o => o.id === '1_TRUE_COLOR' || o.id === 'S1_VV')).toBe(true)
    expect(flat.some(o => o.id === 'PRECIP' || o.id.toUpperCase().includes('PRECIP'))).toBe(true)
  })

  it('limits Maxar / VHR to visual + basic optical core', () => {
    const all = buildRemoteSensingLayerSelectGroups(CAP_LAYERS)
    const filtered = filterRemoteSensingLayerSelectGroupsForProvider(all, 'maxar', 'worldview-3')
    const flat = flattenRemoteSensingLayerSelectGroups(filtered)
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
    expect(flat.some(o => o.id === '1_TRUE_COLOR')).toBe(true)
    expect(flat.some(o => o.id === 'ISS')).toBe(false)
    expect(flat.some(o => o.id === 'LULC')).toBe(false)
  })

  it('picks TRUE_COLOR default for SAR/VHR and NDVI for S2', () => {
    const opts = CAP_LAYERS.map(l => ({ id: l.name }))
    expect(pickDefaultLayerForProviderProfile(opts, 'esa-sentinel', 'sentinel-1-grd')).toBe('1_TRUE_COLOR')
    expect(pickDefaultLayerForProviderProfile(opts, 'sentinel-hub', 'sentinel-2-l2a')).toBe('NDVI')
  })
})
