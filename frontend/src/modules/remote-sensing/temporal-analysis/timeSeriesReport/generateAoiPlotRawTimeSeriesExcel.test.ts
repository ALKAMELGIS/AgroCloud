import { describe, expect, it } from 'vitest'
import { excelSheetNameFromPlotId } from './generateAoiPlotRawTimeSeriesExcel'

describe('excelSheetNameFromPlotId', () => {
  it('prefixes Plot_ and sanitizes illegal Excel characters', () => {
    const used = new Set<string>()
    expect(excelSheetNameFromPlotId('T-32', used)).toBe('Plot_T-32')
    expect(excelSheetNameFromPlotId('T/33*A', used)).toMatch(/^Plot_T_33_A$/)
  })

  it('dedupes colliding sheet names within 31 chars', () => {
    const used = new Set<string>()
    const a = excelSheetNameFromPlotId('T-32', used)
    const b = excelSheetNameFromPlotId('T-32', used)
    expect(a).toBe('Plot_T-32')
    expect(b).toBe('Plot_T-32_2')
  })
})
