import { describe, expect, it } from 'vitest'
import { cutFillReportVolumes, formatCutFillNetCuM, formatCutFillReportStamp } from './cutFillExports'
import type { CutFillSummary } from './cutFillTypes'

const summary: CutFillSummary = {
  cutVolumeM3: 7167944.98,
  fillVolumeM3: 768001.41,
  netVolumeM3: 6399943.57,
  cutAreaM2: 200000,
  fillAreaM2: 80000,
  noChangeAreaM2: 12270.31,
  maxCutM: 4,
  maxFillM: 2,
  avgAbsDiffM: 1,
  cellAreaM2: 25,
  activeCellCount: 10,
}

describe('cut/fill report figures', () => {
  it('labels net cut the way the volume summary does', () => {
    expect(formatCutFillNetCuM(7167944.98, 768001.41)).toBe('6399943.57<-Cut->')
    expect(formatCutFillNetCuM(10, 25.5)).toBe('15.50<-Fill->')
    expect(formatCutFillNetCuM(3, 3)).toBe('0.00')
  })

  it('uses the full surface area and factor 1.000 by default', () => {
    const volumes = cutFillReportVolumes(summary)
    expect(volumes.areaSqM).toBeCloseTo(292270.31, 2)
    expect(volumes.cutCuM).toBeCloseTo(7167944.98, 2)
    expect(volumes.fillCuM).toBeCloseTo(768001.41, 2)
    expect(volumes.netLabel).toBe('6399943.57<-Cut->')
    expect(volumes.cutFactorLabel).toBe('1.000')
    expect(volumes.fillFactorLabel).toBe('1.000')
  })

  it('stamps the generated time as YYYY-MM-DD HH:mm:ss', () => {
    expect(formatCutFillReportStamp(new Date(2021, 10, 5, 10, 36, 25))).toBe('2021-11-05 10:36:25')
  })
})
