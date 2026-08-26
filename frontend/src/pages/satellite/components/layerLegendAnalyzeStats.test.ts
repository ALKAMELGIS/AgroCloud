import { describe, expect, it } from 'vitest'
import { resolveAnalyzeIndexConfig } from './layerLegendAnalyzeIndexConfig'
import { computeLayerLegendAnalyzeStats } from './layerLegendAnalyzeStats'
import type { LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import type { LayerClassAreaResult } from '../../../lib/siLayerClassAreaEngine'

const ndviSpec: LayerLiveLegendSpec = {
  id: 'NDVI',
  title: 'NDVI',
  kind: 'index',
  valueMin: -1,
  valueMax: 1,
  classes: [],
}

function mockAreaResult(avgMid: number): LayerClassAreaResult {
  const edges = [-1, -0.5, 0, 0.2, 0.4, 0.6, 0.8, 1]
  const rows = edges.slice(0, -1).map((_, i) => {
    const lo = edges[i]!
    const hi = edges[i + 1]!
    const mid = (lo + hi) / 2
    const count = Math.abs(mid - avgMid) < 0.15 ? 1000 : 0
    return {
      classIndex: i,
      label: `c${i}`,
      color: '#000',
      rangeLabel: `${lo}–${hi}`,
      areaHa: count / 100,
      areaM2: count * 100,
      count,
      pctOfAoi: count > 0 ? count / 10 : 0,
    }
  })
  return {
    rows,
    aoiAreaM2: 785741,
    analyzedAreaM2: 785741,
    sampleCount: rows.reduce((s, r) => s + r.count, 0),
    sceneDate: '2026-08-26',
    classEdges: edges,
    classificationMode: 'fixed',
  }
}

describe('resolveAnalyzeIndexConfig', () => {
  it('returns NDVI vegetation health config', () => {
    const cfg = resolveAnalyzeIndexConfig('NDVI')
    expect(cfg.title).toBe('Vegetation Health')
    expect(cfg.healthLabel).toBe('Territory Health')
  })

  it('maps salinity aliases to SSI config', () => {
    const cfg = resolveAnalyzeIndexConfig('NDSI')
    expect(cfg.healthLabel).toBe('Salinity Severity')
  })

  it('returns dynamic moisture label for NDMI', () => {
    expect(resolveAnalyzeIndexConfig('NDMI').healthLabel).toBe('Vegetation Moisture')
  })
})

describe('computeLayerLegendAnalyzeStats', () => {
  it('derives AOI territory level from weighted mean inside selected AOI', () => {
    const stats = computeLayerLegendAnalyzeStats({
      layerId: 'NDVI',
      spec: ndviSpec,
      areaResult: mockAreaResult(0.165),
    })
    expect(stats.config.key).toBe('NDVI')
    expect(stats.average).not.toBeNull()
    expect(stats.average!).toBeGreaterThan(0.1)
    expect(stats.average!).toBeLessThan(0.25)
    expect(stats.territoryLevel).toBe('Warning')
    expect(stats.territoryLevelLabel).toBe('WARNING')
    expect(stats.healthScore).toBe(36)
    expect(stats.territoryLevelColor).toBeTruthy()
    expect(stats.stressedPct).not.toBeNull()
    expect(stats.lowPct).not.toBeNull()
    expect(stats.insight).toContain('stress')
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0.4)
  })

  it('returns null territory stats without area result', () => {
    const stats = computeLayerLegendAnalyzeStats({
      layerId: 'NDVI',
      spec: ndviSpec,
      areaResult: null,
    })
    expect(stats.average).toBeNull()
    expect(stats.healthScore).toBeNull()
    expect(stats.territoryLevel).toBeNull()
    expect(stats.min).toBeNull()
    expect(stats.max).toBeNull()
  })

  it('uses zonal index stats fallback when histogram areas are unavailable', () => {
    const stats = computeLayerLegendAnalyzeStats({
      layerId: 'NDMI',
      spec: ndviSpec,
      areaResult: null,
      indexStats: { min: 0.0621, max: 0.3699, average: 0.1649 },
    })
    expect(stats.average).toBeCloseTo(0.1649, 4)
    expect(stats.min).toBeCloseTo(0.0621, 4)
    expect(stats.max).toBeCloseTo(0.3699, 4)
    expect(stats.healthScore).not.toBeNull()
    expect(stats.territoryLevel).not.toBeNull()
    expect(stats.lowPct).not.toBeNull()
  })
})
