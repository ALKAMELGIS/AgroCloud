import { describe, expect, it } from 'vitest'
import { AGRO_COMPOSITE_CATEGORIES } from './agroCompositeIndices'
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
    expect(resolveAgroCompositeLayerRampConfig('CSI2')?.kind).toBe('unique:CSI2')
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

  it('preserves CHAS alert and DCHAS alert_delta ramps unchanged', () => {
    const chas = resolveAgroCompositeTenClassRamp('CHAS')!
    expect(chas.kind).toBe('alert')
    expect(chas.classLabels).toHaveLength(10)
    expect(chas.classColors[0]).toBe(0xd73027)
    expect(chas.classColors[9]).toBe(0x1a9850)

    const dchas = resolveAgroCompositeTenClassRamp('DCHAS')!
    expect(dchas.kind).toBe('alert_delta')
    expect(dchas.classLabels[0]).toContain('Critical')
    expect(dchas.classColors[0]).toBe(0xd73027)
  })

  it('never repeats the same 10-class color fingerprint across composite layers', () => {
    const ids = listAgroCompositeRampLayerIds()
    const fingerprints = new Map<string, string>()
    for (const id of ids) {
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
        expected.add(idx.deltaId.toUpperCase())
      }
    }
    const defined = new Set(listAgroCompositeRampLayerIds())
    for (const id of expected) {
      expect(defined.has(id), `missing ramp for ${id}`).toBe(true)
    }
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
