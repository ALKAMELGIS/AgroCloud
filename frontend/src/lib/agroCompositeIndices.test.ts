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
  it('defines static + delta composite layers including ISS', () => {
    const staticCount = AGRO_COMPOSITE_CATEGORIES.reduce((n, c) => n + c.indices.length, 0)
    expect(staticCount).toBeGreaterThanOrEqual(25)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'CHAS')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'DCHAS')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'ISS')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'DISS')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'WDSI')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'DWDSI')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'WAPI')).toBe(true)
    expect(buildAgroCloudCustomWmsLayerEntries().some(l => l.name === 'DWAPI')).toBe(true)
  })

  it('builds categorized select groups with core + composites + presets', () => {
    const groups = buildRemoteSensingLayerSelectGroups([
      { name: 'NDVI', title: 'NDVI' },
      { name: 'TRUE_COLOR', title: 'True Color' },
    ])
    expect(groups[0]?.label).toBe('Core Interpretation')
    expect(groups[0]?.options.map(o => o.id)).toEqual([
      'NDVI',
      'NDMI',
      'NDWI',
      'SAVI',
      'ET',
      'LST',
      'DATAMASK',
    ])
    expect(groups.some(g => g.id === 'live-analysis-lulc')).toBe(true)
    expect(groups.some(g => g.label.includes('Vegetation Health'))).toBe(true)
    expect(groups.some(g => g.label.includes('Irrigation'))).toBe(true)
    expect(groups.some(g => g.label.includes('Delta'))).toBe(true)
    const flat = flattenRemoteSensingLayerSelectGroups(groups)
    expect(flat.some(o => o.id === 'VHS')).toBe(true)
    expect(flat.find(o => o.id === 'VHS')?.scientificName).toBe('Vegetation Health Score')
    expect(flat.some(o => o.id === 'DVHS')).toBe(true)
    expect(flat.some(o => o.id === 'ISS')).toBe(true)
    expect(flat.find(o => o.id === 'ISS')?.scientificName).toContain('Irrigation Stress Score')
    expect(flat.some(o => o.id === 'DISS')).toBe(true)
    expect(flat.some(o => o.id === 'WDSI')).toBe(true)
    expect(flat.find(o => o.id === 'WDSI')?.scientificName).toContain('Water Drought Situation Index')
    expect(flat.some(o => o.id === 'DWDSI')).toBe(true)
    expect(flat.some(o => o.id === 'WAPI')).toBe(true)
    expect(flat.find(o => o.id === 'WAPI')?.scientificName).toContain('Water Allocation Priority Index')
    expect(flat.some(o => o.id === 'DWAPI')).toBe(true)
  })

  it('publishes Gold Exploration Indices as separate layers', () => {
    const groups = buildRemoteSensingLayerSelectGroups([])
    const gold = groups.find(g => g.id === 'gold-exploration')
    expect(gold?.label).toContain('Gold Exploration')
    expect(gold?.options.map(o => o.id)).toEqual([
      'IOI',
      'CLAY_MI',
      'FMI',
      'NDAI',
      'BSI',
      'REAI',
      'GEI',
      'GCI',
      'EGCI',
    ])
    expect(resolveAgroCompositeIndexDef('IOI')?.expr).toBe('ioi')
    expect(resolveAgroCompositeIndexDef('CLAY_MI')?.scientificName).toContain('Clay Mineral Index')
    expect(resolveAgroCompositeIndexDef('GEI')?.expr).toBe('gei')
    expect(resolveAgroCompositeIndexDef('GCI')?.expr).toBe('gci')
    expect(resolveAgroCompositeIndexDef('GCI')?.scientificName).toContain('0.30(IOI)')
    expect(resolveAgroCompositeIndexDef('EGCI')?.expr).toBe('egci')
    expect(resolveAgroCompositeIndexDef('EGCI')?.scientificName).toContain('0.30(IOIN)')
    expect(isAgroCompositeLayerId('BSI')).toBe(true)
    expect(isAgroCompositeLayerId('GCI')).toBe(true)
    expect(isAgroCompositeLayerId('EGCI')).toBe(true)
    // Gold exploration publishes scene composites only (no Change / Δ layers).
    expect(isAgroDeltaCompositeLayerId('DGCI')).toBe(false)
    expect(isAgroDeltaCompositeLayerId('DEGCI')).toBe(false)
    expect(isAgroDeltaCompositeLayerId('DGEI')).toBe(false)
    expect(resolveAgroStaticLayerIdForDelta('DGCI')).toBe(null)
    expect(groups.some(g => g.id === 'gold-exploration-delta')).toBe(false)
    expect(flattenRemoteSensingLayerSelectGroups(groups).some(o => o.id === 'DGCI')).toBe(false)
  })

  it('resolves VHS, ISS, WDSI, and WAPI formula metadata', () => {
    expect(isAgroCompositeLayerId('VHS')).toBe(true)
    expect(isAgroCompositeLayerId('CVHI')).toBe(true)
    expect(isAgroCompositeLayerId('ISS')).toBe(true)
    expect(isAgroCompositeLayerId('WDSI')).toBe(true)
    expect(isAgroCompositeLayerId('WAPI')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DVHS')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DCVHI')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DISS')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DWDSI')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DWAPI')).toBe(true)
    expect(resolveAgroCompositeIndexDef('CVHI')?.expr).toBe('(ndvi + ndmi + ndwi + savi) / 4')
    expect(resolveAgroCompositeIndexDef('VHS')?.expr).toBe('(ndvi + savi) / 2')
    expect(resolveAgroCompositeIndexDef('ISS')?.expr).toBe(
      '0.40 * ndmi + 0.30 * ndwi + 0.20 * ndvi + 0.10 * savi',
    )
    expect(resolveAgroCompositeIndexDef('WDSI')?.expr).toBe(
      '0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi',
    )
    expect(resolveAgroCompositeIndexDef('WAPI')?.expr).toContain('0.40 * (0.40 * ndmi')
    expect(resolveAgroCompositeIndexDef('WAPI')?.expr).toContain('Math.max(0, Math.min(1, 1 - (0.6 * ndmi')
    expect(resolveAgroCompositeIndexDef('WAPI')?.expr).toContain('+ 0.10')
    expect(resolveAgroStaticLayerIdForDelta('DVHS')).toBe('VHS')
    expect(resolveAgroStaticLayerIdForDelta('DCVHI')).toBe('CVHI')
    expect(resolveAgroStaticLayerIdForDelta('DCHAS')).toBe('CHAS')
    expect(resolveAgroStaticLayerIdForDelta('DISS')).toBe('ISS')
    expect(resolveAgroStaticLayerIdForDelta('DWDSI')).toBe('WDSI')
    expect(resolveAgroStaticLayerIdForDelta('DWAPI')).toBe('WAPI')
  })

  it('registers CHAS crop alert score in Crop group', () => {
    const groups = buildRemoteSensingLayerSelectGroups([{ name: 'NDVI', title: 'NDVI' }])
    expect(groups.some(g => g.label.includes('Crop'))).toBe(true)
    expect(isAgroCompositeLayerId('CHAS')).toBe(true)
    expect(isAgroDeltaCompositeLayerId('DCHAS')).toBe(true)
    expect(resolveAgroCompositeIndexDef('CHAS')?.expr).toBe(AGRO_CHAS_EXPR)
    expect(flattenRemoteSensingLayerSelectGroups(groups).find(o => o.id === 'CHAS')?.scientificName).toBe(
      'Crop Health Analysis Score (NDVI·NDWI·NDMI·SAVI fusion)',
    )
  })
})
