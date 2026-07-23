import { describe, expect, it } from 'vitest'
import {
  NCADI_CLASS_BREAKS,
  NCADI_CLASS_LABELS,
  NCADI_LAYER_ID,
  NCADI_LOOKBACK_DAYS,
  computeNcadi,
  isNcadiLayerId,
} from './ncadiIndex'
import {
  buildRemoteSensingLayerSelectGroups,
  isAgroCompositeLayerId,
  resolveRemoteSensingLayerScientificName,
} from './agroCompositeIndices'
import { buildAgroCompositeLayerEvalscript } from './agroCompositeIndexEvalscripts'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'
import { resolveLayerLiveLegendSpec } from './layerLiveLegendCatalog'
import {
  getBootstrapSentinelWmsLayers,
  resolveSentinelHubWmsTimeWindow,
  usesSentinelHubWmsCustomEvalscript,
} from './sentinelHubWmsLayers'

describe('NCADI cultivation / abandonment index', () => {
  it('computes 0.7·ΔNDVI + 0.3·ΔNDMI', () => {
    expect(computeNcadi(0.2, -0.1)).toBeCloseTo(0.7 * 0.2 + 0.3 * -0.1, 6)
    expect(isNcadiLayerId('ncadi')).toBe(true)
  })

  it('registers NCADI under Live Analysis · Cultivation', () => {
    const groups = buildRemoteSensingLayerSelectGroups(getBootstrapSentinelWmsLayers())
    const cultivation = groups.find(g => g.id === 'live-analysis-cultivation')
    expect(cultivation?.options.some(o => o.id === NCADI_LAYER_ID)).toBe(true)
    expect(isAgroCompositeLayerId('NCADI')).toBe(true)
    expect(resolveRemoteSensingLayerScientificName('NCADI')).toMatch(/Newly Cultivated/i)
    expect(usesSentinelHubWmsCustomEvalscript('NCADI')).toBe(true)
  })

  it('uses 60-day TIME window and explicit 10-class breaks', () => {
    expect(NCADI_LOOKBACK_DAYS).toBe(60)
    expect(resolveSentinelHubWmsTimeWindow('NCADI', '2026-07-23', null)).toEqual({
      timeStart: '2026-05-24',
      timeEnd: '2026-07-23',
    })
    expect(resolveSentinelHubWmsTimeWindow('NCADI', '2026-07-23', '2026-06-01')).toEqual({
      timeStart: '2026-06-01',
      timeEnd: '2026-07-23',
    })
    const ramp = resolveAgroCompositeTenClassRamp('NCADI')
    expect(ramp?.breaks).toEqual([...NCADI_CLASS_BREAKS])
    expect(ramp?.classLabels).toHaveLength(10)
    expect(ramp?.classLabels[4]).toMatch(/Stable/i)
    expect(ramp?.classLabels[0]).toMatch(/Extreme Abandonment/i)
    expect(ramp?.classLabels[9]).toMatch(/Extreme Cultivation Gain/i)
  })

  it('builds two-orbit NCADI evalscript with ΔNDVI/ΔNDMI weights', () => {
    const script = buildAgroCompositeLayerEvalscript('NCADI')
    expect(script).toContain('//VERSION=3')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('0.7 * dNdvi')
    expect(script).toContain('0.3 * dNdmi')
    expect(script).toContain('dNdvi')
    expect(script).toContain('dNdmi')
    expect(script).toContain('preProcessScenes')
    expect(script).toContain('BREAKS')
  })

  it('resolves discrete NCADI legend with 10 cultivation classes', () => {
    const spec = resolveLayerLiveLegendSpec('NCADI', 'NCADI')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.title).toBe('NCADI')
    expect(spec?.classes).toHaveLength(NCADI_CLASS_LABELS.length)
    expect(spec?.note).toMatch(/NCADI =/)
    expect(spec?.classes?.[4]?.label).toMatch(/Stable/i)
  })
})
