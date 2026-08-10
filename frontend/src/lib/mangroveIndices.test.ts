import { describe, expect, it } from 'vitest'
import { buildAgroCompositeLayerEvalscript } from './agroCompositeIndexEvalscripts'
import {
  buildRemoteSensingLayerSelectGroups,
  isAgroCompositeLayerId,
  resolveAgroCompositeIndexDef,
} from './agroCompositeIndices'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'
import { inferWmsEvalProfile } from './sentinelHubWmsAoiClip'
import { SENTINEL_NDVI_10_CLASS_COLORS } from './sentinelHubWmsIndexEvalscripts'
import { buildLayerIndexEvalscript } from './siLayerClassAreaEngine'
import {
  CI_RE_EXPR,
  GCI_CHL_EXPR,
  MANGROVE_LAYER_IDS,
  MFI_EXPR,
  MI_EXPR,
  MTCI_EXPR,
  MVI_EXPR,
  REIP_EXPR,
  REMI_EXPR,
  isMangroveLayerId,
} from './mangroveIndices'

describe('mangroveIndices', () => {
  it('registers mangrove + chlorophyll indices as agro composites', () => {
    for (const id of MANGROVE_LAYER_IDS) {
      expect(isMangroveLayerId(id)).toBe(true)
      expect(isAgroCompositeLayerId(id)).toBe(true)
      expect(inferWmsEvalProfile(id)).toBe('agro_composite')
      expect(resolveAgroCompositeTenClassRamp(id)).toBeTruthy()
    }
    expect(resolveAgroCompositeIndexDef('MVI')?.expr).toBe(MVI_EXPR)
    expect(resolveAgroCompositeIndexDef('REMI')?.expr).toBe(REMI_EXPR)
    expect(resolveAgroCompositeIndexDef('MI')?.expr).toBe(MI_EXPR)
    expect(resolveAgroCompositeIndexDef('MFI')?.expr).toBe(MFI_EXPR)
    expect(resolveAgroCompositeIndexDef('CI-RE')?.expr).toBe(CI_RE_EXPR)
    expect(resolveAgroCompositeIndexDef('GCI-CHL')?.expr).toBe(GCI_CHL_EXPR)
    expect(resolveAgroCompositeIndexDef('MTCI')?.expr).toBe(MTCI_EXPR)
    expect(resolveAgroCompositeIndexDef('REIP')?.expr).toBe(REIP_EXPR)
  })

  it('lists mangrove indices under Live Analysis · Mangrove', () => {
    const groups = buildRemoteSensingLayerSelectGroups([{ name: 'NDVI', title: 'NDVI' }])
    const mangrove = groups.find(g => g.id === 'live-analysis-mangrove')
    expect(mangrove?.label).toBe('Live Analysis · Mangrove')
    expect(mangrove?.options.map(o => o.id)).toEqual([
      'MVI',
      'REMI',
      'MI',
      'MFI',
      'NDRE-B5',
      'NDRE-B6',
      'NDRE-B7',
      'CI-RE',
      'GCI-CHL',
      'MTCI',
      'REIP',
    ])
    expect(groups.some(g => g.id === 'mangrove')).toBe(false)
  })

  it('builds MVI / REMI evalscripts with mangrove band formulas and B07', () => {
    const mvi = buildAgroCompositeLayerEvalscript('MVI')
    expect(mvi).toContain('B07')
    expect(mvi).toContain('(samples.B08 - samples.B03)')
    expect(mvi).toContain('samples.B11 - samples.B03')
    expect(mvi).toContain('let val = mvi')
    expect(mvi).toContain('if (!isFinite(val))')

    const remi = buildAgroCompositeLayerEvalscript('REMI')
    expect(remi).toContain('samples.B06 - samples.B05')
    expect(remi).toContain('samples.B03 - samples.B11')
    expect(remi).toContain('let val = remi')

    const mi = buildAgroCompositeLayerEvalscript('MI')
    expect(mi).toContain('samples.B08 - samples.B04')
    expect(mi).toContain('samples.B11 + samples.B04')

    const mfi = buildAgroCompositeLayerEvalscript('MFI')
    expect(mfi).toContain('samples.B05 + samples.B06 + samples.B07')
    expect(mfi).toContain('samples.B8A')
    expect(mfi).toContain('let val = mfi')
    // MFI paint uses NDVI 10-class colors (range stays MFI −0.6…0.6).
    expect(resolveAgroCompositeTenClassRamp('MFI')?.classColors).toEqual([
      ...SENTINEL_NDVI_10_CLASS_COLORS,
    ])
  })

  it('builds NDRE-B5/B6/B7 as (B8A−RE)/(B8A+RE) with mangrove red–green ramp', () => {
    const b5 = buildAgroCompositeLayerEvalscript('NDRE-B5')
    expect(b5).toContain('index(samples.B8A, samples.B05)')
    expect(b5).toContain('let val = ndre_b5')
    expect(resolveAgroCompositeTenClassRamp('NDRE-B5')?.classColors[0]).toBe(0xa50026)
    expect(resolveAgroCompositeTenClassRamp('NDRE-B5')?.classColors[9]).toBe(0x006837)

    const b6 = buildAgroCompositeLayerEvalscript('NDRE-B6')
    expect(b6).toContain('index(samples.B8A, samples.B06)')
    expect(b6).toContain('let val = ndre_b6')

    const b7 = buildAgroCompositeLayerEvalscript('NDRE-B7')
    expect(b7).toContain('index(samples.B8A, samples.B07)')
    expect(b7).toContain('let val = ndre_b7')
  })

  it('builds CI-RE, GCI-CHL, MTCI, REIP chlorophyll layers', () => {
    const cire = buildAgroCompositeLayerEvalscript('CI-RE')
    expect(cire).toContain('samples.B8A / samples.B05 - 1.0')
    expect(cire).toContain('let val = cire')

    const gci = buildAgroCompositeLayerEvalscript('GCI-CHL')
    expect(gci).toContain('samples.B08 / samples.B03 - 1.0')
    expect(gci).toContain('let val = gci_chl')
    // Must not collide with gold-exploration GCI.
    expect(resolveAgroCompositeIndexDef('GCI')?.expr).toBe('gci')
    expect(resolveAgroCompositeIndexDef('GCI-CHL')?.expr).toBe('gci_chl')

    const mtci = buildAgroCompositeLayerEvalscript('MTCI')
    expect(mtci).toContain('samples.B06 - samples.B05')
    expect(mtci).toContain('samples.B05 - samples.B04')
    expect(mtci).toContain('let val = mtci')

    const reip = buildAgroCompositeLayerEvalscript('REIP')
    expect(reip).toContain('705.0 + 35.0')
    expect(reip).toContain('samples.B04 + samples.B07')
    expect(reip).toContain('let val = reip')
    expect(resolveAgroCompositeTenClassRamp('REIP')?.valueMin).toBe(700)
    expect(resolveAgroCompositeTenClassRamp('REIP')?.valueMax).toBe(740)
  })

  it('includes chlorophyll locals in mangrove class-area histogram evalscript', () => {
    const script = buildLayerIndexEvalscript('mfi')
    expect(script).toContain('B07')
    expect(script).toContain('B8A')
    expect(script).toContain('let mfi =')
    expect(script).toContain('var idx = mfi')
    expect(script).toContain('let ndre_b5 =')
    expect(script).toContain('let cire =')
    expect(script).toContain('let gci_chl =')
    expect(script).toContain('let mtci =')
    expect(script).toContain('let reip =')
  })
})
