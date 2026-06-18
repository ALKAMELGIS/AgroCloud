import { describe, expect, it } from 'vitest'
import { AGRO_CHAS_EXPR } from './chasIndex'
import {
  AGRO_COMPOSITE_CATEGORIES,
  buildAgroCloudCustomWmsLayerEntries,
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
  isAgroCompositeLayerId,
  isAgroDeltaCompositeLayerId,
  resolveAgroCompositeIndexDef,
  resolveAgroStaticLayerIdForDelta,
} from './agroCompositeIndices'

describe('agroCompositeIndices', () => {
  it('defines 21 static + 21 delta composite layers', () => {
    const staticCount = AGRO_COMPOSITE_CATEGORIES.reduce((n, c) => n + c.indices.length, 0)
    expect(staticCount).toBe(21)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'CHAS')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'DCHAS')).toBe(true)
  })

  it('builds categorized select groups with core + composites + presets', () => {
    const groups = buildRemoteSensingLayerSelectGroups([
      { name: 'NDVI', title: 'NDVI' },
      { name: 'TRUE_COLOR', title: 'True Color' },
    ])
    expect(groups[0]?.label).toBe('Core Interpretation')
    expect(groups[0]?.options.map(o => o.id)).toEqual(['NDVI', 'NDMI', 'NDWI', 'SAVI'])
    expect(groups[0]?.options[0]?.scientificName).toContain('Vegetation')
    expect(groups.some(g => g.label.includes('Vegetation Health'))).toBe(true)
    expect(groups.some(g => g.label.includes('Delta'))).toBe(true)
    const flat = flattenRemoteSensingLayerSelectGroups(groups)
    expect(flat.some(o => o.id === 'VHS')).toBe(true)
    expect(flat.find(o => o.id === 'VHS')?.scientificName).toBe('Vegetation Health Score')
    expect(flat.some(o => o.id === 'DVHS')).toBe(true)
  })

  it('resolves VHS formula metadata', () => {
    expect(isAgroCompositeLayerId('VHS')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DVHS')).toBe(true)
    expect(resolveAgroCompositeIndexDef('VHS')?.expr).toBe('(ndvi + savi) / 2')
    expect(resolveAgroStaticLayerIdForDelta('DVHS')).toBe('VHS')
    expect(resolveAgroStaticLayerIdForDelta('DCHAS')).toBe('CHAS')
  })

  it('registers CHAS crop alert score in Crop group', () => {
    const groups = buildRemoteSensingLayerSelectGroups([{ name: 'NDVI', title: 'NDVI' }])
    expect(groups.some(g => g.label.includes('Crop'))).toBe(true)
    expect(isAgroCompositeLayerId('CHAS')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DCHAS')).toBe(true)
    expect(resolveAgroCompositeIndexDef('CHAS')?.expr).toBe(AGRO_CHAS_EXPR)
    expect(flattenRemoteSensingLayerSelectGroups(groups).find(o => o.id === 'CHAS')?.scientificName).toBe(
      'Crop Health Analysis Score',
    )
  })
})
