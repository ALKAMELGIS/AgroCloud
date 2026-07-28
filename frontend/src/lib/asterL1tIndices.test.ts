import { describe, expect, it } from 'vitest'
import {
  ASTER_L1T_INDICES,
  buildAsterL1tLayerSelectGroups,
  isAsterL1tIndexId,
} from './asterL1tIndices'

describe('asterL1tIndices', () => {
  it('includes ASTER band composites and the full L1T index catalog', () => {
    expect(ASTER_L1T_INDICES.length).toBe(26)
    const ids = ASTER_L1T_INDICES.map(i => i.id)
    for (const id of [
      'VNIR',
      'SWIR',
      'TIR',
      'NDVI',
      'NDWI',
      'NDMI',
      'SAVI',
      'EVI',
      'NBR',
      'BSI',
      'LST',
      'NDIE',
      'TAI',
      'SI_SAL',
      'CSI',
      'CI',
      'REI',
      'IOI',
      'FMI',
      'CAI',
      'OHI',
      'SILICA',
      'QI',
      'CAI2',
      'NDAI',
      'NDMI_M',
    ]) {
      expect(ids).toContain(id)
      expect(isAsterL1tIndexId(id)).toBe(true)
    }
  })

  it('builds Layer select groups with ASTER Bands first', () => {
    const groups = buildAsterL1tLayerSelectGroups()
    expect(groups.map(g => g.id)).toEqual([
      'aster-bands',
      'aster-vegetation',
      'aster-thermal',
      'aster-soil',
      'aster-mineral',
    ])
    expect(groups[0]!.label).toBe('ASTER Bands')
    const vnir = groups[0]!.options.find(o => o.id === 'VNIR')
    expect(vnir?.label).toBe('VNIR')
    expect(vnir?.scientificName).toBe('ASTER VNIR True Color')
    expect(groups[0]!.options.map(o => o.id)).toEqual(['VNIR', 'SWIR', 'TIR'])
    const ndvi = groups[1]!.options.find(o => o.id === 'NDVI')
    expect(ndvi?.scientificName).toMatch(/B3/)
    expect(ndvi?.scientificName).toMatch(/Vegetation density/i)
  })
})
