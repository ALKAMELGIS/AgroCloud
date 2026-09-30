import { describe, expect, it } from 'vitest'
import {
  buildWellSiteFinalRecommendation,
  buildWellSiteRecommendations,
} from './wellSiteReportExecutive'
import type { WellSiteReportRow } from './wellSiteReportTypes'

function well(partial: Partial<WellSiteReportRow> & Pick<WellSiteReportRow, 'rank' | 'score'>): WellSiteReportRow {
  return {
    name: `Well site ${partial.rank}`,
    lng: 45.1,
    lat: 9.2,
    elev_m: 420,
    slope_pc: 4,
    aq_type: 'Alluvial',
    water_table_m: 28,
    yield_m3d: 120,
    soil_type: 'Sandy loam',
    confidence: 'High',
    risk_lvl: 'Low',
    well_score: partial.score,
    ...partial,
  }
}

describe('buildWellSiteFinalRecommendation', () => {
  it('frames probability — not 100% water certainty — and lists ERT, pump test, geology', () => {
    const rec = buildWellSiteFinalRecommendation({
      aoiName: 'Field A',
      wells: [well({ rank: 1, score: 88, name: 'Well site 1' })],
    })
    expect(rec.interpretation).toMatch(/does not state/i)
    expect(rec.interpretation).toMatch(/100%/)
    expect(rec.interpretation).toMatch(/highest probability/i)
    expect(rec.interpretation).toMatch(/DEM|terrain|slope|aquifer|hydrolog/i)
    expect(rec.preDrillingSteps).toHaveLength(3)
    expect(rec.preDrillingSteps[0]).toMatch(/Electrical Resistivity|ERT/i)
    expect(rec.preDrillingSteps[1]).toMatch(/Pump Test|pumping test/i)
    expect(rec.preDrillingSteps[2]).toMatch(/geological|geology/i)
  })
})

describe('buildWellSiteRecommendations', () => {
  it('keeps operational follow-up bullets', () => {
    const bullets = buildWellSiteRecommendations({
      aoiName: 'Field A',
      areaHa: 12.5,
      wells: [well({ rank: 1, score: 88 })],
    })
    expect(bullets.some(b => /field reconnaissance/i.test(b))).toBe(true)
    expect(bullets.some(b => /screening intelligence/i.test(b))).toBe(true)
  })
})
