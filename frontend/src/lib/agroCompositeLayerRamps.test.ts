import { describe, expect, it } from 'vitest'
import { AGRO_COMPOSITE_CATEGORIES, AGRO_DELTA_CATEGORIES } from './agroCompositeIndices'
import {
  agroCompositeRampColorFingerprint,
  buildTenClassRampFromConfig,
  listAgroCompositeRampLayerIds,
  resolveAgroCompositeLayerRampConfig,
  resolveAgroCompositeTenClassRamp,
} from './agroCompositeLayerRamps'

describe('agroCompositeLayerRamps', () => {
  it('assigns a unique ramp definition per composite layer', () => {
    expect(resolveAgroCompositeLayerRampConfig('VDI')?.kind).toBe('unique:VDI')
    expect(resolveAgroCompositeLayerRampConfig('DRI')?.kind).toBe('unique:DRI')
    expect(resolveAgroCompositeLayerRampConfig('VMI')?.kind).toBe('unique:VMI')
    expect(resolveAgroCompositeLayerRampConfig('IEI')?.kind).toBe('unique:IEI')
    expect(resolveAgroCompositeLayerRampConfig('ISS')?.kind).toBe('unique:ISS')
    expect(resolveAgroCompositeLayerRampConfig('WDSI')?.kind).toBe('unique:WDSI')
    expect(resolveAgroCompositeLayerRampConfig('WAPI')?.kind).toBe('scientific')
    expect(resolveAgroCompositeLayerRampConfig('CSI2')?.kind).toBe('unique:CSI2')
  })

  it('classifies WAPI into discrete 10-class raster legend', () => {
    const wapi = resolveAgroCompositeTenClassRamp('WAPI')!
    expect(wapi.classLabels).toHaveLength(10)
    expect(wapi.classLabels[0]).toContain('Class 1')
    expect(wapi.classLabels[9]).toContain('Class 10')
    expect(wapi.breaks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
    expect(wapi.classColors[0]).toBe(0x5c6bc0)
    expect(wapi.classColors[9]).toBe(0xad1457)
  })

  it('builds 10 classes with layer-specific anchor colors', () => {
    const vhs = resolveAgroCompositeTenClassRamp('VHS')!
    expect(vhs.classColors).toHaveLength(10)
    expect(vhs.breaks).toHaveLength(9)
    expect(vhs.classLabels[0]).toBe('Critical health')
    expect(vhs.classLabels[9]).toBe('Peak vigor')
    expect(vhs.classColors[0]).toBe(0x7f0000)
    expect(vhs.classColors[9]).toBe(0x1b5e20)

    const smi = resolveAgroCompositeTenClassRamp('SMI')!
    expect(smi.classColors[0]).toBe(0x5d4037)
    expect(smi.classColors[9]).toBe(0x006064)
    expect(smi.classColors.join(',')).not.toBe(vhs.classColors.join(','))

    const gci = resolveAgroCompositeTenClassRamp('GCI')!
    expect(gci.classLabels).toEqual([
      'No Gold Indication',
      'Very Weak Indication',
      'Weak Indication',
      'Low Potential',
      'Moderate-Low Potential',
      'Moderate Potential',
      'High Alteration Zone',
      'High Gold Potential',
      'Very High Gold Potential',
      'Extreme Gold Target',
    ])
    expect(gci.classColors[0]).toBe(0x1a237e)
    expect(gci.classColors[9]).toBe(0xb71c1c)

    const egci = resolveAgroCompositeTenClassRamp('EGCI')!
    expect(egci.classLabels).toEqual([
      'Background',
      'Very Low',
      'Low Au Indication',
      'Weak Mineralization',
      'Moderate-Low Mineralization',
      'Moderate Mineralization',
      'Strong Alteration / Possible Au Zone',
      'High Mineralized Zone',
      'High Au Concentration Target',
      'Very High Au Concentration Target',
    ])
    expect(egci.valueMin).toBe(0)
    expect(egci.valueMax).toBe(1)
    expect(egci.classColors[0]).toBe(0xfff8e1)
    expect(egci.classColors[9]).toBe(0x4a148c)
  })

  it('uses per-layer delta palettes', () => {
    const diei = resolveAgroCompositeTenClassRamp('DIEI')!
    expect(diei.kind).toBe('unique:DIEI')
    expect(diei.valueMin).toBe(-0.4)
    expect(diei.valueMax).toBe(0.4)
    expect(diei.classLabels).toHaveLength(10)

    const dvhs = resolveAgroCompositeTenClassRamp('DVHS')!
    expect(dvhs.classColors.join(',')).not.toBe(diei.classColors.join(','))
  })

  it('uses CHAS scientific raster ramp and CHAS_ALERT derived overlay', () => {
    const chas = resolveAgroCompositeTenClassRamp('CHAS')!
    expect(chas.kind).toBe('scientific')
    expect(chas.classLabels).toHaveLength(10)
    expect(chas.classLabels[0]).toContain('Class 1')
    expect(chas.classColors[0]).toBe(0x7f0000)
    expect(chas.classColors[9]).toBe(0x1a9850)

    const chasAlert = resolveAgroCompositeTenClassRamp('CHAS_ALERT')!
    expect(chasAlert.kind).toBe('alert_derived')
    expect(chasAlert.subtitle).toContain('4-level')

    const dchas = resolveAgroCompositeTenClassRamp('DCHAS')!
    expect(dchas.kind).toBe('alert_delta')
    expect(dchas.classLabels[0]).toContain('Critical')
    expect(dchas.classColors[0]).toBe(0xd73027)
  })

  it('never repeats the same 10-class color fingerprint across composite layers', () => {
    const ids = listAgroCompositeRampLayerIds()
    const fingerprints = new Map<string, string>()
    for (const id of ids) {
      if (id === 'CHAS_ALERT') continue
      const fp = agroCompositeRampColorFingerprint(id)
      expect(fp, `${id} missing ramp`).toBeTruthy()
      const owner = fingerprints.get(fp!)
      expect(owner, `duplicate ramp: ${id} matches ${owner}`).toBeUndefined()
      fingerprints.set(fp!, id)
    }
  })

  it('covers every static and delta composite index except preserved alert pair', () => {
    const expected = new Set<string>()
    for (const cat of AGRO_COMPOSITE_CATEGORIES) {
      for (const idx of cat.indices) {
        expected.add(idx.id.toUpperCase())
      }
    }
    for (const cat of AGRO_DELTA_CATEGORIES) {
      for (const idx of cat.indices) {
        expected.add(idx.id.toUpperCase())
      }
    }
    for (const id of expected) {
      expect(resolveAgroCompositeTenClassRamp(id), `missing ramp for ${id}`).toBeTruthy()
    }
    expect(listAgroCompositeRampLayerIds().length).toBeGreaterThan(expected.size / 2)
  })

  it('interpolates custom anchor palette across 10 classes', () => {
    const ramp = buildTenClassRampFromConfig({
      kind: 'unique:TEST',
      valueMin: 0,
      valueMax: 1,
      anchors: [
        { t: 0, hex: 0x1a9850, label: 'Low' },
        { t: 1, hex: 0xd73027, label: 'High' },
      ],
      labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      subtitle: 'Test ramp',
    })
    expect(ramp.classColors[0]).toBe(0x1a9850)
    expect(ramp.classColors[9]).toBe(0xd73027)
  })
})
