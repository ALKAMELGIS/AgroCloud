import { describe, expect, it } from 'vitest'
import {
  ADI_CLASS_BREAKS,
  ADI_CLASS_LABELS,
  ADI_CURRENT_INDEX_EXPR,
  ADI_HISTORICAL_LOOKBACK_DAYS,
  ADI_LAYER_ID,
  computeAdiCurrentIndex,
  computeAdiZScore,
  isAdiLayerId,
} from './adiIndex'
import {
  buildRemoteSensingLayerSelectGroups,
  isAgroCompositeLayerId,
  resolveRemoteSensingLayerScientificName,
} from './agroCompositeIndices'
import { buildAgroCompositeLayerEvalscript } from './agroCompositeIndexEvalscripts'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'
import { resolveLayerLiveLegendSpec } from './layerLiveLegendCatalog'
import { getBootstrapSentinelWmsLayers, resolveSentinelHubWmsTimeWindow, usesSentinelHubWmsCustomEvalscript } from './sentinelHubWmsLayers'

describe('ADI anomaly index', () => {
  it('computes Current_Index and z-score', () => {
    expect(computeAdiCurrentIndex(0.6, 0.2, 0.4)).toBeCloseTo(0.5 * 0.6 + 0.3 * 0.2 + 0.2 * 0.4, 6)
    expect(computeAdiZScore(0.8, 0.5, 0.1)).toBeCloseTo(3, 6)
    expect(isAdiLayerId('adi')).toBe(true)
  })

  it('registers ADI under Live Analysis · Anomaly', () => {
    const groups = buildRemoteSensingLayerSelectGroups(getBootstrapSentinelWmsLayers())
    const anomaly = groups.find(g => g.id === 'live-analysis-anomaly')
    expect(anomaly?.options.some(o => o.id === ADI_LAYER_ID)).toBe(true)
    expect(isAgroCompositeLayerId('ADI')).toBe(true)
    expect(resolveRemoteSensingLayerScientificName('ADI')).toMatch(/Anomaly Detection/i)
    expect(usesSentinelHubWmsCustomEvalscript('ADI')).toBe(true)
  })

  it('uses 90-day TIME window and explicit 10-class breaks', () => {
    expect(ADI_HISTORICAL_LOOKBACK_DAYS).toBe(90)
    expect(resolveSentinelHubWmsTimeWindow('ADI', '2026-07-23', null)).toEqual({
      timeStart: '2026-04-24',
      timeEnd: '2026-07-23',
    })
    const ramp = resolveAgroCompositeTenClassRamp('ADI')
    expect(ramp?.breaks).toEqual([...ADI_CLASS_BREAKS])
    expect(ramp?.classLabels).toHaveLength(10)
    expect(ramp?.classLabels[4]).toMatch(/Normal/i)
    expect(ramp?.classLabels[0]).toMatch(/Extreme Negative/i)
    expect(ramp?.classLabels[9]).toMatch(/Extreme Positive/i)
  })

  it('builds temporal ADI evalscript with mean/std and Current_Index weights', () => {
    const script = buildAgroCompositeLayerEvalscript('ADI')
    expect(script).toContain('//VERSION=3')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('μ_hist')
    expect(script).toContain('0.5 * ndvi')
    expect(script).toContain('0.3 * ndmi')
    expect(script).toContain('0.2 * ndre')
    expect(script).toContain('ndre')
    expect(script).toContain('Math.sqrt')
    expect(script).toContain('BREAKS')
  })

  it('resolves discrete ADI legend with 10 detection classes', () => {
    const spec = resolveLayerLiveLegendSpec('ADI', 'ADI')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.title).toBe('ADI')
    expect(spec?.classes).toHaveLength(ADI_CLASS_LABELS.length)
    expect(spec?.note).toMatch(/ADI =/)
    expect(spec?.classes?.[4]?.label).toMatch(/Normal/i)
  })
})
