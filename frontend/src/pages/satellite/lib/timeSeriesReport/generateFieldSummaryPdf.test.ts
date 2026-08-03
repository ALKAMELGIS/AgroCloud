import { describe, expect, it } from 'vitest'
import { sanitizeFieldSummaryPdfFilename } from './generateFieldSummaryPdf'

describe('sanitizeFieldSummaryPdfFilename', () => {
  it('keeps plot ids with spaces and hyphens as a valid .pdf name', () => {
    expect(sanitizeFieldSummaryPdfFilename('T-100 SC0175')).toBe('T-100 SC0175.pdf')
    expect(sanitizeFieldSummaryPdfFilename('T-100 SC0175.pdf')).toBe('T-100 SC0175.pdf')
  })

  it('strips AOI / layer prefixes via cleanAoiPlotDisplayId', () => {
    expect(sanitizeFieldSummaryPdfFilename('Potato_Plots: T-100 SC0175')).toBe(
      'T-100 SC0175.pdf',
    )
    expect(sanitizeFieldSummaryPdfFilename('AOI: T-32')).toBe('T-32.pdf')
  })

  it('replaces Windows-illegal path characters', () => {
    expect(sanitizeFieldSummaryPdfFilename('Field<>"/\\|?*Name')).toBe('Field_Name.pdf')
  })

  it('falls back when name is only illegal characters', () => {
    expect(sanitizeFieldSummaryPdfFilename('<<<>>>')).toBe('Field_Summary.pdf')
  })

  it('uses Field_Summaries_Executive_Report stem for combined default', () => {
    expect(sanitizeFieldSummaryPdfFilename('Field_Summaries_Executive_Report.pdf')).toBe(
      'Field_Summaries_Executive_Report.pdf',
    )
  })
})
