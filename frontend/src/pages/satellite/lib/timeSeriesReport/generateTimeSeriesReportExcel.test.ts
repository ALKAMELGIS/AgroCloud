import { describe, expect, it } from 'vitest'
import { sanitizeTimeSeriesReportExcelFilename } from './generateTimeSeriesReportExcel'

describe('sanitizeTimeSeriesReportExcelFilename', () => {
  it('keeps plot ids with spaces and hyphens as a valid .xlsx name', () => {
    expect(sanitizeTimeSeriesReportExcelFilename('T-100 SC0175')).toBe('T-100 SC0175.xlsx')
    expect(sanitizeTimeSeriesReportExcelFilename('T-100 SC0175.xlsx')).toBe('T-100 SC0175.xlsx')
  })

  it('strips AOI / layer prefixes via cleanAoiPlotDisplayId', () => {
    expect(sanitizeTimeSeriesReportExcelFilename('Potato_Plots: T-100 SC0175')).toBe(
      'T-100 SC0175.xlsx',
    )
    expect(sanitizeTimeSeriesReportExcelFilename('AOI: T-32')).toBe('T-32.xlsx')
  })

  it('replaces Windows-illegal path characters', () => {
    expect(sanitizeTimeSeriesReportExcelFilename('Field<>"/\\|?*Name')).toBe('Field_Name.xlsx')
  })

  it('falls back when name is only illegal characters', () => {
    expect(sanitizeTimeSeriesReportExcelFilename('<<<>>>')).toBe(
      'Agricultural_Imagery_Timeseries_Report.xlsx',
    )
  })
})
